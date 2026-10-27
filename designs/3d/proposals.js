import { still } from './fx.js';

export const PROPOSALS = [
	{
		id: 'prism', name: 'Prism Core', tag: 'One address in, every finding out.',
		pitch: 'The mark becomes a real glass pyramid. A white beam enters one face and leaves as a fan of the palette: the product in one image.',
		effects: ['Ray-marched glass with refraction and dispersion', 'Fresnel reflections of studio strip lights', 'Caustic light pool on a mirrored grid floor', 'Spectrum fan beam in the brand colours', 'Star glint on the apex', 'Bokeh dust in front of the lens'],
		best: 'Hero and link previews. The most "product shot" of the five.',
		cost: 'Heaviest. Resolution adapts to keep 60 fps on laptops; phones render at a lower scale.',
	},
	{
		id: 'tidal', start: 2.2, name: 'Tidal Scan', tag: 'Every page, scanned like a tide.',
		pitch: 'The page as a field of dots rolling in interfering waves. A pyramid-shaped curtain of gold light sweeps through it, leaving coral dots where it found issues and mint where it passed. The pointer drops its own ripple.',
		effects: ['Perspective wave field with interference rings', 'Pyramid-shaped scan curtain with a beacon', 'Issue and pass dots that fade after the scan', 'Pointer ripple', 'Horizon fog fade and star field'],
		best: 'Hero behind the URL box, the Live Reports background and video intros.',
		cost: 'Light.',
	},
	{
		id: 'rack', name: 'Rack Focus', tag: 'Focus on what matters.',
		pitch: 'Crystals hang at eight depths and the lens pulls focus between the mark, the near swarm and the far field like a cinema camera. Anything out of focus blooms into hexagonal bokeh with a coral fringe. Pointer height nudges the focus.',
		effects: ['Eight-plane depth of field with timed focus pulls', 'Hexagonal bokeh with a chromatic fringe', 'Turning transparent pyramids', 'Pointer parallax', 'Viewfinder with a live focus readout'],
		best: 'Hero and feature sections. Photographic and calm.',
		cost: 'Light to medium.',
	},
	{
		id: 'aurora', name: 'Aurora Glass', tag: 'Clarity through the noise.',
		pitch: 'Teal, gold and violet aurora curtains drift behind the mark, which turns as a crystal lens. It refracts the aurora with a chromatic split, a shine sweeps across its facets, and ripple rings spread from it like a wave illusion.',
		effects: ['Domain-warped aurora curtains', 'Lens refraction with an RGB split', 'Specular sweep across the facets', 'Ripple rings from the mark', 'Twinkling stars and film grain'],
		best: 'Backgrounds everywhere (the calmest behind text), stories and reels.',
		cost: 'Light; heavier only inside the lens.',
	},
	{
		id: 'lattice', name: 'Crystal Lattice', tag: 'Inside the machine.',
		pitch: 'The camera flies down a tunnel through an endless lattice of turning crystal bipyramids: mostly teal, some cyan and gold, the odd coral flaw. Every few seconds a wave of light rolls forward through the lattice.',
		effects: ['Ray-marched infinite crystal lattice', 'Volumetric glow', 'Light wave rolling through the tunnel', 'Banking camera with pointer steering', 'Depth fog'],
		best: 'Launch heroes, video intros and event banners. The most immersive; the busiest behind text.',
		cost: 'Medium.',
	},
];

export const FORMATS = [
	{ id: 'og', label: 'Link preview (Open Graph)', w: 1200, h: 630, subject: [0.44, -0.02], zoom: 1.4 },
	{ id: 'x', label: 'X and LinkedIn header', w: 1500, h: 500, subject: [0.95, 0], zoom: 1.5 },
	{ id: 'square', label: 'Feed post', w: 1080, h: 1080, subject: [0.16, 0.2], zoom: 1.7 },
	{ id: 'story', label: 'Story and Reel cover', w: 1080, h: 1920, subject: [0, 0.2], zoom: 2.1 },
];

export const byId = (id) => PROPOSALS.find((p) => p.id === id) || PROPOSALS[0];

const mark = new Image();
mark.src = '../../assets/qa-review-mark.svg?v=20261013c';
export const ready = Promise.all([document.fonts.load('400 40px "Instrument Serif"'), document.fonts.load('italic 400 40px "Instrument Serif"'), document.fonts.load('600 20px Inter'), mark.decode().catch(() => {})]);

function brand(ctx, x, y, s, align = 'left') {
	ctx.font = `400 ${s * 0.62}px "Instrument Serif"`;
	const wText = Math.max(ctx.measureText('QA-lab').width, (ctx.font = `600 ${s * 0.2}px Inter`, ctx.measureText('URL REVIEW').width * 1.15));
	const total = s + s * 0.28 + wText;
	const x0 = align === 'center' ? x - total / 2 : x;
	ctx.drawImage(mark, x0, y, s, s);
	ctx.fillStyle = '#f4fafb';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.font = `400 ${s * 0.62}px "Instrument Serif"`;
	ctx.fillText('QA-lab', x0 + s * 1.28, y + s * 0.58);
	ctx.fillStyle = '#9fb3b8';
	ctx.font = `600 ${s * 0.2}px Inter`;
	ctx.letterSpacing = `${s * 0.03}px`;
	ctx.fillText('URL REVIEW', x0 + s * 1.3, y + s * 0.9);
	ctx.letterSpacing = '0px';
}

function headline(ctx, lines, x, y, size, align) {
	ctx.textAlign = align;
	lines.forEach(([text, em], i) => {
		ctx.font = `${em ? 'italic ' : ''}400 ${size}px "Instrument Serif"`;
		ctx.fillStyle = em ? '#7ef6fb' : '#f4fafb';
		ctx.fillText(text, x, y + i * size * 0.98);
	});
}

// Draws the banner copy over the shader frame; used for the live preview and the PNG export alike.
export function drawCopy(ctx, w, h, fmt, p) {
	ctx.clearRect(0, 0, w, h);
	const four = [['Find the leaks,'], ['breaks and blocks', true], ['before customers'], ['or regulators do.']];
	const url = 'carlosandmunoz.com/qa-review';
	ctx.save();
	if (fmt.id === 'og' || fmt.id === 'x') {
		const g = ctx.createLinearGradient(0, 0, w * 0.62, 0);
		g.addColorStop(0, 'rgba(7,17,22,.82)');
		g.addColorStop(1, 'rgba(7,17,22,0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, w, h);
		const pad = fmt.id === 'og' ? w * 0.06 : w * 0.05;
		const u = h / (fmt.id === 'og' ? 630 : 500);
		brand(ctx, pad, h * 0.1, 54 * u);
		ctx.textBaseline = 'alphabetic';
		if (fmt.id === 'og') headline(ctx, four, pad, h * 0.42, 62 * u, 'left');
		else headline(ctx, [['Find the leaks, '], ['breaks and blocks', true], ['before customers or regulators do.']], pad, h * 0.45, 52 * u, 'left');
		ctx.font = `600 ${18 * u}px Inter`;
		ctx.fillStyle = '#e2c48a';
		ctx.textAlign = 'left';
		ctx.fillText(p.tag, pad, h * 0.9 - 30 * u);
		ctx.fillStyle = '#7ef6fb';
		ctx.fillText(url, pad, h * 0.9);
	} else {
		const g = ctx.createLinearGradient(0, h * 0.45, 0, h);
		g.addColorStop(0, 'rgba(7,17,22,0)');
		g.addColorStop(0.55, 'rgba(7,17,22,.8)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, w, h);
		const u = w / 1080;
		const story = fmt.id === 'story';
		brand(ctx, story ? w / 2 : w * 0.07, story ? h * 0.06 : w * 0.07, 72 * u, story ? 'center' : 'left');
		const size = (story ? 104 : 86) * u;
		const x = story ? w / 2 : w * 0.07;
		const top = story ? h * 0.62 : h * 0.56;
		headline(ctx, four, x, top, size, story ? 'center' : 'left');
		ctx.textAlign = story ? 'center' : 'left';
		ctx.font = `600 ${28 * u}px Inter`;
		ctx.fillStyle = '#e2c48a';
		ctx.fillText(p.tag, x, top + size * 4.1);
		ctx.fillStyle = '#7ef6fb';
		ctx.fillText(url, x, story ? h * 0.93 : h * 0.93);
	}
	ctx.restore();
}

export async function exportPng(p, fmt, t) {
	await ready;
	const gl = still(p.id, fmt.w, fmt.h, { subject: fmt.subject, zoom: fmt.zoom }, t);
	const c = document.createElement('canvas');
	c.width = fmt.w;
	c.height = fmt.h;
	const ctx = c.getContext('2d');
	ctx.drawImage(gl, 0, 0);
	const copy = document.createElement('canvas');
	copy.width = fmt.w;
	copy.height = fmt.h;
	drawCopy(copy.getContext('2d'), fmt.w, fmt.h, fmt, p);
	ctx.drawImage(copy, 0, 0);
	const a = document.createElement('a');
	a.download = `qa-lab-${p.id}-${fmt.id}-${fmt.w}x${fmt.h}.png`;
	a.href = c.toDataURL('image/png');
	a.click();
}
