import { SITE, bare, route } from "./routes.js";

const INDEX_TTL_MS = 10 * 60 * 1000;
let cached = { at: 0, byHost: null };

async function reports() {
  if (cached.byHost && Date.now() - cached.at < INDEX_TTL_MS) return cached.byHost;
  const res = await fetch(SITE + "/assets/live-reports/index.json", { cf: { cacheTtl: 600, cacheEverything: true } });
  if (!res.ok) return cached.byHost || new Map();
  const body = await res.json();
  const byHost = new Map((body.reports || []).map((card) => [bare(card.host), card]));
  cached = { at: Date.now(), byHost };
  return byHost;
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const out = await route(new URL(request.url), {
      acceptLanguage: request.headers.get("accept-language") || "",
      findReport: async (host) => (await reports()).get(host) || null,
      callUrl: env.CALL_URL || ""
    });
    if (out.location) return new Response(null, { status: out.status, headers: { Location: out.location, "Cache-Control": "no-store" } });
    return new Response(out.body, { status: out.status, headers: { "Content-Type": out.type + "; charset=utf-8" } });
  }
};
