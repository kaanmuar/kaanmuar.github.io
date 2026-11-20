// The content of the plain-language deck for QA-lab URL Review (#3931). One list, two outputs:
// build-html.js and build-pptx.js both read it.
//
// Scope: QA-lab URL Review only. Everything about the CV, hiring, the Regression Lab, Sprint Studio, social posting,
// the operator tools and the cyber map is left out on purpose.
//
// Words: short sentences, one idea per slide, everyday comparisons. Every tool is named with what it is, what it does
// in the review, where it runs, who receives data, and where it shows in the report.

const SECTIONS = [
	{ n: 1, id: 'idea', title: 'The big idea', sub: 'What the review is, in one minute', icon: '💡' },
	{ n: 2, id: 'start', title: 'Before you start', sub: 'The address, the choices, the sign-in', icon: '⌨️' },
	{ n: 3, id: 'run', title: 'What happens when you press Review', sub: 'The seven stages, in order', icon: '▶️' },
	{ n: 4, id: 'tools', title: 'The tools, one by one', sub: 'What each tool is, what it does, where it runs', icon: '🧰' },
	{ n: 5, id: 'data', title: 'Where your data goes', sub: 'Who receives what, and for how long we keep it', icon: '🔐' },
	{ n: 6, id: 'report', title: 'Reading the report', sub: 'Every section, every label, every score', icon: '📋' },
	{ n: 7, id: 'pay', title: 'Paying and fixing', sub: 'Prices, fix packages, sharing, Live Reports', icon: '💳' },
	{ n: 8, id: 'new', title: 'What is new', sub: 'Every change to URL Review, newest first', icon: '🚀' },
];

const T_STAGE = ['Stage', 'What happens', 'Tools that work here', 'What you see'];
const T_TOOL = ['Tool', 'What it is', 'What it does in the review', 'Where it runs · who receives data', 'Where it shows'];

const { CHANGES } = require('./changes.js');

// Today's date for the title slide, e.g. "20 Nov 2026". Rebuilding the deck refreshes it.
const UPDATED = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const dayLabel = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// "What is new" slides, made from changes.js: newest day first, six items per slide.
function changeSlides() {
	const out = [];
	for (const day of [...CHANGES].sort((a, b) => b.date.localeCompare(a.date))) {
		const label = dayLabel(day.date);
		const pages = [];
		for (let i = 0; i < day.items.length; i += 6) pages.push(day.items.slice(i, i + 6));
		pages.forEach((items, k) => {
			out.push({
				layout: 'cards',
				kicker: `What is new · ${label}${pages.length > 1 ? ` · ${k + 1} of ${pages.length}` : ''}`,
				title: day.title ? (k === 0 ? day.title : `${day.title} (cont.)`) : `Shipped ${label}`,
				cols: 3,
				dense: true,
				cards: items.map((it) => ({ face: it.face, icon: it.icon, t: it.t, d: it.d })),
				eg: k === 0 ? day.eg : undefined,
				notes: day.notes || '',
			});
		});
	}
	return out;
}

const slides = [
	// ================================================================ opening
	{
		layout: 'title',
		title: 'QA-lab URL Review',
		sub: 'Explained simply: what the review checks, which tools it uses, where each one runs, and what it is for.',
		tag: `Updated ${UPDATED} · for people who are not engineers`,
		notes: 'This deck covers one product: URL Review. It explains every step, every tool, and where the data goes.',
	},
	{
		layout: 'cards',
		kicker: 'What you will see',
		title: 'Eight short parts',
		cols: 4,
		cards: [
			{ icon: '💡', t: '1. The big idea', d: 'What the review is, in one minute.' },
			{ icon: '⌨️', t: '2. Before you start', d: 'The address, your choices, the sign-in.' },
			{ icon: '▶️', t: '3. The run', d: 'The seven stages, in order.' },
			{ icon: '🧰', t: '4. The tools', d: 'Each tool: what it is, what it does, where it runs.' },
			{ icon: '🔐', t: '5. Your data', d: 'Who receives what, and how long we keep it.' },
			{ icon: '📋', t: '6. The report', d: 'Every section, label and score.' },
			{ icon: '💳', t: '7. Paying and fixing', d: 'Prices, fix packages, sharing, Live Reports.' },
			{ icon: '🚀', t: '8. What is new', d: 'Every change to URL Review, newest first.' },
		],
		notes: 'Eight parts. Parts 1 to 3 are enough to understand the product. Parts 4 to 6 are the detail.',
	},

	// ================================================================ 1. the big idea
	{ layout: 'section', section: 'idea' },
	{
		layout: 'scene',
		scene: 'shop',
		kicker: 'Start here',
		title: 'Your website is a shop',
		body: [
			'A website can look fine from the front.',
			'Behind it there can be slow pages, trackers that run before a visitor says yes, open locks, and mail that lands in spam.',
			'URL Review checks all of that from outside, the way a visitor would.',
		],
		eg: 'Like a home inspection, but for a website.',
		notes: 'The review looks at the site from outside. It never logs in to your site and never submits a form.',
	},
	{
		layout: 'steps',
		kicker: 'How it works',
		title: 'Three things you do',
		steps: [
			{ icon: '⌨️', t: 'Give an address', d: 'Any public https address. Up to 20 pages.' },
			{ icon: '🔍', t: 'We look like a visitor', d: 'Page reads and a real browser, from outside the site.' },
			{ icon: '📋', t: 'You get a report', d: 'Six scores, every finding with its proof, and test cases.' },
		],
		eg: 'Everything else in this deck is detail about those three steps.',
		notes: 'Three steps. The rest of the deck explains what happens inside step 2 and what is in step 3.',
	},
	{
		layout: 'cards',
		kicker: 'Who it is for',
		title: 'Anyone who has a website',
		cols: 3,
		cards: [
			{ icon: '🛍️', t: 'Shop and business owners', d: 'Find problems before customers or regulators do.' },
			{ icon: '📈', t: 'Marketing teams', d: 'Are we easy to find on Google and for AI assistants?' },
			{ face: 'privacy', t: 'Privacy and legal', d: 'Is anything tracking visitors before they say yes?' },
			{ icon: '🏢', t: 'Agencies', d: 'Check a client site and send a clear, dated report.' },
			{ icon: '🧪', t: 'Testers and QA teams', d: 'Ready test cases for 20 test tools.' },
			{ face: 'sec', t: 'Security-minded owners', d: 'Signs of attacks, exposed files and weak mail setup.' },
		],
		notes: 'The audience is anyone whose business depends on a website.',
	},

	// ================================================================ 2. before you start
	{ layout: 'section', section: 'start' },
	{
		layout: 'shot',
		kicker: 'Step 1',
		title: 'Type the address. The box checks it first.',
		img: 'home-typing',
		bullets: [
			'It suggests well-known sites as you type.',
			'It asks “Did you mean…?” when a name looks wrong.',
			'After a slash, it offers real page paths from the site’s sitemap.',
		],
		eg: 'Nothing starts until you press Review and sign in.',
		notes: 'Real screenshot of the address box on the review page.',
	},
	{
		layout: 'cards',
		kicker: 'Step 1, your choices',
		title: 'You decide how big the review is',
		cols: 3,
		cards: [
			{ icon: '📄', t: 'How many pages', d: '20 pages are included. Up to 100 if you want more.' },
			{ icon: '🔗', t: 'How deep', d: 'From 2 to 5 links away from the start page.' },
			{ icon: '📁', t: 'Only one section', d: 'Type shop.example/docs and the review stays under /docs.' },
			{ icon: '🌍', t: 'Language', d: 'English, Spanish, Portuguese, German, French or Italian.' },
			{ icon: '🔘', t: 'Attack and exploit checks', d: 'On by default. One switch turns them off. The form lists what leaves.' },
			{ icon: '🔒', t: 'Publish or not', d: 'Tick “Don’t publish this review” to keep it off Live Reports.' },
		],
		eg: 'A bigger review shows its price before you pay.',
		notes: 'Every choice is on the form. Nothing is surprising.',
	},
	{
		layout: 'cards',
		kicker: 'Step 1, sign-in and cookies',
		title: 'Sign in, and what our page stores',
		dense: true,
		cols: 2,
		cards: [
			{ face: 'login', t: 'Sign in to run it', d: 'Email (a 6-digit code or a link, valid 15 minutes, same device). Or Google, Microsoft, GitHub, Yahoo, X or Facebook where they are switched on.', like: 'Why: only the signed-in account can open the full report.' },
			{ icon: '🍪', t: 'Cookie choice on the page', d: '“Keep only what is required”, or “Allow analytics and translation”. Required keeps a device ID and your language.', like: 'You can change this choice at any time.' },
			{ face: 'log', t: 'Your reviews shelf', d: 'Search your reviews, open several, download them, or delete one with a second click.' },
			{ face: 'legal', t: 'Our terms', d: 'The terms and the privacy page say what is stored, for how long, and why.', like: 'Plain words on the page: qa-review-legal.html.' },
		],
		eg: 'The review runs on the device where you signed in.',
		notes: 'A code or link opened on another device or browser starts nothing. This keeps the review in your hands.',
	},
	{
		layout: 'video',
		kicker: 'Real screen recording',
		title: 'Choosing how deep to look',
		clip: 'scope-20x2',
		bullets: ['Pick the number of pages and how deep to go.', 'A bigger review shows its price before you pay.'],
		notes: 'A real recording of the page-choice step.',
	},

	// ================================================================ 3. the run
	{ layout: 'section', section: 'run' },
	{
		layout: 'tools',
		kicker: 'The run, step by step · 1 of 2',
		title: 'Stages 1 to 4: connect, read, look, write',
		weights: [1.5, 4.0, 3.0, 2.2],
		cols: T_STAGE,
		rows: [
			['1. Connecting', 'We check the address, create the review record and start the job on our servers.', 'Our servers (Firebase Cloud Functions)', 'The first log lines and the progress bar'],
			['2. Analyzing pages', 'We read up to 20 pages the way a visitor’s browser would. Also robots.txt, the sitemap, headers, the certificate and DNS. Only public addresses are allowed.', 'Our page reader, DNS lookups, certificate check', '“Analyzing pages · page 5 of 20”'],
			['3. Browser pass', 'A real Chrome with no window opens the start page and up to two linked pages, from Belgium. It records trackers, runs accessibility rules, checks phone and tablet widths and takes screenshots.', 'Headless Chromium, axe-core, tracking recorder, form guard', '“Browser pass”, then the screenshots in the report'],
			['4. Writing cases', 'Builds test cases from what the review saw, ranks them P1, P2 and P3, and writes a starting script for each of 20 tools. No script is ever run.', 'Our case writer and ranking rules', '“Writing cases”, then the list under Cases to run'],
		],
		notes: 'Stages 1 to 4. The browser pass is the heaviest step. It opens real pages in a real browser.',
	},
	{
		layout: 'tools',
		kicker: 'The run, step by step · 2 of 2',
		title: 'Stages 5 to 7: threats, speed, score',
		weights: [1.5, 4.0, 3.0, 2.2],
		cols: T_STAGE,
		rows: [
			['5. Threat check', 'Reads public lists of attacks and of known software bugs, then matches the site’s server and software against them. The free report says that it was read. Paid reports show the detail.', 'CISA KEV, OSV.dev, Feodo Tracker, Spamhaus DROP, Team Cymru, GDELT, Tor exit list', '“Threat check”, and a line that says which sources were read or skipped'],
			['6. Speed checks', 'Google’s speed test for a phone, and real visitor data when the site has enough traffic.', 'PageSpeed Insights, Chrome UX Report', '“Speed checks”'],
			['7. Scoring and signing', 'Scores six areas from 0 to 100, lists every finding with its proof and fix, and signs the finished report.', 'Our scoring rules', '“Scoring and signing”, then the report opens'],
		],
		eg: 'If you switched the attack checks off, stage 5 says so and skips them.',
		notes: 'Stages 5 to 7. The threat check is the newest stage. It can be turned off on the form.',
	},
	{
		layout: 'scene',
		scene: 'flow',
		kicker: 'Who the review talks to',
		title: 'One review, a few small conversations',
		body: [
			'Our servers talk to the site you gave, to a browser in Belgium, and to a few public services.',
			'Each service receives only what it needs: usually a domain name, sometimes a list of hostnames or library names.',
			'None of these services receives your password or your form answers.',
		],
		eg: 'The full list of receivers is in part 5.',
		notes: 'The eight circles are the outside parties. The highlight moves from one to the next so you can follow the path.',
	},
	{
		layout: 'scene',
		scene: 'progress',
		kicker: 'Watch it work',
		title: 'Seven stages, shown live',
		body: [
			'The bar moves through the seven stages in order.',
			'Each log line appears as it is written.',
			'A slow site shows “Still working”.',
			'Stop works only from the device that started the review.',
		],
		eg: 'Like tracking a parcel.',
		notes: 'The stage names on screen are the same as in this deck.',
	},
	{
		layout: 'steps',
		kicker: 'If the site blocks our robot',
		title: 'We try another way, then another',
		steps: [
			{ icon: '🤖', t: 'Plain request', d: 'The first try, like a basic visitor.' },
			{ icon: '🧾', t: 'Browser-like request', d: 'The same page, with the headers a browser sends.' },
			{ icon: '🕶️', t: 'Headless Chrome', d: 'A real browser with no window, from Belgium.' },
			{ icon: '💻', t: 'Real Chrome window', d: 'A minimized Chrome on a trusted operator computer, for sites that block data centres.' },
		],
		eg: 'Still stuck? We promise the full report by email, usually within 48 hours, and give a 20% code.',
		notes: 'Rules and an AI model read the failure log and pick the next try. The AI is used only for this diagnosis, never for the report.',
	},

	// ================================================================ 4. the tools
	{ layout: 'section', section: 'tools' },
	{
		layout: 'tools',
		kicker: 'Group 1 · our own checks · 1 of 2',
		title: 'Checks we run ourselves',
		weights: [1.25, 1.6, 2.2, 1.8, 1.0],
		cols: T_TOOL,
		rows: [
			['Page reader', 'Our program that asks the site for pages, the way a normal browser does.', 'Reads page code, headers, robots.txt, sitemap, certificate and public addresses. Private networks are refused.', 'Our servers → the site you gave. No one else.', 'Summary, Checks and fixes'],
			['Headless Chromium', 'A real Chrome browser with no window on screen.', 'Opens the start page and up to two linked pages, and takes desktop, tablet and phone screenshots.', 'Our servers in Belgium (europe-west1).', 'Browser and search'],
			['axe-core', 'A free rules engine for accessibility, from Deque.', 'Tests the page against WCAG 2.2 AA rules: labels, contrast, names, keyboard.', 'Runs inside the browser. No outside call.', 'Checks and fixes, Accessibility'],
			['Tracking recorder', 'Watches every request the page makes.', 'Lists trackers and cookies before any choice, and again after “Reject”.', 'Runs inside the browser pass. Nothing is sent out.', 'Browser and search, Analytics'],
			['Form guard', 'Types one test address into one form field.', 'Finds scripts that send typed text before submit. The form is never submitted, and any request carrying the test address is blocked.', 'Runs inside the browser pass.', 'Browser and search, Privacy'],
		],
		notes: 'These checks run on our side or in the browser. They do not ask any outside service for a verdict.',
	},
	{
		layout: 'tools',
		kicker: 'Group 1 · our own checks · 2 of 2',
		title: 'More checks we run ourselves',
		weights: [1.25, 1.6, 2.2, 1.8, 1.0],
		cols: T_TOOL,
		rows: [
			['Text comparer', 'Compares the HTML text with what a browser shows.', 'Finds content that only appears after scripts run. Search engines and AI readers can miss it.', 'Runs inside the browser pass.', 'Checks and fixes, SEO and GEO'],
			['Speed meter', 'Measures how fast the page paints and how much it jumps while loading.', 'One lab load gives a number for loading and stability.', 'Our servers.', 'Browser and search, Performance'],
			['Chat-widget check', 'Looks for chat bubbles and AI chatbots on the page.', 'Checks that they ask for consent, do not weigh a lot, and work with a keyboard.', 'Runs inside the browser pass.', 'Checks and fixes'],
			['Exposed-files check', 'Looks for files that must never be public, such as .env, .git and backups.', 'Runs only for an owner who proved the site is theirs.', 'Our servers → the site, owner only.', 'Exposure'],
			['Carbon estimate', 'A rough estimate of the pollution one page view causes.', 'Turns the page weight into one number for one visit.', 'Calculated in our code. No outside call.', 'Performance'],
		],
		notes: 'The exposed-files check is the only one that is owner-only. Everything else runs for every review.',
	},
	{
		layout: 'tools',
		kicker: 'Group 2 · Google services',
		title: 'Google’s services we call',
		weights: [1.25, 1.6, 2.2, 1.8, 1.0],
		cols: T_TOOL,
		rows: [
			['PageSpeed Insights', 'Google’s speed test, built on the open Lighthouse tool.', 'Scores the start page on a phone: speed and quality.', 'Google receives the start address.', 'Browser and search, Performance'],
			['Chrome UX Report', 'Google’s anonymous data from real Chrome visitors.', 'Shows how real people experienced the site. Only when there is enough traffic.', 'Google receives the start address.', 'Performance'],
			['Web Risk (Safe Browsing)', 'Google’s list of dangerous sites, scripts and downloads.', 'Checks the site and every script, frame, form and link host it uses. Up to 60 hosts, cached 24 hours.', 'Google receives the hostnames.', 'Checks and fixes, Security'],
			['Places API (New)', 'Google’s business directory.', 'Only for a local business. Finds the profile that links to the site, and compares name, phone, address and hours.', 'Google receives the business name and area. We keep only the place ID; the report never quotes the profile.', 'Checks and fixes, SEO'],
		],
		notes: 'Google receives addresses and names only. The results come back as scores and lists.',
	},
	{
		layout: 'tools',
		kicker: 'Group 3 · attack and exploit sources · paid detail · 1 of 3',
		title: 'Public attack and bug lists',
		weights: [1.25, 1.6, 2.2, 1.8, 1.0],
		cols: T_TOOL,
		rows: [
			['Cloudflare URL Scanner', 'Cloudflare’s public scanner for suspicious websites.', 'Scans the address for phishing or malware. A scan from the last day is reused.', 'Cloudflare receives the address. The scan is public on Cloudflare Radar.', 'Checks and fixes, Security; Was it targeted?'],
			['CISA KEV', 'US government list of bugs that attackers use now.', 'Matches the software the site runs against that list.', 'We download the list. Nothing is sent.', 'Was it targeted?'],
			['OSV.dev', 'Open database of known bugs in open-source libraries.', 'Checks the library names and versions the site loads.', 'OSV receives library names and versions.', 'Was it targeted?'],
			['FIRST EPSS', 'A score for how likely a known bug is to be used in an attack.', 'Adds that likelihood to each matched bug.', 'FIRST receives the bug IDs (CVE numbers).', 'Was it targeted?'],
			['Feodo Tracker (abuse.ch)', 'A list of servers that control botnets.', 'Checks whether the site’s server address is on it.', 'We download the list. Nothing is sent.', 'Was it targeted?'],
		],
		notes: 'These sources are read only for the attack checks. The detail is shown on paid reports only.',
	},
	{
		layout: 'tools',
		kicker: 'Group 3 · attack and exploit sources · paid detail · 2 of 3',
		title: 'Public network lists',
		weights: [1.25, 1.6, 2.2, 1.8, 1.0],
		cols: T_TOOL,
		rows: [
			['Spamhaus DROP', 'A list of network blocks taken over by criminals.', 'Checks whether the site’s network block is on it.', 'We download the list. Nothing is sent.', 'Was it targeted?'],
			['Team Cymru', 'A lookup that tells which network and company an address belongs to.', 'Finds the network and operator behind the site’s server address.', 'Cymru receives the server address (through a DNS query).', 'Was it targeted?, hosting'],
			['DB-IP Country Lite', 'A table that maps addresses to countries, stored on our side.', 'Shows the country where the site is hosted.', 'Stored on our side. Nothing is sent.', 'Was it targeted?, hosting'],
		],
		notes: 'Hosting country and network come from addresses only, never from a name a visitor typed.',
	},
	{
		layout: 'tools',
		kicker: 'Group 3 · attack and exploit sources · paid detail · 3 of 3',
		title: 'More public lists and news',
		weights: [1.25, 1.6, 2.2, 1.8, 1.0],
		cols: T_TOOL,
		rows: [
			['Tor exit list', 'The public list of Tor exit servers.', 'Flags a server address that is a Tor exit.', 'We download the list. Nothing is sent.', 'Was it targeted?'],
			['GDELT news feed', 'A public news database, updated every 15 minutes.', 'Finds recent cyber-attack news that names the domain.', 'We read its public file. Nothing is sent.', 'Was it targeted?'],
			['CertSpotter (optional)', 'A public log of every new certificate issued.', 'Spots certificates issued for the domain that look unexpected.', 'CertSpotter receives the domain name.', 'Was it targeted?'],
		],
		eg: 'When the attack switch is off, none of these run.',
		notes: 'These sources are read only for the attack checks. The detail is shown on paid reports only.',
	},
	{
		layout: 'tools',
		kicker: 'Group 4 · security and hacked-site checks · 1 of 2',
		title: 'Security and hacked-site checks',
		weights: [1.25, 1.6, 2.2, 1.8, 1.0],
		cols: T_TOOL,
		rows: [
			['Wordfence Intelligence', 'A vulnerability database for WordPress.', 'Matches the WordPress version against known holes. Plugin checks wait until their feed is stored.', 'We read the public feed. Nothing about your site is sent.', 'Checks and fixes, WordPress'],
			['retire.js data', 'A database of old front-end libraries with known holes.', 'Finds old jQuery and similar libraries the page loads.', 'Stored in our code. Nothing is sent.', 'Checks and fixes, Security'],
			['Brave Search (Tavily as a backup)', 'Two web search services.', 'Looks for spam pages injected into search results for the domain, and public write-ups about the site.', 'Brave receives a site: search for the domain.', 'Checks and fixes, hacked-site signs'],
		],
	},
	{
		layout: 'tools',
		kicker: 'Group 4 · mail and domain checks · 2 of 2',
		title: 'Mail and domain checks',
		weights: [1.25, 1.6, 2.2, 1.8, 1.0],
		cols: T_TOOL,
		rows: [
			['DNS lookups', 'The internet’s address book, asked over a secure link.', 'Reads mail servers, SPF, DMARC, DKIM keys, MTA-STS, TLS-RPT, BIMI and other records.', 'Cloudflare DNS and Google DNS receive the domain names looked up.', 'Checks and fixes, Email'],
			['Spam blocklists (SpamCop, Mailspike, NordSpam)', 'Free lists of addresses that send spam.', 'Checks the domain and its mail servers.', 'Receive DNS lookups for the domain and mail hosts.', 'Checks and fixes, Email'],
			['RDAP registry lookup', 'The official online lookup for domain registrations.', 'Reads the expiry date and the transfer lock.', 'The registry receives the domain name.', 'Checks and fixes, Domain'],
		],
		notes: 'A missing header is not proof of a break-in. The report says so next to every finding.',
	},
	{
		layout: 'tools',
		kicker: 'Group 5 · extra tools',
		title: 'Looking around, comparing and asking',
		weights: [1.25, 1.6, 2.2, 1.8, 1.0],
		cols: T_TOOL,
		rows: [
			['Lookalike check', 'Looks for registered domains that copy the client’s name.', 'Flags the ones that have a website or a mail server.', 'DNS lookups. Client and sweep reviews only.', 'Checks and fixes, Lookalikes'],
			['Competitor compare', 'The same passive checks on a rival site.', 'Puts six scores side by side, plus problems only one site has. 9 USD each.', 'The same receivers as a normal review, for the rival.', 'Compare page'],
			['Ask the report', 'A question box on a paid report.', 'Answers only from that report. It uses no AI model.', 'Stays with our server. It checks the account.', 'Paid reports, side panel'],
			['Chatbot test', 'A short scripted chat with the site’s own chat bubble.', 'Asks about prices, a human, refunds, and tries two tricks. Owners only, at most 6 messages in 60 seconds.', 'Sent to the site’s chat widget, only after owner proof.', 'Owner section'],
			['Gemini (failed reviews only)', 'Google’s AI model.', 'Reads the log of a failed review to name the cause and pick a retry.', 'Google receives the failure log.', 'Never in your report'],
		],
		notes: 'The AI model is never used to write your findings. It only helps us retry failed reviews.',
	},

	// ================================================================ 5. data
	{ layout: 'section', section: 'data' },
	{
		layout: 'tools',
		kicker: 'Who receives what · 1 of 3',
		title: 'Outside services and what they get',
		weights: [2.0, 2.8, 2.6, 2.1],
		cols: ['Service', 'What they receive', 'Why', 'When'],
		rows: [
			['Google PageSpeed and Chrome UX Report', 'The start address', 'Speed and real visitor data', 'Every review'],
			['Google Web Risk', 'The start address and each linked host (up to 60)', 'Dangerous-site lists', 'Every review, cached 24 hours'],
			['Google Places (local businesses only)', 'A business name and area', 'Checking the business profile', 'Only when the site describes a local business'],
			['Cloudflare URL Scanner', 'The start address', 'Phishing and malware scan (public on Cloudflare Radar)', 'Reuses a scan from the last day'],
		],
		eg: 'Not one of these receives your form answers or your password.',
		notes: 'Google and Cloudflare receive only names, addresses and domains. The lists on the next two slides cover the rest.',
	},
	{
		layout: 'tools',
		kicker: 'Who receives what · 2 of 3',
		title: 'Outside services and what they get',
		weights: [2.0, 2.8, 2.6, 2.1],
		cols: ['Service', 'What they receive', 'Why', 'When'],
		rows: [
			['Brave Search (Tavily as backup)', 'A site: search for the domain', 'Spam in results, public write-ups', 'Every review'],
			['Cloudflare DNS and Google DNS', 'Domain names to look up', 'Mail, DNS and certificate facts', 'Every review'],
			['DNS blocklists (SpamCop, Mailspike, NordSpam)', 'Lookups for the domain and its mail hosts', 'Is the domain sending spam?', 'Every review'],
			['Domain registry (RDAP)', 'The domain name', 'Expiry date and transfer lock', 'Every review'],
		],
		notes: 'Downloaded lists are stored on our side. Only the names of services above receive anything.',
	},
	{
		layout: 'tools',
		kicker: 'Who receives what · 3 of 3',
		title: 'Outside services and what they get',
		weights: [2.0, 2.8, 2.6, 2.1],
		cols: ['Service', 'What they receive', 'Why', 'When'],
		rows: [
			['CertSpotter (optional)', 'The domain name', 'Unexpected certificates', 'Only when the attack switch is on'],
			['OSV.dev', 'Library names and versions the site loads', 'Known bugs in those libraries', 'Only when the attack switch is on'],
			['FIRST (EPSS)', 'Bug IDs (CVE numbers)', 'How likely each bug is to be used', 'Only when the attack switch is on'],
			['CISA KEV, Feodo, Spamhaus DROP, Tor list, GDELT', 'Nothing: we download these lists', 'Matching the site against them', 'Only when the attack switch is on'],
		],
		eg: 'When the attack switch is off, the attack-source rows do not happen.',
		notes: 'This table is the list the form points to when you switch the attack checks on or off.',
	},
	{
		layout: 'cards',
		kicker: 'How long we keep it',
		title: 'Records are deleted when their time is up',
		cols: 3,
		cards: [
			{ icon: '🧾', t: 'Review record', d: '12 months after the run.' },
			{ icon: '👤', t: 'Account', d: '12 months after your last sign-in.' },
			{ icon: '🔑', t: 'Sign-in session', d: '30 days.' },
			{ icon: '🪵', t: 'Logs of failed or stopped reviews', d: '90 days.' },
			{ icon: '💳', t: 'Payment record', d: '5 years, without the report itself.' },
			{ icon: '🧹', t: 'Unpaid fix requests', d: '12 months after the last change. Paid ones are kept.' },
		],
		eg: 'You can download all your data, or delete it, from your account.',
		notes: 'Download my data and Delete my account are on the account page.',
	},

	// ================================================================ 6. the report
	{ layout: 'section', section: 'report' },
	{
		layout: 'shot',
		kicker: 'The first page',
		title: 'The summary: a grade and what matters most',
		img: 'sample-top',
		bullets: [
			'A grade out of 100, and how many checks fail now.',
			'The biggest risks, the quick wins, and what is already solid.',
			'The sample is automationexercise.com, a practice site. It scored 46 out of 100.',
		],
		eg: 'The free sample is public. Anyone can open it.',
		notes: 'Real screenshot of the free sample report.',
	},
	{
		layout: 'shot',
		kicker: 'Browser and search',
		title: 'What a visitor’s browser saw',
		img: 'sample-browser',
		bullets: [
			'Tracking signals before and after the cookie choice.',
			'Accessibility rule hits, and phone and tablet width.',
			'Screenshots on desktop, tablet and phone.',
		],
		eg: 'Real visitor speed and lab speed are shown separately.',
		notes: 'This section comes from the browser pass.',
	},
	{
		layout: 'shot',
		kicker: 'At a glance',
		title: 'Speed per page, and the public marks',
		img: 'sample-glance',
		bullets: [
			'The response time of each page the review opened.',
			'Public security marks on the first response: HTTPS, HSTS, CSP and more.',
			'Technology groups, and practices worth adopting.',
		],
		eg: 'A five-minute read of the whole report.',
		notes: 'Real screenshot of the At a glance section.',
	},
	{
		layout: 'shot',
		kicker: 'Checks and fixes',
		title: 'Every check has a label',
		img: 'sample-fixes',
		bullets: [
			'In place: good, keep it.',
			'Failing: fix it now. Missing or weak: at risk.',
			'Needs a person: someone must judge it.',
		],
		eg: 'Like traffic lights for your site.',
		notes: 'The grid shows the security and mail checks from the sample.',
	},
	{
		layout: 'cards',
		kicker: 'What each label means',
		title: 'The words in the report',
		cols: 3,
		cards: [
			{ icon: '✅', t: 'In place', d: 'The check passed.' },
			{ icon: '❌', t: 'Failing', d: 'The check fails now. Fix it first.' },
			{ icon: '⚠️', t: 'Missing or weak', d: 'It is absent or weak. At risk.' },
			{ icon: '👀', t: 'Needs a person', d: 'Only a human can decide, for example the wording of a statement.' },
			{ icon: '❔', t: 'Not checked', d: 'A source did not answer. We say so; we do not guess.' },
			{ icon: '🚦', t: 'Severity', d: 'Critical, high, medium, low or info. It shows how much a finding matters.' },
		],
		eg: 'Every finding comes with its proof, its fix and an effort estimate.',
		notes: 'Severity and labels are shown on every finding in the report.',
	},
	{
		layout: 'shot',
		kicker: 'Evidence',
		title: 'The proof behind each finding',
		img: 'sample-evidence',
		bullets: [
			'Which page, which header, which request.',
			'What a visitor would see.',
			'Nothing is guessed. A missing header is not proof of a break-in.',
		],
		eg: 'Use it to show a developer exactly where to look.',
		notes: 'Real screenshot of the Evidence section.',
	},
	{
		layout: 'shot',
		kicker: 'Exposure',
		title: 'Exposed files are checked for owners only',
		img: 'sample-exposure',
		bullets: [
			'Files such as .env, .git or backups are checked only after the owner proves the site is theirs.',
			'Proof is a DNS record or a meta tag on the homepage.',
			'Anyone else sees a plain “owner only” note.',
		],
		eg: 'Verify a site you own on the account page.',
		notes: 'Real screenshot of the Exposure section.',
	},
	{
		layout: 'tools',
		kicker: 'The six scores',
		title: 'Which tools feed each score',
		weights: [1.2, 2.8, 4.2, 1.7],
		cols: ['Score', 'What it measures', 'Tools behind it', 'Report section'],
		rows: [
			['SEO', 'Can search engines find, read and show the site?', 'Page reader, text comparer, Google Places for local businesses', 'Checks and fixes'],
			['GEO', 'Can AI assistants read and quote the site?', 'Page reader, llms.txt and AI catalog checks, markdown probe, WebMCP check', 'Checks and fixes'],
			['Analytics', 'Are visitors tracked fairly, before and after “No”?', 'Tracking recorder, tag and consent checks, UTM test', 'Browser and search'],
			['Security', 'Are the locks, headers, certificate, libraries, WordPress and mail protected?', 'Headers, TLS, Web Risk, Cloudflare scan, Wordfence, retire.js, RDAP, DNS, blocklists', 'Checks and fixes, Exposure'],
			['Accessibility', 'Can everyone use the site?', 'axe-core, text comparer, chat-widget check', 'Browser and search'],
			['Performance', 'Is it fast for real people, and in the lab?', 'PageSpeed Insights, Chrome UX Report, lab paint and layout, carbon estimate', 'Browser and search, At a glance'],
		],
		notes: 'The threat check is separate from the six scores. It adds findings but does not change the scores.',
	},
	{
		layout: 'shot',
		kicker: 'Cases to run',
		title: 'Test cases, written from what we saw',
		img: 'sample-cases',
		bullets: [
			'P1 means do it first, P2 next, P3 later.',
			'Each case names the real page and the problem.',
			'A starting script for each of 20 tools. The review never runs them.',
		],
		eg: 'The first case is shown in full in the free sample.',
		notes: 'Real screenshot of the Cases to run section.',
	},
	{
		layout: 'cards',
		kicker: 'Cases in plain words',
		title: 'What the test cases include',
		cols: 3,
		cards: [
			{ face: 'cases', t: 'A case', d: 'One small check that someone repeats step by step.' },
			{ face: 'verdicts', t: '21 kinds', d: 'Functional, accessibility, security, privacy, SEO, GEO, performance, forms and more.' },
			{ face: 'export', t: 'Exports', d: 'Excel, Jira, Xray, TestRail, Zephyr, Azure, PDF, JSON and text.' },
			{ face: 'tools', t: '20 tools', d: 'Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, k6, JMeter and more.' },
			{ face: 'linked', t: 'A workflow file', d: 'A GitHub Actions file that re-runs the chosen tools.' },
			{ face: 'fixkit', t: 'A fix kit', d: 'Draft security headers, a Report-Only policy, structured data, llms.txt and security.txt.' },
		],
		eg: 'Scripts are starting points. Your team decides what to run, and where.',
		notes: 'The fix kit is a set of drafts. Nothing is applied to your site.',
	},
	{
		layout: 'video',
		kicker: 'Real screen recording',
		title: 'A script for each tool',
		clip: 'framework-playwright',
		bullets: ['Pick the tool you use, and copy its script.', 'The script is a starting point your team runs.'],
		notes: 'A real recording of the framework choice.',
	},
	{
		layout: 'video',
		kicker: 'Real screen recording',
		title: 'Export the cases for your team',
		clip: 'export-excel',
		bullets: ['Excel, Jira, TestRail, Xray and more.', 'Download the file, then hand it to your team.'],
		notes: 'A real recording of the export step.',
	},

	// ================================================================ 7. paying and fixing
	{ layout: 'section', section: 'pay' },
	{
		layout: 'cards',
		kicker: 'What it costs',
		title: 'The first review is free',
		cols: 3,
		cards: [
			{ icon: '🎁', t: 'First review: free', d: '20 pages, 2 links deep, included.' },
			{ icon: '📝', t: 'Fix list: $5', d: 'Scores, every finding, and the top 10 fixes in plain words.' },
			{ icon: '📚', t: 'Full report: $19', d: 'Every case, signal, export and script, for one tool. +$5 per extra tool.' },
			{ icon: '🔍', t: 'Wider or deeper: $4 to $25', d: 'The extra cost is shown before you pay.' },
			{ icon: '👥', t: 'Signed-in run: $39', d: 'A full report on a signed-in account.' },
			{ icon: '⚖️', t: 'Competitor compare: $9 each', d: 'The same checks on a rival, side by side.' },
		],
		eg: 'Coming back within 30 days: 10% off, then 15%, then 20%. Students can use a code for 50% off.',
		notes: 'Prices are in US dollars. A price never goes below half of list price.',
	},
	{
		layout: 'prices',
		kicker: 'Fix it for us',
		title: 'Fixed-price packages',
		cards: [
			{ icon: '🔒', t: 'Security headers', p: '$99', d: '3 working days' },
			{ icon: '✉️', t: 'Email and DNS', p: '$89', d: '3 working days' },
			{ icon: '🔐', t: 'TLS and redirects', p: '$69', d: '2 working days' },
			{ icon: '♿', t: 'Accessibility', p: '$169', d: '5 working days' },
			{ icon: '⚡', t: 'Performance', p: '$199', d: '5 working days' },
			{ icon: '🔎', t: 'SEO basics', p: '$119', d: '4 working days' },
		],
		note: 'Launch prices until 10 Dec 2026, about 30% below the normal price. Codes do not apply to packages. Paid with PayPal.',
		notes: 'After 10 December the list prices apply: 139, 129, 99, 239, 289 and 169 USD.',
	},
	{
		layout: 'cards',
		kicker: 'Four ways to fix',
		title: 'Pick the way that suits you',
		cols: 4,
		cards: [
			{ icon: '🛠️', t: 'Do it yourself', d: 'Use “Ask the report”. A paid report includes one free re-check.' },
			{ icon: '💬', t: 'Ask for a quote', d: 'We reply within two working days.' },
			{ icon: '📦', t: 'Fixed-price package', d: 'One price, one job, paid with PayPal.' },
			{ icon: '📞', t: 'A 30-minute call', d: 'Talk it through with our team.' },
		],
		eg: 'Every open finding has a “Get the fix” button.',
		notes: 'The report ends with these four paths.',
	},
	{
		layout: 'steps',
		kicker: 'After the work',
		title: 'Fixed? We check again, free',
		steps: [
			{ icon: '✅', t: 'The work is done', d: 'The team marks the package finished.' },
			{ icon: '🔁', t: 'Free re-review', d: 'The same check runs again on the site.' },
			{ icon: '📬', t: 'Before and after', d: 'An email marks each finding: fixed, still open, or needs a person.' },
		],
		eg: 'A receipt that proves the repair worked.',
		notes: 'Proof, not promises.',
	},
	{
		layout: 'compare',
		kicker: 'Sharing a report',
		title: 'What a shared link shows',
		left: { h: 'A colleague opens the link', icon: '👀', items: ['They see the overall score.', 'They see the six scores.', 'They see the top finding.', 'The rest stays blurred.'] },
		right: { h: 'The paying account opens it', icon: '🔓', items: ['Everything is readable.', 'All cases and layers.', 'Exports and scripts.', 'One paid report opens only itself.'] },
		notes: 'A free link shows a taste. Only the paying account sees the whole report.',
	},
	{
		layout: 'bignum',
		kicker: 'Live Reports',
		title: 'Public examples, every day',
		items: [
			{ n: '3,800+', l: 'real public sites reviewed' },
			{ n: 'Daily', l: 'new finished reviews published' },
			{ n: '0', l: 'names, emails or reasons shown' },
			{ n: '1 click', l: '“Don’t publish this review” keeps yours private' },
		],
		shot: 'live-reports',
		eg: 'Sites flagged by Safe Browsing or a threat list are never published.',
		notes: 'Live Reports are the public examples. They never show who asked.',
	},
	{
		layout: 'video',
		kicker: 'Real screen recording',
		title: 'How the report is shared',
		clip: 'share-email',
		bullets: ['Copy a link or send it by email.', 'The link shows the free view unless the paying account opens it.'],
		notes: 'A real recording of the share step.',
	},

	// ================================================================ 8. what is new (from changes.js)
	{ layout: 'section', section: 'new' },
	...changeSlides(),

	// ================================================================ glossary
	{
		wrap: true,
		layout: 'glossary',
		kicker: 'Words you will see · 1 of 3',
		title: 'Plain meanings',
		rows: [
			['Address', 'The web address you give us.'],
			['Headless Chrome', 'A real browser with no window. Robots use it.'],
			['axe-core', 'A free rules engine for accessibility.'],
			['WCAG 2.2 AA', 'The accessibility standard most laws point to.'],
			['Cookie', 'A small note a site stores in your browser.'],
			['Tracker', 'A script that follows visitors around the web.'],
			['Consent', 'A visitor’s yes or no to tracking.'],
			['Security headers', 'Settings a site sends to protect your browser.'],
			['TLS certificate', 'Proof that the connection to the site is private.'],
			['SPF, DKIM, DMARC', 'Proof that an email really came from the domain.'],
		],
		notes: 'Keep this slide handy for questions.',
	},
	{
		wrap: true,
		layout: 'glossary',
		kicker: 'Words you will see · 2 of 3',
		title: 'Plain meanings, continued',
		rows: [
			['MTA-STS, BIMI', 'Mail settings: encrypted delivery, and a brand logo.'],
			['SEO', 'Being easy to find on search engines.'],
			['Lighthouse', 'Google’s open tool that scores pages.'],
			['Core Web Vitals', 'Google’s measures of loading and stability.'],
			['GEO', 'Being easy for AI assistants to read and quote.'],
			['llms.txt', 'A short note for AI assistants about the site.'],
			['robots.txt', 'A file that tells robots which pages they may visit.'],
			['Sitemap', 'A list of a site’s pages for search engines.'],
			['CVE', 'A public ID for a known security bug.'],
			['KEV', 'The US list of bugs that attackers use now.'],
		],
		notes: 'Keep this slide handy for questions.',
	},
	{
		wrap: true,
		layout: 'glossary',
		kicker: 'Words you will see · 3 of 3',
		title: 'Plain meanings, last ones',
		rows: [
			['EPSS', 'A score for how likely a bug is to be used in an attack.'],
			['Botnet', 'Hijacked computers used together for attacks.'],
			['Blocklist', 'A list of addresses known to send spam or attack.'],
			['RDAP', 'The official online lookup for domain registrations.'],
			['CrUX', 'Google’s anonymous data from real Chrome visitors.'],
			['Test case', 'One small check someone repeats step by step.'],
			['P1, P2, P3', 'Priority: do it first, next, later.'],
			['Exposed file', 'A file that should never be public, such as .env.'],
		],
		notes: 'If a word is missing, ask in the room. We will add it.',
	},
	{
		wrap: true,
		layout: 'end',
		title: 'Try it on your site',
		links: [
			['URL Review', 'carlosandmunoz.com/qa-review.html'],
			['Free sample report', 'carlosandmunoz.com/qa-review.html?sample=1'],
			['How it works, a guided tour', 'carlosandmunoz.com/qa-review-guide.html'],
			['Compare with other checkers', 'carlosandmunoz.com/qa-review-vs.html'],
			['Privacy and disclaimers', 'carlosandmunoz.com/qa-review-legal.html'],
			['Book a 15-minute URL Review intro', 'carlosandmunoz.com/book.html'],
		],
		notes: 'Thank you. Every line above is a link.',
	},
];

module.exports = { SECTIONS, slides };
