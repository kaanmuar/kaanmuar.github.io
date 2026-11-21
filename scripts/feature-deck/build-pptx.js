#!/usr/bin/env node
// Builds presentation/QA-lab-explained-simply.pptx from slides.js (#3931).
//   node scripts/feature-deck/build-pptx.js [--no-anim]
// Needs the pictures from prep-media.js and render-pptx-assets.js. After pptxgenjs writes the file, this script adds
// slide transitions and a fade-in for each card and bullet to the slide XML (pptxgenjs has no API for either).
const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const JSZip = require('jszip');
const { SECTIONS, slides } = require('./slides.js');

const NO_ANIM = process.argv.includes('--no-anim');
const root = path.resolve(__dirname, '..', '..');
const pres = path.join(root, 'presentation');
const cache = path.join(__dirname, '.cache');
const outFile = path.join(pres, 'QA-lab-URL-Review-explained.pptx');
const secById = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

const C = { bg: '071116', ink: 'E8F3F4', muted: '9FB3B8', cyan: '7EF6FB', teal: '4DB3BB', gold: 'E2C48A', green: '6FE3B1', coral: 'F39A8B', violet: 'B9A8FF', white: 'FFFFFF' };
const HEAD = 'Georgia';
const BODY = 'Arial';
const W = 13.333;
const H = 7.5;

// ------------------------------------------------------------------ text measuring (Arial is about 0.52 em per character)
const lines = (text, wIn, pt) => {
	const per = Math.max(1, Math.floor((wIn * 72) / (pt * 0.53)));
	let n = 1;
	let cur = 0;
	for (const word of String(text).split(/\s+/)) {
		const l = word.length + (cur ? 1 : 0);
		if (cur + l > per) {
			n++;
			cur = word.length;
		} else cur += l;
	}
	return n;
};
const hOf = (text, wIn, pt, lh = 1.22) => (lines(text, wIn, pt) * pt * lh) / 72;

// ------------------------------------------------------------------ deck + per-slide helpers
const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.title = 'QA-lab URL Review, explained simply';
pptx.author = 'QA-lab';
pptx.company = 'carlosandmunoz.com';
pptx.subject = 'How QA-lab URL Review works, tool by tool';
pptx.defineSlideMaster({ title: 'DECK', background: { path: path.join(cache, 'bg.png') } });

const face = (n) => path.join(cache, 'faces', n + '.png');
const animPlan = []; // per slide: [[objectName, ...], ...]

function ctx(slide, idx) {
	const groups = [];
	let g = -1;
	let k = 0;
	const c = {
		slide,
		next() {
			g++;
			k = 0;
			groups.push([]);
		},
		name() {
			const n = `g${g}_${k++}`;
			if (g >= 0) groups[g].push(n);
			return n;
		},
		groups,
	};
	animPlan[idx] = groups;
	return c;
}

const text = (c, t, o) =>
	c.slide.addText(t, { fontFace: BODY, color: C.ink, margin: 0, valign: 'top', fit: 'none', wrap: true, objectName: c.name(), ...o });
const rect = (c, o) => c.slide.addShape(pptx.ShapeType.roundRect, { objectName: c.name(), rectRadius: 0.12, ...o });
const panel = (c, x, y, w, h, o = {}) => rect(c, { x, y, w, h, fill: { color: C.white, transparency: 92 }, line: { color: C.cyan, width: 0.75, transparency: 75 }, ...o });
const icon = (c, ic, x, y, size) => {
	if (ic.face) c.slide.addImage({ path: face(ic.face), x, y, w: size, h: size, objectName: c.name() });
	else text(c, ic.icon || '', { x, y: y + size * 0.05, w: size, h: size, fontSize: Math.round(size * 48), align: 'center', valign: 'middle' });
};

function header(c, s, idx, secName) {
	text(c, (s.kicker || '').toUpperCase(), { x: 0.6, y: 0.5, w: 11, h: 0.3, fontSize: 12, bold: true, color: C.cyan, charSpacing: 3 });
	const len = (s.title || '').length;
	const pt = Math.min(34, Math.floor(((12.1 * 72) / (Math.max(1, len) * 0.55)) * 1));
	text(c, s.title || '', { x: 0.6, y: 0.82, w: 12.1, h: 0.8, fontSize: pt, bold: true, fontFace: HEAD, valign: 'middle' });
}
function footer(slide, idx, secName) {
	slide.addText(`QA-lab URL Review · explained${secName ? ' · ' + secName : ''}`, { x: 0.6, y: 7.08, w: 8, h: 0.25, fontSize: 9, color: C.muted, fontFace: BODY, margin: 0 });
	slide.addText(`${idx + 1} / ${slides.length}`, { x: 11.7, y: 7.08, w: 1.05, h: 0.25, fontSize: 9, color: C.muted, align: 'right', fontFace: BODY, margin: 0 });
}
function egBox(c, t, x, y, w) {
	if (!t) return;
	const pt = 14;
	const h = Math.max(0.5, hOf(t, w - 0.85, pt) + 0.26);
	c.next();
	rect(c, { x, y, w, h, fill: { color: C.gold, transparency: 86 }, line: { color: C.gold, width: 1, transparency: 55 } });
	text(c, '💡', { x: x + 0.16, y, w: 0.4, h, fontSize: 16, valign: 'middle' });
	text(c, t, { x: x + 0.65, y, w: w - 0.8, h, fontSize: pt, bold: true, color: C.gold, valign: 'middle' });
	return h;
}
function frameShot(c, x, y, w, imgPath, video) {
	const vh = (w * 10) / 16;
	c.next();
	rect(c, { x, y, w, h: vh + 0.32, rectRadius: 0.14, fill: { color: '0C1A1F' }, line: { color: C.cyan, width: 1, transparency: 65 } });
	[C.coral, C.gold, C.green].forEach((col, i) => c.slide.addShape(pptx.ShapeType.ellipse, { x: x + 0.18 + i * 0.22, y: y + 0.1, w: 0.12, h: 0.12, fill: { color: col }, line: { color: col, width: 0 }, objectName: c.name() }));
	if (video) {
		c.slide.addMedia({ type: 'video', path: video.path, cover: video.cover, x: x + 0.04, y: y + 0.32, w: w - 0.08, h: vh - 0.04, objectName: 'media' });
	} else c.slide.addImage({ path: imgPath, x: x + 0.04, y: y + 0.32, w: w - 0.08, h: vh - 0.04, objectName: c.name() });
	return vh + 0.32;
}
function bullets(c, items, x, y, w, pt = 17) {
	let yy = y;
	for (const t of items) {
		const h = hOf(t, w - 0.55, pt, 1.25);
		c.next();
		c.slide.addShape(pptx.ShapeType.ellipse, { x, y: yy + 0.02, w: 0.3, h: 0.3, fill: { color: C.green }, line: { color: C.green, width: 0 }, objectName: c.name() });
		text(c, '✓', { x, y: yy + 0.02, w: 0.3, h: 0.3, fontSize: 11, bold: true, color: '04281A', align: 'center', valign: 'middle' });
		text(c, t, { x: x + 0.5, y: yy, w: w - 0.5, h, fontSize: pt, lineSpacingMultiple: 1.0 });
		yy += h + 0.22;
	}
	return yy;
}
const gifInfo = (n) => JSON.parse(fs.readFileSync(path.join(cache, 'gif', n + '.json'), 'utf8'));
const b64 = (p) => 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64');

// ------------------------------------------------------------------ layouts
const L = {
	title(c, s) {
		const pos = [[0.9, 1.0], [11.9, 1.2], [1.5, 5.6], [11.4, 5.5], [3.6, 0.5], [9.4, 0.55], [0.7, 3.3], [12.0, 3.4]];
		['seo', 'sec', 'ai', 'a11y', 'perf', 'mail', 'targeted', 'exploit'].forEach((f, i) => c.slide.addImage({ path: face(f), x: pos[i][0], y: pos[i][1], w: 0.75, h: 0.75, transparency: 45 }));
		c.next();
		c.slide.addImage({ path: path.join(cache, 'mark.png'), x: W / 2 - 0.7, y: 1.35, w: 1.4, h: 1.4, objectName: c.name() });
		text(c, s.title, { x: 1, y: 3.0, w: W - 2, h: 1.2, fontSize: 56, bold: true, fontFace: HEAD, align: 'center', valign: 'middle' });
		text(c, s.sub, { x: 1, y: 4.3, w: W - 2, h: 0.6, fontSize: 24, align: 'center' });
		rect(c, { x: W / 2 - 3.6, y: 5.3, w: 7.2, h: 0.55, rectRadius: 0.27, fill: { color: C.white, transparency: 92 }, line: { color: C.cyan, width: 0.75, transparency: 60 } });
		text(c, s.tag, { x: W / 2 - 3.6, y: 5.3, w: 7.2, h: 0.55, fontSize: 14, color: C.cyan, align: 'center', valign: 'middle' });
	},
	section(c, s) {
		const sec = secById[s.section];
		c.next();
		text(c, String(sec.n).padStart(2, '0'), { x: 1, y: 0.9, w: W - 2, h: 2.6, fontSize: 150, bold: true, fontFace: HEAD, color: C.cyan, transparency: 62, align: 'center', valign: 'middle' });
		text(c, sec.icon, { x: 1, y: 3.35, w: W - 2, h: 0.9, fontSize: 48, align: 'center', valign: 'middle' });
		c.next();
		text(c, sec.title, { x: 1, y: 4.3, w: W - 2, h: 0.9, fontSize: 44, bold: true, fontFace: HEAD, align: 'center', valign: 'middle' });
		text(c, sec.sub, { x: 1, y: 5.25, w: W - 2, h: 0.5, fontSize: 20, color: C.muted, align: 'center' });
	},
	scene(c, s) {
		const gi = gifInfo(s.scene);
		let y = 2.0;
		for (const t of s.body) {
			const h = hOf(t, 5.4, 17, 1.28);
			c.next();
			text(c, t, { x: 0.6, y, w: 5.4, h, fontSize: 17 });
			y += h + 0.2;
		}
		egBox(c, s.eg, 0.6, Math.min(y + 0.1, 6.2), 5.4);
		const w = 6.5;
		const h = (w * gi.h) / gi.w;
		c.next();
		c.slide.addImage({ path: path.join(cache, 'gif', s.scene + '.gif'), x: 6.25, y: 1.95, w, h, objectName: c.name() });
	},
	steps(c, s) {
		const n = s.steps.length;
		const colW = 12.1 / n;
		c.slide.addShape(pptx.ShapeType.line, { x: 0.6 + colW / 2, y: 3.15, w: 12.1 - colW, h: 0, line: { color: C.teal, width: 3, dashType: 'dash' } });
		s.steps.forEach((st, i) => {
			const cx = 0.6 + colW * i + colW / 2;
			c.next();
			c.slide.addShape(pptx.ShapeType.ellipse, { x: cx - 0.8, y: 2.35, w: 1.6, h: 1.6, fill: { color: C.cyan, transparency: 88 }, line: { color: C.cyan, width: 1.5, transparency: 55 }, objectName: c.name() });
			text(c, st.icon, { x: cx - 0.8, y: 2.35, w: 1.6, h: 1.6, fontSize: 48, align: 'center', valign: 'middle' });
			c.slide.addShape(pptx.ShapeType.ellipse, { x: cx - 0.95, y: 2.25, w: 0.46, h: 0.46, fill: { color: C.cyan }, line: { color: C.cyan, width: 0 }, objectName: c.name() });
			text(c, String(i + 1), { x: cx - 0.95, y: 2.25, w: 0.46, h: 0.46, fontSize: 16, bold: true, color: '06262A', align: 'center', valign: 'middle' });
			// titles may wrap to two lines, so the description starts below that space
			text(c, st.t, { x: cx - colW / 2 + 0.2, y: 4.2, w: colW - 0.4, h: 0.75, fontSize: 19, bold: true, fontFace: HEAD, align: 'center' });
			text(c, st.d, { x: cx - colW / 2 + 0.3, y: 5.0, w: colW - 0.6, h: 0.95, fontSize: 14, color: C.muted, align: 'center' });
		});
		egBox(c, s.eg, W / 2 - 4, 6.0, 8);
	},
	cards(c, s) {
		const n = s.cards.length;
		const cols = s.cols || 3;
		const rows = Math.ceil(n / cols);
		const top = 1.85;
		const bottom = s.eg ? 6.2 : 6.85;
		const gap = 0.2;
		const cw = (12.13 - gap * (cols - 1)) / cols;
		const ch = Math.min(2.7, (bottom - top - gap * (rows - 1)) / rows);
		const left = n > 4;
		s.cards.forEach((cd, i) => {
			const x = 0.6 + (i % cols) * (cw + gap);
			const y = top + Math.floor(i / cols) * (ch + gap);
			c.next();
			panel(c, x, y, cw, ch);
			const isz = left ? 0.62 : 0.7;
			const tx = left ? x + 0.2 + isz + 0.18 : x + 0.24;
			const tw = left ? cw - (tx - x) - 0.2 : cw - 0.48;
			let ty = left ? y + 0.2 : y + 0.2 + isz + 0.12;
			icon(c, cd, x + 0.22, y + 0.2, isz);
			// shrink the text until the card holds it
			let tp = cols >= 4 ? 15 : 17;
			let dp = n > 4 ? 12 : 13.5;
			let lp = 11.5;
			const need = () => hOf(cd.t, tw, tp, 1.15) + 0.08 + hOf(cd.d, tw, dp) + (cd.like ? 0.08 + hOf(cd.like, tw, lp) : 0);
			const room = left ? ch - 0.35 : ch - (ty - y) - 0.15;
			while (need() > room && dp > 9.5) {
				tp -= 0.5;
				dp -= 0.5;
				lp -= 0.5;
			}
			const th = hOf(cd.t, tw, tp, 1.15);
			text(c, cd.t, { x: tx, y: ty, w: tw, h: th, fontSize: tp, bold: true, fontFace: HEAD });
			ty += th + 0.08;
			const dh = hOf(cd.d, tw, dp);
			text(c, cd.d, { x: tx, y: ty, w: tw, h: dh, fontSize: dp, color: 'CFE0E2' });
			ty += dh + 0.08;
			if (cd.like) text(c, cd.like, { x: tx, y: ty, w: tw, h: hOf(cd.like, tw, lp), fontSize: lp, italic: true, color: C.gold });
		});
		egBox(c, s.eg, 0.6, Math.min(top + rows * (ch + gap) + 0.05, 6.35), 12.13);
	},
	prices(c, s) {
		const cols = 3;
		const gap = 0.22;
		const cw = (12.13 - gap * 2) / cols;
		const ch = 2.15;
		s.cards.forEach((cd, i) => {
			const x = 0.6 + (i % cols) * (cw + gap);
			const y = 1.95 + Math.floor(i / cols) * (ch + gap);
			c.next();
			panel(c, x, y, cw, ch);
			text(c, cd.icon, { x: x + 0.25, y: y + 0.2, w: 0.7, h: 0.6, fontSize: 28 });
			text(c, cd.t, { x: x + 0.25, y: y + 0.85, w: cw - 0.5, h: 0.35, fontSize: 16, bold: true, fontFace: HEAD });
			text(c, cd.p, { x: x + 0.25, y: y + 1.2, w: 1.7, h: 0.6, fontSize: 32, bold: true, fontFace: HEAD, color: C.green });
			text(c, cd.d, { x: x + 1.8, y: y + 1.35, w: cw - 2.0, h: 0.35, fontSize: 13, color: C.muted, align: 'right' });
		});
		if (s.note) text(c, s.note, { x: 0.6, y: 6.7, w: 12, h: 0.3, fontSize: 12, color: C.muted });
	},
	shot(c, s) {
		const end = bullets(c, s.bullets, 0.6, 2.05, 5.0);
		egBox(c, s.eg, 0.6, Math.min(end + 0.1, 6.1), 5.0);
		frameShot(c, 6.0, 1.95, 6.75, path.join(pres, 'img', s.img + '.jpg'));
	},
	video(c, s) {
		const end = bullets(c, s.bullets, 0.6, 2.05, 5.0);
		egBox(c, s.eg, 0.6, Math.min(end + 0.1, 6.1), 5.0);
		const cover = b64(path.join(pres, 'img', `clip-${s.clip}.jpg`));
		const vp = path.join(pres, 'media', s.clip + '.mp4');
		if (s.tall) {
			const w = 2.45;
			const h = (w * 16) / 9;
			c.next();
			rect(c, { x: 8.7, y: 1.95, w: w + 0.12, h: h + 0.12, rectRadius: 0.22, fill: { color: '0C1A1F' }, line: { color: C.cyan, width: 2, transparency: 55 } });
			c.slide.addMedia({ type: 'video', path: vp, cover, x: 8.76, y: 2.01, w, h, objectName: 'media' });
		} else frameShot(c, 6.0, 1.95, 6.75, null, { path: vp, cover });
	},
	scores(c, s) {
		const gi = gifInfo('scores');
		const w = 12.13;
		const h = (w * gi.h) / gi.w;
		c.next();
		c.slide.addImage({ path: path.join(cache, 'gif', 'scores.gif'), x: 0.6, y: 1.95, w, h, objectName: c.name() });
		if (s.note) text(c, s.note, { x: 0.6, y: Math.min(1.95 + h + 0.2, 6.7), w: 12, h: 0.3, fontSize: 12, color: C.muted });
	},
	bignum(c, s) {
		const n = s.items.length;
		if (s.shot) {
			const cw = 2.65;
			s.items.forEach((it, i) => {
				const x = 0.6 + (i % 2) * (cw + 0.2);
				const y = 2.0 + Math.floor(i / 2) * 1.75;
				c.next();
				panel(c, x, y, cw, 1.55);
				text(c, it.n, { x, y: y + 0.12, w: cw, h: 0.8, fontSize: 36, bold: true, fontFace: HEAD, color: C.cyan, align: 'center', valign: 'middle' });
				text(c, it.l, { x: x + 0.1, y: y + 0.95, w: cw - 0.2, h: 0.5, fontSize: 13, align: 'center' });
			});
			egBox(c, s.eg, 0.6, 5.6, 5.5);
			frameShot(c, 6.4, 1.95, 6.35, path.join(pres, 'img', s.shot + '.jpg'));
			return;
		}
		const gap = 0.25;
		const cw = (12.13 - gap * (n - 1)) / n;
		s.items.forEach((it, i) => {
			const x = 0.6 + i * (cw + gap);
			c.next();
			panel(c, x, 2.2, cw, 2.4);
			text(c, it.n, { x, y: 2.5, w: cw, h: 1.1, fontSize: 52, bold: true, fontFace: HEAD, color: C.cyan, align: 'center', valign: 'middle' });
			text(c, it.l, { x: x + 0.15, y: 3.7, w: cw - 0.3, h: 0.7, fontSize: 16, align: 'center' });
		});
		egBox(c, s.eg, 0.6, 5.2, 12.13);
	},
	timeline(c, s) {
		const n = s.items.length;
		const cw = 12.13 / n;
		c.slide.addShape(pptx.ShapeType.line, { x: 0.6 + cw / 2, y: 3.55, w: 12.13 - cw, h: 0, line: { color: C.cyan, width: 3 } });
		s.items.forEach((it, i) => {
			const cx = 0.6 + cw * i + cw / 2;
			c.next();
			text(c, it.time, { x: cx - cw / 2, y: 2.45, w: cw, h: 0.35, fontSize: 15, bold: true, color: C.gold, align: 'center' });
			c.slide.addShape(pptx.ShapeType.ellipse, { x: cx - 0.45, y: 3.1, w: 0.9, h: 0.9, fill: { color: '0F2A30' }, line: { color: C.cyan, width: 2.5 }, objectName: c.name() });
			text(c, it.icon, { x: cx - 0.45, y: 3.1, w: 0.9, h: 0.9, fontSize: 24, align: 'center', valign: 'middle' });
			text(c, it.t, { x: cx - cw / 2 + 0.1, y: 4.25, w: cw - 0.2, h: 0.6, fontSize: 14, bold: true, fontFace: HEAD, align: 'center' });
			text(c, it.d, { x: cx - cw / 2 + 0.12, y: 4.95, w: cw - 0.24, h: 1.2, fontSize: 11.5, color: C.muted, align: 'center' });
		});
	},
	compare(c, s) {
		const side = (x, d, good) => {
			c.next();
			panel(c, x, 1.95, 5.5, 4.4, good ? { fill: { color: C.green, transparency: 88 }, line: { color: C.green, width: 1, transparency: 45 } } : {});
			text(c, d.icon, { x: x + 0.3, y: 2.1, w: 1, h: 0.9, fontSize: 40 });
			text(c, d.h, { x: x + 0.3, y: 3.0, w: 4.9, h: 0.5, fontSize: 22, bold: true, fontFace: HEAD });
			d.items.forEach((t, i) => {
				const blur = !good && i >= 3;
				text(c, (blur ? '▒ ' : '✓ ') + (blur ? t : t), { x: x + 0.3, y: 3.65 + i * 0.6, w: 4.9, h: 0.5, fontSize: 17, color: blur ? '5F7F86' : C.ink });
			});
		};
		side(0.6, s.left, false);
		text(c, 'vs', { x: 6.1, y: 3.8, w: 1.1, h: 0.6, fontSize: 24, fontFace: HEAD, color: C.muted, align: 'center' });
		side(7.23, s.right, true);
	},
	tools(c, s) {
		// one full-width row per tool; the columns follow the weights. Font shrinks until the rows fit the slide.
		const gap = 0.12;
		const total = s.weights.reduce((a, b) => a + b, 0);
		const usable = 12.13 - gap * (s.weights.length - 1);
		const cw = s.weights.map((w) => (usable * w) / total);
		const xs = [];
		let x = 0.6;
		cw.forEach((w) => {
			xs.push(x);
			x += w + gap;
		});
		const top = 1.85;
		const limit = s.eg ? 6.15 : 6.85;
		let pt = s.cols.length >= 5 ? 12.5 : 14;
		const measure = (p) => s.rows.map((r) => Math.max(...r.map((t, i) => hOf(t, cw[i] - 0.3, i === 0 ? p + 2 : p, 1.2))) + 0.3);
		let hs = measure(pt);
		const end = () => top + 0.42 + hs.reduce((a, b) => a + b, 0) + gap * (hs.length - 1);
		while (end() > limit && pt > 9.5) {
			pt -= 0.5;
			hs = measure(pt);
		}
		if (end() > limit) console.warn(`tools slide "${s.title}" runs to ${end().toFixed(2)} in`);
		s.cols.forEach((t, i) => text(c, t.toUpperCase(), { x: xs[i] + 0.15, y: top, w: cw[i] - 0.3, h: 0.3, fontSize: 10.5, bold: true, color: C.cyan, charSpacing: 1.5 }));
		let y = top + 0.42;
		s.rows.forEach((r, ri) => {
			const h = hs[ri];
			c.next();
			panel(c, 0.6, y, 12.13, h);
			r.forEach((t, i) => {
				const head = i === 0;
				text(c, t, { x: xs[i] + 0.15, y: y + 0.12, w: cw[i] - 0.3, h: h - 0.2, fontSize: head ? pt + 2 : pt, bold: head, fontFace: head ? HEAD : BODY, color: head ? C.cyan : C.ink, valign: 'top' });
			});
			y += h + gap;
		});
		if (s.eg) egBox(c, s.eg, 0.6, Math.min(y + 0.05, 6.55), 12.13);
	},
	gallery(c, s) {
		const cols = 8;
		const cw = 12.13 / cols;
		s.faces.forEach(([f, l], i) => {
			const x = 0.6 + (i % cols) * cw;
			const y = 1.95 + Math.floor(i / cols) * 1.45;
			c.next();
			c.slide.addImage({ path: face(f), x: x + (cw - 0.95) / 2, y, w: 0.95, h: 0.95, objectName: c.name() });
			text(c, l, { x: x + 0.05, y: y + 1.0, w: cw - 0.1, h: 0.4, fontSize: 12, align: 'center' });
		});
		if (s.note) text(c, s.note, { x: 0.6, y: 6.4, w: 12.1, h: 0.5, fontSize: 13, color: C.muted });
	},
	glossary(c, s) {
		const rows = Math.ceil(s.rows.length / 2);
		s.rows.forEach(([t, d], i) => {
			const col = i % 2;
			const r = Math.floor(i / 2);
			const x = 0.6 + col * 6.15;
			const y = 1.95 + r * 0.8;
			c.next();
			panel(c, x, y, 5.98, 0.68, { rectRadius: 0.1 });
			text(c, t, { x: x + 0.18, y, w: 1.85, h: 0.68, fontSize: 14, bold: true, fontFace: HEAD, color: C.cyan, valign: 'middle' });
			text(c, d, { x: x + 2.1, y, w: 3.75, h: 0.68, fontSize: 12.5, valign: 'middle' });
		});
	},
	end(c, s) {
		c.next();
		text(c, s.title, { x: 1, y: 0.9, w: W - 2, h: 1.2, fontSize: 44, bold: true, fontFace: HEAD, align: 'center', valign: 'middle' });
		s.links.forEach(([t, u], i) => {
			const x = 0.9 + (i % 2) * 5.9;
			const y = 2.5 + Math.floor(i / 2) * 1.2;
			c.next();
			panel(c, x, y, 5.6, 1.0);
			text(c, t, { x: x + 0.3, y: y + 0.12, w: 5, h: 0.35, fontSize: 17, bold: true, fontFace: HEAD });
			text(c, u, { x: x + 0.3, y: y + 0.55, w: 5, h: 0.3, fontSize: 12.5, color: C.cyan, hyperlink: { url: 'https://' + u, tooltip: t } });
		});
	},
};

// ------------------------------------------------------------------ build
let secName = '';
slides.forEach((s, i) => {
	const slide = pptx.addSlide({ masterName: 'DECK' });
	if (s.layout === 'section') secName = secById[s.section].title;
	if (s.wrap) secName = 'Wrap-up';
	const c = ctx(slide, i);
	if (!['title', 'section', 'end'].includes(s.layout)) header(c, s, i, secName);
	L[s.layout](c, s);
	if (s.layout !== 'title') footer(slide, i, secName);
	if (s.notes) slide.addNotes(s.notes);
});

// ------------------------------------------------------------------ transitions and fade-ins, written into the slide XML
const TRANS = ['<p:fade/>', '<p:push dir="l"/>', '<p:wipe dir="r"/>', '<p:cover dir="l"/>', '<p:fade/>', '<p:split orient="vert" dir="out"/>'];
function transitionXml(i, s) {
	if (s.layout === 'title') return '<p:transition spd="slow"><p:fade/></p:transition>';
	if (s.layout === 'section') return '<p:transition spd="med"><p:zoom dir="in"/></p:transition>';
	return `<p:transition spd="med">${TRANS[i % TRANS.length]}</p:transition>`;
}
function timingXml(names, ids) {
	// names: [[objectName...]...] in order; ids: objectName -> shape id. Each group fades in after the one before it.
	let id = 3;
	let inner = '';
	let t = 0;
	names.forEach((grp, gi) => {
		const shapes = grp.map((n) => ids[n]).filter(Boolean);
		if (!shapes.length) return;
		const effects = shapes
			.map((sp, k) => {
				const a = id++;
				const b = id++;
				const d = id++;
				return `<p:par><p:cTn id="${a}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" nodeType="${k === 0 ? 'afterEffect' : 'withEffect'}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="${b}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${sp}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${d}" dur="450"/><p:tgtEl><p:spTgt spid="${sp}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`;
			})
			.join('');
		const wrapId = id++;
		inner += `<p:par><p:cTn id="${wrapId}" fill="hold"><p:stCondLst><p:cond delay="${t}"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par>`;
		t += 450 + (gi === 0 ? 150 : 100);
	});
	if (!inner) return '';
	return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="${id++}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>${inner}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}

(async () => {
	const buf = await pptx.write({ outputType: 'nodebuffer' });
	const zip = await JSZip.loadAsync(buf);
	let nAnim = 0;
	for (let i = 0; i < slides.length; i++) {
		const f = `ppt/slides/slide${i + 1}.xml`;
		let xml = await zip.file(f).async('string');
		const ids = {};
		for (const m of xml.matchAll(/<p:cNvPr id="(\d+)" name="(g\d+_\d+)"/g)) ids[m[2]] = m[1];
		const tm = NO_ANIM || /<p:timing/.test(xml) ? '' : timingXml(animPlan[i] || [], ids);
		if (tm) nAnim++;
		if (!/<p:transition/.test(xml)) xml = xml.replace('</p:clrMapOvr>', '</p:clrMapOvr>' + transitionXml(i, slides[i]) + tm);
		zip.file(f, xml);
	}
	fs.writeFileSync(outFile, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
	console.log(`${path.relative(root, outFile)}: ${slides.length} slides, ${nAnim} with fade-ins, ${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB`);
})();
