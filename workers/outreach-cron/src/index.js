// Outreach clock (#1980): GitHub never fired the schedules of kaanmuar/qa-lab-outreach's outreach.yml (#2294), so
// Cloudflare's Cron Triggers start it instead through workflow_dispatch. Times are UTC (Bogotá is UTC-5).
// Cloudflare counts weekdays from 1 = Sunday: keep `mon-fri`, never GitHub's `1-5`.
// Signs in as the qa-lab-agents app (APP_ID, APP_KEY in PKCS#8); each run's token covers qa-lab-outreach's Actions only.
export const MODES = {
  "0 12 * * mon-fri": "prospects",
  "0 13 * * mon-fri": "replies",
  "0 15 * * mon-fri": "leads",
  "17 */3 * * *": "holidays",
};

const INSTALLATION = 175836846;
const REPO = "qa-lab-outreach";

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const text64 = (value) => b64url(new TextEncoder().encode(JSON.stringify(value)));

async function github(path, token, body) {
  const res = await fetch("https://api.github.com" + path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "outreach-cron",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function appToken(env) {
  const der = Uint8Array.from(atob(env.APP_KEY.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const body = `${text64({ alg: "RS256", typ: "JWT" })}.${text64({ iat: now - 60, exp: now + 540, iss: env.APP_ID })}`;
  const jwt = `${body}.${b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body)))}`;
  const { token } = await github(`/app/installations/${INSTALLATION}/access_tokens`, jwt, { repositories: [REPO], permissions: { actions: "write" } });
  return token;
}

export default {
  async scheduled(controller, env) {
    const mode = MODES[controller.cron];
    if (!mode) throw new Error(`no mode for cron "${controller.cron}"`);
    await github(`/repos/kaanmuar/${REPO}/actions/workflows/outreach.yml/dispatches`, await appToken(env), { ref: "main", inputs: { mode } });
    console.log(`dispatched ${mode}`);
  },
};
