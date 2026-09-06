import { getCollection, type CollectionEntry } from "astro:content";

export type ContentKind = "posts" | "notes" | "docs";
export type ContentTopic = "tech" | "life" | "ideas";

export const topicMeta: Record<ContentTopic, { label: string; description: string }> = {
  tech: { label: "技术", description: "项目实践、技术选择，以及排查问题的过程。" },
  life: { label: "生活", description: "工作之外的观察、经历与日常。" },
  ideas: { label: "奇想", description: "还没有结论，也值得记下来的问题。" }
};

export async function getWriting() {
  // 聚合三类公开内容，保留类型以便后续生成正确的链接和标签。
  const kinds: ContentKind[] = ["posts", "notes", "docs"];
  const groups = await Promise.all(kinds.map(async (kind) => {
    const entries = await getCollection(kind, ({ data }) => !data.draft);
    return entries.map((entry) => ({ kind, entry }));
  }));
  return groups.flat().sort((a, b) =>
    b.entry.data.pubDate.valueOf() - a.entry.data.pubDate.valueOf() || a.entry.id.localeCompare(b.entry.id)
  );
}

export const collectionMeta: Record<ContentKind, { label: string; href: string }> = {
  posts: { label: "文章", href: "/posts/" },
  notes: { label: "笔记", href: "/notes/" },
  docs: { label: "文档", href: "/docs/" }
};

export function sortByPubDate<T extends { data: { pubDate: Date } }>(entries: T[]) {
  return [...entries].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai"
  }).format(date);
}

export function entryHref(kind: ContentKind, entry: CollectionEntry<ContentKind>) {
  return `${collectionMeta[kind].href}${entry.id}/`;
}

export function uniqueTags(entries: Array<{ data: { tags: string[] } }>) {
  return [...new Set(entries.flatMap((entry) => entry.data.tags))].sort((a, b) =>
    a.localeCompare(b, "zh-CN")
  );
}
