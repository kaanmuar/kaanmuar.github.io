/* Extra competitor battle posts (#3627): vs-tool scorecard carousel + us-vs-them short thread.
   Built from the live comparison matrix in js/qa-review-vs.js (default rival: Semrush · Ahrefs).
     node scripts/tips-studio/build.js --source battle-vs --skip-video
   Channel-split quiz/reveal policy stays on PR #3598; this batch does not use quiz/answer pairs. */

const { SITE, GUIDE, xPost } = require("./tips");
const { BRAND, tagLine } = require("../social-tags");
const cal = require("../social-calendar");
const battle = require("../battle-formats");

const BATCH = "battle-vs-2026-11";
const KIND = "compare";
const VS = SITE + "/qa-review-vs.html";
const RIVAL = battle.DEFAULT_RIVAL;
const cov = battle.coverage(RIVAL);

const CATS = {
  Battle: { label: "Competitor battle · tools", color: "#e2c48a" }
};

const TIPS = [
  {
    id: "vs-seo-scorecard",
    battleFormat: "vs-tool",
    vsRival: RIVAL,
    kind: "compare",
    cat: "Battle",
    counter: "Scorecard",
    carousel: true,
    title: ["URL Review vs", "*" + cov.themShort + ".*"],
    body: "A coverage scorecard from each vendor's own pages (checked " + cov.checked + "). " +
      cov.weOnly.length + " checks we name that " + cov.themShort + " does not; they go deeper on SEO crawl issues.",
    more: "Full matrix with sources: " + VS.replace(SITE, "carlosandmunoz.com"),
    visual: {
      type: "versus",
      left: { label: "URL Review", lines: ["Whole public site", "Fixes + re-check"], mark: "pass" },
      right: { label: cov.themShort, lines: ["SEO site audit", "Scheduled crawls"], mark: "fail" }
    },
    actionLabel: "Lesson",
    action: "Keep the SEO crawler for on-page depth; add a URL Review for threats, lookalikes, mail auth and fix packages.",
    footRight: "Checked " + cov.checked,
    tags: ["WebQuality", "SEO", "Competitive"]
  },
  {
    id: "us-vs-them-seo",
    battleFormat: "us-vs-them",
    vsRival: RIVAL,
    kind: "compare",
    cat: "Battle",
    counter: "Thread",
    title: ["Us vs them:", "*" + cov.themShort + " in four beats.*"],
    body: "A short X / Threads thread: what SEO audits win at, what URL Review covers instead, an honest split, and the comparison table.",
    more: "Default rival is the seo row in qa-review-vs.js (Semrush · Ahrefs Site Audit).",
    visual: {
      type: "versus",
      left: { label: "Us", lines: ["Threat lists", "Mail auth", "Fix packages"], mark: "pass" },
      right: { label: "Them", lines: ["SEO crawl depth", "140+ issues", "Re-crawls"], mark: "pass" }
    },
    steps: battle.usVsThemBeats(RIVAL),
    actionLabel: "Lesson",
    action: "Post the hook, then the four beats as replies — not a LI/IG carousel.",
    footRight: "X + Threads",
    tags: ["WebQuality", "SEO", "Threads"]
  }
];

const DAYS = { "vs-seo-scorecard": "2026-11-18", "us-vs-them-seo": "2026-11-19" };

function altFor(tip) {
  const parts = ["Battle card.", plainTitle(tip)].concat(tip.body.split(/(?<=\.)\s+/));
  return parts.reduce((out, part) => (out.length + part.length + 1 <= 300 ? (out ? out + " " : "") + part : out), "");
}

TIPS.forEach((tip) => {
  Object.assign(tip, { alt: tip.alt || altFor(tip), date: DAYS[tip.id], pin: true });
  tip.times = Object.fromEntries(cal.NETWORKS.map((network) => [network, cal.freeSlot(tip.date, network, cal.LANES[tip.kind || KIND], BATCH)]));
});

function link(platform, tip) {
  const q = new URLSearchParams({ utm_source: platform, utm_medium: "social", utm_campaign: BATCH, utm_content: tip.id });
  return VS + "?" + q.toString();
}

function plainTitle(tip) { return tip.title.join(" ").replace(/\*/g, "").replace(/\s+/g, " ").trim(); }

function captions(tip) {
  const head = plainTitle(tip);
  const label = tip.actionLabel + ": ";
  const fair = "Coverage compared from each vendor's own pages, checked " + cov.checked + ". Names are trademarks of their owners.";
  return {
    linkedin: [head, "", tip.body, "", label + tip.action, "", fair, "Table: " + link("linkedin", tip), "", tagLine(tip, "linkedin")].join("\n"),
    x: xPost(head + "\n\n" + tip.action, link("x", tip), tagLine(tip, "x")),
    instagram: [head, "", tip.body, "", label + tip.action, "", fair, "", tagLine(tip, "instagram")].join("\n"),
    facebook: [head, "", tip.body, "", label + tip.action, "", fair, link("facebook", tip), "", tagLine(tip, "facebook")].join("\n"),
    tiktok: head + " " + tip.action + " " + tagLine(tip, "tiktok"),
    youtubeTitle: (head + " #Shorts").slice(0, 100),
    youtube: [tip.body, "", label + tip.action, "", fair, "", "Table: " + link("youtube", tip), "", tip.counter + " · QA-lab URL Review", "", tagLine(tip, "youtube")].join("\n")
  };
}

module.exports = { SITE, GUIDE, BRAND, BATCH, CATS, KIND, TIPS, captions, link, plainTitle, xPost, RIVAL };
