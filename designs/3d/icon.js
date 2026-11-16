import { mount } from './fx.js';

const FULL = 'icon/qa-review-mark-fusion.svg';
const SMALL = 'icon/qa-review-mark-fusion-small.svg';
const OLD = '../../assets/qa-review-mark.svg?v=20261013c';
// Below 48 px the full drawing turns to mush, so favicons use the small glyph.
const srcFor = (px) => (px < 48 ? SMALL : FULL);

function download(href, name) {
	const a = document.createElement('a');
	a.href = href;
	a.download = name;
	a.click();
}

async function png(px) {
	const img = new Image();
	img.src = srcFor(px);
	await img.decode();
	const c = document.createElement('canvas');
	c.width = c.height = px;
	c.getContext('2d').drawImage(img, 0, 0, px, px);
	download(c.toDataURL('image/png'), `qa-review-mark-${px}.png`);
}

export function mountIcon(sec) {
	const sizes = [180, 96, 64, 32, 16];
	const row = (cls) => `<div class="sizes ${cls}">${sizes.map((s) => `<figure><img src="${srcFor(s)}" width="${s}" height="${s}" alt=""><figcaption>${s}</figcaption></figure>`).join('')}</div>`;
	sec.hidden = false;
	sec.innerHTML = `
		<p class="eyebrow">Icon</p>
		<h2 id="icon-title">The QA-lab URL Review icon, <em>redrawn in the Fusion look</em></h2>
		<p class="lede">Same pyramid, same teal-left and gold-right facets and pearl spine, now as glass: a beam enters from the left and leaves as the six-colour fan, over the scan ring and dot floor, under an aurora sky, with two orbiting crystals and soft bokeh. Below 48 px a simplified glyph keeps the pyramid, the beam and a three-band fan.</p>
		<div class="icon-grid">
			<figure class="icon-big"><img src="${FULL}" width="360" height="360" alt="New QA-lab URL Review icon"><figcaption>Full icon · 48 px and up</figcaption></figure>
			<figure class="icon-live"><div class="live-tile" data-fx><canvas class="fx"></canvas></div><figcaption>Live icon · splash, loading and video end cards</figcaption></figure>
			<div class="icon-side">
				<h3>Sizes</h3>
				${row('on-dark')}
				${row('on-light')}
				<h3>Before and after</h3>
				<div class="sizes on-dark"><figure><img src="${OLD}" width="96" height="96" alt="Current icon"><figcaption>now</figcaption></figure><figure><img src="${FULL}" width="96" height="96" alt="New icon"><figcaption>Fusion</figcaption></figure><figure><img src="${OLD}" width="32" height="32" alt=""><figcaption>now</figcaption></figure><figure><img src="${SMALL}" width="32" height="32" alt=""><figcaption>Fusion</figcaption></figure></div>
				<h3>In place</h3>
				<div class="mocks">
					<div class="tab"><img src="${SMALL}" width="16" height="16" alt=""><span>QA-lab URL Review</span><i>×</i></div>
					<div class="home"><img src="${FULL}" width="60" height="60" alt=""><span>URL Review</span></div>
				</div>
				<h3>Download</h3>
				<div class="dls">
					<button class="dl" data-svg="${FULL}">SVG full</button>
					<button class="dl" data-svg="${SMALL}">SVG small</button>
					${[512, 192, 180, 32, 16].map((s) => `<button class="dl" data-png="${s}">PNG ${s}</button>`).join('')}
				</div>
			</div>
		</div>`;
	sec.querySelectorAll('[data-svg]').forEach((b) => b.addEventListener('click', () => download(b.dataset.svg, b.dataset.svg.split('/').pop())));
	sec.querySelectorAll('[data-png]').forEach((b) => b.addEventListener('click', () => png(+b.dataset.png)));
	mount(sec.querySelector('.live-tile canvas'), 'fusion', { mode: 1, subject: [0, 0.04], zoom: 1.3, maxPixels: 0.4e6 });
}
