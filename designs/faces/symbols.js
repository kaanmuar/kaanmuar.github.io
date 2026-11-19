// One symbol per face on a 64-unit grid. The SVG faces and the 3D tiles draw the same paths,
// so a face reads the same at 16px in a report row and as a lit object in a hero.
// anim: none | slide | pulse | blink | scan | flicker | spin | float

const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const ellipse = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;
const ring = (cx, cy, rx, ry, w) => `${ellipse(cx, cy, rx, ry)} ${ellipse(cx, cy, rx - w, ry - w)}`;

export const PALETTE = {
	bg: '#071116',
	ink: '#102226',
	text: '#e8f3f4',
	muted: '#9fb3b8',
	cyan: '#7ef6fb',
	teal: '#4db3bb',
	deep: '#0d6e76',
	gold: '#e2c48a',
	mint: '#6fe3b1',
	coral: '#f39a8b',
	violet: '#b9a8ff',
	red: '#ff6b5e',
};

// On light pages the bright accents wash out; each accent has a darker twin.
export const ON_LIGHT = {
	'#7ef6fb': '#0d6e76',
	'#6fe3b1': '#0f766e',
	'#e2c48a': '#9a6a12',
	'#b9a8ff': '#5b45c9',
	'#f39a8b': '#c2412d',
	'#ff6b5e': '#b42318',
	'#4db3bb': '#0d6e76',
};

export const ITEMS = [
	{
		id: 'sec',
		name: 'Security headers',
		group: 'Check',
		accent: PALETTE.cyan,
		idea: 'A glass shield built from the response headers: each bar slides in as a header is found.',
		base: 'M32 5 L53 12.5 V30 C53 43.5 44 53.5 32 59 C20 53.5 11 43.5 11 30 V12.5 Z',
		parts: [
			{ d: 'M21 21h22v4.4H21z', anim: 'slide', delay: 0 },
			{ d: 'M21 29.8h22v4.4H21z', anim: 'slide', delay: 0.35 },
			{ d: 'M21 38.6h13v4.4H21z', anim: 'slide', delay: 0.7 },
		],
		deco: 'halo',
	},
	{
		id: 'a11y',
		name: 'Accessibility',
		group: 'Check',
		accent: PALETTE.violet,
		idea: 'The universal access figure inside a lens; an orbit marks the keyboard and screen-reader path.',
		base: circle(32, 32, 26),
		parts: [
			{ d: circle(32, 17.5, 4), anim: 'pulse', delay: 0 },
			{ d: 'M17 23.5 L47 23.5 L47 28 L36.4 29.2 L36.4 36 L41.2 48.6 L37 50.2 L32 40.2 L27 50.2 L22.8 48.6 L27.6 36 L27.6 29.2 L17 28 Z', anim: 'float', delay: 0 },
		],
		deco: 'orbit',
	},
	{
		id: 'mail',
		name: 'Mail and DNS',
		group: 'Check',
		accent: PALETTE.gold,
		idea: 'An envelope sealed by SPF, DKIM and DMARC: the seal stamps once the records line up.',
		base: 'M7 17h50v32H7z',
		parts: [
			{ d: 'M9 19.5 L32 36 L55 19.5 L57 22.4 L32 40.4 L7 22.4 Z', anim: 'none', delay: 0 },
			{ d: circle(48, 47, 9), anim: 'pulse', delay: 0.2 },
			{ d: 'M43.3 47.1 L45.4 45 L47.4 47 L51.6 42.8 L53.7 44.9 L47.4 51.2 Z', anim: 'blink', delay: 0.5, tone: 'ink' },
		],
		deco: 'none',
	},
	{
		id: 'hack',
		name: 'Hack signs',
		group: 'Cyber',
		accent: PALETTE.mint,
		idea: 'A page window with a hairline crack; the scan line passes and the crack lights where it finds tampering.',
		base: 'M7 11h50v42H7z',
		parts: [
			{ d: 'M7 11h50v8H7z', anim: 'none', delay: 0, tone: 'dim' },
			{ d: 'M33 19 L28.6 28 L34.6 32.4 L27.4 40.4 L32.4 44.6 L29.4 53 L31.6 53 L35.6 44.2 L30.6 40.2 L37.6 32 L31.6 27.6 L35.2 19 Z', anim: 'flicker', delay: 0 },
			{ d: 'M9 23h46v2.2H9z', anim: 'scan', delay: 0, tone: 'beam' },
		],
		deco: 'none',
	},
	{
		id: 'crit',
		name: 'Critical threat',
		group: 'Cyber',
		accent: PALETTE.red,
		idea: 'The octagon of the top threat level, with a pulse that rings outward. Only high and critical use coral and red.',
		base: 'M22.5 5h19L59 22.5v19L41.5 59h-19L5 41.5v-19Z',
		parts: [
			{ d: 'M28.8 16h6.4l-1.1 21.5h-4.2z', anim: 'pulse', delay: 0 },
			{ d: circle(32, 45, 3.8), anim: 'blink', delay: 0.3 },
		],
		deco: 'rings',
	},
	{
		id: 'live',
		name: 'Live Reports',
		group: 'Feature',
		accent: PALETTE.mint,
		idea: 'A turning globe with a live pulse: reviewed sites appear as they finish, anywhere in the world.',
		base: circle(32, 32, 25),
		parts: [
			{ d: ring(32, 32, 10.5, 25, 2.2), anim: 'spin', delay: 0, rule: 'evenodd' },
			{ d: 'M7.4 30.9h49.2v2.2H7.4z', anim: 'none', delay: 0 },
			{ d: circle(44, 19, 3.6), anim: 'blink', delay: 0 },
		],
		deco: 'orbit',
	},
];

// Threat levels from #3816: shape and colour both change, so the level reads without colour too.
export const LEVELS = [
	{ id: 'info', name: 'Info', accent: PALETTE.cyan, base: circle(32, 32, 24), mark: 'M29.6 27h4.8v18h-4.8z ' + circle(32, 20, 3.2) },
	{ id: 'watch', name: 'Watch', accent: PALETTE.gold, base: 'M32 7 L58 53 H6 Z', mark: 'M29.8 24h4.4l-.8 15h-2.8z ' + circle(32, 45.5, 2.8) },
	{ id: 'high', name: 'High', accent: PALETTE.coral, base: 'M32 5 L59 32 L32 59 L5 32 Z', mark: 'M29.6 19h4.8l-.9 18.5h-3z ' + circle(32, 44, 3) },
	{ id: 'critical', name: 'Critical', accent: PALETTE.red, base: 'M22.5 5h19L59 22.5v19L41.5 59h-19L5 41.5v-19Z', mark: 'M28.8 16h6.4l-1.1 21.5h-4.2z ' + circle(32, 45, 3.8) },
];

export const DIRECTIONS = [
	{
		id: 'crystal',
		name: 'Crystal relic',
		line: 'Each check is a cut-glass object in the hero\'s material: refraction, iridescence, a light sweep, the glyph glowing inside.',
		best: 'Hero tiles, share cards, the paid report cover.',
	},
	{
		id: 'line',
		name: 'Line light',
		line: 'Holographic blueprints: the outline draws itself, a spark runs the edge, the glyph switches on. The scanner at work.',
		best: 'Report rows, the cyber map, loading states, motion clips.',
	},
	{
		id: 'badge',
		name: 'Frosted badge',
		line: 'A frosted glass tile with stacked layers and depth, tilting with the pointer. App-icon clarity in our colours.',
		best: 'Check grids, fix packages, small sizes in light and dark.',
	},
];
