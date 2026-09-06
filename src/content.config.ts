import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// 文章、笔记和资料共用这份元数据，列表和标签页才能用同一个展示组件。
const entrySchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  cover: z.string().optional(),
  topic: z.enum(["tech", "life", "ideas"]).default("tech"),
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

// work 中的每个条目都是可独立阅读的案例，而不是普通文章的附属字段。
const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    period: z.string(),
    role: z.string(),
    status: z.string(),
    stack: z.array(z.string()),
    outcome: z.string(),
    featured: z.boolean().default(false),
    order: z.number().default(99),
    draft: z.boolean().default(false),
    evidence: z.array(z.object({ label: z.string(), href: z.string() }))
  })
});

export const collections = { posts, notes, docs, projects };
