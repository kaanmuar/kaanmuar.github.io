/*
 * Jarvis Map: short-link clicks by visitor country (#3281), from the geo rows' clicks and visitor* fields
 * (functions/jarvis-geo-clicks.js). The country sheet's "Visitors from here vs prospects here" block sets what people
 * in a country did with our short links next to what the links we sent to its prospects brought, wherever the
 * visitor was. The Android app's twin is android/.../ui/GeoClicks.kt.
 */
const KIND_LABELS = { outreach: 'outreach email', social: 'social replies', channel: 'channels', call: 'call links', landing: 'landing', unknown: 'other' };

/** The block's rows: [label, from visitors here, for prospects here, money]; null when the country has neither side. */
export function rows(r) {
    if (!r) return null;
    const n = (k) => Number(r[k]) || 0;
    const list = [
        ['Short-link clicks', n('clicks'), n('prospectClicks'), false],
        ['Review page opens', n('visitorVisits'), n('visits'), false],
        ['Reviews', n('visitorReviews'), n('reviews'), false],
        ['Paid unlocks', n('visitorPaid'), n('paid'), false],
        ['Revenue (USD)', n('visitorUsd'), n('usd'), true]
    ];
    return list.some((x) => x[1] || x[2]) ? list : null;
}

/** "outreach email 8, social replies 3", largest first. */
export function kindsText(kinds) {
    return Object.keys(kinds || {}).filter((k) => kinds[k] > 0).sort((a, b) => kinds[b] - kinds[a] || a.localeCompare(b))
        .map((k) => `${KIND_LABELS[k] || k} ${kinds[k].toLocaleString('en-US')}`).join(', ');
}

/** The clicks against the span before: "+3 on the 30 days before" or "" without a prior. */
export function changeText(r) {
    if (!r || !(Number(r.clicks) || Number(r.clicksPrior))) return '';
    const d = (Number(r.clicks) || 0) - (Number(r.clicksPrior) || 0);
    return d ? `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString('en-US')} on the span before` : 'same as the span before';
}

/** The country sheet block, or '' when no link reached or came from this country. */
export function sheet(r, { esc, fmt }) {
    const list = rows(r);
    if (!list) return '';
    const heads = ['Number', `Visitors from ${r.name}`, `Prospects in ${r.name}`];
    const cell = (i, html) => `<td data-label="${esc(heads[i])}">${html}</td>`;
    const show = (v, usd) => esc((usd ? '$' : '') + fmt(v));
    const body = list.map(([label, from, here, usd]) => `<tr>${cell(0, esc(label))}${cell(1, show(from, usd))}${cell(2, show(here, usd))}</tr>`).join('');
    const kinds = kindsText(r.clickKinds);
    const note = [kinds ? `Clicks: ${kinds}` : '', changeText(r)].filter(Boolean).join(' · ');
    return `<div class="jv-geo-clicks"><h4>Visitors from here vs prospects here</h4><div class="jv-table-wrap"><table class="jv-table"><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
        <p class="jv-note">${note ? esc(note) + '. ' : ''}Visitors: where the person who clicked was. Prospects: the sites we wrote to here, wherever their clicks came from.</p></div>`;
}

/** The Map's note when clicks are on: the range's total, how many had no country, and the change. */
export function note(g) {
    const t = (g && g.totals) || {};
    if (t.clicks === undefined || t.clicks === null) return '';
    const before = t.clicksPrior === null || t.clicksPrior === undefined ? '' : `, ${t.clicksPrior.toLocaleString('en-US')} the span before`;
    return `${t.clicks.toLocaleString('en-US')} short-link clicks${before}${t.clicksUnknown ? `; ${t.clicksUnknown.toLocaleString('en-US')} with no country` : ''}. Bots and link previews are left out.`;
}
