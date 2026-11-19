// Full set (#3826 round two): one face per report section, check and cyber item, named as the report names them.
// Paths follow symbols.js: 64-unit grid, each part is one path whose subpaths do not overlap unless rule is evenodd.
import { PALETTE, ITEMS } from './symbols.js';

const r2 = (n) => Math.round(n * 100) / 100;
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const ellipse = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;
const ring = (cx, cy, r, w) => `${circle(cx, cy, r)} ${circle(cx, cy, r - w)}`;
const rrect = (x, y, w, h, r) => `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;
const pt = (cx, cy, r, deg) => [r2(cx + r * Math.cos((deg * Math.PI) / 180)), r2(cy + r * Math.sin((deg * Math.PI) / 180))];
// Band along a circle from a0 to a1 degrees (0 = right, 90 = down), as a closed shape.
function arcBand(cx, cy, r, w, a0, a1) {
	const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
	const [x0, y0] = pt(cx, cy, r, a0);
	const [x1, y1] = pt(cx, cy, r, a1);
	const [x2, y2] = pt(cx, cy, r - w, a1);
	const [x3, y3] = pt(cx, cy, r - w, a0);
	return `M${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r - w} ${r - w} 0 ${large} 0 ${x3} ${y3}Z`;
}
function gear(cx, cy, ro, ri, teeth) {
	const pts = [];
	for (let i = 0; i < teeth * 4; i++) {
		const a = (i / (teeth * 4)) * 360;
		pts.push(pt(cx, cy, i % 4 < 2 ? ro : ri, a));
	}
	return `M${pts.map((p) => p.join(' ')).join('L')}Z`;
}
const check = (cx, cy, s = 1) => {
	const p = [[-5.2, 0.1], [-3.1, -2], [-1.1, 0], [3.1, -4.2], [5.2, -2.1], [-1.1, 4.2]];
	return `M${p.map(([x, y]) => `${r2(cx + x * s)} ${r2(cy + y * s)}`).join('L')}Z`;
};
const star = (cx, cy, r) => `M${cx} ${cy - r}L${r2(cx + r * 0.26)} ${r2(cy - r * 0.26)}L${cx + r} ${cy}L${r2(cx + r * 0.26)} ${r2(cy + r * 0.26)}L${cx} ${cy + r}L${r2(cx - r * 0.26)} ${r2(cy + r * 0.26)}L${cx - r} ${cy}L${r2(cx - r * 0.26)} ${r2(cy - r * 0.26)}Z`;

const B = {
	circle: circle(32, 32, 26),
	square: rrect(7, 7, 50, 50, 13),
	doc: 'M13 5h27l11 11v43H13z',
	window: 'M7 11h50v42H7z',
	shield: 'M32 5 L53 12.5 V30 C53 43.5 44 53.5 32 59 C20 53.5 11 43.5 11 30 V12.5 Z',
	hex: 'M32 5l23.4 13.5v27L32 59 8.6 45.5v-27z',
};
const fold = { d: 'M40 5v11h11z', anim: 'none', tone: 'dim' };
const bar = (x, y, w, h, anim = 'none', delay = 0) => ({ d: rect(x, y, w, h), anim, delay });
const P = (d, anim = 'none', delay = 0, extra = {}) => ({ d, anim, delay, ...extra });
const { cyan, gold, mint, violet, teal } = PALETTE;
const reuse = (id, patch) => ({ ...ITEMS.find((i) => i.id === id), ...patch });

export const GROUPS = [
	['report', 'Report and summary'],
	['seen', 'What people, Google and AI see'],
	['security', 'Security and email'],
	['cyber', 'Cyber-attack side'],
	['work', 'Working with the report'],
];

export const FULL = [
	// Report and summary
	{ id: 'health', group: 'report', name: 'Health score', accent: cyan, base: B.circle, parts: [P(arcBand(32, 35, 18, 5, 150, 390), 'none', 0, { tone: 'dim' }), P(arcBand(32, 35, 18, 5, 150, 300), 'pulse'), P('M30.4 35l9.8-14.6 2.8 1.8-9.8 14.6z', 'blink'), P(circle(32, 36, 3.6))] },
	{ id: 'summary', group: 'report', name: 'One-page summary', accent: cyan, base: B.doc, parts: [fold, bar(20, 24, 22, 3.6, 'slide', 0), bar(20, 31.5, 22, 3.6, 'slide', 0.3), bar(20, 39, 22, 3.6, 'slide', 0.6), bar(20, 46.5, 13, 3.6, 'slide', 0.9)] },
	{ id: 'compare', group: 'report', name: 'Next to a competitor', accent: violet, base: B.square, parts: [bar(17, 30, 11, 18, 'pulse', 0), bar(36, 19, 11, 29, 'pulse', 0.5), P(rect(14, 50.5, 36, 2.8))] },
	{ id: 'fixfirst', group: 'report', name: 'Fix first', accent: gold, base: B.circle, parts: [P('M32 13l13 14h-8v19H27V27h-8z', 'float'), P(rect(22, 48.5, 20, 3.4), 'blink')] },
	{ id: 'verdicts', group: 'report', name: 'Every check, with its verdict', accent: mint, base: B.doc, parts: [fold, P(check(23, 26, 0.9), 'blink', 0, { tone: 'beam' }), bar(30, 24, 14, 3.4), P(check(23, 35.5, 0.9), 'blink', 0.4, { tone: 'beam' }), bar(30, 33.5, 14, 3.4), P(check(23, 45, 0.9), 'blink', 0.8, { tone: 'beam' }), bar(30, 43, 10, 3.4)] },
	{ id: 'pages', group: 'report', name: 'Pages analyzed', accent: cyan, base: B.square, parts: [P(rect(24, 13, 22, 29), 'none', 0, { tone: 'dim' }), P(rect(18, 20, 22, 31), 'float'), bar(22, 27, 14, 2.8), bar(22, 33, 14, 2.8), bar(22, 39, 9, 2.8)] },
	{ id: 'sitemap', group: 'report', name: 'Map of the pages analyzed', accent: cyan, base: B.square, parts: [P(rect(26, 13, 12, 9), 'pulse'), P(`${rect(30.8, 22, 2.4, 8)} ${rect(17, 29, 30, 2.4)} ${rect(17, 31.4, 2.4, 7)} ${rect(30.8, 31.4, 2.4, 7)} ${rect(44.6, 31.4, 2.4, 7)}`), P(rect(12, 38.4, 12, 9), 'blink', 0), P(rect(26, 38.4, 12, 9), 'blink', 0.3), P(rect(40, 38.4, 12, 9), 'blink', 0.6)] },
	{ id: 'bulk', group: 'report', name: 'Bulk review', accent: cyan, base: B.square, parts: [P(rrect(15, 15, 15, 15, 4), 'blink', 0), P(rrect(34, 15, 15, 15, 4), 'blink', 0.3), P(rrect(15, 34, 15, 15, 4), 'blink', 0.6), P(rrect(34, 34, 15, 15, 4), 'blink', 0.9)] },
	{ id: 'log', group: 'report', name: 'Review log', accent: teal, base: B.doc, parts: [fold, bar(19, 19, 18, 3.4, 'slide', 0), bar(19, 26, 14, 3.4, 'slide', 0.3), bar(19, 33, 10, 3.4, 'slide', 0.6), P(circle(41, 43, 10), 'pulse'), P(`${rect(40, 36, 2.4, 8)} ${rect(40, 41.6, 7, 2.4)}`, 'none', 0, { tone: 'ink' })] },
	{ id: 'export', group: 'report', name: 'Take this list with you', accent: mint, base: B.square, parts: [P('M28 12h8v15h8L32 40 20 27h8z', 'float'), P('M14 42h4.5v6.5h27V42H50v11H14z')] },
	// What people, Google and AI see
	{ id: 'browser', group: 'seen', name: 'In a real browser', accent: cyan, base: B.window, parts: [P(rect(7, 11, 50, 8), 'none', 0, { tone: 'dim' }), P('M27 24v21l5.2-5.2 4.2 8.8 3.8-1.7-4.2-8.7 7.4-.6z', 'float')] },
	{ id: 'preview', group: 'seen', name: 'How it looks in Google and when shared', accent: gold, base: B.square, parts: [P(rect(15, 15, 34, 15), 'none', 0, { tone: 'dim' }), bar(15, 34, 28, 3.6, 'slide', 0), bar(15, 41, 20, 3, 'slide', 0.3), P('M44 40l7 5.5-7 5.5v-3.4h-6v-4.2h6z', 'blink')] },
	{ id: 'ai', group: 'seen', name: 'What AI sees', accent: violet, base: B.circle, parts: [P('M11 33C17 23 24 19 32 19s15 4 21 14c-6 10-13 14-21 14s-15-4-21-14z M17 33c5-7.5 10-10.5 15-10.5s10 3 15 10.5c-5 7.5-10 10.5-15 10.5s-10-3-15-10.5z', 'none', 0, { rule: 'evenodd' }), P(circle(32, 33, 6), 'pulse'), P(star(48, 15, 7), 'blink')] },
	{ id: 'seo', group: 'seen', name: 'Search visibility', accent: gold, base: B.circle, parts: [P(ring(28, 28, 13, 3.8), 'pulse', 0, { rule: 'evenodd' }), P('M36.6 39.4l2.8-2.8 10.4 10.4-2.8 2.8z'), bar(22, 30, 3, 4, 'slide', 0), bar(26.5, 26, 3, 8, 'slide', 0.25), bar(31, 22, 3, 12, 'slide', 0.5)] },
	{ id: 'analytics', group: 'seen', name: 'Analytics and consent', accent: gold, base: B.square, parts: [bar(16, 36, 7, 12, 'slide', 0), bar(28.5, 27, 7, 21, 'slide', 0.25), bar(41, 18, 7, 30, 'slide', 0.5), P(rect(13, 50, 38, 2.6))] },
	reuse('a11y', { group: 'seen' }),
	{ id: 'perf', group: 'seen', name: 'Performance', accent: gold, base: B.circle, parts: [P('M36 9L18 36h12l-4 19 20-29H34z', 'pulse')] },
	{ id: 'privacy', group: 'seen', name: 'Privacy fingerprinting', accent: violet, base: B.circle, parts: [6, 11, 16, 21].map((r, i) => P(arcBand(32, 36, r, 2.6, 195 - i * 4, 345 + i * 4), 'blink', i * 0.25)).concat([P(rect(30.7, 36, 2.6, 13), 'blink', 1)]) },
	{ id: 'legal', group: 'seen', name: 'Legal pages', accent: gold, base: B.circle, parts: [P(`${rect(30.5, 15, 3, 31)} ${rect(15, 19, 34, 3)}`), P(rect(22, 46, 20, 4)), P('M11 31h16a8 8 0 0 1-16 0z', 'float', 0), P('M37 31h16a8 8 0 0 1-16 0z', 'float', 1.7)] },
	// Security and email
	reuse('sec', { group: 'security' }),
	reuse('mail', { group: 'security', name: 'SPF · DKIM · DMARC' }),
	{ id: 'tls', group: 'security', name: 'TLS and redirects', accent: mint, base: B.shield, parts: [P('M22.5 31v-6a9.5 9.5 0 0 1 19 0v6h-4.4v-6a5.1 5.1 0 0 0-10.2 0v6z', 'float'), P(rect(19, 31, 26, 18)), P('M28.6 38a3.4 3.4 0 1 1 5.6 2.6V45h-4.4v-4.4a3.4 3.4 0 0 1-1.2-2.6z', 'blink', 0, { tone: 'ink' })] },
	{ id: 'wordpress', group: 'security', name: 'WordPress plugins', accent: cyan, base: B.circle, parts: [P(`${rect(24, 11, 4.4, 11)} ${rect(35.6, 11, 4.4, 11)}`, 'blink'), P('M19 22h26v10a13 13 0 0 1-26 0z'), P(rect(29.8, 44.5, 4.4, 9))] },
	{ id: 'response', group: 'security', name: 'What the response showed', accent: cyan, base: B.window, parts: [P(rect(7, 11, 50, 8), 'none', 0, { tone: 'dim' }), P('M26 27l-8 8 8 8 2.8-2.8-5.2-5.2 5.2-5.2z'), P('M38 27l8 8-8 8-2.8-2.8 5.2-5.2-5.2-5.2z'), P('M33.4 24.5h3.2l-6 21h-3.2z', 'blink')] },
	{ id: 'login', group: 'security', name: 'A login you are allowed to use', accent: gold, base: B.circle, parts: [P(ring(22, 32, 10, 4), 'pulse', 0, { rule: 'evenodd' }), P(rect(31, 30, 23, 4.2), 'slide'), P(`${rect(46, 34.2, 4.2, 6)} ${rect(39.5, 34.2, 3.6, 4.2)}`, 'slide')] },
	// Cyber-attack side
	reuse('hack', { group: 'cyber', name: 'Hacked-site signs' }),
	{ id: 'targeted', group: 'cyber', name: 'Was it targeted?', accent: mint, base: B.circle, parts: [P(ring(32, 32, 17, 3.4), 'none', 0, { rule: 'evenodd' }), P(`${rect(30.3, 8, 3.4, 12)} ${rect(30.3, 44, 3.4, 12)} ${rect(8, 30.3, 12, 3.4)} ${rect(44, 30.3, 12, 3.4)}`, 'blink'), P(circle(32, 32, 4.4), 'pulse', 0, { tone: 'beam' })], deco: 'rings' },
	{ id: 'phishing', group: 'cyber', name: 'Phishing lists', accent: mint, base: B.circle, parts: [P(`${arcBand(31, 37, 11, 4, 0, 180)} ${rect(38, 13, 4, 24)}`, 'float'), P('M16.5 38.5l4-9 3.6 6.4z', 'float'), P(ring(40, 12.5, 4, 2), 'float', 0, { rule: 'evenodd' })] },
	{ id: 'malware', group: 'cyber', name: 'Malware lists', accent: mint, base: B.circle, parts: [P(`${rect(13, 27, 9, 2.6)} ${rect(42, 27, 9, 2.6)} ${rect(12, 36, 10, 2.6)} ${rect(42, 36, 10, 2.6)} ${rect(14, 45, 9, 2.6)} ${rect(41, 45, 9, 2.6)}`, 'blink'), P(ellipse(32, 37, 10, 13)), P(circle(32, 20.5, 5.5), 'pulse'), P(rect(31, 26, 2, 22), 'none', 0, { tone: 'ink' })] },
	{ id: 'spam', group: 'cyber', name: 'Spam blocklists', accent: teal, base: B.square, parts: [P('M10 17h30v22H10z', 'none', 0, { tone: 'dim' }), P(ring(42, 40, 12, 3.4), 'pulse', 0, { rule: 'evenodd' }), P('M33.6 33.5l2.4-2.4 14.6 14.6-2.4 2.4z', 'pulse')] },
	{ id: 'lookalike', group: 'cyber', name: 'Lookalike domains', accent: mint, base: B.square, parts: [P(rrect(11, 15, 30, 15, 5), 'none', 0, { tone: 'dim' }), P(rrect(23, 34, 30, 15, 5), 'float'), P(`${rect(30, 39.5, 6, 2.4)} ${rect(30, 43.5, 6, 2.4)}`, 'blink', 0, { tone: 'ink' })] },
	{ id: 'linked', group: 'cyber', name: 'Linked hosts', accent: teal, base: B.circle, parts: [P(`${rrect(9, 24, 27, 16, 8)} ${rrect(13.4, 28.4, 18.2, 7.2, 3.6)}`, 'none', 0, { rule: 'evenodd' }), P(`${rrect(28, 24, 27, 16, 8)} ${rrect(32.4, 28.4, 18.2, 7.2, 3.6)}`, 'slide', 0, { rule: 'evenodd' })] },
	{ id: 'exposed', group: 'cyber', name: 'Exposed files', accent: mint, base: B.square, parts: [P('M11 22h15l4 4h23v24H11z'), P('M41 9l9 9h-5.5v8h-7v-8H32z', 'float', 0, { tone: 'beam' })] },
	{ id: 'exploit', group: 'cyber', name: 'Known exploits', accent: mint, base: B.shield, parts: [P('M35 13L23 34h8l-3 17 13-22h-8z', 'flicker')] },
	{ id: 'ransomware', group: 'cyber', name: 'Ransomware', accent: teal, base: B.doc, parts: [fold, bar(19, 21, 15, 3.2), bar(19, 28, 11, 3.2), P('M37.5 37v-4a6 6 0 0 1 12 0v4h-3.2v-4a2.8 2.8 0 0 0-5.6 0v4z', 'float'), P(rect(34, 37, 19, 15), 'pulse')] },
	{ id: 'ddos', group: 'cyber', name: 'DDoS', accent: mint, base: B.square, parts: [P('M20 10l12 7.5L44 10v4.4l-12 7.5-12-7.5z', 'blink', 0), P('M20 19l12 7.5L44 19v4.4l-12 7.5-12-7.5z', 'blink', 0.35), P(rect(18, 35, 28, 7)), P(rect(18, 45, 28, 7)), P(`${circle(23, 38.5, 1.4)} ${circle(23, 48.5, 1.4)}`, 'blink', 0.7, { tone: 'ink' })] },
	{ id: 'history', group: 'cyber', name: 'Past listings', accent: teal, base: B.circle, parts: [P(arcBand(32, 33, 17, 3.6, -50, 230)), P('M38.6 10.6l8.8 3.4-6.6 6.8z', 'blink'), P(`${rect(30.3, 22, 3.4, 12.5)} ${rect(33.7, 31.1, 8, 3.4)}`, 'none')] },
	{ id: 'cybermap', group: 'cyber', name: 'Cyber attacks map', accent: cyan, base: B.circle, parts: [P(`${ellipse(32, 32, 10.5, 25)} ${ellipse(32, 32, 8.3, 22.8)}`, 'spin', 0, { rule: 'evenodd' }), P(rect(7.4, 30.9, 49.2, 2.2)), P(arcBand(27, 40, 13, 2.2, 195, 345), 'blink', 0, { tone: 'beam' }), P(arcBand(41, 33, 9, 2.2, 195, 345), 'blink', 0.6, { tone: 'beam' }), P(`${circle(14.4, 36.6, 2.4)} ${circle(39.6, 36.6, 2.4)} ${circle(49.7, 30.7, 2.2)}`, 'pulse')] },
	// Working with the report
	{ id: 'fixkit', group: 'work', name: 'Fix kit', accent: gold, base: B.square, parts: [P('M23 28v-6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6h-4v-5H27v5z'), P(rect(13, 28, 38, 21)), P(rect(28.5, 33.5, 7, 7), 'pulse', 0, { tone: 'ink' })] },
	{ id: 'cases', group: 'work', name: 'Proposed cases by layer', accent: violet, base: B.square, parts: [14, 24, 34].map((y, i) => P(`M32 ${y}l17 7.5-17 7.5-17-7.5z`, 'float', i * 0.4)) },
	{ id: 'tech', group: 'work', name: 'Technologies seen', accent: cyan, base: B.square, parts: [P(`${rect(25, 13, 3, 8)} ${rect(36, 13, 3, 8)} ${rect(25, 43, 3, 8)} ${rect(36, 43, 3, 8)} ${rect(13, 25, 8, 3)} ${rect(13, 36, 8, 3)} ${rect(43, 25, 8, 3)} ${rect(43, 36, 8, 3)}`, 'blink'), P(rrect(20, 20, 24, 24, 4)), P(rrect(26, 26, 12, 12, 2.5), 'none', 0, { tone: 'ink' }), P(circle(32, 32, 2.6), 'pulse', 0, { tone: 'beam' })] },
	{ id: 'tools', group: 'work', name: 'Tools that apply', accent: gold, base: B.circle, parts: [P(`${gear(32, 32, 19, 15, 9)} ${circle(32, 32, 6.5)}`, 'turn', 0, { rule: 'evenodd' })] },
	{ id: 'ask', group: 'work', name: 'Ask the report', accent: violet, base: B.circle, parts: [P('M12 14h40v27H30.5l-9 8.5V41H12z'), P(star(32, 27.5, 9.5), 'pulse', 0, { tone: 'ink' })] },
	{ id: 'call', group: 'work', name: 'Go through this report with Carlos', accent: mint, base: B.circle, parts: [P(rrect(12, 22, 27, 21, 4)), P('M41 28.5l11-6.5v21l-11-6.5z', 'blink'), P('M22.5 27.5l9 5-9 5z', 'pulse', 0, { tone: 'ink' })] },
	{ id: 'writeups', group: 'work', name: 'Public write-ups', accent: cyan, base: B.doc, parts: [fold, bar(19, 18, 19, 4.4, 'slide', 0), P(rect(19, 27, 10, 10), 'none', 0, { tone: 'dim' }), bar(32, 27, 12, 3, 'slide', 0.3), bar(32, 33, 12, 3, 'slide', 0.5), bar(19, 41, 25, 3, 'slide', 0.7), bar(19, 47, 18, 3, 'slide', 0.9)] },
	reuse('live', { group: 'work' }),
];
