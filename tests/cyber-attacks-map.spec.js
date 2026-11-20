const fs = require('fs');
const path = require('path');
const { test, expect } = require('./net-guard');
const { runAxe } = require('./helpers.js');
const desk = require('../functions/url-review-desk');

const ROOT = path.join(__dirname, '..');
const WORLD_JSON = fs.readFileSync(path.join(ROOT, 'assets/jarvis/world.json'), 'utf8');

const MOCK_GLOBAL_LIVE = {
	version: 1,
	updatedAt: '2026-11-19T18:00:00.000Z',
	slice: '20261119180000',
	range: 'live',
	historyDays: 14,
	totalMentions: 31,
	countryCount: 3,
	totalsByRange: { live: 31, '7d': 184, '30d': 620, '90d': 1420 },
	countries: [
		{ cc: 'US', count: 18, share: 58.1 },
		{ cc: 'DE', count: 8, share: 25.8 },
		{ cc: 'CO', count: 5, share: 16.1 },
	],
	events: [
		{
			date: '2026-11-19T17:55:00Z',
			source: 'reuters.com',
			host: 'www.reuters.com',
			url: 'https://www.reuters.com/technology/cyber-incident-us-2026',
			themes: ['CYBER_ATTACK', 'RANSOMWARE'],
			countries: ['US'],
		},
		{
			date: '2026-11-19T17:45:00Z',
			source: 'heise.de',
			host: 'www.heise.de',
			url: 'https://www.heise.de/security/data-breach-de-2026',
			themes: ['DATA_BREACH'],
			countries: ['DE'],
		},
		{
			date: '2026-11-19T17:30:00Z',
			source: 'eltiempo.com',
			host: 'www.eltiempo.com',
			url: 'https://www.eltiempo.com/tecnologia/ddos-report-co-2026',
			themes: ['DDOS'],
			countries: ['CO'],
		},
	],
	kevSummary: { version: '2026.11.18', count: 1460 },
	dropSummary: { v4Ranges: 1042 },
	attributions: [
		'GDELT Project (https://www.gdeltproject.org/)',
		'CISA Known Exploited Vulnerabilities Catalog (CC0 1.0)',
	],
	reviewSummary: { enabled: false, countries: null },
};

const MOCK_DESK_OURS = {
	generatedAt: '2026-11-19T18:00:00.000Z',
	attribution: 'IP Geolocation by DB-IP (https://db-ip.com)',
	filters: { window: 'all', level: '', kind: '', country: '', q: '' },
	summary: {
		totalCountries: 2,
		totalSites: 3,
		withFindings: 2,
		cleanSites: 1,
		totalFindings: 3,
		byLevel: { critical: 1, high: 1, watch: 1, info: 0 },
		byKind: { 'phishing-host': 1, 'known-exploit-software': 2 },
		byWindow: { live: 2, recent: 1, historical: 0 },
	},
	countries: [
		{
			cc: 'US',
			siteCount: 2,
			withFindings: 1,
			cleanSites: 1,
			findingsCount: 2,
			topLevel: 'critical',
			byLevel: { critical: 1, high: 0, watch: 1, info: 0 },
			topKinds: [
				{ kind: 'phishing-host', count: 1 },
				{ kind: 'known-exploit-software', count: 1 },
			],
			sites: [
				{
					host: 'phish-target.example.com',
					ip: '198.51.100.42',
					asn: 13335,
					asName: 'Example Hosting',
					country: 'US',
					score: 38,
					maxLevel: 'critical',
					findingCount: 2,
					findings: [
						{
							id: 'thr-1',
							kind: 'phishing-host',
							level: 'critical',
							subject: 'phish-target.example.com',
							source: 'Google Web Risk',
							evidence: 'Social engineering URL flagged by Web Risk',
							observed_at: '2026-11-19T17:00:00.000Z',
							time_window: 'live',
							delist_status: 'pending',
						},
						{
							id: 'thr-2',
							kind: 'known-exploit-software',
							level: 'watch',
							subject: 'jquery@1.12.4',
							source: 'OSV.dev',
							evidence: 'CVE-2020-11022 XSS in jQuery',
							observed_at: '2026-11-19T17:00:00.000Z',
							time_window: 'live',
							delist_status: 'none',
						},
					],
				},
				{
					host: 'healthy-portal.example.org',
					ip: '192.0.2.10',
					asn: 64512,
					asName: 'Cloud Example',
					country: 'US',
					score: 94,
					maxLevel: 'clean',
					findingCount: 0,
					findings: [],
				},
			],
		},
		{
			cc: 'DE',
			siteCount: 1,
			withFindings: 1,
			cleanSites: 0,
			findingsCount: 1,
			topLevel: 'high',
			byLevel: { critical: 0, high: 1, watch: 0, info: 0 },
			topKinds: [{ kind: 'known-exploit-software', count: 1 }],
			sites: [
				{
					host: 'shop-eu.example.de',
					ip: '203.0.113.19',
					asn: 24940,
					asName: 'DE Host',
					country: 'DE',
					score: 64,
					maxLevel: 'high',
					findingCount: 1,
					findings: [
						{
							id: 'thr-3',
							kind: 'known-exploit-software',
							level: 'high',
							subject: 'wordpress-plugin@2.1',
							source: 'CISA KEV',
							evidence: 'Matched CVE-2024-9999 in CISA KEV',
							observed_at: '2026-10-20T12:00:00.000Z',
							time_window: 'recent',
							delist_status: 'none',
						},
					],
				},
			],
		},
	],
};

test.describe('Cyber attacks map (#3819)', () => {
	test('renders Natural Earth SVG, switches timeframes, filters by country, and passes WCAG AA contrast', async ({
		page,
	}) => {
		const requestedRanges = [];
		await page.route('**/threats/global*', async (route) => {
			const url = new URL(route.request().url());
			const range = url.searchParams.get('range') || 'live';
			requestedRanges.push(range);
			const payload =
				range === '7d'
					? Object.assign({}, MOCK_GLOBAL_LIVE, {
							range: '7d',
							totalMentions: 184,
							countries: [
								{ cc: 'US', count: 102, share: 55.4 },
								{ cc: 'DE', count: 52, share: 28.3 },
								{ cc: 'CO', count: 30, share: 16.3 },
							],
						})
					: MOCK_GLOBAL_LIVE;
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(payload),
			});
		});

		await page.goto('/cyber-attacks.html', { waitUntil: 'load' });
		await expect(page.locator('#map-svg-wrap svg.map-world-svg path.map-cc')).toHaveCount(174);
		await expect(page.locator('#kpi-mentions')).toHaveText('31');
		await expect(page.locator('#kpi-countries')).toHaveText('3');
		await expect(page.locator('#kpi-kev')).toHaveText('1,460');
		await expect(page.locator('#kpi-drop')).toHaveText('1,042');
		await expect(page.locator('#map-events .map-event')).toHaveCount(3);

		await page.locator('#map-svg-wrap path.map-cc[data-cc="DE"]').click();
		await expect(page.locator('#country-panel-title')).toContainText('Germany (DE)');
		await expect(page.locator('#map-events .map-event')).toHaveCount(1);
		await expect(page.locator('#map-events .map-event').first()).toContainText('heise.de');

		await page.locator('#map-clear-country').click();
		await expect(page.locator('#map-events .map-event')).toHaveCount(3);

		await page.locator('.map-pill[data-range="7d"]').click();
		await expect(page.locator('.map-pill[data-range="7d"]')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('#kpi-mentions')).toHaveText('184');
		expect(requestedRanges).toContain('7d');

		await page.locator('#map-svg-wrap path.map-cc[data-cc="CO"]').focus();
		await page.keyboard.press('Enter');
		await expect(page.locator('#country-panel-title')).toContainText('Colombia (CO)');
		await expect(page.locator('#map-events .map-event')).toHaveCount(1);

		const bodyText = await page.locator('body').innerText();
		for (const forbidden of ['Spamhaus', 'PhishStats', 'URLhaus', 'Barracuda']) {
			expect(bodyText).not.toContain(forbidden);
		}

		const axe = await runAxe(page, { contrast: true });
		const serious = axe.violations.filter((v) => ['serious', 'critical', 'moderate'].includes(v.impact));
		expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 2) })))).toEqual([]);
	});

	test('desk renders Global & Our reviewed sites tabs with country hosting drilldown (#3819)', async ({ page }) => {
		await page.route('https://www.gstatic.com/firebasejs/**', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/javascript',
				body: 'export function initializeApp(){return {};} export function getAuth(){return {authStateReady:async()=>null,currentUser:null};} export const TotpMultiFactorGenerator={FACTOR_ID:"totp"}; export function isSignInWithEmailLink(){return false;}',
			})
		);
		await page.route((u) => u.pathname === '/desk', (route) =>
			route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: desk.PAGE })
		);
		await page.route((u) => u.pathname === '/desk/world.json', (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: WORLD_JSON })
		);
		await page.route((u) => u.pathname === '/desk/data', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ tally: { runs: 3, reports: 3 }, active: [], alerts: [], runs: [] }),
			})
		);
		await page.route((u) => u.pathname === '/desk/threats/data', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					summary: { total: 1, byLevel: { critical: 1 }, byDelist: { pending: 1 } },
					items: [
						{
							id: 'thr-1',
							observed_at: '2026-11-19T17:00:00.000Z',
							level: 'critical',
							kind: 'phishing-host',
							subject: 'phish-target.example.com',
							host: 'phish-target.example.com',
							role: 'host_used',
							hosting_country: 'US',
							source: 'Google Web Risk',
							confidence: 'third_party',
							delist_status: 'pending',
							public_ok: false,
						},
					],
				}),
			})
		);
		await page.route((u) => u.pathname === '/threats/global', (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_GLOBAL_LIVE) })
		);
		await page.route((u) => u.pathname === '/desk/map/data', (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DESK_OURS) })
		);

		await page.goto('/desk', { waitUntil: 'load' });
		await expect(page.locator('#desk-map-block')).toBeVisible();
		await expect(page.locator('#map-tab-global')).toHaveAttribute('aria-selected', 'true');
		await expect(page.locator('#desk-map-svg-wrap svg.desk-map-svg path.desk-map-cc')).toHaveCount(174);

		// Switch to Tab 2: Our reviewed sites
		await page.locator('#map-tab-ours').click();
		await expect(page.locator('#map-tab-ours')).toHaveAttribute('aria-selected', 'true');
		await expect(page.locator('#desk-map-global-tools')).toBeHidden();
		await expect(page.locator('#desk-map-ours-tools')).toBeVisible();
		await expect(page.locator('#desk-map-detail')).toContainText('United States (US)');
		await expect(page.locator('#desk-map-detail')).toContainText('Germany (DE)');

		// Select United States on Ours map and inspect sites + jump to Threat List
		await page.locator('#desk-map-svg-wrap path.desk-map-cc[data-cc="US"]').click();
		await expect(page.locator('#desk-map-detail')).toContainText('phish-target.example.com');
		await expect(page.locator('#desk-map-detail')).toContainText('198.51.100.42');
		await expect(page.locator('#desk-map-detail')).toContainText('score 38');
		await expect(page.locator('#desk-map-detail')).toContainText('healthy-portal.example.org');
		await page.locator('#desk-map-detail button', { hasText: 'Filter threat list' }).first().click();
		await expect(page.locator('#threat-q')).toHaveValue('phish-target.example.com');
		await expect(page.locator('#threat-rows tr')).toHaveCount(1);
	});

	test('fits a 390x844 phone viewport with zero horizontal overflow', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.route('**/threats/global*', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(MOCK_GLOBAL_LIVE),
			});
		});

		await page.goto('/cyber-attacks.html', { waitUntil: 'load' });
		await expect(page.locator('#map-svg-wrap svg.map-world-svg')).toBeVisible();
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
		expect(overflow).toBeLessThanOrEqual(2);
	});
});
