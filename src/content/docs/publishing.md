---
title: "发布到 Cloudflare Pages"
description: "记录 Cloudflare Pages 的推荐发布配置。"
pubDate: 2026-07-08
tags: ["Cloudflare", "部署"]
---

Cloudflare Pages 可以连接 Git 仓库，在每次提交后自动构建和发布静态站点。

## 推荐配置

- Framework preset：Astro
- Build command：`npm run build`
- Build output directory：`dist`
- Environment variable：`SITE=https://你的域名`

绑定自定义域名后，把 `SITE` 改成真实地址，RSS 和 sitemap 会使用这个域名生成链接。
