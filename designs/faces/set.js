import { LEVELS } from './symbols.js';
import { FULL, GROUPS } from './catalog.js';
import { faceSVG, levelItem } from './svg.js';
import { createStage } from './tile3d.js';

// The mix Carlos picked in round one: frosted badge in report rows, crystal for 3D tiles and covers, line light for the cyber side.
const ROW = 'badge';
const TILE = 'crystal';
const CYBER = 'line';

const q = new URLSearchParams(location.search);
const reel = q.get('reel');
const el = (tag, cls, html) => {
	const n = document.createElement(tag);
	if (cls) n.className = cls;
	if (html != null) n.innerHTML = html;
	return n;
};
const levels = LEVELS.map(levelItem);
let size = null;

function gallery(stage) {
	const main = document.getElementById('groups');
	const io = new IntersectionObserver((es) => {
		for (const e of es) {
			const t = stage.tiles.find((x) => x.canvas === e.target);
			if (t) t.visible = e.isIntersecting;
		}
	});
	for (const [g, title] of GROUPS) {
		const items = FULL.filter((i) => i.group === g);
		const s = el('section', 'dir');
		s.id = g;
		s.append(el('p', 'eyebrow', `${items.length} faces`));
		s.append(el('h2', 'display-2', title));
		const grid = el('div', 'grid set');
		for (const it of items) {
			const c = el('article', 'card');
			const cv = el('canvas', 'tile');
			c.append(cv);
			io.observe(stage.add(cv, it, g === 'cyber' ? CYBER : TILE).canvas);
			const sizes = el('div', 'sizes');
			sizes.innerHTML =
				`<span class="big">${faceSVG(it, ROW, { size: 52 })}</span>` +
				[24, 16].map((n) => `<span>${faceSVG(it, ROW, { size: n })}</span>`).join('') +
				(g === 'cyber' ? `<span>${faceSVG(it, CYBER, { size: 36 })}</span>` : '') +
				`<span class="on-light">${faceSVG(it, ROW, { size: 22, theme: 'light' })}${faceSVG(it, ROW, { size: 16, theme: 'light' })}</span>`;
			c.append(sizes);
			c.append(el('h3', '', it.name));
			grid.append(c);
		}
		s.append(grid);
		main.append(s);
	}
	const lv = document.getElementById('levels-row');
	lv.innerHTML = levels
		.map((l) => `<figure>${faceSVG(l, ROW, { size: 56 })}${faceSVG(l, CYBER, { size: 56 })}${faceSVG(l, ROW, { size: 20, theme: 'light' })}<figcaption>${l.name.replace(' threat', '')}</figcaption></figure>`)
		.join('');
}

function reelFrame(title, eyebrow, w, h) {
	document.body.classList.add('reel', 'reel-set');
	size = [w, h];
	document.body.style.width = `${w}px`;
	document.body.style.height = `${h}px`;
	const r = el('div', 'reel-frame');
	r.append(el('p', 'eyebrow', eyebrow));
	r.append(el('h1', 'display-2', title));
	document.body.replaceChildren(r);
	return r;
}

function reelBadges() {
	const r = reelFrame('Report rows: frosted badges', `QA-lab URL Review · ${FULL.length} faces + 4 threat levels · #3826`, 1080, 1330);
	const grid = el('div', 'set-cells');
	for (const it of [...FULL, ...levels]) grid.append(el('figure', '', `${faceSVG(it, ROW, { size: 68 })}<figcaption>${it.name}</figcaption>`));
	r.append(grid);
	const strip = el('div', 'rs light');
	strip.innerHTML = FULL.slice(0, 24).map((it) => faceSVG(it, ROW, { size: 22, theme: 'light' })).join('');
	r.append(strip);
}

function reelTiles(stage, look, items, cols, title, eyebrow, w, h) {
	const r = reelFrame(title, eyebrow, w, h);
	const grid = el('div', 'set-tiles');
	grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
	for (const it of items) {
		const f = el('figure', '');
		const cv = el('canvas', 'tile');
		f.append(cv);
		stage.add(cv, it, look).visible = true;
		f.append(el('figcaption', '', it.name));
		grid.append(f);
	}
	r.append(grid);
	return r;
}

const stage = createStage({ px: reel === 'crystal' ? 300 : 440 });
if (reel === 'badges') reelBadges();
else if (reel === 'crystal') {
	const items = FULL.filter((i) => i.group !== 'cyber');
	reelTiles(stage, TILE, items, 6, '3D tiles: crystal', `${items.length} report and check faces · #3826`, 1080, 1290);
} else if (reel === 'cyber') {
	const items = FULL.filter((i) => i.group === 'cyber');
	const r = reelTiles(stage, CYBER, items, 4, 'Cyber side: line light', `${items.length} cyber faces · coral and red only on high and critical · #3826`, 1080, 1440);
	const lv = el('div', 'rs dark');
	lv.innerHTML = levels.map((l) => `<span class="lvl">${faceSVG(l, CYBER, { size: 60 })}${faceSVG(l, ROW, { size: 44 })}<b>${l.name.replace(' threat', '')}</b></span>`).join('');
	r.append(lv);
} else gallery(stage);

window.__faces = {
	ready: true,
	size,
	renderAt(t) {
		for (const a of document.getAnimations()) {
			a.pause();
			a.currentTime = t * 1000;
		}
		stage.renderAll(t, false);
	},
};

if (matchMedia('(prefers-reduced-motion: reduce)').matches || q.has('still')) stage.renderAll(2, false);
else if (!q.has('manual')) {
	const t0 = performance.now();
	const loop = (now) => {
		stage.renderAll((now - t0) / 1000);
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
}
