import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_ENV = typeof process !== "undefined" ? process.env : {};
const PORT = Number(RUNTIME_ENV.PORT || 5178);
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";
const MAX_BODY_SIZE = 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const serviceAliases = new Map([
  ["春水光｜抗敏感修护", "春水光｜强韧抗敏"],
  ["夏水光｜祛痘消痘印", "夏水光｜净痘控油"],
  ["秋水光｜提亮亮白", "秋水光｜提亮补水"]
]);

export const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      return sendJson(res, 204, {});
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (req.method === "POST" && url.pathname === "/api/generate-review") {
      return handleGenerateReview(req, res);
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJson(res, 405, { message: "Method not allowed" });
    }

    return serveStatic(url.pathname, req, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { message: "本地服务异常，请稍后重试" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`玥时之肤本地服务已启动：http://127.0.0.1:${PORT}/`);
});

async function handleGenerateReview(req, res) {
  const env = await loadLocalEnv();
  const apiKey = RUNTIME_ENV.DEEPSEEK_API_KEY || env.DEEPSEEK_API_KEY;
  const model = RUNTIME_ENV.DEEPSEEK_MODEL || env.DEEPSEEK_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    return sendJson(res, 503, {
      code: "missing_deepseek_key",
      message: "未配置 DEEPSEEK_API_KEY"
    });
  }

  const body = await readRequestJson(req);
  const selected = normalizeSelected(body.selected);
  if (!selected.length) {
    return sendJson(res, 400, { message: "请先选择体验项目" });
  }
  if (selected.length > 2) {
    return sendJson(res, 400, { message: "最多选择 2 个项目" });
  }

  const knowledge = await loadProjectKnowledge(selected);
  const deepSeekPayload = {
    model,
    messages: buildMessages(body.brandName || "玥时之肤", knowledge, body.mode, body.previousReview),
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    temperature: 0.82,
    max_tokens: 420,
    stream: false
  };

  const deepSeekResponse = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(deepSeekPayload)
  });

  const responseText = await deepSeekResponse.text();
  let responseJson = {};
  try {
    responseJson = JSON.parse(responseText);
  } catch (error) {
    responseJson = { raw: responseText };
  }

  if (!deepSeekResponse.ok) {
    return sendJson(res, deepSeekResponse.status, {
      code: "deepseek_api_error",
      message: responseJson?.error?.message || "DeepSeek API 请求失败",
      detail: responseJson?.error?.type || responseJson?.code || null
    });
  }

  const content = responseJson?.choices?.[0]?.message?.content || "";
  const review = parseReview(content);
  if (!review) {
    return sendJson(res, 502, {
      code: "empty_deepseek_review",
      message: "DeepSeek 没有返回可用文案"
    });
  }

  return sendJson(res, 200, {
    review,
    provider: "deepseek",
    model,
    usage: responseJson.usage || null
  });
}

function buildMessages(brandName, selectedKnowledge, mode, previousReview = "") {
  const projectText = selectedKnowledge.map((project, index) => {
    return [
      `${index + 1}. ${project.displayName}`,
      `项目定位：${project.positioning}`,
      `包含服务：${project.includedService}`,
      `适合状态：${asList(project.suitableFor)}`,
      `核心效果：${asList(project.effects)}`,
      `体验角度：${asList(project.reviewAngles)}`
    ].join("\n");
  }).join("\n\n");

  const previousText = String(previousReview || "").trim().slice(0, 260);

  return [
    {
      role: "system",
      content: [
        "你是玥时之肤门店的好评文案助手。",
        "请只输出 JSON，格式为 {\"review\":\"...\"}。",
        "文案要求：120-180 个中文字符，自然真实，像顾客本人体验后写的，不要广告腔。",
        "必须自然覆盖项目效果、服务细节、门店环境。",
        "必须使用 1-2 个常见 emoji，例如 😊、✨、👍、🌿，放在自然语气里；不要连续堆叠，不要超过 2 个。",
        "真实感要更强：像普通顾客随手写的，可以有一点日常表达、轻微主观感受、到店前顾虑、护理中的小细节或做完后的真实体感。",
        "真实细节只围绕已提供的项目、按摩、服务、干净安静的环境来写；不要编造香薰、茶水、音乐、具体装修、具体仪器型号等未提供信息。",
        "不要把每句话都写得太顺、太满、太专业；不要像商家整理出来的标准宣传文。",
        "不要标题、编号、夸张感叹号或大量符号。",
        "不要使用姐妹、种草、强推、闭眼冲、宝子、冲就完了等小红书或营销口吻。",
        "禁止出现好评返现、送项目、打折、送礼品、微信、小红书、私下交易等导流或利益交换话术。",
        "禁止根治、永久、百分百、立刻变白、治疗等绝对化或医美治疗表达。",
        "成分和步骤只作为背景知识，不要堆砌成分名。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `品牌：${brandName}`,
        `生成类型：${mode === "retry" ? "换一篇，不要和上一版像模板重复" : "首次生成"}`,
        previousText ? `上一版文案：${previousText}` : "",
        previousText ? "换一篇时请避开上一版的开头、句式、emoji 和主要表达顺序。" : "",
        "体验项目知识：",
        projectText,
        "请生成一条可直接复制到美团/大众点评的自然好评，只返回 JSON。"
      ].join("\n")
    }
  ];
}

async function loadProjectKnowledge(selected) {
  const raw = await readFile(path.join(ROOT, "llm-project-knowledge.json"), "utf8");
  const knowledge = JSON.parse(raw);
  const projects = Array.isArray(knowledge.projects) ? knowledge.projects : [];

  return selected.map(name => {
    const project = projects.find(item => item.displayName === name);
    if (!project) {
      return {
        displayName: name,
        positioning: "门店护理体验项目",
        includedService: "按门店实际服务为准",
        suitableFor: [],
        effects: [],
        reviewAngles: ["过程舒服", "服务细致", "环境干净"]
      };
    }
    return project;
  });
}

function normalizeSelected(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item || "").trim())
    .map(item => serviceAliases.get(item) || item)
    .filter(Boolean)
    .slice(0, 2);
}

function parseReview(content) {
  const text = String(content || "").trim();
  if (!text) return "";

  try {
    const parsed = JSON.parse(text);
    return cleanReview(parsed.review || parsed.text || "");
  } catch (error) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        return cleanReview(parsed.review || parsed.text || "");
      } catch (nestedError) {}
    }
  }

  return cleanReview(text);
}

function cleanReview(value) {
  return String(value || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

function asList(value) {
  return Array.isArray(value) ? value.filter(Boolean).join("、") : String(value || "");
}

async function loadLocalEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return {};

  const content = await readFile(envPath, "utf8");
  return content.split(/\r?\n/).reduce((env, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return env;
    const index = trimmed.indexOf("=");
    if (index < 0) return env;
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    env[key] = rawValue.replace(/^["']|["']$/g, "");
    return env;
  }, {});
}

async function readRequestJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY_SIZE) {
      throw new Error("Request body too large");
    }
  }
  return body ? JSON.parse(body) : {};
}

async function serveStatic(pathname, req, res) {
  const cleanPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const targetPath = path.normalize(path.join(ROOT, cleanPath));
  if (!targetPath.startsWith(ROOT)) {
    return sendJson(res, 403, { message: "Forbidden" });
  }

  const extension = path.extname(targetPath).toLowerCase();
  const type = MIME_TYPES[extension] || "application/octet-stream";
  const file = await readFile(targetPath);

  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-store"
  });
  if (req.method !== "HEAD") res.end(file);
  else res.end();
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  if (statusCode === 204) return res.end();
  return res.end(JSON.stringify(payload));
}
