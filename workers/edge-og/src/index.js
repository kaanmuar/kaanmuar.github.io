import { SITE, liveIdOf, metaForLive } from "./og.js";

const TTL_MS = 5 * 60 * 1000;
let indexCache = { at: 0, data: null };
let feedCache = { at: 0, data: null };

async function loadJson(url, cacheBox) {
  if (cacheBox.data && Date.now() - cacheBox.at < TTL_MS) return cacheBox.data;
  try {
    const res = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!res.ok) return cacheBox.data;
    const data = await res.json();
    cacheBox.data = data;
    cacheBox.at = Date.now();
    return data;
  } catch (error) {
    return cacheBox.data;
  }
}

export default {
  async fetch(request) {
    const originRes = await fetch(request);
    const headers = new Headers(originRes.headers);
    headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    const response = new Response(originRes.body, {
      status: originRes.status,
      statusText: originRes.statusText,
      headers
    });
    if (request.method !== "GET" || originRes.status !== 200) return response;
    const contentType = headers.get("content-type") || "";
    if (!/text\/html/i.test(contentType)) return response;
    const url = new URL(request.url);
    if (!liveIdOf(url)) return response;
    const [indexData, feedData] = await Promise.all([
      loadJson(SITE + "/assets/live-reports/index.json", indexCache),
      loadJson(SITE + "/assets/social/feed.json", feedCache)
    ]);
    const meta = metaForLive(url, indexData, feedData);
    if (!meta) return response;

    const map = {
      description: meta.description,
      "og:title": meta.title,
      "og:description": meta.description,
      "og:url": meta.url,
      "og:image": meta.image,
      "og:image:alt": meta.imageAlt,
      "twitter:title": meta.title,
      "twitter:description": meta.description,
      "twitter:image": meta.image,
      "twitter:image:alt": meta.imageAlt
    };

    return new HTMLRewriter()
      .on("title", {
        element(el) {
          el.setInnerContent(meta.title);
        }
      })
      .on("meta[name], meta[property]", {
        element(el) {
          const key = (el.getAttribute("property") || el.getAttribute("name") || "").toLowerCase();
          if (Object.prototype.hasOwnProperty.call(map, key)) el.setAttribute("content", map[key]);
        }
      })
      .transform(response);
  }
};
