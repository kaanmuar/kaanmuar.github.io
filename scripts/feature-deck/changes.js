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

const CHANGES = [
	{
		date: '2026-11-19',
		eg: 'Attack findings are private. They never appear on Live Reports or in shared links.',
		notes: 'All six attack items are live. The owner notice and evidence PDF are on paid reports only.',
		items: [
			{ face: 'targeted', t: '“Was it targeted?”', d: 'A new paid section: hosting country, attack and bug sources, severity, and which sources were read or skipped.' },
			{ face: 'live', t: 'Threat check in the progress bar', d: 'A new stage shows when the public attack lists are read.' },
			{ face: 'login', t: 'Attack switch and consent line', d: 'Turn the attack and exploit checks off on the form. The line names what leaves the service.' },
			{ face: 'export', t: 'Evidence PDF', d: 'Paid reports: a downloadable proof file for each attack finding.' },
			{ face: 'mail', t: 'Owner notice offer', d: 'Paid reports: send a critical attack finding to the site owner, in one click.' },
			{ face: 'exploit', t: 'Watch list', d: 'Attack findings can go on a watch list, to re-check later.' },
			{ face: 'ai', t: 'Passive AI-readiness checks', d: 'llms.txt, the AI catalog file, a WebMCP check and a plain-text probe. We only look; we change nothing.' },
			{ face: 'health', t: 'A badge for every section', d: 'Fifty animated faces: each report heading and finding area has its own.' },
			{ face: 'history', t: 'Follow-up box visible', d: 'On the review pages, unticked, naming the launch offer.' },
			{ face: 'legal', t: 'Stop link in every follow-up note', d: 'In six languages, the only way to stop is the stop link.' },
			{ face: 'privacy', t: 'Legal page checked', d: 'The privacy and disclaimers page was checked against the official texts, and it lists the attack sources.' },
			{ face: 'log', t: 'Unpaid fix requests', d: 'Kept 12 months after the last change. Paid ones are kept.' },
		],
	},
];

module.exports = { CHANGES };
