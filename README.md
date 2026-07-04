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
