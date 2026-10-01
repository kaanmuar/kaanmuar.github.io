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
        sim_loaded: 'visit',
        export_cv: 'export',
        print_cv: 'export',
        lab_report: 'export',
        lab_run: 'run',
        share_cv: 'click',
        open_simulator: 'click',
        open_qa_lab: 'click',
        open_contact_widget: 'click',
        submit_message: 'click',
        submit_rating: 'click',
        sim_run_sprint: 'click',
        sim_sprint_complete: 'click'
    };

    function ready() {
        return typeof root.gtag === 'function';
    }

    function track(eventName, params) {
        if (!ready() || !eventName) return;
        root.gtag('event', eventName, params || {});
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

    function record(kind, name, label) {
        if (root.top !== root.self || navigator.webdriver) return;
        const host = root.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return;
        let referrerHost = '';
        try { referrerHost = document.referrer ? new URL(document.referrer).host : ''; } catch (e) { referrerHost = ''; }
        database().then(({ fs, db }) => fs.addDoc(fs.collection(db, 'site_events'), {
            site: site,
            kind: kind,
            name: String(name).slice(0, 40),
            label: String(label == null ? '' : label).slice(0, 80),
            lang: String(document.documentElement.lang || 'en').slice(0, 12),
            referrerHost: referrerHost.slice(0, 80),
            screen: (root.innerWidth || 0) < 768 ? 'phone' : 'desktop',
            createdAt: fs.serverTimestamp()
        })).catch(() => {});
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
            page_location: root.location.href
        });
    }

    function bind(name) {
        if (name === 'cv' || name === 'studio' || name === 'lab') site = name;
    }

    function noteVisit() {
        const key = 'site-noted-' + site;
        try {
            if (sessionStorage.getItem(key) === '1') return;
            sessionStorage.setItem(key, '1');
        } catch (e) { return; }
        event('visit', 'Visit', site);
    }

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
}(window));
