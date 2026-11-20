#!/usr/bin/env node
// Builds presentation/index.html from slides.js (#3931). Usage: node scripts/feature-deck/build-html.js
// Reads: slides.js, scenes.js, deck.css, deck.js. Writes: presentation/index.html, deck.css, deck.js.
const fs = require('fs');
const path = require('path');
const { SECTIONS, slides } = require('./slides.js');
const { scenes, css: sceneCss } = require('./scenes.js');

const root = path.resolve(__dirname, '..', '..');
const out = path.join(root, 'presentation');
fs.mkdirSync(out, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const secById = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
const TRANS = ['fade', 'slide', 'rise', 'zoom', 'flip', 'slide'];

let delay = 0;
const a = (kind = '', step = 0.12) => {
	delay += step;
	return `data-a="${kind}" style="--d:${delay.toFixed(2)}s"`;
};
const icon = (c, cls = '') => (c.face ? `<img class="face" src="faces/${c.face}.svg" alt="" width="64" height="64" loading="lazy">` : `<span class="ico" aria-hidden="true">${c.icon}</span>`);
const eg = (t) => (t ? `<div class="eg" ${a('up')}><b aria-hidden="true">💡</b><span>${esc(t)}</span></div>` : '');
const note = (t) => (t ? `<p class="note" ${a('fade')}>${esc(t)}</p>` : '');
const head = (s) => `<p class="kicker" ${a('left', 0.05)}>${esc(s.kicker || '')}</p><h2 ${a('left', 0.08)}>${esc(s.title)}</h2>`;

function frame(inner, wrapClass = '') {
	return `<div class="win ${wrapClass}" ${a('right', 0.2)}><div class="bar"><i></i><i></i><i></i></div><div class="view">${inner}</div></div>`;
}

const layouts = {
	title(s) {
		const faces = ['seo', 'sec', 'ai', 'a11y', 'perf', 'mail', 'targeted', 'exploit'];
		const orbit = faces.map((f, i) => `<img src="faces/${f}.svg" alt="" style="--od:${(-26 * i) / faces.length}s;--or:${420 + (i % 2) * 90}px">`).join('');
		return `<div class="orbit" aria-hidden="true">${orbit}</div><img class="mark" src="img/mark.svg" alt="" ${a('zoom', 0.1)}><h1 ${a('', 0.15)}>${esc(s.title)}</h1><p class="sub" ${a('', 0.15)}>${esc(s.sub)}</p><span class="tag" ${a('', 0.2)}>${esc(s.tag)}</span>`;
	},
	section(s) {
		const sec = secById[s.section];
		return `<div class="num" ${a('zoom', 0.05)}>${String(sec.n).padStart(2, '0')}</div><div class="ic" ${a('zoom', 0.1)} aria-hidden="true">${sec.icon}</div><h2 ${a('', 0.12)}>${esc(sec.title)}</h2><p class="sub" ${a('', 0.12)}>${esc(sec.sub)}</p><div class="rule" ${a('fade', 0.1)}></div>`;
	},
	scene(s) {
		const body = s.body.map((t) => `<p ${a('left', 0.2)}>${esc(t)}</p>`).join('');
		return `${head(s)}<div class="two"><div class="txt body">${body}${eg(s.eg)}</div><div class="scenebox" ${a('right', 0.25)}>${scenes[s.scene]}</div></div>`;
	},
	steps(s) {
		const st = s.steps
			.map((x, i) => `<div class="step" ${a('up', 0.25)}><div class="disc"><b>${i + 1}</b><span aria-hidden="true">${x.icon}</span></div><h3>${esc(x.t)}</h3><p>${esc(x.d)}</p></div>`)
			.join('');
		return `${head(s)}<div class="steps"><div class="track"></div><div class="dot"></div>${st}</div>${eg(s.eg)}`;
	},
	cards(s) {
		const dense = s.dense || (s.cards.length > 4 && s.cards.some((c) => c.like)) ? ' dense' : '';
		const c = s.cards
			.map((x) => `<div class="card" ${a('up', 0.11)}><div class="ci">${icon(x)}</div><h3>${esc(x.t)}</h3><p>${esc(x.d)}</p>${x.like ? `<p class="like">${esc(x.like)}</p>` : ''}</div>`)
			.join('');
		return `${head(s)}<div class="cards${dense}" style="--cols:${s.cols || 3}">${c}</div>${eg(s.eg)}`;
	},
	prices(s) {
		const c = s.cards
			.map((x) => `<div class="card" ${a('zoom', 0.12)}><div class="ci"><span class="ico" aria-hidden="true">${x.icon}</span></div><h3>${esc(x.t)}</h3><div class="price">${esc(x.p)}</div><p>${esc(x.d)}</p></div>`)
			.join('');
		return `${head(s)}<div class="cards" style="--cols:3">${c}</div>${note(s.note)}`;
	},
	shot(s) {
		const pts = s.bullets.map((t) => `<li ${a('left', 0.2)}>${esc(t)}</li>`).join('');
		return `${head(s)}<div class="two"><div class="txt"><ul class="pts">${pts}</ul>${eg(s.eg)}</div>${frame(`<img src="img/${s.img}.jpg" alt="${esc(s.title)}" loading="lazy">`)}</div>`;
	},
	video(s) {
		const pts = s.bullets.map((t) => `<li ${a('left', 0.2)}>${esc(t)}</li>`).join('');
		const ctl = s.tall ? ' controls' : '';
		const wrapper = s.tall ? 'tall' : '';
		return `${head(s)}<div class="two${s.tall ? ' tallrow' : ''}"><div class="txt"><ul class="pts">${pts}</ul>${eg(s.eg)}</div><div class="vwrap">${frame(`<video src="media/${s.clip}.mp4" poster="img/clip-${s.clip}.jpg" muted loop playsinline preload="metadata"${ctl} aria-label="${esc(s.title)}"></video>`, wrapper)}</div></div>`;
	},
	scores(s) {
		const g = s.items
			.map((x) => {
				const col = x.v < 50 ? 'var(--coral)' : x.v < 70 ? 'var(--gold)' : 'var(--green)';
				return `<div class="gauge" ${a('zoom', 0.14)}><div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="t" cx="60" cy="60" r="52"/><circle class="v" cx="60" cy="60" r="52" stroke="${col}" style="--off:${(327 * (1 - x.v / 100)).toFixed(1)}"/></svg><div class="num" style="--n:${x.v}" aria-label="${x.v}"></div></div><div><img class="face" src="faces/${x.face}.svg" alt=""><h3>${esc(x.t)}</h3><p>${esc(x.d)}</p></div></div>`;
			})
			.join('');
		return `${head(s)}<div class="gauges">${g}</div>${note(s.note)}`;
	},
	bignum(s) {
		const n = s.items
			.map((x) => {
				const num = /^\d+$/.test(x.n) ? `<div class="big cnt" style="--n:${x.n}" aria-label="${x.n}"></div>` : `<div class="big">${esc(x.n)}</div>`;
				return `<div class="num-card" ${a('zoom', 0.14)}>${num}<div class="lab">${esc(x.l)}</div></div>`;
			})
			.join('');
		if (s.shot) return `${head(s)}<div class="two l-bignum has-shot"><div class="txt"><div class="nums">${n}</div>${eg(s.eg)}</div>${frame(`<img src="img/${s.shot}.jpg" alt="Live Reports" loading="lazy">`)}</div>`;
		return `${head(s)}<div class="nums">${n}</div>${eg(s.eg)}`;
	},
	timeline(s) {
		const it = s.items.map((x) => `<div class="it" ${a('up', 0.22)}><div class="when">${esc(x.time)}</div><div class="node" aria-hidden="true">${x.icon}</div><h3>${esc(x.t)}</h3><p>${esc(x.d)}</p></div>`).join('');
		return `${head(s)}<div class="tl"><div class="line"></div>${it}</div>`;
	},
	compare(s) {
		const side = (x, cls) => `<div class="side ${cls}" ${a(cls ? 'right' : 'left', 0.25)}><div class="big" aria-hidden="true">${x.icon}</div><h3>${esc(x.h)}</h3><ul class="pts">${x.items.map((t, i) => `<li${cls ? '' : i >= 3 ? ' class="blur"' : ''}>${esc(t)}</li>`).join('')}</ul></div>`;
		return `${head(s)}<div class="cmp">${side(s.left, '')}<div class="vs">vs</div>${side(s.right, 'r')}</div>`;
	},
	tools(s) {
		const dense = s.rows.length > 4 ? ' dense' : '';
		const cols = `grid-template-columns:${s.weights.map((w) => w + 'fr').join(' ')}`;
		const head = s.cols.map((c) => `<div class="th" ${a('fade', 0.02)}>${esc(c)}</div>`).join('');
		const rows = s.rows
			.map((r) => r.map((c, i) => `<div class="tc${i === 0 ? ' tn' : ''}" ${a('up', 0.06)}>${esc(c)}</div>`).join(''))
			.join('');
		return `<p class="kicker" ${a('left', 0.05)}>${esc(s.kicker || '')}</p><h2 class="tl-h" ${a('left', 0.08)}>${esc(s.title)}</h2><div class="tools${dense}" style="${cols}">${head}${rows}</div>${eg(s.eg)}`;
	},
	gallery(s) {
		const g = s.faces.map(([f, l]) => `<div class="gal" ${a('zoom', 0.05)}><img class="face" src="faces/${f}.svg" alt="" loading="lazy"><span>${esc(l)}</span></div>`).join('');
		return `${head(s)}<div class="galgrid">${g}</div>${note(s.note)}`;
	},
	glossary(s) {
		const r = s.rows.map(([t, d]) => `<div class="row" ${a('up', 0.06)}><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('');
		return `${head(s)}<dl class="gloss" style="margin:0">${r}</dl>`;
	},
	end(s) {
		const l = s.links.map(([t, u]) => `<a href="https://${u}" target="_blank" rel="noopener" ${a('up', 0.1)}><b>${esc(t)}</b><span>${esc(u)}</span></a>`).join('');
		return `<h2 ${a('zoom', 0.1)}>${esc(s.title)}</h2><div class="links">${l}</div>`;
	},
};

let secName = '';
const html = slides
	.map((s, i) => {
		delay = 0.05;
		if (s.layout === 'section') secName = secById[s.section].title;
		if (s.wrap) secName = 'Wrap-up';
		const fn = layouts[s.layout];
		if (!fn) throw new Error('no layout ' + s.layout);
		const trans = s.layout === 'section' || s.layout === 'title' ? 'zoom' : TRANS[i % TRANS.length];
		const label = s.title || (s.section && secById[s.section].title) || 'Slide';
		return `<section class="slide l-${s.layout}" data-trans="${trans}" data-sec="${esc(secName)}" data-notes="${esc(s.notes || '')}" aria-label="${i + 1}. ${esc(label)}" aria-hidden="true" inert>${fn(s)}</section>`;
	})
	.join('\n');

// overview grid, grouped by part
let gridHtml = '';
let curSec = null;
let tiles = '';
const flush = () => {
	if (curSec !== null) gridHtml += `<div class="sec">${esc(curSec)}</div><div class="tiles">${tiles}</div>`;
	tiles = '';
};
let gsec = '';
slides.forEach((s, i) => {
	if (s.layout === 'section') gsec = secById[s.section].title;
	if (s.wrap) gsec = 'Wrap-up';
	if (gsec !== curSec) {
		flush();
		curSec = gsec;
	}
	const label = s.title || (s.section && secById[s.section].title) || '';
	tiles += `<button type="button"><span>${i + 1}</span>${esc(label)}</button>`;
});
flush();

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QA-lab URL Review, explained simply</title>
<meta name="description" content="How QA-lab URL Review works, tool by tool, in plain words, with real screenshots and short animations.">
<meta name="robots" content="noindex">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="deck.css">
<style>${sceneCss}</style>
</head>
<body>
<a class="skip" href="#stage">Skip to the slides</a>
<div class="bg" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="progress" aria-hidden="true"><i></i></div>
<div class="hud"><img src="img/mark.svg" alt=""><span><b>QA-lab URL Review</b> · explained<span id="hud-sec"></span></span></div>
<div class="help" aria-hidden="true"><kbd>←</kbd> <kbd>→</kbd> move · <kbd>G</kbd> all slides · <kbd>N</kbd> notes · <kbd>P</kbd> play · <kbd>F</kbd> full screen</div>
<div class="frame"><main class="stage" id="stage">
${html}
</main></div>
<div class="sayit" id="sayit" aria-live="polite"><b>Say it like this</b><span id="sayit-text"></span></div>
<nav class="controls" aria-label="Slide controls">
<button id="b-prev" aria-label="Previous slide">‹</button>
<span class="count" id="count" aria-live="polite">1 / ${slides.length}</span>
<button id="b-next" aria-label="Next slide">›</button>
<button id="b-auto" aria-label="Auto-play" aria-pressed="false">▶</button>
<button id="b-grid" aria-label="All slides">▦</button>
<button id="b-notes" aria-label="Show what to say" aria-pressed="false">💬</button>
<button id="b-full" aria-label="Full screen">⛶</button>
</nav>
<div class="grid" id="grid" hidden role="dialog" aria-label="All slides"><h2>All slides</h2>${gridHtml}</div>
<script src="deck.js"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(out, 'index.html'), page);
fs.copyFileSync(path.join(__dirname, 'deck.css'), path.join(out, 'deck.css'));
fs.copyFileSync(path.join(__dirname, 'deck.js'), path.join(out, 'deck.js'));
console.log(`presentation/index.html: ${slides.length} slides, ${(page.length / 1024).toFixed(0)} KB`);
