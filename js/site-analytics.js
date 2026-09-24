(function (root) {
    const MEASUREMENT_ID = 'G-J8GNF5380F';
    const seen = new Set();

    function ready() {
        return typeof root.gtag === 'function';
    }

    function track(eventName, params) {
        if (!ready() || !eventName) return;
        root.gtag('event', eventName, params || {});
    }

    function event(eventName, category, label, extra) {
        const payload = Object.assign({
            event_category: category || 'Engagement',
            event_label: label == null ? '' : String(label)
        }, extra || {});
        track(eventName, payload);
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

    root.SiteAnalytics = {
        id: MEASUREMENT_ID,
        track,
        event,
        trackEvent: event,
        once,
        page
    };
}(window));
