import { PALETTE, ON_LIGHT } from './symbols.js';

let seq = 0;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {
	const [r1, g1, b1] = hex(a);
	const [r2, g2, b2] = hex(b);
	return '#' + [r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
};

const STYLE = `
.a-slide{animation:ff-slide 4.2s cubic-bezier(.2,.7,.2,1) infinite both}
@keyframes ff-slide{0%,6%{opacity:0;transform:translateX(-7px)}24%,80%{opacity:1;transform:none}94%,100%{opacity:0;transform:none}}
.a-pulse{transform-box:fill-box;transform-origin:center;animation:ff-pulse 2.6s ease-in-out infinite}
@keyframes ff-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.09)}}
.a-blink{animation:ff-blink 1.8s ease-in-out infinite}
@keyframes ff-blink{0%,100%{opacity:1}50%{opacity:.35}}
.a-float{animation:ff-float 3.4s ease-in-out infinite}
@keyframes ff-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.4px)}}
.a-scan{animation:ff-scan 3.6s ease-in-out infinite}
@keyframes ff-scan{0%,100%{transform:translateY(0)}50%{transform:translateY(26px)}}
.a-flicker{animation:ff-flicker 3.6s linear infinite}
@keyframes ff-flicker{0%,26%{opacity:.25}34%{opacity:1}38%{opacity:.55}42%{opacity:1}70%{opacity:.9}100%{opacity:.25}}
.a-spin{transform-box:fill-box;transform-origin:center;animation:ff-spin 5s ease-in-out infinite}
@keyframes ff-spin{0%,100%{transform:scaleX(1)}50%{transform:scaleX(-1)}}
.a-turn{transform-box:fill-box;transform-origin:center;animation:ff-turn 8s linear infinite}
@keyframes ff-turn{to{transform:rotate(360deg)}}
.d-ring{transform-box:fill-box;transform-origin:center;animation:ff-ring 2.6s ease-out infinite}
@keyframes ff-ring{0%{transform:scale(.72);opacity:.75}100%{transform:scale(1.24);opacity:0}}
.d-halo{animation:ff-halo 3.2s ease-in-out infinite}
@keyframes ff-halo{0%,100%{opacity:.5}50%{opacity:1}}
.d-orbit{animation:ff-orbit 6s linear infinite}
@keyframes ff-orbit{to{stroke-dashoffset:-100}}
.s-band{animation:ff-sheen 5s ease-in-out infinite}
@keyframes ff-sheen{0%,55%{transform:translateX(-46px)}85%,100%{transform:translateX(96px)}}
.l-draw{animation:ff-draw 5s ease-in-out infinite}
@keyframes ff-draw{0%{stroke-dashoffset:100;opacity:1}35%,85%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
.l-spark{animation:ff-spark 2.6s linear infinite}
@keyframes ff-spark{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
.still *{animation:none!important}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

// Each file carries only the keyframes its own classes use.
const RULES = new Map();
const ALWAYS = [];
const lines = STYLE.trim().split('\n');
for (let i = 0; i < lines.length; i++) {
	const m = lines[i].match(/^\.([a-z]-[a-z]+)\{/);
	if (m && lines[i + 1]?.startsWith('@keyframes')) RULES.set(m[1], lines[i] + lines[++i]);
	else ALWAYS.push(lines[i]);
}
const styleFor = (body) => [...new Set([...body.matchAll(/class="([a-z]-[a-z]+)"/g)].map((m) => m[1]))].map((c) => RULES.get(c) || '').join('') + ALWAYS.join('');

// Tilted ellipse as a closed path, so a dash can travel it (the orbit dot).
function orbitPath(cx, cy, rx, ry, deg) {
	const a = (deg * Math.PI) / 180;
	const dx = rx * Math.cos(a);
	const dy = rx * Math.sin(a);
	const p0 = `${(cx + dx).toFixed(2)} ${(cy + dy).toFixed(2)}`;
	const p1 = `${(cx - dx).toFixed(2)} ${(cy - dy).toFixed(2)}`;
	return `M${p0}A${rx} ${ry} ${deg} 1 0 ${p1}A${rx} ${ry} ${deg} 1 0 ${p0}Z`;
}

function deco(item, c, u, front) {
	if (item.deco === 'rings') {
		if (front) return '';
		return [0, 1.3]
			.map((d) => `<path class="d-ring" style="animation-delay:${d}s" d="${item.base}" fill="none" stroke="${c.accent}" stroke-width="1.2"/>`)
			.join('');
	}
	if (item.deco === 'halo') {
		return front ? '' : `<circle class="d-halo" cx="32" cy="33" r="31" fill="url(#${u}h)"/>`;
	}
	if (item.deco === 'orbit') {
		const d = orbitPath(32, 32, 31, 10.5, -20);
		const clip = front ? ` clip-path="url(#${u}f)"` : '';
		return `<g${clip}>${front ? '' : `<path d="${d}" fill="none" stroke="${c.accent}" stroke-opacity=".28" stroke-width=".7"/>`}<path class="d-orbit" d="${d}" pathLength="100" fill="none" stroke="${c.spark}" stroke-width="3.4" stroke-linecap="round" stroke-dasharray=".01 99.99"/></g>`;
	}
	return '';
}

function colors(item, theme) {
	const light = theme === 'light';
	const accent = light ? ON_LIGHT[item.accent] || item.accent : item.accent;
	return {
		light,
		accent,
		raw: item.accent,
		tint: light ? accent : mix(item.accent, '#ffffff', 0.62),
		deep: light ? mix(accent, '#000000', 0.25) : mix(item.accent, PALETTE.bg, 0.55),
		ink: light ? '#ffffff' : PALETTE.bg,
		spark: light ? accent : '#ffffff',
	};
}

function partFill(p, c) {
	if (p.tone === 'ink') return `fill="${c.ink}"`;
	if (p.tone === 'dim') return `fill="${c.accent}" fill-opacity=".32"`;
	if (p.tone === 'beam') return `fill="${c.accent}" fill-opacity=".9"`;
	return `fill="${c.tint}"`;
}

function parts(item, c, { filter = '', stroke = '', fill } = {}) {
	return item.parts
		.map((p) => {
			const cls = p.anim && p.anim !== 'none' ? ` class="a-${p.anim}" style="animation-delay:${p.delay || 0}s"` : '';
			const rule = p.rule ? ` fill-rule="${p.rule}"` : '';
			return `<path${cls} d="${p.d}"${rule} ${fill ? fill(p) : partFill(p, c)}${stroke}${filter}/>`;
		})
		.join('');
}

function crystal(item, c, u) {
	const defs = `
<linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.raw}" stop-opacity="${c.light ? 0.38 : 0.55}"/><stop offset=".48" stop-color="${c.raw}" stop-opacity="${c.light ? 0.12 : 0.14}"/><stop offset="1" stop-color="${c.deep}" stop-opacity="${c.light ? 0.4 : 0.6}"/></linearGradient>
<linearGradient id="${u}e" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="${c.accent}" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity=".18"/></linearGradient>
<radialGradient id="${u}h"><stop offset="0" stop-color="${c.accent}" stop-opacity=".42"/><stop offset="1" stop-color="${c.accent}" stop-opacity="0"/></radialGradient>
<linearGradient id="${u}s" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<filter id="${u}b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<clipPath id="${u}c"><path d="${item.base}"/></clipPath>
<clipPath id="${u}f"><rect x="-20" y="32" width="104" height="44" transform="rotate(-20 32 32)"/></clipPath>`;
	const glow = c.light ? '' : ` filter="url(#${u}b)"`;
	return `<defs>${defs}</defs>${deco(item, c, u, false)}
<path d="${item.base}" fill="url(#${u}g)" stroke="url(#${u}e)" stroke-width="1.3" stroke-linejoin="round"/>
<g clip-path="url(#${u}c)"><path d="M0 0H64L0 38Z" fill="#fff" fill-opacity="${c.light ? 0.3 : 0.1}"/><path d="M64 64H20L64 30Z" fill="${c.deep}" fill-opacity=".28"/></g>
<path d="${item.base}" transform="translate(32 32) scale(.86) translate(-32 -32)" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width=".8" stroke-linejoin="round"/>
<g${glow}>${parts(item, c)}</g>
<g clip-path="url(#${u}c)"><g transform="rotate(22 32 32)"><rect class="s-band" x="0" y="-20" width="14" height="104" fill="url(#${u}s)"/></g></g>
${deco(item, c, u, true)}`;
}

function line(item, c, u) {
	const defs = `
<filter id="${u}b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${c.light ? 0.5 : 1.3}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="${u}h"><stop offset="0" stop-color="${c.accent}" stop-opacity=".22"/><stop offset="1" stop-color="${c.accent}" stop-opacity="0"/></radialGradient>
<clipPath id="${u}f"><rect x="-20" y="32" width="104" height="44" transform="rotate(-20 32 32)"/></clipPath>`;
	const tick = (x, y, sx, sy) => `M${x} ${y + 5 * sy}V${y}H${x + 5 * sx}`;
	const ticks = [tick(1, 1, 1, 1), tick(63, 1, -1, 1), tick(1, 63, 1, -1), tick(63, 63, -1, -1)].join('');
	const f = ` filter="url(#${u}b)"`;
	return `<defs>${defs}</defs>
<path d="${ticks}" fill="none" stroke="${c.accent}" stroke-opacity=".4" stroke-width=".8"/>
${deco(item, c, u, false)}
<path d="${item.base}" fill="${c.accent}" fill-opacity=".05" stroke="${c.accent}" stroke-opacity=".22" stroke-width="1"/>
<g${f}>
<path class="l-draw" d="${item.base}" pathLength="100" stroke-dasharray="100" fill="none" stroke="${c.accent}" stroke-width="1.4" stroke-linejoin="round"/>
${parts(item, c, { stroke: ` stroke="${c.accent}" stroke-width="1.1" stroke-linejoin="round"`, fill: (p) => (p.tone === 'beam' ? `fill="${c.accent}" fill-opacity=".85"` : p.tone === 'ink' ? `fill="${c.accent}" fill-opacity=".9"` : `fill="${c.accent}" fill-opacity="${p.tone === 'dim' ? 0.08 : 0.2}"`) })}
<path class="l-spark" d="${item.base}" pathLength="100" fill="none" stroke="${c.spark}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="1.2 98.8"/>
</g>
${deco(item, c, u, true)}`;
}

function badge(item, c, u) {
	const defs = `
<linearGradient id="${u}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${c.light ? 0.92 : 0.2}"/><stop offset="1" stop-color="#fff" stop-opacity="${c.light ? 0.62 : 0.04}"/></linearGradient>
<linearGradient id="${u}e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${c.light ? 1 : 0.6}"/><stop offset="1" stop-color="${c.accent}" stop-opacity="${c.light ? 0.35 : 0.12}"/></linearGradient>
<linearGradient id="${u}s" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="${u}h"><stop offset="0" stop-color="${c.accent}" stop-opacity=".5"/><stop offset="1" stop-color="${c.accent}" stop-opacity="0"/></radialGradient>
<filter id="${u}k" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>
<filter id="${u}d" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.1" flood-color="${c.light ? '#0b2a2e' : '#000'}" flood-opacity="${c.light ? 0.28 : 0.5}"/></filter>
<clipPath id="${u}c"><rect x="3" y="3" width="58" height="58" rx="15"/></clipPath>
<clipPath id="${u}f"><rect x="-20" y="32" width="104" height="44" transform="rotate(-20 32 32)"/></clipPath>`;
	const inner = 'translate(32 32) scale(.64) translate(-32 -32)';
	const partColor = (p) => (p.tone === 'ink' ? `fill="${c.light ? '#ffffff' : c.deep}"` : p.tone === 'dim' ? `fill="#fff" fill-opacity=".35"` : `fill="${c.light ? '#ffffff' : '#f6fdff'}"`);
	return `<defs>${defs}</defs>
<g clip-path="url(#${u}c)"><rect x="0" y="0" width="64" height="64" fill="${c.light ? mix(c.accent, '#ffffff', 0.78) : PALETTE.ink}"/><circle cx="20" cy="18" r="20" fill="${c.raw}" fill-opacity="${c.light ? 0.55 : 0.6}" filter="url(#${u}k)"/><circle cx="50" cy="52" r="14" fill="${c.deep}" fill-opacity=".7" filter="url(#${u}k)"/></g>
<rect x="3" y="3" width="58" height="58" rx="15" fill="url(#${u}t)" stroke="url(#${u}e)" stroke-width="1"/>
<g transform="${inner}">
${deco(item, c, u, false)}
<path d="${item.base}" fill="${c.accent}" fill-opacity="${c.light ? 0.85 : 0.42}" stroke="#fff" stroke-opacity=".5" stroke-width="1" filter="url(#${u}d)"/>
<g filter="url(#${u}d)">${parts(item, c, { fill: partColor })}</g>
${deco(item, c, u, true)}
</g>
<g clip-path="url(#${u}c)"><g transform="rotate(22 32 32)"><rect class="s-band" x="0" y="-20" width="12" height="104" fill="url(#${u}s)"/></g></g>`;
}

const DRAW = { crystal, line, badge };

// Self-contained animated SVG: no external CSS, so it can ship as a file and play inside <img>.
export function faceSVG(item, direction, { size = 96, theme = 'dark', still = false, title = item.name } = {}) {
	const u = `f${(seq++).toString(36)}`;
	const c = colors(item, theme);
	const body = DRAW[direction](item, c, u).replace(/\n/g, '');
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${title}"${still ? ' class="still"' : ''}><style>${styleFor(body)}</style>${body}</svg>`;
}

export function levelItem(level) {
	return {
		id: `lvl-${level.id}`,
		name: `${level.name} threat`,
		accent: level.accent,
		base: level.base,
		parts: [{ d: level.mark, anim: level.id === 'critical' || level.id === 'high' ? 'pulse' : 'none', delay: 0 }],
		deco: level.id === 'critical' ? 'rings' : 'none',
	};
}
