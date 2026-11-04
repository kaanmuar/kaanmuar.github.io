(function (root) {
    const MEASUREMENT_ID = 'G-J8GNF5380F';
    const seen = new Set();
    let site = 'cv';
    let dbPromise = null;
    const firebaseConfig = {
        apiKey: "AIzaSyA2-6WkecV3GoAK4qlsdGtH3jisjk3bK0w",
        authDomain: "carlosm-interactive-cv.firebaseapp.com",
        projectId: "carlosm-interactive-cv",
        storageBucket: "carlosm-interactive-cv.firebasestorage.app",
        messagingSenderId: "976558418058",
        appId: "1:976558418058:web:1dc19bcd40915ea233e573"
    };
    const KINDS = {
        visit: 'visit',
        export_cv: 'export',
        print_cv: 'export',
        lab_report: 'export',
        studio_report: 'export',
        lab_run: 'run',
        share_cv: 'click',
        open_simulator: 'click',
        open_qa_lab: 'click',
        open_contact_widget: 'click',
        submit_message: 'click',
        submit_rating: 'click',
        sim_run_sprint: 'click',
        sim_sprint_complete: 'click',
        site_tour_start: 'click',
        qa_review_start: 'run',
        qa_review_done: 'run',
        qa_review_stop: 'click',
        qa_review_share: 'click',
        qa_review_pay_open: 'click',
        qa_review_pay_view: 'click',
        qa_review_checkout: 'click',
        qa_review_pay_result: 'click',
        qa_review_legal_country: 'click',
        qa_review_blocked: 'click',
        qa_review_terms: 'click',
        qa_review_follow_up: 'click',
        qa_review_reason: 'click',
        qa_review_frameworks: 'click',
        qa_review_scope: 'click',
        qa_review_tools: 'click',
        qa_review_print: 'click',
        qa_review_news: 'click',
        qa_review_alerts: 'click',
        qa_review_credentials: 'click',
        qa_review_cases: 'click',
        qa_review_language_change: 'click',
        qa_review_account_enter: 'click',
        qa_review_account_stop: 'click',
        qa_review_sign_in: 'click',
        qa_review_sign_in_failed: 'click',
        qa_review_sign_in_needed: 'click',
        qa_review_deal_shown: 'click',
        qa_review_live_open: 'click',
        qa_review_live_filter: 'click',
        qa_review_live_nav: 'click',
        hub_view: 'view',
        post_view: 'view',
        hub_open: 'click',
        hub_play: 'click',
        hub_copy: 'click',
        hub_share: 'click',
        hub_download: 'click',
        hub_report: 'click',
        post_play: 'click',
        post_copy: 'click',
        post_share: 'click',
        post_download: 'click',
        post_report: 'click',
        post_related: 'click',
        open_url_review: 'click',
        open_clip: 'click',
        company_site: 'click'
    };

    function ready() {
        return typeof root.gtag === 'function';
    }

    function boardName() {
        return site === 'review' ? 'url-review' : 'cv';
    }

    function track(eventName, params) {
        if (!ready() || !eventName) return;
        root.gtag('event', eventName, Object.assign({ board: boardName(), site: site }, params || {}));
    }

    function database() {
        if (!dbPromise) {
            dbPromise = Promise.all([
                import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
                import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
            ]).then(([appMod, fs]) => {
                const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
                return { fs: fs, db: fs.getFirestore(app) };
            }).catch((error) => {
                dbPromise = null;
                throw error;
            });
        }
        return dbPromise;
    }

    const PLAIN_VISIT_LABELS = { cv: 1, studio: 1, lab: 1, popup: 1, direct: 1 };

    function pageQuery() {
        const privateParams = ['report', 'signin', 'key', 'state', 'code', 'scope', 'error', 'error_description', 'error_uri', 'iss'];
        try {
            const params = new URLSearchParams(root.location.search || '');
            privateParams.forEach((name) => params.delete(name));
            const text = params.toString();
            const query = (text ? '?' + text : '').slice(0, 120);
            return /^[A-Za-z0-9=&%_.?+-]*$/.test(query) ? query : '';
        } catch (e) {
            return '';
        }
    }

    function cvRefCode(raw) {
        const code = String(raw || '').trim().toLowerCase();
        if (!code || code.length > 40 || PLAIN_VISIT_LABELS[code]) return '';
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) return '';
        return code;
    }

    function readCvRef() {
        const host = root.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return '';
        try {
            return cvRefCode(new URLSearchParams(root.location.search).get('cvref'));
        } catch (e) {
            return '';
        }
    }

    function record(kind, name, label) {
        if (root.top !== root.self || navigator.webdriver || /HeadlessChrome|Cypress|Electron\//.test(navigator.userAgent)) return;
        const host = root.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return;
        const visitCode = kind === 'visit' ? readCvRef() : '';
        const storedLabel = visitCode || (label == null ? '' : label);
        let referrerHost = '';
        try { referrerHost = document.referrer ? new URL(document.referrer).host : ''; } catch (e) { referrerHost = ''; }
        const row = {
            site: site,
            kind: kind,
            name: String(name).slice(0, 40),
            label: String(storedLabel).slice(0, 80),
            lang: String(document.documentElement.lang || 'en').slice(0, 12),
            referrerHost: referrerHost.slice(0, 80),
            screen: (root.innerWidth || 0) < 768 ? 'phone' : 'desktop',
            page: ((root.location.pathname || '').split('/').pop() || 'index.html').slice(0, 80),
            title: String(document.title || '').slice(0, 120),
            timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone || '').slice(0, 60),
            languages: (navigator.languages || []).slice(0, 6).join(',').slice(0, 80)
        };
        if (kind === 'visit') row.query = pageQuery();
        database().then(({ fs, db }) => {
            row.createdAt = fs.serverTimestamp();
            return fs.addDoc(fs.collection(db, 'site_events'), row);
        }).catch(() => {});
    }

    function event(eventName, category, label, extra) {
        const payload = Object.assign({
            event_category: category || 'Engagement',
            event_label: label == null ? '' : String(label)
        }, extra || {});
        track(eventName, payload);
        const kind = KINDS[eventName];
        if (kind) record(kind, eventName, label);
    }

    function once(key, eventName, category, label, extra) {
        if (seen.has(key)) return;
        seen.add(key);
        event(eventName, category, label, extra);
    }

    function page(path, title) {
        if (!ready()) return;
        root.gtag('event', 'page_view', {
            page_path: path || root.location.pathname,
            page_title: title || document.title,
            page_location: root.location.href,
            board: boardName(),
            site: site
        });
    }

    function bind(name) {
        if (name === 'cv' || name === 'studio' || name === 'lab' || name === 'review') site = name;
    }

    function hideCvRef() {
        const host = root.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return;
        try {
            const url = new URL(root.location.href);
            if (!url.searchParams.has('cvref')) return;
            url.searchParams.delete('cvref');
            const next = url.pathname + url.search + url.hash;
            root.history.replaceState(root.history.state, '', next || '/');
        } catch (e) {}
    }

    function noteVisit(options) {
        const key = 'site-noted-' + site;
        try {
            if (sessionStorage.getItem(key) === '1') {
                hideCvRef();
                return;
            }
            sessionStorage.setItem(key, '1');
        } catch (e) { return; }
        if (options && options.stored) {
            track('visit', { event_category: 'Visit', event_label: readCvRef() || site });
            hideCvRef();
            return;
        }
        event('visit', 'Visit', readCvRef() || site);
        hideCvRef();
    }

    const SOCIAL_HOSTS = {
        'youtube.com': 'YouTube', 'x.com': 'X', 'twitter.com': 'X', 'linkedin.com': 'LinkedIn',
        'tiktok.com': 'TikTok', 'dev.to': 'DEV', 'reddit.com': 'Reddit', 'github.com': 'GitHub'
    };

    // Share buttons and links with their own data-analytics-event / data-track already report.
    document.addEventListener('click', (e) => {
        const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!link || link.closest('[data-analytics-event], [data-track]')) return;
        let url;
        try { url = new URL(link.href); } catch (err) { return; }
        const network = SOCIAL_HOSTS[url.hostname.replace(/^www\./, '')];
        if (!network || /share|intent|submit/i.test(url.pathname)) return;
        track('social_click', { event_category: 'Social', event_label: network, link_url: url.origin + url.pathname });
    }, true);

    // Pages that load this file with defer put a stub in its place first; calls made before it ran are replayed.
    const queued = root.SiteAnalytics && Array.isArray(root.SiteAnalytics.q) ? root.SiteAnalytics.q : [];
    root.SiteAnalytics = {
        id: MEASUREMENT_ID,
        track,
        event,
        trackEvent: event,
        once,
        page,
        bind,
        noteVisit
    };
    queued.forEach(([name, args]) => root.SiteAnalytics[name].apply(null, args));
}(window));
