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

发布到 Cloudflare Pages 时，构建命令使用 `pnpm build`，输出目录使用 `dist`。如果有自己的域名，把环境变量 `SITE` 设置为完整站点地址，例如 `https://blog.example.com`。
