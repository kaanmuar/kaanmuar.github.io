// What changed in QA-lab URL Review, day by day (#3931). This file is the "What is new" part of the deck.
//
// To add a change: put it at the top of CHANGES. A new day gets a new entry with its own date; an existing day gets
// one more item. Then run `npm run deck` in scripts/feature-deck. The slides are made from this list, newest day first,
// six items per slide.
//
//   date   the day it shipped, YYYY-MM-DD (the slides show it as "19 Nov 2026")
//   title  optional slide title for that day (default: "Shipped 19 Nov 2026")
//   eg     optional one-line note shown under the first slide of that day
//   notes  optional speaker notes
//   items  one entry per change:
//            face  a face from assets/faces/badge (or icon: an emoji instead)
//            t     short name of the change, in plain words
//            d     one or two plain sentences: what it does and for whom
//
// Only put a change here once it is live. Words: no internal ticket numbers, no code names.
// Each item must trace to a commit on main that shipped it. Do not add items from plans or drafts.

const CHANGES = [
	{
		date: '2026-11-20',
		items: [
			{ face: 'bulk', t: 'Bulk list checks addresses', d: 'The list box guesses the right page for each address and checks for address typos, the same way the one-URL box does.' },
		],
	},
	{
		date: '2026-11-19',
		eg: 'Attack findings are private. They never appear on Live Reports or in shared links.',
		notes: 'The attack items are live. The owner notice and evidence PDF are on paid reports only.',
		items: [
			{ face: 'targeted', t: '“Was it targeted?”', d: 'A new paid section: hosting country, attack and bug sources, severity, and which sources were read or skipped.' },
			{ face: 'exploit', t: 'Deep attack-source check', d: 'A one-off US$19 add-on on a paid report. It reads certificate logs and attack news for the domain, then adds them to the report and PDF.' },
			{ face: 'live', t: 'Threat check in the progress bar', d: 'A new stage shows when the public attack lists are read.' },
			{ face: 'login', t: 'Attack switch and consent line', d: 'Turn the attack and exploit checks off on the form. The line names what leaves the service.' },
			{ face: 'export', t: 'Evidence PDF', d: 'Paid reports: a downloadable proof file for each attack finding.' },
			{ face: 'mail', t: 'Owner notice offer', d: 'Paid reports: send a critical attack finding to the site owner, in one click.' },
			{ face: 'ai', t: 'Passive AI-readiness checks', d: 'llms.txt, the AI catalog file, a WebMCP check and a plain-text probe. We only look; we change nothing.' },
			{ face: 'health', t: 'A badge for every section', d: 'Fifty faces: each report heading and finding area has its own.' },
			{ face: 'history', t: 'Follow-up box visible', d: 'On the review pages, unticked, naming the launch offer.' },
			{ face: 'legal', t: 'Stop link in every follow-up note', d: 'In six languages, the only way to stop is the stop link.' },
			{ face: 'privacy', t: 'Legal page checked', d: 'The privacy and disclaimers page was checked against the official texts, and it lists the attack sources.' },
			{ face: 'log', t: 'Unpaid fix requests', d: 'Kept 12 months after the last change. Paid ones are kept.' },
			{ face: 'bulk', t: 'Bulk review is easier to start', d: 'Free-run accounts can start a batch. The form is checked before Start, and progress shows from the moment Start is pressed.' },
			{ face: 'sec', t: 'Security contact file and trust grade', d: 'Checks the site’s security.txt file and gives a trust grade, with a ready-to-paste header fix.' },
			{ face: 'sec', t: 'Script safety checks', d: 'Passive checks: a weak Content Security Policy, scripts that match known-bad code, and third-party scripts with no integrity check.' },
			{ face: 'perf', t: 'Carbon, head order and request waterfall', d: 'Estimates the page’s carbon footprint, checks the order of tags in the page head, and draws the request waterfall.' },
			{ face: 'seo', t: 'Page links and near-copy pages', d: 'Across the pages a review opened (at least five), finds pages with few links in and pages with near-identical text.' },
		],
	},
	{
		date: '2026-11-18',
		items: [
			{ face: 'mail', t: 'DMARC advice reads reports first', d: 'The fix now says to check your aggregate reports before raising the enforcement percentage.' },
			{ face: 'sec', t: 'Content Security Policy in meta tags', d: 'The policy check now also reads a policy set in a meta tag.' },
		],
	},
	{
		date: '2026-11-17',
		items: [
			{ face: 'bulk', t: 'Bulk URL reviews: paste or file', d: 'Signed in, paste a list or upload a file. The sites are reviewed one after another as one batch.' },
			{ face: 'history', t: 'Batches on your account page', d: 'Your account page lists your bulk batches and reopens any of them.' },
		],
	},
	{
		date: '2026-11-16',
		items: [
			{ face: 'compare', t: 'Before and after on re-reviews', d: 'A re-review shows a before-and-after badge against the run before.' },
			{ face: 'cases', t: 'Verified-passing sample test', d: 'A generated Playwright sample that passes gets a verified badge.' },
			{ face: 'cases', t: 'Runnable test scripts', d: 'Some security, function and accessibility test cases now come with a runnable script instead of a stub.' },
			{ face: 'summary', t: 'Rate your report', d: 'After a review, rate it with stars, a recommend score and an optional quote. A reminder follows.' },
			{ face: 'tools', t: 'Full Stack bundles', d: 'Starter at US$29 and Complete at US$99, per review run.' },
			{ face: 'tools', t: 'AI assistant connector', d: 'AI assistants can preview a site and read a report through the QA-lab connector.' },
		],
	},
	{
		date: '2026-11-15',
		items: [
			{ face: 'preview', t: 'Free one-page preview', d: 'Paste a site for a one-page preview with scores. Sign in to unlock the full crawl. Quotas apply.' },
			{ face: 'linked', t: 'Shared reports show scores', d: 'Shared and anonymous reports now show the scores.' },
			{ face: 'response', t: 'Harder sites get a real-browser retry', d: 'Sites that reset the connection, hang up, loop redirects or set cookies now get a review through a real browser.' },
		],
	},
];

module.exports = { CHANGES };
