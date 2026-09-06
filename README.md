# DecSeven Blog

个人技术博客，用于记录技术文章、笔记和可分享文档。

## 常用命令

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
```

新建内容：

```bash
pnpm new -- post "文章标题"
pnpm new -- note "笔记标题"
pnpm new -- doc "文档标题"
```

## 内容目录

- `src/content/posts/`：正式文章
- `src/content/notes/`：零散笔记
- `src/content/docs/`：长文档、教程、分享材料

站点当前发布在 `https://decseven.pages.dev`。发布到 Cloudflare Pages 时，构建命令使用 `pnpm build`，输出目录使用 `dist`。如果以后绑定自定义域名，把环境变量 `SITE` 设置为新的完整站点地址。

## 浏览量统计

浏览量由同域 Cloudflare Worker 与 D1 保存。数据库仅包含页面路径与聚合计数，不保存 IP、Cookie、访客身份或访问来源。

在 Cloudflare Pages 项目中创建一个 D1 数据库并绑定为 `DB`，再执行 `db/migrations/0001_view_counters.sql`。文章页和网站页脚会在同一浏览器的 30 分钟窗口内最多各记录一次；启用浏览器“请勿跟踪”时只读取、不写入统计数据。
