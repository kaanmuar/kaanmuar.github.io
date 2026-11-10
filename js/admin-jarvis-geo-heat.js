/*
 * Jarvis Map heatmap and sector grid (#3112), from the geo source's `heat` and `sectors` (functions/jarvis-geo-heat.js).
 * Heatmap: replies or sends by weekday and hour in each country's local time, the campaigns' sending window outlined.
 * Sector grid: countries by prospect sector, one metric shaded by the six light levels; a cell opens the country sheet.
 * The Android app's twin is android/.../ui/GeoHeat.kt.
 */
import { LIGHTS } from './admin-jarvis-geo.js?v=2988';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const KINDS = [['replies', 'Replies'], ['sends', 'Sends']];
export const SECTOR_METRICS = [['prospects', 'Prospects'], ['sent', 'Sent'], ['replies', 'Replies'], ['replyRate', 'Reply rate']];
const TIMED = ['all', 'email'];
const WINDOW = '#ffb547';

/** A value's light level against the largest: 0 for none, else 1 to 5 on a square-root scale. Twin: GeoHeat.levelOf. */
export function levelOf(v, max) {
    if (!(v > 0) || !(max > 0)) return 0;
    return Math.max(1, Math.min(5, 1 + Math.floor(Math.sqrt(Math.min(1, v / max)) * 5 - 1e-9)));
}

/** Whether the window mask (42 hex digits, six per day from Monday, bit 23 - hour) has a campaign sending then. */
export function windowOn(hex, d, h) {
    if (!hex || hex.length < (d + 1) * 6) return false;
    return ((parseInt(hex.slice(d * 6, d * 6 + 6), 16) >> (23 - h)) & 1) === 1;
}

/** The 168 cells (day * 24 + hour) of sparse [day, hour, n, positive] rows. */
export function cells(rows) {
    const out = Array.from({ length: 168 }, () => [0, 0]);
    (rows || []).forEach((c) => { const k = c[0] * 24 + c[1]; if (k >= 0 && k < 168) out[k] = [c[2] || 0, c[3] || 0]; });
    return out;
}

/** What the heatmap draws for the country (or every country) and kind: cells, the window, and a summary. */
export function heatOf(heat, cc, kind) {
    const one = cc && heat && heat.countries ? heat.countries[cc] : null;
    const src = one || (heat && heat.all) || {};
    const grid = cells(kind === 'sends' ? src.s : src.r);
    const w = one ? one.w || '' : '';
    const total = grid.reduce((s, c) => s + c[0], 0);
    let best = -1;
    grid.forEach((c, k) => { if (c[0] > (best < 0 ? 0 : grid[best][0])) best = k; });
    const inWindow = w ? grid.reduce((s, c, k) => s + (windowOn(w, Math.floor(k / 24), k % 24) ? c[0] : 0), 0) : null;
    return { grid, w, total, max: Math.max(0, ...grid.map((c) => c[0])), best: best < 0 ? null : { d: Math.floor(best / 24), h: best % 24, n: grid[best][0] }, inWindow, zone: one && heat.zones ? heat.zones[cc] : '' };
}

const hh = (h) => String(h).padStart(2, '0') + ':00';

/** The 7 × 24 heatmap as inline SVG: a light-level fill per hour, a gold dot for positive replies, the window outlined. */
export function heatSvg(v, kind, esc) {
    const cw = 16;
    const left = 30;
    const top = 14;
    const unit = kind === 'sends' ? 'send' : 'repl';
    const many = (n) => (unit === 'send' ? (n === 1 ? 'send' : 'sends') : n === 1 ? 'reply' : 'replies');
    let body = '';
    for (let h = 0; h < 24; h += 3) body += `<text class="jv-heat-h" x="${left + h * cw + cw / 2}" y="${top - 4}" text-anchor="middle">${h}</text>`;
    DAYS.forEach((day, d) => {
        body += `<text class="jv-heat-d" x="${left - 5}" y="${top + d * cw + cw * 0.68}" text-anchor="end">${day}</text>`;
        for (let h = 0; h < 24; h++) {
            const [n, pos] = v.grid[d * 24 + h];
            const l = levelOf(n, v.max);
            const on = windowOn(v.w, d, h);
            const tip = `${day} ${hh(h)}–${hh((h + 1) % 24)}: ${n} ${many(n)}${pos ? `, ${pos} positive` : ''}${on ? ' · sending window' : ''}`;
            body += `<rect class="jv-heat-c is-l${l}" x="${left + h * cw + 1}" y="${top + d * cw + 1}" width="${cw - 2}" height="${cw - 2}" rx="2.5" fill="${LIGHTS[l][1]}"><title>${esc(tip)}</title></rect>`;
            if (on) body += `<rect class="jv-heat-w" x="${left + h * cw + 0.5}" y="${top + d * cw + 0.5}" width="${cw - 1}" height="${cw - 1}" rx="3" fill="none" stroke="${WINDOW}" stroke-width="1.2" pointer-events="none"/>`;
            if (pos) body += `<circle cx="${left + h * cw + cw / 2}" cy="${top + d * cw + cw / 2}" r="2.2" fill="${LIGHTS[5][1]}" stroke="#04131a" stroke-width="0.6" pointer-events="none"/>`;
        }
    });
    const w = left + 24 * cw + 2;
    const h = top + 7 * cw + 2;
    return `<svg class="jv-heat" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(`${kind === 'sends' ? 'Sends' : 'Replies'} by weekday and local hour`)}">${body}</svg>`;
}

/** A sector cell's number for a metric, or null (no emails sent has no reply rate). */
export function sectorValue(row, n, key) {
    if (key === 'prospects') return row.p[n] || 0;
    if (key === 'sent') return row.s[n] || 0;
    if (key === 'replies') return row.r[n] || 0;
    return row.s[n] ? Math.round((row.r[n] / row.s[n]) * 1000) / 10 : null;
}
const showValue = (v, key) => (v === null ? '—' : Number(v).toLocaleString('en-US') + (key === 'replyRate' ? '%' : ''));
export const sectorLabel = (s) => (s === '?' ? 'No sector' : s === 'tvet' ? 'TVET' : s.charAt(0).toUpperCase() + s.slice(1));

/** The grid as a table: country names and cells are buttons that open the country sheet. */
export function sectorTable(grid, key, selected, esc) {
    const list = grid.list || [];
    const rows = grid.rows || [];
    const max = Math.max(0, ...rows.flatMap((r) => list.map((_, n) => sectorValue(r, n, key) || 0)));
    const head = `<tr><th scope="col">Country</th>${list.map((s) => `<th scope="col">${esc(sectorLabel(s))}</th>`).join('')}</tr>`;
    const body = rows.map((r) => `<tr class="${r.cc === selected ? 'is-on' : ''}"><th scope="row"><button type="button" class="jv-link" data-geo-cc="${r.cc}">${esc(r.name)}</button></th>${list.map((s, n) => {
        const v = sectorValue(r, n, key);
        const l = levelOf(v, max);
        return `<td><button type="button" class="jv-sector-c is-l${l}" style="background:${LIGHTS[l][1]}" data-geo-cc="${r.cc}" title="${esc(`${r.name} · ${sectorLabel(s)}: ${showValue(v, key)} ${key === 'replyRate' ? 'reply rate' : key}`)}">${v ? esc(showValue(v, key)) : ''}</button></td>`;
    }).join('')}</tr>`).join('');
    return `<div class="jv-sector-wrap"><table class="jv-sector"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

const seg = (items, on, attr, label, esc) => `<div class="jv-seg" role="group" aria-label="${label}">${items.map(([k, text]) => `<button type="button" data-${attr}="${k}" class="${k === on ? 'on' : ''}" aria-pressed="${k === on}">${esc(text)}</button>`).join('')}</div>`;
const lightKey = (esc) => `<ul class="jv-heat-legend">${LIGHTS.map(([name, color], n) => `<li class="is-l${n}"><i style="background:${color}"></i>${esc(n ? name : 'None')}</li>`).join('')}</ul>`;

/** Remembers the heatmap kind or the grid metric from a clicked button's data attributes. */
export function pick(S, data) {
    if (data.geoHeat) S.geoHeat = data.geoHeat;
    if (data.geoSector) S.geoSector = data.geoSector;
}

/**
 * The Heatmap and Sector grid panels under the ranking. h: { panel, esc, fmt } from admin-jarvis.js; follows the
 * selected country (S.geoCc) and the channel.
 */
export function panels(S, g, channel, h) {
    const { panel, esc, fmt } = h;
    const heat = g.heat;
    const grid = g.sectors;
    const sel = (g.countries || []).find((r) => r.cc === S.geoCc);
    const kind = KINDS.some((k) => k[0] === S.geoHeat) ? S.geoHeat : 'replies';
    let heatBody;
    let heatNote = '';
    if (!heat) heatBody = '<p class="jv-empty">The geo source has no heatmap yet; it comes with the next refresh.</p>';
    else if (!TIMED.includes(channel)) heatBody = '<p class="jv-empty">Only cold email has hours: pick All or Cold email for replies and sends by hour.</p>';
    else {
        const v = heatOf(heat, sel && sel.cc, kind);
        const many = kind === 'sends' ? 'sends' : 'replies';
        const where = sel ? (v.zone ? `${esc(sel.name)}'s local time (${esc(v.zone)})` : `${esc(sel.name)}: no time zone known`) : 'each country\'s local time';
        const summary = v.total ? `${fmt(v.total)} ${many} in ${where}. Busiest: ${DAYS[v.best.d]} ${hh(v.best.h)} (${fmt(v.best.n)}).${v.inWindow !== null ? ` ${fmt(v.inWindow)} of ${fmt(v.total)} inside the sending window.` : ''}`
            : `No ${many} ${sel ? 'from ' + esc(sel.name) : 'yet'} in ${where}.`;
        heatBody = `<div class="jv-actions">${seg(KINDS, kind, 'geo-heat', 'Replies or sends', esc)}</div><p class="jv-note">${summary}</p>${heatSvg(v, kind, esc)}
            ${lightKey(esc)}<p class="jv-note"><span class="jv-heat-key" style="border-color:${WINDOW}"></span>${sel ? (v.w ? 'Sending window of its campaigns, in its local time.' : 'No campaign with a sending window reaches it.') : 'Pick a country to see its campaigns\' sending window.'}${v.grid.some((c) => c[1]) ? ` <span class="jv-heat-dot" style="background:${LIGHTS[5][1]}"></span>positive reply` : ''}</p>`;
        const multi = (heat.multi || []).map((cc) => `${cc} ${heat.zones[cc]}`);
        heatNote = `Replies are the outreach sync's last 80; sends are Instantly's last 200 sent emails${heat.unzoned ? `; ${fmt(heat.unzoned)} have no known country or time zone` : ''}.${multi.length ? ' Countries with several zones use their most populous one: ' + esc(multi.join(', ')) + '.' : ''}`;
    }
    const metric = SECTOR_METRICS.some((m) => m[0] === S.geoSector) ? S.geoSector : channel === 'email' ? 'sent' : 'prospects';
    const gridBody = !grid ? '<p class="jv-empty">The geo source has no sector grid yet; it comes with the next refresh.</p>'
        : `${(grid.needs || []).length ? `<ul class="jv-needs">${grid.needs.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}<div class="jv-actions">${seg(SECTOR_METRICS, metric, 'geo-sector', 'Grid metric', esc)}</div>
            ${(grid.rows || []).length ? sectorTable(grid, metric, S.geoCc, esc) + lightKey(esc) : '<p class="jv-empty">No country has prospects or emails by sector yet.</p>'}`;
    const gridNote = grid ? `Sectors from the prospect queue. Sent and replies are est.: each campaign split across its synced leads, a lead taking its site's sector from the queue.${grid.more ? ` ${fmt(grid.more)} smaller countries left out.` : ''} Tap a cell for the country.` : '';
    return panel('geo-heat', `Heatmap · ${kind === 'sends' ? 'sends' : 'replies'}${sel ? ' · ' + esc(sel.name) : ''}`, heatBody, { wide: true, keep: true, note: heatNote })
        + panel('geo-sectors', `Sector grid · ${esc((SECTOR_METRICS.find((m) => m[0] === metric) || [])[1] || '')}`, gridBody, {
            wide: true, keep: true, note: gridNote,
            data: grid ? (grid.rows || []).flatMap((r) => grid.list.map((s, n) => ({ cc: r.cc, country: r.name, sector: sectorLabel(s), prospects: r.p[n], sent: r.s[n], replies: r.r[n] }))) : undefined
        });
}
