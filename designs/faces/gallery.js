import { ITEMS, LEVELS, DIRECTIONS } from './symbols.js';
import { faceSVG, levelItem } from './svg.js';
import { createStage } from './tile3d.js';

const q = new URLSearchParams(location.search);
const reel = q.get('reel');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = (tag, cls, html) => {
	const n = document.createElement(tag);
	if (cls) n.className = cls;
	if (html != null) n.innerHTML = html;
	return n;
};

const STATUS = {
	sec: ['3 of 6 headers', 'warn'],
	a11y: ['12 issues', 'warn'],
	mail: ['SPF · DKIM · DMARC', 'pass'],
	hack: ['No signs found', 'pass'],
	crit: ['Listed now', 'crit'],
	live: ['Public', 'info'],
};

function contextPanel(dir, theme) {
	const p = el('div', `ctx ctx-${theme}`);
	p.append(el('p', 'ctx-head', theme === 'light' ? 'Report, light' : 'Report, dark'));
	for (const it of ITEMS) {
		const [s, k] = STATUS[it.id];
		p.append(el('div', 'ck', `${faceSVG(it, dir, { size: 22, theme })}<span>${it.name}</span><b class="pill ${k}">${s}</b>`));
	}
	const lv = el('div', 'ck levels');
	lv.innerHTML = LEVELS.map((l) => `<span class="lv">${faceSVG(levelItem(l), dir, { size: 16, theme })}${l.name}</span>`).join('');
	p.append(lv);
	return p;
}

function card(it, dir, stage) {
	const c = el('article', 'card');
	const cv = el('canvas', 'tile');
	cv.setAttribute('aria-label', `${it.name}, live 3D`);
	c.append(cv);
	const tile = stage.add(cv, it, dir);
	tile.canvas.dataset.dir = dir;
	const sizes = el('div', 'sizes');
	sizes.innerHTML =
		`<span class="big">${faceSVG(it, dir, { size: 76 })}</span>` +
		[40, 24, 16].map((s) => `<span>${faceSVG(it, dir, { size: s })}</span>`).join('') +
		`<span class="on-light">${faceSVG(it, dir, { size: 24, theme: 'light' })}${faceSVG(it, dir, { size: 16, theme: 'light' })}</span>`;
	c.append(sizes);
	c.append(el('h3', '', `${it.name} <small>${it.group}</small>`));
	c.append(el('p', 'idea', it.idea));
	if (it.id === 'crit') {
		const lv = el('div', 'lvls');
		lv.innerHTML = LEVELS.map((l) => `<figure>${faceSVG(levelItem(l), dir, { size: 40 })}<figcaption>${l.name}</figcaption></figure>`).join('');
		c.append(lv);
	}
	return { node: c, tile };
}

function section(d, stage) {
	const s = el('section', 'dir');
	s.id = d.id;
	s.append(el('p', 'eyebrow', `Direction ${DIRECTIONS.indexOf(d) + 1} of 3`));
	s.append(el('h2', 'display-2', d.name));
	s.append(el('p', 'lede', `${d.line} <b>Best for:</b> ${d.best}`));
	const grid = el('div', 'grid');
	const tiles = ITEMS.map((it) => {
		const { node, tile } = card(it, d.id, stage);
		grid.append(node);
		return tile;
	});
	s.append(grid);
	const ctx = el('div', 'ctxs');
	ctx.append(contextPanel(d.id, 'dark'), contextPanel(d.id, 'light'));
	s.append(ctx);
	return { s, tiles };
}

function reelView(d, stage) {
	document.body.classList.add('reel');
	const r = el('div', 'reel-frame');
	r.append(el('p', 'eyebrow', `QA-lab URL Review · faces · direction ${DIRECTIONS.indexOf(d) + 1} of 3`));
	r.append(el('h1', 'display-2', d.name));
	const grid = el('div', 'reel-grid');
	for (const it of ITEMS) {
		const f = el('figure', '');
		const cv = el('canvas', 'tile');
		f.append(cv);
		stage.add(cv, it, d.id).visible = true;
		f.append(el('figcaption', '', `${faceSVG(it, d.id, { size: 22 })}<span>${it.name}</span>`));
		grid.append(f);
	}
	r.append(grid);
	const strip = el('div', 'reel-strip');
	strip.innerHTML =
		`<div class="rs dark">${ITEMS.map((it) => faceSVG(it, d.id, { size: 64 })).join('')}${LEVELS.map((l) => faceSVG(levelItem(l), d.id, { size: 40 })).join('')}</div>` +
		`<div class="rs light">${ITEMS.map((it) => faceSVG(it, d.id, { size: 40, theme: 'light' })).join('')}${LEVELS.map((l) => faceSVG(levelItem(l), d.id, { size: 28, theme: 'light' })).join('')}</div>`;
	r.append(strip);
	const lv = el('div', 'reel-levels');
	lv.innerHTML =
		`<p class="eyebrow">Threat levels · shape and colour both change</p><div>` +
		LEVELS.map((l) => `<figure>${faceSVG(levelItem(l), d.id, { size: 84 })}<figcaption>${l.name}</figcaption></figure>`).join('') +
		`</div><p class="reel-foot">Round one · #3826 · for review, not published</p>`;
	r.append(lv);
	document.body.replaceChildren(r);
}

const stage = createStage({ px: reel ? 600 : 520 });

if (reel) {
	reelView(DIRECTIONS.find((d) => d.id === reel) || DIRECTIONS[0], stage);
} else {
	const main = document.getElementById('dirs');
	const io = new IntersectionObserver((es) => {
		for (const e of es) {
			const t = stage.tiles.find((x) => x.canvas === e.target);
			if (t) t.visible = e.isIntersecting;
		}
	});
	for (const d of DIRECTIONS) {
		const { s, tiles } = section(d, stage);
		main.append(s);
		for (const t of tiles) io.observe(t.canvas);
	}
}

// Deterministic frames for the recorder: SVG keyframes and 3D tiles at the same clock.
window.__faces = {
	ready: true,
	renderAt(t) {
		for (const a of document.getAnimations()) {
			a.pause();
			a.currentTime = t * 1000;
		}
		stage.renderAll(t, false);
	},
};

if (reduced || q.has('still')) {
	stage.renderAll(2, false);
} else if (!q.has('manual')) {
	const t0 = performance.now();
	const loop = (now) => {
		stage.renderAll((now - t0) / 1000);
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
}
