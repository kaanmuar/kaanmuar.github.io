/* Four feed-sized slides for a single-host audit post (#3476): hook, six areas, code fix, CTA.
   tips-studio/build.js renders them to carousel/ + document/{slug}.pdf for Buffer LinkedIn. */

function auditCarouselSlides(tip) {
  if (!tip || !tip.carousel || !tip.visual || tip.visual.type !== "scores") return null;
  const v = tip.visual;
  const areas = (v.areas || []).slice();
  const weak = areas.slice().sort((a, b) => (a[1] || 0) - (b[1] || 0))[0];
  const strong = areas.slice().sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];
  const lines = (tip.fixLines && tip.fixLines.length) ? tip.fixLines.slice(0, 6)
    : ["// Fix the top finding in the report", String(tip.action || "").slice(0, 72)].filter(Boolean);
  const host = tip.host || String((v.note || "").split(" · ")[0] || "this site");
  const caseNote = tip.caseId ? String(tip.caseId) : host;
  return [
    Object.assign({}, tip, { counter: "1 / 4", actionLabel: tip.actionLabel || "Lesson" }),
    Object.assign({}, tip, {
      counter: "2 / 4",
      title: ["Six areas.", "*" + (weak ? weak[0] + " at " + weak[1] : "Breakdown") + ".*"],
      body: [(strong ? strong[0] + " held at " + strong[1] + "." : ""), (weak ? weak[0] + " dragged the overall to " + v.overall + "." : "Overall " + v.overall + ".")].filter(Boolean).join(" "),
      visual: v,
      actionLabel: "Look"
    }),
    Object.assign({}, tip, {
      counter: "3 / 4",
      title: tip.caseId ? ["Case " + tip.caseId + ".", "*Playwright.*"] : ["The fix.", "*In one change.*"],
      body: tip.action,
      // DOM element crop omitted until the publish pipeline exposes a finding shot (#3550); no mock box.
      visual: { type: "code", lines, note: caseNote },
      actionLabel: "Fix"
    }),
    Object.assign({}, tip, {
      counter: "4 / 4",
      title: ["How does your domain score?"],
      body: "Open the Live Report from the first comment, or drop your URL below.",
      visual: { type: "stat", value: String(v.overall), caption: host + " · QA-lab URL Review" },
      action: "Review your own site",
      actionLabel: "CTA"
    })
  ];
}

module.exports = { auditCarouselSlides };
