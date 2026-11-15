/*
 * The Map tab's campaign timeline and channel flow (#3114, part of #2976), from the geo source's `timeline` and `flow`
 * (functions/jarvis-geo-flow.js). Plain SVG drawn at the panel's pixel width, so text keeps its size on a phone.
 * Both follow the selected country; the flow also follows the channel. The Android twin is android/.../ui/GeoFlow.kt.
 */
import { DATE_KINDS, LIGHTS, flagOf } from './admin-jarvis-geo.js?v=2988';

// [key, label, colour]
export const STATUSES = [['draft', 'Draft', '#5d7a8c'], ['scheduled', 'Scheduled', '#a98bff'], ['active', 'Active', '#3dffa8'], ['paused', 'Paused', '#ffb547'], ['done', 'Done', '#2fb0d4']];
export const PAUSE = '#ffb547';
const LANGS = { en: 'English', es: 'Spanish', pt: 'Portuguese', de: 'German', fr: 'French', it: 'Italian' };
// [key, label, colour]; the same keys as the Map's channel filter.
export const FLOW_CHANNELS = [['email', 'Cold email', '#38e1ff', 'Email'], ['sweep', 'Sweep · Live Reports', '#a98bff', 'Sweep'], ['social', 'Social replies', '#4ade80', 'Social'], ['web', 'Visitors · links', '#ffb547', 'Visits']];
// [key, label, light level]: each stage takes the colour of the light it reaches on the map.
export const STAGES = [['prospect', 'Prospect', 1, 'Prosp.'], ['sent', 'Sent', 2, 'Sent'], ['opened', 'Opened', 3, 'Opened'], ['replied', 'Replied', 4, 'Replied'], ['viewed', 'Report viewed', 3, 'Viewed'], ['paid', 'Paid', 5, 'Paid']];
const NARROW = 560;
const DAY = 86400000;

const ms = (d) => Date.parse(d + 'T00:00:00Z');
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = (d) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}` : '');
const statusOf = (k) => STATUSES.find((s) => s[0] === k) || STATUSES[0];
const kindColor = (k) => (k === 'pause' ? PAUSE : (DATE_KINDS[k] || [, '#7aa2ff'])[1]);
const cut = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);

/** The campaigns that reach a country (all of them with none selected), and the markers for it. */
export function timelineFor(tl, cc) {
    const rows = (tl && tl.rows) || [];
    const markers = (tl && tl.markers) || [];
    if (!cc) return { rows, markers };
    return { rows: rows.filter((r) => (r.ccs || []).includes(cc)), markers: markers.filter((m) => m.all || (m.ccs || []).includes(cc)) };
}

/** Bars grouped by language or region, groups in order of their first start. */
export function groups(rows, by) {
    const key = (r) => (by === 'region' ? r.region || 'Other' : r.lang ? `${LANGS[r.lang] || r.lang} · ${r.lang}` : 'Other');
    const out = [];
    rows.filter((r) => r.start).forEach((r) => {
        const k = key(r);
        const g = out.find((x) => x.label === k);
        if (g) g.rows.push(r); else out.push({ label: k, rows: [r] });
    });
    return out;
}

/** Week ticks (Mondays) between from and to, thinned to one every 2 or 4 weeks when they would crowd. */
export function weeks(from, to, px) {
    const first = ms(from) + ((8 - new Date(ms(from)).getUTCDay()) % 7) * DAY;
    const all = [];
    for (let t = first; t <= ms(to); t += 7 * DAY) all.push(iso(t));
    const span = Math.max(1, (ms(to) - ms(from)) / DAY);
    const perWeek = (px * 7) / span;
    const step = perWeek >= 46 ? 1 : perWeek >= 23 ? 2 : 4;
    return all.filter((_, n) => n % step === 0);
}

/** The timeline as SVG at width px. o: cc, group ('lang' or 'region'), selected campaign id. */
export function timelineSvg(tl, o, esc) {
    const W = Math.max(300, Math.round(o.width || 900));
    const { rows, markers } = timelineFor(tl, o.cc);
    const list = groups(rows, o.group);
    const LABEL = Math.round(Math.min(170, W * 0.3));
    const x0 = LABEL + 6;
    const x1 = W - 10;
    const span = Math.max(1, ms(tl.to) - ms(tl.from));
    const x = (d) => +(x0 + ((ms(d) - ms(tl.from)) / span) * (x1 - x0)).toFixed(1);
    const TOP = 40;
    const ROW = 22;
    const HEAD = 20;
    let y = TOP;
    const body = [];
    const chars = Math.floor(LABEL / 6.4);
    list.forEach((g) => {
        body.push(`<text class="jv-tl-group" x="0" y="${y + 14}">${esc(cut(g.label, chars + 4))} · ${g.rows.length}</text><line class="jv-tl-rule" x1="0" x2="${x1}" y1="${y + HEAD - 1}" y2="${y + HEAD - 1}"/>`);
        y += HEAD;
        g.rows.forEach((r) => {
            const s = statusOf(r.status);
            const a = x(r.start);
            const open = r.status === 'active' || ((r.status === 'paused' || r.status === 'done') && !r.end);
            const b = open ? x(tl.today) : x(r.end || r.start);
            const on = o.selected === r.id;
            const stop = r.endBy === 'pause' ? `paused ${dayLabel(r.end)} for a holiday` : r.endBy === 'update' ? `stopped about ${dayLabel(r.end)} (Instantly's last change)` : open && r.status !== 'active' ? `${r.raw} since an unknown day` : '';
            const tip = `${r.name}: ${s[1].toLowerCase()}${r.raw && r.raw !== r.status && r.raw !== 'completed' ? ` (${r.raw})` : ''}, ${r.status === 'scheduled' || r.status === 'draft' ? 'starts' : 'started'} ${dayLabel(r.start)}${stop ? ', ' + stop : ''}${(r.ccs || []).length ? ' · reaches ' + r.ccs.join(', ') : ''}`;
            const mark = b - a < 4
                ? `<path d="M${a} ${y + 4}l6 7-6 7-6-7z" fill="${s[2]}" fill-opacity="${r.status === 'draft' ? 0.35 : 0.85}" stroke="${on ? '#fff' : s[2]}" stroke-width="${on ? 1.6 : 1}"${r.status === 'draft' ? ' stroke-dasharray="2 2"' : ''}/>`
                : `<rect x="${a}" y="${y + 5}" width="${+(b - a).toFixed(1)}" height="12" rx="3" fill="${s[2]}" fill-opacity="${r.status === 'done' ? 0.55 : 0.85}"${on ? ' stroke="#fff" stroke-width="1.6"' : ''}/>${open && r.status !== 'active' ? `<rect x="${b - 3}" y="${y + 5}" width="3" height="12" fill="url(#jv-tl-hatch)"/>` : ''}`;
            const holds = (r.pauses || []).filter((p) => p.date).map((p) => `<rect x="${x(p.date)}" y="${y + 3}" width="${Math.max(4, x(p.until || p.date) - x(p.date))}" height="16" rx="2" fill="url(#jv-tl-hatch)" stroke="${PAUSE}" stroke-width="0.8"><title>${esc(`${p.status === 'planned' ? 'Pauses' : 'Paused'} ${dayLabel(p.date)} for ${p.name} in ${p.cc}, back ${dayLabel(p.until)}`)}</title></rect>`).join('');
            body.push(`<a href="#" class="jv-tl-bar${on ? ' is-on' : ''}" data-geo-camp="${esc(r.id)}" role="button" aria-label="${esc(tip)}"><title>${esc(tip)}</title><rect class="jv-tl-hit" x="0" y="${y}" width="${x1}" height="${ROW}" fill="transparent"/><text class="jv-tl-name" x="0" y="${y + 15}">${esc(cut(r.name, chars))}</text>${mark}${holds}</a>`);
            y += ROW;
        });
    });
    const H = Math.max(y + 8, TOP + 30);
    const ticks = weeks(tl.from, tl.to, x1 - x0).map((d) => `<line class="jv-tl-tick" x1="${x(d)}" x2="${x(d)}" y1="16" y2="${H - 4}"/><text class="jv-tl-week" x="${x(d)}" y="11"${x(d) > x1 - 18 ? ' text-anchor="end"' : ''}>${dayLabel(d)}</text>`).join('');
    const lane = markers.map((m) => {
        const c = kindColor(m.kind);
        const left = x(m.date);
        const w = m.end && m.end > m.date ? Math.max(2, x(m.end) - left) : 0;
        const where = m.all ? 'every target market' : (m.ccs || []).map((cc) => `${flagOf(cc)} ${cc}`).join(', ');
        const tip = `${dayLabel(m.date)}${m.end && m.end !== m.date ? ' to ' + dayLabel(m.end) : ''}: ${m.name}${where ? ' · ' + where : ''}`;
        return `<g class="jv-tl-marker" data-kind="${esc(m.kind)}"><title>${esc(tip)}</title>${w ? `<rect x="${left}" y="${TOP}" width="${w.toFixed(1)}" height="${H - TOP - 4}" fill="${c}" fill-opacity="0.05"/>` : ''}<line x1="${left}" x2="${left}" y1="28" y2="${H - 4}" stroke="${c}" stroke-opacity="0.45" stroke-dasharray="${m.kind === 'pause' ? '4 2' : '1 3'}"/><path d="M${left - 5} 20h10l-5 7z" fill="${c}"/></g>`;
    }).join('');
    const now = x(tl.today);
    const today = `<line class="jv-tl-today" x1="${now}" x2="${now}" y1="16" y2="${H - 4}"/><text class="jv-tl-now" x="${now + 3}" y="${TOP - 3}">Today</text>`;
    const defs = `<defs><pattern id="jv-tl-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#0a141b" fill-opacity="0.35"/><line x1="0" y1="0" x2="0" y2="5" stroke="${PAUSE}" stroke-width="2"/></pattern></defs>`;
    return `<svg class="jv-tl" width="100%" viewBox="0 0 ${W} ${H}" role="group" aria-label="Campaign timeline by week">${defs}${ticks}${lane}${today}${body.join('')}</svg>`;
}

/** The flow in scope: links of the channel with their values for the country, the shown ones and those left out. */
export function flowModel(flow, o) {
    const values = o.cc ? (flow.by || {})[o.cc] || null : flow.all;
    const links = (flow.links || []).map((l, n) => ({ ch: l[0], from: l[1], to: l[2], value: values ? Number(values[n]) || 0 : 0 }))
        .filter((l) => !o.channel || o.channel === 'all' || l.ch === o.channel);
    return { shown: links.filter((l) => l.value > 0), empty: links.filter((l) => l.value <= 0) };
}

export const linkLabel = (l) => `${(FLOW_CHANNELS.find((c) => c[0] === l.ch) || [, l.ch])[1]}: ${l.from ? (STAGES.find((s) => s[0] === l.from) || [, l.from])[1].toLowerCase() : 'start'} → ${(STAGES.find((s) => s[0] === l.to) || [, l.to])[1].toLowerCase()}`;

/**
 * Sankey layout in px: the channels in the first column, the six stages after it. Band width is value × k, at least
 * 2 px so a single paid unlock still shows; a node is as tall as the larger of what comes in and goes out.
 * Twin: GeoFlow.layout in GeoFlow.kt.
 */
export function flowLayout(shown, W, maxH) {
    const cols = [FLOW_CHANNELS.map((c) => 'ch:' + c[0])].concat(STAGES.map((s) => ['st:' + s[0]]));
    const id = (l, end) => (end === 'from' ? (l.from ? 'st:' + l.from : 'ch:' + l.ch) : 'st:' + l.to);
    const used = new Set();
    shown.forEach((l) => { used.add(id(l, 'from')); used.add(id(l, 'to')); });
    const inV = {}; const outV = {};
    shown.forEach((l) => { outV[id(l, 'from')] = (outV[id(l, 'from')] || 0) + l.value; inV[id(l, 'to')] = (inV[id(l, 'to')] || 0) + l.value; });
    const GAP = 10;
    const colSum = cols.map((c) => c.filter((n) => used.has(n)).reduce((s, n) => s + Math.max(inV[n] || 0, outV[n] || 0), 0));
    const colGaps = cols.map((c) => Math.max(0, c.filter((n) => used.has(n)).length - 1) * GAP);
    const k = Math.min(...cols.map((c, i) => (colSum[i] ? (maxH - colGaps[i]) / colSum[i] : Infinity)).filter(Number.isFinite), 1e9);
    const w = (v) => Math.max(2, v * (Number.isFinite(k) ? k : 1));
    const NODE = 8;
    const LEFT = W < NARROW ? 46 : Math.round(Math.min(120, W * 0.2));
    const step = (W - LEFT - NODE - 4) / (cols.length - 1);
    const nodes = {};
    let H = 0;
    cols.forEach((c, i) => {
        let y = 0;
        c.filter((n) => used.has(n)).forEach((n) => {
            const ins = shown.filter((l) => id(l, 'to') === n).reduce((s, l) => s + w(l.value), 0);
            const outs = shown.filter((l) => id(l, 'from') === n).reduce((s, l) => s + w(l.value), 0);
            const h = Math.max(ins, outs);
            nodes[n] = { id: n, x: LEFT - NODE + i * step, y, h, in: inV[n] || 0, out: outV[n] || 0, inY: y, outY: y };
            y += h + GAP;
        });
        H = Math.max(H, y - GAP);
    });
    const order = (l) => FLOW_CHANNELS.findIndex((c) => c[0] === l.ch);
    const bands = shown.slice().sort((a, b) => order(a) - order(b)).map((l) => {
        const a = nodes[id(l, 'from')];
        const b = nodes[id(l, 'to')];
        const width = w(l.value);
        const y0 = a.outY + width / 2;
        const y1 = b.inY + width / 2;
        a.outY += width;
        b.inY += width;
        return Object.assign({}, l, { x0: a.x + NODE, y0, x1: b.x, y1, width });
    });
    return { nodes, bands, H: Math.max(H, 20), LEFT, NODE, step };
}

/** The Sankey as SVG at width px, with stage names and totals as column heads. */
export function flowSvg(model, o, esc) {
    const W = Math.max(300, Math.round(o.width || 900));
    const lay = flowLayout(model.shown, W, o.height || 260);
    const TOP = 34;
    const fmt = (n) => Number(n).toLocaleString('en-US');
    const heads = STAGES.map((s, i) => {
        const n = lay.nodes['st:' + s[0]];
        const cx = lay.LEFT - lay.NODE / 2 + (i + 1) * lay.step;
        const anchor = i === STAGES.length - 1 ? 'end' : 'middle';
        const hx = i === STAGES.length - 1 ? W - 2 : cx;
        return `<text class="jv-fl-head" x="${hx}" y="11" text-anchor="${anchor}">${esc(W < NARROW ? s[3] : s[1])}</text><text class="jv-fl-num" x="${hx}" y="25" text-anchor="${anchor}">${n ? fmt(n.in || n.out) : '—'}</text>`;
    }).join('');
    const color = (ch) => (FLOW_CHANNELS.find((c) => c[0] === ch) || [, , '#7aa2ff'])[2];
    const bands = lay.bands.map((b) => {
        const mx = (b.x0 + b.x1) / 2;
        const d = `M${b.x0.toFixed(1)} ${(TOP + b.y0).toFixed(1)}C${mx.toFixed(1)} ${(TOP + b.y0).toFixed(1)} ${mx.toFixed(1)} ${(TOP + b.y1).toFixed(1)} ${b.x1.toFixed(1)} ${(TOP + b.y1).toFixed(1)}`;
        return `<path class="jv-fl-band" d="${d}" stroke="${color(b.ch)}" stroke-width="${b.width.toFixed(1)}" data-ch="${b.ch}"><title>${esc(`${linkLabel(b)} ${fmt(b.value)}`)}</title></path>`;
    }).join('');
    const nodes = Object.values(lay.nodes).map((n) => {
        const ch = n.id.startsWith('ch:') ? n.id.slice(3) : '';
        const st = STAGES.find((s) => 'st:' + s[0] === n.id);
        const fill = ch ? color(ch) : LIGHTS[st[2]][1];
        const name = ch ? (FLOW_CHANNELS.find((c) => c[0] === ch) || [, ch])[1] : st[1];
        const label = ch ? `<text class="jv-fl-ch" x="${n.x - 5}" y="${(TOP + n.y + n.h / 2).toFixed(1)}" text-anchor="end">${esc(W < NARROW ? FLOW_CHANNELS.find((c) => c[0] === ch)[3] : name)}</text>` : '';
        return `<rect class="jv-fl-node" x="${n.x.toFixed(1)}" y="${(TOP + n.y).toFixed(1)}" width="${lay.NODE}" height="${Math.max(2, n.h).toFixed(1)}" rx="2" fill="${fill}"${st && st[2] >= 3 ? ` style="filter:drop-shadow(0 0 ${st[2] - 1}px ${fill})"` : ''}><title>${esc(`${name}: ${fmt(ch ? n.out : n.in || n.out)}`)}</title></rect>${label}`;
    }).join('');
    const H = TOP + lay.H + 6;
    return `<svg class="jv-fl" width="100%" viewBox="0 0 ${W} ${H}" role="group" aria-label="Flow from channel to outcome">${heads}${bands}${nodes}</svg>`;
}

const LANG_OPTS = [['lang', 'Language'], ['region', 'Region']];

/**
 * Both Map sections as { timeline, flow }, each {title, body, note, data} for the tab's panel(). h: esc, fmt, button (Pause or Activate
 * for a campaign row), chip (status chip), mk (marketing campaign rows), cc, name (the selected country's), channel,
 * group, camp (the tapped campaign), width.
 */
export function sections(g, h) {
    const esc = h.esc;
    const tl = g.timeline;
    const fl = g.flow;
    const where = h.cc ? ` · ${esc(h.name || h.cc)}` : '';
    const out = {};
    if (tl && Array.isArray(tl.rows)) {
        const { rows } = timelineFor(tl, h.cc);
        const group = h.group === 'region' ? 'region' : 'lang';
        const seg = `<div class="jv-actions jv-tl-controls"><div class="jv-seg" role="group" aria-label="Group the campaigns by">${LANG_OPTS.map(([k, l]) => `<button type="button" data-geo-tl-group="${k}" class="${k === group ? 'on' : ''}" aria-pressed="${k === group}">${l}</button>`).join('')}</div>
            <ul class="jv-geo-legend jv-tl-legend">${STATUSES.map(([k, l, c]) => `<li><i style="background:${c}"></i>${l} · ${rows.filter((r) => r.status === k).length}</li>`).join('')}<li><i class="jv-tl-hatch"></i>Holiday pause</li></ul></div>`;
        const dated = rows.filter((r) => r.start);
        const undated = rows.filter((r) => !r.start);
        const chart = dated.length ? `<div class="jv-tl-wrap">${timelineSvg(tl, { width: h.width, cc: h.cc, group, selected: h.camp }, esc)}</div>` : `<p class="jv-empty">${h.cc ? `No campaign with a start date reaches ${esc(h.name || h.cc)} yet.` : 'No campaign has a start date yet.'}</p>`;
        const later = undated.length ? `<p class="jv-note">No start date: ${undated.map((r) => `<button type="button" class="jv-link" data-geo-camp="${esc(r.id)}">${esc(r.name)}</button> ${h.chip(r.raw || r.status)}`).join(', ')}</p>` : '';
        const pick = rows.find((r) => r.id === h.camp);
        out.timeline = { title: `Campaign timeline${where} · ${h.fmt(rows.length)}`, body: seg + chart + later + (pick ? campaignSheet(pick, h) : ''),
            note: `Bars run from each campaign's start to today, or to when it stopped when Jarvis knows: a holiday pause, else Instantly's last change. ${h.cc ? 'Only the campaigns with leads in this country; ' : ''}Triangles on top are the calendar's dates${h.cc ? '' : ' for the countries the campaigns reach'}. Tap a bar for Pause or Activate.`,
            data: rows.map((r) => ({ id: r.id, campaign: r.name, week: r.week, lang: r.lang, region: r.region, status: r.status, instantly: r.raw, start: r.start, end: r.end, stoppedBy: r.endBy, window: r.window, countries: (r.ccs || []).join(' ') })) };
    }
    if (fl && Array.isArray(fl.links)) {
        const channel = h.channel || 'all';
        const model = flowModel(fl, { cc: h.cc, channel });
        const scope = channel === 'all' ? '' : ' · ' + esc((FLOW_CHANNELS.find((c) => c[0] === channel) || [, channel])[1]);
        const needs = (fl.needs || []).filter((_, n) => channel === 'all' || FLOW_CHANNELS[n] && FLOW_CHANNELS[n][0] === channel);
        const left = model.empty.length ? [`Left out, no data${h.cc ? ' in ' + (h.name || h.cc) : ''} yet: ${model.empty.map(linkLabel).join('; ')}.`] : [];
        const legend = `<ul class="jv-geo-legend">${FLOW_CHANNELS.filter((c) => channel === 'all' || c[0] === channel).map(([, l, c]) => `<li><i style="background:${c}"></i>${esc(l)}</li>`).join('')}</ul>`;
        const body = model.shown.length ? `<div class="jv-fl-wrap">${flowSvg(model, { width: h.width }, esc)}</div>${legend}` : `<p class="jv-empty">No channel has numbers${h.cc ? ' for ' + esc(h.name || h.cc) : ''} yet.</p>`;
        out.flow = { title: `Channel flow${where}${scope}`, body: `${body}${left.concat(needs).length ? `<ul class="jv-needs jv-fl-needs">${left.concat(needs).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`,
            note: 'Each band is one channel, as wide as its count: leads, people contacted, unique opens and replies for cold email; prospects queued for the sweep; social replies drafted and posted; short-link visits and paid unlocks. Email numbers marked est. on the map are split from campaigns covering several countries.',
            data: model.shown.concat(model.empty).map((l) => ({ channel: l.ch, from: l.from || l.ch, to: l.to, value: l.value })) };
    }
    return out;
}

// The tapped bar: the campaign's status, window, countries and holiday pauses, with the Marketing tab's Pause or Activate.
function campaignSheet(r, h) {
    const esc = h.esc;
    const c = Object.assign({ id: r.id, name: r.name, status: r.raw || r.status, start: r.start, leads: 0 }, (h.mk || []).find((m) => m.id === r.id) || {});
    const facts = [r.start ? `${r.status === 'scheduled' || r.status === 'draft' ? 'Starts' : 'Started'} ${dayLabel(r.start)}` : 'No start date', r.window,
        r.endBy === 'pause' ? `paused ${dayLabel(r.end)} for a holiday` : r.endBy === 'update' ? `stopped about ${dayLabel(r.end)}` : '',
        (r.ccs || []).length ? 'reaches ' + r.ccs.map((cc) => `${flagOf(cc)} ${cc}`).join(', ') : 'no country matched yet',
        c.leads ? `${h.fmt(c.leads)} leads · ${h.fmt(c.sent || 0)} sent · ${h.fmt(c.replies || 0)} replies` : ''].filter(Boolean);
    const holds = (r.pauses || []).map((p) => `${p.status === 'planned' ? 'Pauses' : 'Paused'} ${dayLabel(p.date)} for ${p.name} (${p.cc}), back ${dayLabel(p.until)}`);
    return `<div class="jv-tl-sheet" data-geo-camp-sheet="${esc(r.id)}"><b>${esc(r.name)}</b> ${h.chip(c.status)}
        <p class="jv-note">${facts.map(esc).join(' · ')}</p>${holds.length ? `<p class="jv-note">${holds.map(esc).join(' · ')}</p>` : ''}
        <div class="jv-actions">${h.button(c)}<button type="button" class="jv-btn small" data-go="marketing">Open Marketing</button><button type="button" class="jv-btn small" data-geo-camp="">Close</button></div></div>`;
}
