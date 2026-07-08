import type { CollectionEntry } from "astro:content";

export type ContentKind = "posts" | "notes" | "docs";

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
    day: "2-digit"
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
