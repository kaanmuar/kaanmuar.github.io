/*
 * Jarvis Map: 90-day plan progress and next best actions (#3115), from the geo source's `plan` and `actions`
 * (functions/jarvis-geo-actions.js). Each action's button reuses a Map action the page already handles
 * (data-mk-campaign, data-geo-target, data-cal-act, data-geo-cc, data-copy-link, data-run); the two it adds,
 * confirm a Live Report's country and jump to a panel, go through act(). Android twin: ui/GeoActions.kt.
 */
// [chip class, word] per status, as the 90-day targets panel shows them.
export const STATUS = {
    ahead: ['c-fast', 'Ahead'], done: ['c-fast', 'Done'], 'on-track': ['c-average', 'On track'], behind: ['c-slow', 'Behind'],
    waiting: ['', 'Not started'], 'no-data': ['', 'No data']
};
const COLOR = { ahead: '#3dffa8', done: '#3dffa8', 'on-track': '#ffb547', behind: '#ff4d8d', plan: '#38e1ff' };
const LEVEL = { high: 'Now', mid: 'Soon', low: 'Later' };

const inDays = (d) => (d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);
const chip = (status, esc) => { const [cls, word] = STATUS[status] || ['', status]; return `<span class="jv-chip ${cls}">${esc(word)}</span>`; };

/** A progress bar as plain SVG: the share done, and a tick where the pace says it should be by now. */
export function bar(share, pace, status) {
    const w = Math.max(0, Math.min(100, Math.round(share)));
    const tick = pace === null || pace === undefined ? '' : `<line x1="${Math.min(100, Math.max(0, pace))}" x2="${Math.min(100, Math.max(0, pace))}" y1="0" y2="8" class="jv-geo-pace"/>`;
    return `<svg class="jv-geo-bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="8" rx="4" class="jv-geo-bar-bg"/><rect width="${w}" height="8" rx="4" fill="${COLOR[status] || '#5d7a8c'}"/>${tick}</svg>`;
}

const amount = (n, unit, fmt) => (n === null || n === undefined ? '—' : fmt(n) + (unit || ''));

/** The Plan section: day N of the plan, phase, next milestone, nearest deadlines, this week and the 90 days so far. */
export function planBody(p, h) {
    const { esc, fmt } = h;
    const gone = Math.round((Math.min(p.day, p.length) / Math.max(1, p.length)) * 100);
    const row = (r, share, pace) => `<li class="jv-geo-prog is-${esc(r.status)}"><span>${esc(r.label)}</span>${bar(share, pace, r.status)}<b>${amount(r.actual, r.unit, fmt)} <small>of ${amount(r.target, r.unit, fmt)}</small></b>${chip(r.status, esc)}</li>`;
    const week = p.week.map((r) => row(r, r.actual === null || !r.target ? 0 : (r.actual / r.target) * 100, r.unit ? 100 : p.weekShare)).join('');
    const total = p.total.map((r) => row(r, r.actual === null || !r.target ? 0 : (r.actual / r.target) * 100, r.target ? (r.expected / r.target) * 100 : null)).join('');
    const dates = [p.next ? `<li><span class="jv-chip">Milestone</span> <b>${esc(p.next.label)}</b> <span class="jv-note">${esc(h.dayLabel(p.next.date))} · ${inDays(p.next.daysLeft)}</span></li>` : '']
        .concat(p.deadlines.map((d) => `<li><span class="jv-chip ${d.daysLeft <= 3 ? 'c-slow' : d.daysLeft <= 14 ? 'c-average' : ''}">Deadline</span> <b>${esc(d.label)}</b> <span class="jv-note">${esc(h.dayLabel(d.date))} · ${inDays(d.daysLeft)}</span></li>`)).join('');
    return `<div class="jv-geo-plan-head"><b>Day ${fmt(Math.min(p.day, p.length))} of ${fmt(p.length)}</b>${p.phase ? ` · ${esc(p.phase.name)} <span class="jv-note">${p.phase.daysLeft > 0 ? fmt(p.phase.daysLeft) + ' days left in it' : 'ends today'}</span>` : ''} ${chip(p.status, esc)}</div>
        ${bar(gone, null, 'plan')}
        ${dates ? `<ul class="jv-geo-plan-dates">${dates}</ul>` : ''}
        ${week ? `<h4 class="jv-sub">This week · ${fmt(p.weekShare)}% gone</h4><ul class="jv-geo-progs">${week}</ul>` : ''}
        ${total ? `<h4 class="jv-sub">90-day targets so far</h4><ul class="jv-geo-progs">${total}</ul>` : ''}`;
}

/** The button for one action: the existing Map handlers' data attributes, or this module's for confirm and jump. */
export function button(d, esc) {
    const b = (attrs, cls) => `<button type="button" class="jv-btn small${cls || ''}" ${attrs}>${esc(d.label)}</button>`;
    switch (d.type) {
        case 'pause': return b(`data-mk-campaign="pause" data-id="${esc(d.id)}" data-name="${esc(d.name)}" data-leads="${Number(d.leads) || 0}"`, ' is-warn');
        case 'activate': return b(`data-mk-campaign="activate" data-id="${esc(d.id)}" data-name="${esc(d.name)}" data-leads="${Number(d.leads) || 0}" data-start="${esc(d.start || '')}"`);
        case 'target': return b(`data-geo-target="${d.on ? 'on' : 'off'}" data-cc="${esc(d.cc)}"`);
        case 'calendar-pause': return b(`data-cal-act="pause" data-cc="${esc(d.cc)}" data-date="${esc(d.date)}" data-name="${esc(d.name)}"`, ' is-warn');
        case 'open': return b(`data-geo-cc="${esc(d.cc)}"`);
        case 'confirm': return b(`data-geo-next="confirm" data-host="${esc(d.host)}" data-cc="${esc(d.cc)}" data-name="${esc(d.name)}"`);
        case 'jump': return b(`data-geo-next="jump" data-jump="${esc(d.panel)}"`);
        case 'copy': return b(`data-copy-link="${esc(d.copy)}"`);
        case 'link': return `<a class="jv-btn small" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.label)}</a>`;
        case 'run': return b(`data-run="${esc(d.job)}"`);
        default: return '';
    }
}

/** The Next actions section: Gemini's line on top, then each action with its reason and one button. */
export function actionsBody(a, h) {
    const { esc } = h;
    const rows = a.rows || [];
    const list = rows.map((r, n) => `<li class="lv-${esc(r.level)}" data-next-id="${esc(r.id)}"><span class="jv-geo-next-n">${n + 1}</span><div><b>${esc(r.title)}</b><span class="jv-chip">${esc(LEVEL[r.level] || r.level)}</span><p class="jv-note">${esc(r.why)}</p></div>${button(r.do, esc)}</li>`).join('');
    return `${a.line ? `<p class="jv-geo-line"><span aria-hidden="true">✦</span> ${esc(a.line)}</p>` : ''}${list ? `<ol class="jv-geo-next">${list}</ol>` : '<p class="jv-empty">Nothing to do on the map right now.</p>'}`;
}

/** Both sections for the Map tab, after the other collapsible ones. h: { panel, esc, fmt, dayLabel }. */
export function panels(g, h) {
    const p = g.plan;
    const a = g.actions;
    const plan = h.panel('geo-plan', p ? `Plan · day ${h.fmt(Math.min(p.day, p.length))} of ${h.fmt(p.length)}` : 'Plan', p ? planBody(p, h) : '<p class="jv-empty">No 90-day plan uploaded: run node scripts/jarvis-outreach-plan.js with the private plan.</p>', {
        keep: true, note: 'Counts only: the plan text and the prospects stay private. The tick on a bar is where the pace says it should be today; rates are over the range.',
        data: p ? p.week.map((r) => ({ part: 'this week', label: r.label, actual: r.actual, target: r.target, status: r.status })).concat(p.total.map((r) => ({ part: '90 days', label: r.label, actual: r.actual, target: r.target, status: r.status }))) : null
    });
    const ranked = a && a.ranked === 'gemini';
    const next = h.panel('geo-next', `Next actions · ${h.fmt((a && a.rows || []).length)}${a && a.total > (a.rows || []).length ? ' of ' + h.fmt(a.total) : ''}`, a ? actionsBody(a, h) : '<p class="jv-empty">Not loaded.</p>', {
        keep: true, wide: true,
        note: ranked ? `Ranked by Gemini ${h.esc(String(a.at || '').slice(11, 16))} UTC from the rules' list. Each button does what the country sheet does.`
            : 'In the rules\' order: holidays soon, bounces and empty queues first. Gemini ranks them within the hour when they change. Each button does what the country sheet does.',
        data: a ? (a.rows || []).map((r, n) => ({ rank: n + 1, action: r.title, why: r.why, country: r.cc, button: r.do.label })) : null
    });
    return plan + next;
}

/** Confirm a Live Report's country, or jump to a panel. d: { call, toast, confirmRun, loadExternal, $ }. */
export async function act(t, d) {
    if (t.dataset.geoNext === 'jump') {
        const at = d.$(`[data-panel-id="${t.dataset.jump}"]`);
        if (at) at.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
    }
    const { host, cc, name } = t.dataset;
    if (!d.confirmRun(`set ${host}'s Live Report country to ${name}`)) return;
    t.disabled = true;
    const out = await d.call('geo-country-confirm', { host, cc }).catch((error) => ({ ok: false, error: error.message }));
    d.toast(out.ok ? `${host}: ${out.name}. The next daily Live Reports run updates its pages.` : 'Not saved: ' + out.error, 6000);
    if (out.ok) d.loadExternal(['geo']); else t.disabled = false;
}

/** The plan and the next actions for Ask, the twin of askOf in functions/jarvis-geo-actions.js. */
export function askOf(g) {
    if (!g || g.ok === false || (!g.plan && !g.actions)) return null;
    const p = g.plan;
    const a = g.actions || {};
    return {
        plan: p ? {
            day: p.day, length: p.length, status: p.status, phase: p.phase && p.phase.name, next: p.next && p.next.label + ' ' + inDays(p.next.daysLeft),
            deadlines: p.deadlines.map((x) => x.label + ' ' + inDays(x.daysLeft)),
            thisWeek: p.week.map((w) => w.label + ': ' + (w.actual === null ? '—' : w.actual + w.unit) + ' of ' + w.target + w.unit + ', ' + w.status),
            toDate: p.total.map((t) => t.label + ': ' + (t.actual === null ? '—' : t.actual) + ' of ' + t.target + ', ' + t.status)
        } : null,
        nextActions: (a.rows || []).slice(0, 8).map((r) => r.title + ': ' + r.why), line: a.line || null, rankedBy: a.ranked || null
    };
}
