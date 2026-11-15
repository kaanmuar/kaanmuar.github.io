/*
 * Jarvis's live Processes panel (#2548): the snapshot's `processes` section (functions/jarvis-processes.js), what runs
 * now, waits on Carlos or ended in the last day. A processes push fetches the one-read `processes` op and redraws
 * only this panel; the clocks tick here every second. The Android app's twin is android/.../ui/Processes.kt.
 */
export const ACTIVE = ['queued', 'running', 'waiting'];
export const KINDS = { agent: 'Cursor agent', 'mac-agent': 'Mac agent', workflow: 'Workflow', deploy: 'Deploy', 'review-run': 'URL review', desk: 'Review desk', cube: 'Cube run', job: 'Scheduled job' };
export const STATES = { queued: 'Queued', running: 'Running', waiting: 'Waiting', done: 'Done', failed: 'Failed', cancelled: 'Cancelled' };

const rowsOf = (p) => (p && Array.isArray(p.rows) ? p.rows : []);
export const active = (p) => rowsOf(p).filter((r) => ACTIVE.includes(r.state));
export const recent = (p) => rowsOf(p).filter((r) => !ACTIVE.includes(r.state));

/** "2 running · 1 needs you", or '' when nothing runs or waits. */
export function summary(p) {
    const running = rowsOf(p).filter((r) => r.state === 'running').length;
    const needs = rowsOf(p).filter((r) => r.needsYou).length;
    return [running ? running + ' running' : '', needs ? needs + ' needs you' : ''].filter(Boolean).join(' · ');
}

/** 42s, 3m 12s, 1h 04m, 2d 3h. */
export function elapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + pad(s % 60) + 's';
    if (s < 86400) return Math.floor(s / 3600) + 'h ' + pad(Math.floor((s % 3600) / 60)) + 'm';
    return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h';
}

const endOf = (r) => Date.parse(r.endedAt || r.updatedAt || '');

/** The time column: the clock of an active row, how long ago a finished one ended. */
export function clock(r, now) {
    if (ACTIVE.includes(r.state)) { const t = Date.parse(r.startedAt || ''); return Number.isFinite(t) ? elapsed(now - t) : ''; }
    const end = endOf(r);
    return Number.isFinite(end) ? elapsed(now - end) + ' ago' : '';
}

/** "took 3m 12s" for a finished row. */
export function took(r) {
    if (ACTIVE.includes(r.state)) return '';
    const start = Date.parse(r.startedAt || '');
    const end = endOf(r);
    return Number.isFinite(start) && Number.isFinite(end) ? 'took ' + elapsed(end - start) : '';
}

const tone = (r) => (r.needsYou ? 'is-needs' : 'is-' + (r.state || 'done'));
const safeUrl = (u) => (/^https:\/\//.test(String(u || '')) ? u : '');

function rowHtml(r, now, esc) {
    const url = safeUrl(r.url);
    const name = url && !r.needsYou ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(r.name)}</a>` : esc(r.name);
    const detail = [r.needsYou ? 'Needs you' : STATES[r.state] || r.state, KINDS[r.kind] || r.kind, r.step, took(r)].filter(Boolean).map(esc).join(' · ');
    const bar = typeof r.progress === 'number' ? `<span class="jv-proc-bar"><i style="width:${Math.round(r.progress * 100)}%"></i></span>` : '';
    const open = r.needsYou && url ? `<a class="jv-btn small jv-proc-open" href="${esc(url)}" target="_blank" rel="noopener">Open</a>` : '';
    const since = ACTIVE.includes(r.state) ? ` data-proc-since="${esc(r.startedAt || '')}"` : ` data-proc-ended="${esc(r.endedAt || r.updatedAt || '')}"`;
    return `<li class="jv-proc ${tone(r)}"><span class="jv-proc-dot" aria-hidden="true"></span><div class="jv-proc-main"><b>${name}</b><small>${detail}</small>${bar}${open}</div><time${since}>${esc(clock(r, now))}</time></li>`;
}

// Finished rows shown before "All N", as in the app.
export const RECENT = 8;

/** The panel body. compact: only what runs or waits, at most three, nothing when none. all: every finished row. */
export function processesHtml(p, now, esc, { compact = false, all = false } = {}) {
    if (!p) return '<p class="jv-empty">Waiting for the first processes from Jarvis…</p>';
    const act = active(p);
    const done = recent(p);
    if (compact) return act.length ? `<ul class="jv-procs">${act.slice(0, 3).map((r) => rowHtml(r, now, esc)).join('')}</ul>${act.length > 3 ? `<p class="jv-note">${act.length - 3} more on Systems.</p>` : ''}` : '';
    const sum = summary(p);
    const head = (sum ? `<p class="jv-proc-sum${active(p).some((r) => r.needsYou) ? ' is-needs' : ''}">${esc(sum)}</p>` : '') + (act.length ? `<ul class="jv-procs">${act.map((r) => rowHtml(r, now, esc)).join('')}</ul>` : '<p class="jv-note">Nothing running now. Jobs, workflows, deploys, reviews, Cube runs and agents show here as they start.</p>');
    const more = done.length > RECENT ? `<button type="button" class="jv-btn small jv-proc-all" data-proc-all>${all ? 'Fewer' : 'All ' + done.length}</button>` : '';
    const tail = done.length ? `<h4 class="jv-proc-head">Last 24 hours</h4><ul class="jv-procs">${done.slice(0, all ? done.length : RECENT).map((r) => rowHtml(r, now, esc)).join('')}</ul>${more}` : '';
    return head + tail;
}

/** Ticks every clock on the page without a redraw. */
export function tick(root, now) {
    root.querySelectorAll('[data-proc-since]').forEach((el) => { const t = Date.parse(el.dataset.procSince); if (Number.isFinite(t)) el.textContent = elapsed(now - t); });
    root.querySelectorAll('[data-proc-ended]').forEach((el) => { const t = Date.parse(el.dataset.procEnded); if (Number.isFinite(t)) el.textContent = elapsed(now - t) + ' ago'; });
}
