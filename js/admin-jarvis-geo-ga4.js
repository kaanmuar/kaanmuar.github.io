/*
 * The Map's GA4 numbers per country (#3282): visitors, engaged sessions and key events for every country GA4 sees,
 * against the span before, from the geo rows (functions/jarvis-geo-ga4.js). Twin: android/.../ui/GeoGa4.kt.
 */
const num = (v) => (v === null || v === undefined ? null : Number(v) || 0);
const fmt = (v) => Number(v || 0).toLocaleString('en-US');

/** The change from before to now in percent, whole; null when either is missing or before was 0. */
export function change(now, before) {
    const a = num(now);
    const b = num(before);
    if (a === null || b === null || !b) return null;
    return Math.round(((a - b) / b) * 100);
}

// One KPI: the number now, the change against before ("+12%", "new" when before had none) and before itself.
function kpi(label, now, before, value) {
    const a = num(now);
    const b = num(before);
    const pct = change(a, b);
    const delta = a === null ? '' : pct !== null ? `${pct > 0 ? '+' : ''}${pct}%` : a > 0 ? 'new' : '';
    return { label, value: value !== undefined ? value : a === null ? '—' : a, delta, dir: pct !== null ? Math.sign(pct) : a > 0 ? 1 : 0, prior: delta && b !== null ? b : undefined };
}

/** The country sheet's GA4 KPIs for kpis(): visitors, engaged sessions with the engagement rate, and key events. */
export function kpis(r) {
    const rate = r.engagementRate === null || r.engagementRate === undefined ? '' : ` · ${r.engagementRate}%`;
    return [
        kpi('Visitors (GA4)', r.visitors, r.visitorsPrior),
        kpi('Engaged sessions · rate', r.engaged, r.engagedPrior, `${fmt(r.engaged)}${rate}`),
        kpi('Key events', r.keyEvents, r.keyEventsPrior)
    ];
}
