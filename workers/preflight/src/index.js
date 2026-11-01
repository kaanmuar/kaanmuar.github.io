// Pre-flight brain (#1970): a cheap model and a vector index of the repo and past tickets, so a Cursor agent
// starts from the right files and plan instead of exploring.
//   POST /triage {prompt, model, class}  -> {class, plan[], files[{ref,why}], tickets[{ref,title}], rules[]}
//   POST /index  {items:[{id, text, meta:{kind, ref, title}}]}  (up to 50 per call)
//   POST /delete {ids:[...]}
// Bearer TOKEN on every call.
const EMBED = "@cf/baai/bge-m3";
const LLM = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const SYSTEM = "You plan coding tasks in one repo: a static site (HTML/JS/CSS on GitHub Pages), Firebase functions in functions/, a Jarvis admin dashboard and its Android app in android/, and media scripts in scripts/. "
  + "Tickets, worktrees, commits, PRs and board moves are already handled by the repo's own rules: never list them as steps, and never suggest git commands. "
  + "Plan only the code and verification work, naming the candidate files you would change. If the candidates do not fit the task, return an empty files list rather than guessing. "
  + "Reply with JSON only: {\"plan\": [at most 5 short imperative steps], \"files\": [{\"n\": candidate number, \"why\": \"under 12 words\"}] (at most 6), \"rules\": [paths from the rule list that apply]}.";
const RULES = [".cursor/rules/jarvis-mobile-parity.mdc", ".cursor/rules/social-clips.mdc", ".cursor/rules/playwright-sandbox.mdc"];

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function embed(env, texts) {
  const res = await env.AI.run(EMBED, { text: texts });
  return res.data;
}

async function triage(env, { prompt = "", model = "", class: kind = "" }) {
  const [vector] = await embed(env, [prompt.slice(0, 2000)]);
  const { matches = [] } = await env.VEC.query(vector, { topK: 16, returnMetadata: "all" });
  const hits = matches.filter((m) => m.score > 0.45).map((m) => m.metadata);
  const files = hits.filter((h) => h.kind === "file");
  const tickets = hits.filter((h) => h.kind === "issue").slice(0, 4).map((h) => ({ ref: h.ref, title: h.title }));
  const candidates = files.map((f, i) => `${i + 1}. ${f.ref}: ${f.title || ""}`).join("\n");

  let plan = [], picked = [], rules = [];
  try {
    const res = await env.AI.run(LLM, {
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Task (${kind || "unclassified"}):\n${prompt.slice(0, 3000)}\n\nCandidate files:\n${candidates || "none"}\n\nRule list: ${RULES.join(", ")}` },
      ],
    });
    const out = typeof res.response === "string" ? JSON.parse(res.response) : res.response;
    plan = (out.plan || []).slice(0, 5).map(String);
    picked = (out.files || []).map((f) => files[Number(f.n) - 1] && { ref: files[Number(f.n) - 1].ref, why: String(f.why || "") }).filter(Boolean);
    rules = (out.rules || []).filter((r) => RULES.includes(r));
  } catch {}
  if (!picked.length) picked = files.slice(0, 5).map((f) => ({ ref: f.ref, why: f.title || "" }));
  return { class: kind, model, plan, files: dedupe(picked).slice(0, 6), tickets, rules };
}

function dedupe(files) {
  const seen = new Set();
  return files.filter((f) => { const k = f.ref.split("#")[0]; if (seen.has(k)) return false; seen.add(k); return true; });
}

async function index(env, { items = [] }) {
  items = items.slice(0, 50);
  if (!items.length) return { upserted: 0 };
  const vectors = await embed(env, items.map((i) => i.text.slice(0, 2000)));
  await env.VEC.upsert(items.map((i, n) => ({ id: i.id, values: vectors[n], metadata: i.meta })));
  return { upserted: items.length };
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return json({ ok: true, service: "preflight" });
    if (request.headers.get("authorization") !== `Bearer ${env.TOKEN}`) return json({ error: "unauthorized" }, 401);
    const body = await request.json().catch(() => ({}));
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/triage") return json(await triage(env, body));
      if (pathname === "/index") return json(await index(env, body));
      if (pathname === "/delete") return json(await env.VEC.deleteByIds((body.ids || []).slice(0, 100)));
    } catch (e) {
      console.error(pathname, e);
      return json({ error: "failed" }, 500);
    }
    return json({ error: "not found" }, 404);
  },
};
