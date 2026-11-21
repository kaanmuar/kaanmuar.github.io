'use strict';

/* Customer trust grade and security.txt audit (#3843, slice 1 of the ticket). Everything here reads what the review
   already fetched: the findings it produced, the /.well-known/security.txt answer it already got, the response
   headers. Nothing is sent and no URL is probed.
   - trustGrade: an A+ to F letter for the security of the site as a visitor sees it. The scale (letters with +/-, a
     bonus above 100 for A+) follows the idea of mdn/mdn-http-observatory (MPL-2.0). The code and the point table
     are our own, a clean-room version; no Observatory source or scoring table was copied.
   - securityTxtAudit: the RFC 9116 rules for /.well-known/security.txt. The idea of auditing the file field by field
     follows disclose/diodb (CC0-1.0); the checks are written from the RFC.
   - helmetSnippet: a helmet (MIT) setup for the headers a site is missing, plus a plain middleware for the one
     header helmet does not set (Permissions-Policy). */

const { say } = require('./url-review-findings-en');

// Points taken off 100, by finding key. A number applies to any failing or risky finding of that key; an object
// is picked by the finding's severity, then by its verdict.
const DEDUCT = {
	'sec-backdoored': 60,
	'sec-http': { fail: 20, risk: 5 },
	'sec-hsts': { fail: 20, risk: 5 },
	'sec-csp': { high: 25, medium: 20, low: 5 },
	'sec-csp-bypass': { medium: 10, low: 5 },
	'sec-frame': 10,
	'sec-nosniff': 5,
	'sec-referrer': 5,
	'sec-permissions': 3,
	'sec-coop': 3,
	'sec-isolation': 5,
	'sec-cookies': { high: 20, medium: 15, low: 5 },
	'sec-mixed': 10,
	'sec-sri': 5,
	'sec-sri-gaps': { medium: 5, low: 2 },
	'sec-libraries': { critical: 25, high: 15, medium: 8, low: 3 },
	'sec-version': 2,
	'sec-securitytxt': 3,
	'sec-securitytxt-quality': 2,
};

// Points above 100 for the habits that make a site hard to attack. Only a clean sheet reaches A+.
const BONUS = [
	{ key: 'sec-csp', points: 3 },
	{ key: 'sec-coop', points: 1 },
	{ key: 'sec-securitytxt', points: 1 },
];

const BANDS = [
	[100, 'A+'],
	[90, 'A'],
	[85, 'A-'],
	[80, 'B+'],
	[70, 'B'],
	[65, 'B-'],
	[60, 'C+'],
	[50, 'C'],
	[45, 'C-'],
	[40, 'D+'],
	[30, 'D'],
	[25, 'D-'],
];

function letter(score, capped) {
	if (capped) return 'F';
	const band = BANDS.find((row) => score >= row[0]);
	return band ? band[1] : 'F';
}

function pointsFor(item) {
	const rule = DEDUCT[item.key];
	if (rule == null) return 0;
	if (typeof rule === 'number') return rule;
	return rule[item.severity] != null ? rule[item.severity] : rule[item.verdict] != null ? rule[item.verdict] : 0;
}

/* findings: the review's finding list ({ key, verdict, severity }). Returns the score (0-105), the letter, the rows
   that cost points (largest first, so rows[0] is the best fix) and the bonus rows earned. */
function trustGrade(findings) {
	const list = Array.isArray(findings) ? findings : [];
	const open = list.filter((item) => item && (item.verdict === 'fail' || item.verdict === 'risk'));
	const rows = [];
	open.forEach((item) => {
		const points = pointsFor(item);
		if (points > 0) rows.push({ key: item.key, severity: item.severity, points });
	});
	rows.sort((a, b) => b.points - a.points);
	const lost = rows.reduce((sum, row) => sum + row.points, 0);
	const passed = (key) =>
		list.some((item) => item && item.key === key && item.verdict === 'pass') && !open.some((item) => item.key === key);
	const bonus =
		lost === 0 ? BONUS.filter((row) => passed(row.key)).map((row) => ({ key: row.key, points: row.points })) : [];
	const score = Math.max(0, 100 - lost) + bonus.reduce((sum, row) => sum + row.points, 0);
	const capped = open.some((item) => item.key === 'sec-backdoored');
	return { score: Math.min(105, score), grade: letter(score, capped), capped, rows, bonus };
}

const FIELD_NAME = /^[A-Za-z][A-Za-z0-9-]*$/;

function fieldsOf(body) {
	const fields = [];
	String(body || '')
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/)
		.forEach((line) => {
			if (!line.trim() || /^\s*#/.test(line) || /^-----(BEGIN|END) PGP/.test(line)) return;
			const colon = line.indexOf(':');
			const name = colon > 0 ? line.slice(0, colon).trim() : '';
			if (FIELD_NAME.test(name)) fields.push({ name: name.toLowerCase(), value: line.slice(colon + 1).trim() });
		});
	return fields;
}

const contactOk = (value) => /^(mailto:[^\s@]+@[^\s@]+|tel:\+?[0-9][0-9 ().-]{3,}|https?:\/\/\S+)$/i.test(value);
const MONTH_AHEAD = 366 * 24 * 3600 * 1000;

function sameUrl(a, b) {
	const norm = (text) =>
		String(text || '')
			.trim()
			.replace(/(?<!\/)\/+$/, '')
			.toLowerCase();
	return norm(a) === norm(b);
}

/* sec: the review's security.txt answer ({ status, url, body, contentType, html }). Returns { present, issues: [{ id,
   detail }] }, issue ids: noExpires, badExpires, farExpires, multipleExpires, badContact, plainHttpContact,
   canonicalMismatch, wrongType. A file without any Contact line is "present: false": the review already reports that. */
function securityTxtAudit(sec, now) {
	const empty = { present: false, issues: [] };
	if (!sec || sec.status !== 200 || sec.html || !/contact\s*:/i.test(sec.body || '')) return empty;
	const clock = now == null ? Date.now() : now;
	const fields = fieldsOf(sec.body);
	const issues = [];
	const add = (id, detail) => {
		issues.push({ id, detail: detail || '' });
	};
	const expires = fields.filter((field) => field.name === 'expires');
	if (!expires.length) add('noExpires');
	else {
		if (expires.length > 1) add('multipleExpires', String(expires.length));
		const when = Date.parse(expires[0].value);
		if (isNaN(when)) add('badExpires', expires[0].value.slice(0, 40));
		else if (when > clock + MONTH_AHEAD) add('farExpires', expires[0].value.slice(0, 40));
	}
	const contacts = fields.filter((field) => field.name === 'contact');
	const bad = contacts.filter((field) => !contactOk(field.value));
	if (bad.length) add('badContact', bad[0].value.slice(0, 60));
	const plain = contacts.find((field) => /^http:\/\//i.test(field.value));
	if (plain) add('plainHttpContact', plain.value.slice(0, 60));
	const canonical = fields.filter((field) => field.name === 'canonical').map((field) => field.value);
	if (canonical.length && sec.url && !canonical.some((value) => sameUrl(value, sec.url)))
		add('canonicalMismatch', canonical[0].slice(0, 80));
	if (sec.contentType && !/^text\/plain\b/i.test(sec.contentType))
		add('wrongType', String(sec.contentType).split(';')[0].slice(0, 40));
	return { present: true, issues };
}

function securityTxtFindings(sec, add, now) {
	const audit = securityTxtAudit(sec, now);
	if (!audit.issues.length) return audit;
	const labels = audit.issues.map((item) => say('sec-securitytxt-quality.issue.' + item.id, { detail: item.detail }));
	add(
		'Security',
		'risk',
		'low',
		'sec-securitytxt-quality',
		say('sec-securitytxt-quality.title', { n: labels.length }),
		say('sec-securitytxt-quality.evidence', { list: { items: labels, sep: '; ' } }),
		say('sec-securitytxt-quality.fix'),
		{ count: labels.length, effort: 'minutes' }
	);
	return audit;
}

/* missingNames: the names of the fix-kit headers the site lacks. Returns "" when nothing is missing. */
function helmetSnippet(missingNames) {
	const miss = (name) => (missingNames || []).indexOf(name) !== -1;
	const opts = [];
	if (miss('Strict-Transport-Security'))
		opts.push('  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },');
	if (miss('Content-Security-Policy-Report-Only') || miss('Content-Security-Policy')) {
		opts.push('  // Start in report-only mode, read the reports, then drop reportOnly.');
		opts.push('  contentSecurityPolicy: { useDefaults: true, reportOnly: true },');
	}
	if (miss('X-Content-Type-Options')) opts.push('  xContentTypeOptions: true,');
	if (miss('X-Frame-Options')) opts.push('  xFrameOptions: { action: "sameorigin" },');
	if (miss('Referrer-Policy')) opts.push('  referrerPolicy: { policy: "strict-origin-when-cross-origin" },');
	if (miss('Cross-Origin-Opener-Policy'))
		opts.push('  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },');
	const lines = [];
	if (opts.length) {
		lines.push('// npm install helmet', 'const helmet = require("helmet");', 'app.use(helmet({');
		lines.push.apply(lines, opts);
		lines.push('}));');
	}
	if (miss('Permissions-Policy')) {
		if (lines.length) lines.push('');
		lines.push(
			'// helmet does not set Permissions-Policy, so add it by hand.',
			'app.use((req, res, next) => {',
			'  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");',
			'  next();',
			'});'
		);
	}
	return lines.length ? lines.concat('').join('\n') : '';
}

module.exports = { DEDUCT, BONUS, letter, trustGrade, fieldsOf, securityTxtAudit, securityTxtFindings, helmetSnippet };
