const state = {
  token: sessionStorage.getItem("aivf_token") || "",
  sidebarCollapsed: localStorage.getItem("aivf_sidebar_collapsed") === "1",
  user: null,
  assets: [],
  voices: [],
  jobs: [],
  accounts: [],
  selectedFinishedJobIds: new Set(),
  assetGroups: [],
  activeAssetGroupId: localStorage.getItem("aivf_active_asset_group") || "all",
  assetModalOpen: false,
  selectedLibraryAssetIds: JSON.parse(localStorage.getItem("aivf_selected_library_assets") || "[]"),
  lastResearch: null,
  lastRender: null,
  progressTimers: {},
  scriptTopicOptions: [],
  selectedTopicIndex: 0,
  activeTemplateCategory: "同城短视频",
  shots: [],
};
localStorage.removeItem("aivf_token");

const $ = (id) => document.getElementById(id);
const apiSearchParam = new URLSearchParams(location.search).get("api");
if (apiSearchParam) {
  localStorage.setItem("aivf_api_base_url", apiSearchParam.trim().replace(/\/+$/, ""));
}
const configuredApiBaseUrl = String(apiSearchParam || window.AIVF_API_BASE_URL || localStorage.getItem("aivf_api_base_url") || "").trim().replace(/\/+$/, "");
const staticPreviewMode = location.hostname.endsWith(".github.io") && !configuredApiBaseUrl;
const staticPreviewMessage = "当前是 GitHub Pages 静态预览版，只能进入页面预览；登录、上传、AI 生成、配音和剪视频需要连接后端服务。";
const staticAccountStorageKey = "aivf_static_accounts";
const staticDefaultAccounts = [
  { id: "admin", username: "admin", phone: "", password: "admin123", role: "admin", quotaDaily: 100, clipQuota: 100, clipsUsed: 0, expiresAt: "", disabled: false, createdAt: "2026-07-27T00:00:00.000Z" },
  { id: "client01", username: "client01", phone: "", password: "client123", role: "customer", quotaDaily: 20, clipQuota: 20, clipsUsed: 0, expiresAt: "", disabled: false, createdAt: "2026-07-27T00:00:00.000Z" },
];

const researchRegenerateLimit = 3;
const researchRegenerateWindowMs = 5 * 60 * 1000;
const researchRegenerateStorageKey = "aivf_research_regen_window";
const topicNumberLabels = ["一", "二", "三", "四", "五"];
const assetGroupStorageKey = "aivf_asset_groups";
const assetQuotaBytes = 5 * 1024 * 1024 * 1024;
const voiceSampleMaxSeconds = 45;
const workspaceDraftVersion = 1;
const workspaceDraftFieldIds = [
  "modelMode",
  "storeIndustry",
  "brandName",
  "storeCity",
  "storeLocation",
  "personaName",
  "personaAge",
  "personaGender",
  "businessYears",
  "hometown",
  "mainProduct",
  "serviceAdvantage",
  "extraInfo",
  "resultStrategy",
  "scriptDossier",
  "scriptModelMode",
  "templateSelect",
  "scriptTitleStyle",
  "localAudienceSegment",
  "localAgeRange",
  "scriptTopicIdeas",
  "resultTitle",
  "resultTags",
  "resultScript",
  "resultPrompts",
  "ttsVoiceSelect",
  "voiceSpeed",
  "renderCount",
  "subtitleStyle",
  "titleStyle",
  "bgmMode",
  "ttsText",
  "videoTitle",
  "videoScript",
  "editorVoiceSelect",
  "editorVoiceSpeed",
  "editorBgmMode",
  "voiceName",
];
const workspaceDraftExcludedIds = new Set([
  "loginPassword",
  "assetFile",
  "voiceConsent",
]);
let workspaceDraftTimer = null;
let isRestoringWorkspaceDraft = false;
let editProgressTimer = null;

const defaultAssetGroups = [
  { id: "ungrouped", name: "未分组", locked: true },
];

const requiredDossierFields = [
  ["storeIndustry", "您的行业是什么"],
  ["brandName", "您的店名/品牌名"],
  ["storeCity", "门店所在的城市"],
  ["storeLocation", "门店位置简单描述"],
  ["personaName", "短视频中的自我称呼"],
  ["personaAge", "您的年龄"],
  ["personaGender", "您的性别"],
  ["businessYears", "行业/门店年限"],
  ["hometown", "您自己是哪里人"],
];

const localAudienceAgeMap = {
  "人群不限": { label: "不限", min: null, max: null },
  "Z 世代": { label: "18-23 岁", min: 18, max: 23 },
  "新锐白领": { label: "24-30 岁", min: 24, max: 30 },
  "精致妈妈": { label: "25-40 岁", min: 25, max: 40 },
  "资深中产": { label: "31-50 岁", min: 31, max: 50 },
  "都市蓝领": { label: "24-45 岁", min: 24, max: 45 },
  "小镇青年": { label: "18-23 岁", min: 18, max: 23 },
  "小镇中老年": { label: "41-60 岁", min: 41, max: 60 },
  "都市银发": { label: "60 岁以上", min: 60, max: null },
};

const workspaceCopy = {
  researchTab: {
    title: "调研档案",
    subtitle: "先让系统理解你是谁、店铺情况和当前卡点。"
  },
  scriptTab: {
    title: "脚本",
    subtitle: "基于调研结果，生成流量、同城或团单短视频的文案和分镜。"
  },
  libraryTab: {
    title: "视频库",
    subtitle: "集中管理口播、门店环境、项目过程、顾客反馈、产品图和声音样本。"
  },
  editorTab: {
    title: "剪辑",
    subtitle: "把文案分镜按镜头导入，再匹配视频库素材形成混剪结构。"
  },
  exportTab: {
    title: "成品素材库",
    subtitle: "像素材视频库一样保存成片效果，方便预览、下载和复用。"
  },
  accountTab: {
    title: "账号设置",
    subtitle: "管理客户登录、有效期和剪辑条数，系统会按账号身份自动分配权限。"
  }
};

const templateLibrary = {
  "流量短视频": [
    {
      id: "traffic-video",
      name: "流量短视频",
      content: "底层逻辑：流量的本质是人性。先过人脑筛选，再过平台筛选。\n思考框架：对象锚定 → 七情六欲点火 → 黄金 5 秒停留 → 场景承接 → 信任筛选 → 动作着陆。\n选题方向：反常识、被坑避雷、怕错过、怕掉队、轻松获得、替用户表达不满、老板真实观点。\n输出要求：先给 3-5 个选题，再选 1 个生成文案 + 分镜；口播每个短句尽量 8-12 字，少用逗号，开头必须有情绪张力。"
    }
  ],
  "同城短视频": [
    {
      id: "local-city-video",
      name: "同城短视频",
      content: "底层逻辑：同城不是只讲行业，而是用城市生活、天气、商圈、消费习惯、人群情绪等泛垂直内容圈住附近的人。\n思考框架：先选人群和年龄，再结合城市与门店档案，找到这个群体会停留、会共鸣、会到店的切口。\n选题方向：城市天气、附近生活、下班场景、家庭关系、聚会饭局、精致生活、避坑、省钱、松弛感。\n输出要求：必须结合已选人群和年龄范围，先给破圈选题，再生成内容 + 分镜；口播短句尽量 8-12 字，少打逗号。"
    }
  ],
  "团单短视频": [
    {
      id: "group-deal-video",
      name: "团单短视频",
      content: "底层逻辑：团单短视频不是直接吆喝便宜，而是降低决策成本。\n思考框架：谁适合 → 为什么值 → 过程是否可信 → 到店怎么用 → 现在为什么要买。\n选题方向：套餐拆解、适合/不适合人群、真实体验流程、到店避坑、限时福利、老客推荐。\n输出要求：先给 3-5 个团单转化选题，再生成文案 + 分镜；表达要具体，不硬推；口播短句尽量 8-12 字。"
    }
  ]
};

const titleTemplateLibrary = {
  "智能推荐样式": "系统按当前系列自动挑标题：流量优先痛点/反差，同城优先城市场景，团单优先成交理由。",
  "不要标题": "成片不叠加顶部 AI 标题，只保留口播字幕。",
  "痛点钩子标题": "模板：在{城市}，别再为{痛点}花冤枉钱。适合先抓客户正在担心的问题。",
  "反差悬念标题": "模板：看起来普通的{服务}，为什么{人群}都来？适合制造好奇和停留。",
  "数字清单标题": "模板：{城市}{人群}必看的3个{选择标准}。适合避坑、收藏、转发。",
  "同城场景标题": "模板：{城市}{场景}后，我发现{门店价值}。适合同城泛垂直破圈。",
  "避坑提醒标题": "模板：第一次做{服务}，先避开这3个坑。适合教育用户、建立信任。",
  "结果承诺标题": "模板：想{结果}，先看这套{方法/流程}。适合从结果倒推到服务。",
  "真实测评标题": "模板：我用{真实场景}测了一下{服务}。适合门店过程、体验、反馈内容。",
  "团购成交标题": "模板：{套餐/价格}值不值？看完再决定。适合团单、套餐、转化视频。"
};

const assetTypeLabels = {
  talking_head: "口播视频",
  scene: "门店环境",
  process: "项目过程",
  feedback: "顾客反馈",
  product: "产品/团购图",
  voice_sample: "声音样本",
  bgm: "BGM 音乐",
  image: "图片",
  video: "视频",
  audio: "音频",
  document: "文档",
};

const assetOrder = [
  ["talking_head", "口播视频"],
  ["scene", "门店环境"],
  ["process", "项目过程"],
  ["feedback", "顾客反馈"],
  ["product", "产品/团购图"],
  ["bgm", "BGM 音乐"],
];

const cockpitMaterialRows = [
  { type: "talking_head", title: "口播", subtitle: "品牌介绍/讲解", missingAction: "上传" },
  { type: "scene", title: "门店环境", subtitle: "门头/前台/环境", missingAction: "上传" },
  { type: "process", title: "项目过程", subtitle: "护理/操作过程", missingAction: "上传" },
  { type: "feedback", title: "顾客反馈", subtitle: "顾客评价/见证", missingAction: "上传" },
  { type: "bgm", title: "BGM", subtitle: "背景音乐", missingAction: "选择音乐" },
];

state.assetGroups = [...defaultAssetGroups];

const stepIndexByTab = {
  researchTab: 1,
  scriptTab: 2,
  libraryTab: 1,
  editorTab: 3,
  exportTab: 4,
};

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2600);
}

function safeJsonBody(body) {
  if (typeof body !== "string") return body;
  return body.replace(/[^\x00-\x7F]/g, (char) => {
    const code = char.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${code}`;
  });
}

async function api(path, options = {}) {
  if (staticPreviewMode && path.startsWith("/api/")) {
    return staticPreviewApi(path, options);
  }
  const url = path.startsWith("/api/") && configuredApiBaseUrl ? `${configuredApiBaseUrl}${path}` : path;
  const headers = { ...(options.headers || {}) };
  headers["Content-Type"] = "application/json; charset=utf-8";
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(url, { ...options, headers, body: safeJsonBody(options.body) });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("后端服务未连接：请启动服务器后再操作");
  }
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `请求失败：${res.status}`);
  }
  return data;
}

function parseRequestBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}

function getStaticPreviewUser(username = "admin") {
  const clean = String(username || "admin").trim() || "admin";
  const account = getStaticAccounts().find((item) => item.username === clean || item.phone === clean);
  return publicAccount(account || {
    id: `static-${clean}`,
    username: clean,
    role: clean === "admin" ? "admin" : (clean.startsWith("client") ? "customer" : "demo"),
  });
}

function getStaticAccounts() {
  try {
    const saved = JSON.parse(localStorage.getItem(staticAccountStorageKey) || "null");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  return staticDefaultAccounts.map((item) => ({ ...item }));
}

function saveStaticAccounts(accounts) {
  localStorage.setItem(staticAccountStorageKey, JSON.stringify(accounts));
}

function publicAccount(account = {}) {
  return {
    id: account.id || account.username || crypto.randomUUID(),
    username: account.username || "",
    phone: account.phone || "",
    role: account.role || "customer",
    quotaDaily: Number(account.quotaDaily || 0),
    clipQuota: Number(account.clipQuota || account.quotaDaily || 0),
    clipsUsed: Number(account.clipsUsed || 0),
    expiresAt: account.expiresAt || "",
    disabled: Boolean(account.disabled),
    createdAt: account.createdAt || "",
    updatedAt: account.updatedAt || "",
  };
}

function isAccountExpired(account = {}) {
  if (!account.expiresAt) return false;
  return new Date(`${account.expiresAt}T23:59:59`).getTime() < Date.now();
}

function buildStaticPreviewCopy(payload = {}) {
  const brand = payload.brandName || payload.storeIndustry || "本地门店";
  const product = payload.mainProduct || "主推项目";
  const city = payload.storeCity || "同城";
  const title = `${brand}${product}到店体验`;
  const strategy = [
    `静态预览说明：当前页面运行在 GitHub Pages，没有连接后端和大模型。`,
    `档案方向：围绕${city}本地客户，用真实门店、真实服务过程和真实反馈建立信任。`,
    `内容重点：先讲客户痛点，再展示${product}的服务过程，最后给出到店理由。`,
    `正式上线后，这里会由后端调用 DeepSeek/百炼生成完整调研和脚本。`,
  ].join("\n");
  const script = [
    `很多${city}客户第一次选择${brand}，最担心的不是价格，而是不知道效果靠不靠谱。`,
    `我们会先把服务流程讲清楚，再把真实过程和注意事项拍出来。`,
    `${product}适合想少走弯路、希望看到真实体验的人。`,
    `如果你也在附近，可以先了解一下，再决定要不要到店。`,
  ].join("\n");
  const shotPrompts = [
    `文案：很多${city}客户第一次选择${brand}，最担心的不是价格，而是不知道效果靠不靠谱｜画面：老板或门店负责人正面口播｜素材：口播视频`,
    `文案：我们会先把服务流程讲清楚，再把真实过程和注意事项拍出来｜画面：门店环境和服务流程细节｜素材：门店/过程素材`,
    `文案：${product}适合想少走弯路、希望看到真实体验的人｜画面：项目成果、套餐权益或顾客反馈｜素材：产品/反馈素材`,
    `文案：如果你也在附近，可以先了解一下，再决定要不要到店｜画面：门头、地址、引导咨询画面｜素材：门店素材`,
  ];
  return {
    ok: true,
    provider: "github-pages-preview",
    result: {
      taskType: payload.taskType || "script",
      mode: payload.modelMode || "preview",
      model: "static-preview",
      strategy,
      script,
      shotPrompts,
      tags: ["同城", "门店", "真实体验"],
      topicOptions: [
        {
          title,
          reason: "用于静态预览页面流程，正式上线后由后端大模型生成。",
          script,
          shotPrompts,
          tags: ["同城", "门店", "真实体验"],
        },
      ],
    },
  };
}

function staticPreviewApi(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const payload = parseRequestBody(options.body);
  if (path === "/api/auth/login" && method === "POST") {
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");
    const account = getStaticAccounts().find((item) => (item.username === username || item.phone === username) && item.password === password);
    if (!account) throw new Error("账号或密码错误");
    if (account.disabled) throw new Error("账号已暂停");
    if (isAccountExpired(account)) throw new Error("账号已过有效期");
    return Promise.resolve({ ok: true, token: `static-preview-${account.username}`, user: publicAccount(account) });
  }
  if (path === "/api/me") {
    return Promise.resolve({ ok: true, user: getStaticPreviewUser(state.token.replace(/^static-preview-/, "") || "admin") });
  }
  if (path === "/api/accounts" && method === "GET") {
    if (state.user?.role !== "admin") throw new Error("只有管理员可以查看账号列表");
    return Promise.resolve({ ok: true, accounts: getStaticAccounts().map(publicAccount) });
  }
  if (path === "/api/accounts" && method === "POST") {
    if (state.user?.role !== "admin") throw new Error("只有管理员可以保存账号");
    const accounts = getStaticAccounts();
    const id = String(payload.id || "").trim();
    const username = String(payload.username || "").trim();
    if (!username) throw new Error("请填写账号名");
    const existingIndex = accounts.findIndex((item) => item.id === id || item.username === username);
    const existing = existingIndex >= 0 ? accounts[existingIndex] : null;
    if (!existing && !String(payload.password || "").trim()) throw new Error("新账号请填写密码");
    const duplicated = accounts.some((item, index) => index !== existingIndex && (item.username === username || (payload.phone && item.phone === payload.phone)));
    if (duplicated) throw new Error("账号名或手机号已存在");
    const next = {
      ...(existing || {}),
      id: existing?.id || `account-${Date.now()}`,
      username,
      phone: String(payload.phone || "").trim(),
      password: String(payload.password || existing?.password || ""),
      role: payload.role === "admin" ? "admin" : "customer",
      quotaDaily: Number(payload.quotaDaily || 0),
      clipQuota: Number(payload.clipQuota || 0),
      clipsUsed: Number(existing?.clipsUsed || 0),
      expiresAt: String(payload.expiresAt || "").trim(),
      disabled: Boolean(payload.disabled),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (existingIndex >= 0) accounts[existingIndex] = next;
    else accounts.push(next);
    saveStaticAccounts(accounts);
    return Promise.resolve({ ok: true, account: publicAccount(next), accounts: accounts.map(publicAccount) });
  }
  if (path === "/api/accounts/delete" && method === "POST") {
    if (state.user?.role !== "admin") throw new Error("只有管理员可以删除账号");
    const accountId = String(payload.id || "").trim();
    if (!accountId) throw new Error("缺少账号 ID");
    if (accountId === state.user?.id) throw new Error("不能删除当前登录的管理员账号");
    const accounts = getStaticAccounts();
    const account = accounts.find((item) => item.id === accountId);
    if (!account) throw new Error("账号不存在");
    const nextAccounts = accounts.filter((item) => item.id !== accountId);
    saveStaticAccounts(nextAccounts);
    return Promise.resolve({ ok: true, deleted: accountId, accounts: nextAccounts.map(publicAccount) });
  }
  if (path === "/api/health") {
    return Promise.resolve({ ok: true, name: "GitHub Pages 静态预览版" });
  }
  if (path === "/api/asset-groups" && method === "GET") {
    return Promise.resolve({ ok: true, groups: [...defaultAssetGroups] });
  }
  if (path === "/api/assets" && method === "GET") {
    return Promise.resolve({ ok: true, assets: [] });
  }
  if (path === "/api/voices" && method === "GET") {
    return Promise.resolve({ ok: true, voices: [] });
  }
  if (path === "/api/jobs" && method === "GET") {
    return Promise.resolve({ ok: true, jobs: [] });
  }
  if (path === "/api/copy/rewrite" && method === "POST") {
    return Promise.resolve(buildStaticPreviewCopy(payload));
  }
  throw new Error(staticPreviewMessage);
}

function showApp() {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  applySidebarState();
}

function showLogin() {
  $("loginView").classList.remove("hidden");
  $("appView").classList.add("hidden");
  if ($("loginUsername")) $("loginUsername").value = "";
  if ($("loginPassword")) $("loginPassword").value = "";
}

function getWorkspaceDraftKey() {
  const userKey = state.user?.id || state.user?.username || "anonymous";
  return `aivf_workspace_draft_v${workspaceDraftVersion}_${userKey}`;
}

function getFieldValueForDraft(field) {
  if (!field || workspaceDraftExcludedIds.has(field.id)) return undefined;
  if (field.type === "checkbox") return Boolean(field.checked);
  if (field.type === "file" || field.type === "password") return undefined;
  return field.value ?? "";
}

function setFieldValueFromDraft(id, value) {
  const field = $(id);
  if (!field || value === undefined || workspaceDraftExcludedIds.has(id)) return;
  if (field.type === "checkbox") {
    field.checked = Boolean(value);
    return;
  }
  if (field.type === "file" || field.type === "password") return;
  field.value = value ?? "";
}

function collectWorkspaceDraft() {
  const fields = {};
  workspaceDraftFieldIds.forEach((id) => {
    const value = getFieldValueForDraft($(id));
    if (value !== undefined) fields[id] = value;
  });
  return {
    version: workspaceDraftVersion,
    savedAt: new Date().toISOString(),
    activeTemplateCategory: state.activeTemplateCategory,
    activeAssetGroupId: state.activeAssetGroupId,
    selectedTopicIndex: state.selectedTopicIndex,
    scriptTopicOptions: state.scriptTopicOptions || [],
    shots: state.shots || [],
    lastResearch: state.lastResearch || null,
    lastRender: state.lastRender || null,
    scriptDossierState: $("scriptDossierState")?.textContent || "",
    modelBadge: $("modelBadge")?.textContent || "",
    exportStatus: $("exportStatus")?.textContent || "",
    localAudienceSegments: Array.from(document.querySelectorAll('input[name="localAudienceSegmentOption"]:checked')).map((box) => box.value),
    fields,
  };
}

function saveWorkspaceDraftNow() {
  if (isRestoringWorkspaceDraft || !state.user) return;
  try {
    localStorage.setItem(getWorkspaceDraftKey(), JSON.stringify(collectWorkspaceDraft()));
  } catch (error) {
    console.warn("workspace_draft_save_failed", error);
  }
}

function scheduleWorkspaceDraftSave() {
  if (isRestoringWorkspaceDraft || !state.user) return;
  clearTimeout(workspaceDraftTimer);
  workspaceDraftTimer = setTimeout(saveWorkspaceDraftNow, 250);
}

function restoreWorkspaceDraft() {
  if (!state.user) return;
  let draft = null;
  try {
    draft = JSON.parse(localStorage.getItem(getWorkspaceDraftKey()) || "null");
  } catch {
    draft = null;
  }
  if (!draft || draft.version !== workspaceDraftVersion) return;
  isRestoringWorkspaceDraft = true;
  try {
    state.activeTemplateCategory = draft.activeTemplateCategory || state.activeTemplateCategory;
    state.activeAssetGroupId = draft.activeAssetGroupId || state.activeAssetGroupId;
    state.selectedTopicIndex = Number.isFinite(Number(draft.selectedTopicIndex)) ? Number(draft.selectedTopicIndex) : 0;
    state.scriptTopicOptions = Array.isArray(draft.scriptTopicOptions) ? draft.scriptTopicOptions : [];
    state.shots = Array.isArray(draft.shots) ? draft.shots.map(normalizeShot) : [];
    state.lastResearch = draft.lastResearch || null;
    state.lastRender = draft.lastRender || state.lastRender;
    renderTemplateTabs();
    renderTemplateSelect();
    updateScriptSeriesFields();
    if (draft.fields) {
      Object.entries(draft.fields).forEach(([id, value]) => setFieldValueFromDraft(id, value));
    }
    if (Array.isArray(draft.localAudienceSegments)) {
      document.querySelectorAll('input[name="localAudienceSegmentOption"]').forEach((box) => {
        box.checked = draft.localAudienceSegments.includes(box.value);
      });
      syncLocalAudienceSelections();
    }
    if ($("scriptDossierState") && draft.scriptDossierState) $("scriptDossierState").textContent = draft.scriptDossierState;
    if ($("modelBadge") && draft.modelBadge) $("modelBadge").textContent = draft.modelBadge;
    if ($("exportStatus") && draft.exportStatus) setExportStatus(draft.exportStatus, "idle");
    renderTopicIdeas(state.scriptTopicOptions);
    renderTopicChoiceBar();
    if (state.shots.length) {
      renderShotTable();
      renderMixPlan();
    } else {
      clearShotTableView();
    }
    renderLatestExport();
    if (state.shots.length) renderCockpit();
  } finally {
    isRestoringWorkspaceDraft = false;
  }
}

function clearCurrentWorkspaceDraft() {
  if (!state.user) return;
  localStorage.removeItem(getWorkspaceDraftKey());
}

function setExportStatus(message, status = "idle") {
  const el = $("exportStatus");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("is-idle", "is-running", "is-done", "is-error");
  el.classList.add(`is-${status}`);
}

function getAccountFormPayload() {
  return {
    id: $("accountEditingId")?.value.trim() || "",
    username: $("accountUsername")?.value.trim() || "",
    phone: $("accountPhone")?.value.trim() || "",
    password: $("accountPassword")?.value || "",
    expiresAt: $("accountExpiresAt")?.value || "",
    clipQuota: Number($("accountClipQuota")?.value || 0),
    quotaDaily: Number($("accountQuotaDaily")?.value || 0),
    role: $("accountRole")?.value || "customer",
    disabled: Boolean($("accountDisabled")?.checked),
  };
}

function resetAccountForm(account = null) {
  if ($("accountEditingId")) $("accountEditingId").value = account?.id || "";
  if ($("accountUsername")) $("accountUsername").value = account?.username || "";
  if ($("accountPhone")) $("accountPhone").value = account?.phone || "";
  if ($("accountPassword")) $("accountPassword").value = "";
  if ($("accountExpiresAt")) $("accountExpiresAt").value = account?.expiresAt ? String(account.expiresAt).slice(0, 10) : "";
  if ($("accountClipQuota")) $("accountClipQuota").value = Number(account?.clipQuota || account?.quotaDaily || 20);
  if ($("accountQuotaDaily")) $("accountQuotaDaily").value = Number(account?.quotaDaily || 20);
  if ($("accountRole")) $("accountRole").value = account?.role === "admin" ? "admin" : "customer";
  if ($("accountDisabled")) $("accountDisabled").checked = Boolean(account?.disabled);
  if ($("accountError")) $("accountError").textContent = "";
}

function accountStatusText(account) {
  if (account.disabled) return "已暂停";
  if (isAccountExpired(account)) return "已过期";
  return "正常";
}

function renderAccountSettings() {
  const user = state.user;
  if (!user || !$("accountSelfCard")) return;
  const remaining = Math.max(0, Number(user.clipQuota || 0) - Number(user.clipsUsed || 0));
  $("accountSelfCard").innerHTML = [
    `<div class="account-stat"><span>当前账号</span><strong>${escapeHtml(user.username || "-")}</strong></div>`,
    `<div class="account-stat"><span>手机号</span><strong>${escapeHtml(user.phone || "未设置")}</strong></div>`,
    `<div class="account-stat"><span>登录身份</span><strong>${escapeHtml(roleLabel(user.role))}</strong></div>`,
    `<div class="account-stat"><span>剩余剪辑条数</span><strong>${remaining} / ${Number(user.clipQuota || 0)}</strong></div>`,
    `<div class="account-stat"><span>登录有效期</span><strong>${escapeHtml(formatAccountDate(user.expiresAt))}</strong></div>`,
    `<div class="account-stat"><span>每日生成额度</span><strong>${Number(user.quotaDaily || 0)}</strong></div>`,
  ].join("");
  if ($("accountAdminArea")) $("accountAdminArea").classList.toggle("hidden", user.role !== "admin");
  if (user.role === "admin") renderAccountList();
}

function renderAccountList() {
  const list = $("accountList");
  if (!list) return;
  if (state.user?.role !== "admin") {
    list.innerHTML = "";
    return;
  }
  if (!state.accounts.length) {
    list.innerHTML = `<div class="hint">还没有加载账号，点击刷新。</div>`;
    return;
  }
  list.innerHTML = state.accounts.map((account) => {
    const isCurrentUser = account.id === state.user?.id;
    return `
    <div class="account-row">
      <strong>${escapeHtml(account.username || "-")}<br><span>${escapeHtml(roleLabel(account.role))}</span></strong>
      <span>${escapeHtml(account.phone || "未设置手机号")}</span>
      <em>有效期：${escapeHtml(formatAccountDate(account.expiresAt))}</em>
      <em>剪辑：${Number(account.clipsUsed || 0)} / ${Number(account.clipQuota || 0)}</em>
      <div class="account-row-actions">
        <button class="ghost small" type="button" data-edit-account-id="${escapeHtml(account.id)}">编辑</button>
        <button class="ghost small" type="button" data-toggle-account-id="${escapeHtml(account.id)}">${account.disabled ? "启用" : "暂停"}</button>
        ${isCurrentUser ? "" : `<button class="ghost small danger-action" type="button" data-delete-account-id="${escapeHtml(account.id)}">删除</button>`}
      </div>
    </div>
  `;
  }).join("");
}

async function loadAccounts() {
  if (state.user?.role !== "admin") {
    renderAccountSettings();
    return;
  }
  const data = await api("/api/accounts");
  state.accounts = Array.isArray(data.accounts) ? data.accounts : [];
  renderAccountSettings();
}

async function saveAccount() {
  if ($("accountError")) $("accountError").textContent = "";
  try {
    const data = await api("/api/accounts", {
      method: "POST",
      body: JSON.stringify(getAccountFormPayload()),
    });
    state.accounts = Array.isArray(data.accounts) ? data.accounts : state.accounts;
    resetAccountForm();
    renderAccountSettings();
    toast("账号已保存");
  } catch (error) {
    if ($("accountError")) $("accountError").textContent = error.message;
  }
}

function editAccount(accountId) {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) return;
  resetAccountForm(account);
}

async function toggleAccount(accountId) {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) return;
  const data = await api("/api/accounts", {
    method: "POST",
    body: JSON.stringify({ ...account, disabled: !account.disabled, password: "" }),
  });
  state.accounts = Array.isArray(data.accounts) ? data.accounts : state.accounts;
  renderAccountSettings();
  toast(account.disabled ? "账号已启用" : "账号已暂停");
}

async function deleteAccount(accountId) {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) return;
  if (account.id === state.user?.id) {
    toast("不能删除当前登录账号");
    return;
  }
  const confirmed = window.confirm(`确定删除账号「${account.username}」吗？删除后这个账号将不能登录。`);
  if (!confirmed) return;
  const data = await api("/api/accounts/delete", {
    method: "POST",
    body: JSON.stringify({ id: accountId }),
  });
  state.accounts = Array.isArray(data.accounts) ? data.accounts : state.accounts.filter((item) => item.id !== accountId);
  renderAccountSettings();
  toast("账号已删除");
}

function switchTab(tabId) {
  document.querySelectorAll(".nav").forEach((b) => {
    const tabs = (b.dataset.tabs || b.dataset.tab || "").split(/\s+/).filter(Boolean);
    b.classList.toggle("active", tabs.includes(tabId));
  });
  document.querySelectorAll(".nav-segment").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === tabId));
  updateWorkspaceHeader(tabId);
  if (tabId === "libraryTab") {
    loadAssetGroups().then(() => loadAssets()).catch((e) => toast(e.message));
    loadVoices().catch((e) => toast(e.message));
  }
  if (tabId === "editorTab") {
    loadAssets().then(() => {
      if (state.shots.length) {
        renderShotTable();
        renderMixPlan();
        renderEditorMaterialNotice();
      } else {
        clearShotTableView();
      }
    }).catch((e) => toast(e.message));
    loadVoices().then(() => {
      if (state.shots.length) renderEditorMaterialNotice();
    }).catch((e) => toast(e.message));
    if (state.shots.length) {
      renderShotTable();
      renderMixPlan();
      renderEditorMaterialNotice();
    } else {
      clearShotTableView();
    }
  }
  if (tabId === "exportTab") {
    loadVoices().catch((e) => toast(e.message));
    loadJobs().catch((e) => toast(e.message));
    syncExportFields();
  }
  if (tabId === "accountTab") {
    loadAccounts().catch((e) => toast(e.message));
  }
  renderCockpit();
}

function updateWorkspaceHeader(tabId) {
  const copy = workspaceCopy[tabId] || workspaceCopy.researchTab;
  if ($("workspaceTitle")) $("workspaceTitle").textContent = copy.title;
  if ($("workspaceSubtitle")) $("workspaceSubtitle").textContent = copy.subtitle;
}

function bindTabs() {
  document.querySelectorAll(".nav[data-tab], .nav-segment[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  requiredDossierFields.forEach(([id]) => {
    const field = $(id);
    if (!field) return;
    field.addEventListener("input", () => field.classList.remove("field-missing"));
    field.addEventListener("change", () => field.classList.remove("field-missing"));
  });
  ["scriptDossier", "localAudienceSegment", "localAgeRange"].forEach((id) => {
    const field = $(id);
    if (!field) return;
    field.addEventListener("input", () => field.classList.remove("field-missing"));
    field.addEventListener("change", () => field.classList.remove("field-missing"));
  });
  document.querySelectorAll('input[name="localAudienceSegmentOption"]').forEach((field) => {
    field.addEventListener("change", () => syncLocalAudienceSelections(field));
  });
  $("localAudienceToggle")?.addEventListener("click", (event) => {
    event.stopPropagation();
    setLocalAudienceMenu();
  });
  $("localAudienceSelect")?.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => setLocalAudienceMenu(false));
}

function applySidebarState() {
  const app = $("appView");
  const toggle = $("sidebarToggle");
  if (!app || !toggle) return;
  app.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  toggle.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  toggle.setAttribute("aria-label", state.sidebarCollapsed ? "展开侧边栏" : "收起侧边栏");
  toggle.textContent = state.sidebarCollapsed ? "›" : "‹";
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  localStorage.setItem("aivf_sidebar_collapsed", state.sidebarCollapsed ? "1" : "0");
  applySidebarState();
}

function roleLabel(role) {
  if (role === "admin") return "管理员";
  if (role === "customer") return "客户";
  if (role === "demo" || role === "tester") return "体验账号";
  return role || "账号";
}

function formatAccountDate(value) {
  if (!value) return "长期有效";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN");
}

function setCurrentUser(user) {
  state.user = user;
  if ($("accountName")) $("accountName").textContent = `${user.username} / ${roleLabel(user.role)}`;
  renderAccountSettings();
}

async function login() {
  $("loginError").textContent = "";
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("loginUsername").value.trim(),
        password: $("loginPassword").value,
      }),
    });
    state.token = data.token;
    setCurrentUser(data.user);
    localStorage.removeItem("aivf_token");
    sessionStorage.setItem("aivf_token", state.token);
    showApp();
    await bootstrap();
  } catch (err) {
    $("loginError").textContent = err.message;
  }
}

async function bootstrap() {
  renderTemplateTabs();
  renderTemplateSelect();
  await checkHealth();
  await loadAssetGroups();
  await Promise.all([loadAssets(), loadVoices(), loadJobs()]);
  restoreWorkspaceDraft();
  if (state.shots.length) {
    renderShotTable();
    renderMixPlan();
    renderCockpit();
  } else {
    clearShotTableView();
  }
}

async function checkHealth() {
  try {
    const data = await api("/api/health");
    if ($("healthPill")) $("healthPill").textContent = `${data.name} 已连接`;
  } catch {
    if ($("healthPill")) $("healthPill").textContent = "服务连接失败";
  }
}

async function restoreSession() {
  renderTemplateTabs();
  renderTemplateSelect();
  if (!state.token) {
    showLogin();
    return;
  }
  try {
    const data = await api("/api/me");
    setCurrentUser(data.user);
    showApp();
    await bootstrap();
  } catch {
    localStorage.removeItem("aivf_token");
    sessionStorage.removeItem("aivf_token");
    state.token = "";
    showLogin();
  }
}

function collectBrief() {
  const dossier = {
    storeIndustry: $("storeIndustry")?.value.trim() || "",
    brandName: $("brandName")?.value.trim() || "",
    storeCity: $("storeCity")?.value.trim() || "",
    storeLocation: $("storeLocation")?.value.trim() || "",
    personaName: $("personaName")?.value.trim() || "",
    personaAge: $("personaAge")?.value.trim() || "",
    personaGender: $("personaGender")?.value.trim() || "",
    businessYears: $("businessYears")?.value.trim() || "",
    hometown: $("hometown")?.value.trim() || "",
    mainProduct: $("mainProduct")?.value.trim() || "",
    serviceAdvantage: $("serviceAdvantage")?.value.trim() || "",
    extraInfo: $("extraInfo")?.value.trim() || "",
  };
  const storeProfile = [
    `行业：${dossier.storeIndustry}`,
    `店名/品牌：${dossier.brandName}`,
    `城市：${dossier.storeCity}`,
    `位置：${dossier.storeLocation}`,
  ].filter((item) => !item.endsWith("：")).join("\n");
  const personaProfile = [
    `自我称呼：${dossier.personaName}`,
    `年龄：${dossier.personaAge}`,
    `性别：${dossier.personaGender}`,
    `从业/开店年限：${dossier.businessYears}`,
    `籍贯/地域身份：${dossier.hometown}`,
  ].filter((item) => !item.endsWith("：")).join("\n");
  const optionalProfile = [
    `主推产品/套餐：${dossier.mainProduct}`,
    `产品/服务优势：${dossier.serviceAdvantage}`,
    `补充信息：${dossier.extraInfo}`,
  ].filter((item) => !item.endsWith("：")).join("\n");
  return {
    taskType: "research",
    ...dossier,
    background: personaProfile,
    pain: dossier.extraInfo,
    goal: dossier.mainProduct,
    rawText: storeProfile,
    targetAudience: [dossier.storeCity, dossier.storeLocation].filter(Boolean).join(" · "),
    assetCondition: optionalProfile,
    modelMode: $("modelMode")?.value || "fast",
    style: state.activeTemplateCategory,
    template: getSelectedTemplate()?.content || "",
  };
}

function buildDossierText(brief, includeAiResearch = true) {
  const sections = [
    `门店基本信息
行业：${brief.storeIndustry || "未填写"}
店名/品牌：${brief.brandName || "未填写"}
城市：${brief.storeCity || "未填写"}
位置：${brief.storeLocation || "未填写"}`,
    `人设基本信息
短视频自我称呼：${brief.personaName || "未填写"}
年龄：${brief.personaAge || "未填写"}
性别：${brief.personaGender || "未填写"}
行业/门店年限：${brief.businessYears || "未填写"}
籍贯/地域身份：${brief.hometown || "未填写"}`,
    `补充信息
主推产品/套餐：${brief.mainProduct || "未填写"}
产品/服务优势：${brief.serviceAdvantage || "未填写"}
其他补充：${brief.extraInfo || "未填写"}`,
  ];
  const aiResearch = $("resultStrategy")?.value.trim();
  if (includeAiResearch && aiResearch) {
    sections.push(`AI 调研结果\n${aiResearch}`);
  }
  return sections.join("\n\n");
}

function hasBrief(brief) {
  return Boolean(brief.storeIndustry || brief.brandName || brief.storeCity || brief.personaName || brief.background || brief.rawText);
}

function validateResearchDossier() {
  const missing = [];
  requiredDossierFields.forEach(([id, label]) => {
    const field = $(id);
    const value = field?.value?.trim() || "";
    field?.classList.toggle("field-missing", !value);
    if (!value) missing.push({ id, label, field });
  });
  if (missing.length) {
    missing[0].field?.focus();
    toast(`请先补全必填项：${missing.slice(0, 3).map((item) => item.label).join("、")}${missing.length > 3 ? "等" : ""}`);
    return false;
  }
  return true;
}

function getResearchRegenerateRecord() {
  const now = Date.now();
  let record = null;
  try {
    record = JSON.parse(localStorage.getItem(researchRegenerateStorageKey) || "null");
  } catch {
    record = null;
  }
  if (!record || !Number.isFinite(record.startedAt) || now - record.startedAt >= researchRegenerateWindowMs) {
    record = { startedAt: now, count: 0 };
  }
  return record;
}

function formatCooldown(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest} 秒`;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}

function claimResearchGenerationSlot() {
  const now = Date.now();
  const record = getResearchRegenerateRecord();
  const elapsed = now - record.startedAt;
  if (record.count >= researchRegenerateLimit && elapsed < researchRegenerateWindowMs) {
    return {
      ok: false,
      waitText: formatCooldown(researchRegenerateWindowMs - elapsed),
    };
  }
  record.count += 1;
  localStorage.setItem(researchRegenerateStorageKey, JSON.stringify(record));
  return {
    ok: true,
    remaining: Math.max(0, researchRegenerateLimit - record.count),
  };
}

function importResearchDossier() {
  const brief = collectBrief();
  if (!validateResearchDossier()) return false;
  const dossierText = buildDossierText(brief, true);
  $("scriptDossier").value = dossierText;
  $("scriptDossierState").textContent = $("resultStrategy").value.trim() ? "已导入调研档案库" : "已导入基础档案库";
  $("scriptDossier").classList.remove("field-missing");
  document.querySelector(".dossier-mini")?.classList.remove("field-missing");
  resetScriptGenerationDraft();
  toast("调研档案库已导入脚本模块");
  scheduleWorkspaceDraftSave();
  return true;
}

function resetScriptGenerationDraft() {
  state.scriptTopicOptions = [];
  state.selectedTopicIndex = 0;
  state.shots = [];
  ["scriptTopicIdeas", "resultTitle", "resultTags", "resultScript", "resultPrompts", "ttsText", "videoTitle", "videoScript"].forEach((id) => {
    const field = $(id);
    if (field) field.value = "";
  });
  if ($("scriptDossierState")) $("scriptDossierState").textContent = $("resultStrategy").value.trim()
    ? "已导入调研档案库，等待生成脚本"
    : "已导入基础档案库，等待生成脚本";
  if ($("scriptTopicIdeas")) $("scriptTopicIdeas").placeholder = "已导入档案。点击下方按钮后，DeepSeek 会先思考，再生成可选选题。";
  if ($("resultScript")) $("resultScript").placeholder = "这里不会自动套模板；生成后才会出现可直接照着念的口播文案。";
  if ($("resultPrompts")) $("resultPrompts").placeholder = "生成后会按同一镜头匹配：口播文案、拍摄场景/动作、需要素材。";
  renderTopicIdeas([]);
  renderTopicChoiceBar();
  clearShotTableView();
  renderCockpit();
}

function updateScriptSeriesFields() {
  const isLocal = state.activeTemplateCategory === "同城短视频";
  $("localTargetPanel")?.classList.toggle("hidden", !isLocal);
  if (!isLocal) setLocalAudienceMenu(false);
  if (isLocal) syncLocalAudienceSelections();
}

function setLocalAudienceMenu(forceOpen = null) {
  const menu = $("localAudienceSegmentGroup");
  const toggle = $("localAudienceToggle");
  if (!menu || !toggle) return;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : menu.classList.contains("hidden");
  menu.classList.toggle("hidden", !shouldOpen);
  toggle.setAttribute("aria-expanded", String(shouldOpen));
}

function updateLocalAudienceSummary(selected) {
  const summary = $("localAudienceSummary");
  if (!summary) return;
  if (!selected.length) {
    summary.textContent = "请选择人群";
    return;
  }
  if (selected.includes("人群不限")) {
    summary.textContent = "人群不限";
    return;
  }
  const preview = selected.slice(0, 2).join("、");
  summary.textContent = selected.length > 2 ? `已选 ${selected.length} 项：${preview} 等` : `已选 ${selected.length} 项：${preview}`;
}

function syncLocalAudienceSelections(changedField = null) {
  const boxes = Array.from(document.querySelectorAll('input[name="localAudienceSegmentOption"]'));
  if (!boxes.length) return;
  const unlimited = boxes.find((box) => box.value === "人群不限");
  if (changedField?.value === "人群不限" && changedField.checked) {
    boxes.forEach((box) => {
      if (box !== changedField) box.checked = false;
    });
  } else if (changedField?.checked && unlimited) {
    unlimited.checked = false;
  }
  const selected = boxes.filter((box) => box.checked).map((box) => box.value);
  if ($("localAudienceSegment")) {
    $("localAudienceSegment").value = selected.join("、");
    $("localAudienceSegment").classList.remove("field-missing");
  }
  $("localAudienceSegmentGroup")?.classList.remove("field-missing");
  $("localAudienceSelect")?.classList.remove("field-missing");
  document.querySelectorAll(".choice-chip").forEach((chip) => {
    const input = chip.querySelector("input");
    chip.classList.toggle("selected", Boolean(input?.checked));
  });
  updateLocalAudienceSummary(selected);
  const ageValue = deriveAgeRangeFromSegments(selected);
  if ($("localAgeRange")) {
    $("localAgeRange").value = ageValue;
    $("localAgeRange").classList.remove("field-missing");
  }
}

function deriveAgeRangeFromSegments(selected) {
  if (!selected.length) return "";
  if (selected.includes("人群不限")) return "不限";
  const ranges = selected.map((name) => localAudienceAgeMap[name]).filter(Boolean);
  if (!ranges.length) return "";
  const hasOpenEnded = ranges.some((range) => range.max === null);
  const mins = ranges.map((range) => range.min).filter((value) => Number.isFinite(value));
  const maxes = ranges.map((range) => range.max).filter((value) => Number.isFinite(value));
  if (!mins.length) return "不限";
  const min = Math.min(...mins);
  if (hasOpenEnded) return `${min} 岁以上`;
  return `${min}-${Math.max(...maxes)} 岁`;
}

function validateScriptInputs() {
  const missing = [];
  const dossier = $("scriptDossier");
  if (!dossier.value.trim()) {
    document.querySelector(".dossier-mini")?.classList.add("field-missing");
    missing.push({ field: $("importDossierBtn"), label: "调研档案" });
  }
  if (state.activeTemplateCategory === "同城短视频") {
    const audienceValue = $("localAudienceSegment")?.value?.trim() || "";
    $("localAudienceSelect")?.classList.toggle("field-missing", !audienceValue);
    if (!audienceValue) {
      setLocalAudienceMenu(true);
      missing.push({ field: $("localAudienceToggle"), label: "同城人群" });
    }
    const ageField = $("localAgeRange");
    const ageValue = ageField?.value?.trim() || "";
    ageField?.classList.toggle("field-missing", !ageValue);
    if (!ageValue) missing.push({ field: ageField, label: "年龄范围" });
  }
  if (missing.length) {
    missing[0].field?.focus();
    toast(`请先补全脚本必填项：${missing.map((item) => item.label).join("、")}`);
    return false;
  }
  return true;
}

async function generateResearch(autoJump = false) {
  const brief = collectBrief();
  if (!validateResearchDossier()) {
    return;
  }
  const slot = claimResearchGenerationSlot();
  if (!slot.ok) {
    toast(`连续生成已达 3 次，请 ${slot.waitText} 后再试`);
    return;
  }
  let success = false;
  $("resultStrategy").value = "";
  setResearchLoading(true, brief.modelMode);
  try {
    const data = await api("/api/copy/rewrite", {
      method: "POST",
      body: JSON.stringify({ ...brief, taskType: "research" }),
    });
    applyAiResult(data, "research");
    success = true;
    toast(data.provider === "deepseek" ? "DeepSeek 已完成个人调研定位" : "已生成本地个人调研定位");
    if (autoJump) switchTab("scriptTab");
  } finally {
    setResearchLoading(false, brief.modelMode, success);
  }
}

async function generateScript() {
  const brief = collectBrief();
  const tpl = getSelectedTemplate();
  const payload = {
    ...brief,
    taskType: "script",
    style: state.activeTemplateCategory,
    template: tpl?.content || "",
    researchProfile: $("scriptDossier").value.trim(),
    localAudienceSegment: $("localAudienceSegment")?.value.trim() || "",
    localAgeRange: $("localAgeRange")?.value.trim() || "",
    titleStyle: $("scriptTitleStyle")?.value || "智能推荐样式",
    title_style: $("scriptTitleStyle")?.value || "智能推荐样式",
    titleTemplateHint: getTitleTemplateHint($("scriptTitleStyle")?.value || "智能推荐样式"),
    modelMode: $("scriptModelMode")?.value || "fast",
  };
  if (!validateScriptInputs()) {
    return;
  }
  let success = false;
  $("scriptBtn").classList.add("is-loading");
  $("scriptBtn").textContent = "正在生成文案 + 分镜...";
  setScriptLoading(true, payload.modelMode);
  try {
    const data = await api("/api/copy/rewrite", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    applyAiResult(data, "script");
    success = true;
    toast(`${state.activeTemplateCategory} 已生成`);
    switchTab("scriptTab");
  } finally {
    $("scriptBtn").classList.remove("is-loading");
    $("scriptBtn").textContent = "用 DeepSeek 生成文案 + 分镜";
    setScriptLoading(false, payload.modelMode, success);
  }
}

function setScriptLoading(isLoading, mode, success = true) {
  const line = $("scriptLoading");
  const text = $("scriptLoadingText");
  line?.classList.toggle("hidden", !isLoading);
  if (text) {
    text.textContent = mode === "thinking"
      ? "思考模型正在结合档案、人群和内容系列生成，请稍等..."
      : "正在快速生成选题、文案和分镜...";
  }
  if (isLoading) {
    startGenerationProgress("script", mode);
  } else {
    finishGenerationProgress("script", success);
  }
}

function setResearchLoading(isLoading, mode, success = true) {
  const line = $("researchLoading");
  const text = $("researchLoadingText");
  const btn = $("researchBtn");
  if (!line || !btn) return;
  line.classList.toggle("hidden", !isLoading);
  btn.classList.toggle("is-loading", isLoading);
  btn.disabled = isLoading;
  if (text) {
    text.textContent = mode === "thinking"
      ? "思考模型正在深度分析个人定位，请稍等..."
      : "正在快速生成个人调研定位...";
  }
  $("modelBadge").textContent = isLoading ? (mode === "thinking" ? "思考模型生成中..." : "快速模型生成中...") : $("modelBadge").textContent;
  if (isLoading) {
    startGenerationProgress("research", mode);
  } else {
    finishGenerationProgress("research", success);
  }
}

const generationProgressConfig = {
  research: {
    panel: "researchProgress",
    bar: "researchProgressBar",
    percent: "researchProgressPercent",
    step: "researchProgressStep",
    steps: "researchProgressSteps",
    doneText: "调研结果已生成，正在写入档案缓存",
    errorText: "生成中断，请检查必填项或稍后重试",
    fastSteps: ["读取门店档案", "分析人设定位", "生成调研结果", "写入档案缓存"],
    thinkingSteps: ["读取门店档案", "深度分析定位", "校准表达策略", "写入档案缓存"],
  },
  script: {
    panel: "scriptProgressPanel",
    bar: "scriptProgressBar",
    percent: "scriptProgressPercent",
    step: "scriptProgressStep",
    steps: "scriptProgressSteps",
    doneText: "文案和分镜已生成，正在同步到剪辑镜头",
    errorText: "生成中断，请检查档案、人群或稍后重试",
    fastSteps: ["导入调研档案", "生成选题方向", "输出文案内容", "同步分镜缓存"],
    thinkingSteps: ["导入调研档案", "推演内容逻辑", "生成文案分镜", "同步剪辑缓存"],
  },
};

function startGenerationProgress(type, mode = "fast") {
  const config = generationProgressConfig[type];
  if (!config) return;
  clearGenerationProgress(type);
  const panel = $(config.panel);
  const bar = $(config.bar);
  const percent = $(config.percent);
  const step = $(config.step);
  const stepsBox = $(config.steps);
  if (!panel || !bar || !percent || !step || !stepsBox) return;
  const steps = mode === "thinking" ? config.thinkingSteps : config.fastSteps;
  panel.classList.remove("hidden", "is-error");
  stepsBox.innerHTML = steps.map((item, index) => `<span class="progress-step ${index === 0 ? "active" : ""}">${escapeHtml(item)}</span>`).join("");
  let value = mode === "thinking" ? 6 : 12;
  renderGenerationProgress(config, steps, value);
  const speed = mode === "thinking" ? 1150 : 720;
  state.progressTimers[type] = setInterval(() => {
    const ceiling = mode === "thinking" ? 92 : 88;
    const bump = mode === "thinking" ? Math.random() * 8 + 2 : Math.random() * 13 + 4;
    value = Math.min(ceiling, value + bump);
    renderGenerationProgress(config, steps, value);
  }, speed);
}

function renderGenerationProgress(config, steps, value) {
  const bar = $(config.bar);
  const percent = $(config.percent);
  const step = $(config.step);
  const stepsBox = $(config.steps);
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  if (bar) bar.style.width = `${safeValue}%`;
  if (percent) percent.textContent = `${safeValue}%`;
  const activeIndex = Math.min(steps.length - 1, Math.floor((safeValue / 100) * steps.length));
  if (step) step.textContent = steps[activeIndex] || steps[steps.length - 1];
  if (stepsBox) {
    [...stepsBox.querySelectorAll(".progress-step")].forEach((el, index) => {
      el.classList.toggle("done", index < activeIndex);
      el.classList.toggle("active", index === activeIndex);
    });
  }
}

function finishGenerationProgress(type, success = true) {
  const config = generationProgressConfig[type];
  if (!config) return;
  clearGenerationProgress(type);
  const panel = $(config.panel);
  const bar = $(config.bar);
  const percent = $(config.percent);
  const step = $(config.step);
  const stepsBox = $(config.steps);
  if (!panel || panel.classList.contains("hidden")) return;
  panel.classList.toggle("is-error", !success);
  if (bar) bar.style.width = success ? "100%" : "100%";
  if (percent) percent.textContent = success ? "100%" : "失败";
  if (step) step.textContent = success ? config.doneText : config.errorText;
  if (stepsBox) {
    [...stepsBox.querySelectorAll(".progress-step")].forEach((el) => {
      el.classList.toggle("done", success);
      el.classList.remove("active");
    });
  }
  if (success) {
    setTimeout(() => panel.classList.add("hidden"), 900);
  }
}

function clearGenerationProgress(type) {
  if (state.progressTimers[type]) {
    clearInterval(state.progressTimers[type]);
    delete state.progressTimers[type];
  }
}

function startEditProgress() {
  stopEditProgress(false);
  const overlay = $("editProgressOverlay");
  const bar = $("editProgressBar");
  const text = $("editProgressText");
  const steps = Array.from($("editProgressSteps")?.querySelectorAll("em") || []);
  if (!overlay || !bar) return;
  overlay.classList.remove("hidden");
  let value = 8;
  const messages = [
    "正在生成克隆配音，让口播和镜头时间对齐。",
    "正在匹配视频库素材，把分镜转换成画面段落。",
    "正在合成字幕、标题和 BGM。",
    "正在写入成品库存，马上可以预览下载。",
  ];
  const render = () => {
    const safeValue = Math.max(0, Math.min(96, Math.round(value)));
    bar.style.width = `${safeValue}%`;
    const activeIndex = Math.min(steps.length - 1, Math.floor((safeValue / 100) * steps.length));
    if (text) text.textContent = messages[activeIndex] || messages[messages.length - 1];
    steps.forEach((step, index) => {
      step.classList.toggle("done", index < activeIndex);
      step.classList.toggle("active", index === activeIndex);
    });
  };
  render();
  editProgressTimer = setInterval(() => {
    value = Math.min(96, value + Math.random() * 10 + 4);
    render();
  }, 700);
}

function stopEditProgress(success = true) {
  if (editProgressTimer) {
    clearInterval(editProgressTimer);
    editProgressTimer = null;
  }
  const overlay = $("editProgressOverlay");
  const bar = $("editProgressBar");
  const text = $("editProgressText");
  if (!overlay) return;
  if (success) {
    if (bar) bar.style.width = "100%";
    if (text) text.textContent = "成片已生成，正在打开成品库存。";
    Array.from($("editProgressSteps")?.querySelectorAll("em") || []).forEach((step) => {
      step.classList.add("done");
      step.classList.remove("active");
    });
    setTimeout(() => overlay.classList.add("hidden"), 900);
  } else {
    overlay.classList.add("hidden");
    if (bar) bar.style.width = "8%";
    Array.from($("editProgressSteps")?.querySelectorAll("em") || []).forEach((step) => {
      step.classList.remove("done", "active");
    });
  }
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") return item.text || item.prompt || item.content || item.title || "";
      return "";
    }).map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function cleanTopicTitle(value) {
  return String(value || "")
    .replace(/^[-*●\s]*/, "")
    .replace(/^(?:选题\s*)?(?:[一二三四五六七八九十]|\d+)[\.、\):：\s-]*/i, "")
    .replace(/^(?:标题|题目|主选题)[:：]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42);
}

function cleanTopicReason(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^(?:理由|人性点|情绪入口|人群匹配|逻辑)[:：]\s*/, "")
    .trim();
  if (!text) return "结合当前档案生成，适合直接进入文案和分镜。";
  return text.length > 92 ? `${text.slice(0, 92)}...` : text;
}

function parseTopicOptionsFromStrategy(strategy) {
  const lines = String(strategy || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const options = [];
  lines.forEach((line) => {
    if (/^(选题方向|底层判断|推荐采用|调研定位|门店档案|人设档案|模型模式|输出要求)[:：]/.test(line)) return;
    const match = line.match(/^(?:选题\s*)?([一二三四五六七八九十]|\d+)[\.、\):：\s-]+(.+)$/i);
    if (!match) return;
    const body = match[2].trim();
    if (!body || /^(底层判断|推荐采用|调研定位|门店档案|人设档案)/.test(body)) return;
    const titleMatch = body.match(/(?:标题|选题)[:：]\s*([^；;。]+)/);
    const title = cleanTopicTitle(titleMatch ? titleMatch[1] : body.split(/[；;。]/)[0]);
    if (!title) return;
    const reason = cleanTopicReason(body.replace(title, "").replace(/^[；;。:\s]+/, ""));
    options.push({ title, reason });
  });
  return options;
}

function stripSpokenLine(line) {
  return String(line || "")
    .replace(/^[-*●\s]*/, "")
    .replace(/^镜头\s*(?:\d+|[一二三四五六七八九十]+)[:：、. ]*/i, "")
    .replace(/^(?:文案|口播|台词|开头|中段|证明|结尾)[:：]\s*/, "")
    .trim();
}

function splitScriptSentences(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const labeledSpeech = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^(?:文案|口播|台词)[:：]/.test(line))
    .map(stripSpokenLine)
    .filter(Boolean);
  if (labeledSpeech.length >= 3) return labeledSpeech;
  const lineParts = raw.split(/\n+/).map(stripSpokenLine).filter(Boolean);
  if (lineParts.length >= 3) return lineParts;
  return raw
    .replace(/([。！？!?])/g, "$1\n")
    .split(/\n+/)
    .map(stripSpokenLine)
    .filter((line) => line.length >= 6);
}

function inferMaterialLabel(text) {
  if (/口播|老板|真人|讲解|正对镜头/.test(text)) return "口播视频";
  if (/门店|环境|门头|前台|商圈|同城|城市|街区/.test(text)) return "门店环境";
  if (/过程|流程|操作|护理|服务|制作/.test(text)) return "项目过程";
  if (/反馈|案例|顾客|评价|前后|见证/.test(text)) return "顾客反馈";
  if (/产品|团购|套餐|价格|权益|菜单/.test(text)) return "产品/团购图";
  return "口播视频";
}

function buildTopicScript(title, index = 0) {
  const brief = collectBrief();
  const industry = brief.storeIndustry || "本地生活";
  const brand = brief.brandName || "我们店";
  const city = brief.storeCity || "本地";
  const name = brief.personaName || "老板";
  const mainProduct = brief.mainProduct || "主推项目";
  const advantage = brief.serviceAdvantage || "真实、专业、省心";
  if (state.activeTemplateCategory === "同城短视频") {
    return [
      `镜头一：如果你也在${city}。选店别只看价格。`,
      `镜头二：我叫${name}。在${brand}做${industry}。`,
      `镜头三：今天讲${title}。先帮你少踩坑。`,
      `镜头四：先看环境。再看过程。还要看反馈。`,
      `镜头五：刚好在附近。先收藏再慢慢看。`,
    ].join("\n");
  }
  if (state.activeTemplateCategory === "团单短视频") {
    return [
      `镜头一：这个${mainProduct}。不是谁都适合。`,
      `镜头二：先别急着下单。先看你适不适合。`,
      `镜头三：重点不是便宜。是流程要讲清楚。`,
      `镜头四：到店先确认需求。再安排对应服务。`,
      `镜头五：担心买错。可以先私信问我。`,
    ].join("\n");
  }
  return [
    `镜头一：视频没效果。往往不是不会拍。`,
    `镜头二：今天讲${title}。先抓住客户担心。`,
    `镜头三：我叫${name}。在${brand}做${industry}。`,
    `镜头四：优势是${advantage}。但别只喊口号。`,
    `镜头五：先让客户看懂。再让客户咨询。`,
  ].join("\n");
}

function buildTopicShotPrompts(title, index = 0) {
  const brief = collectBrief();
  const brand = brief.brandName || "门店";
  const city = brief.storeCity || "本地";
  const scriptLines = buildTopicScript(title, index).split(/\n+/).map(stripSpokenLine);
  const scenes = [
    `${brief.personaName || "老板"}站在${brand}门口或前台，手机竖屏正对镜头开场，背景能看到门店标识`,
    `切到${city}街区、商圈或门店外景，画面节奏快一点，承接同城感和真实场景`,
    `拍服务流程、项目操作或产品细节特写，动作要清楚，让客户能看懂你在做什么`,
    `切顾客反馈、门店环境、前后对比或案例照片，画面停留 2-3 秒给观众看清楚`,
    `回到老板口播，镜头靠近一点，给出收藏、私信、到店体验或团购领取动作`,
  ];
  return scenes.map((scene, idx) => {
    const material = inferMaterialLabel(scene);
    return `镜头 ${String(idx + 1).padStart(2, "0")}：文案：${scriptLines[idx] || title}；画面：${scene}；素材：${material}`;
  });
}

function normalizeExecutableScript(script, title, index = 0) {
  const lines = splitScriptSentences(script);
  if (lines.length < 3) return buildTopicScript(title, index);
  return lines.slice(0, 6).map((line, idx) => `镜头${topicNumberLabels[idx] || idx + 1}：${line}`).join("\n");
}

function normalizeShotPrompts(prompts, title, index = 0) {
  const scriptLines = buildTopicScript(title, index).split(/\n+/).map(stripSpokenLine);
  return prompts.slice(0, 6).map((line, idx) => {
    const clean = String(line || "").trim();
    if (/文案[:：].+画面[:：]/.test(clean)) return clean;
    return `镜头 ${String(idx + 1).padStart(2, "0")}：文案：${scriptLines[idx] || title}；画面：${clean}；素材：${inferMaterialLabel(clean)}`;
  });
}

function buildFallbackTopicOptions(result = {}) {
  const brief = collectBrief();
  const industry = brief.storeIndustry || "本地生活";
  const brand = brief.brandName || "门店";
  const city = brief.storeCity || "本地";
  const location = brief.storeLocation || city;
  const mainProduct = brief.mainProduct || "主推套餐";
  let base = [];
  if (state.activeTemplateCategory === "同城短视频") {
    base = [
      { title: `${city}下班后，为什么越来越多人想找一家省心的店`, reason: "用城市生活场景圈住附近人群，再自然承接门店信任。" },
      { title: `住在${location}附近，怎么判断一家店靠不靠谱`, reason: "同城用户先关心距离和风险，适合用避坑切口破圈。" },
      { title: `${city}人最近最容易忽略的一次到店消费选择`, reason: "从本地生活习惯切入，不直接硬讲行业，更容易停留。" },
    ];
  } else if (state.activeTemplateCategory === "团单短视频") {
    base = [
      { title: `${mainProduct}到底适合谁，不适合谁`, reason: "先降低决策成本，让用户判断自己该不该买。" },
      { title: `第一次到${brand}使用团单，先看这几个细节`, reason: "把流程讲清楚，减少到店前的不确定感。" },
      { title: `这个套餐为什么不是单纯便宜，而是省心`, reason: "把价格锚点转成价值锚点，适合转化。" },
    ];
  } else {
    base = [
      { title: `很多${industry}视频没效果，不是因为不会拍`, reason: "用反常识切入，先抓停留，再讲真实判断。" },
      { title: `客户不信任你，往往不是价格问题`, reason: "击中老板和客户之间的信任卡点，适合制造共鸣。" },
      { title: `${industry}里最容易让客户踩坑的一件事`, reason: "避坑天然带情绪和收藏动作，适合流量入口。" },
    ];
  }
  const modelTitle = cleanTopicTitle(result.title);
  if (modelTitle && !/脚本|Untitled/i.test(modelTitle) && !base.some((item) => item.title === modelTitle)) {
    base.unshift({ title: modelTitle, reason: "DeepSeek 推荐的主选题，已放在第一位。" });
  }
  return base.slice(0, 3);
}

function normalizeTopicOptions(result = {}) {
  const rawOptions = Array.isArray(result.topicOptions) ? result.topicOptions : [];
  const parsedOptions = rawOptions.map((option) => ({
    title: option?.title || option?.name || option?.topic || option?.heading,
    reason: option?.reason || option?.logic || option?.description || option?.summary || option?.strategy,
    script: option?.script || option?.copy || option?.content,
    shotPrompts: option?.shotPrompts || option?.shots || option?.storyboard,
    tags: option?.tags,
  }));
  const strategyOptions = parseTopicOptionsFromStrategy(result.strategy);
  const seedOptions = [...parsedOptions, ...strategyOptions].filter((option) => cleanTopicTitle(option.title));
  const baseOptions = seedOptions.length ? seedOptions : buildFallbackTopicOptions(result);
  const unique = [];
  baseOptions.forEach((option) => {
    const title = cleanTopicTitle(option.title);
    if (!title || unique.some((item) => item.title === title)) return;
    unique.push({ ...option, title });
  });
  return unique.slice(0, 5).map((option, index) => {
    const title = cleanTopicTitle(option.title) || buildFallbackTopicOptions(result)[index]?.title || `选题${topicNumberLabels[index] || index + 1}`;
    const directScript = option.script || (index === 0 ? result.script : "");
    const rawShotPrompts = normalizeStringList(option.shotPrompts).length
      ? normalizeStringList(option.shotPrompts)
      : (index === 0 ? normalizeStringList(result.shotPrompts) : []);
    return {
      title,
      reason: cleanTopicReason(option.reason),
      script: normalizeExecutableScript(directScript, title, index),
      shotPrompts: rawShotPrompts.length ? normalizeShotPrompts(rawShotPrompts, title, index) : buildTopicShotPrompts(title, index),
      tags: Array.isArray(option.tags) ? option.tags : (Array.isArray(result.tags) ? result.tags : []),
    };
  });
}

function renderTopicIdeas(options) {
  const box = $("scriptTopicIdeas");
  if (!box) return;
  box.value = options.map((option, index) => {
    const label = topicNumberLabels[index] || index + 1;
    return `选题${label}：${option.title}\n理由：${option.reason}`;
  }).join("\n\n");
}

function renderTopicChoiceBar() {
  const bar = $("topicChoiceBar");
  if (!bar) return;
  const options = state.scriptTopicOptions || [];
  bar.classList.toggle("hidden", !options.length);
  if (!options.length) {
    bar.innerHTML = "";
    return;
  }
  bar.innerHTML = `<span>选用</span>${options.map((_, index) => {
    const label = topicNumberLabels[index] || index + 1;
    return `<button type="button" class="topic-choice ${index === state.selectedTopicIndex ? "active" : ""}" data-topic-index="${index}">选题${label}</button>`;
  }).join("")}`;
  bar.querySelectorAll("[data-topic-index]").forEach((btn) => {
    btn.addEventListener("click", () => applySelectedTopic(Number(btn.dataset.topicIndex)));
  });
}

function applySelectedTopic(index = 0, options = {}) {
  const topic = state.scriptTopicOptions[index];
  if (!topic) return;
  const rows = getTopicShotRows(topic);
  state.selectedTopicIndex = index;
  $("resultTitle").value = topic.title;
  $("resultScript").value = formatScriptRows(rows);
  $("resultPrompts").value = formatPromptRows(rows);
  $("resultTags").value = Array.isArray(topic.tags) ? topic.tags.join("、") : "";
  $("ttsText").value = formatVoiceoverRows(rows);
  $("videoTitle").value = topic.title;
  $("videoScript").value = formatVoiceoverRows(rows);
  renderTopicChoiceBar();
  if (!options.silent) {
    toast(`已选用选题${topicNumberLabels[index] || index + 1}`);
  }
  scheduleWorkspaceDraftSave();
}

function getTopicShotRows(topic = {}) {
  const promptRows = normalizeStringList(topic.shotPrompts).map(parseShotLine).filter((row) => row.text || row.visual);
  const scriptRows = String(topic.script || "")
    .split(/\n+/)
    .map((line) => cleanVoiceoverLine(line))
    .filter(Boolean);
  const fallbackPrompts = buildTopicShotPrompts(topic.title || "选题", state.selectedTopicIndex || 0).map(parseShotLine);
  const count = Math.max(promptRows.length, scriptRows.length, 4);
  const rows = Array.from({ length: Math.min(count, 8) }).map((_, index) => {
    const prompt = promptRows[index] || fallbackPrompts[index] || {};
    const promptText = cleanVoiceoverLine(prompt.text || "");
    const text = isInstructionalSpokenText(promptText)
      ? cleanVoiceoverLine(scriptRows[index] || topic.title || "")
      : cleanVoiceoverLine(promptText || scriptRows[index] || topic.title || "");
    const visual = cleanVisualLine(prompt.visual || inferVisual(text, assetTypeLabels[prompt.materialType] || "口播画面"));
    const materialType = prompt.materialType || inferMaterialType(`${text} ${visual}`) || assetOrder[index % assetOrder.length][0];
    const materialLabel = prompt.materialLabel || assetTypeLabels[materialType] || inferMaterialLabel(`${text} ${visual}`);
    return {
      text,
      visual,
      materialType,
      materialLabel,
    };
  }).filter((row) => row.text);
  return expandShotRowsForEditing(rows, 12);
}

function expandShotRowsForEditing(rows, limit = 12) {
  const expanded = [];
  normalizeList(rows).forEach((row) => {
    const segments = splitVoiceoverForShot(row.text);
    if (!segments.length) return;
    segments.forEach((segment, segmentIndex) => {
      expanded.push({
        ...row,
        text: segment,
        visual: segmentIndex === 0
          ? cleanVisualLine(row.visual || inferVisual(segment, row.materialLabel || "口播画面"))
          : continueVisualForSegment(row.visual, row.materialLabel, segmentIndex),
      });
    });
  });
  return expanded.slice(0, limit);
}

function splitVoiceoverForShot(text = "", target = 12, max = 16) {
  const clean = cleanVoiceoverLine(text)
    .replace(/[，,、；;：:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return [];
  const rawParts = clean
    .split(/(?<=[。！？!?])|\s+/)
    .map((part) => part.replace(/[。！？!?]/g, "").trim())
    .filter(Boolean);
  const sourceParts = rawParts.length ? rawParts : [clean];
  const segments = [];
  sourceParts.forEach((part) => {
    splitTextByLength(part, target, max).forEach((segment) => segments.push(segment));
  });
  if (segments.length > 1 && segments[segments.length - 1].length < 5) {
    const tail = segments.pop();
    segments[segments.length - 1] = `${segments[segments.length - 1]}${tail}`;
  }
  return segments;
}

function splitTextByLength(text = "", target = 12, max = 16) {
  const value = String(text || "").trim();
  if (!value) return [];
  if (value.length <= max) return [value];
  const result = [];
  let rest = value;
  while (rest.length > max) {
    let cut = findNaturalCut(rest, target, max);
    if (cut < 6) cut = Math.min(target, rest.length);
    result.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) result.push(rest);
  return result.filter(Boolean);
}

function findNaturalCut(text, target, max) {
  const preferred = ["但是", "所以", "因为", "如果", "然后", "先", "再", "才", "就", "让", "看", "做", "省", "比"];
  for (let i = Math.min(max, text.length - 1); i >= 6; i -= 1) {
    const left = text.slice(Math.max(0, i - 2), i + 2);
    if (preferred.some((word) => left.includes(word)) && Math.abs(i - target) <= 5) return i;
  }
  return Math.min(target, max, text.length);
}

function continueVisualForSegment(visual = "", materialLabel = "", index = 1) {
  const base = cleanVisualLine(visual || materialLabel || "同一场景继续拍");
  if (/近景|特写|细节|动作|切/.test(base)) return base;
  return `${base}，补拍近景或动作细节 ${index + 1}`;
}

function isInstructionalSpokenText(text = "") {
  const value = String(text || "");
  if (!value) return false;
  return /你要|需要|应该|可以|说明|讲解|表达|强调|展示|引导|告诉客户|说出|突出/.test(value) &&
    !/我|我们|你如果|如果你|先看|别急|记住|收藏|私信|到店/.test(value);
}

function formatScriptRows(rows) {
  return rows.map((row, index) => `镜头${index + 1}：${row.text}`).join("\n");
}

function formatVoiceoverRows(rows) {
  return rows.map((row) => row.text).join("\n");
}

function formatPromptRows(rows) {
  return rows.map((row, index) => (
    `镜头 ${String(index + 1).padStart(2, "0")}｜口播：${row.text}｜拍摄：${row.visual}｜素材：${row.materialLabel}`
  )).join("\n");
}

function applyAiResult(data, taskType = "") {
  const r = data.result || {};
  if (taskType === "research" || r.taskType === "research") state.lastResearch = r;
  const activeMode = (taskType === "script" || r.taskType === "script") ? ($("scriptModelMode")?.value || "fast") : ($("modelMode")?.value || "fast");
  const modelLine = `${data.provider || r.provider || "local"} / ${r.mode || activeMode} / ${r.model || "local-template"}`;
  if (taskType === "research" || r.taskType === "research") {
    $("modelBadge").textContent = modelLine;
  }
  if (taskType === "research" || r.taskType === "research" || !$("resultStrategy").value.trim()) {
    $("resultStrategy").value = r.strategy || "";
  }
  if (taskType === "script" || r.taskType === "script" || r.script || r.shotPrompts) {
    state.scriptTopicOptions = normalizeTopicOptions(r);
    state.selectedTopicIndex = 0;
    renderTopicIdeas(state.scriptTopicOptions);
    if ($("scriptDossierState")) $("scriptDossierState").textContent = `已生成 · ${modelLine}`;
    applySelectedTopic(0, { silent: true });
    scheduleWorkspaceDraftSave();
    return;
  }
  renderCockpit();
  scheduleWorkspaceDraftSave();
}

function renderTemplateTabs() {
  const categories = Object.keys(templateLibrary);
  $("templateTabs").innerHTML = categories.map((name) => (
    `<button type="button" class="template-tab ${name === state.activeTemplateCategory ? "active" : ""}" data-category="${escapeHtml(name)}">${escapeHtml(name)}</button>`
  )).join("");
  document.querySelectorAll(".template-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeTemplateCategory = btn.dataset.category;
      renderTemplateTabs();
      renderTemplateSelect();
      updateScriptSeriesFields();
      scheduleWorkspaceDraftSave();
    });
  });
}

function renderTemplateSelect() {
  const list = templateLibrary[state.activeTemplateCategory] || [];
  $("templateSelect").innerHTML = list.map((tpl) => `<option value="${tpl.id}">${escapeHtml(tpl.name)}</option>`).join("");
  renderTemplatePreview();
  updateScriptSeriesFields();
  renderCockpit();
}

function getSelectedTemplate() {
  const list = templateLibrary[state.activeTemplateCategory] || [];
  const id = $("templateSelect")?.value || list[0]?.id;
  return list.find((item) => item.id === id) || list[0] || null;
}

function renderTemplatePreview() {
  const tpl = getSelectedTemplate();
  if (!tpl) {
    $("templatePreview").textContent = "暂无模板";
    return;
  }
  const hints = {
    "流量短视频": "先出能让人停留的选题，再生成文案和分镜。",
    "同城短视频": "先选人群和年龄，再生成同城破圈选题。",
    "团单短视频": "先出套餐转化选题，再生成文案和分镜。"
  };
  $("templatePreview").innerHTML = `<strong>当前系列：${escapeHtml(tpl.name)}</strong><span>${escapeHtml(hints[tpl.name] || "系统会结合档案生成选题、文案和分镜。")}</span>`;
}

function applyTemplateToScript(overwrite = true) {
  const tpl = getSelectedTemplate();
  if (!tpl) return;
  if (overwrite || !$("resultScript").value.trim()) {
    $("resultScript").value = "";
    $("ttsText").value = "";
    $("videoScript").value = "";
  }
  if (!$("resultTitle").value.trim()) {
    $("resultTitle").value = `${state.activeTemplateCategory}脚本`;
    $("videoTitle").value = $("resultTitle").value;
  }
}

function ensureShots() {
  if (!state.shots.length) {
    const builtShots = buildShotsFromInputs();
    state.shots = builtShots.length ? builtShots : getDefaultShots();
  }
  state.shots = state.shots.map(normalizeShot);
}

function normalizeShot(shot, index = 0) {
  const cleanText = cleanVoiceoverLine(shot.text || "");
  const materialType = shot.materialType || inferMaterialType(`${cleanText} ${shot.visual || ""}`) || assetOrder[index % assetOrder.length][0];
  const normalized = {
    ...shot,
    text: cleanText,
    materialType,
    voiceId: shot.voiceId || "",
  };
  normalized.libraryId = resolveShotLibraryId(shot.libraryId, normalized);
  return normalized;
}

function getDefaultShots() {
  return [
    { text: "痛点开场：说出目标客户正在经历的问题", visual: "老板口播或门店环境", materialType: "talking_head" },
    { text: "解释原因：为什么会出现这个问题", visual: "项目过程或知识卡片", materialType: "process" },
    { text: "展示证明：流程、环境、反馈或案例", visual: "门店环境 + 顾客反馈", materialType: "feedback" },
    { text: "行动引导：私信咨询、预约体验或领取团购", visual: "产品图/团购图 + 老板口播", materialType: "product" },
  ].map(normalizeShot);
}

function cleanVoiceoverLine(value = "") {
  return String(value || "")
    .replace(/^\s*[-*●]\s*/, "")
    .replace(/^\s*(?:镜头|分镜|段落|第)?\s*[0-9一二三四五六七八九十]+\s*(?:镜|段)?\s*[:：、.．-]\s*/i, "")
    .replace(/^\s*(?:文案内容|口播文案|文案|口播|台词|说话内容)\s*[:：]\s*/i, "")
    .replace(/[｜|]\s*(?:拍摄|画面|分镜|场景|动作)\s*[:：].*$/i, "")
    .replace(/[；;]\s*(?:拍摄|画面|分镜|场景|动作)\s*[:：].*$/i, "")
    .replace(/[｜|；;]\s*(?:素材|素材分类|视频库)\s*[:：].*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanVisualLine(value = "") {
  return String(value || "")
    .replace(/^\s*(?:画面|拍摄|分镜画面|分镜|场景|动作)\s*[:：]\s*/i, "")
    .replace(/[｜|；;]\s*(?:素材|素材分类|视频库)\s*[:：].*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRenderShots() {
  ensureShots();
  return normalizeList(state.shots)
    .map((shot, index) => {
      const text = cleanVoiceoverLine(shot.text);
      const visual = String(shot.visual || "").trim();
      return normalizeShot({
        ...shot,
        text,
        visual,
        duration: estimateShotDuration(text, index),
      }, index);
    })
    .filter((shot) => shot.text);
}

function estimateShotDuration(text, index = 0) {
  const length = cleanVoiceoverLine(text).length;
  if (!length) return 3;
  const estimated = Math.ceil(length / 5) * 0.95 + 1;
  const adjusted = index === 0 ? estimated + 0.4 : estimated;
  return Math.max(2.4, Math.min(8.5, Number(adjusted.toFixed(1))));
}

function buildVoiceoverText(shots, fallbackScript = "") {
  const lines = normalizeList(shots)
    .map((shot) => cleanVoiceoverLine(shot.text))
    .filter(Boolean);
  if (lines.length) return lines.join("\n");
  return String(fallbackScript || "")
    .split(/\n+/)
    .map(cleanVoiceoverLine)
    .filter(Boolean)
    .join("\n");
}

function buildShotsFromInputs() {
  const promptLines = $("resultPrompts").value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const scriptLines = $("resultScript").value
    .split(/\n+/)
    .map((line) => cleanVoiceoverLine(line.trim()))
    .filter(Boolean);
  const rows = promptLines.length
    ? promptLines.map(parseShotLine)
    : scriptLines.map((text, index) => ({ text, visual: inferVisual(text, assetOrder[index % assetOrder.length][1]) }));
  return expandShotRowsForEditing(rows, 12).map((parsed, index) => {
    const [materialType, label] = assetOrder[index % assetOrder.length];
    const visual = cleanVisualLine(parsed.visual || inferVisual(parsed.text, label));
    const finalMaterialType = parsed.materialType || inferMaterialType(`${parsed.text} ${visual} ${parsed.materialLabel || ""}`) || materialType;
    return {
      text: cleanVoiceoverLine(parsed.text),
      visual,
      materialType: finalMaterialType,
      libraryId: inferAssetLibraryIdForShot({
        text: parsed.text,
        visual,
        materialType: finalMaterialType,
      }),
    };
  }).filter((shot) => shot.text);
}

function parseShotLine(line) {
  const raw = String(line || "").replace(/^[-*●\s]*/, "").trim();
  const textMatch = raw.match(/(?:口播文案|文案内容|文案|口播|台词)[:：]\s*([^|｜；;]+)/);
  const visualMatch = raw.match(/(?:分镜画面|拍摄指导|拍摄|画面|分镜|场景|动作)[:：]\s*([^|｜；;]+)/);
  const materialMatch = raw.match(/(?:素材分类|需要素材|素材|视频库)[:：]\s*([^|｜；;]+)/);
  const text = cleanVoiceoverLine(textMatch ? textMatch[1] : raw);
  const visual = cleanVisualLine(visualMatch ? visualMatch[1] : "");
  const materialLabel = (materialMatch ? materialMatch[1] : "").trim() || inferMaterialLabel(`${text} ${visual}`);
  const materialSource = `${visual} ${materialLabel} ${raw}`;
  const materialType = inferMaterialType(materialSource);
  return { text, visual, materialType, materialLabel };
}

function splitScriptToShots() {
  if (!$("resultScript").value.trim() && !$("resultPrompts").value.trim()) {
    toast("请先用 DeepSeek 生成文案和分镜，再导入剪辑镜头");
    return false;
  }
  const builtShots = buildShotsFromInputs();
  state.shots = builtShots.length ? builtShots : getDefaultShots();
  renderShotTable();
  renderMixPlan();
  renderCockpit();
  scheduleWorkspaceDraftSave();
  return true;
}

function inferVisual(line, fallbackLabel) {
  if (/口播|老板|讲|解释/.test(line)) return "老板口播 / 数字人口播";
  if (/门店|环境|到店|空间/.test(line)) return "门店环境镜头";
  if (/过程|流程|操作|项目/.test(line)) return "项目过程特写";
  if (/反馈|案例|顾客|前后/.test(line)) return "顾客反馈或案例证明";
  if (/团购|产品|套餐|价格/.test(line)) return "产品/团购权益画面";
  return fallbackLabel;
}

function inferMaterialType(text) {
  if (/口播|老板|真人|讲解|解释/.test(text)) return "talking_head";
  if (/门店|环境|门头|前台|商圈|同城|到店|空间/.test(text)) return "scene";
  if (/过程|流程|操作|护理|服务|项目/.test(text)) return "process";
  if (/反馈|案例|顾客|评价|前后/.test(text)) return "feedback";
  if (/团购|产品|套餐|价格|券/.test(text)) return "product";
  return "";
}

function getEditableAssetGroups() {
  return normalizeList(state.assetGroups).length ? normalizeList(state.assetGroups) : [...defaultAssetGroups];
}

function resolveShotLibraryId(preferredId, shot = {}) {
  const groups = getEditableAssetGroups();
  if (preferredId && groups.some((group) => group.id === preferredId)) return preferredId;
  const inferred = inferAssetLibraryIdForShot(shot);
  if (inferred && groups.some((group) => group.id === inferred)) return inferred;
  return groups[0]?.id || "ungrouped";
}

function inferAssetLibraryIdForShot(shot = {}) {
  const groups = getEditableAssetGroups();
  if (!groups.length) return "ungrouped";
  const source = `${shot.text || ""} ${shot.visual || ""} ${assetTypeLabels[shot.materialType] || ""}`.toLowerCase();
  const assetsByLibrary = groupAssetsByLibrary(state.assets);
  let best = { id: "ungrouped", score: -1 };
  groups.forEach((group) => {
    const name = String(group.name || "").toLowerCase();
    const assets = assetsByLibrary[group.id] || [];
    let score = 0;
    if (name && source.includes(name)) score += 30;
    name.split(/[\s/_\-、，,]+/).filter(Boolean).forEach((part) => {
      if (part.length >= 2 && source.includes(part)) score += 8;
    });
    const sameTypeAssets = assets.filter((asset) => asset.type === shot.materialType);
    if (sameTypeAssets.length) score += 6;
    assets.slice(0, 10).forEach((asset) => {
      const assetName = String(asset.name || "").toLowerCase();
      if (assetName && source.includes(assetName)) score += 4;
    });
    if (score > best.score) best = { id: group.id, score };
  });
  return best.id || groups[0]?.id || "ungrouped";
}

function addShot() {
  state.shots.push({
    text: "新镜头：补充这里要说的内容",
    visual: "选择适合的画面",
    materialType: "talking_head",
    libraryId: "ungrouped",
    voiceId: "",
  });
  renderShotTable();
  renderMixPlan();
  renderCockpit();
  scheduleWorkspaceDraftSave();
}

function removeShot(index) {
  if (!state.shots[index]) return;
  if (state.shots.length <= 1) {
    toast("至少保留一个镜头");
    return;
  }
  state.shots.splice(index, 1);
  renderShotTable();
  renderMixPlan();
  renderCockpit();
  scheduleWorkspaceDraftSave();
}

function autoMatchShots() {
  state.shots = state.shots.map((shot, index) => {
    const text = `${shot.text} ${shot.visual}`;
    const materialType = inferMaterialType(text) || assetOrder[index % assetOrder.length][0];
    return normalizeShot({ ...shot, materialType, libraryId: inferAssetLibraryIdForShot({ ...shot, materialType }) }, index);
  });
  renderShotTable();
  renderMixPlan();
  renderCockpit();
  toast("已按镜头内容重新匹配视频库");
}

function clearShotTableView() {
  const body = $("shotTableBody");
  if (body) {
    body.innerHTML = `<tr><td colspan="4" class="meta">还没有导入镜头。请先在脚本页生成文案和分镜，再点击“导入剪辑镜头”。</td></tr>`;
  }
  if ($("shotCountLabel")) $("shotCountLabel").textContent = "0 个";
  const mixPlan = $("mixPlan");
  if (mixPlan) mixPlan.innerHTML = "";
  renderTitleRecommendation();
}

function renderShotTable() {
  const body = $("shotTableBody");
  if (!body) return;
  ensureShots();
  if ($("shotCountLabel")) $("shotCountLabel").textContent = `${state.shots.length} 个`;
  body.innerHTML = state.shots.map((shot, index) => `
    <tr>
      <td>
        <span class="shot-index">镜头 ${index + 1}</span>
        <button class="shot-delete-btn" type="button" data-shot-action="delete" data-shot="${index}">删除</button>
      </td>
      <td><textarea data-shot="${index}" data-field="text">${escapeHtml(shot.text)}</textarea></td>
      <td><textarea data-shot="${index}" data-field="visual">${escapeHtml(shot.visual)}</textarea></td>
      <td>
        <select class="shot-material-select" data-shot="${index}" data-field="libraryId">
          ${buildShotLibraryOptions(shot.libraryId || "ungrouped")}
        </select>
        <div class="meta shot-material-note">${escapeHtml(getAssetMatchLabel(shot.libraryId, shot.materialType))}</div>
      </td>
    </tr>
  `).join("");
  body.querySelectorAll("[data-field][data-shot]").forEach((el) => {
    el.addEventListener("input", updateShotFromInput);
    el.addEventListener("change", updateShotFromInput);
  });
  body.querySelectorAll("[data-shot-action='delete']").forEach((btn) => {
    btn.addEventListener("click", () => removeShot(Number(btn.dataset.shot)));
  });
  renderTitleRecommendation();
}

function updateShotFromInput(event) {
  const index = Number(event.target.dataset.shot);
  const field = event.target.dataset.field;
  if (!state.shots[index] || !field) return;
  state.shots[index][field] = event.target.value;
  if (field === "text" || field === "visual") {
    state.shots[index].materialType = inferMaterialType(`${state.shots[index].text} ${state.shots[index].visual}`) || state.shots[index].materialType;
  }
  renderMixPlan();
  renderCockpit();
  renderTitleRecommendation();
  scheduleWorkspaceDraftSave();
}

function buildShotLibraryOptions(selected = "ungrouped") {
  const groups = getEditableAssetGroups();
  return groups.map((group) => {
    const count = getAssetsByGroup(group.id).length;
    return `<option value="${escapeHtml(group.id)}" ${selected === group.id ? "selected" : ""}>${escapeHtml(group.name)}（${count}）</option>`;
  }).join("");
}

function getAssetMatchLabel(libraryId, materialType) {
  const assets = getAssetsByGroup(libraryId);
  const libraryName = getAssetGroupName(libraryId);
  if (!assets.length) return `「${libraryName}」暂无素材，生成时会使用占位混剪`;
  const preferred = assets.filter((asset) => asset.type === materialType);
  if (preferred.length) {
    return `从「${libraryName}」匹配 ${preferred.length} 个${assetTypeLabels[materialType] || "素材"}：${preferred.slice(0, 2).map((a) => a.name).join("、")}`;
  }
  return `「${libraryName}」有 ${assets.length} 个素材，生成时会智能轮换`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readMediaDuration(file) {
  return new Promise((resolve) => {
    const media = document.createElement(file.type?.startsWith("audio/") ? "audio" : "video");
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const duration = Number(media.duration || 0);
      cleanup();
      resolve(Number.isFinite(duration) && duration > 0 ? duration : 0);
    };
    media.onerror = () => {
      cleanup();
      resolve(0);
    };
    media.src = url;
  });
}

function isVoiceSampleUploadType(type) {
  return ["voice_sample", "audio"].includes(type);
}

async function uploadAssetThroughOss(file, libraryId, button, duration = 0) {
  const sign = await api("/api/oss/upload-url", {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      type: $("assetType").value || "video",
      libraryId,
      duration,
    }),
  });
  if (!sign.uploadUrl || !sign.objectKey) {
    throw new Error("OSS 上传签名生成失败");
  }
  if (button) button.textContent = "上传到 OSS...";
  const uploadHeaders = {
    "Content-Type": file.type || "application/octet-stream",
    ...(sign.headers || {}),
  };
  const uploadRes = await fetch(sign.uploadUrl, {
    method: sign.method || "PUT",
    headers: uploadHeaders,
    body: file,
  });
  if (!uploadRes.ok) {
    throw new Error(`OSS 上传失败：${uploadRes.status}`);
  }
  const assetData = await api("/api/assets", {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      type: $("assetType").value || "video",
      libraryId,
      size: file.size,
      duration,
      objectKey: sign.objectKey,
      url: sign.downloadUrl || sign.publicUrl || "",
    }),
  });
  return assetData.asset;
}

async function loadAssetGroups() {
  try {
    const data = await api("/api/asset-groups");
    state.assetGroups = normalizeList(data.groups);
    if (!state.assetGroups.length) state.assetGroups = [...defaultAssetGroups];
    if (state.activeAssetGroupId !== "all" && !state.assetGroups.some((group) => group.id === state.activeAssetGroupId)) {
      state.activeAssetGroupId = "all";
      localStorage.setItem("aivf_active_asset_group", state.activeAssetGroupId);
    }
  } catch (err) {
    if (!state.assetGroups.length) state.assetGroups = [...defaultAssetGroups];
    throw err;
  } finally {
    renderAssetLibrary();
    if (state.shots.length) {
      renderShotTable();
      renderMixPlan();
    }
  }
}

function getAssetLibraryId(asset) {
  const id = asset?.libraryId || asset?.groupId || "ungrouped";
  return state.assetGroups.some((group) => group.id === id) ? id : "ungrouped";
}

function getAssetGroupName(groupId) {
  if (groupId === "all") return "全部素材";
  const group = state.assetGroups.find((item) => item.id === groupId);
  return group?.name || "未分组";
}

function getUsedAssetBytes() {
  return normalizeList(state.assets).reduce((sum, asset) => sum + (Number(asset.size) || 0), 0);
}

function getAssetsByGroup(groupId) {
  const assets = normalizeList(state.assets);
  if (groupId === "all") return assets;
  return assets.filter((asset) => getAssetLibraryId(asset) === groupId);
}

function setActiveAssetGroup(groupId) {
  const exists = groupId === "all" || state.assetGroups.some((group) => group.id === groupId);
  state.activeAssetGroupId = exists ? groupId : "all";
  localStorage.setItem("aivf_active_asset_group", state.activeAssetGroupId);
  renderAssetLibrary();
}

function openAssetGroupModal(groupId) {
  setActiveAssetGroup(groupId);
  state.assetModalOpen = true;
  renderAssetModal();
}

function closeAssetGroupModal() {
  state.assetModalOpen = false;
  renderAssetModal();
}

function isAssetSelected(assetId) {
  return normalizeList(state.selectedLibraryAssetIds).includes(assetId);
}

function toggleLibraryAssetSelection(assetId) {
  const selected = new Set(normalizeList(state.selectedLibraryAssetIds));
  if (selected.has(assetId)) {
    selected.delete(assetId);
  } else {
    selected.add(assetId);
  }
  state.selectedLibraryAssetIds = Array.from(selected);
  localStorage.setItem("aivf_selected_library_assets", JSON.stringify(state.selectedLibraryAssetIds));
  renderAssetModal();
}

async function deleteAsset(assetId) {
  const asset = normalizeList(state.assets).find((item) => item.id === assetId);
  if (!asset) {
    toast("这个素材不存在或已被删除");
    return;
  }
  if (!window.confirm(`确定删除素材：${asset.name || "未命名素材"}？`)) return;
  await api("/api/assets/delete", {
    method: "POST",
    body: JSON.stringify({ assetId }),
  });
  state.selectedLibraryAssetIds = normalizeList(state.selectedLibraryAssetIds).filter((id) => id !== assetId);
  localStorage.setItem("aivf_selected_library_assets", JSON.stringify(state.selectedLibraryAssetIds));
  toast("素材已删除");
  await loadAssets();
  renderShotTable();
  renderMixPlan();
}

async function createAssetGroup() {
  const name = window.prompt("输入新视频库名称，例如：暑期活动、老客见证、爆款套餐");
  const clean = (name || "").trim();
  if (!clean) return;
  if (state.assetGroups.some((group) => group.name === clean)) {
    toast("这个视频库已经存在");
    return;
  }
  const data = await api("/api/asset-groups", {
    method: "POST",
    body: JSON.stringify({ name: clean }),
  });
  state.assetGroups = normalizeList(data.groups);
  setActiveAssetGroup(data.group?.id || "all");
  toast(`已创建视频库：${clean}`);
}

function renderAssetQuota() {
  const used = getUsedAssetBytes();
  const ratio = Math.min(100, Math.round((used / assetQuotaBytes) * 100));
  if ($("assetQuotaText")) $("assetQuotaText").textContent = `${formatSize(used)} / ${formatSize(assetQuotaBytes)}`;
  if ($("assetQuotaBar")) $("assetQuotaBar").style.width = `${ratio}%`;
  if ($("assetQuotaHint")) {
    $("assetQuotaHint").textContent = ratio >= 90
      ? "容量快满了，建议清理无用素材或准备扩容。"
      : "内部体验版先限制 5GB，后续对外版可按账号扩容。";
  }
}

function renderAssetGroupSelect() {
  const select = $("assetLibrarySelect");
  if (!select) return;
  const activeExists = state.assetGroups.some((group) => group.id === state.activeAssetGroupId);
  const preferred = activeExists ? state.activeAssetGroupId : "ungrouped";
  select.innerHTML = state.assetGroups.map((group) => (
    `<option value="${escapeHtml(group.id)}" ${preferred === group.id ? "selected" : ""}>${escapeHtml(group.name)}</option>`
  )).join("");
}

function renderAssetLibrary() {
  renderAssetQuota();
  renderAssetGroupSelect();
  const grid = $("assetGroupGrid");
  if (grid) {
    const cards = [
      { id: "all", name: "全部素材", locked: true },
      ...state.assetGroups,
    ].map((group) => {
      const assets = getAssetsByGroup(group.id);
      const size = assets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0);
      const active = state.activeAssetGroupId === group.id ? "active" : "";
      const thumbs = assets.slice(0, 3).map(() => `<span class="library-thumb"></span>`).join("");
      return `<button class="asset-group-card ${active}" data-asset-group-id="${escapeHtml(group.id)}" type="button">
        <div class="asset-group-name">${escapeHtml(group.name)}</div>
        <div class="asset-group-preview">${thumbs || `<span class="empty-film">▥</span>`}</div>
        <div class="asset-group-meta">
          <strong>${assets.length}</strong><span>个素材</span><em>${formatSize(size)}</em>
        </div>
        <span class="asset-group-action">点击管理 / 添加</span>
      </button>`;
    });
    grid.innerHTML = cards.join("");
  }
  renderAssetModal();
}

function renderAssetModal() {
  const modal = $("assetGroupModal");
  if (!modal) return;
  modal.classList.toggle("hidden", !state.assetModalOpen);
  modal.setAttribute("aria-hidden", String(!state.assetModalOpen));
  if (!state.assetModalOpen) return;
  renderAssetGroupSelect();
  const currentAssets = getAssetsByGroup(state.activeAssetGroupId);
  const currentSize = currentAssets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0);
  if ($("assetModalTitle")) $("assetModalTitle").textContent = getAssetGroupName(state.activeAssetGroupId);
  if ($("assetModalMeta")) $("assetModalMeta").textContent = `${currentAssets.length} 个素材 · ${formatSize(currentSize)}`;
  if ($("assetUploadHint")) {
    $("assetUploadHint").textContent = state.activeAssetGroupId === "all"
      ? "当前查看全部素材；上传时请选择具体视频库。"
      : `素材会直接进入「${getAssetGroupName(state.activeAssetGroupId)}」。`;
  }
  const list = $("assetList");
  if (list) {
    list.innerHTML = currentAssets.map(assetCard).join("") || `<div class="library-empty">这个视频库还没有素材。直接在上面选择文件上传。</div>`;
  }
}

async function uploadAsset() {
  if (staticPreviewMode) {
    toast(staticPreviewMessage);
    return;
  }
  const file = $("assetFile").files[0];
  if (!file) {
    toast("先选择文件");
    return;
  }
  if (getUsedAssetBytes() + file.size > assetQuotaBytes) {
    toast(`素材库容量不足：当前限制 ${formatSize(assetQuotaBytes)}`);
    return;
  }
  const assetType = $("assetType").value || "video";
  const duration = isVoiceSampleUploadType(assetType) ? await readMediaDuration(file) : 0;
  if (isVoiceSampleUploadType(assetType) && duration > voiceSampleMaxSeconds) {
    toast(`声音样本请控制在 ${voiceSampleMaxSeconds} 秒以内，当前约 ${Math.ceil(duration)} 秒`);
    return;
  }
  const libraryId = $("assetLibrarySelect")?.value || "ungrouped";
  const button = $("uploadAssetBtn");
  const oldText = button?.textContent || "";
  if (file.size >= 50 * 1024 * 1024) {
    toast(`正在上传 ${formatSize(file.size)}，请不要关闭页面`);
  }
  if (button) {
    button.disabled = true;
    button.textContent = `上传中 ${formatSize(file.size)}`;
  }
  try {
    if (configuredApiBaseUrl) {
      await uploadAssetThroughOss(file, libraryId, button, duration);
      $("assetFile").value = "";
      state.activeAssetGroupId = libraryId;
      localStorage.setItem("aivf_active_asset_group", state.activeAssetGroupId);
      toast("素材已上传到 OSS");
      await loadAssets();
      return;
    }
    const headers = {
      "X-Asset-Name": encodeURIComponent(file.name),
      "X-Asset-Type": encodeURIComponent(assetType),
      "X-Library-Id": encodeURIComponent(libraryId),
    };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch("/api/assets/upload", {
      method: "POST",
      headers,
      body: file,
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `上传失败：${res.status}`);
    }
    $("assetFile").value = "";
    state.activeAssetGroupId = libraryId;
    localStorage.setItem("aivf_active_asset_group", state.activeAssetGroupId);
    toast("素材已上传到素材库");
    await loadAssets();
    if (state.shots.length) {
      renderShotTable();
      renderMixPlan();
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = oldText || "上传到当前视频库";
    }
  }
}

async function loadAssets() {
  const data = await api("/api/assets");
  state.assets = normalizeList(data.assets);
  if ($("assetCount")) $("assetCount").textContent = state.assets.length;
  renderAssetLibrary();
  renderAssetOptions();
  if (state.shots.length) {
    renderEditorMaterialNotice();
    renderCockpit();
  }
}

function assetCard(a) {
  const label = assetTypeLabels[a.type] || a.type || "-";
  const groupName = getAssetGroupName(getAssetLibraryId(a));
  const selected = isAssetSelected(a.id);
  return `<div class="library-asset-row ${selected ? "selected" : ""}">
    <div>
      <div class="card-title">${escapeHtml(a.name || "未命名素材")}</div>
      <div class="meta">视频库：${escapeHtml(groupName)} · 用途：${escapeHtml(label)}</div>
      <div class="meta">大小：${formatSize(a.size)} · 时间：${escapeHtml(a.createdAt || "-")}</div>
    </div>
    <div class="asset-row-actions">
      <button class="secondary tiny-btn" type="button" data-select-asset-id="${escapeHtml(a.id)}">${selected ? "已选择" : "选择"}</button>
      <a class="secondary tiny-btn" href="${a.url}" target="_blank">打开</a>
      <button class="danger tiny-btn" type="button" data-delete-asset-id="${escapeHtml(a.id)}">删除</button>
    </div>
  </div>`;
  scheduleWorkspaceDraftSave();
}

function renderAssetOptions() {
  const sampleTypes = ["voice_sample", "audio"];
  const audioAssets = normalizeList(state.assets).filter((a) => sampleTypes.includes(a.type));
  if ($("voiceSampleSelect")) {
    if (!audioAssets.length) {
      $("voiceSampleSelect").innerHTML = `<option value="">先上传 45 秒以内声音样本</option>`;
      return;
    }
    $("voiceSampleSelect").innerHTML = audioAssets.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("") || `<option value="">先上传声音样本或口播视频</option>`;
  }
}

function getVoiceCloneErrorMessage(error) {
  const message = String(error?.message || error || "");
  if (/file too large|too large|413/i.test(message)) {
    return `声音样本太长或文件太大，请上传 ${voiceSampleMaxSeconds} 秒以内的清晰人声小音频`;
  }
  if (/fetch failed|network|Failed to fetch/i.test(message)) {
    return "声音克隆接口连接失败，请稍后再试";
  }
  return message || "声音克隆失败，请重新上传清晰声音样本";
}

async function createVoice() {
  const name = $("voiceName").value.trim();
  if (!name) {
    toast("填写声音名称");
    return;
  }
  const consent = $("voiceConsent").checked;
  const sampleAssetId = $("voiceSampleSelect").value;
  const sampleAsset = normalizeList(state.assets).find((asset) => asset.id === sampleAssetId);
  if (sampleAsset?.duration && Number(sampleAsset.duration) > voiceSampleMaxSeconds) {
    toast(`声音样本请控制在 ${voiceSampleMaxSeconds} 秒以内，当前约 ${Math.ceil(Number(sampleAsset.duration))} 秒`);
    return;
  }
  if (!sampleAssetId) {
    toast("先选择声音样本");
    return;
  }
  const btn = $("createVoiceBtn");
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "声音克隆中...";
  try {
    const data = await api("/api/voices/clone", {
      method: "POST",
      body: JSON.stringify({ name, consent, sampleAssetId }),
    });
    if (data.voice?.status !== "ready") {
      throw new Error("声音克隆失败：请重新上传清晰声音样本");
    }
    $("voiceName").value = "";
    $("voiceConsent").checked = false;
    toast(`声音克隆已完成：${data.voice.name}`);
    await loadVoices();
  } catch (error) {
    toast(getVoiceCloneErrorMessage(error));
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

async function deleteVoice(voiceId) {
  const voice = normalizeList(state.voices).find((item) => item.id === voiceId);
  if (!voice) {
    toast("这个声音不存在或已被删除");
    return;
  }
  if (!window.confirm(`确定删除声音：${voice.name || "未命名声音"}？`)) return;
  await api("/api/voices/delete", {
    method: "POST",
    body: JSON.stringify({ voiceId }),
  });
  toast("声音已删除");
  await loadVoices();
}

async function loadVoices() {
  const data = await api("/api/voices");
  state.voices = normalizeList(data.voices);
  if ($("voiceCount")) $("voiceCount").textContent = state.voices.length;
  renderVoiceOptions();
  renderShotTable();
  renderEditorMaterialNotice();
}

function buildGlobalVoiceOptions(selected = "") {
  const voices = normalizeList(state.voices);
  const localSelected = selected ? "" : "selected";
  const options = [`<option value="" ${localSelected}>默认本地声音</option>`];
  voices.forEach((v, index) => {
    options.push(`<option value="${escapeHtml(v.id)}" ${selected === v.id ? "selected" : ""}>${escapeHtml(getVoiceDisplayName(v, index))}</option>`);
  });
  return options.join("");
}

function buildShotVoiceOptions(selected = "") {
  const voices = normalizeList(state.voices);
  const defaultSelected = selected ? "" : "selected";
  const options = [`<option value="" ${defaultSelected}>跟随全片声音</option>`];
  voices.forEach((v, index) => {
    options.push(`<option value="${escapeHtml(v.id)}" ${selected === v.id ? "selected" : ""}>${escapeHtml(getVoiceDisplayName(v, index))}</option>`);
  });
  return options.join("");
}

function getShotVoiceLabel(voiceId) {
  if (!voiceId) return "默认跟随全片声音";
  const voices = normalizeList(state.voices);
  const voiceIndex = voices.findIndex((v) => v.id === voiceId);
  const voice = voices[voiceIndex];
  if (!voice) return "该声音档案不存在";
  return `${getVoiceDisplayName(voice, voiceIndex)} · 可用`;
}

function getControlValue(primaryId, fallbackId, fallbackValue = "") {
  const primary = $(primaryId);
  if (primary && primary.value !== undefined) return primary.value;
  const fallback = $(fallbackId);
  if (fallback && fallback.value !== undefined) return fallback.value;
  return fallbackValue;
}

function getSelectedVoiceId() {
  return getControlValue("editorVoiceSelect", "ttsVoiceSelect", "");
}

function normalizeVoiceSpeed(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(1.5, Math.max(0.8, Math.round(parsed * 10) / 10));
}

function formatVoiceSpeed(value) {
  return `${normalizeVoiceSpeed(value).toFixed(1)}x`;
}

function getSelectedVoiceSpeed() {
  return normalizeVoiceSpeed(getControlValue("editorVoiceSpeed", "voiceSpeed", "1.0"));
}

function updateVoiceSpeedLabels() {
  const speed = getSelectedVoiceSpeed();
  if ($("editorVoiceSpeedValue")) $("editorVoiceSpeedValue").textContent = formatVoiceSpeed(speed);
  if ($("voiceSpeedValue")) $("voiceSpeedValue").textContent = formatVoiceSpeed(speed);
}

function syncPairedSelects(primaryId, fallbackId) {
  const primary = $(primaryId);
  const fallback = $(fallbackId);
  if (!primary || !fallback) return;
  const sync = (from, to) => {
    if (to.value !== from.value) to.value = from.value;
  };
  primary.addEventListener("change", () => {
    sync(primary, fallback);
    updateTitleTemplateHints();
  });
  fallback.addEventListener("change", () => {
    sync(fallback, primary);
    updateTitleTemplateHints();
  });
}

function syncPairedRanges(primaryId, fallbackId) {
  const primary = $(primaryId);
  const fallback = $(fallbackId);
  if (!primary || !fallback) return;
  const sync = (from, to) => {
    const value = normalizeVoiceSpeed(from.value).toFixed(1);
    if (from.value !== value) from.value = value;
    if (to.value !== value) to.value = value;
    updateVoiceSpeedLabels();
    scheduleWorkspaceDraftSave();
  };
  ["input", "change"].forEach((eventName) => {
    primary.addEventListener(eventName, () => sync(primary, fallback));
    fallback.addEventListener(eventName, () => sync(fallback, primary));
  });
  sync(primary, fallback);
}

function getTitleTemplateHint(style) {
  return titleTemplateLibrary[style] || titleTemplateLibrary["智能推荐样式"];
}

function getRecommendedTitleStyle() {
  const source = [
    state.activeTemplateCategory,
    $("resultTitle")?.value,
    $("resultScript")?.value,
    $("resultPrompts")?.value,
    $("videoTitle")?.value,
    $("videoScript")?.value,
    ...normalizeList(state.shots).flatMap((shot) => [shot.text, shot.visual]),
  ].join(" ");
  if (!source.trim()) return "智能推荐样式";
  if (/团购|团单|套餐|价格|优惠|福利|到店|下单|购买|领取/.test(source) || state.activeTemplateCategory === "团单短视频") {
    return "团购成交标题";
  }
  if (/同城|附近|城市|广州|深圳|佛山|商圈|下班|天气|周末|本地|门店|到店/.test(source) || state.activeTemplateCategory === "同城短视频") {
    return "同城场景标题";
  }
  if (/避坑|踩坑|别再|不要|第一次|新手|注意|真相|套路/.test(source)) {
    return "避坑提醒标题";
  }
  if (/为什么|凭什么|没想到|竟然|反差|普通|但是|原来/.test(source)) {
    return "反差悬念标题";
  }
  if (/[三3]个|[四4]个|[五5]个|清单|标准|步骤|方法/.test(source)) {
    return "数字清单标题";
  }
  if (/真实|测评|体验|反馈|案例|对比|前后/.test(source)) {
    return "真实测评标题";
  }
  if (/效果|结果|改善|变好|解决|提升/.test(source)) {
    return "结果承诺标题";
  }
  return "痛点钩子标题";
}

function getTitleRecommendationReason(style) {
  const map = {
    "智能推荐样式": "导入脚本后自动判断标题方向。",
    "痛点钩子标题": "当前文案主要在讲客户卡点，先用痛点抓停留。",
    "反差悬念标题": "当前内容有反差或解释逻辑，用悬念更容易让人看完。",
    "数字清单标题": "当前内容适合拆成步骤或标准，数字标题更利于收藏。",
    "同城场景标题": "当前内容带城市、门店或附近场景，用同城切口更容易圈附近人。",
    "避坑提醒标题": "当前内容有提醒和教育属性，用避坑标题更容易建立信任。",
    "结果承诺标题": "当前内容更偏结果表达，用结果标题能降低理解成本。",
    "真实测评标题": "当前内容偏体验、案例或反馈，用真实测评标题更自然。",
    "团购成交标题": "当前内容带套餐、福利或到店转化，用成交标题更适合收口。",
  };
  return map[style] || map["智能推荐样式"];
}

function renderTitleRecommendation() {
  const style = getRecommendedTitleStyle();
  if ($("editorRecommendedTitleStyle")) $("editorRecommendedTitleStyle").textContent = style === "智能推荐样式" ? "等待脚本内容" : `推荐：${style}`;
  if ($("editorTitleTemplateHint")) {
    $("editorTitleTemplateHint").textContent = `${getTitleRecommendationReason(style)} ${getTitleTemplateHint(style)}`;
  }
  return style;
}

function updateTitleTemplateHints() {
  const scriptStyle = getControlValue("scriptTitleStyle", "editorTitleStyle", "智能推荐样式");
  const exportStyle = getControlValue("titleStyle", "editorTitleStyle", "智能推荐样式");
  if ($("scriptTitleTemplateHint")) $("scriptTitleTemplateHint").textContent = getTitleTemplateHint(scriptStyle);
  renderTitleRecommendation();
  if ($("titleTemplateHint")) $("titleTemplateHint").textContent = getTitleTemplateHint(exportStyle);
}

function renderVoiceOptions() {
  const selected = $("editorVoiceSelect")?.value || $("ttsVoiceSelect")?.value || "";
  const html = buildGlobalVoiceOptions(selected);
  if ($("ttsVoiceSelect")) $("ttsVoiceSelect").innerHTML = html;
  if ($("editorVoiceSelect")) $("editorVoiceSelect").innerHTML = html;
  renderVoiceList();
}

function getVoiceStatusLabel(status) {
  const map = {
    ready: "可用",
    api_pending: "待配置 API",
    api_failed: "克隆失败",
  };
  return map[status] || status || "待接入";
}

function getVoiceDisplayName(voice, index = 0) {
  return `声音项目 ${index + 1}`;
}

function renderVoiceList() {
  const box = $("voiceList");
  if (!box) return;
  const voices = normalizeList(state.voices);
  if (!voices.length) {
    box.innerHTML = `<div class="voice-item muted">还没有可用声音</div>`;
    return;
  }
  box.innerHTML = voices.map((voice, index) => {
    const displayName = getVoiceDisplayName(voice, index);
    return `<div class="voice-item ${voice.status === "ready" ? "ready" : ""}">
      <div>
        <strong>${escapeHtml(displayName)}</strong>
        <span>可用 · 可用于剪辑配音</span>
      </div>
      <button class="danger tiny-btn" type="button" data-delete-voice-id="${escapeHtml(voice.id)}">删除</button>
    </div>`;
  }).join("");
}

function renderMixPlan() {
  const container = $("mixPlan");
  if (!container) {
    renderEditorMaterialNotice();
    return;
  }
  if (!state.shots.length) {
    container.innerHTML = "";
    return;
  }
  ensureShots();
  const rows = state.shots.slice(0, 8).map((shot, index) => {
    const libraryId = resolveShotLibraryId(shot.libraryId, shot);
    const assets = getAssetsByGroup(libraryId);
    const preferred = assets.filter((asset) => asset.type === shot.materialType);
    const asset = preferred[0] || assets[0];
    const assetLabel = asset
      ? `${getAssetGroupName(libraryId)}：${asset.name}`
      : `${getAssetGroupName(libraryId)}：待上传`;
    return `<div class="timeline-item">
      <strong>镜头 ${index + 1}</strong>
      <div>
        <div>${escapeHtml(shot.text)}</div>
        <div class="meta">画面：${escapeHtml(shot.visual)}</div>
        <div class="meta">视频库素材：${escapeHtml(assetLabel)}</div>
      </div>
    </div>`;
  });
  container.innerHTML = rows.join("");
  renderEditorMaterialNotice();
}

function renderEditorMaterialNotice() {
  const notice = $("editorMaterialNotice");
  if (!notice) return;
  if (!state.shots.length) {
    notice.classList.remove("hidden");
    notice.innerHTML = `<strong>剪辑前先导入镜头</strong><span>请先到脚本页生成文案和分镜，再点击“导入剪辑镜头”。</span>`;
    return;
  }
  ensureShots();
  const assets = normalizeList(state.assets);
  const voices = normalizeList(state.voices);
  const assetsByLibrary = groupAssetsByLibrary(assets);
  const requiredLibraryIds = Array.from(new Set(state.shots.map((shot) => resolveShotLibraryId(shot.libraryId, shot)).filter(Boolean)));
  const missingLibraryIds = assets.length
    ? requiredLibraryIds.filter((id) => !(assetsByLibrary[id] || []).length)
    : requiredLibraryIds;
  const missing = [];
  if (!assets.length) {
    missing.push("还没有上传任何视频素材");
  } else if (missingLibraryIds.length) {
    const labels = missingLibraryIds.slice(0, 4).map((id) => getAssetGroupName(id)).join("、");
    missing.push(`缺少 ${labels}${missingLibraryIds.length > 4 ? " 等视频库素材" : ""}`);
  }
  if (!voices.length) {
    missing.push("还没有创建声音档案");
  }
  notice.classList.toggle("hidden", !missing.length);
  const nextAction = (missingLibraryIds.length || !assets.length) && !voices.length
    ? "添加素材和声音"
    : !voices.length
      ? "创建声音档案"
      : "补齐对应视频库素材";
  notice.innerHTML = missing.length
    ? `<strong>剪辑前先补齐视频库</strong><span id="editorMaterialNoticeText">${escapeHtml(`${missing.join("；")}。请先到视频库${nextAction}，再回来做镜头匹配。`)}</span>`
    : "";
}

function groupAssetsByType(assets) {
  return normalizeList(assets).reduce((acc, item) => {
    acc[item.type] = acc[item.type] || [];
    acc[item.type].push(item);
    return acc;
  }, {});
}

function groupAssetsByLibrary(assets) {
  return normalizeList(assets).reduce((acc, item) => {
    const id = getAssetLibraryId(item);
    acc[id] = acc[id] || [];
    acc[id].push(item);
    return acc;
  }, {});
}

function renderCockpit() {
  renderDashboardHeader();
  renderDashboardScriptRows();
  renderMaterialChecklist();
}

function renderDashboardHeader() {
  if (!$("dashboardDirection")) return;
  const service = $("copyRaw")?.value.trim();
  const style = $("copyStyle")?.value || "成交型";
  const title = $("resultTitle")?.value.trim();
  const goal = $("userGoal")?.value.trim();
  const audience = $("targetAudience")?.value.trim();
  $("dashboardDirection").textContent = title || service || `${style.replace("型", "")}内容 · 门店获客`;
  $("dashboardGoal").textContent = goal || (audience ? `吸引 ${audience} 到店咨询并体验` : "吸引 25-40 岁女性到店咨询并体验");
  if ($("researchStateBadge")) {
    $("researchStateBadge").textContent = "调研完成";
  }
}

function renderDashboardScriptRows() {
  const container = $("dashboardScriptRows");
  if (!container) return;
  const names = ["开场吸引", "问题共鸣", "方案展示", "效果对比", "行动号召"];
  const durations = ["0:00 - 0:05", "0:05 - 0:15", "0:15 - 0:35", "0:35 - 0:50", "0:50 - 1:00"];
  const rows = state.shots.slice(0, 5).map((shot, index) => ({
    name: names[index] || `镜头 ${index + 1}`,
    duration: durations[index] || "",
    visual: shot.visual || assetTypeLabels[shot.materialType] || "门店素材",
    text: shot.text || "补充镜头文案",
  }));
  container.innerHTML = rows.map((row) => `
    <div class="script-row">
      <div>
        <strong>${escapeHtml(row.name)}</strong>
        <span>${escapeHtml(row.duration)}</span>
      </div>
      <div class="script-copy">
        <b>镜头：</b>${escapeHtml(row.visual)}<br>
        <b>文案：</b>${escapeHtml(row.text)}
      </div>
    </div>
  `).join("");
}

function renderMaterialChecklist() {
  const list = $("materialChecklist");
  if (!list) return;
  const assetsByType = groupAssetsByType(state.assets);
  const rows = cockpitMaterialRows.map((row) => {
    const matches = assetsByType[row.type] || [];
    return { ...row, count: matches.length, ready: matches.length > 0, matches };
  });
  const missing = rows.filter((row) => !row.ready).length;
  const ready = rows.length - missing;
  if ($("missingCount")) $("missingCount").textContent = `缺少素材 ${missing} 项`;
  if ($("readyCount")) $("readyCount").textContent = `已有素材 ${ready} 项`;
  if ($("missingSummaryTitle")) $("missingSummaryTitle").textContent = missing ? `缺少 ${missing} 项关键素材` : "关键素材已补齐";
  if ($("missingSummaryText")) $("missingSummaryText").textContent = missing ? "建议优先补齐缺口，提升视频转化效果" : "可以进入成品库存，生成内部演示视频";
  if ($("nextSuggestionText")) {
    $("nextSuggestionText").textContent = missing
      ? "完善镜头脚本并准备所需素材，让视频更出彩"
      : "素材已基本齐全，可以进入成品库存";
  }
  if ($("suggestionActionBtn")) $("suggestionActionBtn").textContent = missing ? "›" : "成";
  list.innerHTML = rows.map((row) => `
    <div class="material-row">
      <div class="material-title">
        <strong>${escapeHtml(row.title)}</strong>
        <span>${escapeHtml(row.subtitle)}</span>
      </div>
      <div class="status ${row.ready ? "ready" : "missing"}">${row.ready ? "✓ 已有" : "● 缺少"}</div>
      <div>${row.count} ${row.type === "bgm" ? "首" : "条"}</div>
      <div>${renderMaterialAction(row)}</div>
    </div>
  `).join("");
}

function renderMaterialAction(row) {
  if (!row.ready) {
    return `<button class="upload-chip" data-upload-type="${row.type}">＋ ${escapeHtml(row.missingAction)}</button>`;
  }
  const shown = Math.min(row.count, 3);
  return `<div class="thumbs">${Array.from({ length: shown }).map(() => `<span class="thumb"></span>`).join("")}</div>`;
}

function syncExportFields() {
  if (!$("ttsText").value.trim()) $("ttsText").value = $("resultScript").value.trim();
  if (!$("videoTitle").value.trim()) $("videoTitle").value = $("resultTitle").value.trim();
  if (!$("videoScript").value.trim()) $("videoScript").value = $("resultScript").value.trim();
}

async function generateTts() {
  if (staticPreviewMode) {
    setExportStatus(staticPreviewMessage, "error");
    toast(staticPreviewMessage);
    return;
  }
  const renderShots = buildRenderShots();
  const text = $("ttsText").value.trim()
    ? buildVoiceoverText([], $("ttsText").value.trim())
    : buildVoiceoverText(renderShots, $("resultScript").value.trim());
  if (!text) {
    toast("先生成或填写配音文本");
    return;
  }
  setExportStatus("配音生成中...", "running");
  const data = await api("/api/tts", {
    method: "POST",
    body: JSON.stringify({
      text,
      voiceId: getSelectedVoiceId(),
      voiceSpeed: getSelectedVoiceSpeed(),
    }),
  });
  setExportStatus("配音已生成，可以继续生成成片", "done");
  state.lastRender = data.job;
  renderLatestExport();
  scheduleWorkspaceDraftSave();
  toast("配音任务完成");
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("audio_read_failed"));
    reader.readAsDataURL(blob);
  });
}

async function createVoiceoverAsset(text, voiceId, voiceSpeed = 1) {
  if (!text || !voiceId) return null;
  setExportStatus("克隆音色配音生成中...", "running");
  const ttsData = await api("/api/tts", {
    method: "POST",
    body: JSON.stringify({ text, voiceId, voiceSpeed }),
  });
  const outputUrl = ttsData?.job?.outputUrl;
  if (!outputUrl) return null;
  setExportStatus("配音已生成，正在加入剪辑...", "running");
  const response = await fetch(outputUrl);
  if (!response.ok) throw new Error("配音文件读取失败");
  const blob = await response.blob();
  const dataUrl = await blobToDataUrl(blob);
  const ext = (outputUrl.match(/\.(mp3|wav|m4a|aac)(?:$|\?)/i)?.[1] || "mp3").toLowerCase();
  const assetData = await api("/api/assets", {
    method: "POST",
    body: JSON.stringify({
      name: `自动配音-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`,
      type: "voiceover",
      libraryId: "ungrouped",
      dataUrl,
    }),
  });
  await loadAssets();
  return assetData.asset || null;
}

async function generateVideo() {
  if (staticPreviewMode) {
    setExportStatus(staticPreviewMessage, "error");
    toast(staticPreviewMessage);
    return false;
  }
  syncExportFields();
  if (!state.shots.length) {
    toast("请先在脚本页点击“导入剪辑镜头”，再生成成片");
    return false;
  }
  const renderShots = buildRenderShots();
  const title = $("videoTitle").value.trim() || "内部测试视频";
  const script = $("videoScript").value.trim();
  const voiceoverText = buildVoiceoverText(renderShots, script);
  if (!voiceoverText) {
    toast("先生成或填写视频脚本");
    return false;
  }
  const videoButton = $("videoBtn");
  const previousVideoButtonText = videoButton?.textContent || "";
  if (videoButton) {
    videoButton.disabled = true;
    videoButton.textContent = "生成中...";
  }
  try {
  const lipSyncMode = "off";
  const recommendedTitleStyle = getRecommendedTitleStyle();
  setExportStatus("成片任务处理中：正在生成配音和自动剪辑...", "running");
  const voiceId = getSelectedVoiceId();
  const voiceSpeed = getSelectedVoiceSpeed();
  let assetIds = getRenderAssetIdsForShots();
  if (voiceId) {
    try {
      const voiceAsset = await createVoiceoverAsset(voiceoverText, voiceId, voiceSpeed);
      if (voiceAsset?.id) {
        assetIds = Array.from(new Set([...assetIds, voiceAsset.id]));
      }
    } catch (error) {
      toast(`配音生成失败，先生成无配音视频：${error.message}`);
    }
  }
  setExportStatus("成片合成中，请保持页面打开...", "running");
  const payload = {
    title,
    script: voiceoverText,
    voiceId,
    assetIds,
    shots: renderShots.map((shot) => ({ ...shot, voiceId: "" })),
    settings: {
      count: Number(getControlValue("renderCount", "", "1") || 1),
      subtitleStyle: "玫红高亮字幕",
      titleStyle: recommendedTitleStyle,
      titleTemplateHint: getTitleTemplateHint(recommendedTitleStyle),
      bgmMode: getControlValue("editorBgmMode", "bgmMode", "智能推荐 BGM"),
      voiceSpeed,
      lipSyncMode,
    }
  };
  const data = await api("/api/videos/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  state.lastRender = data.job;
  setExportStatus(data.job.status === "done" ? "成片已生成，可以下载" : "成片生成失败", data.job.status === "done" ? "done" : "error");
  renderLatestExport();
  toast(data.job.status === "done" ? "视频已生成" : "视频生成失败");
  return data.job.status === "done";
  } catch (error) {
    setExportStatus(`成片生成失败：${error.message}`, "error");
    throw error;
  } finally {
    if (videoButton) {
      videoButton.disabled = false;
      videoButton.textContent = previousVideoButtonText || "生成演示成片";
    }
  }
}

function getRenderAssetIdsForShots() {
  const libraryIds = new Set(state.shots.map((shot) => resolveShotLibraryId(shot.libraryId, shot)).filter(Boolean));
  const selectedIds = new Set(normalizeList(state.selectedLibraryAssetIds));
  const ids = normalizeList(state.assets)
    .filter((asset) => {
      const libraryMatch = libraryIds.has(getAssetLibraryId(asset));
      const selectedMatch = selectedIds.has(asset.id);
      const audioSupport = ["bgm", "voiceover"].includes(asset.type);
      return libraryMatch || selectedMatch || audioSupport;
    })
    .map((asset) => asset.id);
  return Array.from(new Set(ids));
}

async function oneClickEditVideo() {
  if (!state.shots.length) {
    toast("请先在脚本页点击“导入剪辑镜头”，再一键成品剪辑");
    switchTab("scriptTab");
    return;
  }
  syncExportFields();
  const button = $("oneClickEditBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "正在剪辑...";
  }
  startEditProgress();
  try {
    const ok = await generateVideo();
    stopEditProgress(ok);
    if (ok) switchTab("exportTab");
  } finally {
    if (editProgressTimer) stopEditProgress(false);
    if (button) {
      button.disabled = false;
      button.textContent = "一键成品剪辑";
    }
  }
}

async function loadJobs() {
  const data = await api("/api/jobs");
  state.jobs = normalizeList(data.jobs).reverse();
  const validIds = new Set(getFinishedJobs(false).map((job) => getFinishedJobId(job)).filter(Boolean));
  state.selectedFinishedJobIds.forEach((id) => {
    if (!validIds.has(id)) state.selectedFinishedJobIds.delete(id);
  });
  if (!state.lastRender && state.jobs.length) {
    state.lastRender = state.jobs[0];
  }
  renderLatestExport();
}

function getFinishedJobId(job) {
  return String(job?.id || job?.outputUrl || job?.createdAt || "").trim();
}

function isFinishedVideoJob(job) {
  const url = String(job?.outputUrl || "").trim();
  if (!url) return false;
  const type = String(job?.type || "").toLowerCase();
  const isVideoUrl = /\.(mp4|mov|m4v|webm)(?:$|\?)/i.test(url);
  const isAudioUrl = /\.(mp3|wav|m4a|aac)(?:$|\?)/i.test(url);
  if (isAudioUrl) return false;
  if (type && type !== "video") return false;
  return isVideoUrl || String(job?.provider || "").includes("ffmpeg") || String(job?.provider || "").includes("editly");
}

function previewFrameUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.includes("#t=")) return value;
  return `${value}#t=0.2`;
}

function getFinishedJobs(includeLastRender = true) {
  const jobs = [];
  const seen = new Set();
  const source = includeLastRender ? [state.lastRender, ...normalizeList(state.jobs)] : normalizeList(state.jobs);
  source.forEach((job) => {
    if (!job) return;
    if (!isFinishedVideoJob(job)) return;
    const key = getFinishedJobId(job) || `${job.title}-${jobs.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push(job);
  });
  return jobs;
}

function renderLatestExport() {
  const container = $("latestExport");
  if (!container) return;
  const jobs = getFinishedJobs();
  updateFinishedToolbar(jobs);
  container.classList.toggle("is-empty", !jobs.length);
  if (!jobs.length) {
    container.innerHTML = `<div class="finished-empty-state">
      <div>
        <div class="finished-empty-icon">4</div>
        <h3>还没有生成成片</h3>
        <p>完成脚本分镜和素材匹配后，点击剪辑页“一键成品剪辑”。成片生成完成后会自动进入这里，支持预览、下载和删除。</p>
      </div>
    </div>`;
    return;
  }
  container.innerHTML = jobs.slice(0, 12).map((job, index) => {
    const url = job.outputUrl || "";
    const cardPreviewUrl = previewFrameUrl(url);
    const isDone = job.status === "done" && url;
    const title = job.title || `成品效果 ${index + 1}`;
    const jobId = getFinishedJobId(job);
    const checked = state.selectedFinishedJobIds.has(jobId);
    return `<article class="finished-video-card ${checked ? "selected" : ""}">
      <div class="finished-video-preview" ${isDone ? `data-finished-preview-url="${escapeHtml(url)}" data-finished-preview-title="${escapeHtml(title)}"` : ""}>
        ${jobId ? `<label class="finished-card-select"><input type="checkbox" data-finished-job-check="${escapeHtml(jobId)}" ${checked ? "checked" : ""} aria-label="选择成片"></label>` : ""}
        ${isDone ? `<video src="${escapeHtml(cardPreviewUrl)}" muted playsinline preload="auto"></video><span class="finished-video-play">点击预览</span>` : `<div class="finished-video-empty">${escapeHtml(job.status === "failed" ? "生成失败" : "生成处理中")}</div>`}
        <span class="finished-video-badge">${escapeHtml(isDone ? "已完成" : (job.status || "处理中"))}</span>
      </div>
      <div class="finished-video-body">
        <h3>${escapeHtml(title)}</h3>
        <div class="meta">生成时间：${escapeHtml(job.createdAt || "-")}</div>
        <div class="meta">剪辑服务：${escapeHtml(job.provider || "自动剪辑")}</div>
        ${job.error ? `<div class="meta">错误：${escapeHtml(job.error)}</div>` : ""}
        <div class="finished-video-actions">
          ${isDone ? `<button type="button" data-finished-preview-url="${escapeHtml(url)}" data-finished-preview-title="${escapeHtml(title)}">预览</button><a href="${escapeHtml(url)}" download>下载</a>` : `<button type="button" disabled>等待</button><a aria-disabled="true">暂无</a>`}
          ${jobId ? `<button type="button" class="danger" data-delete-finished-job="${escapeHtml(jobId)}">删除</button>` : `<button type="button" disabled>删除</button>`}
        </div>
      </div>
    </article>`;
  }).join("");
  hydrateFinishedVideoPreviews(container);
  updateFinishedToolbar(jobs);
}

function hydrateFinishedVideoPreviews(container) {
  container.querySelectorAll(".finished-video-preview video").forEach((video) => {
    video.muted = true;
    video.playsInline = true;
    const seekToPreviewFrame = () => {
      const duration = Number(video.duration || 0);
      if (Number.isFinite(duration) && duration > 0.35) {
        try { video.currentTime = Math.min(0.2, Math.max(0.05, duration - 0.1)); } catch {}
      }
    };
    if (video.readyState >= 1) seekToPreviewFrame();
    else video.addEventListener("loadedmetadata", seekToPreviewFrame, { once: true });
    video.addEventListener("error", () => {
      const preview = video.closest(".finished-video-preview");
      if (!preview || preview.querySelector(".finished-video-empty")) return;
      const empty = document.createElement("div");
      empty.className = "finished-video-empty";
      empty.textContent = "视频加载失败";
      preview.appendChild(empty);
    }, { once: true });
  });
}

function updateFinishedToolbar(jobs = getFinishedJobs()) {
  const ids = jobs.map((job) => getFinishedJobId(job)).filter(Boolean);
  const selectedCount = ids.filter((id) => state.selectedFinishedJobIds.has(id)).length;
  const selectAll = $("selectAllFinishedJobs");
  const deleteBtn = $("deleteFinishedSelectedBtn");
  if (selectAll) {
    selectAll.disabled = !ids.length;
    selectAll.checked = Boolean(ids.length && selectedCount === ids.length);
    selectAll.indeterminate = Boolean(selectedCount && selectedCount < ids.length);
  }
  if (deleteBtn) {
    deleteBtn.disabled = !selectedCount;
    deleteBtn.textContent = selectedCount ? `删除选中 ${selectedCount} 条` : "删除选中";
  }
}

function setFinishedJobSelected(jobId, checked) {
  if (!jobId) return;
  if (checked) state.selectedFinishedJobIds.add(jobId);
  else state.selectedFinishedJobIds.delete(jobId);
  renderLatestExport();
}

function toggleAllFinishedJobs(checked) {
  getFinishedJobs().forEach((job) => {
    const id = getFinishedJobId(job);
    if (!id) return;
    if (checked) state.selectedFinishedJobIds.add(id);
    else state.selectedFinishedJobIds.delete(id);
  });
  renderLatestExport();
}

async function deleteFinishedJobs(jobIds) {
  const ids = normalizeList(jobIds).map((id) => String(id || "").trim()).filter(Boolean);
  if (!ids.length) {
    toast("请先选择要删除的成片");
    return;
  }
  if (!window.confirm(`确认删除 ${ids.length} 条成片吗？删除后成品库里不会再显示。`)) return;
  await api("/api/jobs/delete", {
    method: "POST",
    body: JSON.stringify({ jobIds: ids }),
  });
  ids.forEach((id) => state.selectedFinishedJobIds.delete(id));
  if (state.lastRender && ids.includes(getFinishedJobId(state.lastRender))) state.lastRender = null;
  await loadJobs();
  toast(`已删除 ${ids.length} 条成片`);
  scheduleWorkspaceDraftSave();
}

function openFinishedPreview(url, title = "成片预览") {
  const modal = $("finishedPreviewModal");
  const video = $("finishedPreviewVideo");
  if (!modal || !video || !url) return;
  $("finishedPreviewTitle").textContent = title || "成片预览";
  video.pause();
  video.src = String(url || "").split("#")[0];
  video.load();
  modal.classList.remove("hidden");
  video.play().catch(() => {});
}

function closeFinishedPreview() {
  const modal = $("finishedPreviewModal");
  const video = $("finishedPreviewVideo");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  modal?.classList.add("hidden");
}

function formatLipSyncStatus(job) {
  return "";
}

function formatSize(size) {
  const n = Number(size || 0);
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bindActions() {
  $("loginBtn").addEventListener("click", login);
  $("loginPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (workspaceDraftExcludedIds.has(target.id)) return;
    if (target.matches("input, textarea, select")) scheduleWorkspaceDraftSave();
  });
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (workspaceDraftExcludedIds.has(target.id)) return;
    if (target.matches("input, textarea, select")) scheduleWorkspaceDraftSave();
  });
  window.addEventListener("beforeunload", saveWorkspaceDraftNow);
  $("logoutBtn").addEventListener("click", () => {
    saveWorkspaceDraftNow();
    localStorage.removeItem("aivf_token");
    sessionStorage.removeItem("aivf_token");
    state.token = "";
    showLogin();
  });
  $("researchBtn").addEventListener("click", () => generateResearch(false).catch((e) => toast(e.message)));
  $("importDossierBtn").addEventListener("click", importResearchDossier);
  $("scriptBtn").addEventListener("click", () => generateScript().catch((e) => toast(e.message)));
  $("splitShotBtn").addEventListener("click", () => {
    if (splitScriptToShots()) {
      toast("已按文案和分镜导入剪辑镜头");
      switchTab("editorTab");
    }
  });
  $("toScriptBtn").addEventListener("click", () => {
    if (importResearchDossier()) switchTab("scriptTab");
  });
  $("toEditorBtn")?.addEventListener("click", () => {
    if (splitScriptToShots()) switchTab("editorTab");
  });
  $("templateSelect").addEventListener("change", () => {
    renderTemplatePreview();
    updateScriptSeriesFields();
    applyTemplateToScript(false);
  });
  $("scriptTitleStyle")?.addEventListener("change", () => {
    const value = $("scriptTitleStyle").value;
    if ($("editorTitleStyle")) $("editorTitleStyle").value = value;
    if ($("titleStyle")) $("titleStyle").value = value;
    updateTitleTemplateHints();
  });
  $("addShotBtn").addEventListener("click", addShot);
  $("editorAddShotBtn")?.addEventListener("click", addShot);
  $("autoMatchBtn").addEventListener("click", () => {
    if (splitScriptToShots()) toast("已从脚本分镜重新导入镜头");
  });
  $("editorImportShotsBtn")?.addEventListener("click", () => {
    if (splitScriptToShots()) toast("已从脚本分镜重新导入镜头");
  });
  syncPairedSelects("editorVoiceSelect", "ttsVoiceSelect");
  syncPairedSelects("editorBgmMode", "bgmMode");
  syncPairedRanges("editorVoiceSpeed", "voiceSpeed");
  updateVoiceSpeedLabels();
  updateTitleTemplateHints();
  $("uploadAssetBtn").addEventListener("click", () => uploadAsset().catch((e) => toast(e.message)));
  $("createAssetGroupBtn")?.addEventListener("click", () => createAssetGroup().catch((e) => toast(e.message)));
  $("assetLibrarySelect")?.addEventListener("change", (event) => {
    state.activeAssetGroupId = event.target.value || "ungrouped";
    localStorage.setItem("aivf_active_asset_group", state.activeAssetGroupId);
    renderAssetLibrary();
  });
  $("createVoiceBtn").addEventListener("click", () => createVoice().catch((e) => toast(e.message)));
  $("ttsBtn").addEventListener("click", () => generateTts().catch((e) => toast(e.message)));
  $("videoBtn").addEventListener("click", () => generateVideo().catch((e) => toast(e.message)));
  $("oneClickEditBtn")?.addEventListener("click", () => oneClickEditVideo().catch((e) => toast(e.message)));
  $("selectAllFinishedJobs")?.addEventListener("change", (event) => toggleAllFinishedJobs(event.target.checked));
  $("deleteFinishedSelectedBtn")?.addEventListener("click", () => deleteFinishedJobs([...state.selectedFinishedJobIds]).catch((e) => toast(e.message)));
  $("sidebarToggle").addEventListener("click", toggleSidebar);
  $("topExportBtn").addEventListener("click", () => switchTab("exportTab"));
  $("saveAccountBtn")?.addEventListener("click", () => saveAccount());
  $("resetAccountFormBtn")?.addEventListener("click", () => resetAccountForm());
  $("refreshAccountsBtn")?.addEventListener("click", () => loadAccounts().catch((e) => toast(e.message)));
  $("editorGoLibraryBtn")?.addEventListener("click", () => switchTab("libraryTab"));
  if ($("viewFullScriptBtn")) $("viewFullScriptBtn").addEventListener("click", () => switchTab("scriptTab"));
  if ($("suggestionActionBtn")) {
    $("suggestionActionBtn").addEventListener("click", () => {
      const missing = cockpitMaterialRows.some((row) => !(groupAssetsByType(state.assets)[row.type] || []).length);
      switchTab(missing ? "libraryTab" : "exportTab");
    });
  }
  $("fillMaterialBtn")?.addEventListener("click", () => switchTab("libraryTab"));
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-finished-preview]")) {
      closeFinishedPreview();
      return;
    }
    const finishedPreviewBtn = event.target.closest("[data-finished-preview-url]");
    if (finishedPreviewBtn) {
      if (event.target.closest("[data-finished-job-check]") || event.target.closest(".finished-card-select")) return;
      openFinishedPreview(finishedPreviewBtn.dataset.finishedPreviewUrl, finishedPreviewBtn.dataset.finishedPreviewTitle);
      return;
    }
    const deleteFinishedBtn = event.target.closest("[data-delete-finished-job]");
    if (deleteFinishedBtn) {
      deleteFinishedJobs([deleteFinishedBtn.dataset.deleteFinishedJob]).catch((e) => toast(e.message));
      return;
    }
    if (event.target.closest("[data-close-asset-modal]")) {
      closeAssetGroupModal();
      return;
    }
    const editAccountBtn = event.target.closest("[data-edit-account-id]");
    if (editAccountBtn) {
      editAccount(editAccountBtn.dataset.editAccountId);
      return;
    }
    const toggleAccountBtn = event.target.closest("[data-toggle-account-id]");
    if (toggleAccountBtn) {
      toggleAccount(toggleAccountBtn.dataset.toggleAccountId).catch((e) => toast(e.message));
      return;
    }
    const deleteAccountBtn = event.target.closest("[data-delete-account-id]");
    if (deleteAccountBtn) {
      deleteAccount(deleteAccountBtn.dataset.deleteAccountId).catch((e) => toast(e.message));
      return;
    }
    const selectAssetBtn = event.target.closest("[data-select-asset-id]");
    if (selectAssetBtn) {
      toggleLibraryAssetSelection(selectAssetBtn.dataset.selectAssetId);
      return;
    }
    const deleteAssetBtn = event.target.closest("[data-delete-asset-id]");
    if (deleteAssetBtn) {
      deleteAsset(deleteAssetBtn.dataset.deleteAssetId).catch((e) => toast(e.message));
      return;
    }
    const deleteVoiceBtn = event.target.closest("[data-delete-voice-id]");
    if (deleteVoiceBtn) {
      deleteVoice(deleteVoiceBtn.dataset.deleteVoiceId).catch((e) => toast(e.message));
      return;
    }
    const groupBtn = event.target.closest("[data-asset-group-id]");
    if (groupBtn) {
      openAssetGroupModal(groupBtn.dataset.assetGroupId);
      return;
    }
    const btn = event.target.closest("[data-upload-type]");
    if (!btn) return;
    $("assetType").value = btn.dataset.uploadType;
    if ($("assetLibrarySelect") && state.activeAssetGroupId === "all") {
      $("assetLibrarySelect").value = "ungrouped";
    }
    switchTab("libraryTab");
    openAssetGroupModal(state.activeAssetGroupId === "all" ? "ungrouped" : state.activeAssetGroupId);
    toast(`已切到${assetTypeLabels[btn.dataset.uploadType] || "素材"}上传`);
  });
  document.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const checkbox = event.target.closest("[data-finished-job-check]");
    if (!checkbox) return;
    setFinishedJobSelected(checkbox.dataset.finishedJobCheck, checkbox.checked);
  });
}

bindTabs();
bindActions();
restoreSession();
