/* Jarvis: Admin > Statistics as one command center. admin.html mounts it in #stats-pane after sign-in.

   Jarvis reads no Firestore (#2102). The products, the range's numbers and the external sources come from the jarvis
   function's snapshot op, the same cached answer the Android app reads (jarvisSnapshot in functions/index.js); the
   few panels it does not carry (actions, notices, social proposals and runs, Studio, shares) ask their own ops. The
   inbox comes from the admin page. The numbers come from js/admin-jarvis-core.js (window.JarvisCore). */
import { createBrowserPush, productOf, browserName } from "./admin-jarvis-push.js?v=2509";

const ENDPOINT = 'https://us-central1-carlosm-interactive-cv.cloudfunctions.net/jarvis';
const DESK = 'https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl/desk';
const LIVE_MS = 60 * 1000;
// The server keeps a snapshot this long (jarvis.TTL.snapshot); asking sooner returns the same one.
const SNAPSHOT_MS = 5 * 60 * 1000;
// The external sources the snapshot carries; the rest are asked one by one.
const SNAPSHOT_OPS = ['health', 'jobs', 'github', 'uptime', 'speed', 'pagespeed', 'local', 'ga4', 'cloudflare', 'money', 'email', 'mailbox', 'social', 'safety', 'platform', 'search', 'outreach', 'targets', 'addresses', 'marketing', 'marketing-sync', 'calls', 'engagement', 'people', 'github-work', 'mail-codes'];
const OWN_OPS = ['actions', 'notices', 'social-proposals', 'social-runs', 'studio', 'share-list'];
const RANGES = [['1', '24 hours'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year']];
const COLORS = { cyan: '#38e1ff', amber: '#ffb547', pink: '#ff4d8d', green: '#3dffa8', violet: '#a98bff', dim: '#5d7a8c' };
const GA_GROUP = { cv: 'CV site', review: 'QA-lab URL Review' };
const FAMILY = { marketing: ['marketing', 'outreach', 'hub', 'business'] };
const inTab = (b, product) => product === 'overview' || (FAMILY[product] || [product]).includes(b.product);
const LINKS = [
    ['Open the review desk', DESK], ['Open failed runs', DESK + '/failures'],
    ['Open the GitHub board', 'https://github.com/orgs/carlosandmunoz-hq/projects/1'], ['Open GitHub Actions', 'https://github.com/kaanmuar/kaanmuar.github.io/actions'],
    ['Open GA4', 'https://analytics.google.com/analytics/web/#/p495572902/reports/intelligenthome'], ['Open Search Console', 'https://search.google.com/search-console?resource_id=sc-domain:carlosandmunoz.com'],
    ['Open Cloudflare', 'https://dash.cloudflare.com/'], ['Open the Firebase console', 'https://console.firebase.google.com/project/carlosm-interactive-cv/overview'],
    ['Open Cloud Scheduler', 'https://console.cloud.google.com/cloudscheduler?project=carlosm-interactive-cv'], ['Open function logs', 'https://console.cloud.google.com/logs/query?project=carlosm-interactive-cv']
];

const esc = (value) => String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : esc(n));
const ago = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h'; };
const spent = (ms) => { const n = Number(ms) || 0, m = Math.round(n / 60000); return n < 60000 ? Math.round(n / 1000) + ' s' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''); };
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
const when = (value) => { const d = window.JarvisCore.toDate(value); return d ? d.toLocaleString('en-US', { timeZone: 'America/Bogota', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };

// --- charts (SVG and HTML, HUD colors) -------------------------------------------------------------------------

// #2807: charts answer a hover or a tap with the exact values of that point. Each point gets a transparent column
// (.jv-hit, its text in data-tip); chartTip() in mountJarvis shows it in the chart's .jv-tip.
const withUnit = (n, unit) => fmt(n) + (unit ? ' ' + unit : '');
function hits(xs, top, bottom, tips, edges) {
    return xs.map((cx, i) => {
        const a = i ? (xs[i - 1] + cx) / 2 : edges[0], b = i < xs.length - 1 ? (cx + xs[i + 1]) / 2 : edges[1];
        return `<rect class="jv-hit" x="${a.toFixed(1)}" y="${top}" width="${Math.max(1, b - a).toFixed(1)}" height="${bottom - top}" data-x="${cx.toFixed(1)}" data-tip="${esc(tips[i])}"><title>${esc(tips[i])}</title></rect>`;
    }).join('') + `<line class="jv-guide" x1="0" x2="0" y1="${top}" y2="${bottom}"></line>`;
}

// opts (#2807, all optional): title, unit (after each value), labels (one date per value: first and last show under
// the line and the tooltip names them). Without opts it is the bare line it always was.
function spark(values, color, opts) {
    const v = values && values.length ? values : [0];
    const w = 120, h = 32, max = Math.max(1, ...v);
    const xs = v.map((n, i) => (v.length === 1 ? w / 2 : (i / (v.length - 1)) * w));
    const pts = v.map((n, i) => `${xs[i].toFixed(1)},${(h - 2 - (n / max) * (h - 6)).toFixed(1)}`);
    const lines = `<polyline points="0,${h} ${pts.join(' ')} ${w},${h}" fill="${color}" fill-opacity="0.12" stroke="none"></polyline><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6"></polyline>`;
    if (!opts) return `<svg class="jv-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`;
    const labels = opts.labels || [];
    const tips = v.map((n, i) => `${labels[i] || ''}${labels[i] ? ': ' : ''}${withUnit(n, opts.unit)}`);
    return `<figure class="jv-chart jv-chart-spark">${opts.title ? `<figcaption class="jv-chart-title"><i style="background:${color}"></i>${esc(opts.title)}</figcaption>` : ''}<div class="jv-chart-plot"><svg class="jv-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc((opts.title || '') + ' per day, peak ' + withUnit(Math.max(...v), opts.unit))}">${lines}${hits(xs, 0, h, tips, [0, w])}</svg><div class="jv-tip" role="status" hidden></div></div>
        <div class="jv-spark-axis"><span>${esc(labels.length ? String(labels[0]).slice(5) : '')}</span><span>0–${esc(withUnit(max, opts.unit))}</span><span>${esc(labels.length ? String(labels[labels.length - 1]).slice(5) : '')}</span></div></figure>`;
}

// opts: fill (false: lines only); #2807, all optional: title, yLabel (the y axis, with its unit), unit (after each
// value in the legend and tooltip; a series' own unit wins), xLabel (under the dates), legend (false hides it).
// With any of title, yLabel, xLabel or unit the axes are HTML around a stretched plot, so their text keeps its size
// on a phone-wide panel; without them it is the all-SVG chart it always was.
function area(labels, series, opts) {
    if (!labels || !labels.length) return '<p class="jv-empty">No days in this range.</p>';
    const o = opts || {};
    const fill = o.fill !== false;
    const framed = !!(o.title || o.yLabel || o.xLabel || o.unit);
    const w = 760, h = framed ? 200 : 220, pad = 30, left = framed ? 6 : pad, right = framed ? 6 : pad, top = framed ? 8 : pad, bottom = framed ? 4 : pad;
    const peakValue = Math.max(1, ...series.flatMap((s) => s.values));
    const raw = peakValue / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const unit = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw));
    const max = Math.ceil(peakValue / unit) * unit;
    const x = (i) => left + (labels.length === 1 ? (w - left - right) / 2 : (i / (labels.length - 1)) * (w - left - right));
    const y = (n) => h - bottom - (n / max) * (h - bottom - top);
    const levels = Array.from({ length: max / unit + 1 }, (_, k) => k * unit);
    const step = Math.max(1, Math.ceil(labels.length / 8));
    const shown = labels.map((label, i) => i).filter((i) => i % step === 0 || i === labels.length - 1);
    const stroke = framed ? ' vector-effect="non-scaling-stroke"' : '';
    const grid = levels.map((n) => `<line x1="${left}" x2="${w - right}" y1="${y(n)}" y2="${y(n)}" class="jv-gridline"${stroke}></line>${framed ? '' : `<text x="${left - 6}" y="${y(n) + 3}" text-anchor="end" class="jv-axis">${n}</text>`}`).join('');
    const ticks = framed ? '' : shown.map((i) => `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" class="jv-axis">${esc(labels[i].slice(5))}</text>`).join('');
    const dot = (cx, cy, color) => (framed ? `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="${color}" stroke-width="8" stroke-linecap="round"${stroke}></line>` : `<circle cx="${cx}" cy="${cy}" r="4" fill="${color}"></circle>`);
    const paths = series.map((s, k) => {
        const line = s.values.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
        return (fill ? `<defs><linearGradient id="jvg${k}${s.color.slice(1)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="0.35"></stop><stop offset="1" stop-color="${s.color}" stop-opacity="0"></stop></linearGradient></defs>
            <polygon points="${x(0)},${h - bottom} ${line} ${x(s.values.length - 1)},${h - bottom}" fill="url(#jvg${k}${s.color.slice(1)})"></polygon>` : '') + `
            <polyline points="${line}" fill="none" stroke="${s.color}" stroke-width="2.2" class="jv-glow"${stroke}></polyline>${labels.length < 3 ? s.values.map((n, i) => dot(x(i).toFixed(1), y(n).toFixed(1), s.color)).join('') : ''}`;
    }).join('');
    const tips = labels.map((label, i) => `${label}: ${series.map((s) => s.name + ' ' + withUnit(s.values[i] || 0, s.unit || o.unit)).join(' · ')}`);
    const total = (s) => Math.round(s.values.reduce((a, b) => a + b, 0) * 10) / 10;
    const legend = o.legend === false ? '' : `<div class="jv-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)} ${s.unit || o.unit ? `<small>${esc(withUnit(total(s), s.unit || o.unit))} in range</small>` : fmt(total(s))}</span>`).join('')}</div>`;
    const svg = `<svg class="jv-area" viewBox="0 0 ${w} ${h}"${framed ? ' preserveAspectRatio="none"' : ''} role="img" aria-label="${esc(o.title || series.map((s) => s.name).join(' and ') + ' per day')}">${grid}${paths}${ticks}${hits(labels.map((_, i) => x(i)), top, h - bottom, tips, [left, w - right])}</svg>`;
    const plot = `<div class="jv-chart-plot">${svg}<div class="jv-tip" role="status" hidden></div></div>`;
    if (!framed) return `<figure class="jv-chart">${plot}${legend}</figure>`;
    const pct = (v, of) => ((v / of) * 100).toFixed(2) + '%';
    return `<figure class="jv-chart is-framed">${o.title ? `<figcaption class="jv-chart-title">${esc(o.title)}</figcaption>` : ''}<div class="jv-chart-frame">
        <span class="jv-chart-y">${o.yLabel ? `<span class="jv-axis-title">${esc(o.yLabel)}</span>` : ''}</span>
        <div class="jv-chart-yticks">${levels.map((n) => `<span style="top:${pct(y(n), h)}">${fmt(n)}</span>`).join('')}</div>
        ${plot}<span></span><span></span>
        <div class="jv-chart-xticks">${shown.map((i) => `<span style="left:${pct(x(i), w)}">${esc(labels[i].slice(5))}</span>`).join('')}</div>
        ${o.xLabel ? `<span></span><span></span><span class="jv-axis-title jv-chart-x">${esc(o.xLabel)}</span>` : ''}</div>${legend}</figure>`;
}

// opts: color, limit, empty; #2807, all optional: title, yLabel (what the rows are), unit (what the values count),
// legend (the series name, in its colour), drill (a panel id: each row opens its drill-down, see drillBodies) and
// open (the row whose drill-down is open).
function bars(list, opts) {
    const o = opts || {};
    const rows = (list || []).slice(0, o.limit || 12);
    if (!rows.length) return `<p class="jv-empty">${esc(o.empty || 'Nothing in this range.')}</p>`;
    const max = Math.max(1, ...rows.map((r) => r.value));
    const total = (list || []).reduce((s, r) => s + r.value, 0);
    const more = (list || []).length - rows.length;
    const color = o.color || COLORS.cyan;
    const drill = (r) => (o.drill ? ` class="is-drill${o.open === r.label ? ' is-open' : ''}" data-drill-open="${esc(o.drill + '|' + r.label)}" role="button" tabindex="0" aria-expanded="${o.open === r.label}"` : '');
    const head = o.yLabel || o.unit ? `<div class="jv-bars-head"><span>${esc(o.yLabel || '')}</span><span>${esc(o.unit || '')}</span></div>` : '';
    return `${o.title ? `<h4 class="jv-chart-title">${esc(o.title)}</h4>` : ''}${head}<ol class="jv-bars">${rows.map((r) => `<li title="${esc(r.label)}: ${esc(withUnit(r.value, o.unit))}"${drill(r)}><span class="jv-bar-label">${esc(r.label)}</span><span class="jv-bar-track"><span class="jv-bar-fill" style="width:${Math.max(2, (r.value / max) * 100).toFixed(1)}%;--c:${color}"></span></span><span class="jv-bar-value">${fmt(r.value)}<small>${total ? Math.round((r.value / total) * 100) + '%' : ''}</small></span></li>`).join('')}</ol>${more > 0 ? `<p class="jv-more">+${more} more in the export</p>` : ''}${o.legend ? `<div class="jv-legend"><span><i style="background:${color}"></i>${esc(o.legend)} <small>${esc(withUnit(total, o.unit))} in all</small></span></div>` : ''}`;
}

function ring(pct, label, color, size) {
    const r = 40, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, Number(pct) || 0));
    const tone = color || (v >= 90 ? COLORS.green : v >= 50 ? COLORS.amber : COLORS.pink);
    return `<svg class="jv-ring" viewBox="0 0 100 100" width="${size || 96}" height="${size || 96}" role="img" aria-label="${esc(label)} ${pct === null ? 'unknown' : v}">
        <circle cx="50" cy="50" r="${r}" class="jv-ring-track"></circle>
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="${tone}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 50 50)" class="jv-glow"></circle>
        <text x="50" y="52" text-anchor="middle" class="jv-ring-value">${pct === null ? '—' : v}</text><text x="50" y="68" text-anchor="middle" class="jv-ring-label">${esc(label)}</text></svg>`;
}

function funnel(steps) {
    const top = Math.max(1, ...steps.map((s) => s.value));
    return `<div class="jv-funnel">${steps.map((s, i) => `<div class="jv-funnel-step" style="--w:${Math.max(6, (s.value / top) * 100)}%"><span>${esc(s.label)}</span><strong>${fmt(s.value)}</strong>${i && s.value <= steps[i - 1].value ? `<small>${steps[i - 1].value ? Math.round((s.value / steps[i - 1].value) * 100) : 0}% of previous</small>` : ''}</div>`).join('')}</div>`;
}

function heat(grid, peakText) {
    const max = Math.max(1, ...grid.flat());
    const days = window.JarvisCore.WEEKDAYS;
    const hours = Array.from({ length: 24 }, (_, h) => `<span>${h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>`).join('');
    return `<div class="jv-heat" role="img" aria-label="Visits by weekday and hour, Bogota time. Busiest ${esc(peakText)}"><div class="jv-heat-hours"><span></span>${hours}</div>${grid.map((row, d) => `<div class="jv-heat-row"><span>${days[d]}</span>${row.map((n, h) => `<i style="--a:${n ? (0.15 + (n / max) * 0.85).toFixed(2) : 0}" title="${days[d]} ${String(h).padStart(2, '0')}:00 · ${n}"></i>`).join('')}</div>`).join('')}</div><p class="jv-note">Busiest: ${esc(peakText)} · America/Bogota</p>`;
}

function kpis(list) {
    return `<div class="jv-kpis">${list.map((k) => `<div class="jv-kpi${k.alert ? ' is-alert' : ''}"><span>${esc(k.label)}</span><strong>${fmt(k.value)}</strong>${k.delta ? `<em class="${k.dir > 0 ? 'up' : k.dir < 0 ? 'down' : ''}">${esc(k.delta)}${k.prior === undefined ? '' : ` <small>vs ${fmt(k.prior)}</small>`}</em>` : '<em class="flat">&nbsp;</em>'}</div>`).join('')}</div>`;
}

function table(cols, rows, empty) {
    if (!rows || !rows.length) return `<p class="jv-empty">${esc(empty || 'Nothing yet.')}</p>`;
    return `<div class="jv-table-wrap"><table class="jv-table"><thead><tr>${cols.map((c) => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${cols.map((c) => `<td data-label="${esc(c[0])}">${c[1](row)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const SLICES = [COLORS.cyan, COLORS.violet, COLORS.amber, COLORS.green, COLORS.pink, '#7aa2ff', '#ff8f5a', COLORS.dim];

function pie(list, opts) {
    const o = opts || {};
    const all = (list || []).filter((r) => r.value > 0);
    if (!all.length) return `<p class="jv-empty">${esc(o.empty || 'Nothing in this range.')}</p>`;
    const rest = all.slice(7).reduce((s, r) => s + r.value, 0);
    const rows = rest ? all.slice(0, 7).concat([{ label: 'Other', value: rest }]) : all;
    const total = rows.reduce((s, r) => s + r.value, 0);
    const share = (v) => Math.round((v / total) * 100);
    const r = 38, c = 2 * Math.PI * r;
    let at = 0;
    const arcs = rows.map((row, i) => {
        const len = (row.value / total) * c;
        const arc = `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${SLICES[i % SLICES.length]}" stroke-width="14" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}" transform="rotate(-90 50 50)"><title>${esc(row.label)}: ${fmt(row.value)} (${share(row.value)}%)</title></circle>`;
        at += len;
        return arc;
    }).join('');
    return `<div class="jv-pie"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(rows.map((row) => row.label + ' ' + share(row.value) + '%').join(', '))}"><circle cx="50" cy="50" r="${r}" class="jv-ring-track"></circle>${arcs}<text x="50" y="52" text-anchor="middle" class="jv-ring-value">${fmt(total)}</text><text x="50" y="66" text-anchor="middle" class="jv-ring-label">${esc(o.unit || 'total')}</text></svg>
        <ul>${rows.map((row, i) => `<li><i style="background:${SLICES[i % SLICES.length]}"></i><span>${esc(row.label)}</span><b>${fmt(row.value)}</b><small>${share(row.value)}%</small></li>`).join('')}</ul></div>`;
}

// The 90-day plan as a track: phases as bands, milestones as pins, deadlines inside the plan as red ticks, and today.
function timeline(plan, now) {
    const at = (d) => Date.parse(d + 'T12:00:00Z');
    const a = at(plan.start), span = Math.max(1, at(plan.end) - a);
    const x = (ms) => Math.max(0, Math.min(100, ((ms - a) / span) * 100)).toFixed(2);
    const bands = (plan.phases || []).map((p, i) => `<span class="jv-tl-phase" style="left:${x(at(p.start))}%;width:${Math.max(1, x(at(p.end)) - x(at(p.start)))}%;--c:${SLICES[i % SLICES.length]}" title="${esc(p.name)}: ${esc(p.start)} to ${esc(p.end)}">${esc(p.name)}</span>`).join('');
    const pins = (plan.milestones || []).map((m) => `<span class="jv-tl-pin${m.past ? ' is-past' : ''}" style="left:${x(at(m.date))}%" title="${esc(m.date)}: ${esc(m.label)}"><i></i><small>${esc(m.date.slice(5))}</small></span>`).join('');
    const ticks = (plan.deadlines || []).filter((d) => at(d.date) <= at(plan.end)).map((d) => `<span class="jv-tl-deadline" style="left:${x(at(d.date))}%" title="${esc(d.date)}: ${esc(d.label)}"></span>`).join('');
    return `<div class="jv-timeline" role="img" aria-label="90-day plan from ${esc(plan.start)} to ${esc(plan.end)}"><div class="jv-tl-track">${bands}${ticks}<span class="jv-tl-today" style="left:${x(now)}%"><b>today</b></span></div><div class="jv-tl-pins">${pins}</div><div class="jv-tl-ends"><span>${esc(plan.start)}</span><span>${esc(plan.end)}</span></div></div>`;
}

// 90-day targets (#2649): Jarvis's count since the plan start, its verdict and pace, the rows behind it, and the buttons.
const TARGET_CHIP = { done: ['c-fast', 'Done'], 'on-pace': ['c-average', 'On pace'], behind: ['c-slow', 'Behind'], missed: ['c-slow', 'Missed'], waiting: ['', 'Not started'] };
function targetsBody(tg, waiting) {
    if (!tg || !tg.ok || !Array.isArray(tg.targets)) return `<p class="jv-empty">${esc((tg && tg.error) || waiting || 'Not loaded.')}</p>`;
    const mark = tg.day > 0 ? Math.min(100, Math.round((Math.min(tg.day, tg.length) / tg.length) * 100)) : 0;
    const btn = (label, data) => `<button type="button" class="jv-btn small" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${esc(label)}</button>`;
    return `<ul class="jv-goals jv-targets">${tg.targets.map((t) => {
        const [cls, word] = TARGET_CHIP[t.status] || ['', t.status];
        const pace = t.status === 'on-pace' || t.status === 'behind' ? ` · ${fmt(t.perWeek)} a week to go` : '';
        const items = (t.items || []).length ? `<ul class="jv-target-items">${t.items.map((i) => `<li${i.source === 'failing' ? ' class="is-bad"' : ''}><span>${esc(i.at.slice(0, 10))}</span> ${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.text)}</a>` : esc(i.text)}${i.n > 1 ? ` ×${fmt(i.n)}` : ''}${i.id ? ' ' + btn('Remove', { 'tg-act': 'remove', id: i.id, key: t.key }) : ''}</li>`).join('')}</ul>` : '<p class="jv-empty">Nothing counted yet.</p>';
        const next = (t.next || []).map((n) => (n.copy ? `<button type="button" class="jv-btn small" data-copy-link="${esc(n.copy)}">${esc(n.label)}</button>` : `<a class="jv-btn small" href="${esc(n.open)}" target="_blank" rel="noopener">${esc(n.label)}</a>`)).join('');
        const said = (t.fix ? ` Set to ${fmt(t.fix.value)} on ${esc(t.fix.at.slice(0, 10))}.` : '') + (t.done ? ` Marked done ${esc(t.done.at.slice(0, 10))}${t.done.proof ? ': ' + esc(t.done.proof) : ''}.` : '');
        return `<li class="jv-goal ${t.status === 'done' ? 'is-done' : t.status === 'behind' || t.status === 'missed' ? 'is-far' : 'is-on'}">
            <div class="jv-goal-head"><span>${esc(t.label)} <span class="jv-chip ${cls}">${esc(word)}</span>${t.stale ? ' <span class="jv-chip c-average">Nothing logged in 14 days</span>' : ''}</span><b>${fmt(t.actual)} / ${fmt(t.target)}</b></div>
            <div class="jv-goal-bar"><i style="width:${Math.min(100, Math.round((t.actual / Math.max(1, t.target)) * 100))}%"></i><s style="left:${mark}%"></s></div>
            <div class="jv-inline">${btn(t.key === 'links' ? 'Log a link' : 'Log +1', { 'tg-act': 'log', key: t.key })}${btn('Correct', { 'tg-act': 'correct', key: t.key, current: t.actual })}${btn(t.done ? 'Undo done' : 'Mark done', { 'tg-act': t.done ? 'undone' : 'done', key: t.key })}${t.key === 'links' ? btn('Recheck', { 'tg-act': 'recheck', key: t.key }) : ''}${next}</div>
            <details class="jv-target-more"><summary>Details${esc(pace)}</summary><p class="jv-note">${esc(t.how)}${said}</p>${items}</details>
        </li>`;
    }).join('')}</ul>`;
}

function stats(list) {
    return `<div class="jv-stats">${list.map((k) => `<div${k.alert ? ' class="is-alert"' : ''}><b>${fmt(k.value)}</b><span>${esc(k.label)}</span></div>`).join('')}</div>`;
}

function indexBody(ix) {
    const p = ix.pushed;
    const sent = p ? `Last sent ${esc(String(ix.pushedAt || '').slice(0, 10))}: IndexNow ${p.indexnow === 200 || p.indexnow === 202 ? `took ${fmt(p.missing)}` : `failed (${esc(String(p.indexnow || ''))})`}, Brave took ${fmt(p.brave)}${p.braveFailed ? `, ${fmt(p.braveFailed)} failed (${esc(p.braveError || '')})` : ''}.` : 'Not sent yet: Jarvis sends the missing pages on its next weekly pass.';
    const main = ix.mainMissing.length ? `<p class="jv-note">Main pages missing: ${ix.mainMissing.map((u) => esc(u.replace('https://carlosandmunoz.com', '') || '/')).join(', ')}</p>` : '';
    return stats([{ label: 'Pages indexed', value: ix.indexed, alert: !ix.indexed }, { label: 'Sitemap pages', value: ix.total }, { label: 'Missing', value: ix.missing, alert: ix.missing > 0 }])
        + (ix.zeroSince ? `<p class="jv-note">None indexed since ${esc(ix.zeroSince.slice(0, 10))}.</p>` : '') + main + `<p class="jv-note">${sent}</p>`;
}

function countdown(items) {
    return `<div class="jv-countdown">${items.map((c) => `<div class="jv-count${c.days !== null && c.days >= 0 && c.days <= 7 ? ' is-soon' : ''}${c.days !== null && c.days < 0 ? ' is-past' : ''}"><strong>${c.days === null ? '—' : c.days === 0 ? 'today' : c.days < 0 ? 'done' : fmt(c.days)}</strong><small>${c.days > 0 ? (c.days === 1 ? 'day' : 'days') : '&nbsp;'}</small><span>${esc(c.label)}</span><em>${esc(c.date || '')}</em></div>`).join('')}</div>`;
}

// #2139: tiles per connection, job and CI workflow, grouped, each lit by its level.
function matrix(tiles) {
    if (!tiles.length) return '<p class="jv-empty">No connections, jobs or CI runs read yet.</p>';
    return Array.from(new Set(tiles.map((t) => t.group))).map((g) => {
        const list = tiles.filter((t) => t.group === g);
        return `<div class="jv-mx-group"><h4 class="jv-sub">${esc(g)} <small>${list.filter((t) => t.level === 'good').length} of ${list.length} good</small></h4><div class="jv-mx">${list.map((t) => `<span class="jv-mx-tile lv-${esc(t.level)}" title="${esc(t.name)}: ${esc(t.detail)}"><i></i>${esc(t.name)}</span>`).join('')}</div></div>`;
    }).join('');
}

// #2139: one cell per Bogota day; a day without checks stays dark instead of reading as up.
function strip(u) {
    const cell = (d) => `<i class="${d.pct === null ? 'is-none' : d.pct >= 99.5 ? 'is-up' : d.pct >= 95 ? 'is-dip' : 'is-down'}" title="${esc(d.date)}: ${d.pct === null ? 'no checks' : d.pct + '%'}"></i>`;
    const head = u.pct === null ? 'No checks recorded yet.' : `${u.pct}% of checks answered since ${esc(u.since)}.`;
    return `<p class="jv-note">${head} Jarvis pings the five product pages every hour and keeps one tally per day.</p><div class="jv-strip" role="img" aria-label="Uptime per day, last 90 days: ${esc(head)}">${u.days.map(cell).join('')}</div><div class="jv-strip-ends"><span>${esc((u.days[0] || {}).date || '')}</span><span>today</span></div>`;
}

function noData(list) {
    if (!list.length) return '';
    return `<div class="jv-nodata" role="group" aria-label="No data yet"><span class="jv-eyebrow">No data yet</span>${list.map((x) => `<button type="button" class="jv-chip" data-nodata="${esc(x.why)}" title="${esc(x.why)}">${esc(x.title)}</button>`).join('')}</div>`;
}

const GRADE_COLORS = { A: COLORS.green, B: COLORS.cyan, C: COLORS.amber, D: '#ff8f5a', F: COLORS.pink };

// #2526: a 0-100 score as a ring with its letter; its why is the tooltip.
function gradeRing(x, label, size) {
    const v = x && typeof x.value === 'number' ? Math.max(0, Math.min(100, Math.round(x.value))) : null;
    const g = x && x.grade ? String(x.grade) : '—';
    const tone = GRADE_COLORS[g] || COLORS.dim;
    const r = 40, c = 2 * Math.PI * r;
    const tip = `${label}: ${v === null ? 'no data' : v + ' of 100, grade ' + g}${x && x.why ? '. ' + x.why : ''}`;
    return `<span class="jv-grade" data-grade="${esc(g)}" title="${esc(tip)}"><svg viewBox="0 0 100 100" width="${size || 84}" height="${size || 84}" role="img" aria-label="${esc(tip)}"><circle cx="50" cy="50" r="${r}" class="jv-ring-track"></circle><circle cx="50" cy="50" r="${r}" fill="none" stroke="${tone}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${((c * (v || 0)) / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 50 50)" class="jv-glow"></circle><text x="50" y="56" text-anchor="middle" class="jv-grade-letter" fill="${tone}">${esc(g)}</text><text x="50" y="74" text-anchor="middle" class="jv-ring-label">${v === null ? '—' : v}</text></svg><small>${esc(label)}</small></span>`;
}

const BOARD_COLS = ['Backlog', 'Next', 'Design', 'Dev', 'QA', 'Stg', 'Prod', 'Done'];
const WIP_COLS = ['Dev', 'QA', 'Stg'];

// #2526: the Scrum board as a flow. One node per column (cards, median age); arrows weighted by the moves in range,
// skips arc above, moves backwards arc below in amber; the WIP columns light up when WIP is over its limit.
// opts.drill (#2807): a panel id; each column then opens its card list (drillBodies), opts.open the open one.
function processMap(board, flow, opts) {
    const o = opts || {};
    const drill = (name) => (o.drill ? ` data-drill-open="${esc(o.drill + '|' + name)}" role="button" tabindex="0" aria-expanded="${o.open === name}" aria-label="${esc(name)}: show its cards"` : '');
    const cols = BOARD_COLS.map((name) => Object.assign({ name, count: 0, ageMedD: null }, (board.columns || []).find((c) => c.name === name) || {}));
    const over = !!(board.wipLimit && board.wip > board.wipLimit);
    const w = 960, h = 292, nw = 92, nh = 78, y0 = 106, gap = (w - nw * BOARD_COLS.length) / (BOARD_COLS.length - 1);
    const x = (i) => i * (nw + gap);
    const at = (name) => BOARD_COLS.indexOf(name);
    const mid = y0 + nh / 2;
    const moves = (flow || []).filter((f) => at(f.from) >= 0 && at(f.to) >= 0 && f.from !== f.to && f.count > 0);
    const peak = Math.max(1, ...moves.map((f) => f.count));
    const idle = BOARD_COLS.slice(1).map((name, i) => (moves.some((f) => at(f.from) === i && at(f.to) === i + 1) ? '' : `<line x1="${x(i) + nw}" y1="${mid}" x2="${x(i + 1) - 3}" y2="${mid}" class="jv-pm-idle" marker-end="url(#jvpm-idle)"></line>`)).join('');
    const arrows = moves.map((f) => {
        const a = at(f.from), b = at(f.to), back = b < a;
        let d, lx, ly;
        if (b === a + 1) { d = `M${x(a) + nw},${mid} L${x(b) - 3},${mid}`; lx = (x(a) + nw + x(b)) / 2; ly = mid - 8; }
        else {
            const span = Math.abs(b - a), sx = x(a) + nw / 2, ex = x(b) + nw / 2;
            const sy = back ? y0 + nh : y0, ey = back ? y0 + nh + 3 : y0 - 3;
            const cy = back ? y0 + nh + 14 + span * 13 : y0 - 14 - span * 13;
            d = `M${sx},${sy} Q${(sx + ex) / 2},${cy} ${ex},${ey}`; lx = (sx + ex) / 2; ly = (sy + 2 * cy + ey) / 4 + (back ? 12 : -4);
        }
        return `<path d="${d}" class="jv-pm-flow${back ? ' is-back' : ''}" stroke-width="${(1.5 + (f.count / peak) * 7).toFixed(1)}" marker-end="url(#jvpm-${back ? 'back' : 'fwd'})"><title>${esc(f.from)} → ${esc(f.to)}: ${fmt(f.count)}</title></path><text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" class="jv-pm-count">${fmt(f.count)}</text>`;
    }).join('');
    const marker = (id, color) => `<marker id="jvpm-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${color}"></path></marker>`;
    const nodes = cols.map((c, i) => {
        const age = c.ageMedD === null || c.ageMedD === undefined ? null : c.ageMedD;
        return `<g class="jv-pm-node${over && WIP_COLS.includes(c.name) ? ' is-over' : ''}${c.count ? '' : ' is-empty'}${o.open === c.name ? ' is-open' : ''}" data-col="${esc(c.name)}"${drill(c.name)}><title>${esc(c.name)}: ${fmt(c.count)}${age === null ? '' : ', median age ' + fmt(age) + ' d'}</title><rect x="${x(i).toFixed(1)}" y="${y0}" width="${nw}" height="${nh}" rx="12"></rect>
            <text x="${(x(i) + nw / 2).toFixed(1)}" y="${y0 + 20}" text-anchor="middle" class="jv-pm-name">${esc(c.name)}</text><text x="${(x(i) + nw / 2).toFixed(1)}" y="${y0 + 49}" text-anchor="middle" class="jv-pm-n">${fmt(c.count)}</text><text x="${(x(i) + nw / 2).toFixed(1)}" y="${y0 + 67}" text-anchor="middle" class="jv-pm-age">${age === null ? '—' : 'med ' + fmt(age) + ' d'}</text></g>`;
    }).join('');
    const label = cols.map((c) => `${c.name} ${c.count}`).join(', ');
    // The same flow stacked top to bottom, shown instead of the map when its panel is phone-narrow.
    const outs = (i) => moves.filter((f) => at(f.from) === i).sort((p, q) => at(p.to) - at(q.to)).map((f) => `<span${at(f.to) < i ? ' class="is-back"' : ''}>${at(f.to) < i ? '↩' : '→'} ${esc(f.to)} ${fmt(f.count)}</span>`).join('');
    const steps = cols.map((c, i) => `<li class="jv-pm-step${over && WIP_COLS.includes(c.name) ? ' is-over' : ''}${c.count ? '' : ' is-empty'}${o.open === c.name ? ' is-open' : ''}" data-col="${esc(c.name)}"${drill(c.name)}><b>${esc(c.name)}</b><small>${c.ageMedD === null || c.ageMedD === undefined ? '—' : 'med ' + fmt(c.ageMedD) + ' d'}</small><strong>${fmt(c.count)}</strong>${outs(i) ? `<span class="jv-pm-moves">${outs(i)}</span>` : ''}</li>`).join('');
    return `<div class="jv-pm"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Board flow: ${esc(label)}${over ? `. WIP ${fmt(board.wip)} is over its limit of ${fmt(board.wipLimit)}` : ''}"><defs>${marker('fwd', COLORS.cyan)}${marker('back', COLORS.amber)}${marker('idle', COLORS.dim)}</defs>${idle}${arrows}${nodes}</svg><ol class="jv-pm-list" aria-label="Board flow">${steps}</ol></div>`;
}

// --- the tool ------------------------------------------------------------------------------------------------

// --- Console (#2810): the jarvis_log lines, oldest at the top, from the log op every 5 s while it is on screen ----

const CONSOLE_MS = 5000;
const CONSOLE_KEEP = 2000;
const conTime = (iso) => {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    const day = (t) => t.toLocaleDateString('en-US', { timeZone: 'America/Bogota', month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString('en-GB', { timeZone: 'America/Bogota', hour12: false });
    return day(d) === day(new Date()) ? time : day(d) + ' ' + time;
};

function logConsole({ C, call }) {
    const S = { rows: [], ids: new Set(), cursor: '', sources: new Set(), level: 'debug', q: '', paused: false, waiting: 0, busy: false, error: '', loaded: false };
    const node = document.createElement('section');
    node.className = 'jv-con';
    node.dataset.con = '';
    node.innerHTML = `
      <div class="jv-con-bar">
        <div class="jv-con-srcs" role="group" aria-label="Sources"><button type="button" data-con-src="" aria-pressed="true">all</button>${C.LOG_SOURCES.map((s) => `<button type="button" class="src-${s}" data-con-src="${s}" aria-pressed="false">${s}</button>`).join('')}</div>
        <div class="jv-con-tools">
          <select data-con-level aria-label="Lowest level" data-menu-ready="1">${C.LOG_LEVELS.map((l, i) => `<option value="${l}">${l}${i < C.LOG_LEVELS.length - 1 ? '+' : ''}</option>`).join('')}</select>
          <input type="search" data-con-q placeholder="Search" aria-label="Search the log" autocomplete="off">
          <button type="button" class="jv-btn small" data-con-pause aria-pressed="false" title="Pause the scrolling; new lines wait">Pause</button>
        </div>
      </div>
      <ol class="jv-con-lines" data-con-lines role="log" aria-live="off" tabindex="0"></ol>
      <p class="jv-con-foot" data-con-foot>Connecting…</p>`;
    const list = node.querySelector('[data-con-lines]');
    const foot = node.querySelector('[data-con-foot]');
    const atBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 24;
    const line = (r) => `<li class="lv-${esc(r.level)}"${r.url ? ` data-con-url="${esc(r.url)}" tabindex="0" role="link"` : ''} title="${esc(new Date(r.at).toLocaleString('en-US', { timeZone: 'America/Bogota' }))} Bogotá${r.ref ? ' · ' + esc(r.ref) : ''}"><time>${esc(conTime(r.at))}</time><b class="src-${esc(r.source)}">${esc(r.source)}</b><i>${esc(String(r.level).toUpperCase())}</i><span>${esc(r.text)}</span></li>`;

    let shownCount = 0;
    function paintFoot() {
        foot.textContent = (S.error ? 'Last read failed: ' + S.error + ' · ' : '') + `${shownCount} of ${S.rows.length} lines`
            + (S.paused ? ` · paused${S.waiting ? ', ' + S.waiting + ' new' : ''}` : ' · live, every 5 s') + ' · Bogotá time · 7 days kept';
    }

    function paint() {
        const shown = C.logFilter(S.rows, { sources: Array.from(S.sources), level: S.level, q: S.q }).slice(0, 600).reverse();
        const stick = atBottom() || !list.children.length;
        list.innerHTML = shown.length ? shown.map(line).join('') : `<li class="jv-con-empty">${S.loaded ? (S.rows.length ? 'No line matches these filters.' : 'Nothing logged in the last 7 days yet.') : 'Reading the log…'}</li>`;
        if (stick) list.scrollTop = list.scrollHeight;
        shownCount = shown.length;
        paintFoot();
    }

    async function pull() {
        if (S.busy) return;
        S.busy = true;
        try {
            const out = await call('log', Object.assign({ limit: 300 }, S.cursor ? { since: S.cursor } : {}));
            if (!out || out.ok === false) throw new Error((out && out.error) || 'no answer');
            const fresh = (out.entries || []).filter((r) => r && r.id && !S.ids.has(r.id));
            fresh.forEach((r) => S.ids.add(r.id));
            S.cursor = out.cursor || S.cursor;
            S.error = '';
            if (fresh.length) {
                S.rows = fresh.concat(S.rows).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, CONSOLE_KEEP);
                if (S.rows.length === CONSOLE_KEEP) S.ids = new Set(S.rows.map((r) => r.id));
            }
            const first = !S.loaded;
            S.loaded = true;
            if (S.paused && !first) { S.waiting += fresh.length; paintFoot(); } else if (fresh.length || first) paint(); else paintFoot();
        } catch (error) {
            S.error = String(error.message || error).slice(0, 120);
            S.loaded = true;
            paint();
        }
        S.busy = false;
    }

    node.addEventListener('click', (event) => {
        const src = event.target.closest('[data-con-src]');
        if (src) {
            const s = src.dataset.conSrc;
            if (!s) S.sources.clear(); else if (S.sources.has(s)) S.sources.delete(s); else S.sources.add(s);
            node.querySelectorAll('[data-con-src]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.conSrc ? S.sources.has(b.dataset.conSrc) : !S.sources.size)));
            list.scrollTop = list.scrollHeight;
            paint();
            return;
        }
        if (event.target.closest('[data-con-pause]')) {
            S.paused = !S.paused;
            S.waiting = 0;
            const b = node.querySelector('[data-con-pause]');
            b.setAttribute('aria-pressed', String(S.paused));
            b.textContent = S.paused ? 'Resume' : 'Pause';
            if (!S.paused) list.scrollTop = list.scrollHeight;
            paint();
            return;
        }
        const li = event.target.closest('[data-con-url]');
        if (li) window.open(li.dataset.conUrl, '_blank', 'noopener');
    });
    node.addEventListener('keydown', (event) => {
        const li = event.target.closest && event.target.closest('[data-con-url]');
        if (li && event.key === 'Enter') window.open(li.dataset.conUrl, '_blank', 'noopener');
    });
    node.querySelector('[data-con-level]').addEventListener('change', (event) => { S.level = event.target.value; paint(); });
    let typed = 0;
    node.querySelector('[data-con-q]').addEventListener('input', (event) => { clearTimeout(typed); typed = setTimeout(() => { S.q = event.target.value; paint(); }, 150); });

    return {
        node,
        state: S,
        pull,
        // Moves the one console into a tab's view or the dock; its lines, filters and scroll stay.
        place(target) {
            if (node.parentNode !== target) { target.textContent = ''; target.append(node); list.scrollTop = list.scrollHeight; }
            if (!S.loaded) pull();
        }
    };
}

export function mountJarvis({ auth, host, getInbox, isTestEmail, endpoint, upload = () => Promise.reject(new Error("Uploads need the admin page.")) }) {
    const C = window.JarvisCore;
    const api = endpoint || ENDPOINT;
    const S = {
        product: 'overview', range: '30', mail: 'real', live: true, mounted: false, loading: false,
        products: null, outreach: null, feed: [], socialHeat: null, share: blankShare(), mkForm: {}, mkDrafts: {}, mkWeek: '', mkDone: false, egDrafts: {}, egAll: false, egOnly: 'all', reports: [],
        external: {}, pending: {}, summaries: {}, settings: null, goals: [], brief: [], briefHidden: [], briefState: null, marks: [], showHidden: false, sheet: null, proposals: null, ai: '', aiAt: 0, updatedAt: 0, externalAt: 0, kept: null,
        panels: new Map(), voice: null, listening: false, timers: [], empties: [], pick: 'review'
    };
    readHash();

    host.innerHTML = `
    <div class="jv" data-product="overview">
      <div class="jv-scan" aria-hidden="true"></div>
      <header class="jv-top">
        <button type="button" class="jv-reactor" data-act="systems" title="Readiness: share of checks that pass (jobs, CI, uptime, speed)"><span class="jv-reactor-core"></span><span id="jv-ready">—</span></button>
        <div class="jv-title">
          <span class="jv-eyebrow">J.A.R.V.I.S. · Admin statistics</span>
          <h2 id="jv-hello">Jarvis</h2>
          <p id="jv-status" aria-live="polite">Bringing systems online…</p>
        </div>
        <div class="jv-controls">
          <label class="jv-field">Range<select id="jv-range" data-menu-ready="1">${RANGES.map(([v, l]) => `<option value="${v}"${v === S.range ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <div class="jv-seg" role="group" aria-label="Inbox emails"><button type="button" data-mail="real">Real</button><button type="button" data-mail="test">Tests</button><button type="button" data-mail="all">All</button></div>
          <button type="button" class="jv-btn jv-live" data-act="live" aria-pressed="true" title="Live: new numbers every 5 minutes"><i></i><span id="jv-ago">live</span></button>
          <button type="button" class="jv-btn" data-act="refresh" title="Refresh everything (R)">⟳</button>
          <button type="button" class="jv-btn" data-act="speak" title="Read the briefing aloud">🔊</button>
          <button type="button" class="jv-btn" data-act="listen" title="Talk to Jarvis" aria-pressed="false">🎙</button>
          <button type="button" class="jv-btn jv-k" data-act="palette" title="Command bar (⌘K / Ctrl+K)">⌘K</button>
          <button type="button" class="jv-btn" data-act="settings" title="Goals, thresholds and email (G)">⚙</button>
          <div class="jv-menu"><button type="button" class="jv-btn" data-menu="share">Share ▾</button><div class="jv-menu-list" data-list="share" hidden>
            <button type="button" data-act="copy-link">Copy a link to this view</button><button type="button" data-act="web-share">Share…</button>
            <button type="button" data-act="copy-brief">Copy the briefing</button><button type="button" data-act="email">Email me the briefing</button></div></div>
          <div class="jv-menu"><button type="button" class="jv-btn" data-menu="export">Export ▾</button><div class="jv-menu-list" data-list="export" hidden>
            <button type="button" data-act="export-json">Everything (JSON)</button><button type="button" data-act="export-csv">This product (CSV)</button>
            <button type="button" data-act="export-md">Briefing (Markdown)</button><button type="button" data-act="export-png">This product (PNG)</button></div></div>
          <div class="jv-menu"><button type="button" class="jv-btn" data-menu="print">Print ▾</button><div class="jv-menu-list" data-list="print" hidden>
            <button type="button" data-act="print">This product</button><button type="button" data-act="print-all">Every product</button></div></div>
        </div>
      </header>
      <nav class="jv-tabs" role="tablist" aria-label="Products">${C.PRODUCTS.map((p, i) => `<button type="button" role="tab" data-go="${p.key}" aria-selected="${p.key === S.product}"><span class="jv-tab-key">${i + 1}</span><span class="jv-tab-name">${esc(p.name)}</span><span class="jv-tab-kpi" data-tab-kpi="${p.key}"></span><b class="jv-badge" data-badge="${p.key}" hidden></b></button>`).join('')}</nav>
      <div class="jv-print-head"><strong>Jarvis briefing</strong> · <span data-print-range></span> · generated <span data-print-at></span></div>
      <main id="jv-views">${C.PRODUCTS.map((p) => `<section class="jv-view" data-view="${p.key}" role="tabpanel" aria-label="${esc(p.name)}"${p.key === S.product ? '' : ' hidden'}></section>`).join('')}</main>
      <div class="jv-palette" hidden><div class="jv-palette-box" role="dialog" aria-label="Command bar"><input id="jv-cmd" type="text" placeholder="Type a command, a product, or ask Jarvis anything…" autocomplete="off"><ul id="jv-cmd-list" role="listbox"></ul><p class="jv-note">↑↓ to move · Enter to run · Esc to close · end with ? to ask Gemini</p></div></div>
      <div class="jv-settings" hidden><form class="jv-settings-box" data-settings role="dialog" aria-label="Jarvis settings"></form></div>
      <div class="jv-sheet" data-sheet-root hidden><section class="jv-sheet-box" role="dialog" aria-modal="true" aria-label="Briefing line"></section></div>
      <div class="jv-reply" hidden><form class="jv-reply-box" data-reply role="dialog" aria-label="Reply"></form></div>
      <div class="jv-pushes" aria-live="polite"></div>
      <div class="jv-toast" role="status" hidden></div>
      <button type="button" class="jv-con-fab" data-con-dock aria-expanded="false" title="Console: everything happening in the back">&gt;_<span>Console</span></button>
      <div class="jv-con-dock" data-con-dock-root hidden><section class="jv-con-dock-box" role="dialog" aria-label="Console"><header><h3>Console</h3><button type="button" class="jv-btn small" data-con-full>Full tab</button><button type="button" class="jv-btn small" data-con-close aria-label="Close the console">✕</button></header><div class="jv-con-slot" data-con-dock-slot></div></section></div>
    </div>`;
    const root = host.querySelector('.jv');
    const $ = (sel) => root.querySelector(sel);
    const $$ = (sel) => Array.from(root.querySelectorAll(sel));
    const con = logConsole({ C, call });
    let docked = false;
    function dock(open) {
        docked = !!open && S.product !== 'console';
        $('[data-con-dock-root]').hidden = !docked;
        $('[data-con-dock]').setAttribute('aria-expanded', String(docked));
        if (docked) con.place($('[data-con-dock-slot]'));
    }

    function toast(text, ms) {
        const node = $('.jv-toast');
        node.textContent = text;
        node.hidden = false;
        clearTimeout(toast.t);
        toast.t = setTimeout(() => { node.hidden = true; }, ms || 3200);
    }

    function setStatus(text) { $('#jv-status').textContent = text; }

    // Live tab icon (#1530), the web side of the app's status notification: the readiness ring, and a badge counting alerts and warnings.
    const pageTitle = document.title;
    function tabIcon(ready, alerts, warns) {
        const key = `${ready}|${alerts}|${warns}`;
        if (tabIcon.key === key) return;
        tabIcon.key = key;
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        if (!g) return;
        const color = alerts ? '#ff4d8d' : warns ? '#ffb547' : '#38e1ff';
        g.fillStyle = '#030b12';
        g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
        g.lineWidth = 7;
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(255,255,255,.18)';
        g.beginPath(); g.arc(32, 32, 25, 0, Math.PI * 2); g.stroke();
        if (ready) { g.strokeStyle = color; g.beginPath(); g.arc(32, 32, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(ready, 100) / 100); g.stroke(); }
        const label = ready === null ? '–' : ready >= 100 ? '✓' : String(ready);
        g.fillStyle = '#fff';
        g.font = `bold ${label.length > 1 ? 24 : 28}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, 32, 34);
        const n = alerts + warns;
        if (n) {
            g.fillStyle = color;
            g.beginPath(); g.arc(50, 14, 13, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#030b12';
            g.font = 'bold 17px system-ui, sans-serif';
            g.fillText(n > 9 ? '9+' : String(n), 50, 15);
        }
        let link = document.querySelector('link[data-jv-icon]');
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; link.dataset.jvIcon = ''; document.head.append(link); }
        link.href = c.toDataURL('image/png');
        document.title = (n ? `(${n}) ` : '') + (ready === null ? '' : `${ready}% · `) + pageTitle;
    }

    function greet() {
        const hour = C.zoneParts(new Date()).hour;
        $('#jv-hello').textContent = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ', Carlos';
    }

    function readHash() {
        const m = /^#stats(?:\/([a-z]+))?(?:\/([a-z0-9]+))?/.exec(location.hash || '');
        if (!m) return;
        if (m[1] && C.PRODUCTS.some((p) => p.key === m[1])) S.product = m[1];
        const range = m[2] === 'all' ? '365' : m[2];
        if (range && RANGES.some(([v]) => v === range)) S.range = range;
    }

    function writeHash() {
        const next = `#stats/${S.product}/${S.range}`;
        if (location.hash !== next) history.replaceState(null, '', next);
    }

    // --- data -------------------------------------------------------------------------------------------------

    // The last snapshot per range, kept in this browser so the page opens at once (#2510). Sign-in codes are not
    // kept, and neither is the mail version, so every fetch brings the mail section back.
    const SNAP_KEY = 'jv-snapshot-';
    function savedSnapshot(range) {
        if (S.kept && S.kept.range === range) return S.kept.snap;
        try {
            const kept = JSON.parse(localStorage.getItem(SNAP_KEY + range) || 'null');
            return kept && auth.currentUser && kept.uid === auth.currentUser.uid && kept.snap && kept.snap.products ? kept.snap : null;
        } catch (error) { return null; }
    }
    function keepSnapshot(range, snap) {
        S.kept = { range, snap };
        const versions = Object.assign({}, snap.versions);
        delete versions.mail;
        const stored = Object.assign({}, snap, { versions });
        delete stored.mailCodes;
        try { localStorage.setItem(SNAP_KEY + range, JSON.stringify({ uid: auth.currentUser && auth.currentUser.uid, snap: stored })); } catch (error) {
            try { localStorage.removeItem(SNAP_KEY + range); } catch (e) { /* private mode: this visit only */ }
        }
    }
    function forgetSnapshots() {
        S.kept = null;
        try { Object.keys(localStorage).filter((k) => k.startsWith(SNAP_KEY)).forEach((k) => localStorage.removeItem(k)); } catch (error) { /* nothing kept */ }
    }

    // Opens on the snapshot this browser kept for the range, with its age, before the first fetch answers.
    function openSaved() {
        const snap = savedSnapshot(S.range);
        if (!snap) return false;
        useSnapshot(snap);
        compute();
        render();
        return true;
    }

    /* One snapshot answer (#2102): the products, the feed and the external sources, from the server's cache the app
       shares. With a kept copy it sends its versions as `since` and applies only the sections that changed (#2510);
       `only` limits them to the ones a push named. An answer that cannot be applied means a full fetch. */
    async function loadSnapshot(only) {
        SNAPSHOT_OPS.forEach((op) => { if (!S.external[op]) S.pending[op] = true; });
        const range = S.range;
        const kept = savedSnapshot(range);
        const since = kept && C.sectionSince(kept.versions);
        // With this browser's push endpoint the server knows the page is open and sends it section pushes (#2509).
        const push = S.pushEndpoint ? { push: S.pushEndpoint } : {};
        let snap;
        try {
            const answer = await call('snapshot', Object.assign({}, push, since ? { since } : {}, since && only && only.length ? { only } : {}));
            snap = answer && answer.delta ? C.applySections(kept, answer) : answer;
            if (!snap && answer && answer.ok !== false) snap = await call('snapshot', push);
            else if (!snap) snap = answer;
        } finally { SNAPSHOT_OPS.forEach((op) => { S.pending[op] = false; }); }
        if (!snap || snap.ok === false || !snap.products) throw new Error((snap && snap.error) || 'no snapshot');
        if (S.range !== range) return;
        keepSnapshot(range, snap);
        useSnapshot(snap);
    }

    function useSnapshot(snap) {
        S.versions = snap.versions || null;
        const date = (v) => (v ? new Date(v) : null);
        const w = snap.window || {};
        S.window = { start: date(w.start), end: date(w.end), days: w.days, prior: w.prior ? { start: date(w.prior.start), end: date(w.prior.end) } : null };
        S.products = snap.products;
        S.outreach = snap.outreachVisits || null;
        S.feed = snap.feed || [];
        S.socialHeat = snap.socialHeat || null;
        S.reports = snap.reports || [];
        Object.assign(S.external, snap.external || {}, { 'mail-codes': { ok: true, codes: snap.mailCodes || [] } });
        if (snap.settings) S.settings = Object.assign({ ok: true }, snap.settings);
        if (Array.isArray(snap.goals)) S.goals = snap.goals;
        if (Array.isArray(snap.devices)) {
            S.devices = snap.devices;
            const d = device();
            if (d) deviceKey = d.kind + ':' + (d.posture || '');
            paintDevices();
        }
        S.updatedAt = Date.parse(snap.cachedAt) || Date.now();
        S.externalAt = Date.now();
    }

    // Live: a newer snapshot once the server's has aged out, or the sections a push named; the pulse counts the feed lines it adds.
    async function loadNewer(only) {
        if (S.loading) return;
        const newest = (S.feed[0] || {}).at || '';
        S.loading = true;
        try { await loadSnapshot(only); } catch (error) { S.loading = false; return; }
        S.loading = false;
        compute();
        render();
        const added = newest ? S.feed.filter((f) => f.at > newest).length : 0;
        if (added > 0) pulse(added);
    }

    // --- this browser's screen (#2068): sent with every call, like the app's ----------------------------------
    let deviceModel = '';
    let deviceKey = '';
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) navigator.userAgentData.getHighEntropyValues(['model']).then((v) => { deviceModel = v.model || ''; }).catch(() => null);

    function deviceId() {
        try {
            let id = localStorage.getItem('jv-device-id');
            if (!id) { id = crypto.randomUUID(); localStorage.setItem('jv-device-id', id); }
            return id;
        } catch (error) { return ''; }
    }

    function device() {
        const mq = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
        const segs = (axis) => [2, 3].find((n) => mq(`(${axis}-viewport-segments: ${n})`)) || 1;
        const d = C.browserDevice({ ua: navigator.userAgent, model: deviceModel, mobile: navigator.userAgentData ? navigator.userAgentData.mobile : undefined,
            width: window.innerWidth, height: window.innerHeight, screenW: screen.width, screenH: screen.height, touch: navigator.maxTouchPoints > 0, coarse: mq('(pointer: coarse)'),
            posture: navigator.devicePosture ? navigator.devicePosture.type : '', segments: { across: segs('horizontal'), down: segs('vertical') }, name: browserName(navigator.userAgent, deviceModel) });
        return d && Object.assign(d, { id: deviceId() });
    }

    /** Marks the page with its kind for CSS, and tells the server when the kind or the fold changes. */
    async function reportDevice() {
        const d = device();
        if (!d) return;
        root.dataset.device = d.kind;
        root.dataset.posture = d.posture || '';
        const key = d.kind + ':' + (d.posture || '');
        if (key === deviceKey || !auth.currentUser) return;
        deviceKey = key;
        const out = await call('device').catch(() => null);
        if (out && out.ok) { S.devices = out.devices || []; paintDevices(); }
    }

    let resized = 0;
    window.addEventListener('resize', () => { clearTimeout(resized); resized = setTimeout(reportDevice, 1500); });
    if (navigator.devicePosture) navigator.devicePosture.addEventListener('change', reportDevice);

    async function call(op, extra) {
        const user = auth.currentUser;
        if (!user) throw new Error('Sign in first.');
        const token = await user.getIdToken();
        const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(Object.assign({ op, days: Number(S.range) || 30, device: device() }, extra || {})) });
        const data = await res.json().catch(() => ({ ok: false, error: 'No answer (' + res.status + ')' }));
        if (!res.ok && data.ok !== false) data.ok = false;
        return data;
    }

    async function loadExternal(ops) {
        const list = ops || OWN_OPS;
        await Promise.all(list.map(async (op) => {
            S.pending[op] = true;
            try {
                const out = await call(op);
                if (op === 'settings') { if (out.ok) S.settings = out; } else if (op === 'goals') { if (out.ok) S.goals = out.goals || []; } else S.external[op] = out;
            } catch (error) { if (op !== 'settings' && op !== 'goals') S.external[op] = { ok: false, error: error.message }; }
            S.pending[op] = false;
            compute();
            render();
        }));
        S.externalAt = Date.now();
    }

    // --- numbers -------------------------------------------------------------------------------------------

    function compute() {
        const w = S.window || C.windowFor(S.range);
        const keep = (email) => {
            if (S.mail === 'all' || !isTestEmail) return true;
            const test = isTestEmail(email);
            return S.mail === 'test' ? test : !test;
        };
        const inbox = getInbox ? getInbox() : { messages: [], ratings: [] };
        const sum = {};
        sum.inbox = C.summarizeInbox(inbox.messages || [], inbox.ratings || [], w, w.prior, keep);
        const p = S.products || {};
        ['cv', 'studio', 'lab'].forEach((key) => { sum[key] = p[key] || C.summarizeSite(key, [], [], w); });
        sum.review = p.review || C.summarizeReview({ opens: [], reviews: [], events: [], prior: null }, w);
        sum.hub = p.hub || C.summarizeHub(null, [], w, []);
        S.summaries = sum;
        S.briefState = { products: sum, external: S.external, thresholds: (S.settings || {}).thresholds, goals: S.goals };
        const split = C.openBrief(C.briefing(S.briefState), S.marks);
        S.brief = split.open;
        S.briefHidden = split.hidden;
    }

    const outreachSeen = () => S.outreach || { total: 0, campaigns: [] };
    const reviewAlerts = () => (S.external.health && S.external.health.alerts && S.external.health.alerts.latest) || [];

    function snapshot() {
        const p = {};
        C.PRODUCTS.forEach((row) => {
            const s = S.summaries[row.key];
            if (!s) return;
            p[row.key] = { name: row.name, kpis: (s.kpis || []).map((k) => ({ label: k.label, value: k.value, delta: k.delta })), top: Object.keys(s.lists || {}).reduce((out, key) => { out[key] = (s.lists[key] || []).slice(0, 5); return out; }, {}) };
        });
        const e = S.external;
        return {
            range: (RANGES.find(([v]) => v === S.range) || [])[1], generatedAt: new Date().toISOString(), products: p,
            briefing: S.brief.map((b) => `[${b.level}] ${b.text}`),
            external: {
                readiness: C.readiness(e),
                jobs: e.jobs && e.jobs.jobs ? e.jobs.jobs.map((j) => ({ name: j.name, ok: j.ok, last: j.lastAttempt })) : null,
                ci: e.github && e.github.ci, openBugs: e.github && e.github.openBugs, merged: e.github && e.github.merged && e.github.merged.total,
                github: githubBrief(e['github-work']),
                failures: e.health && e.health.failures && { total: e.health.failures.total, causes: e.health.failures.causes },
                speed: e.speed && e.speed.pages && e.speed.pages.map((x) => ({ page: x.name, score: x.score })),
                uptime: e.uptime && e.uptime.pages && e.uptime.pages.map((x) => ({ page: x.name, status: x.status, ms: x.ms })),
                ga4: e.ga4 && e.ga4.groups, cloudflare: e.cloudflare && e.cloudflare.ok ? { requests: e.cloudflare.requests, threats: e.cloudflare.threats, cacheRatio: e.cloudflare.cacheRatio, statuses: e.cloudflare.statuses, paths: (e.cloudflare.paths || []).slice(0, 8) } : null,
                money: e.money && e.money.ok ? { revenue: e.money.revenue, prior: e.money.prior, refundsUsd: e.money.refundsUsd, disputesOpen: e.money.paypal && e.money.paypal.disputesOpen } : null,
                email: e.email && e.email.ok ? { totals: e.email.totals, rates: e.email.rates } : null,
                mailbox: e.mailbox && e.mailbox.ok ? { totals: e.mailbox.totals, smtp: e.mailbox.smtp, canary: e.mailbox.canary && e.mailbox.canary.state, problems: (e.mailbox.problems || []).slice(0, 5).map((m) => `${m.alias}@ ${m.outcome}: ${m.reason}`) } : null,
                addresses: e.addresses && e.addresses.ok ? { counts: e.addresses.counts, issues: (e.addresses.issues || []).slice(0, 8).map((i) => i.text + (i.by === 'jarvis' ? ' (Jarvis fixes it)' : '')) } : null,
                search: e.search && e.search.ok ? { brave: e.search.brave && e.search.brave.queries, console: e.search.console && e.search.console.ok ? { clicks: e.search.console.clicks, impressions: e.search.console.impressions, position: e.search.console.position, queries: (e.search.console.queries || []).slice(0, 8) } : null } : null,
                social: e.social && e.social.ok ? { sent: e.social.sent, failed: e.social.failed, channels: e.social.channels, youtubeViews: e.social.youtube && e.social.youtube.views } : null,
                safety: e.safety && e.safety.ok ? e.safety.checks.map((c) => `${c.level}: ${c.name} ${c.detail}`) : null,
                platform: e.platform && e.platform.ok ? { functions: e.platform.functions && { executions: e.platform.functions.executions, failures: e.platform.functions.failures, byFunction: e.platform.functions.byFunction }, gemini: e.platform.gemini, firestore: e.platform.firestore, users: e.platform.users } : null,
                outreach: e.outreach && e.outreach.ok ? {
                    pipeline: e.outreach.pipeline && e.outreach.pipeline.ok ? { queued: e.outreach.pipeline.queued, swept: e.outreach.pipeline.swept, reviews: e.outreach.pipeline.reviews, thisWeek: e.outreach.pipeline.thisWeek, withLiveReport: e.outreach.pipeline.withLiveReport, bySegment: e.outreach.pipeline.bySegment } : null,
                    instantly: e.outreach.instantly && e.outreach.instantly.ok ? { campaigns: e.outreach.instantly.status, sent: e.outreach.instantly.sent, rates: e.outreach.instantly.rates, replies: e.outreach.instantly.replies, interested: e.outreach.instantly.interested, meetings: e.outreach.instantly.meetings, warmup: (e.outreach.instantly.accounts || []).map((a) => a.score) } : null,
                    plan: e.outreach.plan && e.outreach.plan.ok !== false ? { day: e.outreach.plan.day, length: e.outreach.plan.length, phase: e.outreach.plan.phase, next: e.outreach.plan.next, weekly: e.outreach.plan.weekly, targets: e.outreach.plan.targets } : null,
                    visits: outreachSeen().total,
                    links: e.outreach.links && e.outreach.links.ok ? { live: e.outreach.links.live, visits: e.outreach.links.visits, reviews: e.outreach.links.reviews, paid: e.outreach.links.paid, usd: e.outreach.links.usd, byCampaign: e.outreach.links.byCampaign, topProspects: (e.outreach.links.prospects || []).slice(0, 10), reportReplies: e.outreach.links.social ? { visits: e.outreach.links.social.visits, reviews: e.outreach.links.social.reviews, paid: e.outreach.links.social.paid, usd: e.outreach.links.social.usd, networks: e.outreach.links.social.networks, topPosts: e.outreach.links.social.posts.slice(0, 10) } : null } : null
                } : null,
                targets: e.targets && e.targets.ok ? { day: e.targets.day, length: e.targets.length, targets: (e.targets.targets || []).map((t) => ({ label: t.label, actual: t.actual, target: t.target, status: t.status, perWeek: t.perWeek, how: t.how })) } : null,
                engagement: e.engagement && e.engagement.ok && e.engagement.report ? { paused: e.engagement.paused, live: e.engagement.live, accounts: (e.engagement.accounts || []).map((a) => ({ network: a.network, connected: a.connected, account: a.account, error: a.error })), totals: e.engagement.report.totals, approvalRate: e.engagement.report.approvalRate, topics: e.engagement.report.topics, tags: e.engagement.report.tags.slice(0, 10), networks: e.engagement.report.networks, waiting: e.engagement.waiting.length, topPosts: e.engagement.posts.slice(0, 5).map((d) => `${d.network}: ${d.title || String(d.text || '').slice(0, 100)} (score ${d.score})`), reportReplies: Object.assign({ waiting: e.engagement.waiting.filter((d) => d.campaign === 'report-reply').length }, e.engagement.report.invites), ownerTags: otAsk(e.engagement.ownerTags) } : null,
                signedInPeople: e.people && e.people.ok ? e.people.totals : null,
                googleMapsLocal: e.local && e.local.ok && e.local.totals ? { totals: e.local.totals, issues: e.local.issues, lastError: e.local.lastError } : null,
                waiting: C.connections(e).filter((c) => c.needs.length).map((c) => c.name + ': ' + c.needs.join(' '))
            }
        };
    }

    function briefText(product) {
        const list = S.brief.filter((b) => !product || inTab(b, product));
        return list.length ? list.map((b) => '• ' + b.text).join('\n') : 'All quiet. Nothing needs you right now.';
    }

    // --- render --------------------------------------------------------------------------------------------

    const FOLD_KEY = 'jarvis-folded';
    const folded = new Set((() => { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '[]'); } catch (error) { return []; } })());

    function foldHead(id, title) {
        const shut = folded.has(id);
        return `<h3><button type="button" class="jv-fold" data-fold="${esc(id)}" aria-expanded="${!shut}" title="${shut ? 'Expand' : 'Collapse'}">${esc(title)}</button></h3>`;
    }

    function fold(id, shut) {
        if (shut) folded.add(id); else folded.delete(id);
        try { localStorage.setItem(FOLD_KEY, JSON.stringify([...folded])); } catch (error) { /* private mode: this visit only */ }
        $$(`.jv-panel[data-panel-id="${CSS.escape(id)}"]`).forEach((sec) => {
            sec.classList.toggle('is-folded', shut);
            const b = sec.querySelector('.jv-fold');
            if (b) { b.setAttribute('aria-expanded', String(!shut)); b.title = shut ? 'Expand' : 'Collapse'; }
        });
    }

    function foldAll(shut) {
        $$('.jv-panel[data-panel-id]').forEach((sec) => fold(sec.dataset.panelId, shut));
    }

    // A panel whose whole body is one "nothing here" line joins the view's No data yet chips instead (#2139).
    const EMPTY_BODY = /^\s*<p class="jv-empty">([^<]*)<\/p>\s*$/;
    // DOMParser reads the text without running or loading anything in it.
    const plainText = (html) => new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
    function panel(id, title, body, opts) {
        const o = opts || {};
        const empty = !o.keep && EMPTY_BODY.exec(body);
        if (empty) { S.empties.push({ title: plainText(title), why: plainText(empty[1]) }); return ''; }
        if (o.data) S.panels.set(id, { title, rows: o.data, product: S.product });
        const tools = o.data ? `<span class="jv-panel-tools"><button type="button" data-panel-export="csv" data-panel="${id}" title="CSV">CSV</button><button type="button" data-panel-export="json" data-panel="${id}" title="JSON">JSON</button><button type="button" data-panel-export="png" data-panel="${id}" title="PNG">PNG</button></span>` : '';
        return `<section class="jv-panel${o.wide ? ' is-wide' : ''}${o.tall ? ' is-tall' : ''}${folded.has(id) ? ' is-folded' : ''}" data-panel-id="${id}"><header>${foldHead(id, title)}${tools}</header>${body}${o.note ? `<p class="jv-note">${o.note}</p>` : ''}</section>`;
    }

    const ACTION_LABELS = { 'rerun-held': 'send held re-runs', 'resend-notices': 're-send failed notices', 'publish-hub': 'publish the hub', 'run-job': 'run a job again', 'rerun-ci': 're-run failed CI jobs', 'rating-decide': 'decide ratings', 'brief-mark': 'snooze or dismiss a briefing line', 'rerun-job': 're-run failed jobs', 'refresh-stale': 'refresh stale data', 'rerun-reviews': 're-run reviews after a fix', 'pause-outreach': 'pause an outreach mailbox', 'resume-outreach': 'resume outreach mailboxes', 'retry-social': 'retry failed social posts', 'ai-ask': 'ask the AI what to fix', 'ai-fix': 'run fixes the AI picked', 'pagespeed-merge': 'merge PageSpeed fixes', 'pagespeed-close': 'close PageSpeed fixes', 'pagespeed-run': 'start the PageSpeed run', 'merge-pr': 'merge a green PR', 'enable-warmup': 'turn mailbox warm-up back on', 'restore-alias': 'restore a missing alias', 'launch-campaign': 'launch a draft campaign', 'index-submit': 'send missing pages to search engines',
        'gh-board-sync': 'sync the board', 'gh-orphan-ticket': 'file a ticket for the PR', 'gh-update-pr': 'update the PR with main', 'gh-merge-pr': 'merge the green PR', 'gh-revert': 'open a revert PR',
        'gh-delete-branch': 'delete merged branches', 'gh-close-issue': 'close the issue', 'gh-remove-worktree': 'remove the merged worktree', 'gh-agent': 'launch a Cursor fix agent',
        'owner-tags-approve-verified': 'approve verified owner-tag accounts', 'owner-tags-block': 'block accounts that asked us to stop tagging' };
    // Owner emails that also arrive as Jarvis pushes (#1672): off, they wait for the evening digest.
    const MOVED_MAIL = {
        messages: "New CV messages", ratings: "New CV feedback", siteDaily: "Daily CV site report (07:15)", siteQuarter: "Quarter-hour CV site report",
        reviewDaily: "Daily URL review report (07:20)", reviewQuarter: "Quarter-hour URL review report", reruns: "URL review re-runs held for you", reviewOpened: "QA-lab URL Review was opened",
        comparisons: "Comparison saved", reviewEvents: "URL review events (runs, payments, captures; refunds, disputes and unmatched payments always email)",
        ops: "Ops: jobs missed or failed", ownerReplies: "Owner replies", ownerRemind: "Owner replies still waiting (09:00)"
    };
    const ACTION_CAPS = { 'rerun-held': 10, 'resend-notices': 10, 'publish-hub': 2, 'rerun-job': 3, 'rerun-ci': 5, 'refresh-stale': 6, 'rerun-reviews': 2, 'ai-fix': 5, 'retry-social': 3, 'resume-outreach': 1, 'merge-pr': 3, 'enable-warmup': 2, 'restore-alias': 2, 'launch-campaign': 10,
        'gh-board-sync': 10, 'gh-orphan-ticket': 5, 'gh-update-pr': 5, 'gh-merge-pr': 3, 'gh-revert': 1, 'gh-delete-branch': 2, 'gh-close-issue': 5, 'gh-remove-worktree': 5, 'owner-tags-approve-verified': 20, 'owner-tags-block': 10 };
    const COUNTDOWN_HOURS = 2;
    const hoursText = (h) => (h >= 1 ? `${h} h` : `${Math.round(h * 60)} min`);

    // The risky actions Jarvis queued (#1977): each runs when its countdown ends unless cancelled.
    function countdownList(c, hours) {
        const pending = (c && c.pending) || [];
        const recent = (c && c.recent) || [];
        const row = (r) => `<li class="jv-countdown" data-countdown="${esc(r.id)}"><div><strong>${esc(r.label)}</strong>: ${esc(r.target)} <span class="jv-chip">${esc(r.kindLabel || r.kind)}</span>${r.by === 'gemini' && r.confidence !== null ? ` <span class="jv-chip">Gemini ${esc(r.confidence)}</span>` : ''}
            <small>${r.status === 'running' ? 'Running now' : `Runs ${esc(when(r.runsAt))}`}${r.hold ? ' · ' + esc(r.hold) : ''}${r.why ? ' · ' + esc(r.why) : ''}</small></div>
            ${r.status === 'waiting' ? `<div class="jv-countdown-acts"><button type="button" class="jv-btn small" data-countdown-act="now" data-id="${esc(r.id)}">Do it now</button><button type="button" class="jv-btn small" data-countdown-act="cancel" data-id="${esc(r.id)}">Cancel</button></div>` : ''}</li>`;
        const ended = recent.map((r) => `<li>${esc(r.label)}: ${esc(r.target)} · <span class="jv-chip ${r.status === 'done' ? 'c-fast' : r.status === 'failed' ? 'c-slow' : 'c-average'}">${esc(r.status)}</span>${r.result ? ' ' + esc(r.result) : ''}</li>`).join('');
        return `<h4>On the countdown (${hoursText(hours)})</h4>${pending.length ? `<ul class="jv-countdowns">${pending.map(row).join('')}</ul>` : '<p class="jv-empty">Nothing waits on the countdown.</p>'}${ended ? `<details><summary>Ended in the last day (${recent.length})</summary><ul class="jv-facts">${ended}</ul></details>` : ''}`;
    }

    // One of a proposal's buttons (C.proposalButtons, #1977): the same ones its push carries.
    function propButton(p, b) {
        if (b.pr) return `<button type="button" data-ps-act="${esc(b.action)}" data-pr="${b.pr}" data-key="${esc(p.key)}">${esc(b.label)}</button>`;
        if (b.act === 'run') return `<button type="button" data-prop-run="${esc(p.key)}">${esc(b.label)}</button>`;
        if (b.act === 'open') return b.link ? `<a href="${esc(b.link)}" target="_blank" rel="noopener">${esc(b.label)}</a>` : `<button type="button" data-go="${esc(b.tab)}">${esc(b.label)} →</button>`;
        return `<button type="button" data-proposal="${esc(b.act)}" data-key="${esc(p.key)}">${esc(b.label)}</button>`;
    }

    function proposalsPanel(product) {
        const P = S.proposals || {};
        const seen = new Set();
        const list = product ? (P.proposals || []).concat(P.rules || []).filter((p) => p.tab === product && !seen.has(p.key) && seen.add(p.key)) : P.proposals || (P.rules || []).slice(0, 5);
        if (product && !list.length) return '';
        const state = P.loading ? 'Gemini is ranking…' : P.gemini ? `Ranked by Gemini · ${when(P.at)}` : P.error ? 'Rules only. Gemini: ' + P.error : P.at ? 'Rules only' : '';
        const items = list.length ? list.map((p, i) => `<li class="jv-prop lv-${esc(p.level)}"><span class="jv-prop-rank">${i + 1}</span><div class="jv-prop-body">
            <p class="jv-prop-title"><strong>${esc(p.title)}</strong> <span class="jv-chip">impact ${esc(p.impact)}/5</span>${p.effort ? ` <span class="jv-chip">${esc(p.effort)}</span>` : ''}${p.source === 'gemini' ? ' <span class="jv-chip c-average">from Gemini</span>' : ''}</p>
            ${p.why ? `<p class="jv-prop-why">${esc(p.why)}</p>` : ''}<ul class="jv-prop-ev">${(p.evidence || []).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
            <div class="jv-prop-acts">${p.action ? `<span class="jv-prop-safe" data-action="${esc(p.action)}">${autoOn() ? 'Jarvis runs this on its own' : 'Safe action'}</span>` : ''}${C.proposalButtons(p).map((b) => propButton(p, b)).join('')}</div></div></li>`).join('')
            : `<li class="jv-prop lv-good"><span class="jv-prop-rank">✓</span><div class="jv-prop-body"><p>${P.loading || !S.externalAt ? 'Jarvis is reading the sources…' : 'Nothing to propose right now.'}</p></div></li>`;
        return panel((product || 'overview') + '-proposals', 'Proposals', `<p class="jv-note">${esc(state)}${P.hidden ? ` · ${P.hidden} hidden as done or dismissed` : ''}${P.loading ? '' : ' <button type="button" class="jv-link" data-act="proposals">Rank again</button>'}</p><ol class="jv-props">${items}</ol>`,
            { wide: true, data: list.map((p, i) => ({ rank: i + 1, title: p.title, impact: p.impact, effort: p.effort || '', evidence: (p.evidence || []).join(' | '), source: p.source, action: p.action || '' })) });
    }

    const autoOn = () => !S.settings || !S.settings.actions || S.settings.actions.auto !== false;

    function actionsPanel() {
        const a = S.external.actions;
        if (!a || !a.ok) return panel('systems-actions', 'Jarvis actions', `<p class="jv-empty">${S.pending.actions ? 'Reading the actions log…' : esc((a && a.error) || 'Not loaded.')}</p>`, { wide: true });
        const caps = (a.settings && a.settings.caps) || ACTION_CAPS;
        const usage = Object.keys(ACTION_CAPS).map((k) => `<span class="jv-chip${a.used[k] >= (caps[k] || ACTION_CAPS[k]) ? ' c-average' : ''}">${esc(ACTION_LABELS[k])}: ${fmt(a.used[k] || 0)} of ${fmt(caps[k] || ACTION_CAPS[k])} today</span>`).join('') + `<span class="jv-chip">AI acts alone at confidence ${esc(String((a.settings && a.settings.confidence) || 0.8))} or more</span>`;
        const p = a.pending || {};
        const hours = (a.settings && a.settings.countdownHours) || COUNTDOWN_HOURS;
        const waiting = `<ul class="jv-facts"><li>Held re-runs: <b>${fmt(p.held || 0)}</b> (${fmt(p.clean || 0)} clean, Jarvis sends those after the countdown)</li><li>Failed owner notices: <b>${fmt(p.notices || 0)}</b>${a.noticesLive ? (a.noticeHours ? '' : ' · outside Monday-Saturday 08:00-19:00 Bogotá') : ' · owner notices are off (OWNER_NOTICES_LIVE)'}</li></ul>`;
        const buttons = `<div class="jv-actions">${['rerun-held', 'resend-notices', 'publish-hub'].map((k) => `<button type="button" class="jv-btn small" data-run-action="${k}">Run now: ${esc(ACTION_LABELS[k])}</button>`).join('')}</div>`;
        const rows = a.actions || [];
        const log = table([['When', (r) => esc(when(r.at))], ['Action', (r) => esc(ACTION_LABELS[r.action] || r.action)], ['How', (r) => `<span class="jv-chip">${r.mode === 'auto' ? 'on its own' : 'clicked'}</span>`], ['Result', (r) => `<span class="jv-chip ${r.status === 'done' ? 'c-fast' : r.status === 'failed' ? 'c-slow' : 'c-average'}">${esc(r.status)}</span>`], ['Target', (r) => esc(r.target)], ['Detail', (r) => esc(r.detail)]], rows.slice(0, 30), 'Nothing yet.');
        return panel('systems-actions', `Jarvis actions${a.settings && a.settings.auto === false ? ' (automatic runs off)' : ''}`, `<p>${usage}</p>${countdownList(a.countdowns, hours)}${waiting}${buttons}${log}`,
            { wide: true, data: rows, note: `Every hour Jarvis runs the safe actions within these caps; anything over a cap or outside the rules waits for Run now. Risky ones (mail to third parties, posts off schedule, merging a green PR, deploying, resuming outreach) wait ${hoursText(hours)} on the countdown with Do it now and Cancel, at any hour; at night, mail and posts then wait for 08:00-21:00 Bogotá. Refunds and deletes always wait for your click. Caps, the countdown and the switch are in ⚙ Settings.` });
    }

    // URL Review > Signed-in people (#1976): who signed in, what they ran, whether they came back and for how long.
    const openPeople = new Set();
    function peoplePanel() {
        const g = S.external.people;
        if (!g || !g.ok) return panel('review-people', 'Signed-in people', waiting('people', 'Reading the signed-in people…'), { wide: true });
        const keep = (p) => S.mail === 'all' || (S.mail === 'test' ? p.test : !p.test);
        const list = (g.people || []).filter(keep);
        const t = (S.mail === 'all' ? g.allTotals : S.mail === 'test' ? g.testTotals : g.totals) || {};
        const head = stats([
            { label: 'People', value: t.people || 0 }, { label: 'Seen in range', value: t.active || 0 }, { label: 'New in range', value: t.new || 0 },
            { label: 'Came back', value: t.returning || 0 }, { label: 'Visits in range', value: t.visits || 0 }, { label: 'Time on site', value: spent(t.activeMs) },
            { label: 'Average visit', value: spent(t.avgVisitMs) }, { label: 'Runs in range', value: t.runs || 0 }
        ]);
        const row = (p) => `<details class="jv-person" data-person="${esc(p.email)}"${openPeople.has(p.email) ? ' open' : ''}><summary>
            <span class="jv-person-who">${p.picture ? `<img src="${esc(p.picture)}" alt="" width="28" height="28" loading="lazy" referrerpolicy="no-referrer">` : `<i>${esc((p.name || p.email).charAt(0).toUpperCase())}</i>`}<span><b>${esc(p.name || p.email)}</b>${p.name ? `<small>${esc(p.email)}</small>` : ''}</span>${p.test ? '<span class="jv-chip c-average">test</span>' : ''}</span>
            <span><small>Last seen</small>${esc(when(p.lastSeenAt))}</span>
            <span><small>Visits</small>${fmt(p.visits)}${p.returns ? ` · back ${fmt(p.returns)}×` : ''}${p.days > 1 ? ` · ${fmt(p.days)} days` : ''}</span>
            <span><small>Time on site</small>${esc(spent(p.activeMs))}</span>
            <span><small>Runs</small>${fmt(p.runs)}${p.paid ? ` · ${fmt(p.paid)} paid` : ''}</span></summary>
            <div class="jv-person-body"><p class="jv-note">Signed up ${esc(when(p.firstAt))} · last sign-in ${esc(when(p.lastSignInAt))} · ${esc((p.providers || []).join(', ') || 'email')} · ${fmt(p.views)} page views · average visit ${esc(spent(p.avgVisitMs))}</p>
            ${table([['When', (u) => esc(when(u.at))], ['URL', (u) => esc(u.url.replace(/^https?:\/\//, ''))], ['Status', (u) => `<span class="jv-chip${u.paid ? ' c-fast' : ''}">${esc(u.paid ? 'paid' : u.status || '…')}</span>`]], p.urls, 'No runs yet.')}
            ${table([['Visit', (v) => esc(when(v.startedAt))], ['Time', (v) => esc(spent(v.activeMs))], ['Views', (v) => fmt(v.views)], ['Pages', (v) => esc(v.pages.join(', '))]], p.recent, 'No visits recorded since ' + g.since + '.')}</div></details>`;
        const body = head + (list.length ? `<div class="jv-people">${list.map(row).join('')}</div>` : `<p class="jv-empty">${S.mail === 'test' ? 'No test accounts have signed in.' : 'Nobody has signed in yet.'}</p>`) + (g.more ? `<p class="jv-more">+${fmt(g.more)} more in the export</p>` : '');
        return panel('review-people', `Signed-in people · ${fmt(list.length)}`, body, {
            wide: true,
            data: list.map((p) => ({ email: p.email, name: p.name, test: p.test, firstAt: p.firstAt, lastSeenAt: p.lastSeenAt, visits: p.visits, returns: p.returns, days: p.days, views: p.views, minutes: Math.round(p.activeMs / 60000), runs: p.runs, paid: p.paid, urls: p.urls.map((u) => u.url).join(' ') })),
            note: `Visits and time on the URL Review pages are recorded for signed-in people only, since ${esc(g.since)}. Time counts while the tab is visible; a visit ends after 30 minutes without activity. The Real / Tests / All switch applies here.`
        });
    }

    // URL Review > Local (#2118): the Google Maps Local check (#2067, SEO-05) across the reviews in range, and its Places calls.
    const LOCAL_ISSUES = { 'local-website': 'Profile website link', 'local-status': 'Marked closed', 'local-nap': 'Name, address or phone', 'local-hours': 'Opening hours', 'local-utm': 'No UTM tags', 'local-profile': 'No profile found' };
    function localPanel() {
        const g = S.external.local;
        if (!g || !g.ok) return panel('review-local', 'Google Maps: local businesses', waiting('local', 'Reading the Local checks…'), { wide: true });
        const t = g.totals || {};
        const head = stats([
            { label: 'Reviews in range', value: t.reviews || 0 }, { label: 'Looked local', value: t.local || 0 }, { label: 'Profile found', value: t.profiles || 0 },
            { label: 'No profile', value: t.noProfile || 0 }, { label: 'With a Maps issue', value: t.withIssues || 0 }, { label: 'Outreach prospects', value: t.outreach || 0 },
            { label: 'Places calls', value: t.calls || 0 }, { label: 'Places errors', value: t.errors || 0 }
        ]);
        const chip = (verdict) => `<span class="jv-chip ${verdict === 'fail' ? 'c-slow' : verdict === 'risk' ? 'c-average' : 'c-fast'}">${verdict === 'fail' ? 'failing' : verdict === 'risk' ? 'at risk' : 'ok'}</span>`;
        const issues = table([['Issue', (i) => esc(LOCAL_ISSUES[i.key] || i.key)], ['Sites', (i) => fmt(i.count)], ['Failing', (i) => fmt(i.fail)]], g.issues || [], 'No Maps issues in range.');
        const sites = table([
            ['When', (x) => esc(when(x.at))],
            ['Site', (x) => `${esc(x.host)}${x.outreach ? ' <span class="jv-chip">outreach</span>' : ''}`],
            ['Profile', (x) => x.profile ? 'found' : 'none'],
            ['Result', (x) => chip(x.worst)],
            ['Issues', (x) => esc(x.issues.map((i) => LOCAL_ISSUES[i.key] || i.key).join(', ') || '—')]
        ], g.sites || [], 'No local businesses reviewed in range.');
        const err = g.lastError ? `<p class="jv-note">Last Places error ${esc(when(g.lastError.at))}: ${esc(g.lastError.error)}</p>` : '';
        const body = head + issues + sites + err + (g.more ? `<p class="jv-more">+${fmt(g.more)} more in the export</p>` : '');
        return panel('review-local', `Google Maps: local businesses · ${fmt(t.local || 0)}`, body, {
            wide: true,
            data: (g.sites || []).map((x) => ({ at: x.at, host: x.host, source: x.source, outreach: x.outreach, profile: x.profile, result: x.worst || 'ok', issues: x.issues.map((i) => i.key).join(' ') })),
            note: `Reviews whose start page looks like a local business are checked against their Google Business Profile (case SEO-05). Only finding keys are kept, never the profile's own data. Counted since ${esc(g.since)}; test runs are left out. ${fmt(t.callsToday || 0)} Places calls today.`
        });
    }

    function listPanel(key, id, title, list, opts) {
        return panel(key + '-' + id, title, bars(list, opts), Object.assign({ data: (list || []).map((r) => ({ label: r.label, value: r.value })) }, opts || {}));
    }

    function briefPanel(product) {
        const list = S.brief.filter((b) => inTab(b, product));
        const row = (b, hidden) => `<li class="lv-${b.level}${hidden ? ' is-hidden' : ''}" data-brief="${esc(b.key)}" tabindex="0" role="button" aria-haspopup="dialog" title="What this is and what you can do"><b>${b.level}</b><span>${esc(b.text)}</span>${product !== b.product && b.product !== 'overview' ? `<button type="button" data-go="${b.product}">${esc((C.PRODUCTS.find((p) => p.key === b.product) || {}).name || b.product)} →</button>` : '<i aria-hidden="true">›</i>'}</li>`;
        const hiddenHere = S.briefHidden.filter((b) => inTab(b, product));
        const items = (list.length ? list.map((b) => row(b)).join('') : '<li class="lv-good"><b>clear</b><span>All quiet. Nothing needs you right now.</span></li>')
            + (hiddenHere.length ? `<li class="lv-info jv-brief-more"><b>hidden</b><span>${hiddenHere.length} snoozed or dismissed</span><button type="button" data-brief-hidden>${S.showHidden ? 'Hide' : 'Show'}</button></li>` + (S.showHidden ? hiddenHere.map((b) => row(b, true)).join('') : '') : '');
        return `<section class="jv-panel is-wide jv-briefing${folded.has('briefing') ? ' is-folded' : ''}" data-panel-id="briefing"><header>${foldHead('briefing', 'Briefing')}<span class="jv-panel-tools"><button type="button" data-fold-all="1">Collapse all</button><button type="button" data-fold-all="0">Expand all</button><button type="button" data-act="speak">Read aloud</button><button type="button" data-act="ai-brief">Gemini briefing</button></span></header><ul class="jv-brief">${items}</ul>
            <div class="jv-ai"${S.ai ? '' : ' hidden'}><span class="jv-eyebrow">Gemini · ${S.aiAt ? when(S.aiAt) : ''}</span><div class="jv-ai-text">${esc(S.ai).replace(/\n/g, '<br>')}</div></div>
            <form class="jv-ask" data-ask><input type="text" name="q" placeholder="Ask Jarvis: why did opens jump? which source pays? what should I fix first?" aria-label="Ask Jarvis"><button type="submit" class="jv-btn">Ask</button></form></section>`;
    }

    function goalRow(g) {
        const fill = Math.min(100, g.pct);
        const tone = g.status === 'done' ? 'is-done' : g.status === 'on-track' ? 'is-on' : g.status === 'behind' ? 'is-behind' : 'is-far';
        const word = { done: 'met', 'on-track': 'on track', behind: 'behind', 'far-behind': 'far behind' }[g.status];
        return `<li class="jv-goal ${tone}"><div class="jv-goal-head"><span>${esc(g.label)}</span><b>${fmt(g.value)} / ${fmt(g.target)}</b></div>
            <div class="jv-goal-bar" title="${g.elapsed}% of the period gone"><i style="width:${fill}%"></i><s style="left:${Math.min(100, g.elapsed)}%"></s></div>
            <small>${g.pct}% · ${word}${g.status !== 'done' ? ` · pace ${fmt(g.projected)}` : ''}${g.error ? ` · <em>${esc(g.error)}</em>` : ''}</small></li>`;
    }

    function goalsPanel(product) {
        const list = S.goals.filter((g) => product === 'overview' || g.product === product);
        if (!list.length && product !== 'overview') return '';
        const body = list.length ? `<ul class="jv-goals">${list.map(goalRow).join('')}</ul>` : `<p class="jv-empty">No goals yet.</p><div class="jv-actions"><button type="button" class="jv-btn" data-act="settings">Set goals</button></div>`;
        return panel(product + '-goals', 'Goals', body, { data: list.map((g) => ({ goal: g.label, value: g.value, target: g.target, pct: g.pct, status: g.status, pace: g.projected })), note: list.length ? 'The marker shows how much of the period has gone.' : '' });
    }

    function tileGoal(product) {
        const g = S.goals.find((x) => x.product === product);
        return g ? `<span class="jv-tile-goal" title="${esc(g.label)}: ${g.pct}%"><i class="${g.status}" style="width:${Math.min(100, g.pct)}%"></i></span>` : '';
    }

    function speedCard(product) {
        const sp = S.external.speed;
        const up = S.external.uptime;
        const page = sp && sp.pages ? sp.pages.find((x) => x.product === product) : null;
        const live = up && up.pages ? up.pages.find((x) => x.product === product) : null;
        if (!page && !live) return panel(product + '-speed', 'Speed and uptime', `<p class="jv-empty">${S.pending.speed || S.pending.uptime ? 'Jarvis is measuring the page…' : 'Not measured yet.'}</p>`);
        const field = page && page.field ? ['lcp', 'inp', 'cls'].filter((k) => page.field[k]).map((k) => `<span class="jv-chip c-${esc((page.field[k].category || '').toLowerCase())}">${k.toUpperCase()} ${esc(page.field[k].p75)}</span>`).join('') : '';
        return panel(product + '-speed', 'Speed and uptime', `<div class="jv-speed">${page && page.ok ? ring(page.score, 'mobile') : ring(null, 'mobile')}<div><p>${live ? `<span class="jv-chip ${live.ok ? 'c-fast' : 'c-slow'}">HTTP ${esc(live.status)}</span> <span class="jv-chip">${fmt(live.ms)} ms</span>` : ''}</p><p>${field || '<span class="jv-note">No field data from CrUX for this page.</span>'}</p>${page && page.lab ? `<p class="jv-note">Lab: LCP ${esc(page.lab.lcp)} · TBT ${esc(page.lab.tbt)} · CLS ${esc(page.lab.cls)}</p>` : ''}<p><a href="https://pagespeed.web.dev/analysis?url=${encodeURIComponent((page || live).url)}" target="_blank" rel="noopener">Open in PageSpeed →</a></p></div></div>`, { data: page ? [{ page: page.name, score: page.score, status: live && live.status, ms: live && live.ms }] : null });
    }

    function gaCard(product) {
        const ga = S.external.ga4;
        const group = GA_GROUP[product];
        if (!group) return '';
        const row = ga && ga.groups ? ga.groups.find((g) => g.group === group) : null;
        const body = row ? kpis([
            { label: 'GA4 sessions', value: row.sessions, prior: row.priorSessions, delta: C.delta(row.sessions, row.priorSessions).text, dir: C.delta(row.sessions, row.priorSessions).dir },
            { label: 'Users', value: row.users, prior: row.priorUsers, delta: C.delta(row.users, row.priorUsers).text, dir: C.delta(row.users, row.priorUsers).dir },
            { label: 'Engagement', value: row.engagement + '%' },
            { label: 'Avg session', value: row.duration + 's' }
        ]) : `<p class="jv-empty">${S.pending.ga4 ? 'Reading GA4…' : ga && ga.ok === false ? esc(ga.error) : 'No GA4 rows for this group.'}</p>`;
        return panel(product + '-ga4', `GA4 · ${group}`, body, { note: 'GA4 only counts visitors who allowed analytics.', data: row ? [row] : null });
    }

    function siteView(key) {
        const s = S.summaries[key];
        const L = s.lists;
        const name = (C.PRODUCTS.find((p) => p.key === key) || {}).name;
        return kpis(s.kpis) + `<div class="jv-grid">${briefPanel(key)}${goalsPanel(key)}
            ${panel(key + '-trend', name + ' visits per day', area(s.series.labels, [{ name: 'Visits', values: s.series.values, color: COLORS.cyan }]), { wide: true, data: s.series.labels.map((d, i) => ({ day: d, visits: s.series.values[i] })) })}
            ${panel(key + '-heat', 'When they come', heat(s.heatmap, s.peak), { wide: true })}
            ${speedCard(key)}${gaCard(key)}
            ${listPanel(key, 'sources', 'Sources', L.sources)}${listPanel(key, 'actions', 'Actions', L.actions, { color: COLORS.amber })}
            ${listPanel(key, 'exports', key === 'cv' ? 'Exports' : 'Reports', L.exports, { color: COLORS.green })}
            ${key === 'cv' ? listPanel(key, 'links', 'Tracked link opens (cvref)', L.links, { color: COLORS.violet }) : ''}
            ${listPanel(key, 'pages', 'Pages', L.pages)}${listPanel(key, 'langs', 'Languages', L.langs)}
            ${listPanel(key, 'countries', 'Countries', L.countries, { empty: 'Only server-side CV visits carry a country.' })}${listPanel(key, 'cities', 'Cities', L.cities)}
            ${listPanel(key, 'screens', 'Screens', L.screens)}${listPanel(key, 'zones', 'Time zones', L.zones)}
        </div>`;
    }

    const STATE_CHIP = { live: 'c-fast', partial: 'c-average', down: 'c-slow', loading: '', off: '' };
    const LEVEL_CHIP = { good: 'c-fast', info: '', warn: 'c-average', alert: 'c-slow' };
    const SOCIAL = C.SOCIAL;

    function waiting(key, text) {
        const x = S.external[key];
        return `<p class="jv-empty">${S.pending[key] && !x ? esc(text) : esc((x && x.error) || 'Not loaded.')}</p>`;
    }

    function needList(x) {
        return x && x.needs && x.needs.length ? `<ul class="jv-needs">${x.needs.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
    }

    function connectionsPanel() {
        const rows = C.connections(S.external, S.pending);
        const live = rows.filter((r) => r.state === 'live').length;
        return panel('systems-connections', `Connections (${live} of ${rows.length} live)`, table([
            ['Source', (r) => esc(r.name)],
            ['State', (r) => `<span class="jv-chip ${STATE_CHIP[r.state]}">${esc(r.state)}</span>`],
            ['What to do', (r) => r.needs.length ? r.needs.map((n) => esc(n)).join('<br>') : esc(r.detail)],
            ['Updated', (r) => `<span class="jv-nowrap">${esc(r.at ? when(r.at) : '')}</span>`]
        ], rows), { wide: true, data: rows.map((r) => ({ source: r.name, state: r.state, needs: r.needs.join(' | '), error: r.detail })), note: 'Partial: the source works but part of it waits for a one-time grant.' });
    }

    function codesPanel() {
        const m = S.external['mail-codes'];
        if (!m || !m.ok) return panel('systems-codes', 'Sign-in codes', waiting('mail-codes', 'Reading the codes mailed in the last day…'));
        const rows = m.codes || [];
        return panel('systems-codes', `Sign-in codes (${rows.length})`, rows.length ? table([
            ['Service', (r) => `${esc(r.label)}${r.trusted ? '' : ' <span class="jv-chip c-slow">sender not checked</span>'}`],
            ['Code', (r) => r.code ? `<code>${esc(r.code)}</code> <button type="button" class="jv-btn small" data-copy-code="${esc(r.code)}">Copy</button>` : r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">Confirm link ↗</a>` : ''],
            ['To', (r) => esc(r.alias ? r.alias + '@' : '')],
            ['Subject', (r) => esc(r.subject)],
            ['Received', (r) => `<span class="jv-nowrap">${esc(when(r.at))}</span>`]
        ], rows) : '<p class="jv-empty">No codes in the last day.</p>', { wide: true, note: 'Mail to qa@ and the channel addresses reaches Jarvis through the ImprovMX webhook; Gmail keeps a copy.' });
    }

    const CANARY_TEXT = {
        ok: (c) => `came back in ${fmt(c.seconds)} s`, waiting: () => 'sent, waiting for it to come back', lost: () => 'did not come back within 30 minutes',
        stale: () => 'has not run in over a day', never: () => 'has not run yet'
    };

    function mailboxPanel() {
        const b = S.external.mailbox;
        if (!b || !b.ok) return panel('systems-mailbox', 'Mail forwarding (ImprovMX)', waiting('mailbox', 'Asking ImprovMX…'), { wide: true });
        const t = b.totals || {};
        const smtp = b.smtp || {};
        const c = b.canary || { state: 'never' };
        const canary = `<p class="jv-note">Daily round trip to canary@: <span class="jv-chip ${c.state === 'ok' ? 'c-fast' : c.state === 'waiting' ? '' : 'c-slow'}">${esc(c.state)}</span> ${esc((CANARY_TEXT[c.state] || CANARY_TEXT.never)(c))}${c.sentAt ? ', sent ' + esc(when(c.sentAt)) : ''}.${(c.history || []).length ? ` Last ${c.history.length}: ${c.history.map((h) => h.seconds === null ? '✗' : '✓').join('')}` : ''}</p>`;
        return panel('systems-mailbox', `Mail forwarding (ImprovMX), last ${b.days === 1 ? 'day' : b.days + ' days'}`, kpis([
            { label: 'Mails in', value: t.mails || 0 }, { label: 'Forwarded', value: t.forwarded || 0 },
            { label: 'Bounced', value: t.bounced || 0, alert: t.bounced > 0 }, { label: 'Refused (aliases)', value: t.refused || 0, alert: t.refused > 0 },
            { label: 'Spam blocked', value: t.spam || 0 }, { label: 'Refused (no such address)', value: t.unknown || 0 },
            { label: 'SMTP sends this month', value: smtp.monthLimit ? `${fmt(smtp.month)} / ${fmt(smtp.monthLimit)}` : smtp.month || 0, alert: smtp.monthLimit && smtp.month >= smtp.monthLimit * 0.8 }
        ]) + canary + table([
            ['Alias', (r) => esc(r.alias + '@')], ['Mails', (r) => fmt(r.mails)], ['Forwarded', (r) => fmt(r.forwarded)],
            ['Bounced', (r) => r.bounced ? `<span class="jv-chip c-slow">${fmt(r.bounced)}</span>` : '0'], ['Refused', (r) => r.refused ? `<span class="jv-chip c-slow">${fmt(r.refused)}</span>` : '0'],
            ['Last', (r) => `<span class="jv-nowrap">${esc(when(r.last))}</span>`]
        ], b.aliases, 'No mail to the aliases in range.') + ((b.problems || []).length ? table([
            ['When', (r) => `<span class="jv-nowrap">${esc(when(r.at))}</span>`], ['To', (r) => esc(r.alias + '@' + (r.to.length ? ' → ' + r.to.join(', ') : ''))],
            ['What', (r) => `<span class="jv-chip c-slow">${esc(r.outcome)}</span>`], ['From', (r) => esc(r.from)], ['Reason', (r) => esc((r.code ? r.code + ' ' : '') + r.reason)]
        ], b.problems) : ''), {
            wide: true, data: b.aliases,
            note: `${b.aliasCount} aliases. Mail refused to addresses that are not aliases is expected: there is no catch-all. SMTP sends today: ${fmt(smtp.today || 0)}${smtp.dayLimit ? ' of ' + fmt(smtp.dayLimit) : ''}.${b.partial ? ' Only the newest 1,000 deliveries in range were read.' : ''}`
        });
    }

    // Every email address we own (#2338), by domain: its state, where it forwards and who fixes it.
    const ADDRESS_STATE = { ok: 'c-fast', warn: 'c-average', paused: 'c-average', error: 'c-slow' };

    function addressFix(r) {
        if (!r.fix) return '';
        if (r.fix.by === 'jarvis') return '<span class="jv-chip c-fast">Jarvis fixes it</span>';
        return r.fix.link ? `<a href="${esc(r.fix.link)}" target="_blank" rel="noopener noreferrer">${esc(r.fix.action)} →</a>` : esc(r.fix.action);
    }

    function addressesPanel() {
        const a = S.external.addresses;
        if (!a || !a.ok) return panel('systems-addresses', 'Email addresses', waiting('addresses', 'Reading ImprovMX, Microsoft 365, Instantly and SendGrid…'), { wide: true });
        const c = a.counts || {};
        const auth = (a.domains || []).map((d) => `<p class="jv-note"><b>${esc(d.domain)}</b> (${esc((d.systems || []).join(', '))}) ${(d.checks || []).map((k) => `<span class="jv-chip ${k.ok ? 'c-fast' : 'c-slow'}" title="${esc(k.detail)}">${esc(k.name)}</span>`).join('')}</p>`).join('');
        const groups = [];
        (a.rows || []).forEach((r) => { const g = groups[groups.length - 1]; if (g && g.domain === r.domain) g.rows.push(r); else groups.push({ domain: r.domain, rows: [r] }); });
        const cols = [
            ['Address', (r) => `${esc(r.address)}<br><span class="jv-note">${esc(r.kind)}</span>`], ['System', (r) => esc(r.system)],
            ['State', (r) => `<span class="jv-chip ${ADDRESS_STATE[r.state] || ''}">${esc(r.state)}</span>`],
            ['Forwards to', (r) => esc(r.aliasOf ? 'alias of ' + r.aliasOf : (r.forwards || []).join(', '))], ['Detail', (r) => esc(r.detail)], ['Fix', addressFix]
        ];
        return panel('systems-addresses', `Email addresses (${fmt(c.addresses || 0)})`, kpis([
            { label: 'Addresses', value: c.addresses || 0 }, { label: 'OK', value: c.ok || 0 }, { label: 'Warnings', value: c.warn || 0, alert: c.warn > 0 },
            { label: 'Errors', value: c.error || 0, alert: c.error > 0 }, { label: 'Paused', value: c.paused || 0 }
        ]) + auth + needList(a) + groups.map((g) => `<h4 class="jv-addr-domain">${esc(g.domain)}</h4>` + table(cols, g.rows)).join(''), {
            wide: true,
            data: (a.rows || []).map((r) => ({ address: r.address, domain: r.domain, system: r.system, kind: r.kind, state: r.state, forwards: (r.forwards || []).join('; '), aliasOf: r.aliasOf, detail: r.detail, fixBy: r.fix ? r.fix.by : '', fix: r.fix ? r.fix.action : '', link: (r.fix && r.fix.link) || '' })),
            note: 'One row per address and system. Jarvis turns Instantly warm-up back on and restores the canary, postmaster and abuse aliases on its own; what it cannot fix it pushes to you once.' + ((a.errors || []).length ? ' Not read: ' + esc(a.errors.join('; ')) + '.' : '')
        });
    }

    // The daily PageSpeed routine (#1978): every sitemap page worst first, then its runs and PRs.
    const PS_STAGE = { countdown: 'merges on a countdown', merging: 'merging', merged: 'merged', proposal: 'waits in Proposals', closed: 'closed', waiting: 'waits for CI' };
    const PS_SHOWN = 40;
    const psScore = (r) => (r && Number.isFinite(r.score) ? r.score : null);
    const psChip = (r) => (psScore(r) === null ? `<span class="jv-chip c-slow" title="${esc((r && r.error) || 'no score')}">—</span>` : `<span class="jv-chip ${r.score >= 90 ? 'c-fast' : r.score >= 50 ? 'c-average' : 'c-slow'}">${r.score}</span>`);
    const psLow = (p) => Math.min(...['mobile', 'desktop'].map((m) => (psScore(p[m]) === null ? 101 : psScore(p[m]))));
    const psPath = (url) => String(url || '').replace(/^https:\/\/carlosandmunoz\.com/, '') || '/';

    function pageSpeedPanels() {
        const ps = S.external.pagespeed;
        const title = 'Page health: every page';
        if (!ps || !ps.ok) return panel('systems-pages', title, waiting('pagespeed', 'Reading the daily PageSpeed run…'), { wide: true });
        if (ps.empty) return panel('systems-pages', title, `<p class="jv-empty">${esc(ps.note)}</p>`, { wide: true });
        const c = ps.counts || {};
        const last = (ps.runs || [])[0] || {};
        const avg = last.avg || {};
        const pages = (ps.pages || []).slice().sort((a, b) => psLow(a) - psLow(b));
        const cols = [
            ['Page', (p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(psPath(p.url))}</a>`],
            ['Mobile', (p) => psChip(p.mobile)], ['Desktop', (p) => psChip(p.desktop)],
            ['LCP mobile', (p) => (p.mobile && Number.isFinite(p.mobile.lcp) ? (p.mobile.lcp / 1000).toFixed(1) + ' s' : '')],
            ['Flagged', (p) => esc((p.fails || []).slice(0, 4).join(', '))],
            ['Sitemap', (p) => esc(p.sitemap === 'sitemap-social.xml' ? 'social' : 'main')]
        ];
        const rest = pages.slice(PS_SHOWN);
        const health = panel('systems-pages', `${title} (${fmt(c.pages)})`, kpis([
            { label: 'Pages', value: c.pages }, { label: 'Measured', value: c.scored, alert: c.scored < c.pages },
            { label: `Under ${ps.threshold}`, value: c.below, alert: c.below > 0 }, { label: 'Under 50', value: c.under50, alert: c.under50 > 0 },
            { label: 'Average mobile', value: avg.mobile === null || avg.mobile === undefined ? '—' : avg.mobile }, { label: 'Average desktop', value: avg.desktop === null || avg.desktop === undefined ? '—' : avg.desktop }
        ]) + table(cols, pages.slice(0, PS_SHOWN)) + (rest.length ? `<details class="jv-more-pages"><summary>Show the other ${fmt(rest.length)} pages</summary>${table(cols, rest)}</details>` : ''), {
            wide: true, data: pages.map((p) => ({ url: p.url, sitemap: p.sitemap, mobile: psScore(p.mobile), desktop: psScore(p.desktop), lcpMobile: (p.mobile || {}).lcp, error: (p.mobile || {}).error || (p.desktop || {}).error || '', flagged: (p.fails || []).join(' ') })),
            note: `Lighthouse through PageSpeed Insights, mobile and desktop, every page in sitemap.xml and sitemap-social.xml. Measured ${esc(when(ps.at))}; worst first.`
        });
        const fixes = (s) => (s ? (s.error ? `<span class="jv-chip c-slow">${esc(s.error)}</span>` : `${fmt(s.fixes)} fix${s.fixes === 1 ? '' : 'es'}${s.verdict ? ' · ' + esc(s.verdict.reason) : ''}`) : '');
        const routine = panel('systems-pagespeed', 'PageSpeed routine', ((ps.prs || []).length ? table([
            ['PR', (p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener">#${esc(p.number)}</a>`],
            ['Fixes', (p) => (p.kind === 'ai' ? "Gemini's" : 'Safe')],
            ['Stage', (p) => `<span class="jv-chip ${p.stage === 'merged' ? 'c-fast' : p.stage === 'closed' ? '' : 'c-average'}">${esc(PS_STAGE[p.stage] || p.stage)}</span>${p.dueAt ? ' ' + esc(when(p.dueAt)) : ''}`],
            ['Why', (p) => esc(p.reason || p.title)],
            ['', (p) => (p.open ? `<button type="button" class="jv-btn small" data-ps-act="pagespeed-merge" data-pr="${esc(p.number)}">Merge</button><button type="button" class="jv-btn small" data-ps-act="pagespeed-close" data-pr="${esc(p.number)}">Close</button>` : '')]
        ], ps.prs) : '<p class="jv-empty">No PageSpeed PRs yet.</p>') + table([
            ['Run', (r) => (r.run ? `<a href="${esc(r.run.url)}" target="_blank" rel="noopener">${esc(when(r.at))}</a>` : esc(when(r.at)))],
            ['Result', (r) => `<span class="jv-chip ${r.status === 'ok' ? 'c-fast' : 'c-slow'}">${esc(r.status === 'ok' ? 'ok' : r.error || r.status)}</span>`],
            ['Measured', (r) => `${fmt(r.scored)} of ${fmt(r.pages)}`], ['Under 90', (r) => fmt(r.below)],
            ['Average', (r) => (r.avg ? `${r.avg.mobile === null ? '—' : r.avg.mobile} / ${r.avg.desktop === null ? '—' : r.avg.desktop}` : '')],
            ['Safe fixes', (r) => fixes(r.safe)], ["Gemini's fixes", (r) => fixes(r.ai)]
        ], ps.runs, 'No runs yet.') + ((ps.cache || []).length ? `<h4 class="jv-sub">Short cache lifetimes (GitHub Pages sets them; reported, not fixed)</h4>` + table([
            ['File', (r) => esc(psPath(r.url))], ['Cache', (r) => (r.ttlMs ? Math.round(r.ttlMs / 60000) + ' min' : 'none')], ['Could save', (r) => Math.round((r.wastedBytes || 0) / 1024) + ' KB'], ['Pages', (r) => fmt(r.pages)]
        ], ps.cache.slice(0, 10)) : ''), {
            wide: true, data: ps.runs,
            note: `Every day at 06:00 UTC. Safe fixes that score up on both mobile and desktop merge on a 2-hour countdown once CI passes (Jarvis pushes first, 08:00-20:00 Bogotá); Gemini's fixes and the rest wait in Proposals.${ps.stale ? ' The last run is more than a day old.' : ''}`
        });
        return health + routine;
    }

    function safetyPanel() {
        const s = S.external.safety;
        return panel('systems-safety', 'Safety and mail setup', s && s.ok ? table([
            ['Check', (c) => esc(c.name)], ['', (c) => `<span class="jv-chip ${LEVEL_CHIP[c.level]}">${esc(c.level)}</span>`], ['Detail', (c) => esc(c.detail)]
        ], s.checks) : waiting('safety', 'Checking Web Risk, DNS and the domain…'), { data: s && s.checks });
    }

    function costsBlock(c) {
        if (!c || c.error) return c && c.error ? `<p class="jv-note">Costs: ${esc(c.error)}</p>` : '';
        if (c.pending) return `<p class="jv-note">${esc(c.note)}</p>`;
        if (!c.byService) return '';
        return `<h4 class="jv-sub">Cloud spend, last ${fmt(c.days)} days: ${fmt(c.net)} ${esc(c.currency)} after credits (${fmt(c.gross)} before)</h4>` + bars(c.byService.filter((s) => s.value > 0), { color: COLORS.amber, empty: 'Nothing billed after credits.' });
    }

    function platformPanel() {
        const p = S.external.platform;
        if (!p || !p.ok) return panel('systems-platform', 'Google Cloud', waiting('platform', 'Reading Monitoring and Logging…'));
        const f = p.functions || {}, g = p.gemini || {}, fs = p.firestore || {}, u = p.users || {};
        const th = C.thresholds((S.settings || {}).thresholds);
        return panel('systems-platform', 'Google Cloud, last 24 hours', kpis([
            { label: 'Function runs', value: f.executions === undefined ? '—' : f.executions },
            { label: 'Real failures', value: f.failures === undefined ? '—' : f.failures, alert: f.failures >= th.fnFailures },
            { label: 'Gemini ok (7 days)', value: g.requests ? g.ok + ' / ' + g.requests : '—', alert: g.requests >= 10 && g.errorRate >= th.geminiErrorPct },
            { label: 'Firestore reads today (Pacific)', value: fs.reads === undefined ? '—' : fs.reads, delta: fs.readsFreePct === undefined ? '' : fs.readsFreePct + '% of free', alert: fs.readsFreePct >= th.firestoreFreePct },
            { label: 'Firestore writes', value: fs.writes === undefined ? '—' : fs.writes },
            { label: 'New sign-in accounts', value: u && u.newInRange !== undefined ? u.newInRange : '—' }
        ]) + bars(f.byFunction, { color: COLORS.pink, empty: 'No crashes, timeouts or 5xx answers in 24 hours.' }) + (g.failedMethods && g.failedMethods.length ? `<p class="jv-note">Failed Gemini calls by method: ${g.failedMethods.map((m) => esc(m.label) + ' ' + fmt(m.value)).join(', ')}.</p>` : '') + costsBlock(p.costs),
        { wide: true, data: [f, g, fs, u], note: `Real failures count crashes, timeouts and 5xx answers. Google also counts expected 4xx answers as errors (${fmt(f.notOk || 0)} in 24 hours).` + (f.error ? ' ' + esc(f.error) : '') });
    }

    function businessView() {
        const e = S.external;
        const mo = e.money, em = e.email, se = e.search, so = e.social;
        const braveDepth = (se && se.brave && se.brave.depth) || 20;
        const th = C.thresholds((S.settings || {}).thresholds);
        const okMoney = mo && mo.ok, okMail = em && em.ok, okSocial = so && so.ok, gsc = se && se.console;
        const md = okMoney ? C.delta(mo.revenue.usd, mo.prior.usd) : null;
        const head = kpis([
            { label: 'Revenue (USD)', value: okMoney ? mo.revenue.usd : '—', delta: md ? md.text : '', dir: md && md.dir, prior: okMoney ? mo.prior.usd : 0 },
            { label: 'Sales', value: okMoney ? mo.revenue.count : '—' },
            { label: 'Paid runs', value: okMoney ? mo.revenue.paidRuns : '—' },
            { label: 'Emails delivered', value: okMail && em.rates.delivered !== null ? em.rates.delivered + '%' : '—', alert: okMail && em.rates.bad >= th.emailBadPct },
            { label: 'Social posts', value: okSocial ? so.sent : '—', alert: okSocial && so.failed > 0 },
            { label: 'Google clicks', value: gsc && gsc.ok ? gsc.clicks : '—' }
        ]);
        const social = socialVisits();
        const pp = okMoney ? mo.paypal || {} : {};
        const W = S.wide;
        const steps = W.funnel ? W.funnel.map((x) => ({ label: x.value === null ? x.label + ' (source down)' : x.label, value: x.value || 0 })) : null;
        return head + `<div class="jv-grid">${briefPanel('business')}
            ${callsPanel()}
            ${panel('business-mix', 'Revenue by product', okMoney ? pie(W.revenue, { unit: 'USD', empty: 'No sales in this range.' }) : waiting('money', 'Reading payments…'), { data: W.revenue })}
            ${panel('business-funnel', 'Outreach funnel', steps ? funnel(steps) : waiting('outreach', 'Reading the outreach pipeline…'), { data: W.funnel, note: steps ? 'Reviewed by the nightly sweep in range, emailed through Instantly, replied, and paid through a qalabreview.com link. Instantly counts every contact it emailed, so Notified can pass Reviewed.' : '' })}
            ${panel('business-revenue', 'Revenue per day (USD)', okMoney ? (mo.daily.length ? area(mo.daily.map((d) => d.date), [{ name: 'USD', values: mo.daily.map((d) => d.usd), color: COLORS.green }]) : '<p class="jv-empty">No sales in this range.</p>') + bars(mo.byProvider, { color: COLORS.green, empty: 'No sales by provider yet.' }) : waiting('money', 'Reading payments…'), { wide: true, data: okMoney ? mo.daily : null, note: okMoney ? `Test payments are left out. ${fmt(mo.revenue.paidRuns)} paid review runs used credits bought earlier.` : '' })}
            ${panel('business-paypal', 'PayPal and Stripe', okMoney ? `<ul class="jv-facts"><li>Open PayPal disputes: <b>${pp.disputesOpen === null || pp.disputesOpen === undefined ? '—' : fmt(pp.disputesOpen)}</b></li>${pp.transactions ? `<li>PayPal in range: ${fmt(pp.transactions.count)} payments, ${fmt(pp.transactions.grossUsd)} USD gross, ${fmt(pp.transactions.feesUsd)} USD fees, <b>${fmt(pp.transactions.netUsd)} USD net</b></li>` : ''}<li>Refunded in range: <b>${fmt(mo.refundsUsd)} USD</b></li><li>Stripe: ${esc(mo.stripe.mode === 'live' ? 'live' : mo.stripe.mode === 'test' ? 'test key only, checkout uses PayPal' : 'not set up')}</li></ul>${needList(mo)}` : waiting('money', 'Asking PayPal…'))}
            ${panel('business-email', 'Email delivery (SendGrid)', okMail ? kpis([
                { label: 'Sent', value: em.totals.processed }, { label: 'Delivered', value: em.totals.delivered }, { label: 'Bounced', value: em.totals.bounces, alert: em.totals.bounces > 0 },
                { label: 'Blocked', value: em.totals.blocks, alert: em.totals.blocks > 0 }, { label: 'Spam reports', value: em.totals.spam_reports, alert: em.totals.spam_reports > 0 }, { label: 'Opened', value: em.rates.opened === null ? '—' : em.rates.opened + '%' }
            ]) + area(em.daily.map((d) => d.date), [{ name: 'Delivered', values: em.daily.map((d) => d.delivered), color: COLORS.cyan }, { name: 'Bounced or blocked', values: em.daily.map((d) => d.bad), color: COLORS.pink }]) + table([['Kind', (r) => esc(r.kind)], ['Domain', (r) => esc(r.domain)], ['Reason', (r) => esc(r.reason)], ['When', (r) => esc(when(r.at))]], [].concat(...['bounces', 'blocks', 'spam'].map((k) => ((em.suppressions || {})[k] || []).map((r) => Object.assign({ kind: k }, r)))).slice(0, 12), 'No bounces, blocks or spam reports in range.') : waiting('email', 'Asking SendGrid…'), { wide: true, data: okMail ? em.daily : null, note: okMail && em.blocklisted && em.blocklisted.length ? `Refused because the sending IP is on a blocklist: ${em.blocklisted.map((l) => esc(l.label) + ' (' + fmt(l.value) + ')').join(', ')}. SendGrid's shared IPs get listed now and then; ask SendGrid support, or move to a dedicated IP if it keeps happening.` : '' })}
            ${panel('business-brave', `Search rankings (Brave, top ${braveDepth})`, se && se.brave && se.brave.ok ? table([['Search', (q) => esc(q.query)], ['Our place', (q) => q.position ? `<span class="jv-chip ${q.position <= 3 ? 'c-fast' : q.position <= 10 ? 'c-average' : ''}">#${q.position}</span>` : `<span class="jv-chip c-slow">not in top ${braveDepth}</span>`], ['First result', (q) => esc(q.leader || q.error || '')]], se.brave.queries) : waiting('search', 'Searching Brave…'), { data: se && se.brave && se.brave.queries, note: braveDepth > 20 ? 'Top 20 checked daily, places 21–100 weekly. Edit the searches in ⚙ Settings.' : 'Checked once a day. Edit the searches in ⚙ Settings.' })}
            ${panel('business-index', 'Search index (Brave)', se && se.index ? (se.index.ok ? indexBody(se.index) : `<p class="jv-empty">${esc(se.index.error || 'Not checked.')}</p>`) : waiting('search', 'Checking Brave\'s index…'),
                { data: se && se.index && se.index.ok ? se.index.mainMissing.map((url) => ({ missing: url })) : null, note: 'A site: search on Brave daily. Jarvis sends missing pages to IndexNow and Brave\'s Submit URL form weekly.' })}
            ${panel('business-gsc', 'Google Search Console', gsc && gsc.ok ? kpis([{ label: 'Clicks', value: gsc.clicks }, { label: 'Impressions', value: gsc.impressions }, { label: 'CTR', value: gsc.ctr + '%' }, { label: 'Avg position', value: gsc.position === null ? '—' : gsc.position }]) + table([['Query', (q) => esc(q.query)], ['Clicks', (q) => fmt(q.clicks)], ['Impr.', (q) => fmt(q.impressions)], ['Pos.', (q) => fmt(q.position)]], gsc.queries, 'No queries yet.') : se && se.ok ? `<p class="jv-empty">${esc((gsc && gsc.error) || 'Not connected.')}</p>${needList(se)}` : waiting('search', 'Asking Search Console…'), { data: gsc && gsc.ok ? gsc.queries : null })}
            ${panel('business-social', 'Social posts', okSocial ? bars(so.channels, { color: COLORS.violet, empty: 'No posts went out in this range.' }) + table([['When', (r) => esc(when(r.at))], ['Network', (r) => esc(r.channel)], ['Result', (r) => `<span class="jv-chip ${r.result === 'sent' ? 'c-fast' : r.result === 'failed' ? 'c-slow' : ''}">${esc(r.result)}</span>`], ['Post', (r) => r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.post.slice(0, 40))}</a>` : esc(r.post.slice(0, 40))]], so.latest, 'No posts in range.') + needList(so) : waiting('social', 'Reading the social ledgers…'), { wide: true, data: okSocial ? so.latest : null, note: okSocial && so.scheduled && so.scheduled.count ? `${fmt(so.scheduled.count)} more posts are scheduled in Buffer; the next goes out ${esc(when(so.scheduled.next))}.` : '' })}
            ${listPanel('business', 'social-visits', 'Visits that came from social', social, { color: COLORS.violet, empty: 'No visits from social links in this range.' })}
            ${okSocial && so.youtube && so.youtube.videos.length ? panel('business-youtube', `YouTube${so.youtube.views !== null ? ' (' + fmt(so.youtube.views) + ' views)' : ''}`, table([['Video', (v) => `<a href="https://youtu.be/${esc(v.id)}" target="_blank" rel="noopener">${esc(String(v.title || v.id).slice(0, 70))}</a>`], ['Views', (v) => v.views === undefined ? '—' : fmt(v.views)], ['Likes', (v) => v.likes === undefined ? '—' : fmt(v.likes)], ['Published', (v) => esc(when(v.published))]], so.youtube.videos), { wide: true, data: so.youtube.videos }) : ''}
        </div>`;
    }

    // Calls booked on book.html (#1971), and the Google Calendar they are read from and written to.
    function callsPanel() {
        const c = S.external.calls;
        if (!c) return panel('business-calls', 'Calls', waiting('calls', 'Reading bookings…'), { wide: true });
        if (!c.ok) return panel('business-calls', 'Calls', `<p class="jv-empty">${esc(c.error || 'Not loaded.')}</p>`, { wide: true });
        const rows = c.upcoming || [];
        const head = c.connected
            ? `<p class="jv-note">Booking page <a href="${esc(c.page)}" target="_blank" rel="noopener">book.html</a> reads ${esc(c.account || 'your Google Calendar')}.${c.error ? ` <span class="jv-chip c-slow">${esc(c.error)}</span>` : ''} <button type="button" class="jv-link" data-act="calendar-connect">Reconnect</button></p>`
            : `<p class="jv-empty">Google Calendar is not connected, so book.html shows booking as closed.</p><p><button type="button" class="jv-btn" data-act="calendar-connect">Connect Google Calendar</button></p>`;
        return panel('business-calls', `Calls: ${fmt(rows.length)} ahead, ${fmt(c.bookedInRange)} booked in range`, head + table([
            ['When', (r) => esc(when(r.start))],
            ['Call', (r) => `${esc(r.label)} <span class="jv-note">${fmt(r.minutes)} min · ${esc(r.lang)}</span>`],
            ['Who', (r) => `${esc(r.name)}<br><span class="jv-note">${esc(r.email)}${r.company ? ' · ' + esc(r.company) : ''}</span>`],
            ['About', (r) => esc([r.host, r.note].filter(Boolean).join(' · ').slice(0, 140))],
            ['Meet', (r) => (r.meet ? `<a href="${esc(r.meet)}" target="_blank" rel="noopener">Join</a>` : '—')]
        ], rows, 'No calls ahead.'), { wide: true, data: rows });
    }

    async function calendarConnect() {
        const out = await call('calendar-connect');
        if (out.ok && out.url) window.open(out.url, '_blank', 'noopener');
        else toast(out.error || 'Could not start the Google sign-in.', 7000);
    }

    // Social hub (#1420): the queue per channel from the social ledgers, the posting runs, and field-sweep proposals.
    function socialQueuePanel() {
        const so = S.external.social;
        if (!so || !so.queue) return panel('hub-queue', 'Queue by channel', so && so.ok === false ? `<p class="jv-empty">${esc(so.error || 'Not loaded.')}</p>` : waiting('social', 'Reading the social ledgers…'), { wide: true });
        const next = (c) => (c.next.length ? c.next.map((n) => `<span class="jv-chip">${esc(when(n.at))}</span> ${esc(n.post.split('/').pop())}`).join('<br>') : '<span class="jv-note">nothing scheduled</span>');
        const counts = { telegram: so.telegram || {}, reddit: so.reddit || {} };
        const members = (c) => {
            const m = counts[c.channel];
            return m && typeof m.members === 'number' ? `<br><span class="jv-note">${fmt(m.members)} members${typeof m.change === 'number' ? ` · <span class="jv-chip ${m.change > 0 ? 'c-fast' : m.change < 0 ? 'c-slow' : ''}">${m.change > 0 ? '+' : ''}${fmt(m.change)}</span> since ${esc(m.from.date)}` : ''}</span>` : '';
        };
        const NUMBERS = [['impressions', 'impressions'], ['views', 'views'], ['likes', 'likes'], ['comments', 'comments']];
        const numbers = (c) => NUMBERS.filter(([k]) => c.numbers && c.numbers[k]).map(([k, label]) => `${fmt(c.numbers[k])} ${label}`).join(' · ') || '—';
        const needs = Object.values(counts).filter((m) => m.need).map((m) => `<li>${esc(m.need)}</li>`).join('');
        const memberNeeds = needs ? `<ul class="jv-needs">${needs}</ul>` : '';
        return panel('hub-queue', 'Queue by channel', table([
            ['Channel', (c) => `<strong>${esc(c.name)}</strong>${members(c)}`], ['Scheduled', (c) => fmt(c.scheduled)], ['Next', next],
            ['Sent', (c) => fmt(c.sent)], ['Failed', (c) => (c.failed ? `<span class="jv-chip c-slow">${fmt(c.failed)}</span>` : '0')],
            ['Numbers', numbers],
            ['Last out', (c) => (c.last ? (c.last.url ? `<a href="${esc(c.last.url)}" target="_blank" rel="noopener">${esc(when(c.last.at))}</a>` : esc(when(c.last.at))) : '—')]
        ], so.queue) + memberNeeds, { wide: true, data: so.queue.map((c) => Object.assign({ channel: c.name, scheduled: c.scheduled, next: c.next.map((n) => n.at + ' ' + n.post).join(' | '), sent: c.sent, failed: c.failed, last: c.last ? c.last.at : '' }, c.numbers || {}, counts[c.channel] ? { members: counts[c.channel].members, change: counts[c.channel].change } : {})), note: 'Sent and failed count the selected range; Numbers add up the posts sent in it, as the morning run read them. On Telegram likes are reactions, on Reddit the post score. Instagram stays empty while that channel is paused in Buffer. Telegram is the @qalab_live channel: the post of each Live Reports batch and the campaign posts (tips, series, skits, launch) in their own language; its members are read each morning. Reddit is r/QALabLiveReports: the app\'s daily batch post and the campaign posts, as links to their hub pages; its members are read after the 16:20 UTC post. The change counts from the last daily count on or before the range start.' });
    }

    function socialRunsPanel() {
        const R = S.external['social-runs'];
        const runs = (R && R.runs) || [];
        const state = (r) => (r.status && r.status !== 'completed' ? `<span class="jv-chip c-average">${esc(r.status)}</span>` : r.conclusion ? `<span class="jv-chip ${r.conclusion === 'success' ? 'c-fast' : 'c-slow'}">${esc(r.conclusion)}</span>` : '—');
        const body = runs.length ? table([['Workflow', (r) => esc(r.name)], ['Last run', (r) => (r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(when(r.at))}</a>` : '—')], ['How', (r) => esc(r.event || '')], ['Result', state]], runs) : `<p class="jv-empty">${esc((R && R.error) || (R ? 'Set GITHUB_BUGS_TOKEN in Secret Manager to see the runs.' : 'Reading the workflow runs…'))}</p>`;
        return panel('hub-runs', 'Posting', body + `<div class="jv-actions"><button type="button" class="jv-btn" data-act="social-post-now"${S.pending['social-post-now'] ? ' disabled' : ''}>Post now</button></div>`,
            { note: 'Post now runs the Buffer queue (the batches a spent daily limit held back) and the Facebook Page queue instead of waiting for their nightly slots. The Reddit app run is shown only: the app posts each batch in r/QALabLiveReports on its own daily task.' });
    }

    // A post proposal's card image (#2248), so the post is approved as it will look; a card that failed once stays a note.
    const brokenCards = new Set();
    function proposalCard(p) {
        if (!/^https:\/\//.test(p.image || '')) return '';
        if (brokenCards.has(p.image)) return '<p class="jv-prop-why jv-prop-nocard">The card image did not load.</p>';
        return `<img class="jv-prop-card" data-card src="${esc(p.image)}" alt="${esc('Card image: ' + (p.title || ''))}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
    }

    function socialProposalsPanel() {
        const P = S.external['social-proposals'];
        if (!P) return panel('hub-proposals', 'Post proposals', waiting('social-proposals', 'Reading the field sweep proposals…'), { wide: true });
        if (P.ok === false) return panel('hub-proposals', 'Post proposals', `<p class="jv-empty">${esc(P.error || 'Not loaded.')}</p>`, { wide: true });
        const list = P.proposals || [];
        const items = list.map((p) => `<li class="jv-prop lv-info"><span class="jv-prop-rank">${esc(String(Math.round(Number(p.score) || 0)))}</span><div class="jv-prop-body">
            <p class="jv-prop-title"><strong>${esc(p.title)}</strong>${p.topic ? ` <span class="jv-chip">${esc(p.topic)}</span>` : ''} <span class="jv-chip">${esc(p.lang)}</span></p>
            <p class="jv-prop-why">${esc([p.source, p.author && 'by ' + p.author, p.date].filter(Boolean).join(' · '))}</p>${proposalCard(p)}${p.summary ? `<p class="jv-prop-why">${esc(p.summary)}</p>` : ''}
            <div class="jv-prop-acts"><button type="button" data-social-decide="approved" data-key="${esc(p.id)}">Approve</button><button type="button" data-social-decide="dismissed" data-key="${esc(p.id)}">Dismiss</button>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">Read →</a>` : ''}</div></div></li>`).join('');
        return panel('hub-proposals', 'Post proposals' + (list.length ? ' (' + list.length + ')' : ''), `<p class="jv-note">Approve adds it to the hub as a pick, as the hub editor does; the next daily build publishes it.${P.built ? ' Sweep ran ' + esc(when(P.built)) + '.' : ''}</p>` + (list.length ? `<ol class="jv-props">${items}</ol>` : '<p class="jv-empty">No proposals are waiting.</p>'), { wide: true });
    }

    async function decideSocial(id, decision) {
        const out = await call('social-decide', { id, decision }).catch((error) => ({ ok: false, error: error.message }));
        if (!out.ok) { toast('Not saved: ' + out.error, 6000); return; }
        const P = S.external['social-proposals'];
        if (P && P.proposals) P.proposals = P.proposals.filter((p) => p.id !== id);
        render();
        toast(decision === 'approved' ? 'Approved. The next daily hub build publishes it.' : 'Dismissed.', 3500);
    }

    async function postNow() {
        if (!window.confirm('Run the Buffer and Facebook queues now?')) return;
        S.pending['social-post-now'] = true;
        render();
        const out = await call('social-post-now').catch((error) => ({ ok: false, error: error.message }));
        S.pending['social-post-now'] = false;
        toast(out.ok ? out.note : 'Not started: ' + out.error, 6000);
        loadExternal(['social-runs']);
    }

    // Share to post (#1420): a photo or video and one caption; Gemini drafts each network's post, the owner edits, and social-inbox.yml posts it.
    const SHARE_FIELDS = [['title', 'Title'], ['linkedin', 'LinkedIn'], ['x', 'X'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtubeTitle', 'YouTube title'], ['youtube', 'YouTube']];
    function blankShare() { return { file: null, caption: '', busy: false, id: null, kind: null, draft: null, note: '' }; }

    function sharePanel() {
        const H = S.share;
        const L = S.external['share-list'];
        const items = ((L && L.items) || []).filter((i) => i.id !== H.id && i.status !== 'draft');
        const chip = (s) => `<span class="jv-chip ${s === 'posted' ? 'c-fast' : s === 'failed' ? 'c-slow' : 'c-average'}">${esc(s)}</span>`;
        const recent = items.length ? table([['Post', (i) => esc(i.title || i.caption || '')], ['Media', (i) => esc(i.kind || '')], ['Status', (i) => (i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${chip(i.status)}</a>` : chip(i.status))], ['Shared', (i) => esc(when(i.at))]], items.slice(0, 6)) : '';
        let body;
        if (H.draft) {
            const fields = SHARE_FIELDS.filter(([k]) => H.draft[k] !== undefined).map(([k, label]) => `<label class="jv-share-field"><span>${label}</span><textarea data-share-field="${k}" data-keep="share-${k}" rows="${k === 'title' || k === 'youtubeTitle' ? 1 : 3}">${esc(H.draft[k])}</textarea></label>`).join('');
            body = `<p class="jv-note">${esc(H.note || 'Gemini drafted one post per network from your caption. Edit any of them, then queue.')}</p><div class="jv-share-fields">${fields}</div>
                <div class="jv-actions"><button type="button" class="jv-btn" data-act="share-queue"${H.busy ? ' disabled' : ''}>${H.busy ? 'Queueing…' : 'Queue the post'}</button><button type="button" class="jv-btn" data-act="share-drop"${H.busy ? ' disabled' : ''}>Drop</button></div>`;
        } else {
            body = `<div class="jv-share-form"><label class="jv-btn jv-share-pick">${H.file ? esc(H.file.name) + ' · change' : 'Choose a photo or video'}<input type="file" hidden data-share-file accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"></label>
                <textarea data-share-caption data-keep="share-caption" rows="3" placeholder="What should the post say? Write it in the language it should go out in.">${esc(H.caption)}</textarea>
                <div class="jv-actions"><button type="button" class="jv-btn" data-act="share-draft"${H.busy || !H.file ? ' disabled' : ''}>${H.busy ? esc(H.busy) : 'Draft with Gemini'}</button></div></div>`;
        }
        return panel('hub-share', 'Share a post', body + recent,
            { wide: true, note: 'Videos post as they are, in the language you speak in them, and must have sound. LinkedIn, X and the Facebook Page (plus TikTok and YouTube for a video) get it about 30 minutes after you queue it.' });
    }

    async function shareDraft() {
        const H = S.share;
        if (!H.file || H.busy) return;
        if (!H.caption.trim()) { toast('Write a caption first; Gemini drafts the posts from it.', 4000); return; }
        if (H.file.size > 300 * 1024 * 1024) { toast('That file is over 300 MB.', 5000); return; }
        try {
            H.busy = 'Uploading…';
            render();
            const ext = (H.file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
            const path = `social-inbox/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            await upload(path, H.file);
            H.busy = 'Drafting…';
            render();
            const out = await call('share-draft', { path, caption: H.caption });
            if (!out.ok) throw new Error(out.error);
            Object.assign(H, { id: out.id, kind: out.kind, draft: out.draft, note: out.note || '' });
        } catch (error) { toast('Not drafted: ' + error.message, 7000); }
        H.busy = false;
        render();
    }

    async function shareQueue() {
        const H = S.share;
        if (!H.id || H.busy) return;
        H.busy = true;
        render();
        const out = await call('share-queue', { id: H.id, draft: H.draft }).catch((error) => ({ ok: false, error: error.message }));
        if (out.ok) { S.share = blankShare(); toast(out.note, 7000); loadExternal(['share-list']); return; }
        H.busy = false;
        render();
        toast('Not queued: ' + out.error, 7000);
    }

    async function shareDrop() {
        if (S.share.id) await call('share-drop', { id: S.share.id }).catch(() => ({}));
        S.share = blankShare();
        render();
    }

    const NOTICE_BADGE = { ready: ['c-fast', 'ready to send'], waiting: ['c-average', 'waiting for Live Report'], unlisted: ['c-slow', 'off Live Reports'], stopped: ['c-slow', 'asked for no notices'] };
    const NOTICE_HELD = {
        waiting: 'Send opens once its Live Report is public.',
        unlisted: 'The site is off Live Reports, so this cannot be sent. Drop it.',
        stopped: 'Every address, or the whole domain, asked for no notices. Drop it.'
    };
    const noticeAddresses = (n) => (n.candidates.length ? n.candidates : [{ email: n.email, sources: [], onDomain: false, stopped: false }]);
    const noticeOpen = (n) => noticeAddresses(n).filter((c) => !c.stopped).map((c) => c.email);
    // The addresses checked for a notice: the top-ranked one until changed; kept on the row across renders.
    const noticePicks = (n) => n.picked || (n.picked = noticeOpen(n).includes(n.email) ? [n.email] : noticeOpen(n).slice(0, 1));

    // Owner notices waiting for Send or Drop (#1420), ready ones first, one email to each address picked (#1975).
    function approvalsPanel() {
        const N = S.external.notices;
        if (!N) return panel('outreach-approvals', 'Approvals', waiting('notices', 'Reading the owner notices waiting for you…'), { wide: true });
        if (N.ok === false) return panel('outreach-approvals', 'Approvals', `<p class="jv-empty">${esc(N.error || 'Not loaded.')}</p>`, { wide: true });
        const list = N.notices || [];
        const items = list.map((n) => {
            const picked = noticePicks(n);
            const open = noticeOpen(n);
            const held = NOTICE_HELD[n.state];
            const badge = NOTICE_BADGE[n.state];
            const chips = [
                badge && `<span class="jv-chip ${badge[0]}">${badge[1]}</span>`,
                n.critical && '<span class="jv-chip c-slow">critical security</span>',
                n.lastError && `<span class="jv-chip c-average">last try failed${n.tries ? ' · ' + n.tries + '/' + (N.tries || 3) + ' auto tries' : ''}</span>`,
                `<span class="jv-chip">${esc(String(n.lang || 'en').toUpperCase())}</span>`
            ].filter(Boolean).join('');
            const boxes = noticeAddresses(n).map((c) => `<label class="jv-approval-to${c.stopped ? ' is-stopped' : ''}"><input type="checkbox" data-notice-pick value="${esc(c.email)}"${picked.includes(c.email) ? ' checked' : ''}${c.stopped || held ? ' disabled' : ''}><span>${esc(c.email)}<small>${esc(c.sources.concat(c.onDomain ? ['on the site'] : [], c.stopped ? ['asked for no notices'] : []).join(' · '))}</small></span></label>`).join('');
            const all = open.length > 1 && !held ? `<label class="jv-approval-to is-all"><input type="checkbox" data-notice-all${picked.length === open.length ? ' checked' : ''}><span>All ${open.length}</span></label>` : '';
            return `<li class="jv-approval is-${esc(n.state || 'unknown')}${n.critical ? ' is-critical' : ''}" data-notice="${esc(n.domain)}">
            <p class="jv-prop-title"><strong>${esc(n.host)}</strong> <span class="jv-note">queued ${esc(when(n.createdAt))}</span></p>
            <p class="jv-approval-badges">${chips}</p>
            <fieldset class="jv-approval-pick"><legend>Send to${picked.length > 1 ? ' ' + picked.length + ' addresses, one email each' : ''}</legend>${all}${boxes}</fieldset>
            ${held ? `<p class="jv-note">${esc(held)}</p>` : ''}
            ${n.lastError ? `<p class="jv-approval-err">Last try: ${esc(n.lastError)}</p>` : ''}
            <div class="jv-prop-acts"><button type="button" data-notice-send="${esc(n.domain)}"${held || !picked.length ? ' disabled' : ''}>${picked.length > 1 ? 'Send to ' + picked.length : 'Send'}</button><button type="button" data-notice-drop="${esc(n.domain)}">Drop</button>${n.report ? `<a href="${esc(n.report)}" target="_blank" rel="noopener">Review →</a>` : ''}<a href="https://${esc(n.host)}" target="_blank" rel="noopener">Site →</a></div></li>`;
        }).join('');
        const note = N.auto ? 'Auto-send is on: a notice goes out by itself to its top address once its Live Report is public. Send or drop one here to decide now.' : 'Auto-send is off: each notice waits for you.';
        return panel('outreach-approvals', 'Approvals' + (list.length ? ' (' + list.length + ')' : ''), `<p class="jv-note">${esc(note)}</p>` + (list.length ? `<ul class="jv-approvals">${items}</ul>` : '<p class="jv-empty">No owner notices are waiting.</p>'),
            { wide: true, data: list.map((n) => ({ host: n.host, state: n.state, email: n.email, addresses: noticeAddresses(n).length, critical: n.critical, lang: n.lang, queued: n.createdAt, tries: n.tries, lastError: n.lastError })) });
    }

    function pickNotice(t) {
        const N = S.external.notices;
        const row = t.closest('[data-notice]');
        const n = N && N.notices && row && N.notices.find((x) => x.domain === row.dataset.notice);
        if (!n) return;
        if (t.dataset.noticeAll !== undefined) n.picked = t.checked ? noticeOpen(n) : [];
        else n.picked = t.checked ? noticePicks(n).concat(t.value) : noticePicks(n).filter((email) => email !== t.value);
        render();
    }

    async function decideNotice(domain, send) {
        const N = S.external.notices;
        const n = N && N.notices && N.notices.find((x) => x.domain === domain);
        const emails = n ? noticeOpen(n).filter((email) => noticePicks(n).includes(email)) : [];
        if (send && !emails.length) { toast('Pick at least one address.'); return; }
        if (send && !window.confirm(`Send the owner notice for ${domain} to ${emails.join(', ')}?${emails.length > 1 ? ' Each address gets its own email.' : ''}`)) return;
        const row = root.querySelector(`[data-notice="${CSS.escape(domain)}"]`);
        if (row) row.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
        const out = await call('notice-decide', { domain, send, email: emails }).catch((error) => ({ ok: false, error: error.message }));
        if (!out.ok) {
            if (n) n.lastError = out.error;
            render();
            toast('Not done: ' + out.error, 6000);
            return;
        }
        if (N && N.notices) N.notices = N.notices.filter((x) => x.domain !== domain);
        render();
        const failed = out.failed || [];
        if (!send) toast('Dropped ' + domain + '.', 3000);
        else toast('Sent to ' + (out.emails || [out.email]).join(', ') + '.' + (failed.length ? ' Not sent to ' + failed.map((f) => f.email + ' (' + f.error + ')').join(', ') + '.' : ''), failed.length ? 9000 : 3000);
    }

    function campStatusChip(s) {
        return `<span class="jv-chip ${s === 'active' ? 'c-fast' : s === 'paused' || s === 'draft' ? 'c-average' : s === 'completed' ? '' : 'c-slow'}">${esc(s)}</span>`;
    }

    // Activate or Pause for an Instantly campaign row from the marketing source; handled by campaignAct().
    function campaignButton(c) {
        if (c.status === 'active') return `<button type="button" class="jv-btn small" data-mk-campaign="pause" data-id="${esc(c.id)}" data-name="${esc(c.name)}" data-leads="${c.leads}">Pause</button>`;
        if (c.status === 'draft' || c.status === 'paused') return `<button type="button" class="jv-btn small" data-mk-campaign="activate" data-id="${esc(c.id)}" data-name="${esc(c.name)}" data-leads="${c.leads}" data-start="${esc(c.start)}">Activate</button>`;
        return '';
    }

    function mailboxCell(a) {
        return a.error ? `${esc(a.email)}<br><span class="jv-note">${esc(a.error)}</span> <a href="https://app.instantly.ai/app/accounts" target="_blank" rel="noopener">Reconnect →</a>` : esc(a.email);
    }

    // A KPI with its change against the period before. The All range has no period before, as on the other tabs.
    function vsBefore(label, value, prior, opts) {
        const o = opts || {};
        const k = C.kpi(label, value, (S.window || {}).prior && prior !== null && prior !== undefined ? prior : undefined, o.alert === undefined ? undefined : { alert: o.alert });
        return o.shown ? Object.assign(k, { value: o.shown(value), prior: k.prior === undefined ? undefined : o.shown(k.prior) }) : k;
    }

    function outreachView() {
        const ou = S.external.outreach;
        if (!ou || !ou.ok) return `<div class="jv-grid">${approvalsPanel()}${briefPanel('outreach')}${panel('outreach-wait', 'Outreach', waiting('outreach', 'Reading the outreach pipeline, Instantly and the plan…'))}</div>`;
        const pipe = ou.pipeline && ou.pipeline.ok ? ou.pipeline : null;
        const mail = ou.instantly && ou.instantly.ok ? ou.instantly : null;
        const mk = S.external.marketing;
        const camps = mk && mk.ok && mk.campaigns && mk.campaigns.ok ? mk.campaigns : null;
        const plan = ou.plan && ou.plan.ok !== false ? ou.plan : null;
        const th = C.thresholds((S.settings || {}).thresholds);
        const visits = outreachSeen();
        const weekly = (plan && plan.weekly) || {};
        const warm = mail && mail.accounts.length ? Math.min(...mail.accounts.map((a) => (a.score === null ? 0 : a.score))) : null;
        const was = mail && mail.prior ? mail.prior : null;
        const linked = ou.links && ou.links.ok ? ou.links : null;
        const paid = (l) => l.paid + ' · ' + l.usd + ' USD';
        const head = kpis([
            { label: 'Prospects queued', value: pipe ? pipe.queued : '—' },
            pipe ? vsBefore('Reviewed in range', pipe.reviews, pipe.priorReviews) : { label: 'Reviewed in range', value: '—' },
            { label: 'With a Live Report', value: pipe ? pipe.withLiveReport : '—' },
            mail ? vsBefore('Emails sent', mail.sent, was && was.sent) : { label: 'Emails sent', value: '—' },
            mail && mail.contacted ? vsBefore('Reply rate', mail.rates.reply, was && was.contacted ? was.rates.reply : null, { shown: (n) => n + '%', alert: mail.contacted >= 50 && mail.rates.reply < (weekly.replyPct || 0) }) : { label: 'Reply rate', value: '—' },
            mail ? vsBefore('Interested', mail.interested, was && was.interested) : { label: 'Interested', value: '—' },
            { label: 'Lowest warm-up', value: warm === null ? '—' : warm, alert: warm !== null && warm < th.outreachWarmup },
            linked ? Object.assign(vsBefore('Paid from qalabreview.com', linked.paid, linked.prior && linked.prior.paid, { alert: !linked.live }), { value: paid(linked) }, linked.prior ? { prior: paid(linked.prior) } : {}) : { label: 'Paid from qalabreview.com', value: '—' }
        ]);
        const chip = (ok, text) => `<span class="jv-chip ${ok ? 'c-fast' : 'c-slow'}">${esc(text)}</span>`;
        const days = (n) => (n === 0 ? 'today' : n > 0 ? 'in ' + n + (n === 1 ? ' day' : ' days') : Math.abs(n) + ' days ago');
        const planBody = plan ? `<ul class="jv-facts">
                <li>${plan.day > 0 ? `Day <b>${fmt(Math.min(plan.day, plan.length))}</b> of ${fmt(plan.length)}` : `Starts <b>${esc(plan.start)}</b>`}${plan.phase ? ` · <b>${esc(plan.phase.name)}</b> (ends ${esc(plan.phase.end)})` : ''}</li>
                ${plan.next ? `<li>Next milestone ${esc(days(plan.next.daysLeft))} (${esc(plan.next.date)}): <b>${esc(plan.next.label)}</b></li>` : ''}
            </ul>${table([['Deadline', (d) => esc(d.label)], ['Date', (d) => esc(d.date)], ['When', (d) => `<span class="jv-chip ${d.daysLeft <= 7 ? 'c-slow' : d.daysLeft <= th.outreachDeadlineDays ? 'c-average' : ''}">${esc(days(d.daysLeft))}</span>`]], plan.deadlines)}
            ${table([['Milestone', (m) => esc(m.label)], ['Date', (m) => esc(m.date)], ['', (m) => (m.past ? 'past' : '')]], plan.milestones)}` : waiting('outreach', '') + needList(ou);
        const ratio = (a, b) => (b ? Math.round((a / b) * 100) : null);
        const funnel = [
            { metric: 'Prospects reviewed this week', actual: pipe ? pipe.thisWeek : null, target: weekly.prospects, unit: '' },
            { metric: 'Reviewed prospects with a Live Report', actual: pipe ? ratio(pipe.reviewedWithLiveReport, Math.max(1, pipe.reviewedHosts === undefined ? pipe.swept : pipe.reviewedHosts)) : null, target: weekly.liveReportPct, unit: '%' },
            { metric: 'Open rate', actual: mail && mail.contacted ? mail.rates.open : null, target: weekly.openPct, unit: '%', off: !!(mail && mail.contacted && mail.openTracking === false) },
            { metric: 'Reply rate', actual: mail && mail.contacted ? mail.rates.reply : null, target: weekly.replyPct, unit: '%' },
            { metric: 'Positive replies', actual: mail && mail.contacted ? mail.rates.positive : null, target: weekly.positivePct, unit: '%' }
        ];
        const funnelBody = table([['Metric', (r) => esc(r.metric)], ['Now', (r) => (r.off ? '<span class="jv-note">Not tracked</span>' : r.actual === null ? '—' : chip(r.target === undefined || r.actual >= r.target, fmt(r.actual) + r.unit))], ['Target', (r) => (r.target === undefined ? '—' : fmt(r.target) + r.unit)]], funnel);
        const targets = targetsBody(S.external.targets, 'Counting the 90-day targets…');
        const pipeBody = pipe ? kpis([{ label: 'Swept', value: pipe.swept }, { label: 'Left in queue', value: pipe.left, alert: pipe.left === 0 && pipe.queued > 0 }, { label: 'Avg score', value: pipe.avgScore === null ? '—' : pipe.avgScore }]) + bars(pipe.bySegment, { color: COLORS.cyan, empty: 'No prospects queued. Add a list with scripts/sweep-outreach.js.' }) + (pipe.results.length ? bars(pipe.results, { color: COLORS.green }) : '') : waiting('outreach', '');
        const campBody = mail ? bars(mail.status, { color: COLORS.violet, empty: 'No campaigns yet.' }) + kpis([{ label: 'Contacted', value: mail.contacted }, { label: 'Opened', value: mail.opened }, { label: 'Replies', value: mail.replies }, { label: 'Meetings', value: mail.meetings }, { label: 'Bounced', value: mail.bounced, alert: mail.sent >= 20 && mail.rates.bounce >= th.outreachBouncePct }, { label: 'Unsubscribed', value: mail.unsubscribed }])
            + (camps ? table([['Campaign', (c) => esc(c.name)], ['Status', (c) => campStatusChip(c.status)], ['Starts', (c) => esc(c.start || '—')], ['Leads', (c) => fmt(c.leads)], ['Sent', (c) => fmt(c.sent)], ['Opened', (c) => fmt(c.opened)], ['Replies', (c) => fmt(c.replies)], ['Bounced', (c) => fmt(c.bounced)], ['', campaignButton]], camps.rows, 'No campaigns in Instantly yet.')
                : table([['Campaign', (c) => esc(c.name)], ['Sent', (c) => fmt(c.sent)], ['Opened', (c) => fmt(c.opened)], ['Replies', (c) => fmt(c.replies)], ['Bounced', (c) => fmt(c.bounced)]], mail.byCampaign, 'No campaign has sent yet.')) : `<p class="jv-empty">${esc((ou.instantly && ou.instantly.error) || 'Not loaded.')}</p>`;
        const boxBody = mail ? table([['Mailbox', mailboxCell], ['Status', (a) => chip(a.status === 'active', a.status)], ['Warm-up', (a) => chip(a.warmup === 'on', a.warmup)], ['Score', (a) => (a.score === null ? '—' : chip(a.score >= th.outreachWarmup, String(a.score)))], ['Daily limit', (a) => (a.dailyLimit ? fmt(a.dailyLimit) : '—')]], mail.accounts, 'No mailboxes connected.') : '';
        const dnsBody = ou.mail && ou.mail.checks ? `<ul class="jv-facts">${ou.mail.checks.map((c) => `<li>${chip(c.ok, c.name)} ${esc(c.detail)}</li>`).join('')}</ul>` : `<p class="jv-empty">${esc((ou.mail && ou.mail.error) || 'Not loaded.')}</p>`;
        const links = ou.links && ou.links.ok ? ou.links : null;
        const copyBtn = (url) => `<button class="jv-btn" type="button" data-copy-link="${esc(url)}">Copy</button>`;
        const linksBody = links ? `<p>${chip(links.live, links.live ? 'Worker live' : 'Worker not live')} <a href="${esc(links.base)}" target="_blank" rel="noopener">${esc(links.base.replace(/^https:\/\//, ''))} →</a></p>`
            + kpis([['Visits', 'visits'], ['Free reviews', 'reviews'], ['Visit → review', 'reviewRate', (n) => n + '%'], ['Paid unlocks', 'paid'], ['Review → paid', 'payRate', (n) => n + '%'], ['Revenue', 'usd', (n) => n + ' USD']]
                .map(([label, key, shown]) => vsBefore(label, links[key], links.prior ? links.prior[key] : null, { shown })))
            + bars(links.byCampaign, { color: COLORS.green, empty: 'No visits from qalabreview.com links in this range yet.' })
            + table([['Prospect', (p) => `<a href="${esc(links.base + '/' + p.host)}" target="_blank" rel="noopener">${esc(p.host)}</a>`], ['Visits', (p) => fmt(p.visits)], ['Reviews', (p) => fmt(p.reviews)], ['Paid', (p) => fmt(p.paid)], ['USD', (p) => fmt(p.usd)], ['Last visit', (p) => esc(p.last ? p.last.slice(0, 10) : '—')]], links.prospects, 'No prospect has opened a link yet.')
            + `<div class="jv-inline"><input id="jv-ql-host" type="text" placeholder="prospect.edu" aria-label="Prospect domain"><select id="jv-ql-lang" aria-label="Language">${['en', 'es', 'pt', 'de', 'fr', 'it'].map((l) => `<option>${l}</option>`).join('')}</select><button class="jv-btn" type="button" data-ql-build>Make and copy link</button> <a id="jv-ql-out" target="_blank" rel="noopener"></a></div>`
            + table([['Channel', (c) => esc(c.label)], ['Link', (c) => `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.url.replace(/^https:\/\//, ''))}</a>`], ['', (c) => copyBtn(c.url)]], links.channels)
            + `<p class="jv-note">Funnel work: ${links.funnel.map((f) => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.label)}</a>`).join(' · ')}</p>`
            : `<p class="jv-empty">${esc((ou.links && ou.links.error) || 'Not loaded.')}</p>`;
        const soc = links && links.social ? links.social : null;
        const counts = [['Clicks', (x) => fmt(x.visits)], ['Runs', (x) => fmt(x.reviews)], ['Paid', (x) => fmt(x.paid)], ['USD', (x) => fmt(x.usd)]];
        const socialBody = soc ? stats([{ label: 'Clicks', value: soc.visits }, { label: 'Free runs', value: soc.reviews }, { label: 'Paid unlocks', value: soc.paid }, { label: 'Revenue (USD)', value: soc.usd }])
            + table([['Campaign', (n) => `<strong>Report replies on ${esc(n.name)}</strong><br><span class="jv-note">${esc(n.campaign)}</span>`]].concat(counts), soc.networks, 'No click on a report reply in this range yet.')
            + table([['Post', (p) => (p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}: ${esc((p.title || p.author || p.ref).slice(0, 90))}</a>` : `${esc(p.name)} · ${esc(p.ref)}`) + `<br><span class="jv-note">${esc(p.host || '')}${p.lang ? ' · ' + esc(p.lang) : ''}</span>`]].concat(counts,
                [['Our reply', (p) => (p.replyUrl ? `<a href="${esc(p.replyUrl)}" target="_blank" rel="noopener">${esc(p.status || 'posted')} ↗</a>` : esc(p.status || '—'))]]), soc.posts, 'No click carries a post ref yet.')
            : `<p class="jv-empty">${esc((ou.links && ou.links.error) || 'Not loaded.')}</p>`;
        return head + `<div class="jv-grid">${approvalsPanel()}${briefPanel('outreach')}
            ${panel('outreach-links', 'qalabreview.com links: visits, reviews and revenue', linksBody, { wide: true, data: links ? links.prospects : [] })}
            ${panel('outreach-report-replies', 'Report replies: clicks, runs and payments', socialBody, { wide: true, data: soc, note: 'Replies under posts that name a site we reviewed link to its report through a qalabreview.com/r/ link tagged with the network (utm_campaign social-reply-bluesky, for example) and the post (utm_term). A payment counts for the reply whose link started the run it unlocked. The drafts and their approval are on the Engagement tab.' })}
            ${panel('outreach-plan', '90-day plan', planBody)}
            ${panel('outreach-funnel', 'Weekly funnel against the plan', funnelBody, { data: funnel })}
            ${panel('outreach-targets', '90-day targets', targets, { wide: true, data: S.external.targets && S.external.targets.targets, note: 'Jarvis counts from the plan start and judges the pace; the marker shows how much of the 90 days has gone. Log what he cannot see.' })}
            ${panel('outreach-pipeline', 'Prospect pipeline (nightly sweep)', pipeBody, { data: pipe ? pipe.bySegment : [] })}
            ${panel('outreach-campaigns', 'Campaigns (Instantly)', campBody, { data: camps ? camps.rows : mail ? mail.byCampaign : [], note: camps ? 'Activate starts a campaign on its start date and sending window; nothing goes out to a campaign with no leads. Pause stops it at once.' : '' })}
            ${mail ? panel('outreach-mailboxes', 'Mailboxes and warm-up', boxBody, { data: mail.accounts }) : ''}
            ${panel('outreach-dns', `Sending domain${ou.mail && ou.mail.domain ? ' (' + esc(ou.mail.domain) + ')' : ''}`, dnsBody)}
            ${listPanel('outreach', 'visits', 'Visits from outreach links', visits.campaigns, { color: COLORS.green, empty: 'No visits tagged utm_source=outreach in this range yet.' })}
        </div>${needList(ou)}`;
    }

    function socialVisits() {
        const sources = [].concat(((S.summaries.cv || {}).lists || {}).sources || [], ((S.summaries.review || {}).lists || {}).sources || []).filter((r) => SOCIAL.test(r.label));
        const visits = {};
        sources.forEach((r) => { const k = r.label.replace(/\s*\(.*\)$/, ''); visits[k] = (visits[k] || 0) + r.value; });
        return Object.keys(visits).map((label) => ({ label, value: visits[label] })).sort((a, b) => b.value - a.value);
    }

    // GA4 "source / medium" rows grouped into the channels marketing works on.
    function channelOf(label) {
        const l = String(label || '').toLowerCase();
        if (/outreach|instantly|qalabreview/.test(l)) return 'Outreach';
        if (/(^|[\s/])(e-?mail|newsletter|sendgrid)/.test(l)) return 'Email';
        if (SOCIAL.test(l) || /social|hub/.test(l)) return 'Social';
        if (/organic|google|bing|duckduckgo|brave|yahoo|ecosia|yandex|baidu|search/.test(l)) return 'Search';
        if (/direct|\(none\)/.test(l)) return 'Direct';
        return 'Referral';
    }

    // Day-by-day series that share one set of dates; days missing from a source count as 0.
    function align(sources) {
        const labels = Array.from(new Set(sources.flatMap((x) => x.rows.map((r) => r.date)))).sort();
        return { labels, series: sources.map((x) => { const by = {}; x.rows.forEach((r) => { by[r.date] = (by[r.date] || 0) + (Number(r[x.key]) || 0); }); return { name: x.name, color: x.color, values: labels.map((d) => by[d] || 0) }; }) };
    }

    const MK_LINKS = [
        ['Instantly campaigns', 'https://app.instantly.ai/app/campaigns'], ['Instantly Unibox', 'https://app.instantly.ai/app/unibox'], ['Instantly mailboxes', 'https://app.instantly.ai/app/accounts'],
        ['Outlook (qalabreview.com)', 'https://outlook.office.com/mail/'], ['Microsoft 365 admin', 'https://admin.cloud.microsoft/'], ['Cloudflare', 'https://dash.cloudflare.com/'],
        ['Buffer', 'https://publish.buffer.com/'], ['YouTube Studio', 'https://studio.youtube.com/'], ['TikTok Studio', 'https://www.tiktok.com/tiktokstudio'],
        ['LinkedIn', 'https://www.linkedin.com/mynetwork/'], ['Meta Business Suite', 'https://business.facebook.com/'], ['Social hub', 'qa-review-social.html'],
        ['GA4', LINKS[4][1]], ['Search Console', LINKS[5][1]], ['qalabreview.com', 'https://qalabreview.com/']
    ];
    const LEAD_EDITABLE = ['first_name', 'last_name', 'title', 'top_finding', 'best_point', 'peer_1', 'peer_2', 'regulation_line', 'course_or_programme', 'month', 'one_line_from_lecture_kit'];
    const MK_SEGMENTS = ['university', 'tvet', 'agency', 'startup', 'company', 'other'];

    // Marketing (#1722): every marketing number on one page, from the outreach, marketing, social, email, search,
    // money and GA4 sources plus the hub stats and site events, with the buttons that act on them.
    function marketingView() {
        const e = S.external;
        const th = C.thresholds((S.settings || {}).thresholds);
        const ou = e.outreach && e.outreach.ok ? e.outreach : {};
        const mk = e.marketing && e.marketing.ok ? e.marketing : {};
        const pipe = ou.pipeline && ou.pipeline.ok ? ou.pipeline : null;
        const mail = ou.instantly && ou.instantly.ok ? ou.instantly : null;
        const plan = ou.plan && ou.plan.ok !== false && ou.plan.start ? ou.plan : null;
        const camps = mk.campaigns && mk.campaigns.ok ? mk.campaigns : null;
        const pros = mk.prospects && mk.prospects.ok ? mk.prospects : null;
        const notes = mk.notes && mk.notes.ok ? mk.notes : null;
        const sent = mk.sent && mk.sent.ok ? mk.sent : null;
        const so = e.social && e.social.ok ? e.social : null;
        const em = e.email && e.email.ok ? e.email : null;
        const gsc = e.search && e.search.console && e.search.console.ok ? e.search.console : null;
        const brave = e.search && e.search.brave && e.search.brave.ok ? e.search.brave : null;
        const mo = e.money && e.money.ok ? e.money : null;
        const ga = e.ga4 && e.ga4.ok ? e.ga4 : null;
        const hub = S.summaries.hub || { totals: {}, lists: {} };
        const outVisits = outreachSeen();
        const social = socialVisits();
        const socialTotal = social.reduce((n, r) => n + r.value, 0);
        const weekly = (plan && plan.weekly) || {};
        const now = Date.now();
        const daysTo = (d) => (d ? Math.ceil((Date.parse(d + 'T12:00:00Z') - now) / C.DAY) : null);
        const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
        const dash = (v) => (v === null || v === undefined ? '—' : v);
        const wait = (key, text) => (S.pending[key] && !e[key] ? `<p class="jv-empty">${esc(text)}</p>` : `<p class="jv-empty">${esc((e[key] && e[key].error) || 'Not loaded.')}</p>`);
        const warm = mail && mail.accounts.length ? Math.min(...mail.accounts.map((a) => (a.score === null ? 0 : a.score))) : null;
        const checks = ou.mail && ou.mail.checks ? ou.mail.checks : null;

        const counts = [{ label: 'First cold emails go out', date: camps ? camps.firstStart : '', days: camps ? daysTo(camps.firstStart) : null }]
            .concat(plan && plan.next ? [{ label: 'Next milestone: ' + plan.next.label, date: plan.next.date, days: plan.next.daysLeft }] : [])
            .concat(plan ? plan.deadlines.map((d) => ({ label: d.label, date: d.date, days: d.daysLeft })) : [])
            .concat(plan ? [{ label: '90-day plan ends', date: plan.end, days: daysTo(plan.end) }] : []);

        const head = countdown(counts) + kpis([
            { label: 'Marketing visits', value: socialTotal + outVisits.total },
            { label: 'Social posts', value: so ? so.sent : '—', alert: so && so.failed > 0 },
            (hub.kpis || [])[0] || { label: 'Hub + post views', value: '—' },
            { label: 'YouTube views', value: so && so.youtube && so.youtube.views !== null && so.youtube.views !== undefined ? so.youtube.views : '—' },
            pipe ? vsBefore('Prospects reviewed', pipe.reviews, pipe.priorReviews) : { label: 'Prospects reviewed', value: '—' },
            { label: 'Cold emails sent', value: mail ? mail.sent : '—' },
            { label: 'Replies', value: mail ? mail.replies : '—' },
            { label: 'Meetings', value: mail ? mail.meetings : '—' },
            { label: 'Follow-up notes', value: notes ? notes.sent : '—' },
            { label: 'Google clicks', value: gsc ? gsc.clicks : '—' },
            { label: 'Revenue (USD)', value: mo ? mo.revenue.usd : '—' }
        ]);

        const rings = [
            [plan && plan.day > 0 ? pct(Math.min(plan.day, plan.length), plan.length) : null, 'plan', COLORS.violet],
            [pipe && weekly.prospects ? Math.min(100, pct(pipe.thisWeek, weekly.prospects)) : null, 'week pace'],
            [pipe ? pct(pipe.withLiveReport, pipe.queued) : null, 'live reports'],
            [warm, 'warm-up'],
            [checks ? pct(checks.filter((c) => c.ok).length, checks.length) : null, 'domain'],
            [so && so.sent + so.failed ? pct(so.sent, so.sent + so.failed) : null, 'social ok'],
            [em && em.rates.delivered !== null ? em.rates.delivered : null, 'delivered']
        ].map(([v, label, color]) => ring(v, label, color, 92)).join('');

        const channels = ga ? Object.entries(ga.sources.reduce((m, r) => { const k = channelOf(r.label); m[k] = (m[k] || 0) + r.value; return m; }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) : [];

        const steps = [
            { label: 'Prospects queued', value: pipe ? pipe.queued : 0 }, { label: 'Reviewed by the sweep', value: pipe ? pipe.swept : 0 },
            { label: 'With a Live Report', value: pipe ? pipe.withLiveReport : 0 }, { label: 'Leads in campaigns', value: camps ? camps.leads : 0 },
            { label: 'Contacted', value: mail ? mail.contacted : 0 }, { label: 'Opened', value: mail ? mail.opened : 0 },
            { label: 'Replied', value: mail ? mail.replies : 0 }, { label: 'Interested', value: mail ? mail.interested : 0 }, { label: 'Meetings', value: mail ? mail.meetings : 0 }
        ];

        const output = align([
            { name: 'Social posts', color: COLORS.violet, rows: so ? so.daily : [], key: 'posts' },
            { name: 'Prospects reviewed', color: COLORS.cyan, rows: pipe ? pipe.daily : [], key: 'reviews' },
            { name: 'Follow-up notes', color: COLORS.amber, rows: notes ? notes.daily : [], key: 'sent' }
        ]);
        const response = align([
            { name: 'GA4 sessions', color: COLORS.cyan, rows: ga ? ga.daily : [], key: 'sessions' },
            { name: 'Google clicks', color: COLORS.green, rows: gsc ? gsc.daily || [] : [], key: 'clicks' },
            { name: 'Revenue (USD)', color: COLORS.amber, rows: mo ? mo.daily : [], key: 'usd' }
        ]);

        const statusChip = campStatusChip;
        const campBody = camps ? table([
            ['Campaign', (c) => `<strong>${esc(c.name)}</strong>`], ['Status', (c) => statusChip(c.status)], ['Starts', (c) => esc(c.start || '—')], ['Window', (c) => `<span class="jv-note">${esc(c.window)}</span>`],
            ['Steps', (c) => fmt(c.steps)], ['Leads', (c) => fmt(c.leads)], ['Sent', (c) => fmt(c.sent)], ['Opened', (c) => fmt(c.opened)], ['Replies', (c) => fmt(c.replies)], ['Bounced', (c) => (c.bounced ? `<span class="jv-chip c-slow">${fmt(c.bounced)}</span>` : '0')], ['', campaignButton]
        ], camps.rows, 'No campaigns in Instantly yet.') : `<p class="jv-empty">${esc((mk.campaigns && mk.campaigns.error) || (S.pending.marketing ? 'Asking Instantly for the campaigns…' : 'Not loaded.'))}</p>`;

        const boxes = mail && mail.accounts.length ? `<div class="jv-rings">${mail.accounts.map((a) => ring(a.score, a.email.split('@')[0], a.score !== null && a.score >= th.outreachWarmup ? COLORS.green : null, 92)).join('')}</div>` + table([['Mailbox', mailboxCell], ['Status', (a) => statusChip(a.status)], ['Warm-up', (a) => `<span class="jv-chip ${a.warmup === 'on' ? 'c-fast' : 'c-slow'}">${esc(a.warmup)}</span>`], ['Daily limit', (a) => (a.dailyLimit ? fmt(a.dailyLimit) : '—')]], mail.accounts) : ou.instantly && ou.instantly.ok === false ? `<p class="jv-empty">${esc(ou.instantly.error)}</p>` : wait('outreach', 'Reading the mailboxes…');
        const dns = checks ? `<ul class="jv-facts">${checks.map((c) => `<li><span class="jv-chip ${c.ok ? 'c-fast' : 'c-slow'}">${esc(c.name)}</span> ${esc(c.detail)}</li>`).join('')}</ul>` : wait('outreach', 'Checking the sending domain…');
        const targets = targetsBody(e.targets, 'Counting the 90-day targets…');
        const weeklyRows = [
            { metric: 'Prospects reviewed this week', now: pipe ? pipe.thisWeek : null, target: weekly.prospects, unit: '' },
            { metric: 'Open rate', now: mail && mail.contacted && mail.openTracking !== false ? mail.rates.open : null, target: weekly.openPct, unit: '%', off: !!(mail && mail.contacted && mail.openTracking === false) },
            { metric: 'Reply rate', now: mail && mail.contacted ? mail.rates.reply : null, target: weekly.replyPct, unit: '%' },
            { metric: 'Positive replies', now: mail && mail.contacted ? mail.rates.positive : null, target: weekly.positivePct, unit: '%' }
        ];
        const weeklyBody = weeklyRows.map((r) => `<div class="jv-vs"><span>${esc(r.metric)}</span><span class="jv-meter"><i style="width:${r.now === null || !r.target ? 0 : Math.min(100, pct(r.now, r.target))}%"></i></span><b>${r.off ? 'Not tracked' : r.now === null ? '—' : fmt(r.now) + r.unit}</b><small>of ${r.target === undefined ? '—' : fmt(r.target) + r.unit}</small></div>`).join('');

        const soResults = so ? [{ label: 'sent', value: so.sent }, { label: 'failed', value: so.failed }].concat(so.scheduled && so.scheduled.count ? [{ label: 'scheduled', value: so.scheduled.count }] : []) : [];
        const yt = so && so.youtube ? (so.youtube.videos || []).filter((v) => v.views !== undefined).map((v) => ({ label: String(v.title || v.id).slice(0, 48), value: v.views })).sort((a, b) => b.value - a.value) : [];
        const grid = S.socialHeat || C.socialHeat([]);
        const queries = gsc ? (gsc.queries || []).map((q) => ({ label: q.query, value: q.clicks })).filter((q) => q.value > 0) : [];
        const ranks = brave ? brave.queries.map((q) => `<span class="jv-chip ${q.position && q.position <= 3 ? 'c-fast' : q.position && q.position <= 10 ? 'c-average' : 'c-slow'}" title="${esc(q.leader || '')}">${esc(q.query)} · ${q.position ? '#' + q.position : 'not in top ' + (brave.depth || 20)}</span>`).join(' ') : '';
        const notices = e.notices && e.notices.notices ? e.notices.notices.length : 0;

        const f = S.mkForm;
        const deck = `<div class="jv-deck">
            <div><h4>Outreach</h4>
              <form class="jv-mk-form" data-mk-queue><textarea name="hosts" rows="3" data-mk-field="hosts" data-keep="mk-hosts" placeholder="One site per line: host, country, segment (example.edu.co, co, university)" aria-label="Prospects to queue">${esc(f.hosts || '')}</textarea>
                <div class="jv-inline"><input name="cc" data-mk-field="cc" data-keep="mk-cc" value="${esc(f.cc || '')}" maxlength="2" placeholder="cc" aria-label="Default country, two letters" style="max-width:4.5rem"><select name="sector" data-mk-field="sector" aria-label="Default segment" data-menu-ready="1">${MK_SEGMENTS.map((s) => `<option value="${s}"${s === (f.sector || MK_SEGMENTS[0]) ? ' selected' : ''}>${s}</option>`).join('')}</select><button type="submit" class="jv-btn">Queue for the sweep</button></div></form>
              <form class="jv-inline" data-mk-review><input name="url" data-mk-field="url" data-keep="mk-url" value="${esc(f.url || '')}" placeholder="https://prospect.example — review it now" aria-label="URL to review now"><button type="submit" class="jv-btn">Review now</button></form>
              <form class="jv-inline" data-mk-block><input name="address" data-mk-field="address" data-keep="mk-address" value="${esc(f.address || '')}" placeholder="email or domain that must never get mail" aria-label="Address or domain to block"><button type="submit" class="jv-btn danger">Block</button></form>
              <div class="jv-actions"><button type="button" class="jv-btn" data-run="sweepReviews">Run the sweep now</button><button type="button" class="jv-btn" data-go="outreach">Owner notices${notices ? ' (' + notices + ')' : ''}</button><button type="button" class="jv-btn" data-act="mk-reload">Reload the numbers</button></div></div>
            <div><h4>Social</h4><div class="jv-actions">
              <button type="button" class="jv-btn" data-act="social-post-now"${S.pending['social-post-now'] ? ' disabled' : ''}>Post the queues now</button><button type="button" class="jv-btn" data-run-action="publish-hub">Publish the hub</button>
              <button type="button" class="jv-btn" data-run="refreshSocialHubStats">Refresh hub stats</button><button type="button" class="jv-btn" data-run="dispatchFacebookQueue">Dispatch the Facebook queue</button>
              <button type="button" class="jv-btn" data-go="hub">Share a post</button></div></div>
            <div><h4>Reports</h4><div class="jv-actions">
              <button type="button" class="jv-btn" data-report="review:weekly">Send the weekly report</button><button type="button" class="jv-btn" data-act="ai-brief">Gemini briefing</button><button type="button" class="jv-btn" data-act="export-csv">Export this tab (CSV)</button></div></div>
          </div>`;

        const sy = e['marketing-sync'] && e['marketing-sync'].ok ? e['marketing-sync'] : null;
        const syWait = wait('marketing-sync', 'Reading the outreach sync…');
        const cmds = sy ? sy.commands.items : [];
        const pendingFor = (action, key) => cmds.some((c) => c.status === 'pending' && c.action === action && c.label.includes(key));
        const cmdBtn = (label, data, opts) => `<button type="button" class="jv-btn small${(opts && opts.cls) || ''}" data-mk-cmd="${esc(data.action)}" ${Object.entries(data).filter(([k]) => k !== 'action').map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}${opts && opts.disabled ? ' disabled' : ''}>${esc(label)}</button>`;
        const lw = sy ? sy.leads.weeks : [];
        const week = lw.find((w) => w.week === S.mkWeek) || lw.filter((w) => w.uploaded < w.total).pop() || lw[lw.length - 1] || null;
        const leadOrder = (r) => (r.uploaded ? 5 : r.dropped ? 4 : r.approved ? 3 : r.ask ? 0 : r.missing ? 2 : 1);
        const weekRows = sy && week ? sy.leads.rows.filter((r) => r.week === week.week).sort((a, b) => leadOrder(a) - leadOrder(b)) : [];
        const doneRows = weekRows.filter((r) => r.uploaded || r.dropped).length;
        const leadRows = S.mkDone ? weekRows : weekRows.filter((r) => !r.uploaded && !r.dropped);
        const leadFix = (r) => {
            const miss = String(r.missing || '').split(';').map((m) => m.trim()).filter(Boolean);
            const who = { week: r.week, email: r.email };
            const out = [];
            if (miss.some((m) => /^report\b/.test(m))) out.push(`<button type="button" class="jv-btn small" data-mk-rereview="${esc(r.host)}" data-lang="${esc(r.language || 'en')}">Review again</button>`);
            if (miss.includes('email (personal address)')) out.push(cmdBtn('Allow address', Object.assign({ action: 'allow-personal' }, who)));
            miss.map((m) => (m === 'top_finding (translate)' ? 'top_finding' : m)).filter((m) => LEAD_EDITABLE.includes(m) && !(miss.some((x) => /^report\b/.test(x)) && ['top_finding', 'best_point'].includes(m)))
                .forEach((f) => out.push(cmdBtn('Set ' + f.replace(/_/g, ' '), Object.assign({ action: 'lead-set', field: f, current: f === 'top_finding' ? r.top_finding || r.top_finding_en || '' : '' }, who))));
            out.push(cmdBtn('Drop', Object.assign({ action: 'lead-drop', on: 'yes' }, who), { cls: ' danger' }));
            return `<div class="jv-actions">${out.join('')}</div>`;
        };
        const leadAct = (r) => r.uploaded ? `<span class="jv-chip c-fast">uploaded ${esc(r.uploaded)}</span>`
            : cmds.some((c) => c.status === 'pending' && c.label.includes(r.email)) ? '<span class="jv-chip c-average">waiting for the sync</span>'
            : r.dropped ? '<span class="jv-chip">dropped</span> ' + cmdBtn('Bring back', { action: 'lead-drop', week: r.week, email: r.email, on: 'no' })
            : r.approved ? cmdBtn('Unapprove', { action: 'approve', week: r.week, email: r.email, on: 'no' })
            : r.ask ? `<span class="jv-chip c-slow">needs you</span> <span class="jv-note">${esc(r.ask)}</span>${leadFix(r)}`
            : r.missing ? `<span class="jv-chip c-average" title="${esc(r.missing)}">Jarvis</span> <span class="jv-note">${esc(r.wait || 'Jarvis is on it.')}</span>${leadFix(r)}`
            : cmdBtn('Approve', { action: 'approve', week: r.week, email: r.email, on: 'yes' });
        const leadsBody = !sy ? syWait : !lw.length ? '<p class="jv-empty">No leads files yet; the weekday leads job writes them.</p>'
            : `<div class="jv-chips">${lw.map((w) => `<button type="button" class="jv-btn small" aria-pressed="${week && w.week === week.week}" data-mk-week="${esc(w.week)}">${esc(w.week)} · ${w.uploaded}/${w.total}</button>`).join(' ')}</div>`
            + stats([{ label: 'Leads', value: week.total }, { label: 'Complete', value: week.complete }, { label: 'Missing something', value: week.missing }, { label: 'Needs you', value: week.ask || 0, alert: week.ask > 0 }, { label: 'Approved', value: week.approved }, { label: 'Uploaded', value: week.uploaded }, { label: 'Ready to upload', value: week.ready }])
            + `<div class="jv-actions">${cmdBtn(`Approve every complete lead in ${week.week}`, { action: 'approve-week', week: week.week }, { disabled: week.complete <= week.approved + week.uploaded })}${cmdBtn(`Upload ${week.ready} approved to Instantly`, { action: 'upload', week: week.week }, { cls: ' is-primary', disabled: !week.ready || pendingFor('upload', week.week) })}</div>`
            + table([['Lead', (r) => `<strong>${esc([r.first_name, r.last_name].filter(Boolean).join(' ') || r.email)}</strong><br><span class="jv-note">${esc(r.title || r.email)}</span>`], ['Organisation', (r) => `${esc(r.org)}<br><span class="jv-note">${esc(r.host)} · ${esc(String(r.cc).toUpperCase())}</span>`],
                ['Campaign', (r) => `<span class="jv-note">${esc(r.campaign)}</span>`], ['Score', (r) => esc(r.score || '—')], ['Top finding', (r) => `<span class="jv-note">${esc(String(r.top_finding || r.top_finding_en || '').slice(0, 120))}</span>`],
                ['Report', (r) => (r.live_report_url ? `<a href="${esc(r.live_report_url)}" target="_blank" rel="noopener">open</a>` : '—')], ['Missing', (r) => (r.missing ? `<span class="jv-note">${esc(r.missing)}</span>` : '')], ['', leadAct]], leadRows, doneRows ? 'Every lead in this week is uploaded or dropped.' : 'No leads in this week.')
            + (doneRows ? `<div class="jv-actions"><button type="button" class="jv-btn" data-mk-done="${S.mkDone ? 'off' : 'on'}">${S.mkDone ? 'Hide' : 'Show'} ${doneRows} done (uploaded or dropped)</button></div>` : '');
        const repliesTodo = sy ? sy.replies.filter((r) => !r.sent && r.draft) : [];
        const repliesBody = !sy ? syWait : !sy.replies.length ? `<p class="jv-empty">No replies in the last 14 days${camps && camps.firstStart ? '; the first emails go out ' + esc(camps.firstStart) : ''}.</p>`
            : `${pie(Object.entries(sy.replies.reduce((m, r) => { const k = r.category || 'not sorted'; m[k] = (m[k] || 0) + 1; return m; }, {})).map(([label, value]) => ({ label, value })), { unit: 'replies' })}<ul class="jv-mk-replies">${sy.replies.map((r) => `<li>
                <div class="jv-goal-head"><span><strong>${esc(r.from)}</strong> · <span class="jv-note">${esc(r.campaign)} · ${esc(when(r.at))}</span></span>${r.category ? `<span class="jv-chip ${/interest/.test(r.category) ? 'c-fast' : /opt|bounce/.test(r.category) ? 'c-slow' : 'c-average'}">${esc(r.category)}</span>` : ''}</div>
                ${r.summary ? `<p>${esc(r.summary)}</p>` : ''}<details><summary>${esc(r.subject || 'Their email')}</summary><pre class="jv-pre">${esc(r.text)}</pre></details>
                ${r.sent ? `<p class="jv-note">Answered ${esc(when(r.sent))}.</p>` : `<textarea rows="5" data-keep="mk-reply-${esc(r.id)}" data-mk-draft="${esc(r.id)}" aria-label="Answer to ${esc(r.from)}">${esc(S.mkDrafts[r.id] !== undefined ? S.mkDrafts[r.id] : r.draft)}</textarea>
                <div class="jv-actions"><button type="button" class="jv-btn small is-primary" data-mk-reply="${esc(r.id)}" data-to="${esc(r.from)}">Send in the same thread</button>${cmdBtn('Do not contact', { action: 'dnc', value: r.from, reason: 'asked from a reply' }, { cls: ' danger' })}</div>`}</li>`).join('')}</ul>`;
        const sentWhat = (r) => [r.replied ? '<span class="jv-chip c-fast">replied</span>' : '', r.bounced ? '<span class="jv-chip c-slow">bounced</span>' : '', r.unsubscribed ? '<span class="jv-chip c-slow">unsubscribed</span>' : '',
            r.opened ? `<span class="jv-chip c-average">opened ${fmt(r.opened)}×</span>` : '', !r.replied && !r.bounced && !r.unsubscribed && !r.opened ? '<span class="jv-note">no open yet</span>' : '',
            ...r.resent.map((x) => `<br><span class="jv-note">sent again to ${esc(x.to)} ${esc(when(x.at))}</span>`)].filter(Boolean).join(' ');
        const sentAct = (r) => (r.replied || r.unsubscribed ? '' : `<div class="jv-actions">${r.bounced ? '' : `<button type="button" class="jv-btn small" data-mk-resend="${esc(r.id)}" data-to="${esc(r.to)}">Send again</button>`}<button type="button" class="jv-btn small" data-mk-resend="${esc(r.id)}" data-to="${esc(r.to)}" data-org="${esc(r.org)}" data-other="1">To someone else</button></div>`);
        const sentBody = !sent ? (mk.sent ? `<p class="jv-empty">${esc(mk.sent.error || 'Not loaded.')}</p>` : wait('marketing', 'Asking Instantly…'))
            : stats([{ label: 'Sent', value: sent.total }, { label: 'Opened', value: sent.opened }, { label: 'Replied', value: sent.replied }, { label: 'Bounced', value: sent.bounced, alert: sent.bounced > 0 }])
            + table([['Sent', (r) => esc(when(r.at))], ['To', (r) => `<strong>${esc(r.name || r.to)}</strong><br><span class="jv-note">${esc(r.name ? r.to : '')}${r.name ? ' · ' : ''}${esc(r.org)}</span>`],
                ['Campaign', (r) => `<span class="jv-note">${r.kind === 'resend' ? 'sent again from Jarvis' : esc(r.campaign) + (r.step ? ' · step ' + r.step : '')}<br>from ${esc(r.from)}</span>`], ['Subject', (r) => `<span class="jv-note">${esc(r.subject)}</span>`],
                ['Since', sentWhat], ['', sentAct]], sent.rows, `No cold email has gone out yet${camps && camps.firstStart ? '; the first goes out ' + esc(camps.firstStart) : ''}.`);
        const li = sy ? sy.linkedin : null;
        const liSent = li ? li.items.filter((p) => p.sent).length : 0;
        const linkedinBody = !sy ? syWait : !li.items.length ? '<p class="jv-empty">No LinkedIn list yet; the outreach sync writes one each working day from 07:00 Bogotá time, with up to 15 prospects never listed before.</p>'
            : (() => {
                const liRow = (p) => {
                    const note = C.linkedinLine(p, 'Note');
                    const check = C.linkedinLine(p, 'Check first');
                    const send = !p.sent && p.profile;
                    const act = pendingFor('linkedin', p.name) ? '<span class="jv-chip c-average">waiting for the sync</span>'
                        : send ? `<button type="button" class="jv-btn small is-primary" data-li-send="${esc(p.profile)}" data-date="${esc(li.date)}" data-name="${esc(p.name)}" data-note="${esc(note)}">Send</button>`
                        : cmdBtn(p.sent ? 'Not sent' : 'Mark sent', { action: 'linkedin', date: li.date, name: p.name, sent: p.sent ? 'no' : 'yes' });
                    return `<li><span class="jv-chip ${p.sent ? 'c-fast' : ''}">${p.sent ? 'sent' : 'to send'}</span> <strong>${esc(p.name)}</strong>, ${esc(p.title)} <span class="jv-note">(${esc(p.org)}, ${esc(p.cc)})</span>
                ${!p.sent && check ? `<br><span class="jv-chip c-average">Check first: ${esc(check)}</span>` : ''}${!p.sent && note ? `<br><span class="jv-note">Note: ${esc(note)}</span>` : ''}${!p.sent && (check || note) ? '<br>' : ''}${p.profile && !send ? `<a class="jv-btn small" href="${esc(p.profile)}" target="_blank" rel="noopener">Profile</a>` : ''}${act}</li>`;
                };
                const toSend = li.items.filter((p) => !p.sent);
                const sentRows = li.items.filter((p) => p.sent);
                return `<div class="jv-rings">${ring(pct(liSent, li.items.length), liSent + ' of ' + li.items.length + ' sent', COLORS.cyan, 92)}</div>`
                    + (toSend.length ? `<ul class="jv-facts" data-li-todo>${toSend.map(liRow).join('')}</ul>` : `<p class="jv-empty" data-li-done>All ${li.items.length} sent. The next list comes the next working day at 07:00 Bogotá time.</p>`)
                    + (sentRows.length ? `<details class="jv-li-sent"><summary>Sent${li.date === new Date().toLocaleDateString('en-CA') ? ' today' : ''} · ${sentRows.length}</summary><ul class="jv-facts">${sentRows.map(liRow).join('')}</ul></details>` : '');
            })();
        const dncBody = !sy ? syWait : stats([{ label: 'Never contact', value: sy.dnc.length }]) + (sy.dnc.length ? table([['Address or domain', (d) => esc(d.value)], ['Added', (d) => esc(d.at)], ['Why', (d) => `<span class="jv-note">${esc(d.reason)}</span>`]], sy.dnc.slice(-12).reverse()) : '<p class="jv-empty">Nobody has asked to stop yet.</p>')
            + `<form class="jv-inline" data-mk-dnc><input name="addr" data-mk-field="dnc" data-keep="mk-dnc" value="${esc(f.dnc || '')}" placeholder="email or domain" aria-label="Address or domain to never contact"><input name="reason" data-mk-field="dncWhy" data-keep="mk-dnc-why" value="${esc(f.dncWhy || '')}" placeholder="why (optional)" aria-label="Why"><button type="submit" class="jv-btn danger">Add and block</button></form>`;
        const jobsBody = !sy ? syWait : table([['Job', (j) => `<strong>${esc(j.mode)}</strong>`], ['Last run', (j) => (j.at ? esc(when(j.at)) : 'never')], ['Result', (j) => (j.failed ? '<span class="jv-chip c-slow">failed</span> ' : '') + `<span class="jv-note">${esc(j.notify || '')}</span>` + (j.tail.length ? `<details><summary>log</summary><pre class="jv-pre">${esc(j.tail.join('\n'))}</pre></details>` : '')],
            ['', (j) => (pendingFor('run', j.mode) ? '<span class="jv-chip c-average">waiting for the sync</span>' : cmdBtn('Run now', { action: 'run', job: j.mode }, { disabled: sy.running }))]], sy.jobs)
            + (sy.paused.length ? `<p class="jv-note">Paused for public holidays: ${sy.paused.map((p) => esc(p.name)).join(', ')}.</p>` : '');
        const syncBody = !sy ? syWait : `${stats([{ label: 'Last sync', value: sy.at ? when(sy.at) : 'never', alert: sy.stale }, { label: 'Waiting for the sync', value: sy.commands.pending, alert: sy.stale && sy.commands.pending > 0 }, { label: 'Job', value: sy.running ? 'running' : 'idle' }])}`
            + (cmds.length ? table([['Command', (c) => esc(c.label)], ['Asked', (c) => esc(when(c.createdAt))], ['Status', (c) => `<span class="jv-chip ${c.status === 'done' ? 'c-fast' : c.status === 'failed' ? 'c-slow' : 'c-average'}">${esc(c.status)}</span>`], ['Result', (c) => `<span class="jv-note">${esc(c.result)}</span>`]], cmds.slice(0, 10)) : '<p class="jv-empty">No commands sent yet.</p>');
        const kpiRows = sy ? sy.kpis : [];
        const kpiCols = ['new_prospects', 'emails_sent', 'linkedin_requests', 'positive_replies', 'calls', 'paid_reviews', 'revenue_usd'];
        const kpiBody = !sy ? syWait : kpiRows.length ? table([['Week', (r) => esc(r.week_start)]].concat(kpiCols.map((k) => [k.replace(/_/g, ' '), (r) => esc(r[k] || '—')])).concat([['Notes', (r) => `<span class="jv-note">${esc(r.notes || '')}</span>`]]), kpiRows.slice().reverse()) : '<p class="jv-empty">The weekly KPI tracker is empty.</p>';

        return head + kpis([
            { label: 'Leads approved', value: lw.length ? lw.reduce((n, w) => n + w.approved, 0) : '—' },
            { label: 'Ready to upload', value: lw.length ? lw.reduce((n, w) => n + w.ready, 0) : '—' },
            { label: 'Replies to answer', value: sy ? repliesTodo.length : '—', alert: repliesTodo.length > 0 },
            { label: 'LinkedIn sent today', value: li ? liSent + ' / ' + li.items.length : '—' },
            { label: 'Do not contact', value: sy ? sy.dnc.length : '—' },
            { label: 'Outreach synced', value: sy && sy.at ? when(sy.at) : '—', alert: !!(sy && sy.stale) }
        ]) + `<div class="jv-grid">
            ${panel('marketing-sync', 'Outreach sync', syncBody, { data: cmds, note: 'The qa-lab-outreach Action runs what you ask here within a few minutes, and uploads the outreach folder after each job and every 3 hours. Replies and blocks go to Instantly at once.' })}
            ${panel('marketing-jobs', 'Outreach jobs', jobsBody, { data: sy && sy.jobs })}
            ${panel('marketing-leads', `Leads to approve${week ? ' · ' + esc(week.week) : ''}`, leadsBody, { wide: true, data: weekRows, note: 'With each outreach sync (at most once an hour) Jarvis translates top findings, re-runs the review of a site with no Live Report (twice at most) and approves complete leads. Rows marked "needs you" are the ones it cannot settle: use their buttons. Upload stays with you: the Mac sends the approved rows to their Instantly campaigns.' })}
            ${panel('marketing-replies', `Replies${repliesTodo.length ? ' · ' + repliesTodo.length + ' to answer' : ''}`, repliesBody, { wide: true, data: sy && sy.replies.map((r) => ({ at: r.at, from: r.from, campaign: r.campaign, category: r.category, sent: r.sent })) })}
            ${panel('marketing-sent', `Cold emails sent${sent ? ' · ' + fmt(sent.total) : ''}`, sentBody, { wide: true, data: sent && sent.rows.map((r) => ({ at: r.at, to: r.to, name: r.name, org: r.org, campaign: r.campaign, step: r.step, kind: r.kind, from: r.from, subject: r.subject, opened: r.opened, replied: r.replied, bounced: r.bounced, unsubscribed: r.unsubscribed, resent: r.resent.map((x) => x.to + ' ' + x.at).join('; ') })), note: 'Send again forwards the same email, with its original text, from the mailbox that sent it: to the same address when it may have got lost, or to another contact at the organisation. Nobody on Do not contact can be picked.' })}
            ${panel('marketing-linkedin', `LinkedIn${li && li.date ? ' · ' + esc(li.date) : ''}`, linkedinBody, { data: li && li.items.map((p) => ({ name: p.name, org: p.org, cc: p.cc, sent: p.sent })) })}
            ${panel('marketing-dnc', 'Do not contact', dncBody, { data: sy && sy.dnc })}
            ${panel('marketing-kpis', 'Weekly KPI tracker', kpiBody, { wide: true, data: kpiRows })}
            ${panel('marketing-health', 'Marketing health', `<div class="jv-rings">${rings}</div>`, { wide: true, note: 'Plan elapsed, prospects reviewed against the weekly target, queued prospects with a Live Report, lowest mailbox warm-up, sending-domain checks passed, social posts that went out, and email delivered.' })}
            ${panel('marketing-channels', 'Channel mix (GA4 sessions)', ga ? pie(channels, { unit: 'sessions', empty: 'No GA4 sessions in this range.' }) : wait('ga4', 'Reading GA4…'), { data: channels })}
            ${panel('marketing-funnel', 'Outreach funnel', funnel(steps), { data: steps })}
            ${panel('marketing-weekly', 'This week against the plan', weeklyBody, { data: weeklyRows })}
            ${plan ? panel('marketing-timeline', `90-day plan · ${plan.day > 0 ? 'day ' + Math.min(plan.day, plan.length) + ' of ' + plan.length : 'starts ' + plan.start}${plan.phase ? ' · ' + plan.phase.name : ''}`, timeline(plan, now), { wide: true, data: plan.milestones }) : ''}
            ${panel('marketing-output', 'What went out per day', area(output.labels, output.series), { wide: true, data: output.labels.map((d, i) => Object.assign({ day: d }, ...output.series.map((s) => ({ [s.name]: s.values[i] })))) })}
            ${panel('marketing-response', 'What came back per day', area(response.labels, response.series), { wide: true, data: response.labels.map((d, i) => Object.assign({ day: d }, ...response.series.map((s) => ({ [s.name]: s.values[i] })))) })}
            ${panel('marketing-campaigns', `Campaigns (Instantly)${camps ? ' · ' + camps.rows.length : ''}`, campBody, { wide: true, data: camps ? camps.rows : null, note: 'Activate starts a campaign on its start date and sending window; nothing goes out to a campaign with no leads. Pause stops it at once.' })}
            ${panel('marketing-camp-lang', 'Campaigns by language', camps ? pie(camps.byLang, { unit: 'campaigns' }) : wait('marketing', ''), { data: camps && camps.byLang })}
            ${panel('marketing-camp-region', 'Campaigns by region', camps ? pie(camps.byRegion, { unit: 'campaigns' }) : wait('marketing', ''), { data: camps && camps.byRegion })}
            ${panel('marketing-camp-seq', 'Campaigns by sequence', camps ? pie(camps.bySequence, { unit: 'campaigns' }) : wait('marketing', ''), { data: camps && camps.bySequence })}
            ${panel('marketing-camp-status', 'Campaigns by status', camps ? pie(camps.byStatus, { unit: 'campaigns' }) : wait('marketing', ''), { data: camps && camps.byStatus })}
            ${panel('marketing-mailboxes', 'Mailboxes and warm-up', boxes, { data: mail && mail.accounts })}
            ${panel('marketing-domain', `Sending domain${ou.mail && ou.mail.domain ? ' · ' + esc(ou.mail.domain) : ''}`, dns, { data: checks })}
            ${panel('marketing-targets', '90-day targets', targets, { data: e.targets && e.targets.targets, note: 'Jarvis counts from the plan start and judges the pace; the marker shows how much of the 90 days has gone. Log what he cannot see.' })}
            ${panel('marketing-segments', 'Prospects by segment', pros ? pie(pros.bySegment, { unit: 'prospects', empty: 'No prospects queued.' }) : wait('marketing', ''), { data: pros && pros.bySegment })}
            ${panel('marketing-countries', 'Prospects by country', pros ? pie(pros.byCountry, { unit: 'prospects', empty: 'No prospects queued.' }) : wait('marketing', ''), { data: pros && pros.byCountry })}
            ${panel('marketing-results', 'Sweep results for prospects', pipe ? stats([{ label: 'Avg score', value: dash(pipe.avgScore) }, { label: 'Left in queue', value: pipe.left, alert: pipe.left === 0 && pipe.queued > 0 }]) + bars(pipe.results, { color: COLORS.green, empty: 'No prospect reviewed in this range.' }) : wait('outreach', ''), { data: pipe && pipe.results })}
            ${panel('marketing-networks', 'Posts by network', so ? pie(so.channels, { unit: 'posts', empty: 'No posts went out in this range.' }) : wait('social', 'Reading the social ledgers…'), { data: so && so.channels })}
            ${panel('marketing-social-results', 'Post results', so ? pie(soResults, { unit: 'posts', empty: 'No posts in this range.' }) : wait('social', ''), { data: soResults })}
            ${listPanel('marketing', 'shares', 'Hub shares by network', hub.lists.networks || [], { color: COLORS.green, empty: 'No shares from the hub in this range.' })}
            ${listPanel('marketing', 'top-posts', 'Top hub posts', hub.lists.posts || [], { color: COLORS.violet, empty: 'No hub stats yet.' })}
            ${listPanel('marketing', 'youtube', `YouTube views by video${yt.length ? ' · ' + yt.length : ''}`, yt, { color: COLORS.pink, empty: 'No YouTube stats yet.' })}
            ${listPanel('marketing', 'social-visits', 'Visits from social', social, { color: COLORS.violet, empty: 'No visits from social links in this range.' })}
            ${listPanel('marketing', 'outreach-visits', 'Visits from outreach links', outVisits.campaigns, { color: COLORS.green, empty: 'No visits tagged utm_source=outreach in this range yet.' })}
            ${panel('marketing-heat', 'When marketing visits arrive', heat(grid, C.peak(grid)), { wide: true })}
            ${panel('marketing-notes', 'Follow-up notes to askers', notes ? stats([{ label: 'Sent', value: notes.sent }, { label: 'People', value: notes.people }, { label: 'Stopped', value: notes.stopped, alert: notes.sent >= 10 && notes.stopped / notes.sent > 0.2 }]) + pie(notes.byKind, { unit: 'notes', empty: 'No notes sent in this range.' }) + bars(notes.byScene, { color: COLORS.amber, empty: '' }) : wait('marketing', 'Reading the follow-up notes…'), { data: notes && notes.byKind, note: 'The notes go 2-3 times a week to askers who have not come back; opens are not tracked on purpose.' })}
            ${panel('marketing-email', 'Email delivery (SendGrid)', em ? `<div class="jv-rings">${ring(em.rates.delivered, 'delivered')}${ring(em.rates.bad === null ? null : Math.max(0, 100 - em.rates.bad), 'not bounced')}</div>` + stats([{ label: 'Sent', value: em.totals.processed }, { label: 'Bounced', value: em.totals.bounces, alert: em.totals.bounces > 0 }, { label: 'Spam reports', value: em.totals.spam_reports, alert: em.totals.spam_reports > 0 }]) : wait('email', 'Asking SendGrid…'), { data: em && em.daily, note: em && em.rates.bad >= th.emailBadPct ? 'Bounces and blocks are over your limit.' : '' })}
            ${panel('marketing-seo', 'Search (Google and Brave)', (gsc ? stats([{ label: 'Clicks', value: gsc.clicks }, { label: 'Impressions', value: gsc.impressions }, { label: 'CTR', value: gsc.ctr + '%' }, { label: 'Avg position', value: dash(gsc.position) }]) + bars(queries, { color: COLORS.green, empty: 'No clicked queries in this range.', limit: 8 }) : e.search && e.search.ok ? `<p class="jv-empty">Search Console: ${esc((e.search.console && e.search.console.error) || 'not connected.')}</p>` : wait('search', 'Asking Search Console…')) + (ranks ? `<p class="jv-chips">${ranks}</p>` : ''), { data: gsc && gsc.queries })}
            ${panel('marketing-revenue', 'Revenue by purpose', mo ? pie(mo.byPurpose.map((r) => ({ label: r.label, value: Math.round(r.value) })), { unit: 'USD', empty: 'No sales in this range.' }) : wait('money', 'Reading payments…'), { data: mo && mo.byPurpose })}
            ${panel('marketing-deck', 'Command deck', deck, { wide: true, note: 'Every button asks before it acts. Queued prospects join the nightly sweep (up to 48 a night); a review now runs at once and shows in the URL Review tab.' })}
            ${panel('marketing-links', 'Consoles', `<div class="jv-actions">${MK_LINKS.map(([label, url]) => `<a class="jv-btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`).join('')}</div>`, { wide: true })}
        </div>${needList(e.marketing)}${needList(e['marketing-sync'])}${needList(e.outreach)}`;
    }

    // --- GitHub (#2526): CI, PRs, the board, issues, branches, deploys, security, API budget and agent work from the
    // github-work source, graded, with the fixes Jarvis can run. Every action asks first; risky ones wait on the countdown.
    const GH_REPO = 'https://github.com/kaanmuar/kaanmuar.github.io';
    const GH_AREAS = [['ci', 'CI'], ['prs', 'PRs'], ['board', 'Board'], ['issues', 'Issues'], ['branches', 'Branches'], ['deploys', 'Deploys'], ['security', 'Security'], ['budget', 'API budget'], ['agents', 'Agents']];
    const GH_STATE = { clean: 'c-fast', dirty: 'c-slow', behind: 'c-average', blocked: 'c-average', unstable: 'c-slow', draft: 'c-draft' };
    const GH_CHECKS = { pass: 'c-fast', fail: 'c-slow', pending: 'c-average' };
    const GH_ASKS = ['Why is CI red?', 'What is blocking the board?', 'Which PRs can merge?'];
    const ghConclusion = (c) => (c === 'success' ? 'c-fast' : !c || c === 'skipped' || c === 'neutral' ? '' : c === 'cancelled' ? 'c-average' : 'c-slow');
    const ghAgo = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? ago(Date.now() - t) + ' ago' : '—'; };
    const ghHours = (h) => (h === null || h === undefined ? '—' : h < 48 ? Math.round(h * 10) / 10 + ' h' : Math.round(h / 24) + ' d');
    const ghSecs = (s) => (s === null || s === undefined ? '—' : s < 90 ? Math.round(s) + ' s' : Math.round(s / 60) + ' min');
    const ghPct = (n) => (n === null || n === undefined ? '—' : n + '%');
    const ghConf = (c) => (c === null || c === undefined ? '' : Math.round(c <= 1 ? c * 100 : c) + '%');
    const ghIssue = (n, text) => (n ? `<a href="${GH_REPO}/issues/${encodeURIComponent(n)}" target="_blank" rel="noopener">${esc(text || '#' + n)}</a>` : '—');
    const ghLink = (url, text) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text));
    const ghRef = (name) => `<code class="jv-gh-ref" title="${esc(name)}">${esc(name)}</code>`;
    const ghCountdown = () => hoursText((((S.external.actions || {}).settings) || {}).countdownHours || COUNTDOWN_HOURS);
    const ghBtn = (label, action, target, args, opts) => `<button type="button" class="jv-btn small${(opts && opts.cls) || ''}" data-gh-act="${esc(action)}" data-target="${esc(target)}" data-gh-args="${esc(JSON.stringify(args || {}))}"${opts && opts.disabled ? ' disabled' : ''}>${esc(label)}</button>`;
    const ghWork = () => S.external['github-work'] || {};
    const ghRun = (id) => ((ghWork().ci || {}).failing || []).find((r) => String(r.id) === String(id));
    const ghPr = (n) => ((ghWork().prs || {}).items || []).find((p) => String(p.number) === String(n));
    const GH_BOARD = 'https://github.com/orgs/carlosandmunoz-hq/projects/1';
    const ghBoardColumn = (name) => `${GH_BOARD}/views/1?filterQuery=${encodeURIComponent(`status:"${name}"`)}`;
    const ghSearch = (q) => `${GH_REPO}/issues?q=${encodeURIComponent(q).replace(/%20/g, '+')}`;
    const ghTree = (name) => String(name).split('/').map(encodeURIComponent).join('/');

    // #2807: inline drill-downs, one open per panel. A trigger (data-drill-open="panel|key": a stat, a bar row, a
    // board column) shows the body with the same data-drill under it; openDrills keeps the open one across renders.
    const openDrills = new Map();
    const drillKey = (panel, key) => panel + '|' + key;
    function drillBodies(panel, list) {
        const open = openDrills.get(panel);
        return list.map((d) => `<div class="jv-drill" data-drill="${esc(drillKey(panel, d.key))}"${open === d.key ? '' : ' hidden'}><header><strong>${esc(d.title)}</strong><button type="button" class="jv-drill-close" data-drill-open="${esc(drillKey(panel, d.key))}" aria-label="Close ${esc(d.title)}">×</button></header>
            ${d.rows.length ? `<ol class="jv-drill-list">${d.rows.join('')}</ol>` : `<p class="jv-empty">${esc(d.empty || 'Nothing here.')}</p>`}${d.more ? `<p class="jv-more">${esc(d.more)}</p>` : ''}
            <p class="jv-drill-links">${d.links.map(([label, url]) => `<a class="jv-btn small" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join('')}</p></div>`).join('');
    }
    function drillStats(panel, list) {
        const open = openDrills.get(panel);
        return `<div class="jv-stats">${list.map((k) => (k.drill ? `<button type="button" class="jv-stat-btn${k.alert ? ' is-alert' : ''}${open === k.drill ? ' is-open' : ''}" data-drill-open="${esc(drillKey(panel, k.drill))}" aria-expanded="${open === k.drill}"><b>${fmt(k.value)}</b><span>${esc(k.label)}</span></button>`
            : `<div${k.alert ? ' class="is-alert"' : ''}><b>${fmt(k.value)}</b><span>${esc(k.label)}</span></div>`)).join('')}</div>`;
    }
    function drillToggle(t) {
        const at = t.dataset.drillOpen.indexOf('|');
        const panel = t.dataset.drillOpen.slice(0, at), key = t.dataset.drillOpen.slice(at + 1);
        const open = openDrills.get(panel) !== key;
        if (open) openDrills.set(panel, key); else openDrills.delete(panel);
        const on = drillKey(panel, key);
        root.querySelectorAll('[data-drill]').forEach((d) => { if (d.dataset.drill.startsWith(panel + '|')) d.hidden = !(open && d.dataset.drill === on); });
        root.querySelectorAll('[data-drill-open]:not(.jv-drill-close)').forEach((b) => {
            if (!b.dataset.drillOpen.startsWith(panel + '|')) return;
            const is = open && b.dataset.drillOpen === on;
            b.setAttribute('aria-expanded', String(is));
            b.classList.toggle('is-open', is);
        });
        const body = open && Array.from(root.querySelectorAll('[data-drill]')).find((d) => d.dataset.drill === on);
        if (body) body.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const drillIssue = (i, meta) => `<li><a href="${esc(i.url || GH_REPO + '/issues/' + i.number)}" target="_blank" rel="noopener">#${esc(i.number)}</a><span>${esc(i.title)}${(i.labels || []).slice(0, 3).map((l) => ` <em class="jv-chip">${esc(l)}</em>`).join('')}</span><small>${esc(meta)}</small></li>`;
    const drillBranch = (b, meta) => `<li><a href="${GH_REPO}/tree/${ghTree(b.name)}" target="_blank" rel="noopener" title="${esc(b.name)}"><code>${esc(b.name)}</code></a><span>${esc(meta)}</span><small><a href="${GH_REPO}/compare/main...${ghTree(b.name)}" target="_blank" rel="noopener">compare</a></small></li>`;
    const ghDays = (n) => (n === null || n === undefined ? '—' : fmt(n) + ' d');

    // #2807: a hover or a tap on a chart shows the exact values of that point.
    function chartTip(hit) {
        const fig = hit.closest('.jv-chart');
        const tip = fig && fig.querySelector('.jv-tip');
        if (!tip) return;
        tip.textContent = hit.dataset.tip;
        tip.hidden = false;
        const box = fig.querySelector('.jv-chart-plot').getBoundingClientRect(), r = hit.getBoundingClientRect();
        tip.style.left = Math.max(0, Math.min(box.width - tip.offsetWidth, r.left + r.width / 2 - box.left - tip.offsetWidth / 2)) + 'px';
        const guide = fig.querySelector('.jv-guide');
        if (guide) { guide.setAttribute('x1', hit.dataset.x); guide.setAttribute('x2', hit.dataset.x); guide.classList.add('is-on'); }
    }
    function chartTipOff(fig) {
        const tip = fig.querySelector('.jv-tip'), guide = fig.querySelector('.jv-guide');
        if (tip) tip.hidden = true;
        if (guide) guide.classList.remove('is-on');
    }

    function githubView() {
        const g = S.external['github-work'];
        if (!g || g.ok === false) return `<div class="jv-grid">${briefPanel('github')}${panel('github-wait', 'GitHub', waiting('github-work', 'Reading GitHub: CI, PRs, the board, branches and agent work…'), { wide: true, keep: true })}</div>${needList(g)}`;
        const live = (x) => (x && x.ok !== false ? x : null);
        const off = (x, text) => `<p class="jv-empty">${esc(x && x.ok === false ? [x.error || 'Not available.', x.need ? 'Needs ' + x.need + '.' : ''].filter(Boolean).join(' ') : text || 'Nothing in this range.')}</p>`;
        const ci = live(g.ci), prs = live(g.prs), board = live(g.board), iss = live(g.issues), br = live(g.branches), dep = live(g.deploys), an = live(g.android);
        const sec = g.security || {}, bud = g.budget || null, ag = g.agents || null, st = g.streaks || null, dora = g.dora || null;
        const sc = g.score || {}, areas = sc.areas || {};
        const hist = g.history || [];
        const failing = ci ? ci.failing || [] : [];
        const needs = g.needs || [];
        const missing = (g.access && g.access.missing) || [];
        const overWip = !!(board && board.wipLimit && board.wip > board.wipLimit);

        const head = `<div class="jv-gh-head">${gradeRing(sc.overall, 'overall', 128)}<div class="jv-grades">${GH_AREAS.map(([k, label]) => gradeRing(areas[k], label, 84)).join('')}</div></div>` + kpis([
            { label: 'CI pass rate', value: ci ? ghPct(ci.passRate) : '—', alert: !!ci && ci.passRate < 90 },
            { label: 'Open PRs', value: prs ? prs.open : '—', delta: prs && prs.mergeReady ? prs.mergeReady + ' ready to merge' : '', dir: 1 },
            { label: 'Conflicts', value: prs ? prs.conflicts : '—', alert: !!prs && prs.conflicts > 0 },
            { label: 'WIP', value: board ? `${fmt(board.wip)} / ${fmt(board.wipLimit)}` : '—', alert: overWip },
            { label: 'Open bugs', value: iss ? iss.openBugs : '—', alert: !!iss && iss.openBugs > 0 },
            { label: 'Merged in range', value: prs ? prs.merged : '—' },
            { label: 'DORA level', value: dora && dora.level ? dora.level : '—', alert: !!dora && dora.level === 'low' },
            { label: 'XP level', value: st ? 'Lv ' + st.level : '—', delta: st ? fmt(st.xp) + ' XP' : '' }
        ]);

        const needsPanel = needs.length || missing.length ? panel('github-needs', `Needs you · ${needs.length}`, (needs.length ? `<ul class="jv-needs jv-gh-needs">${needs.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '')
            + (missing.length ? `<p class="jv-note">Repos the qa-lab-agents app cannot read: ${missing.map((m) => esc(m.repo) + (m.why ? ' (' + esc(m.why) + ')' : '')).join(', ')}.</p>` : ''),
        { wide: true, keep: true, data: needs.map((n) => ({ need: n })), note: 'Steps only you can take. The parts they block show under No data yet at the bottom.' }) : '';

        const colDrills = board ? BOARD_COLS.map((name) => {
            const c = (board.columns || []).find((x) => x.name === name) || { count: 0, items: [] };
            const items = (c.items || []).slice(0, 8);
            return { key: name, title: `${name} · ${plural(c.count || 0, 'card', 'cards')}`, empty: `No cards in ${name}.`,
                rows: items.map((i) => drillIssue(i, `${ghDays(i.days)} in ${name}`)), more: c.count > items.length ? `${name === 'Done' ? 'Newest' : 'Oldest'} ${items.length} of ${fmt(c.count)}.` : '',
                links: [[`Open ${name} on the board`, ghBoardColumn(name)], ['All issues', GH_REPO + '/issues']] };
        }) : [];
        const flowBody = board ? processMap(board, g.flow, { drill: 'github-flow', open: openDrills.get('github-flow') }) + drillBodies('github-flow', colDrills) + stats([{ label: 'WIP', value: board.wip, alert: overWip }, { label: 'WIP limit', value: board.wipLimit }, { label: 'Cycle time (median)', value: board.cycleMedD === null || board.cycleMedD === undefined ? '—' : board.cycleMedD + ' d' }, { label: 'Moves in range', value: (g.flow || []).reduce((n, f) => n + (f.count || 0), 0) }, { label: 'Drifted cards', value: (board.drift || []).length, alert: (board.drift || []).length > 0 }]) : off(g.board);

        const doraChip = (lv) => (lv ? `<span class="jv-chip lv-${esc(lv)}">${esc(lv)}</span>` : '<span class="jv-chip">—</span>');
        const doraRows = dora ? [
            ['Deploy frequency', dora.deployFreq, (x) => (x.perDay === null || x.perDay === undefined ? '—' : x.perDay + ' / day')],
            ['Lead time for changes', dora.leadTimeH, (x) => ghHours(x.median)],
            ['Change failure rate', dora.changeFail, (x) => ghPct(x.pct)],
            ['Time to restore', dora.mttrH, (x) => ghHours(x.median)]
        ] : [];
        const doraBody = dora ? `<div class="jv-dora"><div class="jv-dora-level lv-${esc(dora.level || 'none')}"><small>DORA level</small><strong>${esc(dora.level || '—')}</strong></div><ul>${doraRows.map(([label, x, shown]) => `<li><span>${esc(label)}</span><b>${x ? esc(shown(x)) : '—'}</b>${doraChip(x && x.level)}</li>`).join('')}</ul></div>` : off(null, 'No DORA numbers yet.');

        const lvStart = st ? 50 * Math.pow(Math.max(0, st.level - 1), 2) : 0;
        const lvPct = st && st.nextAt > lvStart ? Math.max(0, Math.min(100, Math.round(((st.xp - lvStart) / (st.nextAt - lvStart)) * 100))) : 0;
        const xpBody = st ? stats([{ label: 'Green main (days)', value: st.greenMainDays }, { label: 'Merge streak (days)', value: st.mergeDays }, { label: 'XP', value: st.xp }])
            + `<div class="jv-gh-level"><span>Level <b>${fmt(st.level)}</b></span><span class="jv-gh-xp" title="${lvPct}% of the way to level ${st.level + 1}"><i style="width:${lvPct}%"></i></span><small>${fmt(Math.max(0, st.nextAt - st.xp))} XP to level ${fmt(st.level + 1)}</small></div>`
            + ((st.badges || []).length ? `<p class="jv-chips">${st.badges.map((b) => `<span class="jv-chip c-report">${esc(b)}</span>`).join(' ')}</p>` : '') : off(null, 'No streaks yet.');

        const ciDays = {};
        hist.forEach((r) => { ciDays[r.day] = { date: r.day, runs: r.runs || 0, failed: r.failed || 0 }; });
        (ci ? ci.daily || [] : []).forEach((r) => { ciDays[r.day] = { date: r.day, runs: r.runs || 0, failed: r.failed || 0 }; });
        const ciRows = Object.values(ciDays);
        const ciTrend = align([{ name: 'Runs', color: COLORS.cyan, rows: ciRows, key: 'runs' }, { name: 'Failed', color: COLORS.pink, rows: ciRows, key: 'failed' }]);
        const histDays = hist.map((r) => r.day);
        const sparkRow = (label, key, shown, color, unit) => { const v = hist.map((r) => Number(r[key]) || 0); const last = hist.length ? hist[hist.length - 1][key] : null; return `<div><span><i style="background:${color}"></i>${esc(label)}</span><b>${last === null || last === undefined ? '—' : esc(shown ? shown(last) : fmt(last))}</b>${spark(v, color, { unit, labels: histDays })}</div>`; };
        const trendBody = hist.length ? `<div class="jv-gh-sparks">${sparkRow('CI pass rate', 'passRate', ghPct, COLORS.green, '%')}${sparkRow('Health score', 'score', null, COLORS.cyan, 'of 100')}${sparkRow('Open PRs', 'openPrs', null, COLORS.violet, 'PRs')}${sparkRow('Open bugs', 'openBugs', null, COLORS.pink, 'bugs')}${sparkRow('WIP', 'wip', null, COLORS.amber, 'cards')}${sparkRow('Merged', 'merged', null, COLORS.green, 'PRs')}</div><p class="jv-note">One point per day (UTC); tap or hover a line for that day's value. Under each line: first day, value range, last day.</p>` : off(null, 'No daily history yet: the hourly job backfills 90 days, ten a run.');

        const ciBody = ci ? stats([{ label: 'Runs', value: ci.runs }, { label: 'Failed', value: ci.failed, alert: ci.failed > 0 }, { label: 'Pass rate', value: ghPct(ci.passRate), alert: ci.passRate < 90 }, { label: 'Minutes', value: ci.minutes }, { label: 'Median queue', value: ghSecs(ci.queueMedS) }, { label: 'Median run', value: ghSecs(ci.durMedS) }, { label: 'Flaky', value: ghPct((ci.flaky || {}).pct), alert: ((ci.flaky || {}).pct || 0) > 5 }])
            + table([['Workflow', (w) => `<strong>${esc(w.name)}</strong>${w.path ? `<br><span class="jv-note">${esc(w.path)}</span>` : ''}`], ['Runs', (w) => fmt(w.runs)],
                ['Pass rate', (w) => `<span class="jv-meter${w.passRate < 90 ? ' is-low' : ''}"><i style="width:${Math.max(0, Math.min(100, w.passRate || 0))}%"></i></span> ${esc(ghPct(w.passRate))}`], ['Median run', (w) => esc(ghSecs(w.durMedS))],
                ['Main', (w) => `<span class="jv-chip ${w.mainRed ? 'c-slow' : 'c-fast'}">${w.mainRed ? 'red' : 'green'}</span>`],
                ['Last', (w) => (w.last ? `<a class="jv-chip ${ghConclusion(w.last.conclusion)}" href="${esc(w.last.url)}" target="_blank" rel="noopener">${esc(w.last.conclusion || 'running')}</a> <span class="jv-note">${esc(ghAgo(w.last.at))}</span>` : '—')]], ci.workflows || [], 'No workflow runs in range.') : off(g.ci);
        const flaky = ci && ci.flaky ? ci.flaky.workflows || [] : [];
        const flakyBody = ci ? table([['Workflow', (w) => esc(w.name)], ['Flaky', (w) => `<span class="jv-chip ${w.pct >= 10 ? 'c-slow' : 'c-average'}">${esc(ghPct(w.pct))}</span>`], ['Runs', (w) => fmt(w.runs)]], flaky, 'No flaky workflows: every failure stayed failed on a re-run.') : off(g.ci);
        const diagCell = (r) => (r.diag ? `<strong>${esc(r.diag.cause)}</strong><br>${r.diag.category ? `<span class="jv-chip c-average">${esc(r.diag.category)}</span>` : ''}${r.diag.confidence !== null && r.diag.confidence !== undefined ? `<span class="jv-chip">confidence ${esc(ghConf(r.diag.confidence))}</span>` : ''}${r.diag.fix ? `<br><span class="jv-note">Fix: ${esc(r.diag.fix)}</span>` : ''}` : '<span class="jv-note">Not diagnosed yet.</span>');
        const failBody = ci ? table([
            ['Run', (r) => `${ghLink(r.url, r.name)}<br><span class="jv-note">#${esc(r.id)}${r.event ? ' · ' + esc(r.event) : ''}${r.sha ? ' · ' + esc(String(r.sha).slice(0, 7)) : ''}</span>`],
            ['Branch', (r) => `${ghRef(r.branch)}${r.pr ? `<br>PR ${ghLink(GH_REPO + '/pull/' + r.pr, '#' + r.pr)}` : ''}`],
            ['Attempt', (r) => fmt(r.attempt || 1)], ['Age', (r) => esc(ghAgo(r.at))], ['Diagnosis', diagCell],
            ['', (r) => `<div class="jv-actions"><button type="button" class="jv-btn small" data-gh-rerun="${esc(r.id)}">Re-run</button><button type="button" class="jv-btn small" data-gh-diagnose="${esc(r.id)}"${S.pending['gh-diag:' + r.id] ? ' disabled' : ''}>${S.pending['gh-diag:' + r.id] ? 'Diagnosing…' : r.diag ? 'Diagnose again' : 'Diagnose'}</button><button type="button" class="jv-btn small is-primary" data-gh-agent="${esc(r.id)}">Launch a Cursor fix agent</button></div>`]
        ], failing, 'No failing runs. CI is green.') : off(g.ci);

        const prBtns = (p) => [
            ['behind', 'blocked', 'unstable'].includes(p.state) ? ghBtn('Update with main', 'gh-update-pr', '#' + p.number, { pr: p.number }) : '',
            p.state === 'clean' && p.checks === 'pass' ? ghBtn('Merge', 'gh-merge-pr', '#' + p.number, { pr: p.number }, { cls: ' is-primary' }) : '',
            p.state === 'dirty' ? `<button type="button" class="jv-btn small" data-gh-agent-pr="${esc(p.number)}">Resolve with a Cursor agent</button>` : '',
            !p.ticket && p.state !== 'draft' ? ghBtn('File a ticket', 'gh-orphan-ticket', '#' + p.number, { pr: p.number }) : ''
        ].filter(Boolean).join('');
        const prBody = prs ? stats([{ label: 'Open', value: prs.open }, { label: 'Draft', value: prs.draft }, { label: 'Ready to merge', value: prs.mergeReady }, { label: 'Conflicts', value: prs.conflicts, alert: prs.conflicts > 0 }, { label: 'Behind main', value: prs.behind }, { label: 'Red checks', value: prs.red, alert: prs.red > 0 }, { label: 'Stale', value: prs.stale, alert: prs.stale > 0 }, { label: 'No ticket', value: prs.orphan, alert: prs.orphan > 0 }, { label: 'Lead time (median)', value: ghHours(prs.leadMedH) }, { label: 'Lead time (p90)', value: ghHours(prs.leadP90H) }])
            + table([
                ['PR', (p) => `${ghLink(p.url, '#' + p.number)} <strong>${esc(p.title)}</strong><br><span class="jv-note">${esc(p.author || '')}${p.branch ? ' · ' + ghRef(p.branch) : ''}${(p.labels || []).length ? ' · ' + p.labels.map(esc).join(', ') : ''}</span>`],
                ['State', (p) => `<span class="jv-chip ${GH_STATE[p.state] || ''}">${esc(p.state)}</span>`], ['Checks', (p) => `<span class="jv-chip ${GH_CHECKS[p.checks] || ''}">${esc(p.checks || '—')}</span>`],
                ['Age', (p) => `${esc(ghHours(p.ageH))}${p.updatedH > 72 ? `<br><span class="jv-note">quiet ${esc(ghHours(p.updatedH))}</span>` : ''}`], ['Ticket', (p) => ghIssue(p.ticket)],
                ['Size', (p) => `<span class="jv-gh-add">+${fmt(p.additions || 0)}</span> <span class="jv-gh-del">−${fmt(p.deletions || 0)}</span>`], ['', (p) => `<div class="jv-actions">${prBtns(p)}</div>`]
            ], prs.items || [], 'No open PRs.') : off(g.prs);
        const prDaily = prs ? align([{ name: 'Opened', color: COLORS.violet, rows: (prs.daily || []).map((r) => ({ date: r.day, n: r.opened })), key: 'n' }, { name: 'Merged', color: COLORS.green, rows: (prs.daily || []).map((r) => ({ date: r.day, n: r.merged })), key: 'n' }]) : null;

        const columns = board ? (board.columns || []).map((c) => ({ label: c.name, value: c.count || 0 })) : [];
        const boardBody = board ? bars(columns, { color: COLORS.cyan, limit: 8, empty: 'The board is empty.', yLabel: 'Column', unit: 'cards', legend: 'Cards on the board' }) + table([['Column', (c) => esc(c.name)], ['Median age', (c) => (c.ageMedD === null || c.ageMedD === undefined ? '—' : fmt(c.ageMedD) + ' d')], ['Oldest', (c) => (c.name === 'Done' ? [] : c.items || []).slice(0, 3).map((o) => `${ghLink(o.url, '#' + o.number)} <span class="jv-note">${fmt(o.days)} d</span>`).join(' · ') || '—']], (board.columns || []).filter((c) => c.count)) : off(g.board);
        const drift = board ? board.drift || [] : [];
        const driftBody = board ? table([['Card', (d) => `${ghLink(d.url, '#' + d.number)} ${esc(d.title)}`], ['On the board', (d) => `<span class="jv-chip">${esc(d.column)}</span>`], ['Should be', (d) => `<span class="jv-chip c-average">${esc(d.should)}</span>`], ['Why', (d) => `<span class="jv-note">${esc(d.why)}</span>`]], drift, 'Every card sits where its PR and issue say.')
            + (drift.length ? `<div class="jv-actions">${ghBtn('Sync the board', 'gh-board-sync', plural(drift.length, 'drifted card', 'drifted cards'), { items: drift.map((d) => ({ number: d.number, should: d.should })) }, { cls: ' is-primary' })}</div>` : '') : off(g.board);
        const agingBody = board ? table([['Card', (a) => `${ghLink(a.url, '#' + a.number)} ${esc(a.title)}`], ['Column', (a) => `<span class="jv-chip">${esc(a.column)}</span>`], ['Days', (a) => `<span class="jv-chip ${a.days > 14 ? 'c-slow' : a.days > 7 ? 'c-average' : ''}">${fmt(a.days)}</span>`]], board.aging || [], 'Nothing has sat in Dev, QA or Stg for more than a week.') : off(g.board);

        const issDaily = iss ? align([{ name: 'Opened', color: COLORS.pink, rows: (iss.daily || []).map((r) => ({ date: r.day, n: r.opened })), key: 'n' }, { name: 'Closed', color: COLORS.green, rows: (iss.daily || []).map((r) => ({ date: r.day, n: r.closed })), key: 'n' }]) : null;
        const sub = iss && iss.subIssues ? iss.subIssues : null;
        const lists = (iss && iss.lists) || {};
        const oldest = iss ? iss.oldest || [] : [];
        const newestOf = (shown, of) => (of > shown ? `Newest ${shown} of ${fmt(of)}.` : '');
        const age = (i) => ghDays(i.days) + ' open';
        const issDrills = iss ? [
            { key: 'open', title: `Open issues · ${fmt(iss.open)}`, rows: (lists.open || []).map((i) => drillIssue(i, age(i))), more: newestOf((lists.open || []).length, iss.open), links: [['All open issues', ghSearch('is:issue is:open')]], empty: 'No open issue changed in this range.' },
            { key: 'bugs', title: `Open bugs · ${fmt(iss.openBugs)}`, rows: (lists.openBugs || []).map((i) => drillIssue(i, age(i))), more: newestOf((lists.openBugs || []).length, iss.openBugs), links: [['Open bugs on GitHub', ghSearch('is:issue is:open label:bug')]], empty: 'No open bugs.' },
            { key: 'opened', title: `Opened since ${iss.since || 'the range start'} · ${fmt(iss.opened)}`, rows: (lists.opened || []).map((i) => drillIssue(i, `opened ${ghDays(i.days)} ago`)), more: newestOf((lists.opened || []).length, iss.opened), links: [['Opened in range', ghSearch(`is:issue created:>=${iss.since || ''}`)]], empty: 'No issue opened in this range.' },
            { key: 'closed', title: `Closed since ${iss.since || 'the range start'} · ${fmt(iss.closed)}`, rows: (lists.closed || []).map((i) => drillIssue(i, `closed ${ghDays(i.days)} ago`)), more: newestOf((lists.closed || []).length, iss.closed), links: [['Closed in range', ghSearch(`is:issue is:closed closed:>=${iss.since || ''}`)]], empty: 'No issue closed in this range.' },
            { key: 'sub', title: `Parent tickets · ${fmt(sub ? sub.parents : 0)}`, rows: ((sub && sub.items) || []).map((i) => drillIssue(i, `${fmt(i.done)} of ${fmt(i.total)} sub-issues done`)), more: sub && sub.parents > (sub.items || []).length ? `Most left to do first: ${(sub.items || []).length} of ${fmt(sub.parents)}.` : '', links: [['All issues', GH_REPO + '/issues']], empty: 'No sub-issues yet.' },
            { key: 'oldest', title: 'Oldest open issues', rows: oldest.map((i) => drillIssue(i, age(i))), links: [['Oldest first on GitHub', ghSearch('is:issue is:open sort:created-asc')]], empty: 'No open issues.' }
        ] : [];
        const issBody = iss ? drillStats('github-issues', [{ label: 'Open', value: iss.open, drill: 'open' }, { label: 'Open bugs', value: iss.openBugs, alert: iss.openBugs > 0, drill: 'bugs' }, { label: 'Opened', value: iss.opened, drill: 'opened' }, { label: 'Closed', value: iss.closed, drill: 'closed' },
            { label: 'Sub-issues done', value: sub && sub.total ? `${fmt(sub.done)}/${fmt(sub.total)}` : '—', drill: 'sub' }, { label: 'Oldest open', value: oldest.length ? ghDays(oldest[0].days) : '—', drill: 'oldest' }])
            + drillBodies('github-issues', issDrills)
            + area(issDaily.labels, issDaily.series, { title: 'Issues opened and closed each day', yLabel: 'issues per day', unit: 'issues', xLabel: 'Day (UTC)' }) : off(g.issues);
        const bugAreas = iss ? iss.bugsByArea || [] : [];
        const areaQuery = (a) => (a === 'none' ? 'is:issue is:open label:bug' : `is:issue is:open label:area:${a} label:bug`);
        const areaBody = iss ? bars(bugAreas, { color: COLORS.pink, empty: 'No open bugs.', yLabel: 'Area', unit: 'open bugs', legend: 'Open bugs', drill: 'github-bug-areas', open: openDrills.get('github-bug-areas') })
            + drillBodies('github-bug-areas', bugAreas.map((a) => ({ key: a.label, title: `${a.label === 'none' ? 'No area label' : 'area:' + a.label} · ${plural(a.value, 'open bug', 'open bugs')}`, rows: (a.items || []).map((i) => drillIssue(i, age(i))),
                more: newestOf((a.items || []).length, a.value), links: [[a.label === 'none' ? 'All open bugs' : `area:${a.label} bugs on GitHub`, ghSearch(areaQuery(a.label))]], empty: 'No bugs listed.' }))) : off(g.issues);

        const merged = br ? br.merged || [] : [];
        const trees = br ? br.worktrees || [] : [];
        const ahead = br ? br.ahead || [] : [];
        const brMeta = (b) => `last commit ${ghDays(b.days)} ago · ${fmt(b.ahead)} ahead, ${fmt(b.behind)} behind${b.pr ? ' · PR #' + b.pr : ''}`;
        const brDrills = br ? [
            { key: 'all', title: `Branches · ${fmt(br.total)}`, rows: ahead.slice().sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9)).slice(0, 10).map((b) => drillBranch(b, brMeta(b))), more: br.total > 10 ? `Newest 10 of ${fmt(br.total)} read; the rest are on GitHub.` : '', links: [['All branches', GH_REPO + '/branches/all']], empty: 'No branches besides main.' },
            { key: 'stale', title: `Stale branches · ${fmt(br.stale)}`, rows: ahead.filter((b) => b.days !== null && b.days > 14).sort((a, b) => b.days - a.days).slice(0, 10).map((b) => drillBranch(b, brMeta(b))), links: [['Stale branches', GH_REPO + '/branches/stale']], empty: 'No branch has gone two weeks without a commit.' },
            { key: 'merged', title: `Merged, not deleted · ${fmt(merged.length)}`, rows: merged.slice(0, 10).map((b) => drillBranch(b, `PR #${b.pr} merged ${ghDays(b.days)} ago`)), more: merged.length > 10 ? `${fmt(merged.length - 10)} more in the export.` : '', links: [['All branches', GH_REPO + '/branches/all'], ['Merged PRs', `${GH_REPO}/pulls?q=is%3Apr+is%3Amerged`]], empty: 'No merged branches left behind.' },
            { key: 'ahead', title: 'Ahead of and behind main', rows: ahead.slice().sort((a, b) => b.behind - a.behind).slice(0, 10).map((b) => drillBranch(b, brMeta(b))), links: [['Active branches', GH_REPO + '/branches/active']], empty: 'No open branches ahead of main.' }
        ] : [];
        const branchBody = br ? drillStats('github-branches', [{ label: 'Branches', value: br.total, drill: 'all' }, { label: 'Stale', value: br.stale, alert: br.stale > 0, drill: 'stale' }, { label: 'Merged, not deleted', value: merged.length, alert: merged.length > 0, drill: 'merged' }, { label: 'Ahead of main', value: ahead.filter((b) => b.ahead > 0).length, drill: 'ahead' }, { label: 'Worktrees', value: trees.length }])
            + drillBodies('github-branches', brDrills)
            + table([['Branch', (b) => ghRef(b.name)], ['PR', (b) => (b.pr ? ghLink(GH_REPO + '/pull/' + b.pr, '#' + b.pr) : '—')], ['Merged', (b) => fmt(b.days) + ' d ago']], merged.slice(0, 20), 'No merged branches left behind.')
            + (merged.length > 20 ? `<p class="jv-more">+${merged.length - 20} more in the export</p>` : '')
            + (merged.length ? `<div class="jv-actions">${ghBtn('Delete merged branches', 'gh-delete-branch', plural(merged.length, 'merged branch', 'merged branches'), { branches: merged.map((b) => b.name) }, { cls: ' danger' })}</div>` : '') : off(g.branches);
        const aheadBody = br ? table([['Branch', (b) => ghRef(b.name)], ['Ahead', (b) => fmt(b.ahead)], ['Behind', (b) => `<span class="jv-chip ${b.behind > 50 ? 'c-slow' : b.behind > 10 ? 'c-average' : ''}">${fmt(b.behind)}</span>`], ['Last commit', (b) => fmt(b.days) + ' d'], ['PR', (b) => (b.pr ? ghLink(GH_REPO + '/pull/' + b.pr, '#' + b.pr) : '<span class="jv-note">none</span>')]], br.ahead || [], 'No open branches ahead of main.') : off(g.branches);
        const treeBody = br ? table([
            ['Worktree', (w) => `${ghRef(w.branch)}<br><span class="jv-note">${esc(String(w.path || '').split('/').slice(-2).join('/'))}</span>`], ['Ticket', (w) => ghIssue(w.ticket)],
            ['Chat', (w) => `<span class="jv-chip ${w.alive ? 'c-fast' : ''}">${w.alive ? 'alive' : 'dead'}</span>`], ['PR', (w) => (w.pr ? `${ghLink(GH_REPO + '/pull/' + w.pr, '#' + w.pr)} <span class="jv-chip ${w.prState === 'merged' ? 'c-fast' : w.prState === 'closed' ? '' : 'c-average'}">${esc(w.prState || 'open')}</span>` : '—')],
            ['Files', (w) => (w.dirty ? '<span class="jv-chip c-average">uncommitted</span>' : '<span class="jv-note">clean</span>')],
            ['', (w) => (w.prState === 'merged' && !w.alive ? (w.dirty ? '<span class="jv-note">Has uncommitted files: remove it by hand.</span>' : ghBtn('Remove', 'gh-remove-worktree', String(w.path || w.branch).split('/').pop(), { path: w.path, branch: w.branch })) : '')]
        ], trees, g.local ? 'No worktrees.' : 'The Mac uploader has not sent the worktrees yet.') + (g.local ? `<p class="jv-note">From the Mac uploader ${esc(ghAgo(g.local.at))}.</p>` : '') : off(g.branches);

        const depDaily = dep ? align([{ name: 'Deploys', color: COLORS.green, rows: (dep.daily || []).map((r) => ({ date: r.day, n: r.ok })), key: 'n' }, { name: 'Failed', color: COLORS.pink, rows: (dep.daily || []).map((r) => ({ date: r.day, n: r.failed })), key: 'n' }]) : null;
        const depBody = dep ? `<ul class="jv-feed jv-gh-deploys">${(dep.last || []).map((d) => `<li><time>${esc(when(d.at))}</time><span><span class="jv-chip ${ghConclusion(d.conclusion)}">${esc(d.conclusion || 'running')}</span> ${ghLink(d.url, d.name)}${d.sha ? ` <code>${esc(String(d.sha).slice(0, 7))}</code>` : ''}</span></li>`).join('')}</ul>` : off(g.deploys);
        const envBody = dep ? table([['Environment', (x) => esc(x.name)], ['State', (x) => `<span class="jv-chip ${x.state === 'success' || x.state === 'active' ? 'c-fast' : x.state === 'failure' || x.state === 'error' ? 'c-slow' : ''}">${esc(x.state || '—')}</span>`], ['Last', (x) => esc(ghAgo(x.at))]], dep.environments || [], 'No environments.') : off(g.deploys);

        const secItems = (x) => table([['Repo', (i) => esc(i.repo || '')], ['Alert', (i) => ghLink(i.url, (i.package || i.rule || i.secret || i.title || 'alert') + (i.number ? ' #' + i.number : ''))], ['Severity', (i) => `<span class="jv-chip ${/critical|high/i.test(i.severity || '') ? 'c-slow' : i.severity ? 'c-average' : ''}">${esc(i.severity || '—')}</span>`]], x.items || [], 'No open alerts.');
        const dbot = live(sec.dependabot), cscan = live(sec.codeScanning), secrets = live(sec.secrets);

        const gql = bud && bud.kaanmuar ? bud.kaanmuar.graphql : null;
        const core = bud && bud.kaanmuar ? bud.kaanmuar.core : null;
        const appCore = bud && bud.app ? bud.app.core : null;
        const left = (x) => (x && x.limit ? Math.round(((x.limit - x.used) / x.limit) * 100) : null);
        const budgetBody = bud ? `<div class="jv-rings">${ring(left(gql), 'GraphQL left', null, 104)}${ring(left(core), 'REST left', null, 92)}${ring(left(appCore), 'app REST left', null, 92)}</div>`
            + stats([{ label: 'GraphQL used', value: gql ? `${fmt(gql.used)} / ${fmt(gql.limit)}` : '—', alert: left(gql) !== null && left(gql) < 20 }, { label: 'Resets', value: gql && gql.resetAt ? when(gql.resetAt) : '—' }, { label: 'App REST used', value: appCore ? `${fmt(appCore.used)} / ${fmt(appCore.limit)}` : '—' }])
            + bars((bud.hourly || []).map((r) => ({ label: String(r.hour).slice(11, 16) || String(r.hour), value: r.graphql || 0 })), { color: COLORS.violet, limit: 24, empty: 'No hourly GraphQL readings yet.', title: 'GraphQL points used per hour', yLabel: 'Hour (UTC)', unit: 'points', legend: 'kaanmuar GraphQL points' })
            + (bud.kaanmuar ? '' : '<p class="jv-note">The Mac uploader has not sent kaanmuar\'s rate limit yet.</p>') : off(null, 'No API budget readings yet.');

        const agTickets = ag ? (ag.tickets || []).map((t) => ({ label: `#${t.ticket} ${t.title || ''}`.trim(), value: Math.round((t.hours || 0) * 10) / 10 })) : [];
        const cost = ag && ag.cost ? ag.cost : null;
        const costPct = cost && cost.limitUsd ? Math.round((cost.onDemandUsd / cost.limitUsd) * 100) : null;
        const agBody = ag ? stats([{ label: 'Open chats', value: (ag.open || []).length }, { label: 'Hours in range', value: Math.round((ag.daily || []).reduce((n, d) => n + (d.hours || 0), 0) * 10) / 10 }, { label: 'Tickets worked', value: (ag.tickets || []).length }, { label: 'On-demand USD', value: cost ? `${fmt(cost.onDemandUsd)} / ${fmt(cost.limitUsd)}` : '—', alert: costPct !== null && costPct >= 80 }])
            + (cost ? `<div class="jv-vs"><span>On-demand spend since ${esc(cost.cycleStart || '—')}</span><span class="jv-meter${costPct >= 80 ? ' is-low' : ''}"><i style="width:${Math.min(100, costPct || 0)}%"></i></span><b>${esc(ghPct(costPct))}</b><small>of ${fmt(cost.limitUsd)} USD</small></div>` : '')
            + bars(agTickets, { color: COLORS.amber, limit: 10, empty: 'No agent hours logged in range.', title: 'Hours per ticket in range', yLabel: 'Ticket', unit: 'h', legend: 'Agent hours' }) : off(null, 'No agent work logged yet.');
        const agDaily = ag ? align([{ name: 'Agent hours', color: COLORS.amber, rows: (ag.daily || []).map((r) => ({ date: r.day, n: Math.round((r.hours || 0) * 10) / 10 })), key: 'n' }, { name: 'Tickets', color: COLORS.cyan, rows: (ag.daily || []).map((r) => ({ date: r.day, n: r.tickets || 0 })), key: 'n' }]) : null;
        if (agDaily) { agDaily.series[0].unit = 'h'; agDaily.series[1].unit = 'tickets'; }
        const openBody = ag ? table([['Ticket', (o) => ghIssue(o.ticket)], ['Title', (o) => esc(o.title)], ['Since', (o) => esc(ghAgo(o.since))]], ag.open || [], 'No chat is working right now.') : off(null, 'No agent work logged yet.');

        const anBody = an ? stats([{ label: 'Builds', value: an.builds }, { label: 'Failed', value: an.failed, alert: an.failed > 0 }, { label: 'Last build', value: an.last ? an.last.conclusion || 'running' : '—', alert: !!an.last && ghConclusion(an.last.conclusion) === 'c-slow' }])
            + (an.last ? `<p class="jv-note">Last build ${ghLink(an.last.url, ghAgo(an.last.at))}.</p>` : '') + table([['Release', (r) => ghLink(r.url, r.tag)], ['When', (r) => esc(when(r.at))]], an.releases || [], 'No releases yet.') : off(g.android);

        const repos = g.repos || [];
        const repoBody = repos.length ? `<div class="jv-gh-repos">${repos.map((r) => `<div class="jv-gh-repo"><strong>${ghLink('https://github.com/' + r.name, r.name)}</strong>
            <span>${r.private ? '<span class="jv-chip">private</span>' : '<span class="jv-chip">public</span>'}${r.language ? `<span class="jv-chip">${esc(r.language)}</span>` : ''}${r.ci ? `<a class="jv-chip ${ghConclusion(r.ci.conclusion)}" href="${esc(r.ci.url)}" target="_blank" rel="noopener">CI ${esc(r.ci.conclusion || 'running')}</a>` : '<span class="jv-chip">no CI</span>'}${r.security && r.security.open ? `<span class="jv-chip c-slow">${fmt(r.security.open)} security</span>` : ''}</span>
            <small>pushed ${esc(ghAgo(r.pushedAt))} · ${fmt(r.openIssues || 0)} issues · ${fmt(r.openPrs || 0)} PRs · ${esc(r.defaultBranch || 'main')}</small></div>`).join('')}</div>` : off(null, 'No repos read yet.');
        const shownRepos = (g.access && g.access.shown) || C.GITHUB_REPOS;
        const repoTools = `<p class="jv-note">Showing ${shownRepos.map(esc).join(', ')}. <button type="button" class="jv-link" data-act="settings" data-settings-at="s-repos">Edit the list</button></p>`;

        const ai = g.ai || {};
        const aiBody = `<div class="jv-chips">${GH_ASKS.map((q) => `<button type="button" class="jv-btn small" data-gh-ask="${esc(q)}">${esc(q)}</button>`).join('')}</div>
            <form class="jv-inline" data-ask><input type="text" name="q" data-keep="gh-ask" placeholder="Ask Jarvis about GitHub: which workflow fails most? who is blocking QA?" aria-label="Ask Jarvis about GitHub"><button type="submit" class="jv-btn">Ask</button></form>
            ${S.ai ? `<div class="jv-ai"><span class="jv-eyebrow">Gemini · ${S.aiAt ? esc(when(S.aiAt)) : ''}</span><div class="jv-ai-text">${esc(S.ai).replace(/\n/g, '<br>')}</div></div>` : ''}
            <h4 class="jv-sub">Latest diagnoses</h4>${table([['Run', (d) => `${esc(d.workflow || '')} <span class="jv-note">#${esc(d.run)}</span>`], ['Cause', (d) => `${esc(d.cause)}${d.fix ? `<br><span class="jv-note">Fix: ${esc(d.fix)}</span>` : ''}`], ['Kind', (d) => `${d.category ? `<span class="jv-chip c-average">${esc(d.category)}</span>` : ''}${d.confidence !== null && d.confidence !== undefined ? `<span class="jv-chip">${esc(ghConf(d.confidence))}</span>` : ''}`], ['When', (d) => esc(when(d.at))]], (ai.diagnoses || []).slice(0, 10), 'No diagnoses yet: Jarvis diagnoses new failed runs every hour.')}
            ${ai.retro ? `<h4 class="jv-sub">Weekly retro · ${esc(ai.retro.week)}</h4><div class="jv-ai-text">${esc(ai.retro.text).replace(/\n/g, '<br>')}</div>` : ''}`;

        const newest = failing.slice().sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))[0];
        const deck = `<div class="jv-deck">
            <div><h4>Board</h4><div class="jv-actions">${ghBtn('Sync the board', 'gh-board-sync', plural(drift.length, 'drifted card', 'drifted cards'), { items: drift.map((d) => ({ number: d.number, should: d.should })) }, { disabled: !drift.length })}<a class="jv-btn" href="https://github.com/orgs/carlosandmunoz-hq/projects/1" target="_blank" rel="noopener">Open the board</a></div></div>
            <div><h4>CI</h4><div class="jv-actions"><button type="button" class="jv-btn" data-gh-rerun="main"${failing.some((r) => r.branch === 'main') ? '' : ' disabled'}>Re-run failed CI</button><button type="button" class="jv-btn" data-gh-diagnose="${esc(newest ? newest.id : '')}"${newest ? '' : ' disabled'}>Diagnose newest failure</button><a class="jv-btn" href="${GH_REPO}/actions" target="_blank" rel="noopener">Open Actions</a></div></div>
            <div><h4>Branches and data</h4><div class="jv-actions">${ghBtn('Delete merged branches', 'gh-delete-branch', plural(merged.length, 'merged branch', 'merged branches'), { branches: merged.map((b) => b.name) }, { cls: ' danger', disabled: !merged.length })}<button type="button" class="jv-btn" data-act="gh-reload">Reload GitHub numbers</button><button type="button" class="jv-btn" data-act="export-csv">Export this tab (CSV)</button></div></div>
          </div>`;
        const daily = (x) => (x ? x.labels.map((d, i) => Object.assign({ day: d }, ...x.series.map((s) => ({ [s.name]: s.values[i] })))) : null);

        return head + `<div class="jv-grid">${needsPanel}${briefPanel('github')}${proposalsPanel('github')}
            ${panel('github-flow', `Process map${board ? ` · WIP ${fmt(board.wip)} of ${fmt(board.wipLimit)}` : ''}`, flowBody, { wide: true, keep: !!board, data: board && (board.columns || []).map((c) => ({ column: c.name, count: c.count, ageMedD: c.ageMedD })), note: 'Tap a column to list its cards. Arrows are board moves in range, thicker for more; amber ones went backwards. Dev, QA and Stg glow amber when WIP is over its limit.' })}
            ${panel('github-dora', 'DORA', doraBody, { data: doraRows.map(([label, x]) => Object.assign({ metric: label }, x || {})), note: 'Elite: a deploy a day or more, changes live within a day, 5% or fewer fail, restored within an hour.' })}
            ${panel('github-xp', 'Streaks and level', xpBody, { data: st ? [st] : null, note: 'XP: merged PRs × 10, closed bugs × 5, green-main days × 3.' })}
            ${panel('github-trend', 'Daily trend', trendBody, { data: hist })}
            ${panel('github-ci-trend', 'CI runs and failures per day', area(ciTrend.labels, ciTrend.series, { title: 'Workflow runs each day, and how many failed', yLabel: 'runs per day', unit: 'runs', xLabel: 'Day (UTC)' }), { wide: true, data: daily(ciTrend) })}
            ${panel('github-failing', `Failing runs${failing.length ? ' · ' + failing.length : ''}`, failBody, { wide: true, keep: !!ci, data: failing.map((r) => ({ id: r.id, workflow: r.name, branch: r.branch, attempt: r.attempt, at: r.at, pr: r.pr, cause: r.diag && r.diag.cause, category: r.diag && r.diag.category, confidence: r.diag && r.diag.confidence })), note: 'Re-run and Diagnose act at once; a fix agent always asks first and opens a PR when it is done.' })}
            ${panel('github-ci', 'CI workflows', ciBody, { wide: true, data: ci && ci.workflows })}
            ${panel('github-flaky', 'Flaky workflows', flakyBody, { data: flaky, note: 'Flaky: failed, then passed on a re-run of the same commit.' })}
            ${panel('github-prs', `Open PRs${prs ? ' · ' + fmt(prs.open) : ''}`, prBody, { wide: true, keep: !!prs, data: prs && prs.items, note: `Update with main and Merge run as soon as you confirm. Jarvis's own updates wait ${ghCountdown()} on the countdown (Systems > Jarvis actions).` })}
            ${prDaily ? panel('github-pr-daily', 'PRs opened and merged per day', area(prDaily.labels, prDaily.series, { title: 'Pull requests opened and merged each day', yLabel: 'PRs per day', unit: 'PRs', xLabel: 'Day (UTC)' }), { wide: true, data: daily(prDaily) }) : ''}
            ${listPanel('github', 'pr-sizes', 'PR sizes', prs ? prs.sizes || [] : [], { color: COLORS.violet, empty: 'No PRs in range.', yLabel: 'Size (lines changed: XS <10, S <50, M <250, L <1000)', unit: 'open PRs', legend: 'Open PRs' })}
            ${panel('github-board', 'Board columns', boardBody, { data: board && board.columns })}
            ${panel('github-drift', `Board drift${drift.length ? ' · ' + drift.length : ''}`, driftBody, { wide: true, data: drift, note: 'Cards whose Status disagrees with their PR or issue. Jarvis syncs them on its own every hour.' })}
            ${panel('github-aging', 'Aging cards', agingBody, { data: board && board.aging })}
            ${listPanel('github', 'throughput', `Throughput per week${board && board.cycleMedD !== null && board.cycleMedD !== undefined ? ' · cycle ' + board.cycleMedD + ' d' : ''}`, board ? (board.throughput || []).map((t) => ({ label: t.week, value: t.done })) : [], { color: COLORS.green, empty: 'Nothing reached Done in range.', yLabel: 'ISO week', unit: 'cards done', legend: 'Cards that reached Done' })}
            ${panel('github-issues', 'Issues opened and closed per day', issBody, { wide: true, data: daily(issDaily), note: 'Tap a number to list its issues.' })}
            ${panel('github-bug-areas', 'Open bugs by area', areaBody, { data: bugAreas.map((a) => ({ label: a.label, value: a.value })), note: 'Tap an area to list its bugs.' })}
            ${listPanel('github', 'kinds', 'Issues by kind', iss ? iss.byKind || [] : [], { color: COLORS.violet, empty: 'No issues in range.', yLabel: 'Kind', unit: 'open issues', legend: 'Open issues' })}
            ${panel('github-subissues', 'Sub-issues done', sub && sub.total ? `<div class="jv-rings">${ring(Math.round((sub.done / sub.total) * 100), `${sub.done} of ${sub.total}`, null, 110)}</div><p class="jv-note">Across ${fmt(sub.parents)} parent tickets.</p>` : off(g.issues, 'No sub-issues yet.'), { data: sub ? [sub] : null })}
            ${panel('github-oldest', 'Oldest open issues', iss ? table([['Issue', (o) => `${ghLink(o.url, '#' + o.number)} ${esc(o.title)}`], ['Days', (o) => fmt(o.days)]], iss.oldest || [], 'No open issues.') : off(g.issues), { data: iss && iss.oldest })}
            ${panel('github-branches', 'Branches', branchBody, { data: merged, note: 'Tap a number to list its branches, each with its compare against main.' })}
            ${panel('github-ahead', 'Ahead of and behind main', aheadBody, { data: br && br.ahead })}
            ${panel('github-worktrees', `Worktrees${trees.length ? ' · ' + trees.length : ''}`, treeBody, { wide: true, data: trees, note: 'Remove queues git worktree remove for the Mac uploader, which runs it within 5 minutes; it never forces, so uncommitted files stay.' })}
            ${depDaily ? panel('github-deploys', 'Deploys per day', area(depDaily.labels, depDaily.series, { title: 'Deploy runs on main each day', yLabel: 'deploys per day', unit: 'deploys', xLabel: 'Day (UTC)' }), { wide: true, data: daily(depDaily) }) : ''}
            ${panel('github-deploy-last', 'Latest deploys', depBody, { data: dep && dep.last })}
            ${panel('github-envs', 'Environments', envBody, { data: dep && dep.environments })}
            ${panel('github-dependabot', `Dependabot${dbot ? ' · ' + fmt(dbot.open) : ''}`, dbot ? stats([{ label: 'Open', value: dbot.open, alert: dbot.open > 0 }, { label: 'Critical', value: dbot.critical, alert: dbot.critical > 0 }, { label: 'High', value: dbot.high, alert: dbot.high > 0 }]) + secItems(dbot) : off(sec.dependabot, 'Not read yet.'), { data: dbot && dbot.items })}
            ${panel('github-code-scanning', `Code scanning${cscan ? ' · ' + fmt(cscan.open) : ''}`, cscan ? stats([{ label: 'Open', value: cscan.open, alert: cscan.open > 0 }]) + secItems(cscan) : off(sec.codeScanning, 'Not read yet.'), { data: cscan && cscan.items })}
            ${panel('github-secrets', `Secret scanning${secrets ? ' · ' + fmt(secrets.open) : ''}`, secrets ? stats([{ label: 'Open', value: secrets.open, alert: secrets.open > 0 }]) + secItems(secrets) : off(sec.secrets, 'Not read yet.'), { data: secrets && secrets.items })}
            ${panel('github-budget', 'GitHub API budget', budgetBody, { data: bud && bud.hourly, note: "All chats share kaanmuar's 5,000 GraphQL points an hour; the app's REST budget is its own." })}
            ${panel('github-agents', 'Agent work', agBody, { data: ag && ag.tickets })}
            ${agDaily ? panel('github-agents-daily', 'Agent hours per day', area(agDaily.labels, agDaily.series, { title: 'Agent hours and tickets worked each day', yLabel: 'hours or tickets', xLabel: 'Day (UTC)' }), { wide: true, data: daily(agDaily) }) : ''}
            ${panel('github-agents-open', 'Open chats', openBody, { data: ag && ag.open })}
            ${panel('github-android', 'Android builds and releases', anBody, { data: an && an.releases })}
            ${panel('github-repos', `Repos${repos.length ? ' · ' + repos.length : ''}`, repoBody + repoTools, { wide: true, data: repos.map((r) => ({ name: r.name, private: r.private, ci: r.ci && r.ci.conclusion, pushedAt: r.pushedAt, openIssues: r.openIssues, openPrs: r.openPrs, security: r.security && r.security.open, language: r.language })) })}
            ${panel('github-ai', 'Jarvis on GitHub', aiBody, { wide: true, keep: true, data: ai.diagnoses })}
            ${panel('github-deck', 'Command deck', deck, { wide: true, note: `Every button asks first, then runs. When Jarvis fixes on its own, merges, reverts, branch deletes and worktree removals wait ${ghCountdown()} on the countdown.` })}
        </div>`;
    }

    // A github-act action from the GitHub tab, after Carlos confirms.
    const GH_ASK = {
        'rerun-ci': (a) => `re-run the failed jobs of ${a.workflow || 'the run'} #${a.run} on ${a.branch || 'its branch'}`,
        'gh-board-sync': (a) => `sync the board: move ${plural((a.items || []).length, 'card', 'cards')} to the column its PR or issue says (${(a.items || []).slice(0, 4).map((d) => '#' + d.number + ' to ' + d.should).join(', ')})`,
        'gh-update-pr': (a) => `update PR #${a.pr} with main now`,
        'gh-merge-pr': (a) => `merge PR #${a.pr} into main now (it then goes to production)`,
        'gh-delete-branch': (a) => `delete ${plural((a.branches || []).length, 'merged branch', 'merged branches')} now`,
        'gh-remove-worktree': (a) => `remove the merged worktree ${a.branch || a.path} on the Mac (the uploader runs it within 5 minutes, never with --force)`,
        'gh-orphan-ticket': (a) => `file a ticket for PR #${a.pr} and link it in a comment on the PR`
    };

    async function ghAct(b, action = b.dataset.ghAct, target = b.dataset.target, given = null) {
        let args = given || {};
        if (!given) try { args = JSON.parse(b.dataset.ghArgs || '{}'); } catch (error) { args = {}; }
        if (!confirmRun((GH_ASK[action] || (() => ACTION_LABELS[action] || action))(args))) return;
        b.disabled = true;
        toast('Asking Jarvis…', 30000);
        const out = await call('github-act', Object.assign({}, args, { action, target })).catch((error) => ({ ok: false, error: error.message }));
        b.disabled = false;
        toast(out.ok ? out.message || `${(ACTION_LABELS[action] || action).replace(/^./, (c) => c.toUpperCase())}: done.` : 'Not done: ' + out.error, 7000);
        loadExternal(['github-work', 'actions']);
    }

    // Main's failed runs go through the action-run re-run (it re-runs a workflow's newest failed run on main); other branches through github-act.
    async function ghRerun(b) {
        const failing = ((ghWork().ci || {}).failing || []);
        const run = b.dataset.ghRerun === 'main' ? null : ghRun(b.dataset.ghRerun);
        if (run && run.branch !== 'main') return ghAct(b, 'rerun-ci', `${run.name} #${run.id}`, { run: run.id, workflow: run.name, branch: run.branch });
        const workflows = Array.from(new Set((run ? [run] : failing.filter((r) => r.branch === 'main')).map((r) => r.name)));
        if (!workflows.length || !confirmRun(`re-run the failed jobs of ${workflows.join(', ')} on main`)) return;
        b.disabled = true;
        toast('Running…', 30000);
        const out = await call('action-run', { action: 'rerun-ci', workflows, proposal: 'gh:rerun' }).catch((error) => ({ ok: false, error: error.message }));
        b.disabled = false;
        toast(out.ok ? `${ACTION_LABELS['rerun-ci']}: ${out.ran ? out.ran + ' started' : fmt(out.done) + ' done'}${out.failed ? ', ' + out.failed + ' failed' : ''}.` : 'Not run: ' + out.error, 6000);
        loadExternal(['github-work', 'actions']);
    }

    async function ghDiagnose(id) {
        if (!id) return;
        S.pending['gh-diag:' + id] = true;
        render();
        toast('Gemini is reading the run log…', 30000);
        const out = await call('github-diagnose', { run: Number(id) || id }).catch((error) => ({ ok: false, error: error.message }));
        S.pending['gh-diag:' + id] = false;
        const run = ghRun(id);
        if (out.ok && out.diag && run) run.diag = out.diag;
        toast(out.ok ? 'Diagnosis: ' + ((out.diag && out.diag.cause) || 'done.') : 'Not diagnosed: ' + out.error, 7000);
        render();
    }

    function ghPrompt(run) {
        const d = run.diag || {};
        return d.prompt || [`The GitHub Actions run "${run.name}" #${run.id} failed on branch ${run.branch} (${run.url}).`, d.cause ? `Diagnosis: ${d.cause}` : '', d.fix ? `Suggested fix: ${d.fix}` : '',
            `Read the run log, find the root cause, fix it on ${run.branch}${run.pr ? ` (PR #${run.pr})` : ''}, run the affected tests and push.`].filter(Boolean).join('\n');
    }

    // A Cursor cloud agent costs money and writes code: it asks every time, showing the drafted prompt.
    async function ghAgent(b) {
        let body = null;
        if (b.dataset.ghAgent) { const run = ghRun(b.dataset.ghAgent); if (run) body = { prompt: ghPrompt(run), branch: run.branch, pr: run.pr || undefined, run: run.id }; }
        else { const p = ghPr(b.dataset.ghAgentPr); if (p) body = { prompt: `PR #${p.number} "${p.title}" (${p.url}) has merge conflicts with main. Merge main into ${p.branch}, resolve the conflicts keeping the intent of both sides, run the tests and push.`, branch: p.branch, pr: p.number }; }
        if (!body) return;
        const shown = body.prompt.length > 600 ? body.prompt.slice(0, 600) + '…' : body.prompt;
        if (!window.confirm(`Jarvis: launch a Cursor cloud agent on ${body.branch || 'main'}? It opens a PR when it is done.\n\n${shown}`)) return;
        b.disabled = true;
        toast('Launching the agent…', 30000);
        const out = await call('github-agent', body).catch((error) => ({ ok: false, error: error.message }));
        b.disabled = false;
        toast(out.ok ? `Agent launched${out.url ? ': ' + out.url : ''}.` : 'Not launched: ' + out.error, 9000);
        if (out.ok) loadExternal(['github-work']);
    }

    async function ghReload() {
        S.pending['github-work'] = true;
        toast('Reading GitHub again…');
        const out = await call('github-work', { fresh: true }).catch((error) => ({ ok: false, error: error.message }));
        S.pending['github-work'] = false;
        S.external['github-work'] = out;
        compute();
        render();
        loadExternal(['github', 'actions']);
    }

    // The GitHub numbers Gemini sees when Carlos asks (#2526), trimmed to what answers "why is CI red" and the like.
    function githubBrief(g) {
        if (!g || g.ok === false) return null;
        const ok = (x) => (x && x.ok !== false ? x : null);
        const ci = ok(g.ci), prs = ok(g.prs), board = ok(g.board), iss = ok(g.issues);
        return {
            score: g.score, dora: g.dora, needs: g.needs,
            ci: ci && { passRate: ci.passRate, runs: ci.runs, failed: ci.failed, flaky: ci.flaky, mainRed: (ci.workflows || []).filter((w) => w.mainRed).map((w) => w.name), failing: (ci.failing || []).slice(0, 8).map((r) => ({ name: r.name, branch: r.branch, attempt: r.attempt, pr: r.pr, cause: r.diag && r.diag.cause, category: r.diag && r.diag.category })) },
            prs: prs && { open: prs.open, draft: prs.draft, mergeReady: prs.mergeReady, conflicts: prs.conflicts, behind: prs.behind, red: prs.red, stale: prs.stale, orphan: prs.orphan, leadMedH: prs.leadMedH, items: (prs.items || []).slice(0, 15).map((p) => ({ number: p.number, title: p.title, state: p.state, checks: p.checks, ageH: p.ageH, ticket: p.ticket })) },
            board: board && { columns: (board.columns || []).map((c) => ({ name: c.name, count: c.count, ageMedD: c.ageMedD })), wip: board.wip, wipLimit: board.wipLimit, cycleMedD: board.cycleMedD, drift: (board.drift || []).slice(0, 10).map((d) => ({ number: d.number, column: d.column, should: d.should, why: d.why })), aging: (board.aging || []).slice(0, 10).map((a) => ({ number: a.number, title: a.title, column: a.column, days: a.days })) },
            issues: iss && { open: iss.open, openBugs: iss.openBugs, bugsByArea: iss.bugsByArea, opened: iss.opened, closed: iss.closed }
        };
    }

    // --- Engagement (#1988): the scout's posts in our field, what it plans on them, and the replies waiting for you.
    const EG_NETWORK_LIMIT = { bluesky: 300, mastodon: 500, youtube: 500, x: 280, linkedin: 1200, facebook: 1000, instagram: 1000, threads: 500, tiktok: 150, telegram: 1000, reddit: 1500 };
    const EG_SHOWN = 5;
    const egHeadline = (d, max = 160) => {
        const text = (d.title || String(d.text || '')).replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
        return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
    };
    const EG_STATUS_CHIP = { planned: 'c-average', waiting: 'c-average', approved: 'c-average', done: 'c-fast', posted: 'c-fast', dry: '', capped: 'c-slow', paused: '', dismissed: '', expired: 'c-slow', missed: 'c-slow', failed: 'c-slow', replied: '', copy: 'c-fast' };
    const egChips = (d) => Object.entries(d.actions || {}).map(([a, x]) => `<span class="jv-chip ${EG_STATUS_CHIP[x.status] || ''}">${esc(a)}: ${esc(x.status)}</span>`).join(' ')
        + (d.skip ? ` <span class="jv-chip c-slow">left alone: ${esc(d.skip)}</span>` : d.verdict === 'trend' ? ' <span class="jv-chip">trend only</span>' : '');
    // Report replies (#2465, #2471): invites under posts that name a site we reviewed.
    const egIsReport = (d) => d.campaign === 'report-reply';
    const EG_ONLY = [['all', 'All'], ['report', 'Report replies'], ['field', 'Other replies']];
    const egKeep = (d) => S.egOnly === 'all' || (S.egOnly === 'report') === egIsReport(d);
    const egReportChip = (d) => (egIsReport(d) ? ` <span class="jv-chip c-report" title="An invite to the free report we ran on ${esc((d.report || {}).host || 'the site')}">Report reply</span>` : '');
    const egReportLine = (d) => {
        const x = d.report;
        if (!egIsReport(d) || !x) return '';
        return `<p class="jv-prop-why">Invites to the <strong>${esc(x.name || x.host)}</strong> report (${esc(x.host)}) · scores ${fmt(x.score)}${x.shown ? '' : ' (not named in the reply)'} · found by ${esc(x.match || '?')} · ${esc(x.format || 'link')}${x.link ? ` · <a href="${esc(x.link)}" target="_blank" rel="noopener">report link ↗</a>` : ''}${x.match === 'profile' ? ` · touch ${fmt(x.touch)} of 4 (${esc(x.tone || '')}) · offer ${esc(x.offer || '')} · ${x.manual ? 'approve copies it to paste by hand' : 'posts on approval'}${x.profile ? ` · <a href="${esc(x.profile)}" target="_blank" rel="noopener">profile ↗</a>` : ''}` : ''}</p>`;
    };
    const egFilter = (list) => `<div class="jv-actions"><div class="jv-seg" role="group" aria-label="Which replies">${EG_ONLY.map(([k, label]) => `<button type="button" data-eg-only="${k}" class="${S.egOnly === k ? 'on' : ''}" aria-pressed="${S.egOnly === k}">${label} · ${fmt(list.filter((d) => k === 'all' || (k === 'report') === egIsReport(d)).length)}</button>`).join('')}</div></div>`;

    // Owner tags (#2633, #2660): comments that tag a report's owners and the accounts around them under our posts.
    // otAsk is the same shape as functions/jarvis.js ownerTagsAsk, so Ask answers alike on the page and in the app.
    function otAsk(o) {
        if (!o) return null;
        const comments = o.comments || [];
        const failed = comments.filter((x) => x.status === 'failed');
        return { state: o.settings ? (o.settings.paused ? 'paused' : o.settings.live ? 'live' : 'dry run') : null, last: o.last && Object.assign({}, o.last, { sample: undefined }), accounts: o.accounts,
            waiting: (o.accounts || {}).suggested || 0, postedLast7Days: o.week || {}, queued: comments.filter((x) => x.status === 'approved').length,
            failed: failed.length, lastError: failed.length ? failed[0].network + ': ' + String(failed[0].error || '').slice(0, 160) : null };
    }
    const OT_ORDER = ['suggested', 'approved', 'rejected', 'blocked'];
    const OT_STATUS_CHIP = { suggested: 'c-average', approved: 'c-fast', rejected: '', blocked: 'c-slow' };
    const OT_LEVEL = { suggested: 'lv-warn', approved: 'lv-good', rejected: 'lv-info', blocked: 'lv-alert' };
    const OT_GLYPH = { suggested: '?', approved: '✓', rejected: '–', blocked: '⊘' };
    const otState = (o) => (o.settings.paused ? 'paused' : o.settings.live ? 'live' : 'dry run');
    const otProfile = (a) => {
        const h = String(a.handle || '');
        if (a.network === 'mastodon') { const [user, host] = h.split('@'); return host ? `https://${host}/@${user}` : ''; }
        return { x: `https://x.com/${h}`, instagram: `https://www.instagram.com/${h}/`, threads: `https://www.threads.net/@${h}`, tiktok: `https://www.tiktok.com/@${h}`, bluesky: `https://bsky.app/profile/${h}`,
            youtube: h.startsWith('channel/') ? `https://www.youtube.com/${h}` : `https://www.youtube.com/@${h}`, facebook: `https://www.facebook.com/${h}`, linkedin: `https://www.linkedin.com/${h}` }[a.network] || '';
    };
    function ownerTagsBody(o, net) {
        if (!o) return '<p class="jv-empty">Owner tags did not answer; refresh in a minute.</p>';
        const last = o.last;
        const c = o.accounts || {};
        const week = o.week || {};
        const weekTotal = Object.values(week).reduce((a, b) => a + b, 0);
        const head = stats([
            { label: 'State', value: otState(o), alert: o.settings.paused },
            { label: 'Last run', value: last ? when(last.at) : 'never' },
            { label: last && !last.live ? 'Would post last run' : 'Comments last run', value: last ? (last.live ? last.comments : last.dry) : '—' },
            { label: 'Owner replies last run', value: last ? last.replies : '—' },
            { label: 'Suggestions waiting', value: c.suggested || 0, alert: (c.suggested || 0) > 0 },
            { label: 'Approved accounts', value: c.approved || 0 },
            { label: 'Posted, last 7 days', value: weekTotal }
        ]) + `<div class="jv-actions"><button type="button" class="jv-btn${o.settings.paused ? ' is-primary' : ' danger'}" data-ot-pause="${o.settings.paused ? 'off' : 'on'}">${o.settings.paused ? 'Resume owner tags' : 'Pause owner tags'}</button><button type="button" class="jv-btn${o.settings.live ? '' : ' is-primary'}" data-ot-live="${o.settings.live ? 'off' : 'on'}">${o.settings.live ? 'Back to a dry run' : 'Go live'}</button><button type="button" class="jv-btn" data-ot-run${S.pending['ot:run'] ? ' disabled' : ''}>${S.pending['ot:run'] ? 'Running…' : 'Run now'}</button></div>`
            + (S.otNote || o.note ? `<p class="jv-note">${S.otNote ? 'This run: ' : 'Last run: '}${esc(S.otNote || o.note)}</p>` : '')
            + (weekTotal ? `<p class="jv-note">Posted in the last 7 days: ${Object.keys(week).map((k) => `${esc(net(k))} ${fmt(week[k])}`).join(' · ')}</p>` : '');
        const acts = (a) => ['approved', 'rejected', 'blocked'].filter((s) => s !== a.status).map((s) => `<button type="button" data-ot-acct="${s}" data-network="${esc(a.network)}" data-handle="${esc(a.handle)}"${S.pending['ot:' + a.id] ? ' disabled' : ''}>${{ approved: 'Approve', rejected: 'Reject', blocked: 'Block' }[s]}</button>`).join('');
        const row = (a) => { const url = otProfile(a); return `<li class="jv-prop ${OT_LEVEL[a.status] || 'lv-info'}"><span class="jv-prop-rank" aria-hidden="true">${OT_GLYPH[a.status] || '·'}</span><div class="jv-prop-body"><p class="jv-prop-title"><strong>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">@${esc(a.handle)}</a>` : '@' + esc(a.handle)}</strong>${a.name ? ' ' + esc(a.name) : ''} <span class="jv-chip">${esc(net(a.network))}</span> <span class="jv-chip ${OT_STATUS_CHIP[a.status] || ''}">${esc(a.status)}</span> <span class="jv-chip">${esc(a.kind)}</span>${a.verified ? ' <span class="jv-chip c-fast">verified</span>' : ''}</p>
            <p class="jv-prop-why">${[a.why, (a.scopes || []).join(', '), a.batch ? 'batch ' + a.batch : '', a.source ? 'from ' + a.source : ''].filter(Boolean).map(esc).join(' · ')}</p>
            <div class="jv-prop-acts">${acts(a)}</div></div></li>`; };
        const list = o.list || [];
        const groups = OT_ORDER.map((s) => [s, list.filter((a) => a.status === s)]).filter(([, l]) => l.length)
            .map(([s, l]) => `<details${s === 'suggested' ? ' open' : ''}><summary>${esc(s.replace(/^./, (x) => x.toUpperCase()))} · ${fmt(c[s] || l.length)}</summary><ol class="jv-props">${l.map(row).join('')}</ol></details>`).join('')
            || '<p class="jv-empty">No accounts yet. The daily run reads each reviewed site\'s profile links and asks Gemini for the accounts around it.</p>';
        const add = `<form class="jv-eg-bluesky" data-ot-add><label>Profile link or handle<input name="who" autocomplete="off" placeholder="https://x.com/metrodebogota or @metrodebogota"></label>
            <label>Network<select name="network"><option value="">from the link</option>${['x', 'instagram', 'threads', 'bluesky', 'mastodon', 'youtube'].map((k) => `<option value="${k}">${esc(net(k))}</option>`).join('')}</select></label>
            <label>Scope<select name="scopeKind">${['report', 'city', 'sector', 'country'].map((k) => `<option value="${k}">${k}</option>`).join('')}</select></label>
            <label>Scope value<input name="scopeValue" autocomplete="off" placeholder="metrobogota, bogota, transit or co"></label>
            <label>Kind<select name="kind"><option value="related">related</option><option value="owner">owner</option></select></label>
            <button type="submit" class="jv-btn">Add account</button></form>`;
        const comments = table([['When', (x) => `<span class="jv-nowrap">${esc(when(x.at))}</span>`], ['Network', (x) => esc(net(x.network))], ['Kind', (x) => (x.kind === 'reply' ? 'owner reply' : `tags (${fmt(x.mentions)})`)],
            ['Status', (x) => `<span class="jv-chip ${EG_STATUS_CHIP[x.status] || ''}">${esc(x.status)}</span>${x.error ? `<br><span class="jv-note">${esc(x.error)}</span>` : ''}`],
            ['Comment', (x) => `<span class="jv-note">${esc(x.draft)}</span>${x.url ? `<br><a href="${esc(x.url)}" target="_blank" rel="noopener">Our comment ↗</a>` : ''}${x.post ? ` <a href="${esc(x.post)}" target="_blank" rel="noopener">Post ↗</a>` : ''}`]], o.comments || [], 'No owner-tags comment yet. In a dry run nothing is queued; Go live queues them on the next run.');
        return head + `<h4>Accounts</h4>${groups}${add}<h4>Recent comments and owner replies</h4>${comments}`;
    }

    function engagementView() {
        const g = S.external.engagement;
        if (!g || !g.ok || !g.report) return `<div class="jv-grid">${briefPanel('engagement')}${panel('engagement-wait', 'Engagement', waiting('engagement', 'Reading the engagement scout…'), { wide: true })}</div>`;
        const r = g.report;
        const t = r.totals;
        const net = (k) => (g.networks.find((n) => n.network === k) || {}).name || k;
        const who = (d) => (d.author || {}).name || (d.author || {}).handle || '';
        const meta = (d) => [who(d), `♥ ${fmt((d.metrics || {}).likes || 0)}`, `↩ ${fmt((d.metrics || {}).replies || 0)}`, `⟳ ${fmt((d.metrics || {}).reposts || 0)}`, (d.metrics || {}).views ? `▶ ${fmt(d.metrics.views)}` : '', `score ${d.score}`, when(d.createdAt)].filter(Boolean).join(' · ');
        const head = (d) => `<p class="jv-prop-title"><strong>${esc(egHeadline(d))}</strong>${egReportChip(d)} <span class="jv-chip">${esc(net(d.network))}</span>${d.topic ? ` <span class="jv-chip">${esc(d.topic)}</span>` : ''} <span class="jv-chip">${esc(d.lang || '?')}</span></p>
            <p class="jv-prop-why">${esc(meta(d))}</p>${d.about ? `<p class="jv-prop-why">${esc(d.about)}${d.why ? ' · ' + esc(d.why) : ''}</p>` : ''}${egReportLine(d)}`;
        const draftOf = (d) => (S.egDrafts[d.key] !== undefined ? S.egDrafts[d.key] : d.actions.reply.draft);
        const waitingList = g.waiting.filter(egKeep);
        const shown = S.egAll ? waitingList : waitingList.slice(0, EG_SHOWN);
        const more = waitingList.length > EG_SHOWN ? `<div class="jv-actions"><button type="button" class="jv-btn" data-eg-all="${S.egAll ? 'off' : 'on'}">${S.egAll ? 'Show fewer' : `Show all ${waitingList.length}`}</button></div>` : '';
        const waitingBody = egFilter(g.waiting) + (waitingList.length ? `<ol class="jv-props">${shown.map((d) => `<li class="jv-prop lv-info"><span class="jv-prop-rank">${esc(String(Math.round(d.score)))}</span><div class="jv-prop-body">${head(d)}
            ${d.chain ? `<p class="jv-prop-why">${esc(who(d))} commented on our ${d.chain.on === 'post' ? 'post' : 'reply'}${d.chain.ours ? `: “${esc(d.chain.ours)}”` : ''}</p>` : ''}
            <details><summary>${d.chain ? 'Show the comment' : 'Show the post'}</summary><pre class="jv-pre">${esc(d.text)}</pre></details>
            <textarea rows="3" class="jv-eg-draft" data-keep="eg-${esc(d.key)}" data-eg-draft="${esc(d.key)}" maxlength="${EG_NETWORK_LIMIT[d.network] || 300}" aria-label="Reply to ${esc(who(d))}">${esc(draftOf(d))}</textarea>
            <div class="jv-prop-acts"><button type="button" data-eg-decide="approve" data-key="${esc(d.key)}"${S.pending['eg:' + d.key] ? ' disabled' : ''}>Approve</button><button type="button" data-eg-decide="dismiss" data-key="${esc(d.key)}"${S.pending['eg:' + d.key] ? ' disabled' : ''}>Dismiss</button>${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">Open the post ↗</a>` : ''}
            <span class="jv-note">${fmt(draftOf(d).length)} / ${fmt(EG_NETWORK_LIMIT[d.network] || 300)} · expires ${esc(when(d.actions.reply.expiresAt))}</span></div></div></li>`).join('')}</ol>${more}`
            : `<p class="jv-empty">${g.paused ? 'Paused: no replies are drafted.' : g.waiting.length ? 'None of the waiting replies is of this kind.' : 'No reply is waiting. Drafts arrive here and on your phone as the scout finds posts worth answering.'}</p>`);
        const last = g.lastRun;
        const readTotal = (run) => Object.values((run && run.read) || {}).reduce((a, b) => a + b, 0);
        const statusBody = stats([
            { label: 'State', value: g.paused ? 'paused' : 'running', alert: g.paused },
            { label: 'Likes, reposts, follows', value: g.live ? 'live' : 'dry run' },
            { label: 'Last run', value: last ? when(last.at) : 'never', alert: g.stale },
            { label: 'Read last run', value: last ? readTotal(last) : '—' },
            { label: 'New in field', value: last ? last.fresh : '—' },
            { label: 'Gemini read', value: last ? last.asked : '—', alert: !!(last && last.aiError) }
        ]) + `<div class="jv-actions"><button type="button" class="jv-btn${g.paused ? ' is-primary' : ' danger'}" data-eg-pause="${g.paused ? 'off' : 'on'}">${g.paused ? 'Resume engagement' : 'Pause everything'}</button><button type="button" class="jv-btn${g.live ? '' : ' is-primary'}" data-eg-live="${g.live ? 'off' : 'on'}">${g.live ? 'Back to a dry run' : 'Go live'}</button><button type="button" class="jv-btn" data-run="engagementScout">Run the scout now</button></div>`
            + table([['Run', (x) => `<span class="jv-nowrap">${esc(when(x.at))}</span>`], ['Read', (x) => fmt(readTotal(x))], ['New', (x) => fmt(x.fresh)], ['Engage', (x) => fmt(x.engaged)], ['Drafts', (x) => fmt(x.drafted)], ['Done', (x) => (x.live === false && x.dry ? `${fmt(x.dry)} dry` : fmt((x.done || 0) + (x.posted || 0)))],
                ['Problems', (x) => `<span class="jv-note">${esc([Object.keys(x.errors || {}).map((k) => k + ': ' + x.errors[k]).join('; '), Object.keys(x.acted || {}).filter((k) => x.acted[k].error).map((k) => k + ' poster: ' + x.acted[k].error).join('; '), x.aiError ? 'Gemini: ' + x.aiError : '', x.paused ? 'paused' : ''].filter(Boolean).join(' · '))}</span>`]], g.runs.slice(0, 8), 'No runs yet.');
        const accounts = g.accounts || [];
        const accountRow = (a) => `<li><strong>${esc(a.name)}</strong> ${a.connected ? `<span class="jv-chip c-fast">connected as ${esc(a.account)}</span>${a.bot ? ' <span class="jv-chip">bot flag on</span>' : ''}` : '<span class="jv-chip c-slow">not connected</span>'}${a.error ? ` <span class="jv-chip c-slow">${esc(a.error)}</span>` : ''}
            ${a.network === 'bluesky' ? `<form class="jv-eg-bluesky" data-eg-bluesky><label>Handle<input name="handle" autocomplete="off" value="${esc(a.account || 'qalaburlreview.bsky.social')}"></label><label>App password<input name="password" type="password" autocomplete="off" placeholder="xxxx-xxxx-xxxx-xxxx"></label><button type="submit" class="jv-btn">${a.connected ? 'Replace' : 'Connect Bluesky'}</button></form><span class="jv-note">bsky.app &gt; Settings &gt; Privacy and security &gt; App passwords. Never the account password.</span>`
                : a.network === 'telegram' ? `<form class="jv-eg-bluesky" data-eg-telegram><label>Bot token<input name="token" type="password" autocomplete="off" placeholder="123456789:AAE…"></label><button type="submit" class="jv-btn${a.connected ? '' : ' is-primary'}">${a.connected ? 'Replace' : 'Connect Telegram'}</button></form><span class="jv-note">BotFather &gt; /mybots &gt; the bot &gt; API Token. The bot answers in @qalab_live's discussion group, as its admin.</span>`
                : `<button type="button" class="jv-btn${a.connected ? '' : ' is-primary'}" data-eg-connect="${esc(a.network)}">${a.connected ? 'Reconnect' : 'Connect ' + esc(a.name)}</button>`}
            ${a.connected ? ` <button type="button" class="jv-link" data-eg-disconnect="${esc(a.network)}">Disconnect</button>` : ''}</li>`;
        const accountsBody = `<ul class="jv-facts jv-eg-accounts">${accounts.map(accountRow).join('')}</ul><p class="jv-note">X, LinkedIn, Facebook, Instagram, Threads and TikTok act through the Mac's browser agent (#1991), signed in once in its own Chrome profile. Reddit answers under our r/QALabLiveReports posts through the Reddit app, synced every hour (#2614). In the field, Telegram and Reddit act as your own accounts through the same agent, signed in at web.telegram.org and reddit.com.</p>`;
        const used = (k, a) => ((g.used || {})[k] || {})[a] || 0;
        const joins = g.joins || { log: [], found: {}, caps: {}, used: {}, warmup: {} };
        const joinsBody = `<p class="jv-note">${Object.keys(joins.caps).map((k) => `${esc(net(k))}: ${fmt(used(k, 'join'))} of ${fmt(joins.caps[k])} today, ${fmt(joins.found[k] || 0)} found to join${joins.warmup[k] ? `, warming up since ${esc(when(joins.warmup[k]))}` : ', warm-up starts with the first live join'}`).join(' · ')}</p>`
            + table([['Group', (j) => `<a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.name)}</a><br><span class="jv-note">${esc(net(j.network))}${j.kind ? ' ' + esc(j.kind) : ''}${j.topic ? ' · ' + esc(j.topic) : ''}</span>`], ['Language', (j) => esc(j.lang || '—')], ['Members', (j) => fmt(j.members)],
                ['Status', (j) => `<span class="jv-chip ${j.status === 'joined' ? 'c-fast' : j.status === 'failed' ? 'c-slow' : ''}">${esc(j.status === 'dry' ? 'would join (dry run)' : j.status === 'member' ? 'already in it' : j.status)}</span>${j.error ? `<br><span class="jv-note">${esc(j.error)}</span>` : ''}`], ['When', (j) => `<span class="jv-nowrap">${esc(when(j.at))}</span>`]], joins.log, 'No join yet. The Mac finds groups with its topic searches and joins the best ones once live.');
        const netBody = table([['Network', (n) => `<strong>${esc(n.name)}</strong>`], ['Reads', (n) => `<span class="jv-chip ${n.reads === 'API' ? 'c-fast' : n.reads.startsWith('needs') ? 'c-slow' : ''}">${esc(n.reads)}</span>${n.error ? `<br><span class="jv-note">${esc(n.error)}</span>` : ''}`],
            ['Last run', (n) => fmt(n.lastRead)], ['In field', (n) => fmt(n.row ? n.row.candidates : 0)],
            ['Today', (n) => (EG_NETWORK_LIMIT[n.network] ? ['like', 'repost', 'follow', 'reply'].map((a) => `${a} ${used(n.network, a)}/${(g.caps || {})[a]}`).join(' · ') + (joins.caps && joins.caps[n.network] !== undefined ? ` · join ${used(n.network, 'join')}/${joins.caps[n.network]}` : '') : '—')],
            ['Acting', (n) => `<span class="jv-note">${esc(n.acts)}</span>`]], g.networks);
        const posts = g.posts.filter(egKeep);
        const postsBody = egFilter(g.posts) + table([['Post', (d) => `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(egHeadline(d, 110))}</a>${egReportChip(d)}<br><span class="jv-note">${esc(net(d.network))} · ${esc(meta(d))}</span>${d.about ? `<br><span class="jv-note">${esc(d.about)}</span>` : ''}${d.report ? `<br><span class="jv-note">Names ${esc(d.report.host)}, scores ${fmt(d.report.score)}</span>` : ''}`],
            ['Topic', (d) => esc(d.topic)], ['Trend', (d) => fmt(d.trend)], ['Plan', egChips]], posts, S.egOnly === 'all' ? 'No posts from our field in this range yet.' : 'No post of this kind in this range.');
        const replyChip = (r) => `<span class="jv-chip ${EG_STATUS_CHIP[r.status] || ''}">${esc(r.status)}${r.edited ? ', edited' : ''}</span>`;
        const approved = g.approved.filter(egKeep);
        const approvedBody = egFilter(g.approved) + (approved.length ? `<ul class="jv-facts">${approved.map((d) => `<li>${replyChip(d.actions.reply)}${egReportChip(d)} <strong>${esc(net(d.network))}</strong> · <a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(egHeadline(d, 80))}</a>${d.actions.reply.url ? ` · <a href="${esc(d.actions.reply.url)}" target="_blank" rel="noopener">Our reply ↗</a>` : ''}<br><span class="jv-note">${esc(d.actions.reply.draft)}</span>${d.actions.reply.error ? `<br><span class="jv-note">${esc(d.actions.reply.error)}</span>` : ''}</li>`).join('')}</ul>`
            : `<p class="jv-empty">${g.approved.length ? 'No approved reply of this kind.' : 'Nothing approved yet.'}</p>`);
        const iv = r.invites || { searched: 0, matched: 0, drafted: 0, approved: 0, edited: 0, dismissed: 0, posted: 0, skips: [], networks: [] };
        const ivSteps = [{ label: 'Posts naming a reviewed site', value: iv.matched }, { label: 'Invites drafted', value: iv.drafted }, { label: 'Approved', value: iv.approved + iv.edited }, { label: 'Posted', value: iv.posted }];
        const invitesBody = funnel(ivSteps) + stats([{ label: 'Sites looked for', value: iv.searched }, { label: 'Waiting now', value: g.waiting.filter(egIsReport).length }, { label: 'Dismissed', value: iv.dismissed }, { label: 'Edited', value: iv.edited }])
            + bars(iv.networks.map((x) => ({ label: net(x.label), value: x.value })), { color: COLORS.amber, empty: 'No post named a reviewed site in this range.' })
            + (iv.skips.length ? `<p class="jv-note">Left alone: ${iv.skips.map((x) => esc(x.label.replace(/_/g, ' ')) + ' ' + fmt(x.value)).join(' · ')}</p>` : '')
            + `<div class="jv-actions"><button type="button" class="jv-btn" data-eg-only="${S.egOnly === 'report' ? 'all' : 'report'}">${S.egOnly === 'report' ? 'Show every reply' : 'Show only report replies'}</button><a class="jv-btn" href="#stats/outreach/${esc(S.range)}">Clicks, runs and payments →</a></div>`;
        const done = (t.like_done || 0) + (t.repost_done || 0) + (t.follow_done || 0);
        const dry = (t.like_dry || 0) + (t.repost_dry || 0) + (t.follow_dry || 0);
        const daily = g.daily || [];
        const funnelSteps = [{ label: 'Drafted', value: t.drafted }, { label: 'Approved', value: t.approved + t.edited }, { label: 'Posted', value: t.posted }];
        const reportsBody = (g.reports.length ? table([['Report', (x) => `<strong>${esc(x.period)}</strong> <span class="jv-note">${esc(x.from)}${x.to !== x.from ? ' to ' + esc(x.to) : ''}</span>`], ['In field', (x) => fmt((x.totals || {}).candidates || 0)], ['Likes', (x) => fmt((x.totals || {}).like || 0)], ['Drafts', (x) => fmt((x.totals || {}).drafted || 0)], ['Approval', (x) => (x.approvalRate === null ? '—' : x.approvalRate + '%')], ['Sent', (x) => `<span class="jv-nowrap">${esc(when(x.at))}</span>`]], g.reports) : '<p class="jv-empty">No report sent yet. The daily one goes out at 20:30.</p>')
            + `<div class="jv-actions"><button type="button" class="jv-btn" data-eg-report="daily">Send today's report</button><button type="button" class="jv-btn" data-eg-report="weekly">Send the weekly report</button><button type="button" class="jv-btn" data-eg-report="monthly">Send last month's report</button></div>`;
        const c = g.settings;
        const num = (name, value, label, step) => `<label>${esc(label)}<input type="number" min="0" step="${step || 1}" name="${name}" value="${esc(value)}"></label>`;
        const settingsBody = `<form class="jv-eg-settings" data-eg-settings>
            <fieldset><legend>Daily caps per network</legend>${['like', 'repost', 'follow', 'reply'].map((a) => num('cap-' + a, c.caps[a], a)).join('')}${num('cap-join', c.caps.join || 0, 'join (Telegram, Reddit; warmed up)')}</fieldset>
            <fieldset><legend>Score needed</legend>${['like', 'repost', 'follow', 'reply'].map((a) => num('th-' + a, c.thresholds[a], a, 0.5)).join('')}${num('worth', c.worth, 'Gemini worth for a reply (0-1)', 0.05)}${num('perRun', c.perRun, 'Posts Gemini reads a run')}${num('maxAgeHours', c.maxAgeHours, 'Oldest post (hours)')}</fieldset>
            <label>Competitors, never answered under (one per line)<textarea name="competitors" rows="4" data-keep="eg-competitors">${esc(c.competitors.join('\n'))}</textarea></label>
            <label>Our own handles, never engaged<textarea name="own" rows="2" data-keep="eg-own">${esc(c.own.join('\n'))}</textarea></label>
            <div class="jv-actions"><button type="submit" class="jv-btn is-primary">Save settings</button>${c.updatedAt ? `<span class="jv-note">Saved ${esc(when(c.updatedAt))}</span>` : ''}</div></form>`;
        return kpis([
            { label: 'Posts in our field', value: t.candidates }, { label: 'Likes planned', value: t.like }, { label: 'Reposts planned', value: t.repost }, { label: 'Follows planned', value: t.follow },
            { label: g.live ? 'Done' : 'Done (dry run)', value: g.live ? done : dry, delta: g.live && dry ? `${fmt(dry)} in the dry run` : '' },
            { label: 'Replies waiting', value: g.waiting.length, alert: g.waiting.length > 0 }, { label: 'Replies posted', value: t.posted, delta: `${fmt(t.approved + t.edited)} approved` },
            { label: 'Approval rate', value: r.approvalRate === null ? '—' : r.approvalRate + '%' }, { label: 'Scout', value: g.paused ? 'paused' : last ? when(last.at) : 'never', alert: g.paused || g.stale }
        ]) + `<div class="jv-grid">${briefPanel('engagement')}
            ${panel('engagement-waiting', `Replies waiting for you${g.waiting.length ? ' · ' + g.waiting.length : ''}`, waitingBody, { wide: true, data: g.waiting.map((d) => ({ network: d.network, url: d.url, author: who(d), score: d.score, draft: d.actions.reply.draft, expires: d.actions.reply.expiresAt })), note: 'Approve sends your edit when you changed the text. Drafts expire 6 hours after the scout found the post, or a day for an answer to a comment on our reply. No draft is made in a conversation we already answered; on Bluesky, Mastodon and YouTube the poster also checks the post itself before it sends, and comments on our replies, posts and clips there come back here to like and answer. An approved reply posts at once on Bluesky, Mastodon and YouTube (in a dry run too); on X, LinkedIn, Meta and TikTok it waits for the Mac\'s browser agent (#1991).' })}
            ${panel('engagement-status', 'Scout', statusBody, { wide: true, data: g.runs, note: 'Every 30 minutes. Pause stops every planned action, draft, reply and push at once; the scout keeps reading so the reports stay whole. In a dry run, planned likes, reposts and follows are only logged; Go live carries them out.' })}
            ${panel('engagement-accounts', 'Accounts', accountsBody, { wide: true, data: accounts, note: 'The poster acts as these accounts. Connect signs in on the network\'s own page and comes back here; Mastodon is marked as a bot when it connects.' })}
            ${panel('engagement-joins', 'Joins', joinsBody, { wide: true, data: joins.log, note: 'Telegram channels and groups and subreddits in our field, found by topic searches in any language. One join a day for the first two weeks after the first live join, two in the third, then the daily cap in Settings.' })}
            ${panel('engagement-networks', 'Networks', netBody, { wide: true, data: g.networks.map((n) => ({ network: n.name, reads: n.reads, lastRead: n.lastRead, error: n.error, acting: n.acts })) })}
            ${panel('engagement-daily', 'Per day', area(daily.map((d) => d.day), [{ name: 'In field', values: daily.map((d) => d.candidates), color: COLORS.cyan }, { name: 'Likes', values: daily.map((d) => d.like), color: COLORS.green }, { name: g.live ? 'Done' : 'Done (dry run)', values: daily.map((d) => (g.live ? d.done : d.dry) || 0), color: COLORS.pink }, { name: 'Replies drafted', values: daily.map((d) => d.drafted), color: COLORS.amber }, { name: 'Approved', values: daily.map((d) => d.approved), color: COLORS.violet }]), { wide: true, data: daily })}
            ${panel('engagement-posts', `Top posts in our field · ${fmt(g.posts.length)}`, postsBody, { wide: true, data: g.posts.map((d) => ({ network: d.network, url: d.url, author: who(d), title: d.title || d.text, about: d.about, topic: d.topic, lang: d.lang, score: d.score, trend: d.trend, likes: d.metrics.likes, replies: d.metrics.replies, reposts: d.metrics.reposts, verdict: d.verdict, skip: d.skip })) })}
            ${panel('engagement-invites', 'Report replies', invitesBody, { data: Object.assign({}, iv, { steps: ivSteps }), note: 'Each scout run looks for posts that name a site from the public Live Reports and drafts an invite to its free report in the post\'s language, at most one per site every 30 days and none where the owner had our mail. They wait above with a Report reply badge; the Outreach tab shows the clicks, runs and payments per network and per post, and every Sunday a results ticket goes on the board.' })}
            ${panel('engagement-owner-tags', `Owner tags${g.ownerTags ? ' · ' + otState(g.ownerTags) : ''}`, ownerTagsBody(g.ownerTags, net), { wide: true, data: g.ownerTags ? (g.ownerTags.list || []) : [], note: 'Daily at 10:15 (Bogotá). Under every post about a reviewed site, a comment tags the site\'s owners (their profile links on the site, approved as found) and the approved accounts around them, at most two comments a post; owners also get one reply under their latest Bluesky, Mastodon or YouTube post. Gemini\'s suggestions wait here and as a push. Jarvis approves on its own the ones whose handle resolves or matches an owner\'s, and blocks anyone who answers asking us to stop. A blocked account is never tagged.' })}
            ${panel('engagement-funnel', 'Reply funnel', funnel(funnelSteps) + stats([{ label: 'Dismissed', value: t.dismissed }, { label: 'Expired', value: t.expired, alert: t.drafted > 4 && t.expired / t.drafted > 0.5 }, { label: 'Edited', value: t.edited }, { label: 'Avg time to decide', value: r.avgDecideMin === null ? '—' : r.avgDecideMin + ' min' }]), { data: funnelSteps })}
            ${panel('engagement-topics', 'Topics', pie(r.topics, { unit: 'posts', empty: 'No posts in this range.' }), { data: r.topics })}
            ${panel('engagement-langs', 'Languages', pie(r.langs, { unit: 'posts', empty: 'No posts in this range.' }), { data: r.langs })}
            ${panel('engagement-tags', 'Trending keywords', bars(r.tags.map((x) => ({ label: x.label.replace(/_/g, ' '), value: x.value })), { color: COLORS.violet, empty: 'No keywords yet.' }), { data: r.tags })}
            ${panel('engagement-skips', 'Left alone, and why', bars(r.skips.map((x) => ({ label: x.label.replace(/_/g, ' '), value: x.value })), { color: COLORS.pink, empty: 'Nothing left alone in this range.' }), { data: r.skips, note: 'own: our posts · competitor: a vendor on your list · sensitive: news about deaths, wars, elections · spam: hashtag walls · old: past the age limit · political, argument, angry, promo: Gemini\'s read · cap: the daily cap was reached.' })}
            ${panel('engagement-authors', 'Authors seen most', bars(r.authors, { color: COLORS.green, empty: 'No authors yet.' }), { data: r.authors })}
            ${panel('engagement-approved', 'Approved replies', approvedBody, { wide: true, data: g.approved.map((d) => ({ network: d.network, url: d.url, reply: d.actions.reply.draft, edited: !!d.actions.reply.edited, at: d.actions.reply.decidedAt })) })}
            ${panel('engagement-reports', 'Reports', reportsBody, { wide: true, data: g.reports, note: 'Daily at 20:30, weekly on Sunday at 20:40, monthly on the 1st at 08:10 (Bogotá), by email and push.' })}
            ${panel('engagement-settings', 'Settings', settingsBody, { wide: true })}
        </div>${needList(g)}`;
    }

    async function egDecide(key, decision) {
        const g = S.external.engagement;
        const d = g && g.waiting ? g.waiting.find((x) => x.key === key) : null;
        if (!d) return;
        if (decision === 'dismiss' && !confirmRun('dismiss this reply draft')) return;
        const text = S.egDrafts[key] !== undefined ? S.egDrafts[key].trim() : d.actions.reply.draft;
        const edited = decision === 'approve' && text !== d.actions.reply.draft;
        S.pending['eg:' + key] = true;
        render();
        const out = await call('engagement-decide', { key, decision: edited ? 'edit' : decision, text }).catch((error) => ({ ok: false, error: error.message }));
        S.pending['eg:' + key] = false;
        if (!out.ok) { toast('Not saved: ' + out.error, 6000); render(); return; }
        delete S.egDrafts[key];
        g.waiting = g.waiting.filter((x) => x.key !== key);
        render();
        if (out.status === 'copy' && out.text && navigator.clipboard) await navigator.clipboard.writeText(out.text).catch(() => null);
        toast(out.message + (out.status === 'copy' ? ' The text is on your clipboard.' : ''), 7000);
        loadExternal(['engagement']);
    }

    async function egSettings(patch, ask) {
        if (ask && !confirmRun(ask)) return;
        const out = await call('engagement-settings', { settings: patch }).catch((error) => ({ ok: false, error: error.message }));
        toast(out.ok ? (patch.paused === true ? 'Engagement is paused.' : patch.paused === false ? 'Engagement is running again.' : patch.live === true ? 'Live: the next scout run carries out the planned likes, reposts and follows.' : patch.live === false ? 'Back to a dry run: planned actions are only logged.' : 'Settings saved.') : 'Not saved: ' + out.error, 6000);
        loadExternal(['engagement']);
    }

    // Accounts (#1990): YouTube and Mastodon sign in on their own page and come back to the booking callback.
    async function egConnect(body, ask) {
        if (ask && !confirmRun(ask)) return;
        const out = await call('engagement-connect', body).catch((error) => ({ ok: false, error: error.message }));
        if (out.ok && out.url) { window.open(out.url, '_blank', 'noopener'); toast(`Sign in on the ${out.network} page that opened, then come back and refresh.`, 7000); return; }
        toast(out.ok ? out.message : 'Not connected: ' + out.error, 7000);
        loadExternal(['engagement']);
    }

    async function egReport(period) {
        if (!confirmRun(`mail and push the ${period} engagement report now`)) return;
        const out = await call('engagement-report', { period }).catch((error) => ({ ok: false, error: error.message }));
        toast(out.ok ? (out.sent ? 'Sent: ' + out.subject : 'Built, but the mail did not go out.') : 'Not sent: ' + out.error, 7000);
        loadExternal(['engagement']);
    }

    async function otSettings(patch, ask) {
        if (!confirmRun(ask)) return;
        const out = await call('owner-tags-settings', { settings: patch }).catch((error) => ({ ok: false, error: error.message }));
        toast(out.ok ? out.message : 'Not saved: ' + out.error, 6000);
        loadExternal(['engagement']);
    }

    async function otRun() {
        if (!confirmRun('run owner tags now (a dry run only counts; live queues the comments)')) return;
        S.pending['ot:run'] = true;
        render();
        const out = await call('owner-tags-run').catch((error) => ({ ok: false, error: error.message }));
        S.pending['ot:run'] = false;
        S.otNote = out.ok ? out.note : '';
        toast(out.ok ? 'Owner tags ran: ' + out.note : 'Not run: ' + out.error, 9000);
        loadExternal(['engagement']);
    }

    async function otAccount(body, ask) {
        if (ask && !confirmRun(ask)) return;
        const id = body.network + ':' + String(body.handle || '').toLowerCase().replace(/\//g, '|');
        S.pending['ot:' + id] = true;
        render();
        const out = await call('owner-tags-account', body).catch((error) => ({ ok: false, error: error.message }));
        S.pending['ot:' + id] = false;
        toast(out.ok ? out.message : 'Not saved: ' + out.error, 6000);
        loadExternal(['engagement']);
        return out;
    }

    async function campaignAct(t) {
        const { mkCampaign: action, id, name, leads, start } = t.dataset;
        const ask = action === 'pause' ? `pause ${name} now` : `activate ${name}${Number(leads) ? '' : ' (it has no leads yet, so nothing sends until leads are uploaded)'}${start ? ', sending from ' + start : ''}`;
        if (!confirmRun(ask)) return;
        t.disabled = true;
        const out = await call('marketing-campaign', { id, action, name }).catch((error) => ({ ok: false, error: error.message }));
        toast(out.ok ? `${out.name || name} is ${out.status}.` : 'Not done: ' + out.error, 6000);
        loadExternal(['marketing', 'outreach']);
    }

    async function resendAct(t) {
        const { mkResend: id, to, org, other } = t.dataset;
        const target = other ? (prompt(`Who else at ${org || 'the organisation'} should get it? Their email address:`, '') || '').trim() : to;
        if (!target || !confirmRun(`send the email to ${to} again${target !== to ? ', this time to ' + target : ''} (forwarded with its original text)`)) return;
        t.disabled = true;
        const out = await call('marketing-resend', { id, to: target }).catch((error) => ({ ok: false, error: error.message }));
        toast(out.ok ? `Sent again to ${out.to} from ${out.from}.` : 'Not sent: ' + out.error, 7000);
        t.disabled = false;
        loadExternal(['marketing']);
    }

    const MK_ASK = {
        approve: (d) => (d.on === 'no' ? `unapprove ${d.email}` : `approve ${d.email} for upload`),
        'approve-week': (d) => `approve every complete lead in ${d.week}`,
        upload: (d) => `upload ${d.week}'s approved leads to their Instantly campaigns (they start getting emails on the campaign's start date once it is active)`,
        linkedin: (d) => `mark the LinkedIn request to ${d.name} as ${d.sent === 'no' ? 'not sent' : 'sent'}`,
        dnc: (d) => `never contact ${d.value} again and block it in Instantly`,
        run: (d) => `run the ${d.job} job now (it can take half an hour)`,
        'lead-set': (d) => `set ${d.field} for ${d.email} to "${d.value}"`,
        'lead-drop': (d) => (d.on === 'no' ? `bring ${d.email} back to the leads` : `drop ${d.email}: it is never approved or uploaded`),
        'allow-personal': (d) => `allow the personal address ${d.email} for outreach`
    };

    async function mkCommand(body, ask) {
        if (!confirmRun(ask)) return null;
        const out = await call('marketing-command', body).catch((error) => ({ ok: false, error: error.message }));
        toast(out.ok ? (out.sent ? `Sent to ${out.sent.to}.` : `${out.label}: ${out.syncing ? 'the outreach Action does it in a few minutes' : 'the outreach Action does it on its next sync, within 3 hours'}${out.blocked ? '; blocked in Instantly now' : ''}.`) : 'Not done: ' + out.error, 7000);
        loadExternal(['marketing-sync']);
        return out;
    }

    async function mkCmdClick(t) {
        const d = t.dataset;
        const body = { action: d.mkCmd };
        if (d.mkCmd === 'lead-set') {
            const value = window.prompt(`${d.field} for ${d.email}`, d.current || '');
            if (!value || !value.trim()) return;
            d.value = value.trim();
        }
        ['week', 'email', 'date', 'name', 'value', 'reason', 'job', 'field'].forEach((k) => { if (d[k] !== undefined) body[k] = d[k]; });
        if (d.on !== undefined) body.on = d.on !== 'no';
        if (d.sent !== undefined) body.sent = d.sent !== 'no';
        t.disabled = true;
        const out = await mkCommand(body, MK_ASK[d.mkCmd] ? MK_ASK[d.mkCmd](d) : d.mkCmd);
        if (!out || !out.ok) t.disabled = false;
    }

    // LinkedIn has no invitation API and company pages cannot connect, so Carlos clicks Connect himself (#2479).
    // The clipboard write and window.open run before any await, while the click still counts as a user gesture.
    async function liSend(t) {
        const { liSend: url, date, name, note } = t.dataset;
        const copied = note && navigator.clipboard ? navigator.clipboard.writeText(note).then(() => true, () => false) : Promise.resolve(false);
        window.open(url, '_blank', 'noopener');
        t.disabled = true;
        const [ok, out] = await Promise.all([copied, call('marketing-command', { action: 'linkedin', date, name, sent: true }).catch((error) => ({ ok: false, error: error.message }))]);
        const how = ok ? 'Note copied: on LinkedIn click Connect, Add a note, paste and Send.' : note ? 'Copy failed; the note is under the name. On LinkedIn click Connect, Add a note and Send.' : 'On LinkedIn click Connect and Send.';
        toast(out.ok ? `${how} ${name} is marked sent.` : `${how} Not marked sent: ${out.error}`, 10000);
        if (!out.ok) t.disabled = false;
        loadExternal(['marketing-sync']);
    }

    async function targetAct(t) {
        const d = t.dataset;
        const row = ((S.external.targets && S.external.targets.targets) || []).find((x) => x.key === d.key) || { label: d.key };
        const body = { action: d.tgAct, key: d.key };
        if (d.tgAct === 'log' && d.key === 'links') {
            body.url = (window.prompt(`Address of the page that links to carlosandmunoz.com or qalabreview.com (${row.label})`, '') || '').trim();
            if (!body.url) return;
            body.note = (window.prompt('Who is it? (optional)', '') || '').trim();
        } else if (d.tgAct === 'log') {
            const note = window.prompt(`Log one for "${row.label}". Who or what was it? (optional)`, '');
            if (note === null) return;
            body.note = note.trim();
        } else if (d.tgAct === 'correct') {
            const value = window.prompt(`The real count for "${row.label}" today; new ones add to it.`, d.current);
            if (value === null || !value.trim()) return;
            body.value = Number(value);
        } else if (d.tgAct === 'done') {
            const proof = window.prompt(`Mark "${row.label}" done whatever the count. Proof (a link or a note):`, '');
            if (proof === null) return;
            body.proof = proof.trim();
        } else if (d.tgAct === 'remove') {
            if (!confirmRun('remove this entry from the count')) return;
            body.id = d.id;
        } else if (d.tgAct === 'undone' && !confirmRun(`stop holding "${row.label}" done`)) return;
        t.disabled = true;
        const out = await call('outreach-target', body).catch((error) => ({ ok: false, error: error.message }));
        const check = out.check ? (out.check.ok ? ` ${out.check.detail}` : ` Not counted yet: ${out.check.detail}`) : '';
        toast(out.ok ? `${out.label}.${check}` : 'Not done: ' + out.error, 8000);
        t.disabled = false;
        loadExternal(['targets']);
    }

    async function leadReview(t) {
        const { mkRereview: host, lang } = t.dataset;
        if (!confirmRun(`review ${host} again now, so its Live Report can be published`)) return;
        t.disabled = true;
        const out = await call('review', { url: 'https://' + host + '/', lang: lang || 'en' }).catch((error) => ({ ok: false, error: error.message }));
        toast(out.ok ? `Reviewing ${out.host}. Once its Live Report is published, Jarvis fills the lead.` : 'Not started: ' + out.error, 6000);
        if (!out.ok) t.disabled = false;
    }

    async function mkReply(t) {
        const id = t.dataset.mkReply;
        const box = root.querySelector(`[data-mk-draft="${CSS.escape(id)}"]`);
        const text = box ? box.value.trim() : '';
        if (!text) { toast('Write the answer first.', 4000); return; }
        t.disabled = true;
        const out = await mkCommand({ action: 'reply', id, text }, `send this answer to ${t.dataset.to} from the campaign's mailbox, in the same thread`);
        if (out && out.ok) delete S.mkDrafts[id]; else t.disabled = false;
    }

    // #2139: the command deck. The hologram only shows on wide screens (CSS); holoSync() runs it while it is in view.
    function commandDeck(W) {
        const d = (key) => (W.deck.find((k) => k.key === key) || {}).value;
        return `<div class="jv-command"><div class="jv-holo" aria-hidden="true"><canvas data-holo></canvas><div class="jv-holo-read"><b>${fmt(d('readiness'))}</b><small>ready</small><b>${fmt(d('visits'))}</b><small>visits</small></div></div>${kpis(W.deck)}</div>`;
    }

    function trendPanel(W) {
        const t = W.trend;
        return panel('overview-trend', 'Every product per day', area(t.labels, t.series.map((x, k) => ({ name: x.name, values: x.values, color: SLICES[k % SLICES.length] })), { fill: false }),
            { wide: true, data: t.labels.map((day, k) => Object.assign({ day }, ...t.series.map((x) => ({ [x.key]: x.values[k] })))), note: 'Visits for the sites, opens for URL Review, messages for the inbox, events for the hub.' });
    }

    // Products as list-detail on wide screens; narrow screens keep the tiles (CSS swaps them).
    function productsPanel(W) {
        const list = W.products;
        if (!list.length) return '';
        const pick = list.find((p) => p.key === S.pick) || list[0];
        const alertsOf = (key) => S.brief.filter((b) => inTab(b, key) && (b.level === 'alert' || b.level === 'warn')).length;
        const row = (p) => { const k = p.kpis[0]; const n = alertsOf(p.key); return `<button type="button" class="jv-ld-row" data-pick="${p.key}" aria-pressed="${p.key === pick.key}"><span class="jv-ld-name">${esc(p.name)}${n ? ` <b class="jv-badge">${n}</b>` : ''}</span><strong>${k ? fmt(k.value) : '—'}</strong><small>${k ? esc(k.label) : 'no data yet'}</small>${spark(p.series.values, n ? COLORS.amber : COLORS.cyan)}</button>`; };
        const lead = pick.kpis[0];
        const detail = `<div class="jv-ld-detail"><div class="jv-ld-head"><h3>${esc(pick.name)}</h3><button type="button" class="jv-btn small" data-go="${pick.key}">Open ${esc(pick.name)} →</button></div>
            ${pick.kpis.length ? kpis(pick.kpis) : '<p class="jv-note">No numbers for this product yet.</p>'}
            ${pick.series.labels.length ? area(pick.series.labels, [{ name: lead ? lead.label : 'Per day', values: pick.series.values, color: COLORS.cyan }]) : '<p class="jv-note">No daily series for this product in range.</p>'}</div>`;
        return panel('overview-products', 'Products', `<div class="jv-ld-body"><nav class="jv-ld-list" aria-label="Products">${list.map(row).join('')}</nav>${detail}</div>`, { wide: true, keep: true });
    }

    const holo = { node: null, raf: 0, seen: true, io: null };
    const stillMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // A wireframe globe with a reactor core, turning on its axis; t is milliseconds, so frames line up across re-renders.
    function holoDraw(c, t) {
        const g = c.getContext && c.getContext('2d');
        if (!g) return;
        const w = c.width, h = c.height, cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.34;
        const ay = t * 0.00032, tilt = 0.38, ca = Math.cos(ay), sa = Math.sin(ay), ct = Math.cos(tilt), st = Math.sin(tilt);
        const P = (lat, lon) => {
            const x0 = Math.cos(lat) * Math.cos(lon), y0 = Math.sin(lat), z0 = Math.cos(lat) * Math.sin(lon);
            const x1 = x0 * ca + z0 * sa, z1 = -x0 * sa + z0 * ca;
            const y2 = y0 * ct - z1 * st, z2 = y0 * st + z1 * ct;
            const s = 1 / (1.6 - z2 * 0.35);
            return [cx + x1 * r * s * 1.6, cy - y2 * r * s * 1.6, z2];
        };
        g.clearRect(0, 0, w, h);
        const glow = g.createRadialGradient(cx, cy, 0, cx, cy, r * 1.25);
        glow.addColorStop(0, 'rgba(56,225,255,0.22)'); glow.addColorStop(0.55, 'rgba(56,225,255,0.06)'); glow.addColorStop(1, 'rgba(56,225,255,0)');
        g.fillStyle = glow; g.fillRect(0, 0, w, h);
        g.lineWidth = Math.max(1, w / 260);
        const seg = (a, b) => { const z = (a[2] + b[2]) / 2; g.strokeStyle = `rgba(56,225,255,${(0.18 + 0.62 * (z + 1) / 2).toFixed(3)})`; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
        const N = 40;
        for (let k = -2; k <= 2; k += 1) { const lat = (k * Math.PI) / 6; for (let i = 0; i < N; i += 1) seg(P(lat, (i / N) * 2 * Math.PI), P(lat, ((i + 1) / N) * 2 * Math.PI)); }
        for (let m = 0; m < 8; m += 1) { const lon = (m * Math.PI) / 4; for (let i = 0; i < N / 2; i += 1) seg(P(-Math.PI / 2 + (i / (N / 2)) * Math.PI, lon), P(-Math.PI / 2 + ((i + 1) / (N / 2)) * Math.PI, lon)); }
        g.strokeStyle = 'rgba(169,139,255,0.55)';
        g.beginPath(); g.ellipse(cx, cy, r * 1.32, r * 0.36, -0.32, 0, Math.PI * 2); g.stroke();
        const spin = t * 0.0011;
        g.lineWidth = Math.max(2, w / 110); g.lineCap = 'round';
        [[0.34, 'rgba(56,225,255,0.85)', 1], [0.24, 'rgba(255,181,71,0.75)', -1.6]].forEach(([k, color, dir]) => {
            g.strokeStyle = color;
            for (let i = 0; i < 3; i += 1) { g.beginPath(); g.arc(cx, cy, r * k, spin * dir + (i * 2 * Math.PI) / 3, spin * dir + (i * 2 * Math.PI) / 3 + 1.4); g.stroke(); }
        });
        const core = g.createRadialGradient(cx, cy, 0, cx, cy, r * 0.16);
        core.addColorStop(0, 'rgba(255,255,255,0.95)'); core.addColorStop(0.4, 'rgba(56,225,255,0.8)'); core.addColorStop(1, 'rgba(56,225,255,0)');
        g.fillStyle = core; g.beginPath(); g.arc(cx, cy, r * 0.16, 0, Math.PI * 2); g.fill();
    }

    function holoLoop(t) {
        holo.raf = 0;
        if (!holo.node || !holo.node.isConnected) return;
        holoDraw(holo.node, t);
        holoRun();
    }

    // Draws only while the canvas is shown, on screen and the tab is visible; one still frame under reduced motion.
    function holoRun() {
        const n = holo.node;
        const shown = !!(n && n.isConnected && n.offsetParent !== null);
        if (!shown || !holo.seen || document.hidden || stillMotion()) {
            if (holo.raf) cancelAnimationFrame(holo.raf);
            holo.raf = 0;
            if (shown && stillMotion()) holoDraw(n, 0);
            return;
        }
        const px = Math.round(n.clientWidth * Math.min(2, window.devicePixelRatio || 1));
        if (px && n.width !== px) { n.width = n.height = px; holoDraw(n, performance.now()); }
        if (!holo.raf) holo.raf = requestAnimationFrame(holoLoop);
    }

    function holoSync() {
        const n = root.querySelector('canvas[data-holo]');
        if (n === holo.node) { holoRun(); return; }
        if (holo.io) holo.io.disconnect();
        holo.node = n;
        holo.seen = true;
        if (!n) { holoRun(); return; }
        n.width = n.height = Math.round((n.clientWidth || 200) * Math.min(2, window.devicePixelRatio || 1));
        holoDraw(n, performance.now());
        if ('IntersectionObserver' in window) { holo.io = new IntersectionObserver((seen) => { holo.seen = seen.some((x) => x.isIntersecting); holoRun(); }); holo.io.observe(n); }
        holoRun();
    }
    document.addEventListener('visibilitychange', holoRun);

    function views() {
        const s = S.summaries;
        const e = S.external;
        const out = {};
        const tiles = C.PRODUCTS.filter((p) => p.key !== 'overview' && p.key !== 'console').map((p) => {
            const sum = s[p.key];
            let main = null, series = [];
            if (sum && sum.kpis) { main = sum.kpis[0]; series = sum.series ? sum.series.values : []; }
            const visits = p.key === 'traffic' ? C.siteVisits(s) : null;
            if (visits) { main = visits; series = visits.series.values; }
            else if (p.key === 'traffic' && e.ga4 && e.ga4.ok) { const n = e.ga4.groups.reduce((a, g) => a + g.sessions, 0); const b = e.ga4.groups.reduce((a, g) => a + g.priorSessions, 0); const d = C.delta(n, b); main = { label: 'GA4 sessions', value: n, delta: d.text, dir: d.dir }; series = e.ga4.daily.map((x) => x.sessions); }
            if (p.key === 'systems') { const r = C.readiness(e); main = { label: 'Readiness', value: r === null ? '—' : r + '%' }; }
            if (p.key === 'outreach' && e.outreach && e.outreach.pipeline && e.outreach.pipeline.ok) { main = vsBefore('Prospects reviewed', e.outreach.pipeline.reviews, e.outreach.pipeline.priorReviews); series = e.outreach.pipeline.daily.map((x) => x.reviews); }
            if (p.key === 'marketing') { main = { label: 'Marketing visits', value: socialVisits().reduce((n, r) => n + r.value, 0) + outreachSeen().total }; series = e.social && e.social.ok ? e.social.daily.map((x) => x.posts) : []; }
            if (p.key === 'github' && e['github-work'] && e['github-work'].ok !== false) { const g = e['github-work']; const pass = g.ci && g.ci.ok !== false ? g.ci.passRate : null; main = { label: 'Grade · CI pass rate', value: `${(g.score && g.score.overall && g.score.overall.grade) || '—'} · ${pass === null || pass === undefined ? '—' : pass + '%'}` }; series = (g.history || []).map((x) => x.passRate || 0); }
            if (p.key === 'business' && e.money && e.money.ok) { const d = C.delta(e.money.revenue.usd, e.money.prior.usd); main = { label: 'Revenue (USD)', value: e.money.revenue.usd, delta: d.text, dir: d.dir }; series = e.money.daily.map((x) => x.usd); }
            const alerts = S.brief.filter((b) => inTab(b, p.key) && (b.level === 'alert' || b.level === 'warn')).length;
            return `<button type="button" class="jv-tile${alerts ? ' has-alert' : ''}" data-go="${p.key}"><span class="jv-tile-name">${esc(p.name)}</span><strong>${main ? fmt(main.value) : '—'}</strong><small>${main ? esc(main.label) : ''} ${main && main.delta ? `<em class="${main.dir > 0 ? 'up' : main.dir < 0 ? 'down' : ''}">${esc(main.delta)}</em>` : ''}</small>${spark(series, alerts ? COLORS.amber : COLORS.cyan)}${tileGoal(p.key)}${alerts ? `<b class="jv-badge">${alerts}</b>` : ''}</button>`;
        }).join('');
        const feed = S.feed;
        const W = C.wide({ products: s, external: e, briefing: S.brief });
        S.wide = W;
        const take = () => { const list = S.empties; S.empties = []; return noData(list); };
        S.empties = [];
        out.overview = commandDeck(W) + `<div class="jv-tiles">${tiles}</div><div class="jv-grid">${productsPanel(W)}${trendPanel(W)}${briefPanel('overview')}${proposalsPanel()}${goalsPanel('overview')}
            ${panel('overview-feed', 'Live feed', feed.length ? `<ul class="jv-feed">${feed.map((f) => `<li><time>${when(f.at)}</time><span>${esc(f.text)}</span></li>`).join('')}</ul>` : '<p class="jv-empty">No events yet.</p>', { tall: true, data: feed.map((f) => ({ at: (C.toDate(f.at) || new Date()).toISOString(), event: f.text })) })}
            ${panel('overview-rings', 'Systems at a glance', `<div class="jv-rings">${ring(C.readiness(e), 'ready')}${(e.speed && e.speed.pages ? e.speed.pages : []).map((p) => ring(p.ok ? p.score : null, p.name.replace('URL Review', 'Review'), null, 84)).join('')}</div>`)}
            ${panel('overview-mix', 'Visits by product', bars(['cv', 'studio', 'lab'].map((k) => ({ label: (C.PRODUCTS.find((p) => p.key === k) || {}).name, value: s[k].totals.visits })).concat([{ label: 'URL Review (opens)', value: s.review.totals.opens }]), { color: COLORS.violet }), { data: ['cv', 'studio', 'lab'].map((k) => ({ product: k, visits: s[k].totals.visits, clicks: s[k].totals.clicks, exports: s[k].totals.exports, runs: s[k].totals.runs })) })}
        </div>`;
        out.overview += take();

        const i = s.inbox;
        out.inbox = kpis(i.kpis) + `<div class="jv-grid">${briefPanel('inbox')}${goalsPanel('inbox')}
            ${panel('inbox-trend', 'Messages and ratings per day', area(i.series.labels, [{ name: 'Messages', values: i.series.values, color: COLORS.cyan }, { name: 'Ratings', values: i.ratingSeries.values, color: COLORS.amber }]), { wide: true, data: i.series.labels.map((d, k) => ({ day: d, messages: i.series.values[k], ratings: i.ratingSeries.values[k] })) })}
            ${listPanel('inbox', 'topics', 'Message topics', i.lists.topics)}${listPanel('inbox', 'stars', 'Rating mix', i.lists.stars, { color: COLORS.amber })}${listPanel('inbox', 'status', 'Rating status', i.lists.status, { color: COLORS.green })}
        </div><p class="jv-note">The Real / Tests / All switch applies to the inbox. Open the Messages and CV Ratings tabs to answer.</p>`;
        out.inbox += take();

        ['cv', 'studio', 'lab'].forEach((key) => { out[key] = siteView(key) + take(); });

        const r = s.review;
        const h = e.health;
        out.review = kpis(r.kpis) + `<div class="jv-grid">${briefPanel('review')}${goalsPanel('review')}
            ${peoplePanel()}
            ${localPanel()}
            ${panel('review-funnel', 'Funnel', funnel(r.funnel), { data: r.funnel })}
            ${panel('review-trend', 'Opens and reviews per day', area(r.series.labels, [{ name: 'Opens', values: r.series.values, color: COLORS.cyan }, { name: 'Reviews', values: r.reviewSeries.values, color: COLORS.green }]), { wide: true, data: r.series.labels.map((d, k) => ({ day: d, opens: r.series.values[k], reviews: r.reviewSeries.values[k] })) })}
            ${panel('review-heat', 'When they open it', heat(r.heatmap, r.peak), { wide: true })}
            ${speedCard('review')}${gaCard('review')}
            ${listPanel('review', 'sources', 'Sources (opens)', r.lists.sources)}${listPanel('review', 'review-sources', 'Sources (reviews)', r.lists.reviewSources, { color: COLORS.green, empty: 'Reviews carry their source since 25 Oct 2026.' })}
            ${listPanel('review', 'statuses', 'Statuses', r.lists.statuses, { color: COLORS.amber })}${listPanel('review', 'hosts', 'Hosts reviewed', r.lists.hosts)}
            ${listPanel('review', 'frameworks', 'Frameworks', r.lists.frameworks, { color: COLORS.violet })}${listPanel('review', 'actions', 'Clicks on the review pages', r.lists.actions, { color: COLORS.amber })}
            ${listPanel('review', 'pages', 'Pages', r.lists.pages)}${listPanel('review', 'countries', 'Countries', r.lists.countries)}${listPanel('review', 'cities', 'Cities', r.lists.cities)}
            ${listPanel('review', 'langs', 'Languages', r.lists.langs)}${listPanel('review', 'screens', 'Screens', r.lists.screens)}
            ${panel('review-failures', 'Failed runs', h && h.failures ? `<p class="jv-big">${fmt(h.failures.total)}</p>${bars(h.failures.causes, { color: COLORS.pink, empty: 'No failures in range.' })}` : `<p class="jv-empty">${S.pending.health ? 'Asking the server…' : 'Not loaded.'}</p>`, { data: h && h.failures ? h.failures.latest : null })}
            ${panel('review-alerts', 'Alerts', table([['When', (a) => esc(when(a.at))], ['Kind', (a) => esc(a.kind)], ['What', (a) => esc(a.title)]], reviewAlerts(), 'No alerts in range.'), { wide: true, data: reviewAlerts().map((a) => ({ at: a.at, kind: a.kind, title: a.title, url: a.url, priceUsd: a.priceUsd })) })}
            ${panel('review-reports', 'Mailed reports', table([['Report', (x) => esc((x.period || '') + ' ' + (x.label || ''))], ['Opens', (x) => fmt(x.opens || 0)], ['Reviews', (x) => fmt(x.reviews || 0)], ['Paid', (x) => fmt(x.paidUsd || 0) + ' USD']], S.reports, 'No mailed reports yet.'), { data: S.reports.map((x) => ({ period: x.period, label: x.label, opens: x.opens, reviews: x.reviews, paidUsd: x.paidUsd })) })}
            ${panel('review-actions', 'Actions', `<div class="jv-actions">
                <a class="jv-btn" href="${DESK}" target="_blank" rel="noopener">Review desk</a><a class="jv-btn" href="${DESK}/failures" target="_blank" rel="noopener">Failed runs</a>
                <button type="button" class="jv-btn" data-run="sweepReviews">Run the sweep</button><button type="button" class="jv-btn" data-run="rerunReviewFailures">Re-run failures</button>
                <button type="button" class="jv-btn" data-report="review:daily">Send the daily report</button><button type="button" class="jv-btn" data-report="review:weekly">Send the weekly report</button></div>
                <form class="jv-inline" data-unlist><input name="host" data-keep="unlist" placeholder="host to unlist, e.g. example.com" aria-label="Host to unlist"><button type="submit" class="jv-btn danger">Unlist</button></form>`)}
        </div>`;
        out.review += take();

        const hub = s.hub;
        out.hub = kpis(hub.kpis) + `<div class="jv-grid">${briefPanel('hub')}${sharePanel()}${socialQueuePanel()}${socialRunsPanel()}${socialProposalsPanel()}
            ${panel('hub-trend', 'Hub and post views per day', area(hub.series.labels, [{ name: 'Views', values: hub.series.values, color: COLORS.violet }]), { wide: true, data: hub.series.labels.map((d, k) => ({ day: d, views: hub.series.values[k] })) })}
            ${listPanel('hub', 'posts', 'Top posts (score)', hub.lists.posts)}${listPanel('hub', 'sources', 'GA4 sources', hub.lists.sources, { color: COLORS.amber })}
            ${listPanel('hub', 'networks', 'Shares by network', hub.lists.networks, { color: COLORS.green })}${listPanel('hub', 'events', 'Events in range', hub.lists.events, { color: COLORS.violet })}${listPanel('hub', 'langs', 'Hub pages by language', hub.lists.langs)}
            ${speedCard('hub')}
            ${panel('hub-actions', 'Actions', `<p class="jv-note">Stats updated ${hub.updatedAt ? esc(when(hub.updatedAt)) : 'never'}${hub.ga && hub.ga.ok === false ? ' · GA4: ' + esc(hub.ga.error || 'failed') : ''}.</p><div class="jv-actions"><button type="button" class="jv-btn" data-run="refreshSocialHubStats">Refresh hub stats now</button><button type="button" class="jv-btn" data-run="dispatchFacebookQueue">Dispatch the Facebook queue</button><a class="jv-btn" href="qa-review-social.html" target="_blank" rel="noopener">Open the hub</a></div>`)}
        </div>`;
        out.hub += take();

        out.business = businessView() + take();
        out.outreach = outreachView() + take();
        out.marketing = marketingView() + take();
        out.github = githubView() + take();
        out.engagement = engagementView() + take();
        out.console = '';

        const ga = e.ga4;
        const cf = e.cloudflare;
        const gaBody = ga && ga.ok ? table([['Content group', (g) => esc(g.group)], ['Sessions', (g) => `${fmt(g.sessions)} <em class="${C.delta(g.sessions, g.priorSessions).dir > 0 ? 'up' : 'down'}">${esc(C.delta(g.sessions, g.priorSessions).text)}</em>`], ['Users', (g) => fmt(g.users)], ['Views', (g) => fmt(g.views)], ['Engaged', (g) => g.engagement + '%'], ['Avg session', (g) => g.duration + 's']], ga.groups) : `<p class="jv-empty">${S.pending.ga4 ? 'Reading GA4…' : esc((ga && ga.error) || 'Not loaded.')}</p>`;
        const sv = C.siteVisits(s);
        const mix = W.traffic;
        const cmp = mix.compare;
        const cmpBody = area(cmp.labels, cmp.series.map((x, k) => ({ name: x.name, values: x.values, color: [COLORS.green, COLORS.cyan, COLORS.violet][['site', 'ga4', 'cloudflare'].indexOf(x.key)] || SLICES[k] })), { fill: false })
            + `<ul class="jv-facts">${cmp.totals.map((t) => `<li>${esc(t.label)}: <b>${t.value === null ? '—' : fmt(t.value)}</b>${t.why ? ` <span class="jv-note">${esc(t.why)}</span>` : ''}</li>`).join('')}</ul>`;
        out.traffic = `<div class="jv-grid">${briefPanel('traffic')}
            ${panel('traffic-compare', 'Site counter, GA4 and Cloudflare per day', cmpBody, { wide: true, keep: true, data: cmp.labels.map((d, k) => Object.assign({ day: d }, ...cmp.series.map((x) => ({ [x.key]: x.values[k] })))), note: 'The site counts every visit; GA4 only visitors who allow analytics; Cloudflare counts page views at the edge, bots it lets through included.' })}
            ${panel('traffic-when', 'When visitors come, every site', mix.total ? heat(mix.heatmap, mix.peak) : '<p class="jv-empty">No visits in this range.</p>', { wide: true })}
            ${panel('traffic-mix', 'Where visits come from', pie(mix.sources, { unit: 'visits', empty: 'No visits in this range.' }), { data: mix.sources })}
            ${sv ? panel('traffic-site', 'Site visits, with or without analytics consent', kpis([sv].concat(sv.parts)) + area(sv.series.labels, [{ name: 'Visits', values: sv.series.values, color: COLORS.green }]), { wide: true, data: sv.series.labels.map((d, i) => ({ day: d, visits: sv.series.values[i] })), note: 'Counted by the site itself: CV, Studio and Lab visits and URL Review opens. Test browsers are left out.' }) : ''}
            ${panel('traffic-groups', 'GA4 by content group', gaBody, { wide: true, data: ga && ga.groups, note: 'Property 495572902. Since 19 Oct 2026 GA4 only counts visitors who allow analytics, so it reads far below Site visits; compare GA4 with itself, not with the weeks before.' })}
            ${ga && ga.ok ? panel('traffic-daily', 'GA4 sessions and users per day', area(ga.daily.map((d) => d.date), [{ name: 'Sessions', values: ga.daily.map((d) => d.sessions), color: COLORS.cyan }, { name: 'Users', values: ga.daily.map((d) => d.users), color: COLORS.amber }]), { wide: true, data: ga.daily }) : ''}
            ${ga && ga.ok ? listPanel('traffic', 'countries', 'GA4 countries', ga.countries) + listPanel('traffic', 'sources', 'GA4 source / medium', ga.sources, { color: COLORS.amber }) : ''}
            ${cf && cf.ok && cf.paths ? listPanel('traffic', 'cf-paths', 'Cloudflare: top paths, last 24 hours', cf.paths, { color: COLORS.violet }) : ''}
            ${cf && cf.ok && cf.countries ? listPanel('traffic', 'cf-countries', 'Cloudflare: countries', cf.countries) : ''}
            ${cf && cf.ok && cf.statuses ? listPanel('traffic', 'cf-statuses', 'Cloudflare: status codes', cf.statuses, { color: COLORS.amber }) : ''}
            ${cf && cf.ok && cf.contentTypes ? listPanel('traffic', 'cf-types', 'Cloudflare: content types', cf.contentTypes, { color: COLORS.green }) : ''}
            ${cf && cf.ok && cf.threatCountries && cf.threatCountries.length ? listPanel('traffic', 'cf-threats', 'Cloudflare: threats by country', cf.threatCountries, { color: COLORS.pink }) : ''}
            ${panel('traffic-cloudflare', 'Cloudflare edge', cf && cf.ok ? kpis([{ label: 'Requests', value: cf.requests }, { label: 'Page views', value: cf.pageViews }, { label: 'Uniques', value: cf.uniques }, { label: 'Cached', value: cf.cacheRatio + '%' }, { label: 'Threats', value: cf.threats, alert: cf.threats > 0 }, { label: 'Data', value: (cf.bytes / 1048576).toFixed(1) + ' MB' }]) + area(cf.daily.map((d) => d.date), [{ name: 'Requests', values: cf.daily.map((d) => d.requests), color: COLORS.violet }]) : `<p class="jv-empty">${S.pending.cloudflare ? 'Asking Cloudflare…' : esc((cf && cf.error) || 'Not loaded.')}</p>`, { wide: true, data: cf && cf.daily })}
        </div>`;
        out.traffic += take();

        const jobs = e.jobs && e.jobs.jobs ? e.jobs.jobs : [];
        const gh = e.github;
        const up = e.uptime;
        const sp = e.speed;
        const tiles90 = C.statusMatrix(e, S.pending);
        out.systems = `<div class="jv-grid">${briefPanel('systems')}
            ${panel('systems-matrix', 'Status matrix', matrix(tiles90), { wide: true, keep: true, data: tiles90 })}
            ${panel('systems-uptime90', 'Uptime, last 90 days', strip(W.uptime), { wide: true, keep: true, data: W.uptime.days })}
            ${actionsPanel()}${codesPanel()}${mailboxPanel()}${addressesPanel()}${connectionsPanel()}${safetyPanel()}${platformPanel()}
            ${panel('systems-ready', 'Readiness', `<div class="jv-rings">${ring(C.readiness(e), 'ready', null, 120)}</div><p class="jv-note">Share of checks that pass: scheduled jobs, CI on main, uptime and PageSpeed within your limits (⚙ Settings).</p>`)}
            ${panel('systems-uptime', 'Uptime', up && up.ok ? table([['Page', (p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>`], ['Status', (p) => `<span class="jv-chip ${p.ok ? 'c-fast' : 'c-slow'}">${esc(p.status || 'down')}</span>`], ['Time', (p) => fmt(p.ms) + ' ms'], ['Size', (p) => p.bytes ? Math.round(p.bytes / 1024) + ' KB' : '']], up.pages) + `<p class="jv-note">TLS certificate: ${up.tlsDaysLeft === null ? 'unknown' : esc(up.tlsDaysLeft) + ' days left'}.</p>` : `<p class="jv-empty">${S.pending.uptime ? 'Pinging…' : esc((up && up.error) || 'Not loaded.')}</p>`, { data: up && up.pages })}
            ${panel('systems-speed', 'PageSpeed (mobile) and CrUX', sp && sp.ok ? `<div class="jv-rings">${sp.pages.map((p) => ring(p.ok ? p.score : null, p.name.replace('URL Review', 'Review'), null, 90)).join('')}</div>${sp.crux && sp.crux.ok && sp.crux.phone ? `<p class="jv-note">CrUX phone LCP p75 over ${sp.crux.phone.weeks || ''} weeks: ${spark(sp.crux.phone.lcp || [], COLORS.amber)}</p>` : ''}` : `<p class="jv-empty">${S.pending.speed ? 'Running PageSpeed on five pages (up to 90 s)…' : esc((sp && sp.error) || 'Not loaded.')}</p>`, { wide: true, data: sp && sp.pages && sp.pages.map((p) => ({ page: p.name, score: p.score, lcp: p.lab && p.lab.lcp, tbt: p.lab && p.lab.tbt, cls: p.lab && p.lab.cls, error: p.error })) })}
            ${pageSpeedPanels()}
            ${panel('systems-jobs', 'Scheduled jobs', jobs.length ? table([['Job', (j) => esc(j.name)], ['Schedule', (j) => `<code>${esc(j.schedule)}</code>`], ['Last run', (j) => esc(when(j.lastAttempt))], ['State', (j) => `<span class="jv-chip ${j.ok ? (j.note ? '' : 'c-fast') : 'c-slow'}">${j.ok ? esc(j.note || 'ok') : esc(j.error || 'error')}</span>`], ['', (j) => `<button type="button" class="jv-btn small" data-run="${esc(j.name)}">Run now</button>`]], jobs) : `<p class="jv-empty">${S.pending.jobs ? 'Reading Cloud Scheduler…' : esc((e.jobs && e.jobs.error) || 'Not loaded.')}</p>`, { wide: true, data: jobs })}
            ${panel('systems-ops', 'Job runs (ops_runs)', h && h.jobs ? table([['Job', (j) => esc(j.job)], ['Ended', (j) => esc(when(j.endedAt))], ['Result', (j) => `<span class="jv-chip ${j.ok ? 'c-fast' : 'c-slow'}">${j.ok ? 'ok' : 'failed'}</span>`], ['Note', (j) => esc(j.error || j.note)]], h.jobs) : `<p class="jv-empty">${S.pending.health ? 'Asking the server…' : esc((h && h.error) || 'Not loaded.')}</p>`, { wide: true, data: h && h.jobs })}
            ${panel('systems-ci', 'CI on main', gh && gh.ok ? `<div class="jv-ci">${gh.ci.map((c) => `<a class="jv-chip ${c.conclusion === 'success' ? 'c-fast' : c.conclusion === 'skipped' ? '' : 'c-slow'}" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)} · ${esc(c.conclusion)} · ${esc(c.sha)}</a>`).join('')}</div>` : `<p class="jv-empty">${S.pending.github ? 'Asking GitHub…' : esc((gh && gh.error) || 'Not loaded.')}</p>`, { data: gh && gh.ci })}
            ${gh && gh.ok ? listPanel('systems', 'bugs', `Open bugs by area (${gh.openBugs})`, gh.bugAreas, { color: COLORS.pink }) : ''}
            ${gh && gh.ok ? panel('systems-merged', `PRs merged in 7 days (${gh.merged.total})`, table([['#', (p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.number)}</a>`], ['Title', (p) => esc(p.title)]], gh.merged.items), { wide: true, data: gh.merged.items }) : ''}
            ${gh && gh.ok ? panel('systems-recent', 'Newest issues and PRs', table([['#', (p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.number)}</a>`], ['', (p) => (p.pr ? 'PR' : 'issue') + ' · ' + esc(p.state)], ['Title', (p) => esc(p.title)]], gh.recent), { wide: true, data: gh.recent }) : ''}
            ${h ? panel('systems-queue', 'Review pipeline', kpis([{ label: 'Failed runs', value: (h.failures || {}).total || 0, alert: ((h.failures || {}).total || 0) > 0 }, { label: 'Re-runs held', value: (h.reruns || {}).held || 0, alert: ((h.reruns || {}).held || 0) > 0 }, { label: 'Alerts', value: (h.alerts || {}).total || 0 }, { label: 'Owner notices', value: (h.notices || {}).total || 0 }, { label: 'Rival pages', value: (h.rivals || {}).total || 0 }, { label: 'Coupon uses', value: (h.coupons || {}).uses || 0 }, { label: 'Captures', value: (h.captures || {}).total || 0 }]) + bars((h.failures || {}).hosts, { color: COLORS.pink, empty: 'No failing hosts.' }), { wide: true, data: [h.failures, h.reruns, h.notices, h.coupons, h.captures] }) : ''}
            ${panel('systems-links', 'Consoles', `<div class="jv-actions">${LINKS.map(([label, url]) => `<a class="jv-btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(label.replace(/^Open (the )?/, ''))}</a>`).join('')}</div>`, { wide: true })}
        </div>`;
        out.systems += take();
        return out;
    }

    function render() {
        if (!S.mounted || !S.summaries.cv) return;
        S.panels.clear();
        root.dataset.product = S.product;
        const html = views();
        C.PRODUCTS.forEach((p) => {
            const view = $(`[data-view="${p.key}"]`);
            const active = p.key === S.product || root.classList.contains('jv-print-all');
            view.hidden = !active;
            if (active && p.key === 'console') { con.place(view); return; }
            if (active) {
                const keep = view.querySelector('.jv-ask input');
                const typed = keep ? keep.value : '';
                const focused = keep && document.activeElement === keep;
                const held = view.contains(document.activeElement) && document.activeElement.dataset.keep ? document.activeElement : null;
                const typedKept = Array.from(view.querySelectorAll('[data-keep]')).map((el) => [el.dataset.keep, el.value]);
                const prev = S.product;
                S.product = p.key;
                view.innerHTML = (root.classList.contains('jv-print-all') ? `<h2 class="jv-print-title">${esc(p.name)}</h2>` : '') + html[p.key];
                S.product = prev;
                const ask = view.querySelector('.jv-ask input');
                if (ask && typed) { ask.value = typed; if (focused) ask.focus(); }
                typedKept.forEach(([k, v]) => { const el = view.querySelector(`[data-keep="${k}"]`); if (el && v && !el.value) el.value = v; });
                const again = held && view.querySelector(`[data-keep="${held.dataset.keep}"]`);
                if (again) { again.focus(); again.setSelectionRange(held.selectionStart, held.selectionEnd); }
            }
        });
        $$('[data-go]').forEach((b) => { if (b.getAttribute('role') === 'tab') b.setAttribute('aria-selected', String(b.dataset.go === S.product)); });
        $('[data-con-dock]').hidden = S.product === 'console';
        if (S.product === 'console' && docked) dock(false);
        C.PRODUCTS.forEach((p) => {
            const sum = S.summaries[p.key];
            const badge = $(`[data-badge="${p.key}"]`);
            const waitingNotices = p.key === 'outreach' && S.external.notices && S.external.notices.notices ? S.external.notices.notices.length : 0;
            const n = S.brief.filter((b) => inTab(b, p.key) && p.key !== 'overview' && (b.level === 'alert' || b.level === 'warn')).length + waitingNotices;
            if (badge) { badge.hidden = !n; badge.textContent = n; }
            const k = $(`[data-tab-kpi="${p.key}"]`);
            const gw = S.external['github-work'];
            if (k) k.textContent = sum && sum.kpis ? fmt(sum.kpis[0].value) : p.key === 'systems' ? (C.readiness(S.external) === null ? '' : C.readiness(S.external) + '%') : p.key === 'github' ? ((gw && gw.score && gw.score.overall && gw.score.overall.grade) || '') : '';
        });
        const ready = C.readiness(S.external);
        $('#jv-ready').textContent = ready === null ? '—' : ready + '%';
        root.style.setProperty('--ready', ready === null ? 0.5 : ready / 100);
        root.classList.toggle('is-degraded', ready !== null && ready < C.thresholds((S.settings || {}).thresholds).readinessMin);
        const alerts = S.brief.filter((b) => b.level === 'alert').length;
        const warns = S.brief.filter((b) => b.level === 'warn').length;
        tabIcon(ready, alerts, warns);
        const checked = ['health', 'jobs', 'uptime'].some((k) => S.external[k] && !S.pending[k]);
        const things = `${warns} thing${warns > 1 ? 's' : ''} to look at`;
        const note = C.systemsNote(C.connections(S.external, S.pending), ready, C.thresholds((S.settings || {}).thresholds).readinessMin);
        setStatus(alerts ? `${alerts} alert${alerts > 1 ? 's' : ''} and ${warns} warning${warns === 1 ? '' : 's'} need you.` : !checked ? (warns ? `${things}. Checking systems…` : 'Checking systems…') : warns ? `${note || 'All systems up'}. ${things}.` : note ? `${note}.` : 'All systems nominal.');
        $$('[data-mail]').forEach((b) => b.classList.toggle('on', b.dataset.mail === S.mail));
        $('[data-print-range]').textContent = (RANGES.find(([v]) => v === S.range) || [])[1] || '';
        $('[data-print-at]').textContent = new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' });
        holoSync();
    }

    function pulse(n) {
        const live = $('.jv-live');
        live.classList.remove('is-pulse');
        void live.offsetWidth;
        live.classList.add('is-pulse');
        if (n) toast(`${n} new event${n > 1 ? 's' : ''}`, 1800);
    }

    async function refresh(all) {
        if (S.loading) return;
        S.loading = true;
        setStatus('Refreshing…');
        const own = all !== false ? loadExternal() : null;
        let failed = false;
        try {
            await loadSnapshot();
            compute();
            render();
        } catch (error) {
            failed = true;
            setStatus('The snapshot did not load: ' + error.message);
        }
        S.loading = false;
        const rest = failed ? loadExternal(['settings', 'goals'].concat(SNAPSHOT_OPS)) : null;
        if (own) Promise.all([own, rest]).then(() => loadProposals());
        if (!S.marksAt) { S.marksAt = Date.now(); loadMarks(); }
        reportDevice();
    }

    // The rules answer at once; Gemini then ranks them on the server, which also drops the Done and Dismissed ones.
    async function loadProposals() {
        const rules = C.proposalRules({ products: S.summaries, external: S.external, thresholds: (S.settings || {}).thresholds, goals: S.goals }, S.brief);
        S.proposals = Object.assign({}, S.proposals, { loading: true, rules });
        render();
        const out = await call('proposals', { candidates: rules, snapshot: snapshot() }).catch((error) => ({ ok: false, error: error.message }));
        S.proposals = out.ok ? Object.assign(out, { loading: false, rules }) : { loading: false, rules, error: out.error };
        render();
    }

    // --- briefing sheet (#1695): what a line is about, its numbers, links and actions ------------------------

    async function loadMarks() {
        const out = await call('brief-marks').catch(() => ({ ok: false }));
        if (!out.ok) return;
        S.marks = out.marks || [];
        if (S.briefState) { compute(); render(); }
    }

    function sheetItem(key) {
        return S.brief.concat(S.briefHidden).find((b) => b.key === key);
    }

    function openSheet(key) {
        const item = sheetItem(key);
        if (!item) return;
        const detail = C.briefDetail(item, S.briefState || {});
        S.sheet = { key, item, detail, rows: null, ai: '', hidden: S.briefHidden.some((b) => b.key === key) };
        paintSheet();
        $('[data-sheet-root]').hidden = false;
        const first = $('.jv-sheet-box button');
        if (first) first.focus();
        if (detail.list) loadSheetRows(detail.list);
    }

    function closeSheet() {
        const box = $('[data-sheet-root]');
        if (!box || box.hidden) return;
        box.hidden = true;
        const back = S.sheet && $(`[data-brief="${CSS.escape(S.sheet.key)}"]`);
        S.sheet = null;
        if (back) back.focus();
    }

    async function loadSheetRows(list) {
        const out = await call('brief-items', { list });
        if (!S.sheet) return;
        S.sheet.rows = out.ok ? out : { error: out.error };
        paintSheet();
    }

    function sheetRows() {
        const sh = S.sheet;
        if (!sh.detail.list) return '';
        if (!sh.rows) return '<p class="jv-note">Loading…</p>';
        if (sh.rows.error) return `<p class="jv-note">Could not load: ${esc(sh.rows.error)}</p>`;
        const rows = sh.rows.rows || [];
        if (!rows.length) return '<p class="jv-note">Nothing waiting now.</p>';
        const head = `<p class="jv-note">${fmt(sh.rows.total)} waiting${sh.rows.total > rows.length ? `, newest ${rows.length} shown` : ''}.</p>`;
        if (sh.detail.list === 'ratings') return head + `<div class="jv-actions"><button type="button" class="jv-btn small" data-sheet="rate-all">Approve the ${rows.length} shown</button></div><ul class="jv-sheet-rows">${rows.map((r) => `<li><strong>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} ${esc(r.name)}</strong><small>${esc(when(r.at))}</small>${r.text ? `<p>${esc(r.text)}</p>` : ''}
            <div class="jv-prop-acts"><button type="button" data-sheet="rate" data-id="${esc(r.id)}" data-decision="approved">Approve</button><button type="button" data-sheet="rate" data-id="${esc(r.id)}" data-decision="approved-anon">Approve without name</button><button type="button" data-sheet="rate" data-id="${esc(r.id)}" data-decision="rejected">Reject</button></div></li>`).join('')}</ul>`;
        return head + `<ul class="jv-sheet-rows">${rows.map((m) => `<li><strong>${esc(m.name)}${m.topic ? ' · ' + esc(m.topic) : ''}</strong><small>${esc(when(m.at))}</small>${m.text ? `<p>${esc(m.text)}</p>` : ''}
            <div class="jv-prop-acts">${m.email ? `<a href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + (m.topic || 'your message'))}">Reply by email ↗</a>` : ''}</div></li>`).join('')}</ul>`;
    }

    function paintSheet() {
        const sh = S.sheet;
        if (!sh) return;
        const d = sh.detail;
        const tab = d.tab && d.tab !== S.product ? C.PRODUCTS.find((p) => p.key === d.tab) : null;
        const until = sh.hidden ? (S.marks.find((m) => m.key === sh.key) || {}).until : null;
        $('.jv-sheet-box').innerHTML = `<header><h3><span class="jv-chip lv-${sh.item.level}">${esc(sh.item.level)}</span> ${esc(d.title)}</h3><button type="button" class="jv-btn small" data-sheet="close" aria-label="Close">✕</button></header>
            <p class="jv-sheet-line">${esc(sh.item.text)}</p>
            ${d.facts.length ? `<dl class="jv-sheet-facts">${d.facts.map((f) => `<dt>${esc(f.label)}</dt><dd>${esc(/^\d{4}-\d{2}-\d{2}T/.test(f.value) ? when(f.value) : f.value)}</dd>`).join('')}</dl>` : ''}
            ${sheetRows()}
            ${d.actions.length || tab || d.links.length ? `<h4>What you can do</h4><div class="jv-actions">${d.actions.map((a) => `<button type="button" class="jv-btn" data-sheet="action" data-action="${esc(a.id)}"${a.job ? ` data-job="${esc(a.job)}"` : ''}${a.workflow ? ` data-workflow="${esc(a.workflow)}"` : ''}${a.pr ? ` data-pr="${esc(a.pr)}"` : ''}>${esc(a.label)}</button>`).join('')}${tab ? `<button type="button" class="jv-btn" data-go="${esc(tab.key)}">Open ${esc(tab.name)} →</button>` : ''}${d.links.map((l) => `<a class="jv-btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}${/↗$/.test(l.label) ? '' : ' ↗'}</a>`).join('')}</div>` : ''}
            <div class="jv-ai"${sh.ai ? '' : ' hidden'}><span class="jv-eyebrow">Gemini</span><div class="jv-ai-text">${esc(sh.ai).replace(/\n/g, '<br>')}</div></div>
            <div class="jv-actions jv-sheet-tools"><button type="button" class="jv-btn small" data-sheet="explain">Explain with Gemini</button>
              ${sh.hidden ? `<button type="button" class="jv-btn small" data-sheet="mark" data-status="open">Show it again${until ? ` (hidden until ${esc(when(until))})` : ''}</button>` : `<button type="button" class="jv-btn small" data-sheet="mark" data-status="snoozed">Snooze 1 day</button><button type="button" class="jv-btn small" data-sheet="mark" data-status="week">Snooze 1 week</button><button type="button" class="jv-btn small" data-sheet="mark" data-status="dismissed">Dismiss 30 days</button>`}
              <button type="button" class="jv-btn small" data-sheet="copy">Copy</button><button type="button" class="jv-btn small" data-sheet="share">Share</button></div>`;
    }

    function sheetText() {
        const sh = S.sheet;
        return [`[${sh.item.level}] ${sh.item.text}`].concat(sh.detail.facts.map((f) => `- ${f.label}: ${f.value}`), sh.detail.links.map((l) => `${l.label.replace(/ ↗$/, '')}: ${l.url}`)).join('\n');
    }

    const SHEET_ASK = {
        'rerun-ci': (b) => `re-run the failed jobs of "${b.dataset.workflow}" on main, or, when main is green, close and reopen the PRs that failed it on the old main (3 seconds apart, at most 20, conflicting PRs skipped)`,
        'run-job': (b) => `run ${b.dataset.job} again`,
        'pagespeed-merge': (b) => `merge PageSpeed fixes #${b.dataset.pr} into main now (it goes to production)`,
        'pagespeed-close': (b) => `close PageSpeed fixes #${b.dataset.pr} without merging`,
        'pagespeed-run': () => 'start the daily PageSpeed run now (about two hours)'
    };

    async function sheetAct(b) {
        const sh = S.sheet;
        if (!sh) return;
        const what = b.dataset.sheet;
        if (what === 'close') { closeSheet(); return; }
        if (what === 'copy') { copy(sheetText(), 'Copied.'); return; }
        if (what === 'share') {
            const data = { title: 'Jarvis: ' + sh.detail.title, text: sheetText(), url: link() };
            if (navigator.share) { try { await navigator.share(data); } catch (error) { /* closed */ } } else copy(data.text + '\n' + data.url, 'Copied with a link.');
            return;
        }
        if (what === 'explain') {
            sh.ai = 'Thinking…';
            paintSheet();
            const out = await call('ask', { question: `Explain this Jarvis briefing line in 3 to 5 sentences: what it means, why it matters, and the first thing to do. Quote the numbers.\n${sheetText()}`, snapshot: snapshot() });
            if (S.sheet !== sh) return;
            sh.ai = out.ok ? out.text : 'Gemini: ' + out.error;
            paintSheet();
            return;
        }
        if (what === 'mark') {
            const status = b.dataset.status;
            const out = await call('brief-mark', { key: sh.key, status, text: sh.item.text });
            if (!out.ok) { toast('Not saved: ' + out.error, 5000); return; }
            S.marks = S.marks.filter((m) => m.key !== sh.key).concat(status === 'open' ? [] : [Object.assign({ key: sh.key, status }, out)]);
            closeSheet();
            compute();
            render();
            toast({ snoozed: 'Snoozed for a day.', week: 'Snoozed for a week.', dismissed: 'Dismissed for 30 days.', open: 'Back in the briefing.' }[status], 3000);
            return;
        }
        if (what === 'action') {
            const action = b.dataset.action;
            const ask = SHEET_ASK[action] ? SHEET_ASK[action](b) : (ACTION_ASK[action] || (() => action))(b.dataset.job);
            if (!confirmRun(ask)) return;
            b.disabled = true;
            toast('Running…', 30000);
            const out = await call('action-run', { action, job: b.dataset.job, workflow: b.dataset.workflow, pr: b.dataset.pr ? Number(b.dataset.pr) : undefined, proposal: sh.key });
            b.disabled = false;
            if (/^pagespeed-/.test(action)) { toast(out.ok ? out.note : 'Not run: ' + out.error, 6000); if (out.ok) loadExternal(['pagespeed', 'actions']); return; }
            toast(out.ok ? (out.note ? out.note : out.already ? `${out.ran} already ended with ${out.already}.` : `${ACTION_LABELS[action] || action}: ${out.ran ? out.ran + ' started' : fmt(out.done) + ' done'}${out.failed ? ', ' + out.failed + ' failed' : ''}${out.left ? ', ' + out.left + ' left' : ''}.`) : 'Not run: ' + out.error, 6000);
            if (out.ok) loadExternal(['actions', 'health', 'jobs', 'github']);
            return;
        }
        if (what === 'rate' || what === 'rate-all') {
            const rows = (sh.rows && sh.rows.rows) || [];
            const ids = what === 'rate' ? [b.dataset.id] : rows.map((r) => r.id);
            const decision = what === 'rate' ? b.dataset.decision : 'approved';
            if (what === 'rate-all' && !confirmRun(`approve ${ids.length} rating${ids.length === 1 ? '' : 's'} and show them on the CV`)) return;
            const out = await call('rating-decide', { ids, decision });
            if (!out.ok) { toast('Not saved: ' + out.error, 5000); return; }
            sh.rows.rows = rows.filter((r) => !ids.includes(r.id));
            sh.rows.total = Math.max(0, sh.rows.total - out.done);
            paintSheet();
            toast(`${fmt(out.done)} rating${out.done === 1 ? '' : 's'} ${decision === 'rejected' ? 'rejected' : 'approved'}.`, 3000);
        }
    }

    async function markProposal(key, status) {
        const P = S.proposals || {};
        const row = (P.proposals || P.rules || []).find((p) => p.key === key);
        const out = await call('proposal-mark', { key, status, title: row && row.title });
        if (!out.ok) { toast('Not saved: ' + out.error, 5000); return; }
        ['proposals', 'rules'].forEach((k) => { if (P[k]) P[k] = P[k].filter((p) => p.key !== key); });
        P.hidden = (P.hidden || 0) + 1;
        render();
        toast(status === 'done' ? 'Done. Hidden for 7 days.' : 'Dismissed for 30 days.', 3000);
    }

    // --- actions -------------------------------------------------------------------------------------------

    function download(name, type, text) {
        const blob = text instanceof Blob ? text : new Blob([text], { type });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

    function productRows(key) {
        const out = [];
        S.panels.forEach((p, id) => { if (id.startsWith(key + '-')) (p.rows || []).forEach((row) => out.push(Object.assign({ panel: p.title }, typeof row === 'object' ? row : { value: row }))); });
        const sum = S.summaries[key];
        if (sum && sum.kpis) sum.kpis.forEach((k) => out.unshift({ panel: 'KPIs', label: k.label, value: k.value, prior: k.prior, delta: k.delta }));
        return out;
    }

    function exportAll() {
        download(`jarvis-${S.range}-${stamp()}.json`, 'application/json', JSON.stringify({ generatedAt: new Date().toISOString(), range: S.range, briefing: S.brief, gemini: S.ai || null, products: S.summaries, external: S.external }, null, 2));
    }

    function markdown() {
        const lines = [`# Jarvis briefing`, ``, `Range: ${(RANGES.find(([v]) => v === S.range) || [])[1]} · generated ${new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })} (Bogota)`, ``, `## What needs you`, ``].concat(S.brief.map((b) => `- **${b.level}** (${b.product}): ${b.text}`));
        if (S.ai) lines.push('', '## Gemini', '', S.ai);
        C.PRODUCTS.forEach((p) => {
            const s = S.summaries[p.key];
            if (!s || !s.kpis) return;
            lines.push('', `## ${p.name}`, '', '| Indicator | Value | Change |', '|---|---|---|');
            s.kpis.forEach((k) => lines.push(`| ${k.label} | ${k.value} | ${k.delta || ''} |`));
        });
        return lines.join('\n');
    }

    // A PNG drawn from the panel's numbers, so it looks the same everywhere and needs no screenshot library.
    function panelPng(title, rows) {
        const list = (rows || []).slice(0, 18).map((r) => {
            const label = r.label || r.page || r.day || r.date || r.name || r.job || r.group || r.product || Object.values(r)[0];
            const value = typeof r.value === 'number' ? r.value : Object.values(r).find((v) => typeof v === 'number') || 0;
            return { label: String(label), value };
        });
        const w = 1200, row = 44, h = 150 + Math.max(1, list.length) * row;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const g = canvas.getContext('2d');
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#04121c'); bg.addColorStop(1, '#0a2130');
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(56,225,255,0.35)'; g.lineWidth = 2; g.strokeRect(14, 14, w - 28, h - 28);
        g.fillStyle = COLORS.cyan; g.font = '600 18px ui-monospace, Menlo, monospace'; g.fillText('J.A.R.V.I.S.', 40, 56);
        g.fillStyle = '#e6f7ff'; g.font = '700 34px system-ui, sans-serif'; g.fillText(title, 40, 100);
        g.fillStyle = COLORS.dim; g.font = '16px system-ui, sans-serif'; g.fillText(`${(RANGES.find(([v]) => v === S.range) || [])[1]} · ${new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })}`, 40, 126);
        const max = Math.max(1, ...list.map((r) => r.value));
        list.forEach((r, i) => {
            const y = 150 + i * row;
            g.fillStyle = '#b9d7e6'; g.font = '18px system-ui, sans-serif';
            g.fillText(r.label.length > 46 ? r.label.slice(0, 45) + '…' : r.label, 40, y + 26);
            g.fillStyle = 'rgba(93,122,140,0.25)'; g.fillRect(520, y + 10, 560, 20);
            g.fillStyle = COLORS.cyan; g.shadowColor = COLORS.cyan; g.shadowBlur = 12; g.fillRect(520, y + 10, Math.max(4, (r.value / max) * 560), 20); g.shadowBlur = 0;
            g.fillStyle = '#e6f7ff'; g.font = '600 18px ui-monospace, Menlo, monospace'; g.fillText(r.value.toLocaleString('en-US'), 1096, y + 26);
        });
        canvas.toBlob((blob) => download(`jarvis-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp()}.png`, 'image/png', blob));
    }

    function printView(all) {
        root.classList.toggle('jv-print-all', !!all);
        document.body.classList.add('jv-printing');
        render();
        const done = () => { document.body.classList.remove('jv-printing'); root.classList.remove('jv-print-all'); render(); window.removeEventListener('afterprint', done); };
        window.addEventListener('afterprint', done);
        setTimeout(() => window.print(), 60);
    }

    function link() { return location.origin + location.pathname + `#stats/${S.product}/${S.range}`; }

    async function copy(text, said) {
        try { await navigator.clipboard.writeText(text); toast(said || 'Copied.'); } catch (error) { toast('Copy failed; select and copy by hand.'); }
    }

    function confirmRun(label) { return window.confirm(`Jarvis: ${label}?`); }

    async function runJob(job) {
        if (!confirmRun(`run ${job} now`)) return;
        toast(`Running ${job}…`);
        const out = await call('run-job', { job });
        toast(out.ok ? `${job} started. It shows in Scheduled jobs within a minute.` : `Could not run ${job}: ${out.error}`, 5000);
        if (out.ok) setTimeout(() => loadExternal(['jobs', 'health']), 20000);
    }

    const ACTION_ASK = {
        'rerun-held': () => { const p = ((S.external.actions || {}).pending) || {}; return `send ${p.held === undefined ? 'every' : p.held} held re-run${p.held === 1 ? '' : 's'} to the askers by email${p.held > p.clean ? ` (${p.held - p.clean} not clean)` : ''}`; },
        'resend-notices': () => 're-send the failed owner notices (Monday-Saturday 08:00-19:00, inside today\'s notice budget)',
        'publish-hub': () => 'publish the Social hub (run refreshSocialHubStats)',
        'run-job': (job) => `run ${job} again`,
        'retry-social': () => 'start the social posting workflows again (Buffer re-queues the failed posts)',
        'resume-outreach': () => 'resume the outreach mailboxes Jarvis paused that have been healthy for two hourly checks'
    };

    // Merge or Close on a PageSpeed PR, from Systems or Proposals.
    async function pageSpeedAct(b) {
        if (!confirmRun(SHEET_ASK[b.dataset.psAct](b))) return;
        b.disabled = true;
        const out = await call('action-run', { action: b.dataset.psAct, pr: Number(b.dataset.pr), proposal: b.dataset.key || 'pagespeed:pr:' + b.dataset.pr });
        b.disabled = false;
        toast(out.ok ? out.note : 'Not run: ' + out.error, 6000);
        if (out.ok) loadExternal(['pagespeed', 'actions']);
    }

    async function runAction(action, job, proposal) {
        if (!confirmRun(ACTION_ASK[action](job))) return;
        toast('Running…', 30000);
        const out = await call('action-run', { action, job, proposal });
        toast(out.ok ? `${ACTION_LABELS[action]}: ${out.ran ? out.ran + ' started' : fmt(out.done) + ' done'}${out.failed ? ', ' + out.failed + ' failed' : ''}${out.left ? ', ' + out.left + ' left' : ''}.` : 'Not run: ' + out.error, 6000);
        loadExternal(['actions', 'health', 'jobs']);
    }

    // A proposal's run button: the action-run op with its jobs or workflows; Carlos's click runs it at once.
    async function runProposal(key) {
        const P = S.proposals || {};
        const run = C.proposalRun((P.proposals || []).concat(P.rules || []).find((p) => p.key === key));
        if (!run) return;
        const list = run.jobs || run.workflows || [];
        const ask = ACTION_ASK[run.action] && run.action !== 'run-job' ? ACTION_ASK[run.action]() : run.label.replace(/^./, (c) => c.toLowerCase()) + (list.length > 1 ? ` (${list.join(', ')})` : '');
        if (!confirmRun(ask)) return;
        toast('Running…', 30000);
        const out = await call('action-run', { action: run.action, jobs: run.jobs, workflows: run.workflows, proposal: key });
        toast(out.ok ? out.note ? `${run.label}: ${out.note}` : `${run.label}: ${out.ran ? String(out.ran).replace(/\.$/, '') : fmt(out.done) + ' done'}${out.failed ? ', ' + out.failed + ' failed' : ''}${out.left ? ', ' + out.left + ' left' : ''}.` : 'Not run: ' + out.error, 6000);
        loadExternal(['actions', 'health', 'jobs', 'github']);
    }

    async function countdownAct(id, act) {
        const row = ((((S.external.actions || {}).countdowns) || {}).pending || []).find((r) => r.id === id) || {};
        if (act === 'now' && !confirmRun(`do it now: ${(row.label || 'this action').replace(/^./, (c) => c.toLowerCase())} (${row.target || ''})`)) return;
        S.pending['countdown:' + id] = true;
        toast(act === 'now' ? 'Running…' : 'Cancelling…', 30000);
        const out = await call('countdown', { id, act });
        S.pending['countdown:' + id] = false;
        toast(out.ok ? out.message : 'Not done: ' + out.error, 6000);
        loadExternal(['actions']);
    }

    async function aiBrief() {
        toast('Gemini is reading the numbers…', 6000);
        const out = await call('brief', { snapshot: snapshot() });
        if (!out.ok) { toast('Gemini: ' + out.error, 6000); return; }
        S.ai = out.text;
        S.aiAt = Date.now();
        render();
        return out.text;
    }

    async function ask(question, lang) {
        S.ai = 'Thinking about: ' + question;
        S.aiAt = Date.now();
        render();
        const out = await call('ask', Object.assign({ question, snapshot: snapshot() }, lang ? { lang, spoken: true } : {}));
        S.ai = out.ok ? `Q: ${question}\n\n${out.text}` : 'Gemini: ' + out.error;
        S.aiAt = Date.now();
        render();
        return out.ok ? out.text : '';
    }

    // --- voice ----------------------------------------------------------------------------------------------

    const VOICE_KEY = 'jarvis.voice';

    function voicePrefs() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(VOICE_KEY) || '{}'); } catch (error) { saved = {}; }
        return C.voicePrefs(saved, navigator.language);
    }

    function saveVoice(patch) {
        const p = Object.assign(voicePrefs(), patch);
        try { localStorage.setItem(VOICE_KEY, JSON.stringify({ lang: p.lang, en: p.en, es: p.es, rate: p.rate })); } catch (error) { /* private mode: this visit only */ }
    }

    function voice(lang) {
        if (!window.speechSynthesis) return null;
        S.voices = S.voices || {};
        if (S.voices[lang]) return S.voices[lang];
        const all = window.speechSynthesis.getVoices();
        const male = lang === 'es' ? /Jorge|Diego|Juan|Male/i : /Daniel|Arthur|UK English Male|en-GB.*Male/i;
        const region = lang === 'es' ? /^es-(US|MX|419)/ : /^en-GB/;
        S.voices[lang] = all.find((v) => v.lang.startsWith(lang) && male.test(v.name)) || all.find((v) => region.test(v.lang)) || all.find((v) => v.lang.startsWith(lang)) || null;
        return S.voices[lang];
    }

    /** The browser's own voice, when the server voice cannot be reached. */
    function browserSpeak(text, lang, rate) {
        if (!window.speechSynthesis) { toast('This browser cannot speak.'); return; }
        const u = new SpeechSynthesisUtterance(text);
        const v = voice(lang);
        if (v) u.voice = v;
        u.lang = v ? v.lang : lang;
        u.rate = rate; u.pitch = 0.92;
        window.speechSynthesis.speak(u);
    }

    function stopSpeaking() {
        S.speakSeq = (S.speakSeq || 0) + 1;
        if (S.audio) { S.audio.pause(); S.audio = null; }
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }

    /** #1674: the same Cloud voice as the app, picked in Settings; the browser's voice if the server cannot answer. */
    async function speak(text, lang, voiceName) {
        stopSpeaking();
        const seq = S.speakSeq;
        const clean = String(text || '').replace(/[•*#|]/g, ' ').slice(0, 3000);
        const p = voicePrefs();
        const code = lang || 'en';
        try {
            const out = await call('speak', { text: clean, lang: code, voice: voiceName || p[code], rate: p.rate });
            if (seq !== S.speakSeq) return;
            if (!out.audio) throw new Error(out.error || 'No audio.');
            const audio = new Audio('data:audio/mp3;base64,' + out.audio);
            S.audio = audio;
            audio.onended = () => { if (S.audio === audio) S.audio = null; };
            await audio.play();
        } catch (error) {
            if (seq === S.speakSeq) browserSpeak(clean, code, p.rate);
        }
    }

    function speakBriefing() {
        const lead = $('#jv-status').textContent;
        speak(`${$('#jv-hello').textContent}. ${lead} ${S.ai ? S.ai : briefText(S.product).replace(/•/g, '')}`, 'en');
    }

    function listen() {
        const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Rec) { toast('This browser has no speech recognition; use ⌘K.'); return; }
        if (S.listening && S.rec) { S.rec.stop(); return; }
        const rec = new Rec();
        S.rec = rec;
        const heard = voicePrefs().speak;
        rec.lang = heard === 'es' ? 'es-US' : heard === 'en' ? 'en-US' : navigator.language || 'en-US';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onstart = () => { S.listening = true; $('[data-act="listen"]').setAttribute('aria-pressed', 'true'); toast('Listening…', 8000); };
        rec.onend = () => { S.listening = false; $('[data-act="listen"]').setAttribute('aria-pressed', 'false'); };
        rec.onerror = (event) => toast('Voice: ' + event.error);
        rec.onresult = (event) => { const said = event.results[0][0].transcript; toast('“' + said + '”'); run(C.parseCommand(said), { spoken: true }); };
        rec.start();
    }

    // --- commands -------------------------------------------------------------------------------------------

    window.addEventListener('hashchange', () => {
        if (!/^#stats/.test(location.hash) || !document.contains(root)) return;
        const range = S.range;
        readHash();
        $('#jv-range').value = S.range;
        if (S.range !== range) refresh(); else render();
    });

    function go(product) {
        S.product = product;
        writeHash();
        render();
        $('#jv-views').scrollIntoView({ block: 'nearest' });
    }

    function setRange(value) {
        S.range = value;
        $('#jv-range').value = value;
        writeHash();
        refresh();
    }

    async function run(cmd, opts) {
        const spoken = opts && opts.spoken;
        const say = (text) => { if (spoken) speak(text); };
        switch (cmd.type) {
            case 'go': go(cmd.product); say('Showing ' + (C.PRODUCTS.find((p) => p.key === cmd.product) || {}).name + '. ' + briefText(cmd.product).split('\n')[0].replace('• ', '')); break;
            case 'range': setRange(cmd.value); say('Range set.'); break;
            case 'print': printView(cmd.all); break;
            case 'export': if (cmd.format === 'csv') download(`jarvis-${S.product}-${stamp()}.csv`, 'text/csv', C.csv(productRows(S.product))); else if (cmd.format === 'png') panelPng((C.PRODUCTS.find((p) => p.key === S.product) || {}).name, productRows(S.product).filter((r) => typeof r.value === 'number')); else exportAll(); break;
            case 'share': copy(link(), 'Link copied.'); break;
            case 'email': emailBriefing(); break;
            case 'refresh': refresh(); say('Refreshing.'); break;
            case 'speak': speakBriefing(); break;
            case 'stop': stopSpeaking(); break;
            case 'run-job': runJob(cmd.job); break;
            case 'settings': openSettings(); break;
            case 'daily': dailyNow(); break;
            case 'ask': { const lang = voicePrefs().speak; const text = await ask(cmd.question, spoken ? lang : null); if (text && spoken) speak(text, lang); break; }
            default: break;
        }
    }

    async function emailBriefing() {
        toast('Sending…');
        const out = await call('email-briefing', { snapshot: snapshot(), text: (S.ai ? S.ai + '\n\n' : '') + briefText('overview') });
        toast(out.ok && out.sent ? 'Briefing emailed to you.' : 'Email failed: ' + (out.error || 'mail is not set up'), 5000);
    }

    function commands() {
        const list = [];
        C.PRODUCTS.forEach((p, i) => list.push({ label: `Go to ${p.name}`, hint: String(i + 1), fn: () => go(p.key) }));
        RANGES.forEach(([v, l]) => list.push({ label: `Range: ${l}`, fn: () => setRange(v) }));
        list.push(
            { label: 'Read the briefing aloud', fn: speakBriefing }, { label: 'Talk to Jarvis (microphone)', fn: listen },
            { label: 'Gemini briefing', fn: aiBrief }, { label: 'Refresh everything', hint: 'R', fn: () => refresh() },
            { label: S.live ? 'Pause live updates' : 'Resume live updates', fn: toggleLive },
            { label: 'Print this product', hint: 'P', fn: () => printView(false) }, { label: 'Print every product', fn: () => printView(true) },
            { label: 'Export everything (JSON)', fn: exportAll }, { label: 'Export this product (CSV)', fn: () => run({ type: 'export', format: 'csv' }) },
            { label: 'Export this product (PNG)', fn: () => run({ type: 'export', format: 'png' }) }, { label: 'Download the briefing (Markdown)', fn: () => download(`jarvis-briefing-${stamp()}.md`, 'text/markdown', markdown()) },
            { label: 'Copy a link to this view', fn: () => copy(link(), 'Link copied.') }, { label: 'Copy the briefing', fn: () => copy(markdown(), 'Briefing copied.') },
            { label: 'Share…', fn: webShare }, { label: 'Email me the briefing', fn: emailBriefing },
            { label: 'Settings: goals, thresholds, email', hint: 'G', fn: openSettings }, { label: 'Send the daily briefing email now', fn: dailyNow },
            { label: 'Send the daily URL Review report', fn: () => sendReport('review', 'daily') }, { label: 'Send the daily site report', fn: () => sendReport('site', 'daily') }
        );
        ((S.external.jobs && S.external.jobs.jobs) || []).forEach((j) => list.push({ label: `Run ${j.name}`, hint: j.schedule, fn: () => runJob(j.name) }));
        LINKS.forEach(([label, url]) => list.push({ label, fn: () => window.open(url, '_blank', 'noopener') }));
        return list;
    }

    function palette(open) {
        const box = $('.jv-palette');
        box.hidden = !open;
        if (!open) return;
        const input = $('#jv-cmd');
        input.value = '';
        paint('');
        input.focus();
    }

    function paint(text) {
        const t = text.trim().toLowerCase();
        const words = t.split(/\s+/).filter(Boolean);
        const all = commands();
        const hits = (words.length ? all.filter((c) => words.every((w) => c.label.toLowerCase().includes(w))) : all).slice(0, 12);
        if (t) hits.push({ label: `Ask Jarvis: “${text.trim()}”`, fn: () => run(C.parseCommand(text)) });
        S.hits = hits;
        S.hit = 0;
        $('#jv-cmd-list').innerHTML = hits.map((c, i) => `<li role="option" data-hit="${i}" aria-selected="${i === 0}"><span>${esc(c.label)}</span>${c.hint ? `<kbd>${esc(c.hint)}</kbd>` : ''}</li>`).join('');
    }

    function choose(i) {
        const c = (S.hits || [])[i];
        palette(false);
        if (c) c.fn();
    }

    async function webShare() {
        const data = { title: 'Jarvis briefing', text: briefText(S.product).slice(0, 1500), url: link() };
        if (navigator.share) { try { await navigator.share(data); } catch (error) { /* closed */ } } else copy(data.text + '\n' + data.url, 'Briefing and link copied.');
    }

    async function sendReport(kind, period) {
        if (!confirmRun(`send the ${period} ${kind === 'site' ? 'site' : 'URL Review'} report now`)) return;
        const out = await call('send-report', { kind, period });
        toast(out.ok ? out.note : 'Report failed: ' + out.error, 5000);
    }

    // --- settings: goals, thresholds and email, saved through the jarvis function ------------------------------

    function draftSettings() {
        const s = S.settings || {};
        return { goals: (s.goals || []).map((g) => Object.assign({}, g)), thresholds: C.thresholds(s.thresholds), mail: Object.assign({ daily: true, gemini: true, watch: true, weekly: true }, s.mail || {}), searchQueries: (s.searchQueries || []).slice(), github: { repos: C.githubRepos(s.github && s.github.repos) },
            actions: { auto: !(s.actions && s.actions.auto === false), caps: Object.assign({}, ACTION_CAPS, (s.actions || {}).caps), confidence: Number((s.actions || {}).confidence) || 0.8, countdownHours: Number((s.actions || {}).countdownHours) || COUNTDOWN_HOURS } };
    }

    function goalEditor(g, i) {
        const products = Object.keys(C.GOAL_METRICS);
        const metrics = C.GOAL_METRICS[g.product] || C.GOAL_METRICS.cv;
        const opt = (value, label, on) => `<option value="${esc(value)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
        return `<div class="jv-goal-edit" data-goal="${i}">
            <select name="g-product" aria-label="Product" data-menu-ready="1">${products.map((k) => opt(k, (C.PRODUCTS.find((p) => p.key === k) || {}).name, k === g.product)).join('')}</select>
            <select name="g-metric" aria-label="Metric" data-menu-ready="1">${Object.keys(metrics).map((k) => opt(k, metrics[k], k === g.metric)).join('')}</select>
            <select name="g-period" aria-label="Period" data-menu-ready="1">${Object.keys(C.GOAL_PERIODS).map((k) => opt(k, C.GOAL_PERIODS[k], k === g.period)).join('')}</select>
            <input name="g-target" type="number" min="0.01" step="any" value="${esc(g.target || '')}" aria-label="Target" placeholder="Target">
            <button type="button" class="jv-btn small" data-goal-remove="${i}" aria-label="Remove goal">✕</button></div>`;
    }

    function paintSettings(d) {
        const th = C.THRESHOLDS;
        $('.jv-settings-box').innerHTML = `<header><h3>Jarvis settings</h3><button type="button" class="jv-btn small" data-settings-close aria-label="Close">✕</button></header>
            <section><h4>Email</h4>
              <label class="jv-check"><input type="checkbox" name="m-daily"${d.mail.daily ? ' checked' : ''}> Daily briefing email at 07:40 (Bogotá): the last 24 hours, goals and alerts (it is always pushed)</label>
              <label class="jv-check"><input type="checkbox" name="m-gemini"${d.mail.gemini ? ' checked' : ''}> Add the Gemini summary to the daily briefing</label>
              <label class="jv-check"><input type="checkbox" name="m-watch"${d.mail.watch ? ' checked' : ''}> Alert email, once a day per issue (pages down, TLS, failed jobs, failed runs); the hourly watch always pushes</label>
              <label class="jv-check"><input type="checkbox" name="m-weekly"${d.mail.weekly ? ' checked' : ''}> Weekly strategy on Sunday at 19:00 (Bogotá): four weeks side by side, the proposals and the plan for next week</label>
              <label class="jv-check"><input type="checkbox" name="m-digest"${d.mail.digest ? ' checked' : ''}> Evening digest at 20:00 (Bogotá): what Jarvis pushed in the last 24 hours, what still waits for you and what ran. Skipped on an empty day.</label>
              <p class="jv-note">These arrive as Jarvis pushes and in the digest. Tick one to get its email as well.</p>
              <div class="jv-th-grid">${Object.keys(MOVED_MAIL).map((k) => `<label class="jv-check"><input type="checkbox" name="m-${k}"${d.mail[k] ? ' checked' : ''}> ${esc(MOVED_MAIL[k])}</label>`).join('')}</div>
              <div class="jv-actions"><button type="button" class="jv-btn" data-act="daily-now">Send today's briefing now</button><button type="button" class="jv-btn" data-act="weekly-now">Send the weekly strategy now</button><button type="button" class="jv-btn" data-act="digest-now">Send the evening digest now</button></div></section>
            <section data-bp-section></section>
            <section data-voice-section>${voiceSection()}</section>
            <section data-devices-section>${devicesSection()}</section>
            <section><h4>Actions</h4>
              <label class="jv-check"><input type="checkbox" name="a-auto"${d.actions.auto ? ' checked' : ''}> Let Jarvis run the safe actions on its own every hour, within these daily caps</label>
              <div class="jv-th-grid">${Object.keys(ACTION_CAPS).map((k) => `<label class="jv-field">${esc(ACTION_LABELS[k].replace(/^./, (c) => c.toUpperCase()))} per day<input type="number" name="a-cap-${k}" min="0" max="100" step="1" value="${esc(d.actions.caps[k])}"></label>`).join('')}<label class="jv-field">AI confidence needed to act alone<input type="number" name="a-confidence" min="0.5" max="1" step="0.05" value="${esc(d.actions.confidence)}"></label><label class="jv-field">Countdown before a risky action, hours (0.25-24)<input type="number" name="a-countdown" min="0.25" max="24" step="0.25" value="${esc(d.actions.countdownHours)}"></label></div>
              <p class="jv-note">Held re-runs go out on their own only when clean (a complete report with a score). Owner notices keep Monday-Saturday 08:00-19:00 Bogotá, three tries and the daily notice budget, even when you click. Failed jobs and CI runs are re-run once; outreach mailboxes are paused when their DNS, warm-up or score fails; warm-up that is off is turned back on first, and a missing canary, postmaster or abuse alias is restored. The AI only picks from Jarvis's own actions; picks under the confidence become proposals.</p></section>
            <section><h4>Goals</h4><div class="jv-goal-list">${d.goals.map(goalEditor).join('') || '<p class="jv-note">No goals yet. Add one: a product, what to count, the period, and the target.</p>'}</div>
              <div class="jv-actions"><button type="button" class="jv-btn" data-goal-add>Add a goal</button></div>
              <p class="jv-note">Goals count every row on the server (tests included) over the current Bogotá day, week (from Monday) or month.</p></section>
            <section><h4>Thresholds</h4><div class="jv-th-grid">${Object.keys(th).map((k) => `<label class="jv-field">${esc(th[k].label)}<input type="number" name="t-${k}" min="${th[k].min}" max="${th[k].max}" step="any" value="${esc(d.thresholds[k])}"></label>`).join('')}</div>
              <div class="jv-actions"><button type="button" class="jv-btn small" data-th-reset>Back to the defaults</button></div></section>
            <section><h4>Search rankings</h4><label class="jv-field">Searches to rank on Brave, one per line (up to 8)<textarea name="s-queries" rows="5" placeholder="${esc(C.SEARCH_QUERIES.join('\n'))}">${esc((d.searchQueries || []).join('\n'))}</textarea></label>
              <p class="jv-note">Left empty, Jarvis checks the default searches shown. Brave's top 20 is asked once a day, places 21–100 once a week.</p></section>
            <section><h4>GitHub repos</h4><label class="jv-field">Repos the GitHub tab shows, owner/name, one per line (up to 20)<textarea name="s-repos" rows="4" placeholder="${esc(C.GITHUB_REPOS.join('\n'))}">${esc(((d.github && d.github.repos) || []).join('\n'))}</textarea></label>
              <p class="jv-note">Left empty, the tab shows the four shown. The app shows the same list; a repo the qa-lab-agents app cannot see is listed under Needs you.</p></section>
            <footer><span class="jv-note">${S.settings && S.settings.updatedAt ? 'Saved ' + esc(when(S.settings.updatedAt)) : 'Using the defaults'}</span><button type="button" class="jv-btn" data-settings-close>Cancel</button><button type="submit" class="jv-btn is-primary">Save</button></footer>`;
        bp.paint($('[data-bp-section]'));
    }

    /** #2068: this browser as Jarvis reads it, and every phone and browser seen in the last 30 days, as in the app's Settings. */
    function devicesSection() {
        const d = device();
        const rows = (S.devices || []).map((r) => `<li${r.mine ? ' class="is-mine"' : ''}><strong>${esc(r.name || 'Unknown device')}${r.mine ? ' (this one)' : ''}</strong>
            <span class="jv-note">${esc(r.label)} · ${r.app === 'web' ? 'browser' : 'app'} · ${esc(when(r.seenAt))}</span></li>`).join('');
        return `<h4>Devices</h4><p class="jv-note">This browser: ${esc(d ? C.deviceLabel(d) : 'unknown')}.</p>
            ${rows ? `<ul class="jv-devices">${rows}</ul>` : '<p class="jv-note">No device has checked in yet.</p>'}
            <p class="jv-note">Phones and browsers signed in during the last 30 days. Ask keeps answers short on phone-sized screens and goes longer on large ones.</p>`;
    }

    function paintDevices() { const node = $('[data-devices-section]'); if (node) node.innerHTML = devicesSection(); }

    /** #1674: kept in this browser, like the app keeps its own; applies at once, without Save. */
    function voiceSection() {
        const p = voicePrefs();
        const opt = (value, label, on) => `<option value="${esc(value)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
        const browser = (() => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(String(navigator.language || 'en').slice(0, 2)); } catch (error) { return 'browser'; } })();
        const pick = (code, title) => `<label class="jv-field">${title}<select data-voice-pick="${code}" data-menu-ready="1">${C.VOICES.filter((v) => v.lang === code).map((v) => opt(v.name, v.label, v.name === p[code])).join('')}</select></label>`;
        const r = C.VOICE_RATE;
        return `<h4>Voice</h4><div class="jv-th-grid">
              <label class="jv-field">Language<select data-voice-lang data-menu-ready="1">${opt('', 'Browser (' + browser + ')', !p.lang)}${opt('en', 'English', p.lang === 'en')}${opt('es', 'Español', p.lang === 'es')}</select></label>
              ${pick('en', 'English voice')}${pick('es', 'Spanish voice')}
              <label class="jv-field">Speed <output data-voice-rate-out>${p.rate.toFixed(2)}×</output><input type="range" data-voice-rate min="${r.min}" max="${r.max}" step="${r.step}" value="${p.rate}"></label></div>
              <div class="jv-actions"><button type="button" class="jv-btn" data-voice-preview>Preview</button></div>
              <p class="jv-note">The same voice as the phone app. Spoken questions are heard and answered in the language above; the briefing is read in English. If the voice cannot be reached, the browser's own voice reads instead.</p>`;
    }

    // --- pushes in the page (#1671) -------------------------------------------------------------------------

    const bp = createBrowserPush({ call, toast, esc });
    const pushes = [];

    function pushCard(msg) {
        const i = pushes.push(msg) - 1;
        const card = document.createElement('div');
        card.className = 'jv-push';
        card.dataset.push = String(i);
        card.innerHTML = `<strong>${esc(msg.title)}</strong><p>${esc(msg.body)}</p>
            <div class="jv-actions">${(msg.ref ? msg.actions || [] : []).map((a, n) => `<button type="button" class="jv-btn small" data-push-act="${n}">${esc(a.label)}</button>`).join('')}
            <button type="button" class="jv-btn small" data-push-open>Open</button><button type="button" class="jv-btn small" data-push-close aria-label="Close">✕</button></div>`;
        $('.jv-pushes').prepend(card);
        if (msg.quiet) setTimeout(() => card.remove(), 8000);
    }

    async function pushAct(card, n) {
        const msg = pushes[Number(card.dataset.push)];
        const a = msg && (msg.actions || [])[n];
        if (!a) return;
        if (a.input) { card.remove(); openReply(msg); return; }
        if (a.act === 'open') { card.remove(); openFromPush({ url: a.url, tab: a.tab }); return; }
        card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        const out = await call('notify-act', { ref: msg.ref, act: a.act });
        toast(out.ok ? out.message || 'Done.' : 'Not done: ' + out.error, 6000);
        if (out.ok) card.remove(); else card.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }

    function openFromPush(msg) {
        if (msg.url) { window.open(msg.url, '_blank', 'noopener'); return; }
        const key = productOf(msg.tab, C.PRODUCTS.map((p) => p.key));
        if (key) go(key);
    }

    function openReply(msg) {
        S.reply = { ref: String(msg.ref || ''), title: String(msg.title || ''), body: String(msg.body || '') };
        $('[data-reply]').innerHTML = `<header><h3>${esc(S.reply.title || 'Reply')}</h3><button type="button" class="jv-btn small" data-reply-close aria-label="Close">✕</button></header>
            <section><blockquote class="jv-note">${esc(S.reply.body)}</blockquote>
              <label class="jv-field">Your reply, emailed to them now<textarea name="text" rows="7" minlength="10" required></textarea></label></section>
            <footer><span class="jv-note">At least 10 characters. It goes out like the Respond button's reply.</span><button type="button" class="jv-btn" data-reply-close>Cancel</button><button type="submit" class="jv-btn is-primary">Send</button></footer>`;
        $('.jv-reply').hidden = false;
        $('[data-reply] textarea').focus();
    }

    async function sendReply(form) {
        const text = form.text.value.trim();
        if (text.length < 10) { toast('A reply needs at least 10 characters.', 4000); return; }
        toast('Sending…');
        const out = await call('notify-act', { ref: S.reply.ref, act: 'reply', text });
        if (!out.ok) { toast('Not sent: ' + out.error, 6000); return; }
        $('.jv-reply').hidden = true;
        toast(out.message || 'Reply sent.');
    }

    /** ?jarvis=<tab> or ?jarvis=reply&ref=…: from a browser notification, once Jarvis is showing. */
    function openLink(params) {
        const j = params.get('jarvis');
        if (!j) return;
        if (j === 'reply' && /^(message|rating):/.test(params.get('ref') || '')) openReply({ ref: params.get('ref'), title: params.get('title'), body: params.get('body') });
        else { const key = productOf(j, C.PRODUCTS.map((p) => p.key)); if (key) go(key); }
        const url = new URL(window.location.href);
        ['jarvis', 'ref', 'title', 'body'].forEach((k) => url.searchParams.delete(k));
        history.replaceState({}, '', url.pathname + url.search + url.hash);
    }

    if (bp.supported) navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.jarvisPush) pushCard(event.data.jarvisPush);
        // A section changed on the server (#2509): fetch only the sections this page does not hold yet (#2510).
        if (event.data && event.data.jarvisSections && S.live && S.mounted && !document.hidden) {
            const only = C.sectionsToFetch(event.data.jarvisSections, S.versions, S.range);
            if (only.length) loadNewer(only);
        }
    });
    if (bp.supported) bp.endpoint().then((e) => { S.pushEndpoint = e || ''; }).catch(() => null);

    function readSettings() {
        const form = $('.jv-settings-box');
        const val = (name) => (form.querySelector(`[name="${name}"]`) || {});
        const goals = Array.from(form.querySelectorAll('[data-goal]')).map((row) => ({
            product: row.querySelector('[name="g-product"]').value, metric: row.querySelector('[name="g-metric"]').value,
            period: row.querySelector('[name="g-period"]').value, target: Number(row.querySelector('[name="g-target"]').value)
        }));
        const thresholds = {};
        Object.keys(C.THRESHOLDS).forEach((k) => { thresholds[k] = Number(val('t-' + k).value); });
        const searchQueries = String(val('s-queries').value || '').split('\n').map((q) => q.trim()).filter(Boolean).slice(0, 8);
        const github = { repos: C.githubRepos(String(val('s-repos').value || '').split('\n')) };
        return { goals, thresholds, mail: Object.assign({ daily: !!val('m-daily').checked, gemini: !!val('m-gemini').checked, watch: !!val('m-watch').checked, weekly: !!val('m-weekly').checked, digest: !!val('m-digest').checked },
            Object.fromEntries(Object.keys(MOVED_MAIL).map((k) => [k, !!val('m-' + k).checked]))), searchQueries, github,
            actions: { auto: !!val('a-auto').checked, caps: Object.keys(ACTION_CAPS).reduce((m, k) => { m[k] = Number(val('a-cap-' + k).value); return m; }, {}), confidence: Number(val('a-confidence').value), countdownHours: Number(val('a-countdown').value) } };
    }

    function openSettings() {
        palette(false);
        paintSettings(draftSettings());
        $('.jv-settings').hidden = false;
        const first = $('.jv-settings-box input, .jv-settings-box select');
        if (first) first.focus();
    }

    function closeSettings() { $('.jv-settings').hidden = true; }

    async function saveSettings() {
        const settings = readSettings();
        const bad = settings.goals.filter((g) => !(g.target > 0));
        if (bad.length) { toast('Every goal needs a target above 0.', 4000); return; }
        toast('Saving…');
        const out = await call('settings-save', { settings });
        if (!out.ok) { toast('Not saved: ' + (out.error || 'no answer'), 5000); return; }
        const repos = (s) => JSON.stringify(C.githubRepos(s && s.github && s.github.repos));
        const reposChanged = repos(S.settings) !== repos(out);
        S.settings = out;
        closeSettings();
        toast('Saved. Jarvis is recounting the goals.');
        compute();
        render();
        loadExternal(reposChanged ? ['goals', 'github-work'] : ['goals']);
    }

    async function dailyNow() {
        if (!confirmRun('email the daily briefing now (the last 24 hours)')) return;
        toast('Building the daily briefing…', 30000);
        const out = await call('daily-now');
        toast(out.ok && out.sent ? `Daily briefing sent: ${out.items} lines${out.gemini ? ' with the Gemini summary' : ''}.` : 'Not sent: ' + (out.error || 'mail is not set up'), 6000);
    }

    async function digestNow() {
        if (!confirmRun('email the evening digest now (the last 24 hours)')) return;
        toast('Building the evening digest…', 30000);
        const out = await call('digest-now');
        toast(out.ok ? 'Evening digest: ' + out.result : 'Not sent: ' + (out.error || 'mail is not set up'), 6000);
    }

    async function weeklyNow() {
        if (!confirmRun('email the weekly strategy now (the last four weeks)')) return;
        toast('Building the weekly strategy…', 60000);
        const out = await call('weekly-now');
        toast(out.ok && out.sent ? `Weekly strategy sent: ${out.proposals} proposals${out.gemini ? ' with the Gemini plan' : ''}.` : 'Not sent: ' + (out.error || 'mail is not set up'), 6000);
    }

    function toggleLive() {
        S.live = !S.live;
        $('.jv-live').setAttribute('aria-pressed', String(S.live));
        root.classList.toggle('is-paused', !S.live);
        toast(S.live ? 'Live updates on.' : 'Live updates paused.');
    }

    // --- events ---------------------------------------------------------------------------------------------

    root.addEventListener('pointerover', (event) => { const hit = event.target.closest && event.target.closest('.jv-hit'); if (hit && event.pointerType === 'mouse') chartTip(hit); });
    root.addEventListener('pointerout', (event) => {
        const fig = event.pointerType === 'mouse' && event.target.closest && event.target.closest('.jv-chart');
        if (fig && !fig.contains(event.relatedTarget)) chartTipOff(fig);
    });
    root.addEventListener('toggle', (event) => {
        const d = event.target;
        if (d.dataset && d.dataset.person) { if (d.open) openPeople.add(d.dataset.person); else openPeople.delete(d.dataset.person); }
    }, true);
    root.addEventListener('error', (event) => {
        const img = event.target;
        if (!img.matches || !img.matches('img[data-card]')) return;
        brokenCards.add(img.getAttribute('src'));
        img.outerHTML = proposalCard({ image: img.getAttribute('src') });
    }, true);
    root.addEventListener('click', (event) => {
        if (event.target.matches('[data-sheet-root]')) { closeSheet(); return; }
        const hit = event.target.closest('.jv-hit');
        if (hit) { chartTip(hit); return; }
        const opener = event.target.closest('[data-drill-open]');
        if (opener && root.contains(opener)) { drillToggle(opener); return; }
        const t = event.target.closest('button, a, li[data-hit], li[data-brief]');
        if (!t || !root.contains(t)) return;
        if (t.dataset.conDock !== undefined) { dock(!docked); return; }
        if (t.dataset.conClose !== undefined) { dock(false); return; }
        if (t.dataset.conFull !== undefined) { dock(false); go('console'); return; }
        if (t.closest('[data-con]')) return;
        if (t.dataset.fold !== undefined) { fold(t.dataset.fold, !folded.has(t.dataset.fold)); return; }
        if (t.dataset.foldAll !== undefined) { foldAll(t.dataset.foldAll === '1'); return; }
        if (t.dataset.hit !== undefined) { choose(Number(t.dataset.hit)); return; }
        if (t.dataset.brief !== undefined) { openSheet(t.dataset.brief); return; }
        if (t.dataset.briefHidden !== undefined) { S.showHidden = !S.showHidden; render(); return; }
        if (t.dataset.pick) { S.pick = t.dataset.pick; render(); const again = $(`[data-pick="${CSS.escape(S.pick)}"]`); if (again) again.focus(); return; }
        if (t.dataset.nodata !== undefined) { toast(t.textContent + ': ' + t.dataset.nodata, 5000); return; }
        if (t.dataset.sheet !== undefined) { sheetAct(t); return; }
        if (t.dataset.settingsClose !== undefined) { closeSettings(); return; }
        if (t.dataset.voicePreview !== undefined) { const lang = voicePrefs().speak === 'es' ? 'es' : 'en'; speak(C.VOICE_SAMPLE[lang], lang); return; }
        if (t.dataset.bp) { bp.handle($('[data-bp-section]'), t.dataset.bp); return; }
        if (t.dataset.replyClose !== undefined) { $('.jv-reply').hidden = true; return; }
        if (t.dataset.pushAct) { pushAct(t.closest('.jv-push'), Number(t.dataset.pushAct)); return; }
        if (t.dataset.pushOpen !== undefined) { const card = t.closest('.jv-push'); openFromPush(pushes[Number(card.dataset.push)] || {}); card.remove(); return; }
        if (t.dataset.pushClose !== undefined) { t.closest('.jv-push').remove(); return; }
        if (t.dataset.goalAdd !== undefined) { const d = readSettings(); d.goals.push({ product: 'cv', metric: 'visits', period: 'week', target: '' }); paintSettings(d); return; }
        if (t.dataset.goalRemove !== undefined) { const d = readSettings(); d.goals.splice(Number(t.dataset.goalRemove), 1); paintSettings(d); return; }
        if (t.dataset.thReset !== undefined) { const d = readSettings(); d.thresholds = C.thresholds({}); paintSettings(d); return; }
        if (t.dataset.menu) { const list = $(`[data-list="${t.dataset.menu}"]`); const open = list.hidden; $$('.jv-menu-list').forEach((l) => { l.hidden = true; }); list.hidden = !open; return; }
        $$('.jv-menu-list').forEach((l) => { l.hidden = true; });
        if (t.dataset.proposal) { markProposal(t.dataset.key, t.dataset.proposal); return; }
        if (t.dataset.propRun) { runProposal(t.dataset.propRun); return; }
        if (t.dataset.runAction) { runAction(t.dataset.runAction, t.dataset.job, t.dataset.key); return; }
        if (t.dataset.countdownAct) { countdownAct(t.dataset.id, t.dataset.countdownAct); return; }
        if (t.dataset.psAct) { pageSpeedAct(t); return; }
        if (t.dataset.socialDecide) { decideSocial(t.dataset.key, t.dataset.socialDecide); return; }
        if (t.dataset.mkCampaign) { campaignAct(t); return; }
        if (t.dataset.mkResend) { resendAct(t); return; }
        if (t.dataset.liSend) { liSend(t); return; }
        if (t.dataset.mkCmd) { mkCmdClick(t); return; }
        if (t.dataset.tgAct) { targetAct(t); return; }
        if (t.dataset.ghRerun) { ghRerun(t); return; }
        if (t.dataset.ghAct) { ghAct(t); return; }
        if (t.dataset.ghDiagnose !== undefined) { ghDiagnose(t.dataset.ghDiagnose); return; }
        if (t.dataset.ghAgent || t.dataset.ghAgentPr) { ghAgent(t); return; }
        if (t.dataset.ghAsk) { ask(t.dataset.ghAsk); return; }
        if (t.dataset.mkRereview) { leadReview(t); return; }
        if (t.dataset.mkReply) { mkReply(t); return; }
        if (t.dataset.mkWeek) { S.mkWeek = t.dataset.mkWeek; render(); return; }
        if (t.dataset.mkDone) { S.mkDone = t.dataset.mkDone === 'on'; render(); return; }
        if (t.dataset.egDecide) { egDecide(t.dataset.key, t.dataset.egDecide); return; }
        if (t.dataset.egPause) { egSettings({ paused: t.dataset.egPause === 'on' }, t.dataset.egPause === 'on' ? 'pause every engagement action, draft and push' : 'resume engagement'); return; }
        if (t.dataset.egReport) { egReport(t.dataset.egReport); return; }
        if (t.dataset.egAll) { S.egAll = t.dataset.egAll === 'on'; render(); return; }
        if (t.dataset.egOnly) { S.egOnly = t.dataset.egOnly; render(); return; }
        if (t.dataset.egLive) { egSettings({ live: t.dataset.egLive === 'on' }, t.dataset.egLive === 'on' ? 'go live: planned likes, reposts and follows go out on the connected networks, within the daily caps' : 'go back to a dry run, where planned actions are only logged'); return; }
        if (t.dataset.egConnect) { egConnect({ network: t.dataset.egConnect }); return; }
        if (t.dataset.egDisconnect) { egConnect({ network: t.dataset.egDisconnect, disconnect: true }, `disconnect ${t.dataset.egDisconnect}, so nothing goes out there`); return; }
        if (t.dataset.otPause) { otSettings({ paused: t.dataset.otPause === 'on' }, t.dataset.otPause === 'on' ? 'pause owner tags: no comment, reply or suggestion until you resume' : 'resume owner tags'); return; }
        if (t.dataset.otLive) { otSettings({ live: t.dataset.otLive === 'on' }, t.dataset.otLive === 'on' ? 'go live: the next run queues the tag comments and owner replies, within the daily caps' : 'go back to a dry run, where owner tags only count what they would post'); return; }
        if (t.dataset.otRun !== undefined) { otRun(); return; }
        if (t.dataset.otAcct) {
            const s = t.dataset.otAcct;
            otAccount({ network: t.dataset.network, handle: t.dataset.handle, status: s }, s === 'approved' ? '' : `${s === 'blocked' ? 'block' : 'reject'} @${t.dataset.handle}${s === 'blocked' ? ': never tagged again, and its queued comments are dismissed' : ''}`);
            return;
        }
        if (t.dataset.copyLink) { copy(t.dataset.copyLink, 'Link copied.'); return; }
        if (t.dataset.copyCode) { copy(t.dataset.copyCode, 'Code copied.'); return; }
        if (t.dataset.qlBuild !== undefined) {
            const host = String($('#jv-ql-host').value || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
            if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) { toast('Type a domain like prospect.edu.'); return; }
            const url = `https://qalabreview.com/${$('#jv-ql-lang').value}/${host}`;
            const out = $('#jv-ql-out');
            out.href = url;
            out.textContent = url.replace(/^https:\/\//, '') + ' →';
            copy(url, 'Link copied.');
            return;
        }
        if (t.dataset.noticeSend || t.dataset.noticeDrop) { decideNotice(t.dataset.noticeSend || t.dataset.noticeDrop, !!t.dataset.noticeSend); return; }
        if (t.dataset.go) { closeSheet(); go(t.dataset.go); return; }
        if (t.dataset.mail) { S.mail = t.dataset.mail; compute(); render(); return; }
        if (t.dataset.run) { runJob(t.dataset.run); return; }
        if (t.dataset.report) { const [kind, period] = t.dataset.report.split(':'); sendReport(kind, period); return; }
        if (t.dataset.panelExport) {
            const p = S.panels.get(t.dataset.panel);
            if (!p) return;
            const rows = Array.isArray(p.rows) ? p.rows.filter(Boolean) : [];
            if (t.dataset.panelExport === 'csv') download(`jarvis-${t.dataset.panel}-${stamp()}.csv`, 'text/csv', C.csv(rows.map((r) => (typeof r === 'object' ? r : { value: r }))));
            else if (t.dataset.panelExport === 'json') download(`jarvis-${t.dataset.panel}-${stamp()}.json`, 'application/json', JSON.stringify({ title: p.title, range: S.range, rows }, null, 2));
            else panelPng(p.title, rows);
            return;
        }
        const act = t.dataset.act;
        const acts = {
            systems: () => go('systems'), live: toggleLive, refresh: () => refresh(), speak: speakBriefing, listen, palette: () => palette(true),
            'copy-link': () => copy(link(), 'Link copied.'), 'web-share': webShare, 'copy-brief': () => copy(markdown(), 'Briefing copied.'), email: emailBriefing,
            'export-json': exportAll, 'export-csv': () => run({ type: 'export', format: 'csv' }), 'export-png': () => run({ type: 'export', format: 'png' }),
            'export-md': () => download(`jarvis-briefing-${stamp()}.md`, 'text/markdown', markdown()), print: () => printView(false), 'print-all': () => printView(true), 'ai-brief': aiBrief,
            settings: () => { openSettings(); const at = t.dataset.settingsAt && $(`[name="${t.dataset.settingsAt}"]`); if (at) { at.focus(); at.scrollIntoView({ block: 'center' }); } }, 'daily-now': dailyNow, 'weekly-now': weeklyNow, 'digest-now': digestNow, proposals: loadProposals, 'social-post-now': postNow, 'mk-reload': () => loadExternal(['marketing', 'marketing-sync', 'outreach', 'targets', 'social', 'notices']), 'gh-reload': ghReload, 'share-draft': shareDraft, 'share-queue': shareQueue, 'share-drop': shareDrop, 'calendar-connect': calendarConnect
        };
        if (acts[act]) acts[act]();
    });

    root.addEventListener('input', (event) => {
        const t = event.target;
        if (t.dataset.shareField && S.share.draft) S.share.draft[t.dataset.shareField] = t.value;
        else if (t.dataset.shareCaption !== undefined) S.share.caption = t.value;
        else if (t.dataset.mkField) S.mkForm[t.dataset.mkField] = t.value;
        else if (t.dataset.mkDraft) S.mkDrafts[t.dataset.mkDraft] = t.value;
        else if (t.dataset.egDraft) S.egDrafts[t.dataset.egDraft] = t.value;
        else if (t.dataset.voiceRate !== undefined) $('[data-voice-rate-out]').textContent = Number(t.value).toFixed(2) + '×';
    });
    root.addEventListener('change', (event) => {
        if (event.target.dataset.shareFile !== undefined) { S.share.file = event.target.files[0] || null; render(); return; }
        if (event.target.dataset.mkField) { S.mkForm[event.target.dataset.mkField] = event.target.value; return; }
        if (event.target.dataset.bpKind) { bp.kindChanged(event.target.dataset.bpKind, event.target.checked); return; }
        if (event.target.dataset.noticePick !== undefined || event.target.dataset.noticeAll !== undefined) { pickNotice(event.target); return; }
        if (event.target.dataset.voiceLang !== undefined) { saveVoice({ lang: event.target.value || null }); return; }
        if (event.target.dataset.voiceRate !== undefined) { saveVoice({ rate: Number(event.target.value) }); return; }
        if (event.target.dataset.voicePick) { const code = event.target.dataset.voicePick; saveVoice({ [code]: event.target.value }); speak(C.VOICE_SAMPLE[code], code, event.target.value); return; }
        if (event.target.name !== 'g-product') return;
        const d = readSettings();
        const i = Number(event.target.closest('[data-goal]').dataset.goal);
        d.goals[i].metric = Object.keys(C.GOAL_METRICS[d.goals[i].product])[0];
        paintSettings(d);
    });

    root.addEventListener('submit', async (event) => {
        const form = event.target;
        event.preventDefault();
        if (form.dataset.settings !== undefined) { saveSettings(); return; }
        if (form.dataset.reply !== undefined) { sendReply(form); return; }
        if (form.dataset.ask !== undefined) {
            const q = form.q.value.trim();
            if (q) run(C.parseCommand(q).type === 'ask' ? { type: 'ask', question: q } : C.parseCommand(q));
        } else if (form.dataset.mkQueue !== undefined) {
            const lines = form.hosts.value.trim();
            if (!lines || !confirmRun(`queue ${lines.split(/[\n;]+/).filter(Boolean).length} prospect site(s) for the nightly sweep`)) return;
            const out = await call('marketing-queue', { hosts: lines, cc: form.cc.value.trim(), sector: form.sector.value }).catch((error) => ({ ok: false, error: error.message }));
            toast(out.ok ? `Queued ${out.added}${out.already ? ', ' + out.already + ' already on the list' : ''}${out.skipped.length ? ', ' + out.skipped.length + ' left out (' + out.skipped.slice(0, 2).map((x) => x.line + ': ' + x.why).join('; ') + ')' : ''}.` : 'Not queued: ' + out.error, 7000);
            if (out.ok) { S.mkForm.hosts = ''; form.hosts.value = ''; loadExternal(['marketing', 'outreach']); }
        } else if (form.dataset.mkReview !== undefined) {
            const url = form.url.value.trim();
            if (!url || !confirmRun(`review ${url} now`)) return;
            const out = await call('review', { url, lang: 'en' }).catch((error) => ({ ok: false, error: error.message }));
            toast(out.ok ? `Reviewing ${out.host}. It shows in the URL Review tab when it is done.` : 'Not started: ' + out.error, 6000);
            if (out.ok) { S.mkForm.url = ''; form.url.value = ''; }
        } else if (form.dataset.mkBlock !== undefined) {
            const value = form.address.value.trim();
            if (!value || !confirmRun(`block ${value} in Instantly, so no campaign ever emails it`)) return;
            const out = await call('marketing-block', { value }).catch((error) => ({ ok: false, error: error.message }));
            toast(out.ok ? `${out.blocked} is blocked in Instantly.` : 'Not blocked: ' + out.error, 6000);
            if (out.ok) { S.mkForm.address = ''; form.address.value = ''; }
        } else if (form.dataset.mkDnc !== undefined) {
            const value = form.addr.value.trim();
            if (!value) return;
            const out = await mkCommand({ action: 'dnc', value, reason: form.reason.value.trim() }, MK_ASK.dnc({ value }));
            if (out && out.ok) { S.mkForm.dnc = ''; S.mkForm.dncWhy = ''; form.addr.value = ''; form.reason.value = ''; }
        } else if (form.dataset.egBluesky !== undefined) {
            const handle = form.elements.handle.value.trim();
            const password = form.elements.password.value.trim();
            if (!handle || !password) { toast('Write the handle and an app password.', 5000); return; }
            form.elements.password.value = '';
            egConnect({ network: 'bluesky', handle, password });
        } else if (form.dataset.egTelegram !== undefined) {
            const token = form.elements.token.value.trim();
            if (!/^\d{5,}:[\w-]{30,}$/.test(token)) { toast('Paste the bot token from BotFather, like 123456789:AAE….', 5000); return; }
            form.elements.token.value = '';
            egConnect({ network: 'telegram', token });
        } else if (form.dataset.otAdd !== undefined) {
            const who = form.elements.who.value.trim();
            const value = form.elements.scopeValue.value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '');
            if (!who || !value) { toast('Write a profile link or handle, and where it belongs (the scope value).', 5000); return; }
            const network = form.elements.network.value;
            if (!/^https?:\/\//i.test(who) && !network) { toast('Pick the network for a handle, or paste the profile link.', 5000); return; }
            const body = Object.assign(/^https?:\/\//i.test(who) ? { url: who } : { network, handle: who.replace(/^@/, '') }, { scope: form.elements.scopeKind.value + ':' + value, kind: form.elements.kind.value, status: 'approved' });
            const out = await otAccount(body);
            if (out && out.ok) form.reset();
        } else if (form.dataset.egSettings !== undefined) {
            const n = (name) => Number(form.elements[name].value);
            const acts = ['like', 'repost', 'follow', 'reply'];
            egSettings({
                caps: Object.fromEntries(acts.concat('join').map((a) => [a, n('cap-' + a)])), thresholds: Object.fromEntries(acts.map((a) => [a, n('th-' + a)])),
                worth: n('worth'), perRun: n('perRun'), maxAgeHours: n('maxAgeHours'),
                competitors: form.elements.competitors.value.split('\n'), own: form.elements.own.value.split('\n')
            });
        } else if (form.dataset.unlist !== undefined) {
            const hostName = form.host.value.trim();
            if (!hostName || !confirmRun(`unlist ${hostName} from Live Reports`)) return;
            const out = await call('unlist', { host: hostName });
            toast(out.ok ? `${out.unlisted} is unlisted.` : 'Unlist failed: ' + out.error, 5000);
            if (out.ok) form.reset();
        }
    });

    $('#jv-range').addEventListener('change', (event) => setRange(event.target.value));
    $('#jv-cmd').addEventListener('input', (event) => paint(event.target.value));
    $('#jv-cmd').addEventListener('keydown', (event) => {
        const items = $$('#jv-cmd-list li');
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            S.hit = (S.hit + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length);
            items.forEach((li, i) => li.setAttribute('aria-selected', String(i === S.hit)));
        } else if (event.key === 'Enter') { event.preventDefault(); choose(S.hit || 0); } else if (event.key === 'Escape') palette(false);
    });
    $('.jv-palette').addEventListener('click', (event) => { if (event.target.classList.contains('jv-palette')) palette(false); });

    const visible = () => host.offsetParent !== null && !host.closest('.hidden');
    function onKey(event) {
        if (!visible()) return;
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((event.target || {}).tagName || '') || (event.target && event.target.isContentEditable);
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); palette($('.jv-palette').hidden); return; }
        if (event.key === 'Escape') { palette(false); closeSettings(); closeSheet(); dock(false); return; }
        if (!S.sheet && !typing && (event.key === 'Enter' || event.key === ' ') && event.target.closest && event.target.closest('li[data-brief]')) { event.preventDefault(); openSheet(event.target.closest('li[data-brief]').dataset.brief); return; }
        if (!S.sheet && !typing && (event.key === 'Enter' || event.key === ' ') && event.target.matches && event.target.matches('[data-drill-open]:not(button)')) { event.preventDefault(); drillToggle(event.target); return; }
        if (S.sheet) return;
        if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
        if (/^[1-9]$/.test(event.key) && C.PRODUCTS[Number(event.key) - 1]) go(C.PRODUCTS[Number(event.key) - 1].key);
        else if (event.key === 'r') refresh();
        else if (event.key === 'p') printView(false);
        else if (event.key === 'g') openSettings();
        else if (event.key === '/') { const ask = $(`[data-view="${S.product}"] .jv-ask input`); if (ask) { event.preventDefault(); ask.focus(); } }
    }
    document.addEventListener('keydown', onKey);
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => { S.voices = {}; };

    S.timers.push(setInterval(() => {
        const node = $('#jv-ago');
        if (node && S.updatedAt) node.textContent = S.live ? 'live · ' + ago(Date.now() - S.updatedAt) : 'paused';
    }, 1000));
    S.timers.push(setInterval(() => {
        if (document.hidden || !visible() || !auth.currentUser) return;
        if (S.product === 'console' || docked) con.pull();
    }, CONSOLE_MS));
    S.timers.push(setInterval(() => {
        if (!S.live || document.hidden || !visible() || !S.mounted) return;
        if (Date.now() - S.updatedAt >= SNAPSHOT_MS) loadNewer();
    }, LIVE_MS));

    return {
        show() {
            greet();
            if (!S.mounted) { S.mounted = true; openSaved(); refresh(); } else { compute(); render(); }
            writeHash();
            openLink(new URLSearchParams(window.location.search));
        },
        open(search) { openLink(new URLSearchParams(search)); },
        inboxChanged() { if (S.mounted) { compute(); render(); } },
        forget: forgetSnapshots,
        state: S,
        run,
        destroy() {
            S.timers.forEach(clearInterval);
            if (holo.raf) cancelAnimationFrame(holo.raf);
            if (holo.io) holo.io.disconnect();
            holo.node = null;
            document.removeEventListener('visibilitychange', holoRun);
            document.removeEventListener('keydown', onKey);
            const icon = document.querySelector('link[data-jv-icon]');
            if (icon) icon.remove();
            document.title = pageTitle;
        }
    };
}
