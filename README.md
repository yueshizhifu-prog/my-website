# 玥时之肤好评生成助手

这是玥时之肤好评生成页面的公开静态版，可部署到 GitHub Pages。

## 公开访问版

GitHub Pages 只托管静态文件，所以公开访问版不会暴露或调用 DeepSeek API Key。页面会使用内置模板生成文案，支持项目选择、emoji 文案和“换一篇”三次限制。

## 本机 DeepSeek 版

本机运行 `server.mjs` 后，页面会通过 `/api/generate-review` 调用 DeepSeek 快速版：

```text
model: deepseek-v4-flash
thinking: disabled
```

API Key 只应保存在本机 `.env` 文件中，不要提交到公开仓库。

## 公网 DeepSeek 版

GitHub Pages 不能保存密钥。公网调用 DeepSeek 时，需要把 `api/generate-review.js` 部署到 Vercel 等 Serverless 平台，并在平台环境变量中配置：

```text
DEEPSEEK_API_KEY=你的 DeepSeek Key
DEEPSEEK_MODEL=deepseek-v4-flash
ALLOWED_ORIGINS=https://yueshizhifu-prog.github.io,http://127.0.0.1:5178,http://localhost:5178
```
