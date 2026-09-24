(function (global) {
    const KEY = 'theme';
    const CHANNEL = 'cv-theme';
    let channel = null;
    let booted = false;

    try {
        channel = new BroadcastChannel(CHANNEL);
    } catch (e) { /* ignore */ }

    function isDark() {
        return document.documentElement.classList.contains('dark-mode');
    }

    function resolve() {
        try {
            const saved = localStorage.getItem(KEY);
            if (saved === 'dark') return true;
            if (saved === 'light') return false;
        } catch (e) { /* ignore */ }
        return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    }

    function apply(dark, persist) {
        const next = !!dark;
        document.documentElement.classList.toggle('dark-mode', next);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', next ? '#0c1118' : '#eef2f4');
        if (persist) {
            try { localStorage.setItem(KEY, next ? 'dark' : 'light'); } catch (e) { /* ignore */ }
            try { if (channel) channel.postMessage(next ? 'dark' : 'light'); } catch (e) { /* ignore */ }
        }
        document.dispatchEvent(new CustomEvent('cv-theme-change', { detail: { dark: next } }));
    }

    function toggle() {
        apply(!isDark(), true);
        return isDark();
    }

    function boot() {
        apply(resolve(), false);
        if (booted) return;
        booted = true;
        global.addEventListener('storage', (event) => {
            if (event.key !== KEY) return;
            if (event.newValue === 'dark') apply(true, false);
            else if (event.newValue === 'light') apply(false, false);
        });
        if (channel) {
            channel.onmessage = (event) => {
                const next = event.data === 'dark';
                if (next === isDark()) return;
                apply(next, false);
            };
        }
    }

    global.SiteTheme = { KEY, isDark: isDark, resolve: resolve, apply: apply, toggle: toggle, boot: boot };
})(window);
