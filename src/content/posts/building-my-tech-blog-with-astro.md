---
title: "我的技术博客搭建记录：Astro 到 Cloudflare Pages"
description: "记录个人技术博客从初始化、内容模型、写作流程，到搜索和 Cloudflare Pages 发布的完整过程。"
pubDate: 2026-07-09
tags: ["Astro", "博客", "Cloudflare", "写作"]
featured: true
---

这次搭博客，目标很明确：做一个长期写技术笔记和文档的地方。

我不需要后台，不需要数据库，也不想把系统做重。最终方案是：

```text
Astro + Markdown/MDX + Pagefind + Cloudflare Pages + Git
```

核心思路：内容放在仓库里，页面静态生成，搜索索引构建时生成，发布交给 Cloudflare Pages。

## 目标

我给这个博客定了几个边界：

- 内容用 Markdown / MDX 写。
- 页面静态生成，不依赖后端。
- 内容分成文章、笔记、文档三类。
- 支持 RSS、sitemap、站内搜索。
- 代码块要有语言标识和复制按钮。
- 推送代码后自动发布。

Astro 比较适合这个场景。它对 Markdown 友好，默认静态输出，也方便后面加 RSS、sitemap 和搜索。

## 初始化项目

先创建项目：

```bash
pnpm create astro@latest tech-blog
cd tech-blog
```

安装依赖：

```bash
pnpm add @astrojs/mdx @astrojs/rss @astrojs/sitemap
pnpm add -D @astrojs/check pagefind typescript
```

当前项目的脚本是这样：

```json
{
  "scripts": {
    "dev": "ASTRO_TELEMETRY_DISABLED=1 astro dev",
    "build": "ASTRO_TELEMETRY_DISABLED=1 astro check && ASTRO_TELEMETRY_DISABLED=1 astro build && pagefind --site dist",
    "preview": "ASTRO_TELEMETRY_DISABLED=1 astro preview",
    "astro": "ASTRO_TELEMETRY_DISABLED=1 astro",
    "new": "node scripts/new-content.mjs"
  }
}
```

这里把 `astro check`、`astro build`、`pagefind --site dist` 串到了一起。发布前先检查，再构建，最后生成搜索索引。

本地启动：

```bash
pnpm dev
```

打开：

```text
http://127.0.0.1:4321
```

这个阶段先保证项目能跑、能构建、能放内容，样式可以后面再调。

## Astro 配置

`astro.config.mjs` 保持简单：

```js
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE ?? "https://decseven.pages.dev",
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: "github-light"
    }
  }
});
```

`site` 不写死，优先读环境变量 `SITE`。部署时配置：

```text
SITE=https://你的站点地址
```

这个值会影响 RSS、sitemap 和分享链接。

## 内容目录

内容分三类：

```text
src/content/posts/    # 正式技术文章
src/content/notes/    # 日常笔记、命令片段、问题记录
src/content/docs/     # 文档、教程、方案沉淀
```

`posts` 放完整文章，`notes` 放零散记录，`docs` 放偏长期维护的文档。

内容集合配置在 `src/content.config.ts`：

```ts
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const entrySchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  featured: z.boolean().default(false)
});

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: entrySchema
});

const notes = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/notes" }),
  schema: entrySchema
});

const docs = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/docs" }),
  schema: entrySchema
});

export const collections = { posts, notes, docs };
```

schema 的作用是把文章元数据约束住。比如 `tags` 必须是数组，`pubDate` 必须能转成日期。

一篇文章的基本结构：

```md
---
title: "Linux 服务器代理配置"
description: "记录一次在无桌面 Linux 服务器上配置命令行代理的过程。"
pubDate: 2026-07-09
tags: ["Linux", "代理"]
featured: true
---

正文从这里开始。
```

后面写文章，本质上就是往这些目录里放 Markdown 文件。

## 路由结构

三类内容都有列表页和详情页：

```text
src/pages/posts/index.astro
src/pages/posts/[...id].astro
src/pages/notes/index.astro
src/pages/notes/[...id].astro
src/pages/docs/index.astro
src/pages/docs/[...id].astro
```

对应 URL：

```text
/posts/                 # 文章列表
/posts/linux-server...  # 单篇文章
/notes/                 # 笔记列表
/docs/                  # 文档列表
```

这个结构比较直观。内容在哪里、页面在哪里、URL 怎么生成，都很好查。

## 写作流程

为了少手写 frontmatter，我加了一个新建内容脚本：

```bash
pnpm new -- post "我的第一篇文章"
pnpm new -- note "常用命令记录"
pnpm new -- doc "部署流程文档"
```

它会生成基础模板：

```md
---
title: "我的第一篇文章"
description: ""
pubDate: 2026-07-09
tags: []
draft: true
---
```

日常流程：

1. `pnpm new` 新建草稿。
2. 本地编辑 Markdown。
3. `pnpm dev` 预览。
4. 补齐 `description`、`tags`。
5. 去掉 `draft: true` 或改成 `draft: false`。
6. 提交并推送。

技术文章里经常有命令、配置和代码块，本地编辑器写起来更稳。

## RSS、sitemap 和搜索

RSS 路由放在：

```text
src/pages/rss.xml.ts
```

sitemap 由 `@astrojs/sitemap` 构建时生成。

搜索用 Pagefind。它扫描静态构建结果：

```bash
pagefind --site dist
```

完整构建命令就是：

```bash
pnpm build
```

实际执行：

```text
astro check
astro build
pagefind --site dist
```

Pagefind 不需要后端，适合静态博客。

## 首页和代码块

首页做成了个人入口 + 内容列表。个人资料单独放在：

```text
src/data/home.ts
```

以后改名字、简介、链接，不需要翻组件。

代码块加了顶部栏、语言标识和复制按钮。技术博客里这个功能很实用，尤其是命令比较多的时候。

示例：

```bash
pnpm install
pnpm dev
pnpm build
```

## 发布到 Cloudflare Pages

Cloudflare Pages 的配置：

```text
Build command: pnpm build
Build output directory: dist
```

如果暂时没有域名，可以直接用免费的 `*.pages.dev`：

```text
https://你的项目名.pages.dev/
```

想换这个免费域名，只能改 Cloudflare Pages 项目名。想用 `blog.example.com` 这种地址，就需要自己的域名。

发布流程：

```bash
git add .
git commit -m "Add new post"
git push
```

推送后，Cloudflare Pages 会自动拉代码、安装依赖、构建并发布 `dist`。

## 验收

最终应该满足：

- `pnpm dev` 可以本地预览。
- 新文章放进 `src/content/posts/` 后能显示。
- `pnpm build` 可以完成检查、构建和搜索索引生成。
- Cloudflare Pages 可以自动发布 `dist`。
- RSS、sitemap、搜索、代码块复制可用。

## 小结

这套方案的重点不是功能多，而是链路清楚。

Astro 负责静态生成，Markdown/MDX 负责内容，Git 负责版本管理，Pagefind 负责搜索，Cloudflare Pages 负责发布。对个人技术博客来说，这个复杂度刚好。
