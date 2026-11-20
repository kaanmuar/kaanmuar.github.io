#!/usr/bin/env node
// Renders the launcher-picker previews of the Jarvis map widgets (#3977) from android/app/src/main/assets/world.json, with sample numbers.
//   node scripts/build-map-widget-previews.js     (needs playwright and its Chromium, as the browser tests do)
// Writes android/app/src/main/res/drawable-nodpi/widget_preview_{cyber,outreach,marketing}_map_{2x2,4x2,4x3,4x4}.png
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const world = JSON.parse(fs.readFileSync(path.join(root, 'android/app/src/main/assets/world.json'), 'utf8'));
const out = path.join(root, 'android/app/src/main/res/drawable-nodpi');
const SIZES = { '2x2': [150, 150], '4x2': [300, 130], '4x3': [300, 200], '4x4': [300, 280] };
const LIGHTS = ['#14222C', '#1F4C5C', '#24728B', '#2FB0D4', '#86ECFF', '#FFD76E'];
const heat = (v, rgb) => `rgba(${rgb},${(0.18 + 0.82 * Math.sqrt(v)).toFixed(2)})`;

const KINDS = {
	cyber: {
		title: 'Cyber-attack map',
		chip: 'LIVE ›',
		fills: {
			US: heat(1, '255,77,141'),
			CN: heat(0.8, '255,77,141'),
			RU: heat(0.6, '255,77,141'),
			IN: heat(0.35, '255,77,141'),
			BR: heat(0.25, '255,77,141'),
			DE: heat(0.3, '255,77,141'),
			GB: heat(0.22, '255,77,141'),
			UA: heat(0.5, '255,77,141'),
			IR: heat(0.2, '255,77,141'),
			FR: heat(0.15, '255,77,141'),
			AU: heat(0.1, '255,77,141'),
		},
		stats: [
			['Cited events', '1,284', 0],
			['Countries', '37', 0],
			['Reports exposed', '3', 1],
			['Botnet online', '212', 0],
		],
		lines: [
			['🇺🇸 United States', '312', 1],
			['🇨🇳 China', '241', 0],
			['🇷🇺 Russia', '188', 0],
			['🇺🇦 Ukraine', '102', 0],
		],
	},
	outreach: {
		title: 'Outreach map',
		chip: 'LIGHT ›',
		fills: {
			US: LIGHTS[5],
			GB: LIGHTS[4],
			DE: LIGHTS[4],
			FR: LIGHTS[3],
			ES: LIGHTS[3],
			BR: LIGHTS[2],
			MX: LIGHTS[2],
			CA: LIGHTS[3],
			AU: LIGHTS[2],
			IN: LIGHTS[1],
			ZA: LIGHTS[2],
			NG: LIGHTS[1],
			CO: LIGHTS[4],
			AR: LIGHTS[2],
			IT: LIGHTS[3],
		},
		stats: [
			['Emails sent', '4,210', 0],
			['Reply rate', '3.8%', 0],
			['Prospects', '12,904', 0],
			['Need attention', '6', 1],
		],
		lines: [
			['🇺🇸 USA', 'Blazing', 0],
			['🇬🇧 UK', 'Bright', 0],
			['🇩🇪 Germany', 'Bright', 0],
			['🇨🇴 Colombia', 'Bright', 0],
		],
	},
	marketing: {
		title: 'Marketing map',
		chip: 'VISITORS ›',
		fills: {
			US: heat(1, '56,225,255'),
			GB: heat(0.5, '56,225,255'),
			DE: heat(0.35, '56,225,255'),
			CO: heat(0.45, '56,225,255'),
			MX: heat(0.3, '56,225,255'),
			IN: heat(0.4, '56,225,255'),
			BR: heat(0.28, '56,225,255'),
			CA: heat(0.22, '56,225,255'),
			FR: heat(0.2, '56,225,255'),
			ES: heat(0.18, '56,225,255'),
			AU: heat(0.15, '56,225,255'),
		},
		stats: [
			['Visitors', '8,440', 0],
			['Link clicks', '1,902', 0],
			['Social replies', '57', 0],
			['Revenue', '$1,240', 0],
		],
		lines: [
			['🇺🇸 USA', '3,102', 0],
			['🇬🇧 UK', '905', 0],
			['🇨🇴 Colombia', '771', 0],
			['🇮🇳 India', '640', 0],
		],
	},
};

function svg(fills, w, h) {
	const shapes = Object.entries(world.shapes)
		.map(([cc, d]) => `<path d="${d}" fill="${fills[cc] || '#14222C'}" stroke="#0A141B" stroke-width="0.7"/>`)
		.join('');
	return `<svg viewBox="0 0 ${world.w} ${world.h}" width="${w}" height="${h}" style="background:#0A141B;border-radius:8px">${shapes}</svg>`;
}

const stat = ([label, value, alert]) =>
	`<div class="stat"><small>${label}</small><b style="color:${alert ? '#FF4D8D' : '#E6F7FF'}">${value}</b></div>`;
const line = ([label, value, alert]) =>
	`<div class="line"><span>${label}</span><i style="color:${alert ? '#FF4D8D' : '#38E1FF'}">${value}</i></div>`;

function html(kind, size) {
	const k = KINDS[kind];
	const [w, h] = SIZES[size];
	const iw = w - 28;
	const head = `<div class="head"><span>◈ ${(size === '2x2' ? k.title.split(' ')[0] : k.title).toUpperCase()}</span><em>${k.chip}</em></div>`;
	let body;
	if (size === '2x2') body = `${svg(k.fills, iw, iw / 2)}${stat(k.stats[0])}`;
	else if (size === '4x2')
		body = `<div style="display:flex;gap:10px">${svg(k.fills, 150, 75)}<div>${k.stats.slice(0, 2).map(stat).join('')}</div></div>`;
	else if (size === '4x3')
		body = `${svg(k.fills, iw, iw / 2 - 8)}<div style="display:flex;gap:8px;margin-top:4px">${k.stats.slice(0, 3).map(stat).join('')}</div>`;
	else
		body = `${svg(k.fills, iw, iw / 2)}<div style="display:flex;gap:8px;margin-top:4px">${k.stats.slice(0, 2).map(stat).join('')}</div><div style="display:flex;gap:8px">${k.stats.slice(2).map(stat).join('')}</div>${k.lines.slice(0, 2).map(line).join('')}`;
	return `<body style="margin:0;background:transparent"><div class="card" style="width:${w}px;height:${h}px">${head}${body}</div>
<style>
.card{box-sizing:border-box;padding:12px 14px;border-radius:20px;background:linear-gradient(160deg,#10222d,#08121a);border:1px solid rgba(56,225,255,.45);font:12px system-ui,sans-serif;color:#E6F7FF;overflow:hidden}
.head{display:flex;justify-content:space-between;font:10px ui-monospace,monospace;color:#38E1FF;margin-bottom:6px}.head em{font-style:normal;color:#FFB547}
.stat{display:flex;flex-direction:column;flex:1}.stat small{font-size:10px;color:#8FB3C7}.stat b{font-size:16px}
.line{display:flex;justify-content:space-between;height:18px;align-items:center;font-size:11px}.line i{font:11px ui-monospace,monospace;font-style:normal}</style></body>`;
}

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ deviceScaleFactor: 2 });
	for (const kind of Object.keys(KINDS)) {
		for (const size of Object.keys(SIZES)) {
			const [w, h] = SIZES[size];
			await page.setViewportSize({ width: w, height: h });
			await page.setContent(html(kind, size));
			await page.screenshot({ path: path.join(out, `widget_preview_${kind}_map_${size}.png`), omitBackground: true });
		}
	}
	await browser.close();
	console.log('wrote 12 previews to', out);
})();
