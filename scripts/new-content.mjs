import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const collections = {
  post: "posts",
  posts: "posts",
  note: "notes",
  notes: "notes",
  doc: "docs",
  docs: "docs"
};

const [type = "post", ...titleParts] = process.argv.slice(2);
const collection = collections[type];
const title = titleParts.join(" ").trim();

if (!collection || !title) {
  console.error('Usage: npm run new -- post "文章标题"');
  process.exit(1);
}

const slug =
  title
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || `entry-${Date.now()}`;

const filePath = path.join(process.cwd(), "src", "content", collection, `${slug}.md`);
const date = new Date().toISOString().slice(0, 10);
const safeTitle = title.replace(/"/g, '\\"');

const template = `---
title: "${safeTitle}"
description: ""
pubDate: ${date}
tags: []
draft: true
---

`;

await mkdir(path.dirname(filePath), { recursive: true });
await writeFile(filePath, template, { flag: "wx" });

console.log(`Created ${path.relative(process.cwd(), filePath)}`);
