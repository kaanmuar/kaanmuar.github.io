/* Jarvis: Admin > Statistics as one command center. admin.html mounts it in #stats-pane after sign-in.

   Firestore (owner rules): site_events, url_review_opens, url_reviews, url_review_alerts, url_review_reports,
   socialHubStats/latest. The jarvis function (functions/jarvis.js) adds what the browser cannot read: server-only
   collections, Cloud Scheduler, GitHub, GA4, Cloudflare, PageSpeed/CrUX, uptime, Gemini, and the owner actions.
   The numbers come from js/admin-jarvis-core.js (window.JarvisCore). */
import { collection, query, where, orderBy, limit, getDocs, getDoc, doc, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const ENDPOINT = 'https://us-central1-carlosm-interactive-cv.cloudfunctions.net/jarvis';
const DESK = 'https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl/desk';
const EVENT_CAP = 6000;
const ROW_CAP = 2000;
const LIVE_MS = 60 * 1000;
const EXTERNAL_MS = 5 * 60 * 1000;
const RANGES = [['1', '24 hours'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['all', 'All time']];
const COLORS = { cyan: '#38e1ff', amber: '#ffb547', pink: '#ff4d8d', green: '#3dffa8', violet: '#a98bff', dim: '#5d7a8c' };
const GA_GROUP = { cv: 'CV site', review: 'QA-lab URL Review' };
const LINKS = [
    ['Open the review desk', DESK], ['Open failed runs', DESK + '/failures'],
    ['Open the GitHub board', 'https://github.com/orgs/carlosandmunoz-hq/projects/1'], ['Open GitHub Actions', 'https://github.com/kaanmuar/kaanmuar.github.io/actions'],
    ['Open GA4', 'https://analytics.google.com/analytics/web/#/p495572902/reports/intelligenthome'], ['Open Search Console', 'https://search.google.com/search-console?resource_id=sc-domain:carlosandmunoz.com'],
    ['Open Cloudflare', 'https://dash.cloudflare.com/'], ['Open the Firebase console', 'https://console.firebase.google.com/project/carlosm-interactive-cv/overview'],
    ['Open Cloud Scheduler', 'https://console.cloud.google.com/cloudscheduler?project=carlosm-interactive-cv'], ['Open function logs', 'https://console.cloud.google.com/logs/query?project=carlosm-interactive-cv']
];

const esc = (value) => String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : esc(n));
const ago = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h'; };
const when = (value) => { const d = window.JarvisCore.toDate(value); return d ? d.toLocaleString('en-US', { timeZone: 'America/Bogota', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };

// --- charts (SVG and HTML, HUD colors) -------------------------------------------------------------------------

function spark(values, color) {
    const v = values && values.length ? values : [0];
    const w = 120, h = 32, max = Math.max(1, ...v);
    const pts = v.map((n, i) => `${(v.length === 1 ? w / 2 : (i / (v.length - 1)) * w).toFixed(1)},${(h - 2 - (n / max) * (h - 6)).toFixed(1)}`);
    return `<svg class="jv-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,${h} ${pts.join(' ')} ${w},${h}" fill="${color}" fill-opacity="0.12" stroke="none"></polyline><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6"></polyline></svg>`;
}

function area(labels, series) {
    if (!labels || !labels.length) return '<p class="jv-empty">No days in this range.</p>';
    const w = 760, h = 220, pad = 30;
    const peakValue = Math.max(1, ...series.flatMap((s) => s.values));
    const raw = peakValue / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const unit = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw));
    const max = Math.ceil(peakValue / unit) * unit;
    const x = (i) => pad + (labels.length === 1 ? (w - pad * 2) / 2 : (i / (labels.length - 1)) * (w - pad * 2));
    const y = (n) => h - pad - (n / max) * (h - pad * 2);
    const grid = Array.from({ length: max / unit + 1 }, (_, k) => k * unit).map((n) => `<line x1="${pad}" x2="${w - pad}" y1="${y(n)}" y2="${y(n)}" class="jv-gridline"></line><text x="${pad - 6}" y="${y(n) + 3}" text-anchor="end" class="jv-axis">${n}</text>`).join('');
    const step = Math.max(1, Math.ceil(labels.length / 8));
    const ticks = labels.map((label, i) => (i % step === 0 || i === labels.length - 1) ? `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" class="jv-axis">${esc(label.slice(5))}</text>` : '').join('');
    const paths = series.map((s, k) => {
        const line = s.values.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
        return `<defs><linearGradient id="jvg${k}${s.color.slice(1)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="0.35"></stop><stop offset="1" stop-color="${s.color}" stop-opacity="0"></stop></linearGradient></defs>
            <polygon points="${x(0)},${h - pad} ${line} ${x(s.values.length - 1)},${h - pad}" fill="url(#jvg${k}${s.color.slice(1)})"></polygon>
            <polyline points="${line}" fill="none" stroke="${s.color}" stroke-width="2.2" class="jv-glow"></polyline>${labels.length < 3 ? s.values.map((n, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(n).toFixed(1)}" r="4" fill="${s.color}"></circle>`).join('') : ''}`;
    }).join('');
    const legend = series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)} ${fmt(s.values.reduce((a, b) => a + b, 0))}</span>`).join('');
    return `<svg class="jv-area" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(series.map((s) => s.name).join(' and '))} per day">${grid}${paths}${ticks}</svg><div class="jv-legend">${legend}</div>`;
}

function bars(list, opts) {
    const o = opts || {};
    const rows = (list || []).slice(0, o.limit || 12);
    if (!rows.length) return `<p class="jv-empty">${esc(o.empty || 'Nothing in this range.')}</p>`;
    const max = Math.max(1, ...rows.map((r) => r.value));
    const total = (list || []).reduce((s, r) => s + r.value, 0);
    const more = (list || []).length - rows.length;
    return `<ol class="jv-bars">${rows.map((r) => `<li title="${esc(r.label)}: ${fmt(r.value)}"><span class="jv-bar-label">${esc(r.label)}</span><span class="jv-bar-track"><span class="jv-bar-fill" style="width:${Math.max(2, (r.value / max) * 100).toFixed(1)}%;--c:${o.color || COLORS.cyan}"></span></span><span class="jv-bar-value">${fmt(r.value)}<small>${total ? Math.round((r.value / total) * 100) + '%' : ''}</small></span></li>`).join('')}</ol>${more > 0 ? `<p class="jv-more">+${more} more in the export</p>` : ''}`;
}

function ring(pct, label, color, size) {
    const r = 40, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, Number(pct) || 0));
    const tone = color || (v >= 90 ? COLORS.green : v >= 50 ? COLORS.amber : COLORS.pink);
    return `<svg class="jv-ring" viewBox="0 0 100 100" width="${size || 96}" height="${size || 96}" role="img" aria-label="${esc(label)} ${pct === null ? 'unknown' : v}">
        <circle cx="50" cy="50" r="${r}" class="jv-ring-track"></circle>
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="${tone}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 50 50)" class="jv-glow"></circle>
        <text x="50" y="52" text-anchor="middle" class="jv-ring-value">${pct === null ? '—' : v}</text><text x="50" y="68" text-anchor="middle" class="jv-ring-label">${esc(label)}</text></svg>`;
}

function funnel(steps) {
    const top = Math.max(1, steps[0] ? steps[0].value : 1);
    return `<div class="jv-funnel">${steps.map((s, i) => `<div class="jv-funnel-step" style="--w:${Math.max(6, (s.value / top) * 100)}%"><span>${esc(s.label)}</span><strong>${fmt(s.value)}</strong>${i ? `<small>${steps[i - 1].value ? Math.round((s.value / steps[i - 1].value) * 100) : 0}% of previous</small>` : ''}</div>`).join('')}</div>`;
}

function heat(grid, peakText) {
    const max = Math.max(1, ...grid.flat());
    const days = window.JarvisCore.WEEKDAYS;
    const hours = Array.from({ length: 24 }, (_, h) => `<span>${h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>`).join('');
    return `<div class="jv-heat" role="img" aria-label="Visits by weekday and hour, Bogota time. Busiest ${esc(peakText)}"><div class="jv-heat-hours"><span></span>${hours}</div>${grid.map((row, d) => `<div class="jv-heat-row"><span>${days[d]}</span>${row.map((n, h) => `<i style="--a:${n ? (0.15 + (n / max) * 0.85).toFixed(2) : 0}" title="${days[d]} ${String(h).padStart(2, '0')}:00 · ${n}"></i>`).join('')}</div>`).join('')}</div><p class="jv-note">Busiest: ${esc(peakText)} · America/Bogota</p>`;
}

function kpis(list) {
    return `<div class="jv-kpis">${list.map((k) => `<div class="jv-kpi${k.alert ? ' is-alert' : ''}"><span>${esc(k.label)}</span><strong>${fmt(k.value)}</strong>${k.delta ? `<em class="${k.dir > 0 ? 'up' : k.dir < 0 ? 'down' : ''}">${esc(k.delta)}${k.prior === undefined ? '' : ` <small>vs ${fmt(k.prior)}</small>`}</em>` : '<em class="flat">&nbsp;</em>'}</div>`).join('')}</div>`;
}

function table(cols, rows, empty) {
    if (!rows || !rows.length) return `<p class="jv-empty">${esc(empty || 'Nothing yet.')}</p>`;
    return `<div class="jv-table-wrap"><table class="jv-table"><thead><tr>${cols.map((c) => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${cols.map((c) => `<td>${c[1](row)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// --- the tool ------------------------------------------------------------------------------------------------

export function mountJarvis({ db, auth, host, getInbox, isTestEmail, endpoint }) {
    const C = window.JarvisCore;
    const api = endpoint || ENDPOINT;
    const S = {
        product: 'overview', range: '30', mail: 'real', live: true, mounted: false, loading: false,
        rows: { events: [], prior: [], opens: [], reviews: [] }, counts: {}, hub: null, alerts: [], reports: [],
        external: {}, pending: {}, summaries: {}, settings: null, goals: [], brief: [], proposals: null, ai: '', aiAt: 0, updatedAt: 0, externalAt: 0, truncated: false,
        panels: new Map(), voice: null, listening: false, timers: []
    };
    readHash();

    host.innerHTML = `
    <div class="jv" data-product="overview">
      <div class="jv-scan" aria-hidden="true"></div>
      <header class="jv-top">
        <button type="button" class="jv-reactor" data-act="systems" title="Readiness: share of checks that pass (jobs, CI, uptime, speed)"><span class="jv-reactor-core"></span><span id="jv-ready">—</span></button>
        <div class="jv-title">
          <span class="jv-eyebrow">J.A.R.V.I.S. · Admin statistics</span>
          <h2 id="jv-hello">Jarvis</h2>
          <p id="jv-status" aria-live="polite">Bringing systems online…</p>
        </div>
        <div class="jv-controls">
          <label class="jv-field">Range<select id="jv-range" data-menu-ready="1">${RANGES.map(([v, l]) => `<option value="${v}"${v === S.range ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <div class="jv-seg" role="group" aria-label="Inbox emails"><button type="button" data-mail="real">Real</button><button type="button" data-mail="test">Tests</button><button type="button" data-mail="all">All</button></div>
          <button type="button" class="jv-btn jv-live" data-act="live" aria-pressed="true" title="Live: new events every minute"><i></i><span id="jv-ago">live</span></button>
          <button type="button" class="jv-btn" data-act="refresh" title="Refresh everything (R)">⟳</button>
          <button type="button" class="jv-btn" data-act="speak" title="Read the briefing aloud">🔊</button>
          <button type="button" class="jv-btn" data-act="listen" title="Talk to Jarvis" aria-pressed="false">🎙</button>
          <button type="button" class="jv-btn jv-k" data-act="palette" title="Command bar (⌘K / Ctrl+K)">⌘K</button>
          <button type="button" class="jv-btn" data-act="settings" title="Goals, thresholds and email (G)">⚙</button>
          <div class="jv-menu"><button type="button" class="jv-btn" data-menu="share">Share ▾</button><div class="jv-menu-list" data-list="share" hidden>
            <button type="button" data-act="copy-link">Copy a link to this view</button><button type="button" data-act="web-share">Share…</button>
            <button type="button" data-act="copy-brief">Copy the briefing</button><button type="button" data-act="email">Email me the briefing</button></div></div>
          <div class="jv-menu"><button type="button" class="jv-btn" data-menu="export">Export ▾</button><div class="jv-menu-list" data-list="export" hidden>
            <button type="button" data-act="export-json">Everything (JSON)</button><button type="button" data-act="export-csv">This product (CSV)</button>
            <button type="button" data-act="export-md">Briefing (Markdown)</button><button type="button" data-act="export-png">This product (PNG)</button></div></div>
          <div class="jv-menu"><button type="button" class="jv-btn" data-menu="print">Print ▾</button><div class="jv-menu-list" data-list="print" hidden>
            <button type="button" data-act="print">This product</button><button type="button" data-act="print-all">Every product</button></div></div>
        </div>
      </header>
      <nav class="jv-tabs" role="tablist" aria-label="Products">${C.PRODUCTS.map((p, i) => `<button type="button" role="tab" data-go="${p.key}" aria-selected="${p.key === S.product}"><span class="jv-tab-key">${i + 1}</span><span class="jv-tab-name">${esc(p.name)}</span><span class="jv-tab-kpi" data-tab-kpi="${p.key}"></span><b class="jv-badge" data-badge="${p.key}" hidden></b></button>`).join('')}</nav>
      <div class="jv-print-head"><strong>Jarvis briefing</strong> · <span data-print-range></span> · generated <span data-print-at></span></div>
      <main id="jv-views">${C.PRODUCTS.map((p) => `<section class="jv-view" data-view="${p.key}" role="tabpanel" aria-label="${esc(p.name)}"${p.key === S.product ? '' : ' hidden'}></section>`).join('')}</main>
      <div class="jv-palette" hidden><div class="jv-palette-box" role="dialog" aria-label="Command bar"><input id="jv-cmd" type="text" placeholder="Type a command, a product, or ask Jarvis anything…" autocomplete="off"><ul id="jv-cmd-list" role="listbox"></ul><p class="jv-note">↑↓ to move · Enter to run · Esc to close · end with ? to ask Gemini</p></div></div>
      <div class="jv-settings" hidden><form class="jv-settings-box" data-settings role="dialog" aria-label="Jarvis settings"></form></div>
      <div class="jv-toast" role="status" hidden></div>
    </div>`;
    const root = host.querySelector('.jv');
    const $ = (sel) => root.querySelector(sel);
    const $$ = (sel) => Array.from(root.querySelectorAll(sel));

    function toast(text, ms) {
        const node = $('.jv-toast');
        node.textContent = text;
        node.hidden = false;
        clearTimeout(toast.t);
        toast.t = setTimeout(() => { node.hidden = true; }, ms || 3200);
    }

    function setStatus(text) { $('#jv-status').textContent = text; }

    // Live tab icon (#1530), the web side of the app's status notification: the readiness ring, and a badge counting alerts and warnings.
    const pageTitle = document.title;
    function tabIcon(ready, alerts, warns) {
        const key = `${ready}|${alerts}|${warns}`;
        if (tabIcon.key === key) return;
        tabIcon.key = key;
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        if (!g) return;
        const color = alerts ? '#ff4d8d' : warns ? '#ffb547' : '#38e1ff';
        g.fillStyle = '#030b12';
        g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
        g.lineWidth = 7;
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(255,255,255,.18)';
        g.beginPath(); g.arc(32, 32, 25, 0, Math.PI * 2); g.stroke();
        if (ready) { g.strokeStyle = color; g.beginPath(); g.arc(32, 32, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(ready, 100) / 100); g.stroke(); }
        const label = ready === null ? '–' : ready >= 100 ? '✓' : String(ready);
        g.fillStyle = '#fff';
        g.font = `bold ${label.length > 1 ? 24 : 28}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, 32, 34);
        const n = alerts + warns;
        if (n) {
            g.fillStyle = color;
            g.beginPath(); g.arc(50, 14, 13, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#030b12';
            g.font = 'bold 17px system-ui, sans-serif';
            g.fillText(n > 9 ? '9+' : String(n), 50, 15);
        }
        let link = document.querySelector('link[data-jv-icon]');
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; link.dataset.jvIcon = ''; document.head.append(link); }
        link.href = c.toDataURL('image/png');
        document.title = (n ? `(${n}) ` : '') + (ready === null ? '' : `${ready}% · `) + pageTitle;
    }

    function greet() {
        const hour = C.zoneParts(new Date()).hour;
        $('#jv-hello').textContent = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ', Carlos';
    }

    function readHash() {
        const m = /^#stats(?:\/([a-z]+))?(?:\/([a-z0-9]+))?/.exec(location.hash || '');
        if (!m) return;
        if (m[1] && C.PRODUCTS.some((p) => p.key === m[1])) S.product = m[1];
        if (m[2] && RANGES.some(([v]) => v === m[2])) S.range = m[2];
    }

    function writeHash() {
        const next = `#stats/${S.product}/${S.range}`;
        if (location.hash !== next) history.replaceState(null, '', next);
    }

    // --- data -------------------------------------------------------------------------------------------------

    const rowsOf = (snap) => snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    const newest = (rows, field) => rows.reduce((best, row) => { const d = C.toDate(row[field]); return d && (!best || d > best) ? d : best; }, null);

    async function loadFirestore() {
        const w = C.windowFor(S.range);
        S.window = w;
        const from = w.prior ? w.prior.start : w.start;
        const q = (name, field, value, cap) => getDocs(query(collection(db, name), where(field, '>=', value), orderBy(field, 'desc'), limit(cap)));
        const countOf = async (name, field, a, b) => {
            try {
                const parts = [where(field, '>=', a)].concat(b ? [where(field, '<', b)] : []);
                return (await getCountFromServer(query(collection(db, name), ...parts))).data().count;
            } catch (error) { return null; }
        };
        const safe = (p, fallback) => p.catch(() => fallback);
        const [events, opens, reviews, hub, alerts, reports, openTotal, reviewTotal, priorOpens, priorReviews] = await Promise.all([
            safe(q('site_events', 'createdAt', from, EVENT_CAP).then(rowsOf), []),
            safe(q('url_review_opens', 'createdAt', w.start, ROW_CAP).then(rowsOf), []),
            safe(q('url_reviews', 'createdAt', w.start.toISOString(), ROW_CAP).then(rowsOf), []),
            safe(getDoc(doc(db, 'socialHubStats', 'latest')).then((s) => (s.exists() ? s.data() : null)), null),
            safe(q('url_review_alerts', 'at', w.start.toISOString(), 200).then(rowsOf), []),
            safe(getDocs(query(collection(db, 'url_review_reports'), orderBy('emailedAt', 'desc'), limit(12))).then(rowsOf), []),
            countOf('url_review_opens', 'createdAt', w.start),
            countOf('url_reviews', 'createdAt', w.start.toISOString()),
            w.prior ? countOf('url_review_opens', 'createdAt', w.prior.start, w.prior.end) : null,
            w.prior ? countOf('url_reviews', 'createdAt', w.prior.start.toISOString(), w.prior.end.toISOString()) : null
        ]);
        const inRange = (row) => { const d = C.toDate(row.createdAt); return d && d >= w.start; };
        S.rows = { events: events.filter(inRange), prior: w.prior ? events.filter((row) => !inRange(row)) : null, opens, reviews };
        S.truncated = events.length >= EVENT_CAP;
        S.counts = { openTotal, reviewTotal, priorOpens, priorReviews };
        S.hub = hub;
        S.alerts = alerts;
        S.reports = reports;
        S.updatedAt = Date.now();
    }

    // Live: only rows newer than the newest one already held, so a refresh costs a handful of reads.
    async function loadNewer() {
        const w = S.window;
        if (!w) return;
        const after = async (name, field, since, asString) => {
            if (!since) return [];
            try { return rowsOf(await getDocs(query(collection(db, name), where(field, '>', asString ? since.toISOString() : since), orderBy(field, 'desc'), limit(500)))); } catch (error) { return []; }
        };
        const [events, opens, reviews] = await Promise.all([
            after('site_events', 'createdAt', newest(S.rows.events, 'createdAt') || w.start),
            after('url_review_opens', 'createdAt', newest(S.rows.opens, 'createdAt') || w.start),
            after('url_reviews', 'createdAt', newest(S.rows.reviews, 'createdAt') || w.start, true)
        ]);
        const known = (list) => new Set(list.map((row) => row.id));
        const add = (list, fresh) => { const ids = known(list); return fresh.filter((row) => !ids.has(row.id)).concat(list); };
        const before = S.rows.events.length + S.rows.opens.length + S.rows.reviews.length;
        S.rows.events = add(S.rows.events, events);
        const newOpens = opens.filter((row) => !known(S.rows.opens).has(row.id)).length;
        const newReviews = reviews.filter((row) => !known(S.rows.reviews).has(row.id)).length;
        S.rows.opens = add(S.rows.opens, opens);
        S.rows.reviews = add(S.rows.reviews, reviews);
        if (S.counts.openTotal !== null && S.counts.openTotal !== undefined) S.counts.openTotal += newOpens;
        if (S.counts.reviewTotal !== null && S.counts.reviewTotal !== undefined) S.counts.reviewTotal += newReviews;
        S.updatedAt = Date.now();
        const added = S.rows.events.length + S.rows.opens.length + S.rows.reviews.length - before;
        if (added > 0) { compute(); render(); pulse(added); }
    }

    async function call(op, extra) {
        const user = auth.currentUser;
        if (!user) throw new Error('Sign in first.');
        const token = await user.getIdToken();
        const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(Object.assign({ op, days: S.range === 'all' ? 365 : Number(S.range) }, extra || {})) });
        const data = await res.json().catch(() => ({ ok: false, error: 'No answer (' + res.status + ')' }));
        if (!res.ok && data.ok !== false) data.ok = false;
        return data;
    }

    async function loadExternal(ops) {
        const list = ops || ['settings', 'goals', 'health', 'jobs', 'github', 'uptime', 'ga4', 'cloudflare', 'speed', 'money', 'email', 'search', 'social', 'safety', 'platform', 'outreach', 'actions', 'notices', 'social-proposals', 'social-runs'];
        await Promise.all(list.map(async (op) => {
            S.pending[op] = true;
            try {
                const out = await call(op);
                if (op === 'settings') { if (out.ok) S.settings = out; } else if (op === 'goals') { if (out.ok) S.goals = out.goals || []; } else S.external[op] = out;
            } catch (error) { if (op !== 'settings' && op !== 'goals') S.external[op] = { ok: false, error: error.message }; }
            S.pending[op] = false;
            compute();
            render();
        }));
        S.externalAt = Date.now();
    }

    // --- numbers -------------------------------------------------------------------------------------------

    function compute() {
        const w = S.window || C.windowFor(S.range);
        const keep = (email) => {
            if (S.mail === 'all' || !isTestEmail) return true;
            const test = isTestEmail(email);
            return S.mail === 'test' ? test : !test;
        };
        const inbox = getInbox ? getInbox() : { messages: [], ratings: [] };
        const sum = {};
        sum.inbox = C.summarizeInbox(inbox.messages || [], inbox.ratings || [], w, w.prior, keep);
        ['cv', 'studio', 'lab'].forEach((key) => { sum[key] = C.summarizeSite(key, S.rows.events, S.rows.prior, w); });
        sum.review = C.summarizeReview({
            opens: S.rows.opens, reviews: S.rows.reviews, events: S.rows.events,
            openTotal: S.counts.openTotal === null ? undefined : S.counts.openTotal,
            reviewTotal: S.counts.reviewTotal === null ? undefined : S.counts.reviewTotal,
            prior: S.counts.priorOpens === null || S.counts.priorOpens === undefined ? null : { opens: S.counts.priorOpens, reviews: S.counts.priorReviews }
        }, w);
        sum.hub = C.summarizeHub(S.hub, S.rows.events, w);
        S.summaries = sum;
        S.brief = C.briefing({ products: sum, external: S.external, thresholds: (S.settings || {}).thresholds, goals: S.goals });
    }

    function snapshot() {
        const p = {};
        C.PRODUCTS.forEach((row) => {
            const s = S.summaries[row.key];
            if (!s) return;
            p[row.key] = { name: row.name, kpis: (s.kpis || []).map((k) => ({ label: k.label, value: k.value, delta: k.delta })), top: Object.keys(s.lists || {}).reduce((out, key) => { out[key] = (s.lists[key] || []).slice(0, 5); return out; }, {}) };
        });
        const e = S.external;
        return {
            range: (RANGES.find(([v]) => v === S.range) || [])[1], generatedAt: new Date().toISOString(), products: p,
            briefing: S.brief.map((b) => `[${b.level}] ${b.text}`),
            external: {
                readiness: C.readiness(e),
                jobs: e.jobs && e.jobs.jobs ? e.jobs.jobs.map((j) => ({ name: j.name, ok: j.ok, last: j.lastAttempt })) : null,
                ci: e.github && e.github.ci, openBugs: e.github && e.github.openBugs, merged: e.github && e.github.merged && e.github.merged.total,
                failures: e.health && e.health.failures && { total: e.health.failures.total, causes: e.health.failures.causes },
                speed: e.speed && e.speed.pages && e.speed.pages.map((x) => ({ page: x.name, score: x.score })),
                uptime: e.uptime && e.uptime.pages && e.uptime.pages.map((x) => ({ page: x.name, status: x.status, ms: x.ms })),
                ga4: e.ga4 && e.ga4.groups, cloudflare: e.cloudflare && e.cloudflare.ok ? { requests: e.cloudflare.requests, threats: e.cloudflare.threats, cacheRatio: e.cloudflare.cacheRatio, statuses: e.cloudflare.statuses, paths: (e.cloudflare.paths || []).slice(0, 8) } : null,
                money: e.money && e.money.ok ? { revenue: e.money.revenue, prior: e.money.prior, refundsUsd: e.money.refundsUsd, disputesOpen: e.money.paypal && e.money.paypal.disputesOpen } : null,
                email: e.email && e.email.ok ? { totals: e.email.totals, rates: e.email.rates } : null,
                search: e.search && e.search.ok ? { brave: e.search.brave && e.search.brave.queries, console: e.search.console && e.search.console.ok ? { clicks: e.search.console.clicks, impressions: e.search.console.impressions, position: e.search.console.position, queries: (e.search.console.queries || []).slice(0, 8) } : null } : null,
                social: e.social && e.social.ok ? { sent: e.social.sent, failed: e.social.failed, channels: e.social.channels, youtubeViews: e.social.youtube && e.social.youtube.views } : null,
                safety: e.safety && e.safety.ok ? e.safety.checks.map((c) => `${c.level}: ${c.name} ${c.detail}`) : null,
                platform: e.platform && e.platform.ok ? { functions: e.platform.functions && { executions: e.platform.functions.executions, failures: e.platform.functions.failures, byFunction: e.platform.functions.byFunction }, gemini: e.platform.gemini, firestore: e.platform.firestore, users: e.platform.users } : null,
                outreach: e.outreach && e.outreach.ok ? {
                    pipeline: e.outreach.pipeline && e.outreach.pipeline.ok ? { queued: e.outreach.pipeline.queued, swept: e.outreach.pipeline.swept, reviews: e.outreach.pipeline.reviews, thisWeek: e.outreach.pipeline.thisWeek, withLiveReport: e.outreach.pipeline.withLiveReport, bySegment: e.outreach.pipeline.bySegment } : null,
                    instantly: e.outreach.instantly && e.outreach.instantly.ok ? { campaigns: e.outreach.instantly.status, sent: e.outreach.instantly.sent, rates: e.outreach.instantly.rates, replies: e.outreach.instantly.replies, interested: e.outreach.instantly.interested, meetings: e.outreach.instantly.meetings, warmup: (e.outreach.instantly.accounts || []).map((a) => a.score) } : null,
                    plan: e.outreach.plan && e.outreach.plan.ok !== false ? { day: e.outreach.plan.day, length: e.outreach.plan.length, phase: e.outreach.plan.phase, next: e.outreach.plan.next, weekly: e.outreach.plan.weekly, targets: e.outreach.plan.targets } : null,
                    visits: C.outreachVisits(S.rows.events).total
                } : null,
                waiting: C.connections(e).filter((c) => c.needs.length).map((c) => c.name + ': ' + c.needs.join(' '))
            }
        };
    }

    function briefText(product) {
        const list = S.brief.filter((b) => !product || product === 'overview' || b.product === product);
        return list.length ? list.map((b) => '• ' + b.text).join('\n') : 'All quiet. Nothing needs you right now.';
    }

    // --- render --------------------------------------------------------------------------------------------

    function panel(id, title, body, opts) {
        const o = opts || {};
        if (o.data) S.panels.set(id, { title, rows: o.data, product: S.product });
        const tools = o.data ? `<span class="jv-panel-tools"><button type="button" data-panel-export="csv" data-panel="${id}" title="CSV">CSV</button><button type="button" data-panel-export="json" data-panel="${id}" title="JSON">JSON</button><button type="button" data-panel-export="png" data-panel="${id}" title="PNG">PNG</button></span>` : '';
        return `<section class="jv-panel${o.wide ? ' is-wide' : ''}${o.tall ? ' is-tall' : ''}" data-panel-id="${id}"><header><h3>${esc(title)}</h3>${tools}</header>${body}${o.note ? `<p class="jv-note">${o.note}</p>` : ''}</section>`;
    }

    const ACTION_LABELS = { 'rerun-held': 'send held re-runs', 'resend-notices': 're-send failed notices', 'publish-hub': 'publish the hub', 'run-job': 'run a job again' };
    const ACTION_CAPS = { 'rerun-held': 10, 'resend-notices': 10, 'publish-hub': 2 };

    function proposalsPanel() {
        const P = S.proposals || {};
        const list = P.proposals || (P.rules || []).slice(0, 5);
        const state = P.loading ? 'Gemini is ranking…' : P.gemini ? `Ranked by Gemini · ${when(P.at)}` : P.error ? 'Rules only. Gemini: ' + P.error : P.at ? 'Rules only' : '';
        const items = list.length ? list.map((p, i) => `<li class="jv-prop lv-${esc(p.level)}"><span class="jv-prop-rank">${i + 1}</span><div class="jv-prop-body">
            <p class="jv-prop-title"><strong>${esc(p.title)}</strong> <span class="jv-chip">impact ${esc(p.impact)}/5</span>${p.effort ? ` <span class="jv-chip">${esc(p.effort)}</span>` : ''}${p.source === 'gemini' ? ' <span class="jv-chip c-average">from Gemini</span>' : ''}</p>
            ${p.why ? `<p class="jv-prop-why">${esc(p.why)}</p>` : ''}<ul class="jv-prop-ev">${(p.evidence || []).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
            <div class="jv-prop-acts">${p.tab && p.tab !== 'overview' ? `<button type="button" data-go="${esc(p.tab)}">Open ${esc((C.PRODUCTS.find((x) => x.key === p.tab) || {}).name || p.tab)} →</button>` : ''}${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">Open ↗</a>` : ''}${p.action ? `<span class="jv-prop-safe" data-action="${esc(p.action)}">${autoOn() ? 'Jarvis runs this on its own' : 'Safe action'}</span><button type="button" data-run-action="${esc(p.action)}" data-key="${esc(p.key)}">Run now: ${esc(ACTION_LABELS[p.action] || p.action)}</button>` : ''}${(p.jobs || []).map((j) => `<button type="button" data-run-action="run-job" data-job="${esc(j)}" data-key="${esc(p.key)}">Run ${esc(j)} again</button>`).join('')}
            <button type="button" data-proposal="done" data-key="${esc(p.key)}">Done</button><button type="button" data-proposal="dismissed" data-key="${esc(p.key)}">Dismiss</button></div></div></li>`).join('')
            : `<li class="jv-prop lv-good"><span class="jv-prop-rank">✓</span><div class="jv-prop-body"><p>${P.loading || !S.externalAt ? 'Jarvis is reading the sources…' : 'Nothing to propose right now.'}</p></div></li>`;
        return panel('overview-proposals', 'Proposals', `<p class="jv-note">${esc(state)}${P.hidden ? ` · ${P.hidden} hidden as done or dismissed` : ''}${P.loading ? '' : ' <button type="button" class="jv-link" data-act="proposals">Rank again</button>'}</p><ol class="jv-props">${items}</ol>`,
            { wide: true, data: list.map((p, i) => ({ rank: i + 1, title: p.title, impact: p.impact, effort: p.effort || '', evidence: (p.evidence || []).join(' | '), source: p.source, action: p.action || '' })) });
    }

    const autoOn = () => !S.settings || !S.settings.actions || S.settings.actions.auto !== false;

    function actionsPanel() {
        const a = S.external.actions;
        if (!a || !a.ok) return panel('systems-actions', 'Jarvis actions', `<p class="jv-empty">${S.pending.actions ? 'Reading the actions log…' : esc((a && a.error) || 'Not loaded.')}</p>`, { wide: true });
        const caps = (a.settings && a.settings.caps) || ACTION_CAPS;
        const usage = Object.keys(ACTION_CAPS).map((k) => `<span class="jv-chip${a.used[k] >= caps[k] ? ' c-average' : ''}">${esc(ACTION_LABELS[k])}: ${fmt(a.used[k] || 0)} of ${fmt(caps[k])} today</span>`).join('');
        const p = a.pending || {};
        const waiting = `<ul class="jv-facts"><li>Held re-runs: <b>${fmt(p.held || 0)}</b> (${fmt(p.clean || 0)} clean, Jarvis sends those on its own)</li><li>Failed owner notices: <b>${fmt(p.notices || 0)}</b>${a.noticesLive ? (a.noticeHours ? '' : ' · outside Monday-Saturday 08:00-19:00 Bogotá') : ' · owner notices are off (OWNER_NOTICES_LIVE)'}</li></ul>`;
        const buttons = `<div class="jv-actions">${['rerun-held', 'resend-notices', 'publish-hub'].map((k) => `<button type="button" class="jv-btn small" data-run-action="${k}">Run now: ${esc(ACTION_LABELS[k])}</button>`).join('')}</div>`;
        const rows = a.actions || [];
        const log = table([['When', (r) => esc(when(r.at))], ['Action', (r) => esc(ACTION_LABELS[r.action] || r.action)], ['How', (r) => `<span class="jv-chip">${r.mode === 'auto' ? 'on its own' : 'clicked'}</span>`], ['Result', (r) => `<span class="jv-chip ${r.status === 'done' ? 'c-fast' : r.status === 'failed' ? 'c-slow' : 'c-average'}">${esc(r.status)}</span>`], ['Target', (r) => esc(r.target)], ['Detail', (r) => esc(r.detail)]], rows.slice(0, 30), 'Nothing yet.');
        return panel('systems-actions', `Jarvis actions${a.settings && a.settings.auto === false ? ' (automatic runs off)' : ''}`, `<p>${usage}</p>${waiting}${buttons}${log}`,
            { wide: true, data: rows, note: 'Every hour Jarvis runs the safe actions within these caps; anything over a cap or outside the rules waits for Run now. Caps and the switch are in ⚙ Settings.' });
    }

    function listPanel(key, id, title, list, opts) {
        return panel(key + '-' + id, title, bars(list, opts), Object.assign({ data: (list || []).map((r) => ({ label: r.label, value: r.value })) }, opts || {}));
    }

    function briefPanel(product) {
        const list = S.brief.filter((b) => product === 'overview' || b.product === product);
        const items = list.length ? list.map((b) => `<li class="lv-${b.level}"><b>${b.level}</b><span>${esc(b.text)}</span>${product === 'overview' && b.product !== 'overview' ? `<button type="button" data-go="${b.product}">${esc((C.PRODUCTS.find((p) => p.key === b.product) || {}).name || b.product)} →</button>` : ''}</li>`).join('') : '<li class="lv-good"><b>clear</b><span>All quiet. Nothing needs you right now.</span></li>';
        return `<section class="jv-panel is-wide jv-briefing"><header><h3>Briefing</h3><span class="jv-panel-tools"><button type="button" data-act="speak">Read aloud</button><button type="button" data-act="ai-brief">Gemini briefing</button></span></header><ul class="jv-brief">${items}</ul>
            <div class="jv-ai"${S.ai ? '' : ' hidden'}><span class="jv-eyebrow">Gemini · ${S.aiAt ? when(S.aiAt) : ''}</span><div class="jv-ai-text">${esc(S.ai).replace(/\n/g, '<br>')}</div></div>
            <form class="jv-ask" data-ask><input type="text" name="q" placeholder="Ask Jarvis: why did opens jump? which source pays? what should I fix first?" aria-label="Ask Jarvis"><button type="submit" class="jv-btn">Ask</button></form></section>`;
    }

    function goalRow(g) {
        const fill = Math.min(100, g.pct);
        const tone = g.status === 'done' ? 'is-done' : g.status === 'on-track' ? 'is-on' : g.status === 'behind' ? 'is-behind' : 'is-far';
        const word = { done: 'met', 'on-track': 'on track', behind: 'behind', 'far-behind': 'far behind' }[g.status];
        return `<li class="jv-goal ${tone}"><div class="jv-goal-head"><span>${esc(g.label)}</span><b>${fmt(g.value)} / ${fmt(g.target)}</b></div>
            <div class="jv-goal-bar" title="${g.elapsed}% of the period gone"><i style="width:${fill}%"></i><s style="left:${Math.min(100, g.elapsed)}%"></s></div>
            <small>${g.pct}% · ${word}${g.status !== 'done' ? ` · pace ${fmt(g.projected)}` : ''}${g.error ? ` · <em>${esc(g.error)}</em>` : ''}</small></li>`;
    }

    function goalsPanel(product) {
        const list = S.goals.filter((g) => product === 'overview' || g.product === product);
        if (!list.length && product !== 'overview') return '';
        const body = list.length ? `<ul class="jv-goals">${list.map(goalRow).join('')}</ul>` : `<p class="jv-empty">No goals yet.</p><div class="jv-actions"><button type="button" class="jv-btn" data-act="settings">Set goals</button></div>`;
        return panel(product + '-goals', 'Goals', body, { data: list.map((g) => ({ goal: g.label, value: g.value, target: g.target, pct: g.pct, status: g.status, pace: g.projected })), note: list.length ? 'The marker shows how much of the period has gone.' : '' });
    }

    function tileGoal(product) {
        const g = S.goals.find((x) => x.product === product);
        return g ? `<span class="jv-tile-goal" title="${esc(g.label)}: ${g.pct}%"><i class="${g.status}" style="width:${Math.min(100, g.pct)}%"></i></span>` : '';
    }

    function speedCard(product) {
        const sp = S.external.speed;
        const up = S.external.uptime;
        const page = sp && sp.pages ? sp.pages.find((x) => x.product === product) : null;
        const live = up && up.pages ? up.pages.find((x) => x.product === product) : null;
        if (!page && !live) return panel(product + '-speed', 'Speed and uptime', `<p class="jv-empty">${S.pending.speed || S.pending.uptime ? 'Jarvis is measuring the page…' : 'Not measured yet.'}</p>`);
        const field = page && page.field ? ['lcp', 'inp', 'cls'].filter((k) => page.field[k]).map((k) => `<span class="jv-chip c-${esc((page.field[k].category || '').toLowerCase())}">${k.toUpperCase()} ${esc(page.field[k].p75)}</span>`).join('') : '';
        return panel(product + '-speed', 'Speed and uptime', `<div class="jv-speed">${page && page.ok ? ring(page.score, 'mobile') : ring(null, 'mobile')}<div><p>${live ? `<span class="jv-chip ${live.ok ? 'c-fast' : 'c-slow'}">HTTP ${esc(live.status)}</span> <span class="jv-chip">${fmt(live.ms)} ms</span>` : ''}</p><p>${field || '<span class="jv-note">No field data from CrUX for this page.</span>'}</p>${page && page.lab ? `<p class="jv-note">Lab: LCP ${esc(page.lab.lcp)} · TBT ${esc(page.lab.tbt)} · CLS ${esc(page.lab.cls)}</p>` : ''}<p><a href="https://pagespeed.web.dev/analysis?url=${encodeURIComponent((page || live).url)}" target="_blank" rel="noopener">Open in PageSpeed →</a></p></div></div>`, { data: page ? [{ page: page.name, score: page.score, status: live && live.status, ms: live && live.ms }] : null });
    }

    function gaCard(product) {
        const ga = S.external.ga4;
        const group = GA_GROUP[product];
        if (!group) return '';
        const row = ga && ga.groups ? ga.groups.find((g) => g.group === group) : null;
        const body = row ? kpis([
            { label: 'GA4 sessions', value: row.sessions, prior: row.priorSessions, delta: C.delta(row.sessions, row.priorSessions).text, dir: C.delta(row.sessions, row.priorSessions).dir },
            { label: 'Users', value: row.users, prior: row.priorUsers, delta: C.delta(row.users, row.priorUsers).text, dir: C.delta(row.users, row.priorUsers).dir },
            { label: 'Engagement', value: row.engagement + '%' },
            { label: 'Avg session', value: row.duration + 's' }
        ]) : `<p class="jv-empty">${S.pending.ga4 ? 'Reading GA4…' : ga && ga.ok === false ? esc(ga.error) : 'No GA4 rows for this group.'}</p>`;
        return panel(product + '-ga4', `GA4 · ${group}`, body, { note: 'GA4 only counts visitors who allowed analytics.', data: row ? [row] : null });
    }

    function siteView(key) {
        const s = S.summaries[key];
        const L = s.lists;
        const name = (C.PRODUCTS.find((p) => p.key === key) || {}).name;
        return kpis(s.kpis) + `<div class="jv-grid">${briefPanel(key)}${goalsPanel(key)}
            ${panel(key + '-trend', name + ' visits per day', area(s.series.labels, [{ name: 'Visits', values: s.series.values, color: COLORS.cyan }]), { wide: true, data: s.series.labels.map((d, i) => ({ day: d, visits: s.series.values[i] })) })}
            ${panel(key + '-heat', 'When they come', heat(s.heatmap, s.peak), { wide: true })}
            ${speedCard(key)}${gaCard(key)}
            ${listPanel(key, 'sources', 'Sources', L.sources)}${listPanel(key, 'actions', 'Actions', L.actions, { color: COLORS.amber })}
            ${listPanel(key, 'exports', key === 'cv' ? 'Exports' : 'Reports', L.exports, { color: COLORS.green })}
            ${key === 'cv' ? listPanel(key, 'links', 'Tracked link opens (cvref)', L.links, { color: COLORS.violet }) : ''}
            ${listPanel(key, 'pages', 'Pages', L.pages)}${listPanel(key, 'langs', 'Languages', L.langs)}
            ${listPanel(key, 'countries', 'Countries', L.countries, { empty: 'Only server-side CV visits carry a country.' })}${listPanel(key, 'cities', 'Cities', L.cities)}
            ${listPanel(key, 'screens', 'Screens', L.screens)}${listPanel(key, 'zones', 'Time zones', L.zones)}
        </div>`;
    }

    const STATE_CHIP = { live: 'c-fast', partial: 'c-average', down: 'c-slow', loading: '', off: '' };
    const LEVEL_CHIP = { good: 'c-fast', info: '', warn: 'c-average', alert: 'c-slow' };
    const SOCIAL = /linkedin|facebook|youtube|tiktok|instagram|threads|twitter|\bx\b|t\.co|buffer|reddit/i;

    function waiting(key, text) {
        const x = S.external[key];
        return `<p class="jv-empty">${S.pending[key] && !x ? esc(text) : esc((x && x.error) || 'Not loaded.')}</p>`;
    }

    function needList(x) {
        return x && x.needs && x.needs.length ? `<ul class="jv-needs">${x.needs.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
    }

    function connectionsPanel() {
        const rows = C.connections(S.external, S.pending);
        const live = rows.filter((r) => r.state === 'live').length;
        return panel('systems-connections', `Connections (${live} of ${rows.length} live)`, table([
            ['Source', (r) => esc(r.name)],
            ['State', (r) => `<span class="jv-chip ${STATE_CHIP[r.state]}">${esc(r.state)}</span>`],
            ['What to do', (r) => r.needs.length ? r.needs.map((n) => esc(n)).join('<br>') : esc(r.detail)],
            ['Updated', (r) => `<span class="jv-nowrap">${esc(r.at ? when(r.at) : '')}</span>`]
        ], rows), { wide: true, data: rows.map((r) => ({ source: r.name, state: r.state, needs: r.needs.join(' | '), error: r.detail })), note: 'Partial: the source works but part of it waits for a one-time grant.' });
    }

    function safetyPanel() {
        const s = S.external.safety;
        return panel('systems-safety', 'Safety and mail setup', s && s.ok ? table([
            ['Check', (c) => esc(c.name)], ['', (c) => `<span class="jv-chip ${LEVEL_CHIP[c.level]}">${esc(c.level)}</span>`], ['Detail', (c) => esc(c.detail)]
        ], s.checks) : waiting('safety', 'Checking Web Risk, DNS and the domain…'), { data: s && s.checks });
    }

    function costsBlock(c) {
        if (!c || c.error) return c && c.error ? `<p class="jv-note">Costs: ${esc(c.error)}</p>` : '';
        if (c.pending) return `<p class="jv-note">${esc(c.note)}</p>`;
        if (!c.byService) return '';
        return `<h4 class="jv-sub">Cloud spend, last ${fmt(c.days)} days: ${fmt(c.net)} ${esc(c.currency)} after credits (${fmt(c.gross)} before)</h4>` + bars(c.byService.filter((s) => s.value > 0), { color: COLORS.amber, empty: 'Nothing billed after credits.' });
    }

    function platformPanel() {
        const p = S.external.platform;
        if (!p || !p.ok) return panel('systems-platform', 'Google Cloud', waiting('platform', 'Reading Monitoring and Logging…'));
        const f = p.functions || {}, g = p.gemini || {}, fs = p.firestore || {}, u = p.users || {};
        const th = C.thresholds((S.settings || {}).thresholds);
        return panel('systems-platform', 'Google Cloud, last 24 hours', kpis([
            { label: 'Function runs', value: f.executions === undefined ? '—' : f.executions },
            { label: 'Real failures', value: f.failures === undefined ? '—' : f.failures, alert: f.failures >= th.fnFailures },
            { label: 'Gemini ok (7 days)', value: g.requests ? g.ok + ' / ' + g.requests : '—', alert: g.requests >= 10 && g.errorRate >= th.geminiErrorPct },
            { label: 'Firestore reads', value: fs.reads === undefined ? '—' : fs.reads, delta: fs.readsFreePct === undefined ? '' : fs.readsFreePct + '% of free', alert: fs.readsFreePct >= th.firestoreFreePct },
            { label: 'Firestore writes', value: fs.writes === undefined ? '—' : fs.writes },
            { label: 'New sign-in accounts', value: u && u.newInRange !== undefined ? u.newInRange : '—' }
        ]) + bars(f.byFunction, { color: COLORS.pink, empty: 'No crashes, timeouts or 5xx answers in 24 hours.' }) + (g.failedMethods && g.failedMethods.length ? `<p class="jv-note">Failed Gemini calls by method: ${g.failedMethods.map((m) => esc(m.label) + ' ' + fmt(m.value)).join(', ')}.</p>` : '') + costsBlock(p.costs),
        { wide: true, data: [f, g, fs, u], note: `Real failures count crashes, timeouts and 5xx answers. Google also counts expected 4xx answers as errors (${fmt(f.notOk || 0)} in 24 hours).` + (f.error ? ' ' + esc(f.error) : '') });
    }

    function businessView() {
        const e = S.external;
        const mo = e.money, em = e.email, se = e.search, so = e.social;
        const th = C.thresholds((S.settings || {}).thresholds);
        const okMoney = mo && mo.ok, okMail = em && em.ok, okSocial = so && so.ok, gsc = se && se.console;
        const md = okMoney ? C.delta(mo.revenue.usd, mo.prior.usd) : null;
        const head = kpis([
            { label: 'Revenue (USD)', value: okMoney ? mo.revenue.usd : '—', delta: md ? md.text : '', dir: md && md.dir, prior: okMoney ? mo.prior.usd : 0 },
            { label: 'Sales', value: okMoney ? mo.revenue.count : '—' },
            { label: 'Paid runs', value: okMoney ? mo.revenue.paidRuns : '—' },
            { label: 'Emails delivered', value: okMail && em.rates.delivered !== null ? em.rates.delivered + '%' : '—', alert: okMail && em.rates.bad >= th.emailBadPct },
            { label: 'Social posts', value: okSocial ? so.sent : '—', alert: okSocial && so.failed > 0 },
            { label: 'Google clicks', value: gsc && gsc.ok ? gsc.clicks : '—' }
        ]);
        const sources = [].concat(((S.summaries.cv || {}).lists || {}).sources || [], ((S.summaries.review || {}).lists || {}).sources || []).filter((r) => SOCIAL.test(r.label));
        const visits = {};
        sources.forEach((r) => { const k = r.label.replace(/\s*\(.*\)$/, ''); visits[k] = (visits[k] || 0) + r.value; });
        const social = Object.keys(visits).map((label) => ({ label, value: visits[label] })).sort((a, b) => b.value - a.value);
        const pp = okMoney ? mo.paypal || {} : {};
        return head + `<div class="jv-grid">${briefPanel('business')}
            ${panel('business-revenue', 'Revenue per day (USD)', okMoney ? (mo.daily.length ? area(mo.daily.map((d) => d.date), [{ name: 'USD', values: mo.daily.map((d) => d.usd), color: COLORS.green }]) : '<p class="jv-empty">No sales in this range.</p>') + bars(mo.byProvider, { color: COLORS.green, empty: 'No sales by provider yet.' }) : waiting('money', 'Reading payments…'), { wide: true, data: okMoney ? mo.daily : null, note: okMoney ? `Test payments are left out. ${fmt(mo.revenue.paidRuns)} paid review runs used credits bought earlier.` : '' })}
            ${panel('business-paypal', 'PayPal and Stripe', okMoney ? `<ul class="jv-facts"><li>Open PayPal disputes: <b>${pp.disputesOpen === null || pp.disputesOpen === undefined ? '—' : fmt(pp.disputesOpen)}</b></li>${pp.transactions ? `<li>PayPal in range: ${fmt(pp.transactions.count)} payments, ${fmt(pp.transactions.grossUsd)} USD gross, ${fmt(pp.transactions.feesUsd)} USD fees, <b>${fmt(pp.transactions.netUsd)} USD net</b></li>` : ''}<li>Refunded in range: <b>${fmt(mo.refundsUsd)} USD</b></li><li>Stripe: ${esc(mo.stripe.mode === 'live' ? 'live' : mo.stripe.mode === 'test' ? 'test key only, checkout uses PayPal' : 'not set up')}</li></ul>${needList(mo)}` : waiting('money', 'Asking PayPal…'))}
            ${panel('business-email', 'Email delivery (SendGrid)', okMail ? kpis([
                { label: 'Sent', value: em.totals.processed }, { label: 'Delivered', value: em.totals.delivered }, { label: 'Bounced', value: em.totals.bounces, alert: em.totals.bounces > 0 },
                { label: 'Blocked', value: em.totals.blocks, alert: em.totals.blocks > 0 }, { label: 'Spam reports', value: em.totals.spam_reports, alert: em.totals.spam_reports > 0 }, { label: 'Opened', value: em.rates.opened === null ? '—' : em.rates.opened + '%' }
            ]) + area(em.daily.map((d) => d.date), [{ name: 'Delivered', values: em.daily.map((d) => d.delivered), color: COLORS.cyan }, { name: 'Bounced or blocked', values: em.daily.map((d) => d.bad), color: COLORS.pink }]) + table([['Kind', (r) => esc(r.kind)], ['Domain', (r) => esc(r.domain)], ['Reason', (r) => esc(r.reason)], ['When', (r) => esc(when(r.at))]], [].concat(...['bounces', 'blocks', 'spam'].map((k) => ((em.suppressions || {})[k] || []).map((r) => Object.assign({ kind: k }, r)))).slice(0, 12), 'No bounces, blocks or spam reports in range.') : waiting('email', 'Asking SendGrid…'), { wide: true, data: okMail ? em.daily : null, note: okMail && em.blocklisted && em.blocklisted.length ? `Refused because the sending IP is on a blocklist: ${em.blocklisted.map((l) => esc(l.label) + ' (' + fmt(l.value) + ')').join(', ')}. SendGrid's shared IPs get listed now and then; ask SendGrid support, or move to a dedicated IP if it keeps happening.` : '' })}
            ${panel('business-brave', 'Search rankings (Brave, top 20)', se && se.brave && se.brave.ok ? table([['Search', (q) => esc(q.query)], ['Our place', (q) => q.position ? `<span class="jv-chip ${q.position <= 3 ? 'c-fast' : q.position <= 10 ? 'c-average' : ''}">#${q.position}</span>` : `<span class="jv-chip c-slow">not in top 20</span>`], ['First result', (q) => esc(q.leader || q.error || '')]], se.brave.queries) : waiting('search', 'Searching Brave…'), { data: se && se.brave && se.brave.queries, note: 'Checked once a day. Edit the searches in ⚙ Settings.' })}
            ${panel('business-gsc', 'Google Search Console', gsc && gsc.ok ? kpis([{ label: 'Clicks', value: gsc.clicks }, { label: 'Impressions', value: gsc.impressions }, { label: 'CTR', value: gsc.ctr + '%' }, { label: 'Avg position', value: gsc.position === null ? '—' : gsc.position }]) + table([['Query', (q) => esc(q.query)], ['Clicks', (q) => fmt(q.clicks)], ['Impr.', (q) => fmt(q.impressions)], ['Pos.', (q) => fmt(q.position)]], gsc.queries, 'No queries yet.') : se && se.ok ? `<p class="jv-empty">${esc((gsc && gsc.error) || 'Not connected.')}</p>${needList(se)}` : waiting('search', 'Asking Search Console…'), { data: gsc && gsc.ok ? gsc.queries : null })}
            ${panel('business-social', 'Social posts', okSocial ? bars(so.channels, { color: COLORS.violet, empty: 'No posts went out in this range.' }) + table([['When', (r) => esc(when(r.at))], ['Network', (r) => esc(r.channel)], ['Result', (r) => `<span class="jv-chip ${r.result === 'sent' ? 'c-fast' : r.result === 'failed' ? 'c-slow' : ''}">${esc(r.result)}</span>`], ['Post', (r) => r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.post.slice(0, 40))}</a>` : esc(r.post.slice(0, 40))]], so.latest, 'No posts in range.') + needList(so) : waiting('social', 'Reading the social ledgers…'), { wide: true, data: okSocial ? so.latest : null, note: okSocial && so.scheduled && so.scheduled.count ? `${fmt(so.scheduled.count)} more posts are scheduled in Buffer; the next goes out ${esc(when(so.scheduled.next))}.` : '' })}
            ${listPanel('business', 'social-visits', 'Visits that came from social', social, { color: COLORS.violet, empty: 'No visits from social links in this range.' })}
            ${okSocial && so.youtube && so.youtube.videos.length ? panel('business-youtube', `YouTube${so.youtube.views !== null ? ' (' + fmt(so.youtube.views) + ' views)' : ''}`, table([['Video', (v) => `<a href="https://youtu.be/${esc(v.id)}" target="_blank" rel="noopener">${esc(String(v.title || v.id).slice(0, 70))}</a>`], ['Views', (v) => v.views === undefined ? '—' : fmt(v.views)], ['Likes', (v) => v.likes === undefined ? '—' : fmt(v.likes)], ['Published', (v) => esc(when(v.published))]], so.youtube.videos), { wide: true, data: so.youtube.videos }) : ''}
        </div>`;
    }

    // Social hub (#1420): the Buffer and Facebook queue per channel, the posting runs, and field-sweep proposals.
    function socialQueuePanel() {
        const so = S.external.social;
        if (!so || !so.queue) return panel('hub-queue', 'Queue by channel', so && so.ok === false ? `<p class="jv-empty">${esc(so.error || 'Not loaded.')}</p>` : waiting('social', 'Reading the Buffer and Facebook ledgers…'), { wide: true });
        const next = (c) => (c.next.length ? c.next.map((n) => `<span class="jv-chip">${esc(when(n.at))}</span> ${esc(n.post.split('/').pop())}`).join('<br>') : '<span class="jv-note">nothing scheduled</span>');
        return panel('hub-queue', 'Queue by channel', table([
            ['Channel', (c) => `<strong>${esc(c.name)}</strong>`], ['Scheduled', (c) => fmt(c.scheduled)], ['Next', next],
            ['Sent', (c) => fmt(c.sent)], ['Failed', (c) => (c.failed ? `<span class="jv-chip c-slow">${fmt(c.failed)}</span>` : '0')],
            ['Last out', (c) => (c.last ? (c.last.url ? `<a href="${esc(c.last.url)}" target="_blank" rel="noopener">${esc(when(c.last.at))}</a>` : esc(when(c.last.at))) : '—')]
        ], so.queue), { wide: true, data: so.queue.map((c) => ({ channel: c.name, scheduled: c.scheduled, next: c.next.map((n) => n.at + ' ' + n.post).join(' | '), sent: c.sent, failed: c.failed, last: c.last ? c.last.at : '' })), note: 'Sent and failed count the selected range. Instagram stays empty while that channel is paused in Buffer.' });
    }

    function socialRunsPanel() {
        const R = S.external['social-runs'];
        const runs = (R && R.runs) || [];
        const state = (r) => (r.status && r.status !== 'completed' ? `<span class="jv-chip c-average">${esc(r.status)}</span>` : r.conclusion ? `<span class="jv-chip ${r.conclusion === 'success' ? 'c-fast' : 'c-slow'}">${esc(r.conclusion)}</span>` : '—');
        const body = runs.length ? table([['Workflow', (r) => esc(r.name)], ['Last run', (r) => (r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(when(r.at))}</a>` : '—')], ['How', (r) => esc(r.event || '')], ['Result', state]], runs) : `<p class="jv-empty">${esc((R && R.error) || (R ? 'Set GITHUB_BUGS_TOKEN in functions/.env to see the runs.' : 'Reading the workflow runs…'))}</p>`;
        return panel('hub-runs', 'Posting', body + `<div class="jv-actions"><button type="button" class="jv-btn" data-act="social-post-now"${S.pending['social-post-now'] ? ' disabled' : ''}>Post now</button></div>`,
            { note: 'Post now runs the Buffer queue (the batches a spent daily limit held back) and the Facebook Page queue instead of waiting for their nightly slots.' });
    }

    function socialProposalsPanel() {
        const P = S.external['social-proposals'];
        if (!P) return panel('hub-proposals', 'Post proposals', waiting('social-proposals', 'Reading the field sweep proposals…'), { wide: true });
        if (P.ok === false) return panel('hub-proposals', 'Post proposals', `<p class="jv-empty">${esc(P.error || 'Not loaded.')}</p>`, { wide: true });
        const list = P.proposals || [];
        const items = list.map((p) => `<li class="jv-prop lv-info"><span class="jv-prop-rank">${esc(String(Math.round(Number(p.score) || 0)))}</span><div class="jv-prop-body">
            <p class="jv-prop-title"><strong>${esc(p.title)}</strong>${p.topic ? ` <span class="jv-chip">${esc(p.topic)}</span>` : ''} <span class="jv-chip">${esc(p.lang)}</span></p>
            <p class="jv-prop-why">${esc([p.source, p.author && 'by ' + p.author, p.date].filter(Boolean).join(' · '))}</p>${p.summary ? `<p class="jv-prop-why">${esc(p.summary)}</p>` : ''}
            <div class="jv-prop-acts"><button type="button" data-social-decide="approved" data-key="${esc(p.id)}">Approve</button><button type="button" data-social-decide="dismissed" data-key="${esc(p.id)}">Dismiss</button>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">Read →</a>` : ''}</div></div></li>`).join('');
        return panel('hub-proposals', 'Post proposals' + (list.length ? ' (' + list.length + ')' : ''), `<p class="jv-note">Approve adds it to the hub as a pick, as the hub editor does; the next daily build publishes it.${P.built ? ' Sweep ran ' + esc(when(P.built)) + '.' : ''}</p>` + (list.length ? `<ol class="jv-props">${items}</ol>` : '<p class="jv-empty">No proposals are waiting.</p>'), { wide: true });
    }

    async function decideSocial(id, decision) {
        const out = await call('social-decide', { id, decision }).catch((error) => ({ ok: false, error: error.message }));
        if (!out.ok) { toast('Not saved: ' + out.error, 6000); return; }
        const P = S.external['social-proposals'];
        if (P && P.proposals) P.proposals = P.proposals.filter((p) => p.id !== id);
        render();
        toast(decision === 'approved' ? 'Approved. The next daily hub build publishes it.' : 'Dismissed.', 3500);
    }

    async function postNow() {
        if (!window.confirm('Run the Buffer and Facebook queues now?')) return;
        S.pending['social-post-now'] = true;
        render();
        const out = await call('social-post-now').catch((error) => ({ ok: false, error: error.message }));
        S.pending['social-post-now'] = false;
        toast(out.ok ? out.note : 'Not started: ' + out.error, 6000);
        loadExternal(['social-runs']);
    }

    // Owner notices waiting for Send or Drop (#1420); the same list and decision as the review desk.
    function approvalsPanel() {
        const N = S.external.notices;
        if (!N) return panel('outreach-approvals', 'Approvals', waiting('notices', 'Reading the owner notices waiting for you…'), { wide: true });
        if (N.ok === false) return panel('outreach-approvals', 'Approvals', `<p class="jv-empty">${esc(N.error || 'Not loaded.')}</p>`, { wide: true });
        const list = N.notices || [];
        const items = list.map((n) => `<li class="jv-approval${n.critical ? ' is-critical' : ''}" data-notice="${esc(n.domain)}">
            <p class="jv-prop-title"><strong>${esc(n.host)}</strong>${n.critical ? ' <span class="jv-chip c-slow">critical security</span>' : ''} <span class="jv-note">queued ${esc(when(n.createdAt))}</span></p>
            <label class="jv-field">Send to<select data-notice-email="${esc(n.domain)}" data-menu-ready="1">${(n.candidates.length ? n.candidates : [{ email: n.email, sources: [] }]).map((c) => `<option value="${esc(c.email)}"${c.email === n.email ? ' selected' : ''}>${esc(c.email)}${c.sources.length ? ' · ' + esc(c.sources.join(', ')) : ''}${c.onDomain ? ' · on the site' : ''}</option>`).join('')}</select></label>
            ${n.lastError ? `<p class="jv-approval-err">Last try: ${esc(n.lastError)}</p>` : ''}
            <div class="jv-prop-acts"><button type="button" data-notice-send="${esc(n.domain)}">Send</button><button type="button" data-notice-drop="${esc(n.domain)}">Drop</button>${n.report ? `<a href="${esc(n.report)}" target="_blank" rel="noopener">Review →</a>` : ''}<a href="https://${esc(n.host)}" target="_blank" rel="noopener">Site →</a></div></li>`).join('');
        const note = N.auto ? 'Auto-send is on: a notice goes out by itself once its Live Report is public. Send or drop one here to decide now.' : 'Auto-send is off: each notice waits for you.';
        return panel('outreach-approvals', 'Approvals' + (list.length ? ' (' + list.length + ')' : ''), `<p class="jv-note">${esc(note)}</p>` + (list.length ? `<ul class="jv-approvals">${items}</ul>` : '<p class="jv-empty">No owner notices are waiting.</p>'),
            { wide: true, data: list.map((n) => ({ host: n.host, email: n.email, critical: n.critical, queued: n.createdAt, lastError: n.lastError })) });
    }

    async function decideNotice(domain, send) {
        const row = root.querySelector(`[data-notice="${CSS.escape(domain)}"]`);
        const select = row && row.querySelector('select');
        const email = select ? select.value : '';
        if (send && !window.confirm(`Send the owner notice for ${domain} to ${email}?`)) return;
        if (row) row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        const out = await call('notice-decide', { domain, send, email }).catch((error) => ({ ok: false, error: error.message }));
        const N = S.external.notices;
        if (!out.ok) {
            const n = N && N.notices && N.notices.find((x) => x.domain === domain);
            if (n) n.lastError = out.error;
            render();
            toast('Not done: ' + out.error, 6000);
            return;
        }
        if (N && N.notices) N.notices = N.notices.filter((x) => x.domain !== domain);
        render();
        toast(send ? 'Sent to ' + (out.email || email) + '.' : 'Dropped ' + domain + '.', 3000);
    }

    function outreachView() {
        const ou = S.external.outreach;
        if (!ou || !ou.ok) return `<div class="jv-grid">${approvalsPanel()}${briefPanel('outreach')}${panel('outreach-wait', 'Outreach', waiting('outreach', 'Reading the outreach pipeline, Instantly and the plan…'))}</div>`;
        const pipe = ou.pipeline && ou.pipeline.ok ? ou.pipeline : null;
        const mail = ou.instantly && ou.instantly.ok ? ou.instantly : null;
        const plan = ou.plan && ou.plan.ok !== false ? ou.plan : null;
        const th = C.thresholds((S.settings || {}).thresholds);
        const visits = C.outreachVisits(S.rows.events);
        const weekly = (plan && plan.weekly) || {};
        const warm = mail && mail.accounts.length ? Math.min(...mail.accounts.map((a) => (a.score === null ? 0 : a.score))) : null;
        const head = kpis([
            { label: 'Prospects queued', value: pipe ? pipe.queued : '—' },
            { label: 'Reviewed in range', value: pipe ? pipe.reviews : '—' },
            { label: 'With a Live Report', value: pipe ? pipe.withLiveReport : '—' },
            { label: 'Emails sent', value: mail ? mail.sent : '—' },
            { label: 'Reply rate', value: mail && mail.contacted ? mail.rates.reply + '%' : '—', alert: mail && mail.contacted >= 50 && mail.rates.reply < (weekly.replyPct || 0) },
            { label: 'Interested', value: mail ? mail.interested : '—' },
            { label: 'Lowest warm-up', value: warm === null ? '—' : warm, alert: warm !== null && warm < th.outreachWarmup }
        ]);
        const chip = (ok, text) => `<span class="jv-chip ${ok ? 'c-fast' : 'c-slow'}">${esc(text)}</span>`;
        const days = (n) => (n === 0 ? 'today' : n > 0 ? 'in ' + n + (n === 1 ? ' day' : ' days') : Math.abs(n) + ' days ago');
        const planBody = plan ? `<ul class="jv-facts">
                <li>${plan.day > 0 ? `Day <b>${fmt(Math.min(plan.day, plan.length))}</b> of ${fmt(plan.length)}` : `Starts <b>${esc(plan.start)}</b>`}${plan.phase ? ` · <b>${esc(plan.phase.name)}</b> (ends ${esc(plan.phase.end)})` : ''}</li>
                ${plan.next ? `<li>Next milestone ${esc(days(plan.next.daysLeft))} (${esc(plan.next.date)}): <b>${esc(plan.next.label)}</b></li>` : ''}
            </ul>${table([['Deadline', (d) => esc(d.label)], ['Date', (d) => esc(d.date)], ['When', (d) => `<span class="jv-chip ${d.daysLeft <= 7 ? 'c-slow' : d.daysLeft <= th.outreachDeadlineDays ? 'c-average' : ''}">${esc(days(d.daysLeft))}</span>`]], plan.deadlines)}
            ${table([['Milestone', (m) => esc(m.label)], ['Date', (m) => esc(m.date)], ['', (m) => (m.past ? 'past' : '')]], plan.milestones)}` : waiting('outreach', '') + needList(ou);
        const ratio = (a, b) => (b ? Math.round((a / b) * 100) : null);
        const funnel = [
            { metric: 'Prospects reviewed this week', actual: pipe ? pipe.thisWeek : null, target: weekly.prospects, unit: '' },
            { metric: 'Reviewed prospects with a Live Report', actual: pipe ? ratio(pipe.reviewedWithLiveReport, Math.max(1, pipe.swept)) : null, target: weekly.liveReportPct, unit: '%' },
            { metric: 'Open rate', actual: mail && mail.contacted ? mail.rates.open : null, target: weekly.openPct, unit: '%' },
            { metric: 'Reply rate', actual: mail && mail.contacted ? mail.rates.reply : null, target: weekly.replyPct, unit: '%' },
            { metric: 'Positive replies', actual: mail && mail.contacted ? mail.rates.positive : null, target: weekly.positivePct, unit: '%' }
        ];
        const funnelBody = table([['Metric', (r) => esc(r.metric)], ['Now', (r) => (r.actual === null ? '—' : chip(r.target === undefined || r.actual >= r.target, fmt(r.actual) + r.unit))], ['Target', (r) => (r.target === undefined ? '—' : fmt(r.target) + r.unit)]], funnel);
        const targets = plan ? table([['90-day target', (r) => esc(r.label)], ['So far', (r) => (r.actual === null || r.actual === undefined ? '—' : fmt(r.actual))], ['Target', (r) => fmt(r.target)], ['', (r) => (r.actual === null || r.actual === undefined ? '' : `<span class="jv-meter"><i style="width:${Math.min(100, Math.round((r.actual / Math.max(1, r.target)) * 100))}%"></i></span>`)]], plan.targets) + '<p class="jv-note">Counts come from the weekly KPI tracker; upload it with scripts/jarvis-outreach-plan.js.</p>' : '';
        const pipeBody = pipe ? kpis([{ label: 'Swept', value: pipe.swept }, { label: 'Left in queue', value: pipe.left, alert: pipe.left === 0 && pipe.queued > 0 }, { label: 'Avg score', value: pipe.avgScore === null ? '—' : pipe.avgScore }]) + bars(pipe.bySegment, { color: COLORS.cyan, empty: 'No prospects queued. Add a list with scripts/sweep-outreach.js.' }) + (pipe.results.length ? bars(pipe.results, { color: COLORS.green }) : '') : waiting('outreach', '');
        const campBody = mail ? bars(mail.status, { color: COLORS.violet, empty: 'No campaigns yet.' }) + kpis([{ label: 'Contacted', value: mail.contacted }, { label: 'Opened', value: mail.opened }, { label: 'Replies', value: mail.replies }, { label: 'Meetings', value: mail.meetings }, { label: 'Bounced', value: mail.bounced, alert: mail.sent >= 20 && mail.rates.bounce >= th.outreachBouncePct }, { label: 'Unsubscribed', value: mail.unsubscribed }])
            + table([['Campaign', (c) => esc(c.name)], ['Sent', (c) => fmt(c.sent)], ['Opened', (c) => fmt(c.opened)], ['Replies', (c) => fmt(c.replies)], ['Bounced', (c) => fmt(c.bounced)]], mail.byCampaign, 'No campaign has sent yet.') : `<p class="jv-empty">${esc((ou.instantly && ou.instantly.error) || 'Not loaded.')}</p>`;
        const boxBody = mail ? table([['Mailbox', (a) => esc(a.email)], ['Status', (a) => chip(a.status === 'active', a.status)], ['Warm-up', (a) => chip(a.warmup === 'on', a.warmup)], ['Score', (a) => (a.score === null ? '—' : chip(a.score >= th.outreachWarmup, String(a.score)))], ['Daily limit', (a) => (a.dailyLimit ? fmt(a.dailyLimit) : '—')]], mail.accounts, 'No mailboxes connected.') : '';
        const dnsBody = ou.mail && ou.mail.checks ? `<ul class="jv-facts">${ou.mail.checks.map((c) => `<li>${chip(c.ok, c.name)} ${esc(c.detail)}</li>`).join('')}</ul>` : `<p class="jv-empty">${esc((ou.mail && ou.mail.error) || 'Not loaded.')}</p>`;
        return head + `<div class="jv-grid">${approvalsPanel()}${briefPanel('outreach')}
            ${panel('outreach-plan', '90-day plan', planBody)}
            ${panel('outreach-funnel', 'Weekly funnel against the plan', funnelBody, { data: funnel })}
            ${plan ? panel('outreach-targets', '90-day targets', targets, { data: plan.targets }) : ''}
            ${panel('outreach-pipeline', 'Prospect pipeline (nightly sweep)', pipeBody, { data: pipe ? pipe.bySegment : [] })}
            ${panel('outreach-campaigns', 'Campaigns (Instantly)', campBody, { data: mail ? mail.byCampaign : [] })}
            ${mail ? panel('outreach-mailboxes', 'Mailboxes and warm-up', boxBody, { data: mail.accounts }) : ''}
            ${panel('outreach-dns', `Sending domain${ou.mail && ou.mail.domain ? ' (' + esc(ou.mail.domain) + ')' : ''}`, dnsBody)}
            ${listPanel('outreach', 'visits', 'Visits from outreach links', visits.campaigns, { color: COLORS.green, empty: 'No visits tagged utm_source=outreach in this range yet.' })}
        </div>${needList(ou)}`;
    }

    function views() {
        const s = S.summaries;
        const e = S.external;
        const out = {};
        const tiles = C.PRODUCTS.filter((p) => p.key !== 'overview').map((p) => {
            const sum = s[p.key];
            let main = null, series = [];
            if (sum && sum.kpis) { main = sum.kpis[0]; series = sum.series ? sum.series.values : []; }
            if (p.key === 'traffic' && e.ga4 && e.ga4.ok) { const n = e.ga4.groups.reduce((a, g) => a + g.sessions, 0); const b = e.ga4.groups.reduce((a, g) => a + g.priorSessions, 0); const d = C.delta(n, b); main = { label: 'GA4 sessions', value: n, delta: d.text, dir: d.dir }; series = e.ga4.daily.map((x) => x.sessions); }
            if (p.key === 'systems') { const r = C.readiness(e); main = { label: 'Readiness', value: r === null ? '—' : r + '%' }; }
            if (p.key === 'outreach' && e.outreach && e.outreach.pipeline && e.outreach.pipeline.ok) { main = { label: 'Prospects reviewed', value: e.outreach.pipeline.reviews }; series = e.outreach.pipeline.daily.map((x) => x.reviews); }
            if (p.key === 'business' && e.money && e.money.ok) { const d = C.delta(e.money.revenue.usd, e.money.prior.usd); main = { label: 'Revenue (USD)', value: e.money.revenue.usd, delta: d.text, dir: d.dir }; series = e.money.daily.map((x) => x.usd); }
            const alerts = S.brief.filter((b) => b.product === p.key && (b.level === 'alert' || b.level === 'warn')).length;
            return `<button type="button" class="jv-tile${alerts ? ' has-alert' : ''}" data-go="${p.key}"><span class="jv-tile-name">${esc(p.name)}</span><strong>${main ? fmt(main.value) : '—'}</strong><small>${main ? esc(main.label) : ''} ${main && main.delta ? `<em class="${main.dir > 0 ? 'up' : main.dir < 0 ? 'down' : ''}">${esc(main.delta)}</em>` : ''}</small>${spark(series, alerts ? COLORS.amber : COLORS.cyan)}${tileGoal(p.key)}${alerts ? `<b class="jv-badge">${alerts}</b>` : ''}</button>`;
        }).join('');
        const feed = [].concat(
            S.rows.events.slice(0, 40).map((r) => ({ at: r.createdAt, text: `${(C.PRODUCTS.find((p) => p.key === r.site) || { name: r.site }).name}: ${r.kind === 'visit' ? 'visit from ' + C.openSource(r) : C.actionTitle(r)}` })),
            S.rows.opens.slice(0, 20).map((r) => ({ at: r.createdAt, text: `URL Review: open from ${C.openSource(r)}` })),
            S.rows.reviews.slice(0, 20).map((r) => ({ at: r.createdAt, text: `URL Review: ${r.paid ? 'paid ' : ''}review of ${esc(String(r.requestedUrl || r.url || '').replace(/^https?:\/\//, '').slice(0, 50))} (${r.status || '…'})` }))
        ).filter((x) => C.toDate(x.at)).sort((a, b) => C.toDate(b.at) - C.toDate(a.at)).slice(0, 18);
        out.overview = `<div class="jv-tiles">${tiles}</div><div class="jv-grid">${briefPanel('overview')}${proposalsPanel()}${goalsPanel('overview')}
            ${panel('overview-feed', 'Live feed', feed.length ? `<ul class="jv-feed">${feed.map((f) => `<li><time>${when(f.at)}</time><span>${esc(f.text)}</span></li>`).join('')}</ul>` : '<p class="jv-empty">No events yet.</p>', { tall: true, data: feed.map((f) => ({ at: (C.toDate(f.at) || new Date()).toISOString(), event: f.text })) })}
            ${panel('overview-rings', 'Systems at a glance', `<div class="jv-rings">${ring(C.readiness(e), 'ready')}${(e.speed && e.speed.pages ? e.speed.pages : []).map((p) => ring(p.ok ? p.score : null, p.name.replace('URL Review', 'Review'), null, 84)).join('')}</div>`)}
            ${panel('overview-mix', 'Visits by product', bars(['cv', 'studio', 'lab'].map((k) => ({ label: (C.PRODUCTS.find((p) => p.key === k) || {}).name, value: s[k].totals.visits })).concat([{ label: 'URL Review (opens)', value: s.review.totals.opens }]), { color: COLORS.violet }), { data: ['cv', 'studio', 'lab'].map((k) => ({ product: k, visits: s[k].totals.visits, clicks: s[k].totals.clicks, exports: s[k].totals.exports, runs: s[k].totals.runs })) })}
        </div>${S.truncated ? `<p class="jv-note">This range holds more than ${fmt(EVENT_CAP)} site events; breakdowns cover the newest ${fmt(EVENT_CAP)}.</p>` : ''}`;

        const i = s.inbox;
        out.inbox = kpis(i.kpis) + `<div class="jv-grid">${briefPanel('inbox')}${goalsPanel('inbox')}
            ${panel('inbox-trend', 'Messages and ratings per day', area(i.series.labels, [{ name: 'Messages', values: i.series.values, color: COLORS.cyan }, { name: 'Ratings', values: i.ratingSeries.values, color: COLORS.amber }]), { wide: true, data: i.series.labels.map((d, k) => ({ day: d, messages: i.series.values[k], ratings: i.ratingSeries.values[k] })) })}
            ${listPanel('inbox', 'topics', 'Message topics', i.lists.topics)}${listPanel('inbox', 'stars', 'Rating mix', i.lists.stars, { color: COLORS.amber })}${listPanel('inbox', 'status', 'Rating status', i.lists.status, { color: COLORS.green })}
        </div><p class="jv-note">The Real / Tests / All switch applies to the inbox. Open the Messages and CV Ratings tabs to answer.</p>`;

        ['cv', 'studio', 'lab'].forEach((key) => { out[key] = siteView(key); });

        const r = s.review;
        const h = e.health;
        out.review = kpis(r.kpis) + `<div class="jv-grid">${briefPanel('review')}${goalsPanel('review')}
            ${panel('review-funnel', 'Funnel', funnel(r.funnel), { data: r.funnel })}
            ${panel('review-trend', 'Opens and reviews per day', area(r.series.labels, [{ name: 'Opens', values: r.series.values, color: COLORS.cyan }, { name: 'Reviews', values: r.reviewSeries.values, color: COLORS.green }]), { wide: true, data: r.series.labels.map((d, k) => ({ day: d, opens: r.series.values[k], reviews: r.reviewSeries.values[k] })) })}
            ${panel('review-heat', 'When they open it', heat(r.heatmap, r.peak), { wide: true })}
            ${speedCard('review')}${gaCard('review')}
            ${listPanel('review', 'sources', 'Sources (opens)', r.lists.sources)}${listPanel('review', 'review-sources', 'Sources (reviews)', r.lists.reviewSources, { color: COLORS.green, empty: 'Reviews carry their source since 25 Oct 2026.' })}
            ${listPanel('review', 'statuses', 'Statuses', r.lists.statuses, { color: COLORS.amber })}${listPanel('review', 'hosts', 'Hosts reviewed', r.lists.hosts)}
            ${listPanel('review', 'frameworks', 'Frameworks', r.lists.frameworks, { color: COLORS.violet })}${listPanel('review', 'actions', 'Clicks on the review pages', r.lists.actions, { color: COLORS.amber })}
            ${listPanel('review', 'pages', 'Pages', r.lists.pages)}${listPanel('review', 'countries', 'Countries', r.lists.countries)}${listPanel('review', 'cities', 'Cities', r.lists.cities)}
            ${listPanel('review', 'langs', 'Languages', r.lists.langs)}${listPanel('review', 'screens', 'Screens', r.lists.screens)}
            ${panel('review-failures', 'Failed runs', h && h.failures ? `<p class="jv-big">${fmt(h.failures.total)}</p>${bars(h.failures.causes, { color: COLORS.pink, empty: 'No failures in range.' })}` : `<p class="jv-empty">${S.pending.health ? 'Asking the server…' : 'Not loaded.'}</p>`, { data: h && h.failures ? h.failures.latest : null })}
            ${panel('review-alerts', 'Alerts', table([['When', (a) => esc(when(a.at))], ['Kind', (a) => esc(a.kind)], ['What', (a) => esc(a.title)]], S.alerts.slice(0, 12), 'No alerts in range.'), { wide: true, data: S.alerts.map((a) => ({ at: a.at, kind: a.kind, title: a.title, url: a.url, priceUsd: a.priceUsd })) })}
            ${panel('review-reports', 'Mailed reports', table([['Report', (x) => esc((x.period || '') + ' ' + (x.label || ''))], ['Opens', (x) => fmt(x.opens || 0)], ['Reviews', (x) => fmt(x.reviews || 0)], ['Paid', (x) => fmt(x.paidUsd || 0) + ' USD']], S.reports, 'No mailed reports yet.'), { data: S.reports.map((x) => ({ period: x.period, label: x.label, opens: x.opens, reviews: x.reviews, paidUsd: x.paidUsd })) })}
            ${panel('review-actions', 'Actions', `<div class="jv-actions">
                <a class="jv-btn" href="${DESK}" target="_blank" rel="noopener">Review desk</a><a class="jv-btn" href="${DESK}/failures" target="_blank" rel="noopener">Failed runs</a>
                <button type="button" class="jv-btn" data-run="sweepReviews">Run the sweep</button><button type="button" class="jv-btn" data-run="rerunReviewFailures">Re-run failures</button>
                <button type="button" class="jv-btn" data-report="review:daily">Send the daily report</button><button type="button" class="jv-btn" data-report="review:weekly">Send the weekly report</button></div>
                <form class="jv-inline" data-unlist><input name="host" placeholder="host to unlist, e.g. example.com" aria-label="Host to unlist"><button type="submit" class="jv-btn danger">Unlist</button></form>`)}
        </div>${r.truncated ? `<p class="jv-note">Breakdowns cover the newest ${fmt(ROW_CAP)} opens and reviews; the totals are exact server counts.</p>` : ''}`;

        const hub = s.hub;
        out.hub = kpis(hub.kpis) + `<div class="jv-grid">${briefPanel('hub')}${socialQueuePanel()}${socialRunsPanel()}${socialProposalsPanel()}
            ${panel('hub-trend', 'Hub and post events per day', area(hub.series.labels, [{ name: 'Events', values: hub.series.values, color: COLORS.violet }]), { wide: true, data: hub.series.labels.map((d, k) => ({ day: d, events: hub.series.values[k] })) })}
            ${listPanel('hub', 'posts', 'Top posts (score)', hub.lists.posts)}${listPanel('hub', 'sources', 'GA4 sources', hub.lists.sources, { color: COLORS.amber })}
            ${listPanel('hub', 'networks', 'Shares by network', hub.lists.networks, { color: COLORS.green })}${listPanel('hub', 'events', 'Events in range', hub.lists.events, { color: COLORS.violet })}${listPanel('hub', 'langs', 'Hub pages by language', hub.lists.langs)}
            ${speedCard('hub')}
            ${panel('hub-actions', 'Actions', `<p class="jv-note">Stats updated ${hub.updatedAt ? esc(when(hub.updatedAt)) : 'never'}${hub.ga && hub.ga.ok === false ? ' · GA4: ' + esc(hub.ga.error || 'failed') : ''}.</p><div class="jv-actions"><button type="button" class="jv-btn" data-run="refreshSocialHubStats">Refresh hub stats now</button><button type="button" class="jv-btn" data-run="dispatchFacebookQueue">Dispatch the Facebook queue</button><a class="jv-btn" href="qa-review-social.html" target="_blank" rel="noopener">Open the hub</a></div>`)}
        </div>`;

        out.business = businessView();
        out.outreach = outreachView();

        const ga = e.ga4;
        const cf = e.cloudflare;
        const gaBody = ga && ga.ok ? table([['Content group', (g) => esc(g.group)], ['Sessions', (g) => `${fmt(g.sessions)} <em class="${C.delta(g.sessions, g.priorSessions).dir > 0 ? 'up' : 'down'}">${esc(C.delta(g.sessions, g.priorSessions).text)}</em>`], ['Users', (g) => fmt(g.users)], ['Views', (g) => fmt(g.views)], ['Engaged', (g) => g.engagement + '%'], ['Avg session', (g) => g.duration + 's']], ga.groups) : `<p class="jv-empty">${S.pending.ga4 ? 'Reading GA4…' : esc((ga && ga.error) || 'Not loaded.')}</p>`;
        out.traffic = `<div class="jv-grid">${briefPanel('traffic')}
            ${panel('traffic-groups', 'GA4 by content group', gaBody, { wide: true, data: ga && ga.groups, note: 'Property 495572902. GA4 only counts visitors who allowed analytics; the product tabs count every visit.' })}
            ${ga && ga.ok ? panel('traffic-daily', 'GA4 sessions and users per day', area(ga.daily.map((d) => d.date), [{ name: 'Sessions', values: ga.daily.map((d) => d.sessions), color: COLORS.cyan }, { name: 'Users', values: ga.daily.map((d) => d.users), color: COLORS.amber }]), { wide: true, data: ga.daily }) : ''}
            ${ga && ga.ok ? listPanel('traffic', 'countries', 'GA4 countries', ga.countries) + listPanel('traffic', 'sources', 'GA4 source / medium', ga.sources, { color: COLORS.amber }) : ''}
            ${cf && cf.ok && cf.paths ? listPanel('traffic', 'cf-paths', 'Cloudflare: top paths, last 24 hours', cf.paths, { color: COLORS.violet }) : ''}
            ${cf && cf.ok && cf.countries ? listPanel('traffic', 'cf-countries', 'Cloudflare: countries', cf.countries) : ''}
            ${cf && cf.ok && cf.statuses ? listPanel('traffic', 'cf-statuses', 'Cloudflare: status codes', cf.statuses, { color: COLORS.amber }) : ''}
            ${cf && cf.ok && cf.contentTypes ? listPanel('traffic', 'cf-types', 'Cloudflare: content types', cf.contentTypes, { color: COLORS.green }) : ''}
            ${cf && cf.ok && cf.threatCountries && cf.threatCountries.length ? listPanel('traffic', 'cf-threats', 'Cloudflare: threats by country', cf.threatCountries, { color: COLORS.pink }) : ''}
            ${panel('traffic-cloudflare', 'Cloudflare edge', cf && cf.ok ? kpis([{ label: 'Requests', value: cf.requests }, { label: 'Page views', value: cf.pageViews }, { label: 'Uniques', value: cf.uniques }, { label: 'Cached', value: cf.cacheRatio + '%' }, { label: 'Threats', value: cf.threats, alert: cf.threats > 0 }, { label: 'Data', value: (cf.bytes / 1048576).toFixed(1) + ' MB' }]) + area(cf.daily.map((d) => d.date), [{ name: 'Requests', values: cf.daily.map((d) => d.requests), color: COLORS.violet }]) : `<p class="jv-empty">${S.pending.cloudflare ? 'Asking Cloudflare…' : esc((cf && cf.error) || 'Not loaded.')}</p>`, { wide: true, data: cf && cf.daily })}
        </div>`;

        const jobs = e.jobs && e.jobs.jobs ? e.jobs.jobs : [];
        const gh = e.github;
        const up = e.uptime;
        const sp = e.speed;
        out.systems = `<div class="jv-grid">${briefPanel('systems')}
            ${actionsPanel()}${connectionsPanel()}${safetyPanel()}${platformPanel()}
            ${panel('systems-ready', 'Readiness', `<div class="jv-rings">${ring(C.readiness(e), 'ready', null, 120)}</div><p class="jv-note">Share of checks that pass: scheduled jobs, CI on main, uptime and PageSpeed within your limits (⚙ Settings).</p>`)}
            ${panel('systems-uptime', 'Uptime', up && up.ok ? table([['Page', (p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>`], ['Status', (p) => `<span class="jv-chip ${p.ok ? 'c-fast' : 'c-slow'}">${esc(p.status || 'down')}</span>`], ['Time', (p) => fmt(p.ms) + ' ms'], ['Size', (p) => p.bytes ? Math.round(p.bytes / 1024) + ' KB' : '']], up.pages) + `<p class="jv-note">TLS certificate: ${up.tlsDaysLeft === null ? 'unknown' : esc(up.tlsDaysLeft) + ' days left'}.</p>` : `<p class="jv-empty">${S.pending.uptime ? 'Pinging…' : esc((up && up.error) || 'Not loaded.')}</p>`, { data: up && up.pages })}
            ${panel('systems-speed', 'PageSpeed (mobile) and CrUX', sp && sp.ok ? `<div class="jv-rings">${sp.pages.map((p) => ring(p.ok ? p.score : null, p.name.replace('URL Review', 'Review'), null, 90)).join('')}</div>${sp.crux && sp.crux.ok && sp.crux.phone ? `<p class="jv-note">CrUX phone LCP p75 over ${sp.crux.phone.weeks || ''} weeks: ${spark(sp.crux.phone.lcp || [], COLORS.amber)}</p>` : ''}` : `<p class="jv-empty">${S.pending.speed ? 'Running PageSpeed on five pages (up to 90 s)…' : esc((sp && sp.error) || 'Not loaded.')}</p>`, { wide: true, data: sp && sp.pages && sp.pages.map((p) => ({ page: p.name, score: p.score, lcp: p.lab && p.lab.lcp, tbt: p.lab && p.lab.tbt, cls: p.lab && p.lab.cls, error: p.error })) })}
            ${panel('systems-jobs', 'Scheduled jobs', jobs.length ? table([['Job', (j) => esc(j.name)], ['Schedule', (j) => `<code>${esc(j.schedule)}</code>`], ['Last run', (j) => esc(when(j.lastAttempt))], ['State', (j) => `<span class="jv-chip ${j.ok ? (j.note ? '' : 'c-fast') : 'c-slow'}">${j.ok ? esc(j.note || 'ok') : esc(j.error || 'error')}</span>`], ['', (j) => `<button type="button" class="jv-btn small" data-run="${esc(j.name)}">Run now</button>`]], jobs) : `<p class="jv-empty">${S.pending.jobs ? 'Reading Cloud Scheduler…' : esc((e.jobs && e.jobs.error) || 'Not loaded.')}</p>`, { wide: true, data: jobs })}
            ${panel('systems-ops', 'Job runs (ops_runs)', h && h.jobs ? table([['Job', (j) => esc(j.job)], ['Ended', (j) => esc(when(j.endedAt))], ['Result', (j) => `<span class="jv-chip ${j.ok ? 'c-fast' : 'c-slow'}">${j.ok ? 'ok' : 'failed'}</span>`], ['Note', (j) => esc(j.error || j.note)]], h.jobs) : `<p class="jv-empty">${S.pending.health ? 'Asking the server…' : esc((h && h.error) || 'Not loaded.')}</p>`, { wide: true, data: h && h.jobs })}
            ${panel('systems-ci', 'CI on main', gh && gh.ok ? `<div class="jv-ci">${gh.ci.map((c) => `<a class="jv-chip ${c.conclusion === 'success' ? 'c-fast' : c.conclusion === 'skipped' ? '' : 'c-slow'}" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)} · ${esc(c.conclusion)} · ${esc(c.sha)}</a>`).join('')}</div>` : `<p class="jv-empty">${S.pending.github ? 'Asking GitHub…' : esc((gh && gh.error) || 'Not loaded.')}</p>`, { data: gh && gh.ci })}
            ${gh && gh.ok ? listPanel('systems', 'bugs', `Open bugs by area (${gh.openBugs})`, gh.bugAreas, { color: COLORS.pink }) : ''}
            ${gh && gh.ok ? panel('systems-merged', `PRs merged in 7 days (${gh.merged.total})`, table([['#', (p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.number)}</a>`], ['Title', (p) => esc(p.title)]], gh.merged.items), { wide: true, data: gh.merged.items }) : ''}
            ${gh && gh.ok ? panel('systems-recent', 'Newest issues and PRs', table([['#', (p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.number)}</a>`], ['', (p) => (p.pr ? 'PR' : 'issue') + ' · ' + esc(p.state)], ['Title', (p) => esc(p.title)]], gh.recent), { wide: true, data: gh.recent }) : ''}
            ${h ? panel('systems-queue', 'Review pipeline', kpis([{ label: 'Failed runs', value: (h.failures || {}).total || 0, alert: ((h.failures || {}).total || 0) > 0 }, { label: 'Re-runs held', value: (h.reruns || {}).held || 0, alert: ((h.reruns || {}).held || 0) > 0 }, { label: 'Alerts', value: (h.alerts || {}).total || 0 }, { label: 'Owner notices', value: (h.notices || {}).total || 0 }, { label: 'Rival pages', value: (h.rivals || {}).total || 0 }, { label: 'Coupon uses', value: (h.coupons || {}).uses || 0 }, { label: 'Captures', value: (h.captures || {}).total || 0 }]) + bars((h.failures || {}).hosts, { color: COLORS.pink, empty: 'No failing hosts.' }), { wide: true, data: [h.failures, h.reruns, h.notices, h.coupons, h.captures] }) : ''}
            ${panel('systems-links', 'Consoles', `<div class="jv-actions">${LINKS.map(([label, url]) => `<a class="jv-btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(label.replace(/^Open (the )?/, ''))}</a>`).join('')}</div>`, { wide: true })}
        </div>`;
        return out;
    }

    function render() {
        if (!S.mounted || !S.summaries.cv) return;
        S.panels.clear();
        root.dataset.product = S.product;
        const html = views();
        C.PRODUCTS.forEach((p) => {
            const view = $(`[data-view="${p.key}"]`);
            const active = p.key === S.product || root.classList.contains('jv-print-all');
            view.hidden = !active;
            if (active) {
                const keep = view.querySelector('.jv-ask input');
                const typed = keep ? keep.value : '';
                const focused = keep && document.activeElement === keep;
                const prev = S.product;
                S.product = p.key;
                view.innerHTML = (root.classList.contains('jv-print-all') ? `<h2 class="jv-print-title">${esc(p.name)}</h2>` : '') + html[p.key];
                S.product = prev;
                const ask = view.querySelector('.jv-ask input');
                if (ask && typed) { ask.value = typed; if (focused) ask.focus(); }
            }
        });
        $$('[data-go]').forEach((b) => { if (b.getAttribute('role') === 'tab') b.setAttribute('aria-selected', String(b.dataset.go === S.product)); });
        C.PRODUCTS.forEach((p) => {
            const sum = S.summaries[p.key];
            const badge = $(`[data-badge="${p.key}"]`);
            const waitingNotices = p.key === 'outreach' && S.external.notices && S.external.notices.notices ? S.external.notices.notices.length : 0;
            const n = S.brief.filter((b) => b.product === p.key && (b.level === 'alert' || b.level === 'warn')).length + waitingNotices;
            if (badge) { badge.hidden = !n; badge.textContent = n; }
            const k = $(`[data-tab-kpi="${p.key}"]`);
            if (k) k.textContent = sum && sum.kpis ? fmt(sum.kpis[0].value) : p.key === 'systems' ? (C.readiness(S.external) === null ? '' : C.readiness(S.external) + '%') : '';
        });
        const ready = C.readiness(S.external);
        $('#jv-ready').textContent = ready === null ? '—' : ready + '%';
        root.style.setProperty('--ready', ready === null ? 0.5 : ready / 100);
        root.classList.toggle('is-degraded', ready !== null && ready < C.thresholds((S.settings || {}).thresholds).readinessMin);
        const alerts = S.brief.filter((b) => b.level === 'alert').length;
        const warns = S.brief.filter((b) => b.level === 'warn').length;
        tabIcon(ready, alerts, warns);
        const checked = ['health', 'jobs', 'uptime'].some((k) => S.external[k] && !S.pending[k]);
        const things = `${warns} thing${warns > 1 ? 's' : ''} to look at`;
        setStatus(alerts ? `${alerts} alert${alerts > 1 ? 's' : ''} and ${warns} warning${warns === 1 ? '' : 's'} need you.` : !checked ? (warns ? `${things}. Checking systems…` : 'Checking systems…') : warns ? `All systems up. ${things}.` : 'All systems nominal.');
        $$('[data-mail]').forEach((b) => b.classList.toggle('on', b.dataset.mail === S.mail));
        $('[data-print-range]').textContent = (RANGES.find(([v]) => v === S.range) || [])[1] || '';
        $('[data-print-at]').textContent = new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' });
    }

    function pulse(n) {
        const live = $('.jv-live');
        live.classList.remove('is-pulse');
        void live.offsetWidth;
        live.classList.add('is-pulse');
        if (n) toast(`${n} new event${n > 1 ? 's' : ''}`, 1800);
    }

    async function refresh(all) {
        if (S.loading) return;
        S.loading = true;
        setStatus('Refreshing…');
        try {
            await loadFirestore();
            compute();
            render();
        } catch (error) {
            setStatus('Firestore did not answer: ' + error.message);
        }
        S.loading = false;
        if (all !== false) loadExternal().then(() => loadProposals());
    }

    // The rules answer at once; Gemini then ranks them on the server, which also drops the Done and Dismissed ones.
    async function loadProposals() {
        const rules = C.proposalRules({ products: S.summaries, external: S.external, thresholds: (S.settings || {}).thresholds, goals: S.goals }, S.brief);
        S.proposals = Object.assign({}, S.proposals, { loading: true, rules });
        render();
        const out = await call('proposals', { candidates: rules, snapshot: snapshot() }).catch((error) => ({ ok: false, error: error.message }));
        S.proposals = out.ok ? Object.assign(out, { loading: false, rules }) : { loading: false, rules, error: out.error };
        render();
    }

    async function markProposal(key, status) {
        const P = S.proposals || {};
        const row = (P.proposals || P.rules || []).find((p) => p.key === key);
        const out = await call('proposal-mark', { key, status, title: row && row.title });
        if (!out.ok) { toast('Not saved: ' + out.error, 5000); return; }
        ['proposals', 'rules'].forEach((k) => { if (P[k]) P[k] = P[k].filter((p) => p.key !== key); });
        P.hidden = (P.hidden || 0) + 1;
        render();
        toast(status === 'done' ? 'Done. Hidden for 7 days.' : 'Dismissed for 30 days.', 3000);
    }

    // --- actions -------------------------------------------------------------------------------------------

    function download(name, type, text) {
        const blob = text instanceof Blob ? text : new Blob([text], { type });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

    function productRows(key) {
        const out = [];
        S.panels.forEach((p, id) => { if (id.startsWith(key + '-')) (p.rows || []).forEach((row) => out.push(Object.assign({ panel: p.title }, typeof row === 'object' ? row : { value: row }))); });
        const sum = S.summaries[key];
        if (sum && sum.kpis) sum.kpis.forEach((k) => out.unshift({ panel: 'KPIs', label: k.label, value: k.value, prior: k.prior, delta: k.delta }));
        return out;
    }

    function exportAll() {
        download(`jarvis-${S.range}-${stamp()}.json`, 'application/json', JSON.stringify({ generatedAt: new Date().toISOString(), range: S.range, briefing: S.brief, gemini: S.ai || null, products: S.summaries, external: S.external }, null, 2));
    }

    function markdown() {
        const lines = [`# Jarvis briefing`, ``, `Range: ${(RANGES.find(([v]) => v === S.range) || [])[1]} · generated ${new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })} (Bogota)`, ``, `## What needs you`, ``].concat(S.brief.map((b) => `- **${b.level}** (${b.product}): ${b.text}`));
        if (S.ai) lines.push('', '## Gemini', '', S.ai);
        C.PRODUCTS.forEach((p) => {
            const s = S.summaries[p.key];
            if (!s || !s.kpis) return;
            lines.push('', `## ${p.name}`, '', '| Indicator | Value | Change |', '|---|---|---|');
            s.kpis.forEach((k) => lines.push(`| ${k.label} | ${k.value} | ${k.delta || ''} |`));
        });
        return lines.join('\n');
    }

    // A PNG drawn from the panel's numbers, so it looks the same everywhere and needs no screenshot library.
    function panelPng(title, rows) {
        const list = (rows || []).slice(0, 18).map((r) => {
            const label = r.label || r.page || r.day || r.date || r.name || r.job || r.group || r.product || Object.values(r)[0];
            const value = typeof r.value === 'number' ? r.value : Object.values(r).find((v) => typeof v === 'number') || 0;
            return { label: String(label), value };
        });
        const w = 1200, row = 44, h = 150 + Math.max(1, list.length) * row;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const g = canvas.getContext('2d');
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#04121c'); bg.addColorStop(1, '#0a2130');
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(56,225,255,0.35)'; g.lineWidth = 2; g.strokeRect(14, 14, w - 28, h - 28);
        g.fillStyle = COLORS.cyan; g.font = '600 18px ui-monospace, Menlo, monospace'; g.fillText('J.A.R.V.I.S.', 40, 56);
        g.fillStyle = '#e6f7ff'; g.font = '700 34px system-ui, sans-serif'; g.fillText(title, 40, 100);
        g.fillStyle = COLORS.dim; g.font = '16px system-ui, sans-serif'; g.fillText(`${(RANGES.find(([v]) => v === S.range) || [])[1]} · ${new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })}`, 40, 126);
        const max = Math.max(1, ...list.map((r) => r.value));
        list.forEach((r, i) => {
            const y = 150 + i * row;
            g.fillStyle = '#b9d7e6'; g.font = '18px system-ui, sans-serif';
            g.fillText(r.label.length > 46 ? r.label.slice(0, 45) + '…' : r.label, 40, y + 26);
            g.fillStyle = 'rgba(93,122,140,0.25)'; g.fillRect(520, y + 10, 560, 20);
            g.fillStyle = COLORS.cyan; g.shadowColor = COLORS.cyan; g.shadowBlur = 12; g.fillRect(520, y + 10, Math.max(4, (r.value / max) * 560), 20); g.shadowBlur = 0;
            g.fillStyle = '#e6f7ff'; g.font = '600 18px ui-monospace, Menlo, monospace'; g.fillText(r.value.toLocaleString('en-US'), 1096, y + 26);
        });
        canvas.toBlob((blob) => download(`jarvis-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp()}.png`, 'image/png', blob));
    }

    function printView(all) {
        root.classList.toggle('jv-print-all', !!all);
        document.body.classList.add('jv-printing');
        render();
        const done = () => { document.body.classList.remove('jv-printing'); root.classList.remove('jv-print-all'); render(); window.removeEventListener('afterprint', done); };
        window.addEventListener('afterprint', done);
        setTimeout(() => window.print(), 60);
    }

    function link() { return location.origin + location.pathname + `#stats/${S.product}/${S.range}`; }

    async function copy(text, said) {
        try { await navigator.clipboard.writeText(text); toast(said || 'Copied.'); } catch (error) { toast('Copy failed; select and copy by hand.'); }
    }

    function confirmRun(label) { return window.confirm(`Jarvis: ${label}?`); }

    async function runJob(job) {
        if (!confirmRun(`run ${job} now`)) return;
        toast(`Running ${job}…`);
        const out = await call('run-job', { job });
        toast(out.ok ? `${job} started. It shows in Scheduled jobs within a minute.` : `Could not run ${job}: ${out.error}`, 5000);
        if (out.ok) setTimeout(() => loadExternal(['jobs', 'health']), 20000);
    }

    const ACTION_ASK = {
        'rerun-held': () => { const p = ((S.external.actions || {}).pending) || {}; return `send ${p.held === undefined ? 'every' : p.held} held re-run${p.held === 1 ? '' : 's'} to the askers by email${p.held > p.clean ? ` (${p.held - p.clean} not clean)` : ''}`; },
        'resend-notices': () => 're-send the failed owner notices (Monday-Saturday 08:00-19:00, inside today\'s notice budget)',
        'publish-hub': () => 'publish the Social hub (run refreshSocialHubStats)',
        'run-job': (job) => `run ${job} again`
    };

    async function runAction(action, job, proposal) {
        if (!confirmRun(ACTION_ASK[action](job))) return;
        toast('Running…', 30000);
        const out = await call('action-run', { action, job, proposal });
        toast(out.ok ? `${ACTION_LABELS[action]}: ${out.ran ? out.ran + ' started' : fmt(out.done) + ' done'}${out.failed ? ', ' + out.failed + ' failed' : ''}${out.left ? ', ' + out.left + ' left' : ''}.` : 'Not run: ' + out.error, 6000);
        loadExternal(['actions', 'health', 'jobs']);
    }

    async function aiBrief() {
        toast('Gemini is reading the numbers…', 6000);
        const out = await call('brief', { snapshot: snapshot() });
        if (!out.ok) { toast('Gemini: ' + out.error, 6000); return; }
        S.ai = out.text;
        S.aiAt = Date.now();
        render();
        return out.text;
    }

    async function ask(question) {
        S.ai = 'Thinking about: ' + question;
        S.aiAt = Date.now();
        render();
        const out = await call('ask', { question, snapshot: snapshot() });
        S.ai = out.ok ? `Q: ${question}\n\n${out.text}` : 'Gemini: ' + out.error;
        S.aiAt = Date.now();
        render();
        return out.ok ? out.text : '';
    }

    // --- voice ----------------------------------------------------------------------------------------------

    function voice() {
        if (S.voice || !window.speechSynthesis) return S.voice;
        const all = window.speechSynthesis.getVoices();
        S.voice = all.find((v) => /Daniel|Arthur|UK English Male|en-GB.*Male/i.test(v.name)) || all.find((v) => /^en-GB/.test(v.lang)) || all.find((v) => /^en/.test(v.lang)) || null;
        return S.voice;
    }

    function speak(text) {
        if (!window.speechSynthesis) { toast('This browser cannot speak.'); return; }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(String(text || '').replace(/[•*#|]/g, ' ').slice(0, 3000));
        const v = voice();
        if (v) u.voice = v;
        u.rate = 1.03; u.pitch = 0.92;
        window.speechSynthesis.speak(u);
    }

    function speakBriefing() {
        const lead = $('#jv-status').textContent;
        speak(`${$('#jv-hello').textContent}. ${lead} ${S.ai ? S.ai : briefText(S.product).replace(/•/g, '')}`);
    }

    function listen() {
        const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Rec) { toast('This browser has no speech recognition; use ⌘K.'); return; }
        if (S.listening && S.rec) { S.rec.stop(); return; }
        const rec = new Rec();
        S.rec = rec;
        rec.lang = 'en-US';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onstart = () => { S.listening = true; $('[data-act="listen"]').setAttribute('aria-pressed', 'true'); toast('Listening…', 8000); };
        rec.onend = () => { S.listening = false; $('[data-act="listen"]').setAttribute('aria-pressed', 'false'); };
        rec.onerror = (event) => toast('Voice: ' + event.error);
        rec.onresult = (event) => { const said = event.results[0][0].transcript; toast('“' + said + '”'); run(C.parseCommand(said), { spoken: true }); };
        rec.start();
    }

    // --- commands -------------------------------------------------------------------------------------------

    window.addEventListener('hashchange', () => {
        if (!/^#stats/.test(location.hash) || !document.contains(root)) return;
        const range = S.range;
        readHash();
        $('#jv-range').value = S.range;
        if (S.range !== range) refresh(); else render();
    });

    function go(product) {
        S.product = product;
        writeHash();
        render();
        $('#jv-views').scrollIntoView({ block: 'nearest' });
    }

    function setRange(value) {
        S.range = value;
        $('#jv-range').value = value;
        writeHash();
        refresh();
    }

    async function run(cmd, opts) {
        const spoken = opts && opts.spoken;
        const say = (text) => { if (spoken) speak(text); };
        switch (cmd.type) {
            case 'go': go(cmd.product); say('Showing ' + (C.PRODUCTS.find((p) => p.key === cmd.product) || {}).name + '. ' + briefText(cmd.product).split('\n')[0].replace('• ', '')); break;
            case 'range': setRange(cmd.value); say('Range set.'); break;
            case 'print': printView(cmd.all); break;
            case 'export': if (cmd.format === 'csv') download(`jarvis-${S.product}-${stamp()}.csv`, 'text/csv', C.csv(productRows(S.product))); else if (cmd.format === 'png') panelPng((C.PRODUCTS.find((p) => p.key === S.product) || {}).name, productRows(S.product).filter((r) => typeof r.value === 'number')); else exportAll(); break;
            case 'share': copy(link(), 'Link copied.'); break;
            case 'email': emailBriefing(); break;
            case 'refresh': refresh(); say('Refreshing.'); break;
            case 'speak': speakBriefing(); break;
            case 'stop': if (window.speechSynthesis) window.speechSynthesis.cancel(); break;
            case 'run-job': runJob(cmd.job); break;
            case 'settings': openSettings(); break;
            case 'daily': dailyNow(); break;
            case 'ask': { const text = await ask(cmd.question); if (text) say(text); break; }
            default: break;
        }
    }

    async function emailBriefing() {
        toast('Sending…');
        const out = await call('email-briefing', { snapshot: snapshot(), text: (S.ai ? S.ai + '\n\n' : '') + briefText('overview') });
        toast(out.ok && out.sent ? 'Briefing emailed to you.' : 'Email failed: ' + (out.error || 'mail is not set up'), 5000);
    }

    function commands() {
        const list = [];
        C.PRODUCTS.forEach((p, i) => list.push({ label: `Go to ${p.name}`, hint: String(i + 1), fn: () => go(p.key) }));
        RANGES.forEach(([v, l]) => list.push({ label: `Range: ${l}`, fn: () => setRange(v) }));
        list.push(
            { label: 'Read the briefing aloud', fn: speakBriefing }, { label: 'Talk to Jarvis (microphone)', fn: listen },
            { label: 'Gemini briefing', fn: aiBrief }, { label: 'Refresh everything', hint: 'R', fn: () => refresh() },
            { label: S.live ? 'Pause live updates' : 'Resume live updates', fn: toggleLive },
            { label: 'Print this product', hint: 'P', fn: () => printView(false) }, { label: 'Print every product', fn: () => printView(true) },
            { label: 'Export everything (JSON)', fn: exportAll }, { label: 'Export this product (CSV)', fn: () => run({ type: 'export', format: 'csv' }) },
            { label: 'Export this product (PNG)', fn: () => run({ type: 'export', format: 'png' }) }, { label: 'Download the briefing (Markdown)', fn: () => download(`jarvis-briefing-${stamp()}.md`, 'text/markdown', markdown()) },
            { label: 'Copy a link to this view', fn: () => copy(link(), 'Link copied.') }, { label: 'Copy the briefing', fn: () => copy(markdown(), 'Briefing copied.') },
            { label: 'Share…', fn: webShare }, { label: 'Email me the briefing', fn: emailBriefing },
            { label: 'Settings: goals, thresholds, email', hint: 'G', fn: openSettings }, { label: 'Send the daily briefing email now', fn: dailyNow },
            { label: 'Send the daily URL Review report', fn: () => sendReport('review', 'daily') }, { label: 'Send the daily site report', fn: () => sendReport('site', 'daily') }
        );
        ((S.external.jobs && S.external.jobs.jobs) || []).forEach((j) => list.push({ label: `Run ${j.name}`, hint: j.schedule, fn: () => runJob(j.name) }));
        LINKS.forEach(([label, url]) => list.push({ label, fn: () => window.open(url, '_blank', 'noopener') }));
        return list;
    }

    function palette(open) {
        const box = $('.jv-palette');
        box.hidden = !open;
        if (!open) return;
        const input = $('#jv-cmd');
        input.value = '';
        paint('');
        input.focus();
    }

    function paint(text) {
        const t = text.trim().toLowerCase();
        const words = t.split(/\s+/).filter(Boolean);
        const all = commands();
        const hits = (words.length ? all.filter((c) => words.every((w) => c.label.toLowerCase().includes(w))) : all).slice(0, 12);
        if (t) hits.push({ label: `Ask Jarvis: “${text.trim()}”`, fn: () => run(C.parseCommand(text)) });
        S.hits = hits;
        S.hit = 0;
        $('#jv-cmd-list').innerHTML = hits.map((c, i) => `<li role="option" data-hit="${i}" aria-selected="${i === 0}"><span>${esc(c.label)}</span>${c.hint ? `<kbd>${esc(c.hint)}</kbd>` : ''}</li>`).join('');
    }

    function choose(i) {
        const c = (S.hits || [])[i];
        palette(false);
        if (c) c.fn();
    }

    async function webShare() {
        const data = { title: 'Jarvis briefing', text: briefText(S.product).slice(0, 1500), url: link() };
        if (navigator.share) { try { await navigator.share(data); } catch (error) { /* closed */ } } else copy(data.text + '\n' + data.url, 'Briefing and link copied.');
    }

    async function sendReport(kind, period) {
        if (!confirmRun(`send the ${period} ${kind === 'site' ? 'site' : 'URL Review'} report now`)) return;
        const out = await call('send-report', { kind, period });
        toast(out.ok ? out.note : 'Report failed: ' + out.error, 5000);
    }

    // --- settings: goals, thresholds and email, saved through the jarvis function ------------------------------

    function draftSettings() {
        const s = S.settings || {};
        return { goals: (s.goals || []).map((g) => Object.assign({}, g)), thresholds: C.thresholds(s.thresholds), mail: Object.assign({ daily: true, gemini: true, watch: true, weekly: true }, s.mail || {}), searchQueries: (s.searchQueries || []).slice(),
            actions: { auto: !(s.actions && s.actions.auto === false), caps: Object.assign({}, ACTION_CAPS, (s.actions || {}).caps) } };
    }

    function goalEditor(g, i) {
        const products = Object.keys(C.GOAL_METRICS);
        const metrics = C.GOAL_METRICS[g.product] || C.GOAL_METRICS.cv;
        const opt = (value, label, on) => `<option value="${esc(value)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
        return `<div class="jv-goal-edit" data-goal="${i}">
            <select name="g-product" aria-label="Product" data-menu-ready="1">${products.map((k) => opt(k, (C.PRODUCTS.find((p) => p.key === k) || {}).name, k === g.product)).join('')}</select>
            <select name="g-metric" aria-label="Metric" data-menu-ready="1">${Object.keys(metrics).map((k) => opt(k, metrics[k], k === g.metric)).join('')}</select>
            <select name="g-period" aria-label="Period" data-menu-ready="1">${Object.keys(C.GOAL_PERIODS).map((k) => opt(k, C.GOAL_PERIODS[k], k === g.period)).join('')}</select>
            <input name="g-target" type="number" min="0.01" step="any" value="${esc(g.target || '')}" aria-label="Target" placeholder="Target">
            <button type="button" class="jv-btn small" data-goal-remove="${i}" aria-label="Remove goal">✕</button></div>`;
    }

    function paintSettings(d) {
        const th = C.THRESHOLDS;
        $('.jv-settings-box').innerHTML = `<header><h3>Jarvis settings</h3><button type="button" class="jv-btn small" data-settings-close aria-label="Close">✕</button></header>
            <section><h4>Email</h4>
              <label class="jv-check"><input type="checkbox" name="m-daily"${d.mail.daily ? ' checked' : ''}> Daily briefing at 07:40 (Bogotá): the last 24 hours, goals and alerts</label>
              <label class="jv-check"><input type="checkbox" name="m-gemini"${d.mail.gemini ? ' checked' : ''}> Add the Gemini summary to the daily briefing</label>
              <label class="jv-check"><input type="checkbox" name="m-watch"${d.mail.watch ? ' checked' : ''}> Watch every hour and mail an alert once a day per issue (pages down, TLS, failed jobs, failed runs)</label>
              <label class="jv-check"><input type="checkbox" name="m-weekly"${d.mail.weekly ? ' checked' : ''}> Weekly strategy on Sunday at 19:00 (Bogotá): four weeks side by side, the proposals and the plan for next week</label>
              <div class="jv-actions"><button type="button" class="jv-btn" data-act="daily-now">Send today's briefing now</button><button type="button" class="jv-btn" data-act="weekly-now">Send the weekly strategy now</button></div></section>
            <section><h4>Actions</h4>
              <label class="jv-check"><input type="checkbox" name="a-auto"${d.actions.auto ? ' checked' : ''}> Let Jarvis run the safe actions on its own every hour, within these daily caps</label>
              <div class="jv-th-grid">${Object.keys(ACTION_CAPS).map((k) => `<label class="jv-field">${esc(ACTION_LABELS[k].replace(/^./, (c) => c.toUpperCase()))} per day<input type="number" name="a-cap-${k}" min="0" max="100" step="1" value="${esc(d.actions.caps[k])}"></label>`).join('')}</div>
              <p class="jv-note">Held re-runs go out on their own only when clean (a complete report with a score). Owner notices keep Monday-Saturday 08:00-19:00 Bogotá, three tries and the daily notice budget, even when you click.</p></section>
            <section><h4>Goals</h4><div class="jv-goal-list">${d.goals.map(goalEditor).join('') || '<p class="jv-note">No goals yet. Add one: a product, what to count, the period, and the target.</p>'}</div>
              <div class="jv-actions"><button type="button" class="jv-btn" data-goal-add>Add a goal</button></div>
              <p class="jv-note">Goals count every row on the server (tests included) over the current Bogotá day, week (from Monday) or month.</p></section>
            <section><h4>Thresholds</h4><div class="jv-th-grid">${Object.keys(th).map((k) => `<label class="jv-field">${esc(th[k].label)}<input type="number" name="t-${k}" min="${th[k].min}" max="${th[k].max}" step="any" value="${esc(d.thresholds[k])}"></label>`).join('')}</div>
              <div class="jv-actions"><button type="button" class="jv-btn small" data-th-reset>Back to the defaults</button></div></section>
            <section><h4>Search rankings</h4><label class="jv-field">Searches to rank on Brave, one per line (up to 8)<textarea name="s-queries" rows="5" placeholder="${esc(C.SEARCH_QUERIES.join('\n'))}">${esc((d.searchQueries || []).join('\n'))}</textarea></label>
              <p class="jv-note">Left empty, Jarvis checks the default searches shown. Brave is asked once a day.</p></section>
            <footer><span class="jv-note">${S.settings && S.settings.updatedAt ? 'Saved ' + esc(when(S.settings.updatedAt)) : 'Using the defaults'}</span><button type="button" class="jv-btn" data-settings-close>Cancel</button><button type="submit" class="jv-btn is-primary">Save</button></footer>`;
    }

    function readSettings() {
        const form = $('.jv-settings-box');
        const val = (name) => (form.querySelector(`[name="${name}"]`) || {});
        const goals = Array.from(form.querySelectorAll('[data-goal]')).map((row) => ({
            product: row.querySelector('[name="g-product"]').value, metric: row.querySelector('[name="g-metric"]').value,
            period: row.querySelector('[name="g-period"]').value, target: Number(row.querySelector('[name="g-target"]').value)
        }));
        const thresholds = {};
        Object.keys(C.THRESHOLDS).forEach((k) => { thresholds[k] = Number(val('t-' + k).value); });
        const searchQueries = String(val('s-queries').value || '').split('\n').map((q) => q.trim()).filter(Boolean).slice(0, 8);
        return { goals, thresholds, mail: { daily: !!val('m-daily').checked, gemini: !!val('m-gemini').checked, watch: !!val('m-watch').checked, weekly: !!val('m-weekly').checked }, searchQueries,
            actions: { auto: !!val('a-auto').checked, caps: Object.keys(ACTION_CAPS).reduce((m, k) => { m[k] = Number(val('a-cap-' + k).value); return m; }, {}) } };
    }

    function openSettings() {
        palette(false);
        paintSettings(draftSettings());
        $('.jv-settings').hidden = false;
        const first = $('.jv-settings-box input, .jv-settings-box select');
        if (first) first.focus();
    }

    function closeSettings() { $('.jv-settings').hidden = true; }

    async function saveSettings() {
        const settings = readSettings();
        const bad = settings.goals.filter((g) => !(g.target > 0));
        if (bad.length) { toast('Every goal needs a target above 0.', 4000); return; }
        toast('Saving…');
        const out = await call('settings-save', { settings });
        if (!out.ok) { toast('Not saved: ' + (out.error || 'no answer'), 5000); return; }
        S.settings = out;
        closeSettings();
        toast('Saved. Jarvis is recounting the goals.');
        compute();
        render();
        loadExternal(['goals']);
    }

    async function dailyNow() {
        if (!confirmRun('email the daily briefing now (the last 24 hours)')) return;
        toast('Building the daily briefing…', 30000);
        const out = await call('daily-now');
        toast(out.ok && out.sent ? `Daily briefing sent: ${out.items} lines${out.gemini ? ' with the Gemini summary' : ''}.` : 'Not sent: ' + (out.error || 'mail is not set up'), 6000);
    }

    async function weeklyNow() {
        if (!confirmRun('email the weekly strategy now (the last four weeks)')) return;
        toast('Building the weekly strategy…', 60000);
        const out = await call('weekly-now');
        toast(out.ok && out.sent ? `Weekly strategy sent: ${out.proposals} proposals${out.gemini ? ' with the Gemini plan' : ''}.` : 'Not sent: ' + (out.error || 'mail is not set up'), 6000);
    }

    function toggleLive() {
        S.live = !S.live;
        $('.jv-live').setAttribute('aria-pressed', String(S.live));
        root.classList.toggle('is-paused', !S.live);
        toast(S.live ? 'Live updates on.' : 'Live updates paused.');
    }

    // --- events ---------------------------------------------------------------------------------------------

    root.addEventListener('click', (event) => {
        const t = event.target.closest('button, a, li[data-hit]');
        if (!t || !root.contains(t)) return;
        if (t.dataset.hit !== undefined) { choose(Number(t.dataset.hit)); return; }
        if (t.dataset.settingsClose !== undefined) { closeSettings(); return; }
        if (t.dataset.goalAdd !== undefined) { const d = readSettings(); d.goals.push({ product: 'cv', metric: 'visits', period: 'week', target: '' }); paintSettings(d); return; }
        if (t.dataset.goalRemove !== undefined) { const d = readSettings(); d.goals.splice(Number(t.dataset.goalRemove), 1); paintSettings(d); return; }
        if (t.dataset.thReset !== undefined) { const d = readSettings(); d.thresholds = C.thresholds({}); paintSettings(d); return; }
        if (t.dataset.menu) { const list = $(`[data-list="${t.dataset.menu}"]`); const open = list.hidden; $$('.jv-menu-list').forEach((l) => { l.hidden = true; }); list.hidden = !open; return; }
        $$('.jv-menu-list').forEach((l) => { l.hidden = true; });
        if (t.dataset.proposal) { markProposal(t.dataset.key, t.dataset.proposal); return; }
        if (t.dataset.runAction) { runAction(t.dataset.runAction, t.dataset.job, t.dataset.key); return; }
        if (t.dataset.socialDecide) { decideSocial(t.dataset.key, t.dataset.socialDecide); return; }
        if (t.dataset.noticeSend || t.dataset.noticeDrop) { decideNotice(t.dataset.noticeSend || t.dataset.noticeDrop, !!t.dataset.noticeSend); return; }
        if (t.dataset.go) { go(t.dataset.go); return; }
        if (t.dataset.mail) { S.mail = t.dataset.mail; compute(); render(); return; }
        if (t.dataset.run) { runJob(t.dataset.run); return; }
        if (t.dataset.report) { const [kind, period] = t.dataset.report.split(':'); sendReport(kind, period); return; }
        if (t.dataset.panelExport) {
            const p = S.panels.get(t.dataset.panel);
            if (!p) return;
            const rows = Array.isArray(p.rows) ? p.rows.filter(Boolean) : [];
            if (t.dataset.panelExport === 'csv') download(`jarvis-${t.dataset.panel}-${stamp()}.csv`, 'text/csv', C.csv(rows.map((r) => (typeof r === 'object' ? r : { value: r }))));
            else if (t.dataset.panelExport === 'json') download(`jarvis-${t.dataset.panel}-${stamp()}.json`, 'application/json', JSON.stringify({ title: p.title, range: S.range, rows }, null, 2));
            else panelPng(p.title, rows);
            return;
        }
        const act = t.dataset.act;
        const acts = {
            systems: () => go('systems'), live: toggleLive, refresh: () => refresh(), speak: speakBriefing, listen, palette: () => palette(true),
            'copy-link': () => copy(link(), 'Link copied.'), 'web-share': webShare, 'copy-brief': () => copy(markdown(), 'Briefing copied.'), email: emailBriefing,
            'export-json': exportAll, 'export-csv': () => run({ type: 'export', format: 'csv' }), 'export-png': () => run({ type: 'export', format: 'png' }),
            'export-md': () => download(`jarvis-briefing-${stamp()}.md`, 'text/markdown', markdown()), print: () => printView(false), 'print-all': () => printView(true), 'ai-brief': aiBrief,
            settings: openSettings, 'daily-now': dailyNow, 'weekly-now': weeklyNow, proposals: loadProposals, 'social-post-now': postNow
        };
        if (acts[act]) acts[act]();
    });

    root.addEventListener('change', (event) => {
        if (event.target.name !== 'g-product') return;
        const d = readSettings();
        const i = Number(event.target.closest('[data-goal]').dataset.goal);
        d.goals[i].metric = Object.keys(C.GOAL_METRICS[d.goals[i].product])[0];
        paintSettings(d);
    });

    root.addEventListener('submit', async (event) => {
        const form = event.target;
        event.preventDefault();
        if (form.dataset.settings !== undefined) { saveSettings(); return; }
        if (form.dataset.ask !== undefined) {
            const q = form.q.value.trim();
            if (q) run(C.parseCommand(q).type === 'ask' ? { type: 'ask', question: q } : C.parseCommand(q));
        } else if (form.dataset.unlist !== undefined) {
            const hostName = form.host.value.trim();
            if (!hostName || !confirmRun(`unlist ${hostName} from Live Reports`)) return;
            const out = await call('unlist', { host: hostName });
            toast(out.ok ? `${out.unlisted} is unlisted.` : 'Unlist failed: ' + out.error, 5000);
            if (out.ok) form.reset();
        }
    });

    $('#jv-range').addEventListener('change', (event) => setRange(event.target.value));
    $('#jv-cmd').addEventListener('input', (event) => paint(event.target.value));
    $('#jv-cmd').addEventListener('keydown', (event) => {
        const items = $$('#jv-cmd-list li');
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            S.hit = (S.hit + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length);
            items.forEach((li, i) => li.setAttribute('aria-selected', String(i === S.hit)));
        } else if (event.key === 'Enter') { event.preventDefault(); choose(S.hit || 0); } else if (event.key === 'Escape') palette(false);
    });
    $('.jv-palette').addEventListener('click', (event) => { if (event.target.classList.contains('jv-palette')) palette(false); });

    const visible = () => host.offsetParent !== null && !host.closest('.hidden');
    function onKey(event) {
        if (!visible()) return;
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((event.target || {}).tagName || '') || (event.target && event.target.isContentEditable);
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); palette($('.jv-palette').hidden); return; }
        if (event.key === 'Escape') { palette(false); closeSettings(); return; }
        if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
        if (/^[1-9]$/.test(event.key) && C.PRODUCTS[Number(event.key) - 1]) go(C.PRODUCTS[Number(event.key) - 1].key);
        else if (event.key === 'r') refresh();
        else if (event.key === 'p') printView(false);
        else if (event.key === 'g') openSettings();
        else if (event.key === '/') { const ask = $(`[data-view="${S.product}"] .jv-ask input`); if (ask) { event.preventDefault(); ask.focus(); } }
    }
    document.addEventListener('keydown', onKey);
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => { S.voice = null; voice(); };

    S.timers.push(setInterval(() => {
        const node = $('#jv-ago');
        if (node && S.updatedAt) node.textContent = S.live ? 'live · ' + ago(Date.now() - S.updatedAt) : 'paused';
    }, 1000));
    S.timers.push(setInterval(() => {
        if (!S.live || document.hidden || !visible() || !S.mounted) return;
        loadNewer();
        if (Date.now() - S.externalAt > EXTERNAL_MS) loadExternal(['goals', 'health', 'jobs', 'github', 'uptime']);
    }, LIVE_MS));

    return {
        show() {
            greet();
            if (!S.mounted) { S.mounted = true; refresh(); } else { compute(); render(); }
            writeHash();
        },
        inboxChanged() { if (S.mounted) { compute(); render(); } },
        state: S,
        run,
        destroy() {
            S.timers.forEach(clearInterval);
            document.removeEventListener('keydown', onKey);
            const icon = document.querySelector('link[data-jv-icon]');
            if (icon) icon.remove();
            document.title = pageTitle;
        }
    };
}
