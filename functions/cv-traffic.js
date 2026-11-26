'use strict';
/**
 * Real vs testing traffic for CV site reports (#4356).
 * Prefer tagging over dropping: hourly mail skips when Real is empty; period reports list both sections.
 */

const reviewTest = require('./url-review-test-accounts');

const AUTOMATION_UA =
	/Chrome-Lighthouse|Lighthouse|HeadlessChrome|Headless|Cypress|Electron\/|PhantomJS|Puppeteer|Playwright|Selenium|webdriver|Slackbot|Twitterbot|facebookexternalhit|LinkedInBot|Googlebot|Bingbot|Applebot|YandexBot|DuckDuckBot|Baiduspider|SemrushBot|AhrefsBot|GPTBot|ClaudeBot|Bytespider|PetalBot|MJ12bot|DotBot/i;

function isAutomationUa(ua) {
	return AUTOMATION_UA.test(String(ua || ''));
}

function isTestTraffic(row) {
	const data = row || {};
	if (data.test === true || data.traffic === 'test') return true;
	if (data.email && reviewTest.isTestAccount(data.email)) return true;
	if (isAutomationUa(data.userAgent)) return true;
	const page = String(data.page || '');
	if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(String(data.referrerHost || ''))) return true;
	if (/[?&]cvpreview=1(?:&|$)/i.test(String(data.query || ''))) return true;
	if (page === 'about:blank') return true;
	return false;
}

function splitTraffic(rows) {
	const real = [];
	const testing = [];
	(rows || []).forEach((row) => {
		(isTestTraffic(row) ? testing : real).push(row);
	});
	return { real, testing };
}

function isCvLeadEvent(row) {
	const data = row || {};
	if (data.kind === 'export' && /^(export_cv|print_cv)$/.test(String(data.name || ''))) return true;
	if (data.kind === 'click' && String(data.name || '') === 'share_cv') return true;
	if (data.action && /^(export|share|download)$/.test(String(data.action))) return true;
	return false;
}

module.exports = {
	isAutomationUa,
	isTestTraffic,
	splitTraffic,
	isCvLeadEvent,
	AUTOMATION_UA,
};
