/*
 * Jarvis's Map tab (#2976): the world map shaded by one metric per country, from the snapshot's `geo` source
 * (functions/jarvis-geo.js), and the helpers the tab's ranking and country sheet share. The map is
 * assets/jarvis/world.json (scripts/build-world-map.js). The Android app's twin is android/.../ui/Geo.kt.
 * #2988: six light levels, name labels for every lit country and the hover card.
 */
export const CHANNELS = [
    ['all', 'All'], ['email', 'Cold email'], ['sweep', 'Prospects'], ['social', 'Social'], ['web', 'Visitors']
];
// [key, label, channel, unit]; a rate is a percent, everything else a count.
export const METRICS = [
    ['light', 'Light', 'all', ''], ['activity', 'Activity', 'all', ''], ['gaps', 'Missing zones', 'all', ''], ['dates', 'Dates ahead', 'all', ''],
    ['sent', 'Emails sent', 'email', ''], ['replies', 'Replies', 'email', ''], ['replyRate', 'Reply rate', 'email', '%'],
    ['positive', 'Positive replies', 'email', ''], ['openRate', 'Open rate', 'email', '%'], ['bounceRate', 'Bounce rate', 'email', '%'], ['campaigns', 'Campaigns', 'email', ''],
    ['prospects', 'Prospects queued', 'sweep', ''], ['left', 'Prospects left', 'sweep', ''], ['saturation', 'Saturation', 'sweep', '%'],
    ['reviewed', 'Reviewed sites', 'sweep', ''], ['score', 'Average site score', 'sweep', ''],
    ['social', 'Social replies', 'social', ''],
    ['visitors', 'Site visitors (GA4)', 'web', ''], ['visits', 'Short-link visits', 'web', ''], ['reviews', 'Reviews from links', 'web', ''], ['paid', 'Paid unlocks', 'web', ''], ['usd', 'Revenue (USD)', 'web', '']
];
export const GAPS = {
    'no-prospects-left': ['Out of prospects', '#ff4d8d'], bouncing: ['Bouncing', '#ff8f5a'], 'low-reply': ['Low replies', '#ffb547'],
    'no-campaign': ['No campaign yet', '#a98bff'], 'visitors-no-outreach': ['Visitors, no outreach', '#7aa2ff'], silent: ['Target, silent', '#5d7a8c']
};
// [name, fill, what lights it]; level 0 keeps the base or target-market fill.
export const LIGHTS = [
    ['Dark', '#14222c', 'nothing yet'], ['Spark', '#1f4c5c', 'prospects or reviewed sites'], ['Ember', '#24728b', 'contacted'],
    ['Lit', '#2fb0d4', 'opens, visits or social replies'], ['Bright', '#86ecff', 'email replies'], ['Blazing', '#ffd76e', 'positive replies or money']
];
// The calendar's kinds of date (#2989): [label, colour] for the Upcoming dates chips.
export const DATE_KINDS = {
    holiday: ['Holiday', '#ff8f5a'], commerce: ['Commerce', '#38e1ff'], academic: ['Academic', '#a98bff'], fiscal: ['Fiscal year', '#ffb547'],
    regulation: ['Regulation', '#ff4d8d'], awareness: ['Awareness', '#4ade80'], religious: ['Religious', '#f0d77a'], event: ['Event', '#7aa2ff']
};
const BASE = '#14222c';
const TARGET = '#1d3340';
const HOT = [56, 225, 255];
const DATES_SPAN = 60;

const metricOf = (key) => METRICS.find((m) => m[0] === key) || METRICS[0];
export const metricsFor = (channel) => METRICS.filter((m) => channel === 'all' || m[2] === channel || m[0] === 'gaps');

/** A country's light level, 0 to 5, the twin of lightOf in functions/jarvis-geo.js (the server sends it as `light`). */
export function lightOf(r) {
    const n = (k) => Number(r && r[k]) > 0;
    if (n('positive') || n('interested') || n('paid') || n('usd')) return 5;
    if (n('replies') || n('answered')) return 4;
    if (n('opened') || n('visits') || n('visitors') || n('socialApproved')) return 3;
    if (n('contacted') || n('sent') || n('social')) return 2;
    if (n('prospects') || n('reviewed') || n('leads')) return 1;
    return 0;
}
const lightIn = (r) => (r && Number.isInteger(r.light) ? r.light : lightOf(r));

/** A country's number for a metric, or null when it has none (no emails sent has no reply rate). */
export function value(r, key) {
    if (!r) return null;
    switch (key) {
        case 'light': return lightIn(r);
        case 'activity': return r.sent + r.prospects + r.social + r.visits + r.visitors + r.reviewed;
        case 'gaps': return r.gaps.length;
        case 'dates': return r.daysToDate === null || r.daysToDate === undefined ? null : Math.max(1, DATES_SPAN + 1 - r.daysToDate);
        case 'bounceRate': return r.sent ? Math.round((r.bounced / r.sent) * 1000) / 10 : null;
        case 'saturation': return r.prospects ? Math.round((r.swept / r.prospects) * 100) : null;
        case 'replyRate': case 'openRate': case 'score': return r[key];
        default: return Number(r[key]) || 0;
    }
}

export const unitOf = (key) => metricOf(key)[3];
export const labelOf = (key) => metricOf(key)[1];
/** Days to a date from the Dates ahead score, which is higher the sooner the date (#2989). */
export const daysOf = (v) => DATES_SPAN + 1 - v;
const inDays = (d) => (d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);
export const show = (v, key) => (v === null || v === undefined ? '—' : key === 'light' ? (LIGHTS[v] || LIGHTS[0])[0] : key === 'dates' ? inDays(daysOf(v))
    : (key === 'usd' ? '$' : '') + Number(v).toLocaleString('en-US') + unitOf(key));

// Map labels for the names too long to sit on a country.
const SHORT = {
    US: 'USA', GB: 'UK', AE: 'UAE', CD: 'DR Congo', CG: 'Congo', CF: 'C. African Rep.', DO: 'Dominican Rep.', GQ: 'Eq. Guinea',
    BA: 'Bosnia', TT: 'Trinidad', KN: 'St Kitts', VC: 'St Vincent', LC: 'St Lucia', AG: 'Antigua', ST: 'São Tomé', PG: 'Papua NG',
    MK: 'N. Macedonia', VA: 'Vatican', PS: 'Palestine', TC: 'Turks & Caicos', VI: 'US Virgin Is.', VG: 'BVI', SB: 'Solomon Is.',
    MH: 'Marshall Is.', UM: 'US Outlying Is.', IO: 'Chagos', TF: 'Fr. South. Lands', HM: 'Heard Is.', GS: 'S. Georgia', PM: 'St Pierre',
    SH: 'St Helena', WF: 'Wallis', BQ: 'Caribbean NL', FK: 'Falklands', EH: 'W. Sahara', SJ: 'Svalbard', KR: 'S. Korea', KP: 'N. Korea'
};
/** The name a map label shows: a short form for the long ones ("Congo - Kinshasa" is DR Congo). */
export function shortName(cc, name) {
    if (SHORT[cc]) return SHORT[cc];
    return String(name || cc).replace(/\s*\(.*\)$/, '').replace(/ SAR China$/, '').replace(/^Saint /, 'St ');
}
/** The flag emoji for a two-letter country code. */
export const flagOf = (cc) => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '');

const BOXES = new WeakMap();
/** Each country's main outline box in map units: the ring holding its dot, else its largest (France without Guiana, the US without Alaska). */
export function boxes(world) {
    if (BOXES.has(world)) return BOXES.get(world);
    const out = {};
    Object.keys(world.shapes).forEach((cc) => {
        const dot = world.dots[cc];
        let best = null;
        world.shapes[cc].split('M').filter(Boolean).forEach((ring) => {
            const n = (ring.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
            let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
            for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
            if (x0 === Infinity) return;
            const holds = dot && dot[0] >= x0 && dot[0] <= x1 && dot[1] >= y0 && dot[1] <= y1;
            const rank = (holds ? 1e7 : 0) + (x1 - x0) * (y1 - y0);
            if (!best || rank > best.rank) best = { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, rank };
        });
        if (best) out[cc] = best;
    });
    BOXES.set(world, out);
    return out;
}

const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Name labels in map units for every lit country and the selected one. Font size follows the country's box between
 * min and max; a country too small for its name gets the label beside its dot. Greedy: the selected first, then the
 * brightest and biggest; a label overlapping one already placed is dropped, except the selected one.
 * Twin: Geo.labels in Geo.kt.
 */
export function labels(world, rows, opts) {
    const o = Object.assign({ min: 8, max: 13, width: (text, size) => text.length * size * 0.56 }, opts);
    const bx = boxes(world);
    const area = (r) => (bx[r.cc] ? bx[r.cc].w * bx[r.cc].h : 0);
    const placed = [];
    const out = [];
    rows.filter((r) => world.dots[r.cc] && (lightIn(r) > 0 || r.cc === o.selected))
        .sort((a, b) => (b.cc === o.selected) - (a.cc === o.selected) || lightIn(b) - lightIn(a) || area(b) - area(a) || a.cc.localeCompare(b.cc))
        .forEach((r) => {
            const text = shortName(r.cc, r.name);
            const [x, y] = world.dots[r.cc];
            const b = bx[r.cc];
            const pad = o.min * 0.15;
            const sized = b ? Math.max(o.min, Math.min(o.max, Math.sqrt(b.w * b.h) / 4.5)) : o.min;
            const tries = [];
            if (b && o.width(text, sized) <= b.w * 1.6 && sized <= b.h * 1.1) tries.push({ size: sized, anchor: 'middle', x, y, inside: true });
            const gap = o.min * 0.55;
            const up = o.min * 2;
            tries.push({ size: o.min, anchor: 'start', x: x + gap, y }, { size: o.min, anchor: 'end', x: x - gap, y },
                { size: o.min, anchor: 'middle', x, y: y - o.min }, { size: o.min, anchor: 'middle', x, y: y + o.min },
                { size: o.min, anchor: 'end', x: x - gap, y: y - up }, { size: o.min, anchor: 'start', x: x + gap, y: y - up },
                { size: o.min, anchor: 'end', x: x - gap, y: y + up }, { size: o.min, anchor: 'start', x: x + gap, y: y + up });
            const fit = tries.map((t) => {
                const w = o.width(text, t.size);
                const x0 = t.anchor === 'start' ? t.x : t.anchor === 'end' ? t.x - w : t.x - w / 2;
                return Object.assign(t, { box: { x0: x0 - pad, x1: x0 + w + pad, y0: t.y - t.size * 0.55 - pad, y1: t.y + t.size * 0.55 + pad } });
            }).filter((t) => t.box.x0 >= 0 && t.box.x1 <= world.w && t.box.y0 >= 0 && t.box.y1 <= world.h);
            const pick = fit.find((t) => !placed.some((p) => overlaps(p, t.box))) || (r.cc === o.selected ? fit[0] || tries[0] : null);
            if (!pick) return;
            placed.push(pick.box || { x0: x, x1: x, y0: y, y1: y });
            out.push({ cc: r.cc, text, x: pick.x, y: pick.y, size: pick.size, anchor: pick.anchor, beside: !pick.inside, dot: [x, y], light: lightIn(r) });
        });
    return out;
}

// Square-root shading, so one big country does not wash out the rest.
function shade(v, max) {
    if (!v || !max) return null;
    const t = 0.18 + 0.82 * Math.sqrt(Math.min(1, v / max));
    return `rgba(${HOT[0]},${HOT[1]},${HOT[2]},${t.toFixed(2)})`;
}

/** Each country's fill for the metric: the gap colour on Missing zones, the level colour on Light, else a shade of the max. */
export function fills(rows, key) {
    const out = {};
    if (key === 'gaps') {
        rows.forEach((r) => { if (r.gaps.length) out[r.cc] = GAPS[r.gaps[0]] ? GAPS[r.gaps[0]][1] : '#5d7a8c'; });
        return out;
    }
    if (key === 'light') {
        rows.forEach((r) => { const l = lightIn(r); if (l > 0) out[r.cc] = LIGHTS[l][1]; });
        return out;
    }
    const max = Math.max(0, ...rows.map((r) => value(r, key) || 0));
    rows.forEach((r) => { const f = shade(value(r, key), max); if (f) out[r.cc] = f; });
    return out;
}

/** The ranking for a metric: countries with a number, highest first. */
export function ranked(rows, key) {
    return rows.filter((r) => { const v = value(r, key); return v !== null && v > 0; })
        .sort((a, b) => value(b, key) - value(a, key) || (key === 'light' ? value(b, 'activity') - value(a, 'activity') : 0) || a.cc.localeCompare(b.cc));
}

// The glow behind Lit, Bright and Blazing on the Light view (Blazing also breathes, in css/admin-jarvis.css).
function glows() {
    const one = (n, sd) => `<filter id="jv-geo-glow${n}" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur in="SourceGraphic" stdDeviation="${sd}" result="b"/><feMerge><feMergeNode in="b"/>${n > 3 ? '<feMergeNode in="b"/>' : ''}<feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    return `<defs>${one(3, 1.2)}${one(4, 2)}${one(5, 3)}</defs>`;
}

/**
 * The map as inline SVG: shapes for the countries in world.json, a dot for those too small to draw, and the name
 * labels on top. opts: selected, names (cc → name for countries with no row), labels (from labels()).
 */
export function mapSvg(world, rows, key, opts, esc) {
    const o = opts || {};
    const by = {};
    rows.forEach((r) => { by[r.cc] = r; });
    const fill = fills(rows, key);
    const lit = key === 'light';
    const tip = (cc) => {
        const r = by[cc];
        const name = (r && r.name) || (o.names && o.names[cc]) || cc;
        if (!r) return name;
        if (key === 'dates') return `${name}: ${r.nextDate ? `${r.nextDate.name} ${show(value(r, key), key)}` : 'no date in the next 60 days'}${r.target ? ' · target market' : ''}`;
        return `${name}: ${labelOf(key)} ${key === 'gaps' ? (r.gaps.map((g) => (GAPS[g] || [g])[0]).join(', ') || 'none') : show(value(r, key), key)}${r.target ? ' · target market' : ''}`;
    };
    const attrs = (cc) => {
        const r = by[cc];
        const f = fill[cc] || (r && r.target ? TARGET : BASE);
        const l = lit && r ? lightIn(r) : 0;
        const cls = `${r && r.target ? ' is-target' : ''}${o.selected === cc ? ' is-on' : ''}${r && r.gaps.length && key !== 'gaps' && !lit ? ' is-gap' : ''}${l ? ' is-l' + l : ''}`;
        return `data-geo-cc="${cc}" class="jv-geo-c${cls}" fill="${f}"${l >= 3 ? ` filter="url(#jv-geo-glow${l})"` : ''} tabindex="0" role="button" aria-label="${esc(tip(cc))}"`;
    };
    // Brighter countries paint last so their glow lies over their dark neighbours; the selected one on top of all.
    const order = (cc) => (o.selected === cc ? 9 : lit && by[cc] ? lightIn(by[cc]) : 0);
    const shapes = Object.keys(world.shapes).map((cc, n) => [cc, n]).sort((a, b) => order(a[0]) - order(b[0]) || a[1] - b[1])
        .map(([cc]) => `<path d="${world.shapes[cc]}" ${attrs(cc)}><title>${esc(tip(cc))}</title></path>`).join('');
    const dots = Object.keys(world.dots).filter((cc) => !world.shapes[cc] && by[cc]).map((cc) => {
        const [x, y] = world.dots[cc];
        return `<circle cx="${x}" cy="${y}" r="4" ${attrs(cc)}><title>${esc(tip(cc))}</title></circle>`;
    }).join('');
    const lead = (l) => (l.beside && Math.abs(l.y - l.dot[1]) > l.size * 1.5 ? `<line class="jv-geo-lead" x1="${l.dot[0]}" y1="${l.dot[1]}" x2="${+l.x.toFixed(1)}" y2="${+(l.y + (l.y < l.dot[1] ? l.size * 0.45 : -l.size * 0.45)).toFixed(1)}" stroke-width="${+(l.size * 0.08).toFixed(2)}"/>` : '');
    const names = (o.labels || []).map((l) => `${lead(l)}${l.beside && world.shapes[l.cc] ? `<circle class="jv-geo-pin" cx="${l.dot[0]}" cy="${l.dot[1]}" r="${(l.size * 0.16).toFixed(2)}"/>` : ''}<text class="jv-geo-l${o.selected === l.cc ? ' is-on' : ''}" data-geo-label="${l.cc}" x="${+l.x.toFixed(1)}" y="${+l.y.toFixed(1)}" font-size="${+l.size.toFixed(2)}" text-anchor="${l.anchor}" style="stroke-width:${+(l.size * 0.28).toFixed(2)}px">${esc(l.text)}</text>`).join('');
    return `<svg class="jv-geo-map" viewBox="0 0 ${world.w} ${world.h}" role="group" aria-label="World map: ${esc(labelOf(key))} by country">${lit ? glows() : ''}${shapes}${dots}<g class="jv-geo-names" aria-hidden="true">${names}</g></svg>`;
}

/** The legend under the map: the six levels on Light, gap colours on Missing zones, else the scale from 0 to the max. */
export function legend(rows, key, esc) {
    if (key === 'light') return `<ul class="jv-geo-legend jv-geo-lights">${LIGHTS.map(([name, color, what], n) => `<li class="is-l${n}" title="${esc(what)}"><i style="background:${color}"></i>${esc(name)} · ${rows.filter((r) => lightIn(r) === n).length}</li>`).join('')}</ul>`;
    if (key === 'dates') return `<div class="jv-geo-scale"><span>in ${DATES_SPAN} days</span><i></i><span>today</span><em><b class="is-target"></b>target market, no date in the next ${DATES_SPAN} days · ${rows.filter((r) => value(r, key)).length} with one</em></div>`;
    if (key === 'gaps') return `<ul class="jv-geo-legend">${Object.keys(GAPS).map((k) => `<li><i style="background:${GAPS[k][1]}"></i>${esc(GAPS[k][0])} · ${rows.filter((r) => r.gaps[0] === k).length}</li>`).join('')}</ul>`;
    const max = Math.max(0, ...rows.map((r) => value(r, key) || 0));
    return `<div class="jv-geo-scale"><span>0</span><i></i><span>${esc(show(max, key))}</span><em><b class="is-target"></b>target market, no ${esc(labelOf(key).toLowerCase())}</em></div>`;
}

/** The hover card: flag, name, light level and the key numbers; a country with no row only has its name. */
export function card(r, esc, cc, name) {
    if (!r) return `<b>${flagOf(cc)} ${esc(name || cc)}</b><span class="jv-geo-lv"><i style="background:${LIGHTS[0][1]}"></i>Dark · nothing yet</span>`;
    const l = lightIn(r);
    const gaps = r.gaps.map((k) => (GAPS[k] || [k])[0]).join(', ') || 'none';
    const row = (dt, dd) => `<dt>${dt}</dt><dd>${esc(String(dd))}</dd>`;
    return `<b>${flagOf(r.cc)} ${esc(r.name)}</b><span class="jv-geo-lv"><i style="background:${LIGHTS[l][1]}"></i>${LIGHTS[l][0]} · ${esc(LIGHTS[l][2])}</span>
        <dl>${row('Sent', Number(r.sent || 0).toLocaleString('en-US'))}${row('Reply rate', r.replyRate === null || r.replyRate === undefined ? '—' : r.replyRate + '%')}${row('Prospects left', Number(r.left || 0).toLocaleString('en-US'))}${row('Visitors', Number(r.visitors || 0).toLocaleString('en-US'))}${row('Gaps', gaps)}</dl>`;
}
