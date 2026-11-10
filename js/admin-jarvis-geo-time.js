/*
 * The Map tab over time (#3109): 7, 30 or 90 days against the span before, and the last 13 weeks played week by week,
 * from the geo source's `time` (functions/jarvis-geo-time.js). Rows built here have the fields of the geo rows, so the
 * map, labels, ranking and card in admin-jarvis-geo.js draw them as they draw today's. Twin: android/.../ui/GeoTime.kt.
 */
import * as Geo from './admin-jarvis-geo.js?v=3109';

export const SPANS = [[0, 'Now'], [7, '7 days'], [30, '30 days'], [90, '90 days']];
// The metrics the history can show; the rest (Missing zones, Dates ahead, Campaigns, Average site score) stay on now.
const KEYS = ['light', 'activity', 'sent', 'replies', 'replyRate', 'positive', 'openRate', 'bounceRate', 'prospects', 'left', 'saturation', 'reviewed', 'social', 'visitors', 'visits', 'reviews', 'paid', 'usd'];
// A rise that is bad news, shaded pink.
const WORSE_UP = new Set(['bounceRate']);
const UP = [56, 225, 255];
const DOWN = [255, 77, 141];
const STEP_MS = 1400;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const round1 = (n) => Math.round(n * 10) / 10;
const short = (day) => { const [, m, d] = String(day || '').split('-').map(Number); return m ? `${MONTHS[m - 1]} ${d}` : ''; };
const plus = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
let dn = null;
const nameOf = (cc) => { try { dn = dn || new Intl.DisplayNames(['en'], { type: 'region' }); return dn.of(cc) || cc; } catch (error) { return cc; } };

/** Whether the history can draw this metric; bounce rate only once Instantly sends bounces per day. */
export function canShow(time, key) {
    if (!time || !KEYS.includes(key)) return false;
    if (key !== 'bounceRate') return true;
    return Object.values((time.ranges && time.ranges[7] && time.ranges[7].c) || {}).some((f) => f.bounced);
}

// The history's fields (FIELDS in functions/jarvis-geo-time.js).
const FIELDS = ['sent', 'opened', 'replies', 'interested', 'bounced', 'answered', 'positive', 'prospects', 'swept', 'left', 'reviewed', 'social', 'visitors', 'visits', 'reviews', 'paid', 'usd'];

// A row with the geo row's fields from the history: name and target from today's row, numbers from get(field).
function rowOf(base, cc, get) {
    const b = base[cc] || { cc, name: nameOf(cc), target: false, langs: [] };
    const r = { cc, name: b.name, target: !!b.target, langs: b.langs || [], gaps: [], camps: [], sectors: [], est: false, score: null };
    // Email split across countries comes in fractions; shown whole, as geoRows rounds today's.
    FIELDS.forEach((f) => { const v = get(f); r[f] = v === undefined || v === null ? null : f === 'usd' ? Math.round(v * 100) / 100 : Math.round(v); });
    r.replyRate = r.sent ? round1((r.replies / r.sent) * 100) : null;
    r.openRate = r.sent ? round1((r.opened / r.sent) * 100) : null;
    if (r.bounced === null) r.bounced = 0;
    r.light = Geo.lightOf(r);
    return r;
}

function rowsFrom(g, byCc, pick) {
    const base = {};
    (g.countries || []).forEach((r) => { base[r.cc] = r; });
    const ccs = new Set(Object.keys(base).concat(Object.keys(byCc || {})));
    return Array.from(ccs).map((cc) => rowOf(base, cc, (f) => { const list = (byCc[cc] || {})[f]; return list ? pick(list) : null; }));
}

/** Every country over a range: which 0 is the last n days to yesterday, 1 the n days before. */
export const spanRows = (g, n, which) => rowsFrom(g, g.time.ranges[n].c, (list) => list[which]);
/** Every country in week k of the 13 (0 the oldest). */
export const weekRows = (g, k) => rowsFrom(g, g.time.weeks.c, (list) => list[k]);

/** A row's number for a metric, null where the history has none (Geo.value reads a missing count as 0). */
export const valueOf = (r, key) => (!r || (FIELDS.includes(key) && r[key] === null) ? null : Geo.value(r, key));

/** The change in a metric between two rows, null when either has no number. */
export function deltaOf(now, before, key) {
    const a = valueOf(now, key);
    const b = valueOf(before, key);
    return a === null || a === undefined || b === null || b === undefined ? null : round1(a - b);
}

/**
 * What the map shows for the time controls. st: span (0, 7, 30, 90), week (null or 0 to 12), shade ('value' or 'change').
 * Returns rows to draw, delta per country (or null), fills for the change shading, the week's label and a note.
 */
export function view(g, st, key) {
    const time = g && g.time;
    const out = { mode: 'now', rows: (g && g.countries) || [], delta: null, fills: null, label: '', note: '', span: 0, week: null };
    if (!time || !time.ranges) {
        if (st.span || st.week !== null) out.note = 'No history yet: the daily briefing run records the countries each morning, and backfills 13 weeks of Instantly email the first time.';
        return out;
    }
    if (!canShow(time, key) && (st.span || st.week !== null)) {
        out.note = `${Geo.labelOf(key)} has no history; the map shows it now. Pick another metric to compare.`;
        return out;
    }
    let before = null;
    if (st.week !== null && st.week !== undefined) {
        const k = Math.max(0, Math.min(time.weeks.start.length - 1, st.week));
        Object.assign(out, { mode: 'week', week: k, rows: weekRows(g, k) });
        before = k > 0 ? weekRows(g, k - 1) : null;
        const s = time.weeks.start[k];
        out.label = `Week of ${short(s)} – ${short(plus(s, 6))}`;
        if (!time.weeks.days[k]) out.note = 'Nothing recorded that week.';
    } else if (st.span && time.ranges[st.span]) {
        const r = time.ranges[st.span];
        Object.assign(out, { mode: 'span', span: st.span, rows: spanRows(g, st.span, 0) });
        before = spanRows(g, st.span, 1);
        out.label = `${short(r.from)} – ${short(r.to)} against ${short(r.prevFrom)} – ${short(r.prevTo)}`;
        if (r.prevDays < st.span) out.note = r.prevDays ? `Only ${r.prevDays} of the ${st.span} days before ${r.prevDays === 1 ? 'is' : 'are'} recorded, so the change is partial.` : `The ${st.span} days before are not recorded yet, so there is no change to show.`;
    } else return out;
    if (before) {
        const prev = {};
        before.forEach((r) => { prev[r.cc] = r; });
        out.delta = {};
        out.rows.forEach((r) => { out.delta[r.cc] = deltaOf(r, prev[r.cc], key); });
        out.before = prev;
    }
    if (st.shade === 'change' && out.delta) out.fills = changeFills(out.delta, key);
    return out;
}

/** Cyan where the metric rose, pink where it fell (flipped for bounce rate), by the square root of the largest change. */
export function changeFills(delta, key) {
    const max = Math.max(0, ...Object.values(delta).map((d) => Math.abs(d || 0)));
    const out = {};
    if (!max) return out;
    Object.keys(delta).forEach((cc) => {
        const d = delta[cc];
        if (!d) return;
        const c = (d > 0) !== WORSE_UP.has(key) ? UP : DOWN;
        out[cc] = `rgba(${c[0]},${c[1]},${c[2]},${(0.18 + 0.82 * Math.sqrt(Math.abs(d) / max)).toFixed(2)})`;
    });
    return out;
}

/** "▲ +12" or "▼ −3.5%", green-cyan when good and pink when bad; empty for no change or no number. */
export function arrow(d, key) {
    if (d === null || d === undefined) return '<span class="jv-note">—</span>';
    if (!d) return '<span class="jv-geo-chg">= 0</span>';
    const good = (d > 0) !== WORSE_UP.has(key);
    const unit = key === 'light' ? '' : Geo.unitOf(key) === '%' ? ' pts' : '';
    const n = Math.abs(d).toLocaleString('en-US');
    return `<span class="jv-geo-chg ${good ? 'is-up' : 'is-down'}">${d > 0 ? '▲ +' : '▼ −'}${key === 'usd' ? '$' : ''}${n}${unit}</span>`;
}

/** The legend under the map on change shading. */
export function legend(v, key, esc) {
    const ds = Object.values(v.delta || {}).filter((d) => d);
    const up = ds.filter((d) => d > 0).length;
    const down = ds.filter((d) => d < 0).length;
    const max = Math.max(0, ...ds.map(Math.abs));
    return `<div class="jv-geo-scale jv-geo-chg-scale"><span>${esc(arrowText(-max, key))}</span><i></i><span>${esc(arrowText(max, key))}</span><em>${up} up · ${down} down · ${v.mode === 'week' ? 'against the week before' : 'against the span before'}</em></div>`;
}
const arrowText = (d, key) => (d ? `${d > 0 ? '+' : '−'}${key === 'usd' ? '$' : ''}${Math.abs(d).toLocaleString('en-US')}${Geo.unitOf(key) === '%' ? ' pts' : ''}` : '0');

/** The range picker, change shading and week player, under the channel and metric filters. */
export function controls(g, st, v, esc) {
    const time = g && g.time;
    const weeks = time && time.weeks ? time.weeks.start.length : 13;
    const at = v.mode === 'week' ? v.week : weeks;
    const seg = SPANS.map(([n, label]) => `<button type="button" data-geo-span="${n}" class="${n === (st.week === null ? st.span : -1) ? 'on' : ''}" aria-pressed="${n === (st.week === null ? st.span : -1)}">${esc(label)}</button>`).join('');
    const shade = v.delta ? `<label class="jv-geo-metric"><input type="checkbox" data-geo-shade${st.shade === 'change' ? ' checked' : ''}> Shade the change</label>` : '';
    return `<div class="jv-actions jv-geo-controls jv-geo-time"><div class="jv-seg" role="group" aria-label="Compare a range with the one before">${seg}</div>${shade}
        <div class="jv-geo-play"><button type="button" class="jv-btn small" data-geo-play aria-pressed="${!!st.playing}" aria-label="${st.playing ? 'Pause' : 'Play the last 13 weeks'}">${st.playing ? '❚❚ Pause' : '▶ Play 13 weeks'}</button>
        <input type="range" min="0" max="${weeks}" step="1" value="${at}" data-geo-week aria-label="Week" aria-valuetext="${esc(v.mode === 'week' ? v.label : 'Now')}"${time && time.weeks ? '' : ' disabled'}>
        <span class="jv-geo-when" aria-live="polite">${esc(v.mode === 'week' ? v.label : v.mode === 'span' ? v.label : 'Now')}</span></div></div>
        ${v.note ? `<p class="jv-note jv-geo-time-note">${esc(v.note)}</p>` : ''}`;
}

/** The hover card's change line: the metric now, before and the arrow. */
export function cardLine(v, cc, key, esc) {
    if (!v.delta) return '';
    const r = v.rows.find((x) => x.cc === cc);
    const b = v.before && v.before[cc];
    if (!r) return '';
    return `<p class="jv-geo-card-chg">${esc(Geo.labelOf(key))} ${esc(Geo.show(valueOf(r, key), key))} · before ${esc(Geo.show(valueOf(b, key), key))} ${arrow(v.delta[cc], key)}</p>`;
}

/** The country sheet's changes over the picked range: sent, replies, positive, visitors, prospects left and reviewed. */
export function sheet(g, cc, st, esc) {
    const n = st.span || 30;
    const time = g && g.time;
    if (!time || !time.ranges || !time.ranges[n]) return '';
    const now = spanRows(g, n, 0).find((r) => r.cc === cc);
    const was = spanRows(g, n, 1).find((r) => r.cc === cc);
    if (!now) return '';
    const keys = ['sent', 'replies', 'positive', 'replyRate', 'visitors', 'left', 'reviewed'];
    const heads = ['Number', `Last ${n} days`, 'Before', 'Change'];
    const cell = (i, html) => `<td data-label="${esc(heads[i])}">${html}</td>`;
    const rows = keys.map((k) => `<tr>${cell(0, esc(Geo.labelOf(k)))}${cell(1, esc(Geo.show(valueOf(now, k), k)))}${cell(2, esc(Geo.show(valueOf(was, k), k)))}${cell(3, arrow(deltaOf(now, was, k), k))}</tr>`).join('');
    return `<div class="jv-geo-sheet-chg"><h4>Last ${n} days against the ${n} before</h4><div class="jv-table-wrap"><table class="jv-table"><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

/**
 * The controls' events. S holds geoSpan, geoWeek, geoShade and geoPlaying; paint() redraws the map without a full
 * render (the slider keeps focus while dragged); render() redraws the tab.
 */
export function bind(root, S, paint, render) {
    let timer = null;
    const stop = () => { if (timer) clearInterval(timer); timer = null; S.geoPlaying = false; };
    const weeks = () => { const g = S.external.geo; return g && g.time && g.time.weeks ? g.time.weeks.start.length : 0; };
    const step = () => {
        if (S.product !== 'geo' || !root.querySelector('[data-geo-week]')) { stop(); return; }
        S.geoWeek = S.geoWeek === null || S.geoWeek >= weeks() - 1 ? 0 : S.geoWeek + 1;
        if (S.geoWeek >= weeks() - 1) { stop(); render(); return; }
        paint();
    };
    root.addEventListener('click', (event) => {
        const t = event.target.closest && event.target.closest('[data-geo-span], [data-geo-play]');
        if (!t || !root.contains(t)) return;
        if (t.dataset.geoSpan !== undefined) { stop(); S.geoWeek = null; S.geoSpan = Number(t.dataset.geoSpan) || 0; render(); return; }
        if (S.geoPlaying) { stop(); render(); return; }
        if (!weeks()) return;
        if (S.geoWeek === null || S.geoWeek >= weeks() - 1) S.geoWeek = 0;
        S.geoPlaying = true;
        render();
        timer = setInterval(step, STEP_MS);
    });
    root.addEventListener('input', (event) => {
        if (!event.target.matches || !event.target.matches('[data-geo-week]')) return;
        stop();
        const k = Number(event.target.value);
        S.geoWeek = k >= weeks() ? null : k;
        paint();
    });
    root.addEventListener('change', (event) => {
        if (event.target.matches && event.target.matches('[data-geo-week]')) { render(); return; }
        if (event.target.matches && event.target.matches('[data-geo-shade]')) { S.geoShade = event.target.checked ? 'change' : 'value'; render(); }
    });
    return stop;
}

/** Swaps the map, its legend, the week label and the ranking from a fresh render of the tab, leaving the slider alone. */
export function patch(view, html) {
    if (!view) return;
    const fresh = document.createElement('div');
    fresh.innerHTML = html;
    const swap = (sel, outer) => { const a = view.querySelector(sel); const b = fresh.querySelector(sel); if (a && b) { if (outer) a.outerHTML = b.outerHTML; else a.innerHTML = b.innerHTML; } };
    const card = view.querySelector('.jv-geo-card');
    const wrap = view.querySelector('.jv-geo-wrap');
    const next = fresh.querySelector('.jv-geo-wrap');
    if (wrap && next) {
        Array.from(wrap.children).forEach((el) => { if (el !== card) el.remove(); });
        Array.from(next.children).forEach((el) => { if (!el.classList.contains('jv-geo-card')) wrap.insertBefore(el, card); });
    }
    ['.jv-geo-when', '[data-panel-id="geo-map"] header', '[data-geo-play]'].forEach((sel) => swap(sel));
    swap('.jv-geo-time-note', true);
    swap('[data-panel-id="geo-ranking"]', true);
    const range = view.querySelector('[data-geo-week]');
    const was = fresh.querySelector('[data-geo-week]');
    if (range && was && document.activeElement !== range) range.value = was.value;
    if (range && was) range.setAttribute('aria-valuetext', was.getAttribute('aria-valuetext'));
}
