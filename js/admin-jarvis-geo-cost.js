/*
 * Jarvis Map cost and return (#3283): the Cost and return metrics, their colour from good to bad, the cost panel, the
 * country sheet's block and the monthly costs in Settings, from the geo source's `cost` (functions/jarvis-geo-cost.js).
 * It imports nothing, so admin-jarvis-geo.js can list its metrics. Twin: android/.../ui/GeoCost.kt.
 */
export const CHANNEL = ['cost', 'Cost and return'];
// [key, label, channel, unit], as METRICS in admin-jarvis-geo.js.
export const METRICS = [
    ['cost', 'Outreach cost', 'cost', '$'], ['costPerSent', 'USD per email sent', 'cost', '$'], ['costPerReply', 'USD per reply', 'cost', '$'],
    ['costPerPositive', 'USD per positive reply', 'cost', '$'], ['roi', 'Return on cost', 'cost', '×']
];
export const KEYS = new Set(METRICS.map((m) => m[0]));
// Cheaper is better for these; Return is better higher. Outreach cost is plain spend, shaded like the counts.
export const LOWER = new Set(['costPerSent', 'costPerReply', 'costPerPositive']);
export const SCALED = new Set(['costPerSent', 'costPerReply', 'costPerPositive', 'roi']);
// The geo source's per-country fields, in its order (KEYS in functions/jarvis-geo-cost.js).
const FIELDS = ['cost', 'costPerSent', 'costPerReply', 'costPerPositive', 'revenue', 'roi'];
export const NEEDS = 'Add monthly outreach costs in Settings to see cost and return.';
export const COST_CHANNELS = [['email', 'Cold email'], ['social', 'Social'], ['links', 'Short links'], ['all', 'All outreach']];
const SPREAD = { email: 'emails sent', social: 'social replies', links: 'link visits', all: 'emails sent' };
const GOOD = [61, 255, 168];
const MID = [255, 181, 71];
const BAD = [255, 77, 141];
const MAX_ITEMS = 30;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d) => { const [, m, n] = String(d || '').split('-').map(Number); return m ? `${MONTHS[m - 1]} ${n}` : ''; };

/** A country's number for a cost metric, null where it has none (no cost, or nothing to divide by). */
export function value(r, key) {
    const v = r ? r[key] : null;
    return v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
}

/** "$0.012" under a dollar, "$14.50" above, "1.25×" for Return. */
export function show(v, key) {
    if (v === null || v === undefined) return '—';
    const n = Number(v);
    if (key === 'roi') return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}×`;
    if (!n) return '$0';
    return '$' + n.toLocaleString('en-US', n < 1 ? { minimumFractionDigits: 3, maximumFractionDigits: 3 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Best first: the cheapest per email, reply or positive reply, the highest return, the most spent. */
export function ranked(rows, key) {
    const v = (r) => value(r, key);
    const dir = LOWER.has(key) ? 1 : -1;
    return rows.filter((r) => { const x = v(r); return x !== null && (key === 'roi' || x > 0); })
        .sort((a, b) => dir * (v(a) - v(b)) || a.cc.localeCompare(b.cc));
}

const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
/** The colour for how good a number is, 0 (pink) through amber to 1 (green). */
export function colour(good) {
    const t = Math.max(0, Math.min(1, good));
    const c = t < 0.5 ? mix(BAD, MID, t * 2) : mix(MID, GOOD, (t - 0.5) * 2);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** How good each number is: Return against 1× (pays back); a cost per reply by its rank, cheapest 1, costliest 0. */
export function goodness(rows, key) {
    const list = rows.map((r) => [r.cc, value(r, key)]).filter(([, v]) => v !== null && (key === 'roi' || v > 0));
    const out = {};
    if (key === 'roi') { list.forEach(([cc, v]) => { out[cc] = Math.min(1, v); }); return out; }
    const sorted = list.map((x) => x[1]).sort((a, b) => a - b);
    list.forEach(([cc, v]) => {
        const at = (sorted.indexOf(v) + sorted.lastIndexOf(v)) / 2;
        out[cc] = sorted.length > 1 ? 1 - at / (sorted.length - 1) : 1;
    });
    return out;
}

export function fills(rows, key) {
    const g = goodness(rows, key);
    const out = {};
    Object.keys(g).forEach((cc) => { out[cc] = colour(g[cc]); });
    return out;
}

/** The scale under the map: cheapest to costliest, or no return to pays back. */
export function legend(rows, key, esc) {
    const vals = rows.map((r) => value(r, key)).filter((v) => v !== null && (key === 'roi' || v > 0));
    if (!vals.length) return `<div class="jv-geo-scale jv-cost-scale"><em>No country has ${esc(labelOf(key).toLowerCase())} yet</em></div>`;
    if (key !== 'roi' && Math.min(...vals) === Math.max(...vals)) return `<div class="jv-geo-scale jv-cost-scale"><em>${esc(show(vals[0], key))} in each of ${vals.length} countries${key === 'costPerSent' ? ': email costs are spread by emails sent, so only social and link costs make it differ' : ''}</em></div>`;
    if (key === 'roi') return `<div class="jv-geo-scale jv-cost-scale is-up"><span>0× no return</span><i></i><span>1× pays back</span><em>${vals.filter((v) => v >= 1).length} of ${vals.length} pay back · best ${esc(show(Math.max(...vals), key))}</em></div>`;
    return `<div class="jv-geo-scale jv-cost-scale"><span>${esc(show(Math.min(...vals), key))} cheapest</span><i></i><span>${esc(show(Math.max(...vals), key))} costliest</span><em>by rank, ${vals.length} countries</em></div>`;
}
const labelOf = (key) => (METRICS.find((m) => m[0] === key) || METRICS[0])[1];

/** The cost view behind what the map shows: a range's last n days, a played week, or Now's basis. */
export function viewFor(g, tv) {
    const c = g && g.cost;
    if (!c) return null;
    if (tv && tv.mode === 'span') return ((c.ranges || {})[tv.span] || [])[0] || null;
    if (tv && tv.mode === 'week') return (c.weeks || [])[tv.week] || null;
    return c.now || null;
}

/** One country's FIELDS from a view, null where it has none. */
export function fieldsOf(view, cc) {
    const row = view && view.c && view.c[cc];
    const out = {};
    FIELDS.forEach((k, n) => { out[k] = row ? row[n] : null; });
    return out;
}

/** Puts a view's cost fields on rows built from the history (admin-jarvis-geo-time.js). */
export function join(rows, view) {
    rows.forEach((r) => Object.assign(r, fieldsOf(view, r.cc)));
    return rows;
}

const hasItems = (g) => !!(g && g.cost && (g.cost.items || []).length);

/** What the cost numbers cover, in words. */
export function basisText(g, tv) {
    const c = g && g.cost;
    if (!c) return '';
    if (tv && tv.mode === 'span') { const v = viewFor(g, tv); return v ? `last ${tv.span} days, ${day(v.from)} – ${day(v.to)}` : ''; }
    if (tv && tv.mode === 'week') return tv.label || '';
    const b = c.basis;
    if (!b) return '';
    return b.kind === 'span' ? `last ${b.span} days, ${day(b.from)} – ${day(b.to)}` : `since the first campaign, ${day(b.from)}`;
}

const settingsLink = (text) => `<button type="button" class="jv-link" data-act="settings" data-settings-at="gc-at">${text}</button>`;

/** The line under the map's legend on a cost metric: the ask while no cost is saved, else what the numbers cover. */
export function note(g, tv, esc) {
    if (!hasItems(g)) return `<p class="jv-note jv-cost-need">${esc(NEEDS)} ${settingsLink('Open Settings')}</p>`;
    const v = viewFor(g, tv);
    if (!v) return '<p class="jv-note">No cost basis yet: the daily run records the history, or a campaign has to start.</p>';
    const t = v.totals;
    return `<p class="jv-note">Cost and return over the ${esc(basisText(g, tv))}: ${esc(show(t.cost, 'cost'))} spent${t.unspread ? `, ${esc(show(t.unspread, 'cost'))} not spread (no country had the activity it is spread by)` : ''}. Revenue is paid unlocks from short links.</p>`;
}

/** The Cost and return panel: totals, the channels, and the best and worst countries for the picked cost metric. */
export function panels(g, tv, key, channel, h) {
    if (!(channel === 'all' || channel === CHANNEL[0] || KEYS.has(key))) return '';
    const { panel, esc, fmt } = h;
    if (!hasItems(g)) return panel('geo-cost', 'Cost and return', `<p class="jv-empty">${esc(NEEDS)}</p><div class="jv-actions"><button type="button" class="jv-btn" data-act="settings" data-settings-at="gc-at">Add monthly costs</button></div>`, { keep: true });
    const v = viewFor(g, tv);
    const c = g.cost;
    const basis = basisText(g, tv);
    if (!v) return panel('geo-cost', 'Cost and return', '<p class="jv-empty">No cost basis yet: the daily run records the history, or a campaign has to start.</p>', { keep: true });
    const t = v.totals;
    const cell = (label, val) => `<div><dt>${esc(label)}</dt><dd>${esc(val)}</dd></div>`;
    const kpis = `<dl class="jv-cost-kpis">${cell('Spent', show(t.cost, 'cost'))}${cell('USD per email', show(t.costPerSent, 'costPerSent'))}${cell('USD per reply', show(t.costPerReply, 'costPerReply'))}
        ${cell('USD per positive reply', show(t.costPerPositive, 'costPerPositive'))}${cell('Revenue', show(t.revenue, 'cost'))}${cell('Return', show(t.roi, 'roi'))}</dl>`;
    const ch = COST_CHANNELS.filter(([k]) => (c.monthly || {})[k] || (t.channels[k] || {}).usd).map(([k, label]) => {
        const x = t.channels[k] || {};
        return `<tr><td data-label="Channel">${esc(label)}</td><td data-label="A month">${esc(show((c.monthly || {})[k] || 0, 'cost'))}</td><td data-label="This span">${esc(show(x.usd || 0, 'cost'))}</td>
            <td data-label="Spread by">${esc(SPREAD[k])} · ${fmt(x.over || 0)} countries${x.unspread ? ` · <span class="jv-cost-warn">${esc(show(x.unspread, 'cost'))} not spread</span>` : ''}</td></tr>`;
    }).join('');
    const m = SCALED.has(key) ? key : 'costPerReply';
    const list = ranked(tv.rows, m);
    const item = (r) => `<li><button type="button" class="jv-link" data-geo-cc="${r.cc}">${esc(r.name)}</button> <b>${esc(show(value(r, m), m))}</b></li>`;
    const sides = list.length ? `<div class="jv-cost-sides"><div><h4>Best · ${esc(labelOf(m))}</h4><ol>${list.slice(0, 5).map(item).join('')}</ol></div>
        ${list.length > 5 ? `<div><h4>Worst · ${esc(labelOf(m))}</h4><ol>${list.slice(Math.max(5, list.length - 5)).reverse().map(item).join('')}</ol></div>` : ''}</div>` : `<p class="jv-note">No country has ${esc(labelOf(m).toLowerCase())} over this span.</p>`;
    return panel('geo-cost', `Cost and return · ${esc(basis.split(',')[0])}`, `${kpis}<div class="jv-table-wrap"><table class="jv-table"><thead><tr><th>Channel</th><th>A month</th><th>This span</th><th>Spread by</th></tr></thead><tbody>${ch}</tbody></table></div>${sides}`,
        { keep: true, note: 'Monthly costs from Settings, prorated to the days shown. Email and All outreach costs are spread by each country\'s share of emails sent, social by social replies, short links by link visits. Revenue is paid unlocks from short links; Return is revenue over cost.',
            data: Object.keys(v.c).map((cc) => Object.assign({ cc }, fieldsOf(v, cc))) });
}

/** The country sheet's block: its cost and return over the shown span, and the span before on a range. */
export function sheet(g, cc, tv, esc) {
    if (!hasItems(g)) return `<p class="jv-note jv-cost-need">${esc(NEEDS)} ${settingsLink('Open Settings')}</p>`;
    const v = viewFor(g, tv);
    if (!v) return '';
    const before = tv && tv.mode === 'span' ? ((g.cost.ranges || {})[tv.span] || [])[1] : null;
    const a = fieldsOf(v, cc);
    const b = before ? fieldsOf(before, cc) : null;
    const rows = [['cost', 'Outreach cost'], ['costPerSent', 'USD per email sent'], ['costPerReply', 'USD per reply'], ['costPerPositive', 'USD per positive reply'], ['revenue', 'Revenue (links)'], ['roi', 'Return on cost']];
    const heads = ['Number', basisText(g, tv)].concat(b ? ['Before'] : []);
    const cell = (i, html) => `<td data-label="${esc(heads[i])}">${html}</td>`;
    const unit = (k) => (k === 'revenue' ? 'cost' : k);
    const body = rows.map(([k, label]) => `<tr>${cell(0, esc(label))}${cell(1, esc(show(a[k], unit(k))))}${b ? cell(2, esc(show(b[k], unit(k)))) : ''}</tr>`).join('');
    return `<div class="jv-geo-sheet-cost"><h4>Cost and return</h4><div class="jv-table-wrap"><table class="jv-table"><thead><tr>${heads.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

/** For Ask: the monthly costs, what Now covers, the totals and the cheapest and costliest countries per reply. */
export function askOf(geo) {
    const c = geo && geo.ok !== false ? geo.cost : null;
    if (!c) return null;
    if (!(c.items || []).length) return { note: NEEDS };
    const rows = c.now ? Object.keys(c.now.c).map((cc) => Object.assign({ cc }, fieldsOf(c.now, cc))) : [];
    const line = (r) => `${r.cc}: ${show(r.cost, 'cost')} cost, ${show(r.costPerSent, 'costPerSent')} per email, ${show(r.costPerReply, 'costPerReply')} per reply, return ${show(r.roi, 'roi')}`;
    const perReply = ranked(rows, 'costPerReply');
    return { monthlyUsd: c.monthly, basis: basisText(geo, null), totals: c.now ? c.now.totals : null, cheapestPerReply: perReply.slice(0, 5).map(line), costliestPerReply: perReply.slice(-5).reverse().map(line) };
}

/** The list as typed, checked like the server does: { items } or { error } naming the first problem. */
export function clean(list) {
    const items = [];
    if (list.length > MAX_ITEMS) return { error: `At most ${MAX_ITEMS} costs.` };
    for (let i = 0; i < list.length; i++) {
        const o = list[i] || {};
        const label = String(o.label || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!label && !o.usd) continue;
        if (!label) return { error: `Cost ${i + 1} needs a name.` };
        const usd = Number(o.usd);
        if (!Number.isFinite(usd) || usd <= 0 || usd > 100000) return { error: `${label}: give the USD a month, above 0.` };
        const channel = COST_CHANNELS.some((c) => c[0] === o.channel) ? o.channel : 'all';
        const from = String(o.from || '').trim();
        const to = String(o.to || '').trim();
        if ((from && !/^\d{4}-(0[1-9]|1[0-2])$/.test(from)) || (to && !/^\d{4}-(0[1-9]|1[0-2])$/.test(to))) return { error: `${label}: months are YYYY-MM.` };
        if (from && to && to < from) return { error: `${label}: the end month is before the start.` };
        items.push({ label, usd: Math.round(usd * 100) / 100, channel, from, to });
    }
    return { items };
}

/**
 * The monthly costs in Jarvis settings, saved apart from the rest by the geo-costs-save op. node: the section; ctx: call,
 * esc, toast, S (S.external.geo.cost has the saved list; S.geoCostDraft keeps what was typed until it is saved), reload.
 */
export function paintSettings(node, ctx) {
    if (!node) return;
    const { esc, S } = ctx;
    const saved = S.external && S.external.geo && S.external.geo.cost;
    if (!S.geoCostDraft && saved) S.geoCostDraft = { items: saved.items.map((x) => Object.assign({}, x)), suggestions: [], note: '' };
    const d = S.geoCostDraft;
    if (!d) {
        node.innerHTML = '<h4>Outreach costs</h4><p class="jv-note">Reading the saved costs…</p>';
        if (!S.geoCostLoading) {
            S.geoCostLoading = true;
            ctx.call('geo-costs').then((out) => {
                S.geoCostDraft = { items: out && out.ok ? (out.items || []) : [], suggestions: [], note: out && out.ok ? '' : 'The saved costs could not be read: ' + ((out && out.error) || 'no answer') };
            }).finally(() => { S.geoCostLoading = false; if (node.isConnected) paintSettings(node, ctx); });
        }
        return;
    }
    const opt = (k, label, on) => `<option value="${k}"${on ? ' selected' : ''}>${esc(label)}</option>`;
    const row = (x, i) => `<div class="jv-cost-row" data-gc-row="${i}">
        <input name="gc-label" value="${esc(x.label || '')}" maxlength="60" placeholder="Instantly plan" aria-label="Cost ${i + 1} name">
        <label class="jv-cost-usd">$<input name="gc-usd" type="number" min="0.01" step="0.01" value="${esc(x.usd === undefined ? '' : x.usd)}" aria-label="Cost ${i + 1} USD a month"></label>
        <select name="gc-channel" aria-label="Cost ${i + 1} channel" data-menu-ready="1">${COST_CHANNELS.map(([k, label]) => opt(k, label, k === (x.channel || 'all'))).join('')}</select>
        <input name="gc-from" type="month" value="${esc(x.from || '')}" aria-label="Cost ${i + 1} from month" title="From month (empty: always)">
        <input name="gc-to" type="month" value="${esc(x.to || '')}" aria-label="Cost ${i + 1} to month" title="To month (empty: still running)">
        <button type="button" class="jv-btn small" data-geo-cost="remove" data-i="${i}" aria-label="Remove cost ${i + 1}">✕</button></div>`;
    const sugg = d.suggestions.length ? `<ul class="jv-cost-sugg">${d.suggestions.map((x, i) => `<li><b>${esc(x.label)}</b> · ${esc(show(x.usd, 'cost'))} a month · ${esc(x.channel)}
        <span class="jv-note">${esc(x.source || '')}: ${esc(x.why || '')}</span> <button type="button" class="jv-btn small" data-geo-cost="use" data-i="${i}">Add</button></li>`).join('')}</ul>` : '';
    const total = clean(d.items).items || [];
    node.innerHTML = `<h4>Outreach costs</h4>
        <p class="jv-note">What outreach costs a month, in USD: the Instantly plan, mailbox seats, sending domains, anything else. The Map spreads it over the countries for cost per email, per reply and return. Suggest costs reads last month from Cloudflare Registrar, Google Cloud billing, the Jarvis worker and Cursor; nothing is added until you add it.</p>
        <div class="jv-cost-list">${d.items.length ? `<div class="jv-cost-row jv-cost-head" aria-hidden="true"><span>Name</span><span>USD a month</span><span>Channel</span><span>From month</span><span>To month</span><span></span></div>${d.items.map(row).join('')}` : '<p class="jv-note">No cost yet.</p>'}</div>
        <div class="jv-actions"><button type="button" class="jv-btn small" name="gc-at" data-geo-cost="add">Add a cost</button><button type="button" class="jv-btn small" data-geo-cost="suggest"${d.suggesting ? ' disabled' : ''}>${d.suggesting ? 'Reading the sources…' : 'Suggest costs'}</button>
            <button type="button" class="jv-btn" data-geo-cost="save"${d.saving ? ' disabled' : ''}>${d.saving ? 'Saving…' : 'Save costs'}</button><span class="jv-note">${esc(show(total.reduce((s, x) => s + x.usd, 0), 'cost'))} a month</span></div>
        ${sugg}${d.note ? `<p class="jv-note">${esc(d.note)}</p>` : ''}
        <p class="jv-note">Cold email and All outreach are spread by emails sent, Social by social replies, Short links by link visits. Leave the months empty for a cost that runs every month. Saved on its own, apart from Save below; the app edits the same list.</p>`;
    bind(node, ctx);
}

// Reads the typed rows into the draft.
function readRows(node, d) {
    d.items = Array.from(node.querySelectorAll('[data-gc-row]')).map((el) => ({
        label: el.querySelector('[name="gc-label"]').value, usd: el.querySelector('[name="gc-usd"]').value, channel: el.querySelector('[name="gc-channel"]').value,
        from: el.querySelector('[name="gc-from"]').value, to: el.querySelector('[name="gc-to"]').value
    }));
}

function bind(node, ctx) {
    if (node.dataset.gcBound) return;
    node.dataset.gcBound = '1';
    const { S } = ctx;
    node.addEventListener('input', () => { if (S.geoCostDraft) readRows(node, S.geoCostDraft); });
    node.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.matches('input')) event.preventDefault(); });
    node.addEventListener('click', async (event) => {
        const t = event.target.closest('[data-geo-cost]');
        if (!t) return;
        event.preventDefault();
        event.stopPropagation();
        const d = S.geoCostDraft;
        if (!d) return;
        readRows(node, d);
        const act = t.dataset.geoCost;
        const i = Number(t.dataset.i);
        if (act === 'add') { d.items.push({ label: '', usd: '', channel: 'email', from: '', to: '' }); paintSettings(node, ctx); const last = node.querySelectorAll('[name="gc-label"]'); if (last.length) last[last.length - 1].focus(); return; }
        if (act === 'remove') { d.items.splice(i, 1); paintSettings(node, ctx); return; }
        if (act === 'use') { const x = d.suggestions[i]; if (x) { d.items.push({ label: x.label, usd: x.usd, channel: x.channel, from: x.from || '', to: x.to || '' }); d.suggestions.splice(i, 1); } paintSettings(node, ctx); return; }
        if (act === 'suggest') {
            d.suggesting = true;
            paintSettings(node, ctx);
            const out = await ctx.call('geo-costs', { suggest: true });
            d.suggesting = false;
            d.suggestions = out && out.ok ? out.suggestions || [] : [];
            d.note = out && out.ok ? out.note || (d.suggestions.length ? '' : 'Nothing to suggest.') : 'The suggestions could not be read: ' + ((out && out.error) || 'no answer');
            paintSettings(node, ctx);
            return;
        }
        if (act === 'save') {
            const checked = clean(d.items);
            if (checked.error) { ctx.toast(checked.error, 5000); return; }
            d.saving = true;
            paintSettings(node, ctx);
            const out = await ctx.call('geo-costs-save', { items: checked.items });
            d.saving = false;
            if (!out || !out.ok) { ctx.toast('Costs not saved: ' + ((out && out.error) || 'no answer'), 6000); paintSettings(node, ctx); return; }
            S.geoCostDraft = { items: out.items.map((x) => Object.assign({}, x)), suggestions: d.suggestions, note: '' };
            ctx.toast(out.items.length ? `Saved ${out.items.length} monthly cost${out.items.length === 1 ? '' : 's'}. The Map recounts cost and return.` : 'Costs cleared.', 4000);
            paintSettings(node, ctx);
            ctx.reload();
        }
    });
}
