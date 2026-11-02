// Outreach clock (#1980): GitHub never fired the schedules of kaanmuar/qa-lab-outreach's outreach.yml, so
// Cloudflare's Cron Triggers start it instead through workflow_dispatch. Times are UTC (Bogotá is UTC-5).
// Cloudflare counts weekdays from 1 = Sunday: keep `mon-fri`, never GitHub's `1-5`.
// GH_TOKEN: fine-grained token on kaanmuar/qa-lab-outreach only, Actions read and write.
export const MODES = {
  "0 12 * * mon-fri": "prospects",
  "0 13 * * mon-fri": "replies",
  "0 15 * * mon-fri": "leads",
  "17 */3 * * *": "holidays",
};

const DISPATCH = "https://api.github.com/repos/kaanmuar/qa-lab-outreach/actions/workflows/outreach.yml/dispatches";

async function dispatch(env, mode) {
  const res = await fetch(DISPATCH, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.GH_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "outreach-cron",
    },
    body: JSON.stringify({ ref: "main", inputs: { mode } }),
  });
  if (!res.ok) throw new Error(`dispatch ${mode}: ${res.status} ${await res.text()}`);
  console.log(`dispatched ${mode}`);
}

export default {
  async scheduled(controller, env) {
    const mode = MODES[controller.cron];
    if (!mode) throw new Error(`no mode for cron "${controller.cron}"`);
    await dispatch(env, mode);
  },
};
