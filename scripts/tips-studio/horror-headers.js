/* Horror headers: a Halloween series, one post a day from Oct 27 to Oct 31. Each one is a real finding from
   public-page reviews told as a small horror story, with the check a reader can run today.
     node scripts/tips-studio/build.js --source horror-headers --batch tips-horror-2026-10
   Instagram is left out of the calendar (#1037). */

const { SITE, GUIDE, CATS, plainTitle, xPost } = require("./tips");
const { BRAND, tagLine } = require("../social-tags");

const CAMPAIGN = "tips-horror-2026-10";

const WINDOWS = {
  linkedin: ["07:30", "11:00"], x: ["08:00", "21:00"], facebook: ["12:00", "19:00"],
  tiktok: ["17:00", "22:00"], youtube: ["16:00", "21:00"]
};

const TIPS = [
  {
    id: "missing-csp", cat: "Security", date: "2026-10-27",
    title: ["The page that let", "*any script* in."],
    body: "Without a Content-Security-Policy, an injected script runs with all the rights of your page. Start in report-only mode to see what a policy would block before it blocks anything.",
    visual: { type: "code", lines: ["Content-Security-Policy-Report-Only:", "  default-src 'self'"], note: "Watch the reports for a week, then enforce" },
    action: "Run curl -sI on your home page and look for content-security-policy. If it is missing, ship it in report-only mode first.",
    tags: ["Halloween", "WebSecurity", "CSP"]
  },
  {
    id: "zombie-redirects", cat: "SEO", date: "2026-10-28",
    title: ["The redirect", "*that would not die.*"],
    body: "Every hop in a redirect chain costs a round trip, and crawlers stop following after a few. An old link should reach the final address in one hop.",
    visual: { type: "check", items: [["http://example.com", "301 to https", "fail"], ["https://example.com", "301 to www", "fail"], ["https://www.example.com/", "200, at last", "pass"]] },
    action: "Run curl -sIL on your old address and count the location lines. More than one? Point the first redirect straight at the final page.",
    tags: ["Halloween", "TechnicalSEO", "SEO"]
  },
  {
    id: "haunted-404", cat: "QA", date: "2026-10-29",
    title: ["It says not found.", "*The server says 200.*"],
    body: "A missing page that answers 200 is a soft 404. Search engines can keep the ghost in their index, and uptime monitors never notice the page is gone.",
    visual: { type: "versus", left: { label: "Soft 404", lines: ["HTTP/2 200", "<h1>Page not found</h1>"], mark: "fail" }, right: { label: "Real 404", lines: ["HTTP/2 404", "<h1>Page not found</h1>"], mark: "pass" } },
    action: "Request a made-up path on your domain with curl -sI. The first line should say 404 or 410, never 200.",
    tags: ["Halloween", "QA", "SEO"]
  },
  {
    id: "cursed-alt", cat: "A11y", date: "2026-10-30",
    title: ["Alt text that says", "*IMG_4021.jpg*"],
    body: "Screen readers read alt text out loud. A file name or the word image tells nobody anything. A decorative image should have an empty alt instead, so it is skipped.",
    visual: { type: "versus", left: { label: "Cursed", lines: ["<img src=\"IMG_4021.jpg\"", "  alt=\"IMG_4021.jpg\">"], mark: "fail" }, right: { label: "Kind", lines: ["<img src=\"team.jpg\"", "  alt=\"Our support team\">"], mark: "pass" } },
    action: "Turn on your screen reader and move through the images on your home page. Each one should say what it shows, or nothing at all.",
    tags: ["Halloween", "Accessibility", "a11y"]
  },
  {
    id: "poltergeist-shift", cat: "Perf", date: "2026-10-31",
    title: ["The button moved", "*just as you tapped.*"],
    body: "Images, ads and embeds with no reserved space push the page down as they load. Google measures it as Cumulative Layout Shift, and a good score is 0.1 or less.",
    visual: { type: "code", lines: ["<img src=\"hero.jpg\"", "  width=\"1200\" height=\"630\">"], note: "Width and height reserve the space before it loads" },
    action: "Reload your page on a slow phone connection and watch. If anything jumps, give its images and embeds a width and a height.",
    tags: ["Halloween", "WebPerformance", "CoreWebVitals"]
  }
];

function link(platform, tip) {
  const q = new URLSearchParams({ utm_source: platform, utm_medium: "social", utm_campaign: CAMPAIGN, utm_content: tip.id });
  return GUIDE + "?" + q.toString();
}

function captions(tip, index, total) {
  const head = plainTitle(tip);
  const counter = "Horror headers " + (index + 1) + "/" + total;
  return {
    linkedin: [counter + ": " + head, "", tip.body, "", "Check it today: " + tip.action, "", "How a public-page review works, step by step: " + link("linkedin", tip), "", tagLine(tip, "linkedin")].join("\n"),
    x: xPost(head + "\n\n" + tip.action, link("x", tip), tagLine(tip, "x")),
    instagram: [counter + ": " + head, "", tip.body, "", "Check it today: " + tip.action, "", tagLine(tip, "instagram")].join("\n"),
    facebook: [counter + ": " + head, "", tip.body, "", "Check it today: " + tip.action, "", link("facebook", tip), "", tagLine(tip, "facebook")].join("\n"),
    tiktok: head + " " + tip.action + " " + tagLine(tip, "tiktok"),
    youtubeTitle: (head + " #Shorts").slice(0, 100),
    youtube: [tip.body, "", "Check it today: " + tip.action, "", "Guide: " + link("youtube", tip), "", counter + " · QA-lab URL Review", "", tagLine(tip, "youtube")].join("\n")
  };
}

module.exports = { SITE, GUIDE, BRAND, CATS, TIPS, WINDOWS, captions, link, plainTitle, xPost };
