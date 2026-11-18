/* Live URL-review log facts → arena stage / anomaly / pose.
   Cast lives in lab/jarvis-full-pipeline-v2-animated.mp4 — overlays only adapt moods. */
(function (root) {
	'use strict';

	// kind = field motion while that station is verifying (matches the plate icon).
	// lab/jarvis = whether that station is drawn on that skin's board.
	const STAGES = [
		{ id: 'fields', label: 'Fields', kind: 'form', lab: false, jarvis: true },
		{ id: 'https', label: 'HTTPS', kind: 'lock', lab: false, jarvis: true },
		{ id: 'dns', label: 'DNS/TLS', kind: 'rack', lab: true, jarvis: true },
		{ id: 'open', label: 'Open', kind: 'door', lab: false, jarvis: false },
		{ id: 'psi-ask', label: 'PSI ask', kind: 'ask', lab: false, jarvis: false },
		{ id: 'robots', label: 'robots.txt', kind: 'doc', lab: true, jarvis: true },
		{ id: 'crawl', label: 'Crawl', kind: 'glass', lab: true, jarvis: true },
		{ id: 'pages', label: 'Pages', kind: 'pages', lab: false, jarvis: false },
		{ id: 'browser', label: 'Browser', kind: 'screen', lab: true, jarvis: true },
		{ id: 'axe', label: 'axe', kind: 'hammer', lab: true, jarvis: true },
		{ id: 'security', label: 'Security', kind: 'shield', lab: true, jarvis: false },
		{ id: 'a11y', label: 'A11Y', kind: 'bot', lab: true, jarvis: false },
		{ id: 'malware', label: 'Malware', kind: 'radar', lab: true, jarvis: false },
		{ id: 'webrisk', label: 'WebRisk', kind: 'target', lab: true, jarvis: true },
		{ id: 'blocklist', label: 'Blocklist', kind: 'list', lab: true, jarvis: false },
		{ id: 'lookalike', label: 'Lookalike', kind: 'mirror', lab: true, jarvis: true },
		{ id: 'wordpress', label: 'WordPress', kind: 'wp', lab: true, jarvis: true },
		{ id: 'mail', label: 'SPF/DMARC', kind: 'mail', lab: true, jarvis: true },
		{ id: 'lighthouse', label: 'Lighthouse', kind: 'tower', lab: true, jarvis: false },
		{ id: 'cases', label: 'Cases', kind: 'cases', lab: true, jarvis: true },
		{ id: 'score', label: 'Score', kind: 'chart', lab: true, jarvis: true },
		{ id: 'sign', label: 'Sign', kind: 'sign', lab: true, jarvis: true },
		{ id: 'save', label: 'Save/Mail', kind: 'send', lab: true, jarvis: true },
	];

	// Robots on the Lab floor / Jarvis hazard lane — moods of the baked sprites.
	const ANOMALIES = ['timeout', 'stop', 'retry', 'slow', 'fail'];

	// Doctor / overall cast mood from the run (varies the bed video + doc spotlight).
	// work | cheer | fail | stop | timeout | retry | slow
	const POSES = ['work', 'cheer', 'fail', 'stop', 'timeout', 'retry', 'slow'];

	// First match wins. status: wip | done | fail | skip | risk
	// `pass` = stages to mark done only after this fact (passed). Never tick on wip.
	const FACTS = [
		// —— Unexpected / control → robot pods ——
		{ re: /^Stop requested/, anomaly: 'stop', pose: 'stop' },
		{
			re: /^Stopped before|^Stopped\. The report keeps/,
			anomaly: 'stop',
			pose: 'stop',
			stage: 'pages',
			status: 'fail',
		},
		{ re: /^The time budget ended/, anomaly: 'timeout', pose: 'timeout', stage: 'pages', status: 'fail' },
		{
			re: /timed out|did not finish in time|did not answer in time|no answer in time/i,
			anomaly: 'timeout',
			pose: 'timeout',
		},
		{ re: /^Waiting for .+ \(\d+s\)/, anomaly: 'slow', pose: 'slow' },
		{ re: /^Waiting for the headless browser/, stage: 'browser', pose: 'slow', anomaly: 'slow', status: 'wip' },
		{ re: /^Waiting for the chat conversation/, stage: 'cases', pose: 'slow', anomaly: 'slow', status: 'wip' },
		{
			re: /^Waiting for the background (?:reads|checks)/,
			stages: ['webrisk', 'blocklist', 'lookalike', 'wordpress', 'mail', 'security', 'malware'],
			pose: 'work',
			status: 'wip',
		},
		{ re: /^Waiting for PageSpeed Insights/, stage: 'lighthouse', pose: 'slow', anomaly: 'slow', status: 'wip' },
		{ re: /Still working\. This step waits|Slow site, still running/i, anomaly: 'slow', pose: 'slow' },
		{ re: /retry|Re-queue|Attempt \d+/i, anomaly: 'retry', pose: 'retry' },

		// —— Connect / front door ——
		{ re: /^Checking the fields/, stage: 'fields', pose: 'work', status: 'wip' },
		{ re: /^Checking that the address is public https/, stage: 'https', pose: 'work', status: 'wip', pass: ['fields'] },
		{ re: /^Soft preview:/, stage: 'https', pose: 'work', status: 'wip' },
		{ re: /^Pages are requested in /, stage: 'open', pose: 'work', status: 'wip' },
		{ re: /^This is a competitor run/, stage: 'browser', pose: 'work', status: 'wip' },
		{ re: /^This rescue reads the site/, stage: 'browser', pose: 'work', status: 'wip' },
		{ re: /^Opening the first page/, stage: 'open', pose: 'work', status: 'wip', pass: ['https'] },
		{ re: /^The server sent its certificate|verified the chain/, stage: 'dns', pose: 'work', status: 'done' },
		{ re: /^Asking PageSpeed Insights/, stage: 'psi-ask', pose: 'work', status: 'wip', pass: ['open'] },
		{ re: /^Asking the Chrome UX Report/, stage: 'lighthouse', pose: 'work', status: 'wip' },
		{ re: /^Searching for public write-ups/, stage: 'security', pose: 'work', status: 'wip' },

		// —— Crawl / pages ——
		{ re: /^Reading robots\.txt/, stage: 'robots', pose: 'work', status: 'wip' },
		{
			re: /^robots\.txt was read|^robots\.txt returned|^robots\.txt could not/,
			stage: 'robots',
			pose: 'work',
			status: 'done',
		},
		{ re: /^Later pages stay under /, stage: 'crawl', pose: 'work', status: 'wip' },
		{ re: /^Opening the start page in a headless browser/, stage: 'browser', pose: 'work', status: 'wip' },
		{ re: /^Browser: /, stage: 'browser', pose: 'work', status: 'wip' },
		{ re: /^Chat conversation: /, stage: 'cases', pose: 'work', status: 'wip' },
		{ re: /^Chat seen in the browser/, stage: 'cases', pose: 'work', status: 'wip' },
		{ re: /^First page answered/, stage: 'open', pose: 'work', status: 'done', pass: ['https', 'dns', 'fields'] },
		{
			re: /^The start page is .+?, not the site's own page/,
			stage: 'open',
			pose: 'work',
			status: 'risk',
			anomaly: 'slow',
		},
		{ re: /same-host links were listed/, stage: 'crawl', pose: 'work', status: 'done', pass: ['robots', 'open'] },
		{
			re: /^The start page lists few same-host links|^The sitemap adds|^Taking further pages from the sitemap/,
			stage: 'crawl',
			pose: 'work',
			status: 'wip',
		},
		{ re: /^No further pages to open/, stage: 'crawl', pose: 'work', status: 'done' },
		{
			re: /^The rendered start page|^Headless Chrome did not return|^SHELL/,
			stage: 'browser',
			pose: 'work',
			status: 'wip',
		},
		{ re: /^Opening \//, stage: 'pages', pose: 'work', status: 'wip', pass: ['crawl'] },
		{ re: /^Skipping \//, stage: 'robots', pose: 'work', status: 'skip' },
		{ re: / answered with .+bot|is not scored/, stage: 'pages', pose: 'work', status: 'skip' },
		{ re: / could not be read/, stage: 'pages', pose: 'fail', anomaly: 'fail', status: 'fail' },
		{ re: / redirected to /, stage: 'pages', pose: 'work', status: 'wip' },
		{ re: / answered \d+/, stage: 'pages', pose: 'work', status: 'wip' },
		{ re: /^Analyzed \d+ pages?\.|^Read \d+ pages?\./, stage: 'pages', pose: 'work', status: 'done' },
		{ re: /^Technologies seen:|^No known technology/, stage: 'pages', pose: 'work', status: 'done' },

		// —— Background / security / mail ——
		{ re: /^In the background:/, stages: ['crawl', 'security', 'mail', 'dns', 'webrisk'], pose: 'work', status: 'wip' },
		{ re: /^The TLS certificate/, stage: 'dns', pose: 'work', status: 'done' },
		{ re: /^The sitemap at |^No sitemap with URLs/, stage: 'crawl', pose: 'work', status: 'done' },
		{ re: /^DNS for /, stage: 'mail', pose: 'work', status: 'done', pass: ['dns'] },
		{ re: /^The DNS records could not be read/, stage: 'dns', pose: 'fail', anomaly: 'fail', status: 'fail' },
		{ re: /^Spam blocklists:/, stage: 'blocklist', pose: 'work', status: 'done' },
		{ re: /^The spam blocklists could not be read/, stage: 'blocklist', pose: 'fail', anomaly: 'fail', status: 'fail' },
		{ re: /^Google's Safe Browsing lists do not flag/, stage: 'webrisk', pose: 'work', status: 'done' },
		{ re: /^Google's Safe Browsing lists flag/, stage: 'webrisk', pose: 'fail', anomaly: 'fail', status: 'risk' },
		{
			re: /^Google's Safe Browsing lists could not be read/,
			stage: 'webrisk',
			pose: 'fail',
			anomaly: 'fail',
			status: 'fail',
		},
		{ re: /^Lookalike domains: /, stage: 'lookalike', pose: 'work', status: 'done' },
		{ re: /^Lookalike domains were not checked/, stage: 'lookalike', pose: 'work', status: 'skip' },
		{ re: /^The lookalike domain check/, stage: 'lookalike', pose: 'fail', anomaly: 'timeout', status: 'fail' },
		{ re: /^WordPress /, stage: 'wordpress', pose: 'work', status: 'done' },
		{ re: /^Hacked-site checks:/, stage: 'security', pose: 'work', status: 'done' },
		{
			re: /^The hacked-site checks did not answer/,
			stage: 'security',
			pose: 'fail',
			anomaly: 'timeout',
			status: 'fail',
		},
		{ re: /^Checked \d+ well-known paths for exposed files/, stage: 'security', pose: 'work', status: 'done' },
		{ re: /^Checked \d+ of \d+ external links/, stage: 'security', pose: 'work', status: 'done' },
		{ re: /phishing or malware list|URLHAUS|PHISHSTATS|URLSCAN/i, stage: 'malware', pose: 'work', status: 'done' },
		{ re: /^Plain http /, stage: 'https', pose: 'work', status: 'done' },
		{ re: /^RDAP for /, stage: 'dns', pose: 'work', status: 'done' },
		{ re: /^The RDAP registration/, stage: 'dns', pose: 'work', status: 'skip' },
		{ re: /^Google Maps /, stage: 'security', pose: 'work', status: 'done' },
		{
			re: /^\/llms|^\/\.well-known\/security\.txt|^The start page with UTM|^The made-up path|^The 404 check|^The UTM check/,
			stage: 'security',
			pose: 'work',
			status: 'done',
		},
		{ re: /linked risk|Linked pages|external host/i, stage: 'security', pose: 'work', status: 'done' },

		// —— Cases / browser pass / speed / score ——
		{ re: /^Proposed \d+/, stage: 'cases', pose: 'work', status: 'done', pass: ['pages'] },
		{ re: /^Ranked \d+ cases/, stage: 'cases', pose: 'work', status: 'done' },
		{ re: /^Wrote \d+ watch case/, stage: 'cases', pose: 'work', status: 'done' },
		{ re: /^Tools that apply:|^None of axe-core/, stage: 'cases', pose: 'work', status: 'wip' },
		{ re: /axe-core ran|pages? checked with axe-core/, stage: 'axe', pose: 'work', status: 'done', pass: ['a11y'] },
		{ re: /cookie banner's reject/, stage: 'a11y', pose: 'work', status: 'done' },
		{ re: /^The browser pass finished/, stage: 'browser', pose: 'work', status: 'done', pass: ['axe', 'a11y'] },
		{ re: /^The browser pass did not finish/, stage: 'browser', pose: 'fail', anomaly: 'fail', status: 'fail' },
		{ re: /^PageSpeed Insights answered/, stage: 'lighthouse', pose: 'work', status: 'done', pass: ['psi-ask'] },
		{ re: /^PageSpeed Insights did not answer/, stage: 'lighthouse', pose: 'fail', anomaly: 'fail', status: 'fail' },
		{ re: /^The Chrome UX Report history did not answer/, stage: 'lighthouse', pose: 'work', status: 'skip' },
		{ re: /^The Chrome UX Report/, stage: 'lighthouse', pose: 'work', status: 'done' },
		{ re: /^Scoring the checks/, stage: 'score', pose: 'work', status: 'wip' },
		{ re: /^Scored \d+ checks/, stage: 'score', pose: 'work', status: 'done' },
		{ re: /^The scored checks could not/, stage: 'score', pose: 'fail', anomaly: 'fail', status: 'fail' },
		{
			re: /^Signed the report/,
			stage: 'sign',
			pose: 'cheer',
			status: 'done',
			pass: ['score', 'cases', 'lighthouse', 'browser'],
		},
		{ re: /^Saving the report|^Saving the soft preview/, stage: 'save', pose: 'work', status: 'wip' },
		{ re: /^Report saved/, stage: 'save', pose: 'cheer', status: 'done', pass: ['sign'] },
		{
			re: /^Looking for your earlier reviews|^Compared with your review|^No earlier review|^Reading the Tranco|^Market presence:/,
			stage: 'score',
			pose: 'work',
			status: 'wip',
		},
		{ re: /^\d+ public write-ups|^No public write-up/, stage: 'security', pose: 'work', status: 'done' },
		{ re: /^\d+ public signals|^No leak or missing control/, stage: 'security', pose: 'work', status: 'done' },
	];

	function matchFact(text) {
		const value = String(text || '');
		for (let i = 0; i < FACTS.length; i++) {
			if (FACTS[i].re.test(value)) return FACTS[i];
		}
		return null;
	}

	function stagesForSkin(skin) {
		return STAGES.filter(function (s) {
			if (skin === 'jarvis') return s.jarvis !== false;
			return s.lab !== false;
		});
	}

	const STATUS_COLOR = {
		idle: '#3a4a55',
		wip: '#5ec8d4',
		done: '#5dff9a',
		fail: '#ff7a6e',
		skip: '#8aa0aa',
		risk: '#e8c86a',
	};

	root.ReviewArenaFacts = {
		STAGES: STAGES,
		ANOMALIES: ANOMALIES,
		POSES: POSES,
		FACTS: FACTS,
		STATUS_COLOR: STATUS_COLOR,
		matchFact: matchFact,
		stagesForSkin: stagesForSkin,
	};
})(typeof window !== 'undefined' ? window : globalThis);
