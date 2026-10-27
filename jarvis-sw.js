/*
 * Jarvis in the browser (#1671): shows the pushes functions/jarvis-webpush.js sends. When an admin tab is
 * in front, the page shows a toast instead. Buttons carry a signature, so they run without a sign-in;
 * Reply opens Jarvis with the reply box. No fetch handler: this worker never touches page loads.
 */
const ENDPOINT = 'https://us-central1-carlosm-interactive-cv.cloudfunctions.net/jarvis';
const ADMIN = '/admin.html';
const ICON = '/assets/app-icon-192.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function text(msg) {
    const lines = (msg.lines || []).filter(Boolean);
    return [msg.body].concat(lines.slice(0, 3)).filter(Boolean).join('\n');
}

function show(msg, body, actions) {
    return self.registration.showNotification(msg.title || 'Jarvis', {
        body,
        tag: msg.tag || msg.kind || 'jarvis',
        renotify: !msg.quiet && !!actions,
        silent: !!msg.quiet || !actions,
        icon: ICON,
        badge: ICON,
        data: msg,
        actions: (actions || []).map((a) => ({ action: a.act, title: a.label }))
    });
}

async function frontTab() {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    return tabs.find((c) => c.focused && c.visibilityState === 'visible' && new URL(c.url).pathname === ADMIN) || null;
}

self.addEventListener('push', (event) => {
    let msg = {};
    try { msg = event.data ? event.data.json() : {}; } catch (error) { msg = { title: 'Jarvis', body: event.data ? event.data.text() : '' }; }
    event.waitUntil((async () => {
        const tab = await frontTab();
        if (tab) { tab.postMessage({ jarvisPush: msg }); return; }
        await show(msg, text(msg), msg.actions || []);
    })());
});

function openUrl(msg, extra) {
    if (extra) return ADMIN + '?jarvis=' + extra;
    if (msg.url) return msg.url;
    return ADMIN + '?jarvis=' + encodeURIComponent(msg.tab || 'overview');
}

async function focusOrOpen(url) {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const admin = tabs.find((c) => new URL(c.url).pathname === ADMIN);
    if (admin && url.startsWith(ADMIN)) {
        await admin.focus();
        admin.postMessage({ jarvisOpen: url });
        return;
    }
    await self.clients.openWindow(url);
}

/** Runs a signed button and shows the outcome in the same notification. */
async function run(msg, button) {
    await show(msg, 'Working…', null);
    let out;
    try {
        const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'notify-act', ref: msg.ref, act: button.act, exp: button.exp, sig: button.sig }) });
        out = await res.json();
    } catch (error) {
        out = { ok: false, error: 'No answer from Jarvis.' };
    }
    await show(msg, out.ok ? (out.message || 'Done.') : "Didn't work: " + (out.error || 'no answer.'), out.ok ? null : [Object.assign({}, button, { label: 'Retry' })]);
}

self.addEventListener('notificationclick', (event) => {
    const msg = event.notification.data || {};
    event.notification.close();
    const button = (msg.actions || []).find((a) => a.act === event.action);
    if (!button) { event.waitUntil(focusOrOpen(openUrl(msg))); return; }
    if (button.input || !button.sig) {
        const reply = new URLSearchParams({ ref: msg.ref || '', title: msg.title || '', body: msg.body || '' });
        event.waitUntil(focusOrOpen(openUrl(msg, 'reply&' + reply.toString())));
        return;
    }
    event.waitUntil(run(msg, button));
});
