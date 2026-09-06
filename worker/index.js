// 只有这个同域接口会触碰统计数据，其余请求仍然交给 Pages 静态资源处理。
const API_PATH = "/api/views";
const MAX_BODY_BYTES = 512;
const ARTICLE_PREFIXES = ["/posts/", "/notes/", "/docs/"];
const BOT_USER_AGENT = /\b(bot|crawler|spider|slurp|facebookexternalhit|lighthouse|pagespeed)\b/i;

function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(JSON.stringify(data), { ...init, headers });
}

function normalizeCounter(input) {
  const scope = input?.scope;
  const resource = input?.resource;

  // 全站只保留一个固定计数器，避免客户端随意创建不同的站点键。
  if (scope === "site") {
    return { scope, resource: "/" };
  }

  if (scope !== "article" || typeof resource !== "string") return null;
  if (resource.length === 0 || resource.length > 240 || resource.includes("//") || resource.includes("..")) {
    return null;
  }

  // 文章路径白名单避免 API 被用来写入无关的 D1 记录。
  const normalizedResource = resource.endsWith("/") ? resource : `${resource}/`;
  const isArticle = ARTICLE_PREFIXES.some((prefix) => normalizedResource.startsWith(prefix));
  const hasSlug = normalizedResource.slice(normalizedResource.indexOf("/", 1) + 1).replaceAll("/", "").length > 0;

  return isArticle && hasSlug ? { scope, resource: normalizedResource } : null;
}

async function readSmallJson(request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return null;

  // 流式读取并限制体积，统计端点不应接受大请求体。
  const reader = request.body?.getReader();
  if (!reader) return null;

  const chunks = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
}

function isEligibleWrite(request, url) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const userAgent = request.headers.get("user-agent") ?? "";

  // 只记录正常同源浏览器请求，过滤最常见的爬虫和跨站调用。
  return origin === url.origin && (fetchSite === null || fetchSite === "same-origin") && !BOT_USER_AGENT.test(userAgent);
}

async function getCount(db, counter) {
  const result = await db
    .prepare("SELECT views FROM view_counters WHERE scope = ? AND resource = ?")
    .bind(counter.scope, counter.resource)
    .first();

  return result?.views ?? 0;
}

async function incrementCount(db, counter) {
  // SQLite 的 UPSERT 在数据库侧完成累加，避免并发访问丢失浏览量。
  await db
    .prepare(
      "INSERT INTO view_counters (scope, resource, views) VALUES (?, ?, 1) ON CONFLICT(scope, resource) DO UPDATE SET views = views + 1"
    )
    .bind(counter.scope, counter.resource)
    .run();

  return getCount(db, counter);
}

async function handleViews(request, env) {
  if (!env.DB) return json({ error: "统计服务暂不可用" }, { status: 503 });

  const url = new URL(request.url);
  let counter;

  if (request.method === "GET") {
    counter = normalizeCounter({
      scope: url.searchParams.get("scope"),
      resource: url.searchParams.get("resource")
    });
  } else if (request.method === "POST") {
    if (!isEligibleWrite(request, url)) return json({ error: "请求未被接受" }, { status: 403 });
    counter = normalizeCounter(await readSmallJson(request));
  } else {
    return json({ error: "不支持的请求方式" }, { status: 405, headers: { Allow: "GET, POST" } });
  }

  if (!counter) return json({ error: "无效的统计目标" }, { status: 400 });

  try {
    const views = request.method === "POST"
      ? await incrementCount(env.DB, counter)
      : await getCount(env.DB, counter);

    return json({ ...counter, views });
  } catch {
    return json({ error: "统计服务暂不可用" }, { status: 503 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === API_PATH) return handleViews(request, env);

    // 统计接口之外保持原有的静态站点行为。
    return env.ASSETS.fetch(request);
  }
};
