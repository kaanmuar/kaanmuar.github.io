/* Live URL-review log facts → arena stage / anomaly / pose.
   The Lab art lives in lab-full-pipeline-v2-animated.mp4; the console draws its own cast. */
(function (root) {
	'use strict';

	// kind = field motion while that station is verifying (matches the plate icon).
	// lab/console = whether that station is drawn on that skin's board.
	const STAGES = [
		{ id: 'fields', label: 'Fields', kind: 'form', lab: false, console: true },
		{ id: 'https', label: 'HTTPS', kind: 'lock', lab: false, console: true },
		{ id: 'dns', label: 'DNS/TLS', kind: 'rack', lab: true, console: true },
		{ id: 'open', label: 'Open', kind: 'door', lab: false, console: false },
		{ id: 'psi-ask', label: 'PSI ask', kind: 'ask', lab: false, console: false },
		{ id: 'robots', label: 'robots.txt', kind: 'doc', lab: true, console: true },
		{ id: 'crawl', label: 'Crawl', kind: 'glass', lab: true, console: true },
		{ id: 'pages', label: 'Pages', kind: 'pages', lab: false, console: false },
		{ id: 'browser', label: 'Browser', kind: 'screen', lab: true, console: true },
		{ id: 'axe', label: 'axe', kind: 'hammer', lab: true, console: true },
		{ id: 'security', label: 'Security', kind: 'shield', lab: true, console: false },
		{ id: 'a11y', label: 'A11Y', kind: 'bot', lab: true, console: false },
		{ id: 'malware', label: 'Threats', kind: 'radar', lab: true, console: false },
		{ id: 'webrisk', label: 'WebRisk', kind: 'target', lab: true, console: true },
		{ id: 'blocklist', label: 'Blocklist', kind: 'list', lab: true, console: false },
		{ id: 'lookalike', label: 'Lookalike', kind: 'mirror', lab: true, console: true },
		{ id: 'wordpress', label: 'WordPress', kind: 'wp', lab: true, console: true },
		{ id: 'mail', label: 'SPF/DMARC', kind: 'mail', lab: true, console: true },
		{ id: 'lighthouse', label: 'Lighthouse', kind: 'tower', lab: true, console: false },
		{ id: 'cases', label: 'Cases', kind: 'cases', lab: true, console: true },
		{ id: 'score', label: 'Score', kind: 'chart', lab: true, console: true },
		{ id: 'sign', label: 'Sign', kind: 'sign', lab: true, console: true },
		{ id: 'save', label: 'Save/Mail', kind: 'send', lab: true, console: true },
	];

	// Robots on the Lab floor and the console's watchdog pods.
	const ANOMALIES = ['timeout', 'stop', 'retry', 'slow', 'fail'];

	// Doctor / overall cast mood from the run (varies the bed video + doc spotlight).
	// work | cheer | fail | stop | timeout | retry | slow
	const POSES = ['work', 'cheer', 'fail', 'stop', 'timeout', 'retry', 'slow'];

	// First match wins. status: wip | done | fail | skip | risk
	// `pass` = stages to mark done only after this fact (passed). Never tick on wip.
	const FACTS = [
		// —— Unexpected / control → robot pods ——
		{ re: /^Stop requested|^Stop was requested/, anomaly: 'stop', pose: 'stop' },
		{
			re: /^Stopped before|^Stopped\. The report keeps|^Stopped\. The report uses/,
			anomaly: 'stop',
			pose: 'stop',
			stage: 'pages',
			status: 'fail',
		},
		{ re: /^The stop was refused/, anomaly: 'stop', pose: 'stop', status: 'risk' },
		{ re: /^The time budget ended/, anomaly: 'timeout', pose: 'timeout', stage: 'pages', status: 'fail' },
		// Stage-specific timeouts first: the generic rule below has no stage, so a line that matches it would hide which check failed (#3862).
		{
			re: /^The hacked-site checks did not answer/,
			stage: 'security',
			pose: 'fail',
			anomaly: 'timeout',
			status: 'fail',
		},
		{
			re: /^The attack and exploit sources did not answer/,
			stage: 'malware',
			pose: 'fail',
			anomaly: 'timeout',
			status: 'fail',
		},
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
		{ re: /^robots\.txt could not|^robots\.txt was not read/, stage: 'robots', pose: 'fail', anomaly: 'fail', status: 'risk' },
		{
			re: /^robots\.txt was read|^robots\.txt returned/,
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
		{ re: /^The sitemap at /, stage: 'crawl', pose: 'work', status: 'done' },
		{ re: /^No sitemap with URLs/, stage: 'crawl', pose: 'work', status: 'skip' },
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
		{ re: /^Checked \d+ well-known paths for exposed files/, stage: 'security', pose: 'work', status: 'done' },
		{ re: /^Checked \d+ of \d+ external links/, stage: 'security', pose: 'work', status: 'done' },
		{ re: /phishing or malware list|URLHAUS|PHISHSTATS|URLSCAN/i, stage: 'malware', pose: 'work', status: 'done' },
		// The attack and exploit sources (#3848) ride the radar until the art of #3826 gives them their own item.
		{ re: /^Reading attack and exploit sources/, stage: 'malware', pose: 'work', status: 'wip' },
		{ re: /^Attack and exploit sources read:/, stage: 'malware', pose: 'work', status: 'done' },
		{ re: /^Attack and exploit source checks were switched off/, stage: 'malware', pose: 'work', status: 'skip' },
		{ re: /^The agent markdown check was skipped/, stage: 'robots', pose: 'work', status: 'skip' },
		{ re: /^Plain http could not/, stage: 'https', pose: 'fail', anomaly: 'fail', status: 'risk' },
		{ re: /^Plain http /, stage: 'https', pose: 'work', status: 'done' },
		{ re: /^RDAP for /, stage: 'dns', pose: 'work', status: 'done' },
		{ re: /^The RDAP registration did not answer/, stage: 'dns', pose: 'fail', anomaly: 'timeout', status: 'fail' },
		{ re: /^The RDAP registration/, stage: 'dns', pose: 'work', status: 'skip' },
		{ re: /^Google Maps did not answer/, stage: 'security', pose: 'work', status: 'skip' },
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

		// —— Soft preview / payment / UI chrome (keep doctor calm; mark risk only when the run itself failed) ——
		{ re: /^The preview failed/, pose: 'fail', anomaly: 'fail', status: 'fail' },
		{ re: /^The bot check did not load/, pose: 'fail', anomaly: 'fail', status: 'fail' },
		{ re: /^Soft preview quota reached|^Opening this report again waits on payment/, pose: 'work', status: 'skip' },
		{ re: /^Report ready\. Cases are proposed/, stage: 'cases', pose: 'cheer', status: 'done' },
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
			if (skin === 'console') return s.console !== false;
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
