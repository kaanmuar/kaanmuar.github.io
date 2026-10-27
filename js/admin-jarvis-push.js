/*
 * Jarvis in the browser (#1671): this browser's Web Push subscription and its push kinds, the card a push
 * shows inside the page when Jarvis is in front, and the reply box that a Reply button opens.
 * The service worker is /jarvis-sw.js; the server side is functions/jarvis-webpush.js.
 */
const SW = '/jarvis-sw.js';
const KINDS_KEY = 'jv-push-kinds';

export const PUSH_KINDS = [
    ['alerts', 'Alerts', 'Pages down, TLS, failed jobs and runs, a backup that did not start'],
    ['briefing', 'Daily briefing', 'The 07:40 briefing, with Done and Dismiss for the top proposal'],
    ['money', 'Payments', 'Each live PayPal payment'],
    ['reviews', 'New reviews', "A customer's review finished"],
    ['inbox', 'Inbox', 'CV messages, CV feedback and site owners\u2019 replies'],
    ['desk', 'Review desk', 'Runs as they go, held re-runs, comparisons, runs that need you'],
    ['outreach', 'Outreach notices', 'Each notice waiting, with Send and Skip'],
    ['social', 'Social posts', 'Each post Jarvis proposes, with Post and Skip'],
    ['codes', 'Sign-in codes', 'Codes and confirm links mailed to qa@ and the channel addresses']
];

function keyBytes(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function browserName(ua) {
    const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const os = /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'PC';
    return b + ' on ' + os;
}

/** The push's tab ("products:inbox", "systems") as a Jarvis product key, or ''. */
export function productOf(tab, keys) {
    const key = String(tab || '').replace(/^products:/, '');
    return keys.includes(key) ? key : '';
}

export function createBrowserPush({ call, toast, esc }) {
    const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;

    const savedKinds = () => { try { return JSON.parse(localStorage.getItem(KINDS_KEY) || '{}'); } catch (error) { return {}; } };

    async function subscription() {
        if (!supported) return null;
        const reg = await navigator.serviceWorker.getRegistration(SW);
        return reg ? reg.pushManager.getSubscription() : null;
    }

    async function register(kinds) {
        const key = await call('web-push-key');
        if (!key.ok) throw new Error(key.error || 'No key from Jarvis.');
        const reg = await navigator.serviceWorker.register(SW);
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key.publicKey) });
        const out = await call('register-device', { subscription: sub.toJSON(), name: browserName(navigator.userAgent), kinds });
        if (!out.ok) throw new Error(out.error || 'Not registered.');
        localStorage.setItem(KINDS_KEY, JSON.stringify(out.kinds || kinds));
    }

    async function enable() {
        if (!supported) throw new Error('This browser has no web push.');
        if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in the browser\u2019s site settings.');
        await register(savedKinds());
    }

    async function disable() {
        const sub = await subscription();
        if (!sub) return;
        await call('unregister-device', { endpoint: sub.endpoint });
        await sub.unsubscribe();
    }

    async function setKind(kind, on) {
        const kinds = Object.assign(savedKinds(), { [kind]: on });
        localStorage.setItem(KINDS_KEY, JSON.stringify(kinds));
        if (await subscription()) await register(kinds);
    }

    async function test() {
        const sub = await subscription();
        if (!sub) throw new Error('Turn notifications on first.');
        const out = await call('test-push', { endpoint: sub.endpoint });
        if (!out.ok) throw new Error(out.error || 'Not sent.');
    }

    /** Fills the settings section; it repaints after each change. */
    async function paint(node) {
        if (!node) return;
        if (!supported) { node.innerHTML = '<h4>Notifications on this browser</h4><p class="jv-note">This browser has no web push. Use Chrome.</p>'; return; }
        const on = !!(await subscription()) && Notification.permission === 'granted';
        const kinds = savedKinds();
        node.innerHTML = `<h4>Notifications on this browser</h4>
            <p class="jv-note">${on ? 'On for ' + esc(browserName(navigator.userAgent)) + '. Chrome shows two buttons per notification; with Jarvis in front, a push shows here instead.' : Notification.permission === 'denied' ? 'Blocked for this site in the browser settings.' : 'Off. Pushes reach this browser even with the admin tab closed, while the browser runs.'}</p>
            ${on ? PUSH_KINDS.map(([k, label, what]) => `<label class="jv-check"><input type="checkbox" data-bp-kind="${k}"${kinds[k] === false ? '' : ' checked'}> ${esc(label)}: ${esc(what)}</label>`).join('') : ''}
            <div class="jv-actions">${on ? '<button type="button" class="jv-btn" data-bp="test">Send a test</button><button type="button" class="jv-btn danger" data-bp="off">Turn off</button>' : '<button type="button" class="jv-btn is-primary" data-bp="on">Turn on notifications</button>'}</div>`;
    }

    async function handle(node, act) {
        try {
            if (act === 'on') { toast('Turning on…'); await enable(); toast('Notifications are on for this browser.'); }
            else if (act === 'off') { await disable(); toast('Notifications are off for this browser.'); }
            else if (act === 'test') { await test(); toast('Test sent.'); }
        } catch (error) { toast('Not done: ' + error.message, 6000); }
        paint(node);
    }

    async function kindChanged(kind, on) {
        try { await setKind(kind, on); } catch (error) { toast('Not saved: ' + error.message, 6000); }
    }

    return { supported, paint, handle, kindChanged };
}
