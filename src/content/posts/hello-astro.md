---
title: "用 Astro 搭建技术博客"
description: "记录这个博客的初始化思路：内容集合、静态生成、搜索和发布流程。"
pubDate: 2026-07-08
tags: ["Astro", "博客", "前端"]
featured: true
draft: true
---

Astro 适合技术博客的核心原因，是它把 Markdown 写作、组件化页面和静态生成结合得很自然。

## 内容组织

这个项目把内容分成三类：

- `posts`：正式技术文章
- `notes`：日常笔记
- `docs`：教程、方案和分享材料

每篇内容都使用 frontmatter 维护标题、摘要、日期和标签。

## 发布流程

本地写作完成后运行构建命令：

```bash
npm run build
```

构建产物会输出到 `dist`，可以直接部署到 Cloudflare Pages。
