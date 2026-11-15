import { SITE, bare, route } from "./routes.js";
import { clickOf, isBot, pointOf } from "./clicks.js";

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

// writeDataPoint returns at once and never throws on the request path; a missing binding (local dev) logs nothing.
function logClick(env, request, url, out, acceptLanguage) {
  if (!env.CLICKS) return;
  try {
    const click = clickOf(url, out, { acceptLanguage });
    if (click) env.CLICKS.writeDataPoint(pointOf(click, request.cf && request.cf.country, isBot(request.method, request.headers.get("user-agent"))));
  } catch (error) {
    console.error("click not logged", error && error.message);
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const url = new URL(request.url);
    const acceptLanguage = request.headers.get("accept-language") || "";
    const out = await route(url, {
      acceptLanguage,
      findReport: async (host) => (await reports()).get(host) || null,
      callUrl: env.CALL_URL || ""
    });
    logClick(env, request, url, out, acceptLanguage);
    if (out.location) return new Response(null, { status: out.status, headers: { Location: out.location, "Cache-Control": "no-store" } });
    const headers = { "Content-Type": out.type + "; charset=utf-8" };
    if (out.cache) headers["Cache-Control"] = out.cache;
    return new Response(out.body, { status: out.status, headers });
  }
};
