// The 2D motion scenes of the feature deck (#3931): plain SVG with CSS animation, no script.
// Every animation here repeats over the same 6-second loop (or a divisor of it), so the PowerPoint build can
// record one loop as a GIF that joins up seamlessly. SCENE_LOOP is that length in seconds.

const SCENE_LOOP = 6;

// Keyframes helpers: percent-based so one loop tells the whole story.
const kf = (name, stops) =>
	`@keyframes ${name}{${Object.entries(stops)
		.map(([p, v]) => `${p}%{${v}}`)
		.join('')}}`;
const show = (name, from, to) => kf(name, { 0: 'opacity:0', [from]: 'opacity:0', [from + 1]: 'opacity:1', [to]: 'opacity:1', [to + 1]: 'opacity:0', 100: 'opacity:0' });
const hide = (name, until) => kf(name, { 0: 'opacity:1', [until]: 'opacity:1', [until + 1]: 'opacity:0', 100: 'opacity:0' });
const swapOn = (name, at) => kf(name, { 0: 'opacity:0', [at]: 'opacity:0', [at + 1]: 'opacity:1', 94: 'opacity:1', 99: 'opacity:0', 100: 'opacity:0' });
const swapOff = (name, at) => kf(name, { 0: 'opacity:1', [at]: 'opacity:1', [at + 1]: 'opacity:0', 100: 'opacity:0' });
const L = `${SCENE_LOOP}s linear infinite`;

let css = '';
const scenes = {};

// --------------------------------------------------------------------- shop
{
	const hits = [
		{ id: 1, at: 20 },
		{ id: 2, at: 46 },
		{ id: 3, at: 70 },
	];
	for (const h of hits) css += swapOff(`rd${h.id}`, h.at) + swapOn(`gn${h.id}`, h.at);
	css += kf('mag', {
		0: 'transform:translate(70px,330px)',
		10: 'transform:translate(330px,70px)',
		28: 'transform:translate(330px,70px)',
		38: 'transform:translate(205px,255px)',
		52: 'transform:translate(205px,255px)',
		62: 'transform:translate(430px,260px)',
		78: 'transform:translate(430px,260px)',
		92: 'transform:translate(70px,330px)',
		100: 'transform:translate(70px,330px)',
	});
	css += kf('digits', { 0: 'opacity:1', 70: 'opacity:1', 71: 'opacity:0', 100: 'opacity:0' });
	css += kf('digits2', { 0: 'opacity:0', 70: 'opacity:0', 71: 'opacity:1', 94: 'opacity:1', 99: 'opacity:0', 100: 'opacity:0' });
	css += kf('badge', { 0: 'transform:scale(0);opacity:0', 80: 'transform:scale(0);opacity:0', 86: 'transform:scale(1.15);opacity:1', 90: 'transform:scale(1);opacity:1', 96: 'transform:scale(1);opacity:1', 100: 'transform:scale(0);opacity:0' });
	css += `.sc-shop .mag{animation:mag ${L};transform-box:view-box}
.sc-shop .rd1,.sc-shop .rd2,.sc-shop .rd3{}
.sc-shop .rd1{animation:rd1 ${L}}.sc-shop .gn1{animation:gn1 ${L};opacity:0}
.sc-shop .rd2{animation:rd2 ${L}}.sc-shop .gn2{animation:gn2 ${L};opacity:0}
.sc-shop .rd3{animation:rd3 ${L}}.sc-shop .gn3{animation:gn3 ${L};opacity:0}
.sc-shop .d0{animation:digits ${L}}.sc-shop .d1{animation:digits2 ${L};opacity:0}
.sc-shop .badge{animation:badge ${L};transform-box:fill-box;transform-origin:center;opacity:0}`;
	const mark = (id, x, y) => `<g transform="translate(${x} ${y})"><g class="rd${id}"><circle r="14" fill="#f39a8b"/><text y="6" text-anchor="middle" font-size="20" font-weight="700" fill="#2b0d09">!</text></g><g class="gn${id}"><circle r="14" fill="#6fe3b1"/><path d="M-6 0 L-2 5 L7 -5" fill="none" stroke="#04281a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></g></g>`;
	const stripes = Array.from({ length: 8 }, (_, i) => `<rect x="${100 + i * 55}" y="96" width="55" height="42" fill="${i % 2 ? '#e8f3f4' : '#4db3bb'}"/>`).join('');
	const scallops = Array.from({ length: 8 }, (_, i) => `<circle cx="${127.5 + i * 55}" cy="138" r="27.5" fill="${i % 2 ? '#e8f3f4' : '#4db3bb'}"/>`).join('');
	scenes.shop = `<svg viewBox="0 0 640 400" class="sc sc-shop" role="img" aria-label="A shop being inspected: a cracked sign, an open lock and a broken counter each turn green after the inspector looks at them">
<rect x="0" y="352" width="640" height="48" fill="#0a181c"/>
<rect x="110" y="130" width="420" height="222" rx="10" fill="#10282d" stroke="#2c5b62" stroke-width="2"/>
${stripes}${scallops}
<rect x="250" y="34" width="150" height="48" rx="9" fill="#16373d" stroke="#4db3bb" stroke-width="2"/>
<text x="325" y="68" text-anchor="middle" font-size="26" font-weight="700" fill="#e8f3f4" letter-spacing="3">SHOP</text>
<g class="rd1"><path d="M300 40 L312 58 L304 66 L318 80" fill="none" stroke="#f39a8b" stroke-width="3"/></g>
<rect x="160" y="212" width="90" height="140" rx="6" fill="#0b1a1e" stroke="#4db3bb" stroke-width="2"/>
<g class="rd2"><path d="M160 212 L222 226 L222 352 L160 352 Z" fill="#17353b" stroke="#4db3bb" stroke-width="2"/></g>
<g transform="translate(205 285)"><rect x="-14" y="-4" width="28" height="22" rx="4" fill="#e2c48a"/><g class="rd2"><path d="M-8 -4 V-14 a8 8 0 0 1 16 0" fill="none" stroke="#e2c48a" stroke-width="4" transform="translate(8 -8) rotate(25)"/></g><g class="gn2"><path d="M-8 -4 V-14 a8 8 0 0 1 16 0 V-4" fill="none" stroke="#6fe3b1" stroke-width="4"/></g></g>
<rect x="300" y="212" width="190" height="96" rx="10" fill="#0b1a1e" stroke="#4db3bb" stroke-width="2"/>
<text x="320" y="238" font-size="14" fill="#9fb3b8">Visitors today</text>
<text class="d0" x="320" y="286" font-size="44" font-weight="700" fill="#f39a8b">0</text>
<text class="d1" x="320" y="286" font-size="44" font-weight="700" fill="#6fe3b1">128</text>
${mark(1, 410, 58)}${mark(2, 262, 216)}${mark(3, 482, 220)}
<g class="mag"><circle r="30" fill="rgba(126,246,251,.14)" stroke="#7ef6fb" stroke-width="6"/><line x1="21" y1="21" x2="52" y2="52" stroke="#7ef6fb" stroke-width="9" stroke-linecap="round"/></g>
<g class="badge"><rect x="486" y="318" width="132" height="64" rx="14" fill="#6fe3b1"/><text x="552" y="346" text-anchor="middle" font-size="15" font-weight="700" fill="#04281a">ALL CLEAR</text><text x="552" y="368" text-anchor="middle" font-size="13" fill="#04281a">3 fixed</text></g>
</svg>`;
}

// --------------------------------------------------------------------- progress
{
	const rows = ['Connecting', 'Analyzing pages', 'Browser pass', 'Writing cases', 'Threat check', 'Speed checks', 'Scoring and signing'];
	const step = 12.5;
	css += rows
		.map((_, i) => {
			const at = Math.round(8 + i * step);
			return swapOn(`pd${i}`, at) + swapOff(`pp${i}`, at) + kf(`pl${i}`, { 0: 'opacity:.38', [at]: 'opacity:.38', [at + 1]: 'opacity:1', 94: 'opacity:1', 99: 'opacity:.38', 100: 'opacity:.38' }) + kf(`pa${i}`, { 0: 'opacity:0', [Math.max(0, at - Math.round(step))]: 'opacity:0', [Math.max(1, at - Math.round(step)) + 1]: 'opacity:1', [at]: 'opacity:1', [at + 1]: 'opacity:0', 100: 'opacity:0' });
		})
		.join('');
	css += kf('bar', { 0: 'transform:scaleX(0)', ...Object.fromEntries(rows.map((_, i) => [Math.round(8 + i * step) + 1, `transform:scaleX(${((i + 1) / rows.length).toFixed(3)})`])), 94: 'transform:scaleX(1)', 99: 'transform:scaleX(1)', 100: 'transform:scaleX(0)' });
	css += rows.map((_, i) => `.sc-progress .pd${i}{animation:pd${i} ${L};opacity:0}.sc-progress .pp${i}{animation:pp${i} ${L}}.sc-progress .pl${i}{animation:pl${i} ${L}}.sc-progress .pa${i}{animation:pa${i} ${L};opacity:0}`).join('') + `.sc-progress .bar{animation:bar ${L};transform-box:fill-box;transform-origin:left center}`;
	const body = rows
		.map((r, i) => {
			const y = 24 + i * 46;
			return `<g transform="translate(0 ${y})"><rect class="pa${i}" x="24" y="-6" width="592" height="40" rx="12" fill="rgba(126,246,251,.13)" stroke="#4db3bb"/><circle class="pp${i}" cx="60" cy="14" r="12" fill="none" stroke="#6b8a90" stroke-width="3"/><g class="pd${i}"><circle cx="60" cy="14" r="13" fill="#6fe3b1"/><path d="M54 14 L58 19 L67 9" fill="none" stroke="#04281a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></g><text class="pl${i}" x="92" y="22" font-size="22" font-weight="600" fill="#e8f3f4">${r}</text>${i === 4 ? '<g class="pl4"><rect x="270" y="1" width="58" height="24" rx="12" fill="#e2c48a"/><text x="299" y="18" text-anchor="middle" font-size="13" font-weight="700" fill="#2d2205">NEW</text></g>' : ''}</g>`;
		})
		.join('');
	scenes.progress = `<svg viewBox="0 0 640 400" class="sc sc-progress" role="img" aria-label="A progress list of seven stages that tick off one by one">${body}<rect x="24" y="360" width="592" height="14" rx="7" fill="rgba(255,255,255,.1)"/><rect class="bar" x="24" y="360" width="592" height="14" rx="7" fill="#7ef6fb"/></svg>`;
}

// --------------------------------------------------------------------- rescue
{
	css += kf('tok', { 0: 'transform:translate(0,0)', 8: 'transform:translate(0,0)', 22: 'transform:translate(160px,0)', 40: 'transform:translate(160px,0)', 50: 'transform:translate(320px,0)', 66: 'transform:translate(320px,0)', 76: 'transform:translate(480px,0)', 96: 'transform:translate(480px,0)', 100: 'transform:translate(0,0)' });
	css += swapOn('x1', 12) + swapOn('x2', 26) + swapOn('x3', 58) + swapOn('ok4', 82);
	css += kf('env', { 0: 'transform:translateY(40px);opacity:0', 84: 'transform:translateY(40px);opacity:0', 92: 'transform:translateY(-6px);opacity:1', 96: 'transform:translateY(0);opacity:1', 99: 'transform:translateY(0);opacity:0', 100: 'opacity:0' });
	css += kf('spin', { 0: 'transform:rotate(0)', 100: 'transform:rotate(720deg)' });
	css += kf('promise', { 0: 'opacity:0;transform:translateY(10px)', 6: 'opacity:1;transform:translateY(0)', 92: 'opacity:1', 98: 'opacity:0', 100: 'opacity:0' });
	css += `.sc-rescue .tok{animation:tok ${L}}.sc-rescue .x1{animation:x1 ${L};opacity:0}.sc-rescue .x2{animation:x2 ${L};opacity:0}.sc-rescue .x3{animation:x3 ${L};opacity:0}.sc-rescue .ok4{animation:ok4 ${L};opacity:0}.sc-rescue .env{animation:env ${L};opacity:0}.sc-rescue .promise{animation:promise ${L};opacity:0}.sc-rescue .spin{animation:spin 3s linear infinite;transform-box:fill-box;transform-origin:center}`;
	const boxes = [
		['Read it plainly', '🌐', 'x1', '✗'],
		['Find out why', '🔎', null, ''],
		['Retry the right way', '🔁', 'x3', '✗'],
		['Real Chrome window', '💻', 'ok4', '✓'],
	];
	const bx = boxes
		.map((b, i) => {
			const x = 30 + i * 160;
			const mk = b[2] ? `<g class="${b[2]}" transform="translate(${x + 100} 148)"><circle r="17" fill="${b[3] === '✓' ? '#6fe3b1' : '#f39a8b'}"/><text y="7" text-anchor="middle" font-size="22" font-weight="800" fill="#10191c">${b[3]}</text></g>` : i === 1 ? `<g class="x2" transform="translate(${x + 100} 148)"><circle r="17" fill="#e2c48a"/><text y="7" text-anchor="middle" font-size="20" font-weight="800" fill="#2d2205">?</text></g>` : '';
			return `<g><rect x="${x}" y="150" width="120" height="110" rx="14" fill="rgba(255,255,255,.07)" stroke="#4db3bb" stroke-width="2"/><text x="${x + 60}" y="196" text-anchor="middle" font-size="34">${b[1]}</text><text x="${x + 60}" y="226" text-anchor="middle" font-size="14" font-weight="600" fill="#e8f3f4">${b[0].split(' ').slice(0, 2).join(' ')}</text><text x="${x + 60}" y="244" text-anchor="middle" font-size="14" font-weight="600" fill="#e8f3f4">${b[0].split(' ').slice(2).join(' ')}</text>${mk}</g>${i < 3 ? `<path d="M${x + 124} 205 h32" stroke="#4db3bb" stroke-width="3" marker-end="url(#ar)"/>` : ''}`;
		})
		.join('');
	scenes.rescue = `<svg viewBox="0 0 640 400" class="sc sc-rescue" role="img" aria-label="A report that fails is retried with a better method each time until it works, then arrives by email">
<defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#4db3bb"/></marker></defs>
${bx}
<g class="tok"><circle cx="90" cy="125" r="13" fill="#7ef6fb"/><text x="90" y="131" text-anchor="middle" font-size="16" font-weight="800" fill="#06262a">R</text></g>
<g class="promise"><rect x="36" y="30" width="270" height="46" rx="12" fill="#e2c48a"/><text x="171" y="51" text-anchor="middle" font-size="15" font-weight="700" fill="#2d2205">We promise you a reply</text><text x="171" y="68" text-anchor="middle" font-size="13" fill="#2d2205">+ a 20% apology code</text></g>
<g class="env"><rect x="440" y="300" width="160" height="62" rx="12" fill="#6fe3b1"/><text x="520" y="326" text-anchor="middle" font-size="22">✉️</text><text x="520" y="350" text-anchor="middle" font-size="15" font-weight="700" fill="#04281a">Your report is here</text></g>
</svg>`;
}

// --------------------------------------------------------------------- flow
{
	css += kf('ringp', { 0: 'transform:scale(.3);opacity:.7', 100: 'transform:scale(5);opacity:0' });
	const nodes = [
		['🌐', 'The site', 'you gave us', -180, -130],
		['🖥️', 'Browser', 'Belgium', 0, -130],
		['🔎', 'Google', 'speed, safety', 180, -130],
		['☁️', 'Cloudflare', 'scan, DNS', 240, 0],
		['🛡️', 'Threat lists', 'public lists', 180, 120],
		['📇', 'Registry', 'domain record', 0, 120],
		['📧', 'Mail checks', 'blocklists', -180, 120],
		['🔍', 'Search', 'web results', -240, 0],
	];
	css += nodes.map((_, i) => { const a = 6 + i * 9; return kf(`fn${i}`, { 0: 'opacity:.3', [a]: 'opacity:.3', [a + 2]: 'opacity:1', [a + 6]: 'opacity:1', [a + 8]: 'opacity:.3', 100: 'opacity:.3' }) + kf(`fl${i}`, { 0: 'opacity:.15', [a]: 'opacity:.15', [a + 2]: 'opacity:.95', [a + 8]: 'opacity:.3', 100: 'opacity:.3' }); }).join('');
	css += nodes.map((_, i) => `.sc-flow .fn${i}{animation:fn${i} ${L}}.sc-flow .fl${i}{animation:fl${i} ${L}}`).join('') + `.sc-flow .ring{animation:ringp 3s ease-out infinite;transform-box:fill-box;transform-origin:center}`;
	const pos = nodes.map((n) => [320 + n[3], 200 + n[4]]);
	const ln = pos.map((p, i) => `<line class="fl${i}" x1="320" y1="200" x2="${p[0]}" y2="${p[1]}" stroke="#7ef6fb" stroke-width="2.5"/>`).join('');
	const nd = nodes.map((n, i) => `<g class="fn${i}"><circle cx="${pos[i][0]}" cy="${pos[i][1]}" r="36" fill="#10282d" stroke="#4db3bb" stroke-width="2.5"/><text x="${pos[i][0]}" y="${pos[i][1] + 9}" text-anchor="middle" font-size="26">${n[0]}</text><text x="${pos[i][0]}" y="${pos[i][1] + 58}" text-anchor="middle" font-size="14" font-weight="700" fill="#e8f3f4">${n[1]}</text><text x="${pos[i][0]}" y="${pos[i][1] + 76}" text-anchor="middle" font-size="12" fill="#9fb3b8">${n[2]}</text></g>`).join('');
	scenes.flow = `<svg viewBox="0 0 640 400" class="sc sc-flow" role="img" aria-label="The review server in the centre talks to eight outside parties in turn: the site, a browser in Belgium, Google, Cloudflare, threat lists, the domain registry, mail blocklists and web search">
${ln}
<circle class="ring" cx="320" cy="200" r="46" fill="none" stroke="#7ef6fb" stroke-width="3"/>
<circle cx="320" cy="200" r="46" fill="#16373d" stroke="#7ef6fb" stroke-width="3"/>
<text x="320" y="196" text-anchor="middle" font-size="15" font-weight="800" fill="#e8f3f4">QA-lab</text><text x="320" y="214" text-anchor="middle" font-size="12" fill="#9fb3b8">review server</text>
${nd}
</svg>`;
}

// --------------------------------------------------------------------- radar
{
	const blips = [
		{ a: 35, r: 100, c: '#f39a8b' },
		{ a: 120, r: 60, c: '#e2c48a' },
		{ a: 200, r: 135, c: '#f39a8b' },
		{ a: 300, r: 90, c: '#e2c48a' },
	];
	css += kf('sweep', { 0: 'transform:rotate(0deg)', 100: 'transform:rotate(360deg)' });
	css += blips.map((b, i) => { const p = Math.round((b.a / 360) * 100); return kf(`bl${i}`, { 0: 'opacity:.12;transform:scale(1)', [Math.max(0, p - 1)]: 'opacity:.12;transform:scale(1)', [p + 1]: 'opacity:1;transform:scale(1.5)', [p + 8]: 'opacity:.9;transform:scale(1)', [Math.min(99, p + 40)]: 'opacity:.15', 100: 'opacity:.12;transform:scale(1)' }); }).join('');
	css += blips.map((_, i) => `.sc-radar .bl${i}{animation:bl${i} ${L};transform-box:fill-box;transform-origin:center}`).join('') + `.sc-radar .sweep{animation:sweep ${L};transform-box:view-box;transform-origin:320px 200px}`;
	const bl = blips.map((b, i) => { const x = 320 + b.r * Math.cos((b.a * Math.PI) / 180); const y = 200 + b.r * Math.sin((b.a * Math.PI) / 180); return `<circle class="bl${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${b.c}"/>`; }).join('');
	scenes.radar = `<svg viewBox="0 0 640 400" class="sc sc-radar" role="img" aria-label="A radar sweeps around a shield and lights up warning dots where it finds signs of attacks">
<defs><linearGradient id="sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7ef6fb" stop-opacity=".02"/><stop offset="1" stop-color="#7ef6fb" stop-opacity=".55"/></linearGradient></defs>
<circle cx="320" cy="200" r="170" fill="#0a1d21" stroke="#2c5b62" stroke-width="2"/>
<circle cx="320" cy="200" r="113" fill="none" stroke="#2c5b62" stroke-width="2"/><circle cx="320" cy="200" r="57" fill="none" stroke="#2c5b62" stroke-width="2"/>
<line x1="150" y1="200" x2="490" y2="200" stroke="#2c5b62"/><line x1="320" y1="30" x2="320" y2="370" stroke="#2c5b62"/>
<g class="sweep"><path d="M320 200 L490 200 A170 170 0 0 0 450.2 90.7 Z" fill="url(#sw)"/><line x1="320" y1="200" x2="490" y2="200" stroke="#7ef6fb" stroke-width="3"/></g>
${bl}
<path d="M320 178 l22 8 v14 c0 14 -10 24 -22 30 c-12 -6 -22 -16 -22 -30 v-14 z" fill="#16373d" stroke="#7ef6fb" stroke-width="3"/><path d="M310 204 l8 8 l14 -16" fill="none" stroke="#6fe3b1" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<g font-size="14" font-weight="700"><rect x="14" y="30" width="118" height="28" rx="14" fill="rgba(243,154,139,.2)" stroke="#f39a8b"/><text x="73" y="49" text-anchor="middle" fill="#f39a8b">Attacker lists</text><rect x="14" y="68" width="118" height="28" rx="14" fill="rgba(226,196,138,.2)" stroke="#e2c48a"/><text x="73" y="87" text-anchor="middle" fill="#e2c48a">Known holes</text><rect x="508" y="30" width="118" height="28" rx="14" fill="rgba(185,168,255,.2)" stroke="#b9a8ff"/><text x="567" y="49" text-anchor="middle" fill="#b9a8ff">Breach news</text></g>
</svg>`;
}

module.exports = { scenes, css, SCENE_LOOP };
