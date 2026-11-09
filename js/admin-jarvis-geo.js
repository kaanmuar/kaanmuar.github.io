/*
 * Jarvis's Map tab (#2976): the world map shaded by one metric per country, from the snapshot's `geo` source
 * (functions/jarvis-geo.js), and the helpers the tab's ranking and country sheet share. The map is
 * assets/jarvis/world.json (scripts/build-world-map.js). The Android app's twin is android/.../ui/Geo.kt.
 */
export const CHANNELS = [
    ['all', 'All'], ['email', 'Cold email'], ['sweep', 'Prospects'], ['social', 'Social'], ['web', 'Visitors']
];
// [key, label, channel, unit]; a rate is a percent, everything else a count.
export const METRICS = [
    ['activity', 'Activity', 'all', ''], ['gaps', 'Missing zones', 'all', ''],
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
const BASE = '#14222c';
const TARGET = '#1d3340';
const HOT = [56, 225, 255];

const metricOf = (key) => METRICS.find((m) => m[0] === key) || METRICS[0];
export const metricsFor = (channel) => METRICS.filter((m) => channel === 'all' || m[2] === channel || m[0] === 'gaps');

/** A country's number for a metric, or null when it has none (no emails sent has no reply rate). */
export function value(r, key) {
    if (!r) return null;
    switch (key) {
        case 'activity': return r.sent + r.prospects + r.social + r.visits + r.visitors + r.reviewed;
        case 'gaps': return r.gaps.length;
        case 'bounceRate': return r.sent ? Math.round((r.bounced / r.sent) * 1000) / 10 : null;
        case 'saturation': return r.prospects ? Math.round((r.swept / r.prospects) * 100) : null;
        case 'replyRate': case 'openRate': case 'score': return r[key];
        default: return Number(r[key]) || 0;
    }
}

export const unitOf = (key) => metricOf(key)[3];
export const labelOf = (key) => metricOf(key)[1];
export const show = (v, key) => (v === null || v === undefined ? '—' : (key === 'usd' ? '$' : '') + Number(v).toLocaleString('en-US') + unitOf(key));

// Square-root shading, so one big country does not wash out the rest.
function shade(v, max) {
    if (!v || !max) return null;
    const t = 0.18 + 0.82 * Math.sqrt(Math.min(1, v / max));
    return `rgba(${HOT[0]},${HOT[1]},${HOT[2]},${t.toFixed(2)})`;
}

/** Each country's fill for the metric: the gap colour on the Missing zones view, else a shade of the max. */
export function fills(rows, key) {
    const out = {};
    if (key === 'gaps') {
        rows.forEach((r) => { if (r.gaps.length) out[r.cc] = GAPS[r.gaps[0]] ? GAPS[r.gaps[0]][1] : '#5d7a8c'; });
        return out;
    }
    const max = Math.max(0, ...rows.map((r) => value(r, key) || 0));
    rows.forEach((r) => { const f = shade(value(r, key), max); if (f) out[r.cc] = f; });
    return out;
}

/** The ranking for a metric: countries with a number, highest first. */
export function ranked(rows, key) {
    return rows.filter((r) => { const v = value(r, key); return v !== null && v > 0; })
        .sort((a, b) => value(b, key) - value(a, key) || a.cc.localeCompare(b.cc));
}

/** The map as inline SVG: shapes for the countries in world.json, a dot for those too small to draw. */
export function mapSvg(world, rows, key, opts, esc) {
    const o = opts || {};
    const by = {};
    rows.forEach((r) => { by[r.cc] = r; });
    const fill = fills(rows, key);
    const tip = (cc) => {
        const r = by[cc];
        const name = (r && r.name) || cc;
        if (!r) return name;
        return `${name}: ${labelOf(key)} ${key === 'gaps' ? (r.gaps.map((g) => (GAPS[g] || [g])[0]).join(', ') || 'none') : show(value(r, key), key)}${r.target ? ' · target market' : ''}`;
    };
    const attrs = (cc) => {
        const r = by[cc];
        const f = fill[cc] || (r && r.target ? TARGET : BASE);
        const cls = `${r && r.target ? ' is-target' : ''}${o.selected === cc ? ' is-on' : ''}${r && r.gaps.length && key !== 'gaps' ? ' is-gap' : ''}`;
        return `data-geo-cc="${cc}" class="jv-geo-c${cls}" fill="${f}" tabindex="0" role="button" aria-label="${esc(tip(cc))}"`;
    };
    const shapes = Object.keys(world.shapes).map((cc) => `<path d="${world.shapes[cc]}" ${attrs(cc)}><title>${esc(tip(cc))}</title></path>`).join('');
    const dots = Object.keys(world.dots).filter((cc) => !world.shapes[cc] && by[cc]).map((cc) => {
        const [x, y] = world.dots[cc];
        return `<circle cx="${x}" cy="${y}" r="4" ${attrs(cc)}><title>${esc(tip(cc))}</title></circle>`;
    }).join('');
    return `<svg class="jv-geo-map" viewBox="0 0 ${world.w} ${world.h}" role="group" aria-label="World map: ${esc(labelOf(key))} by country">${shapes}${dots}</svg>`;
}

/** The legend under the map: gap colours on the Missing zones view, else the scale from 0 to the max. */
export function legend(rows, key, esc) {
    if (key === 'gaps') return `<ul class="jv-geo-legend">${Object.keys(GAPS).map((k) => `<li><i style="background:${GAPS[k][1]}"></i>${esc(GAPS[k][0])} · ${rows.filter((r) => r.gaps[0] === k).length}</li>`).join('')}</ul>`;
    const max = Math.max(0, ...rows.map((r) => value(r, key) || 0));
    return `<div class="jv-geo-scale"><span>0</span><i></i><span>${esc(show(max, key))}</span><em><b class="is-target"></b>target market, no ${esc(labelOf(key).toLowerCase())}</em></div>`;
}
