(function (global) {
    const KEY = 'site-look';
    const PREVIOUS_KEY = 'site-look-previous';
    const CHANNEL = 'cv-look';

    const LOOKS = [
        {
            id: 'golden',
            name: 'Golden Gate',
            source: 'Apple · macOS 27',
            note: 'Frosted glass, bridge light, and softer corners.',
            radius: '22px',
            blur: '28px',
            accent: '#0d6e76',
            light: surface('#e7eef2', '#f7f4ee', '#e4ebf0', 'linear-gradient(165deg, #f6efe2 0%, #e7eef2 38%, #d5e3ea 70%, #f0d7c2 100%)', '#f3ebe2', 'linear-gradient(180deg, #f6efe2 0%, #e7eef2 42%, #d5e3ea 74%, #f0d7c2 100%)'),
            dark: surface('#10161d', '#1a140e', '#0e2430', 'linear-gradient(165deg, #2a2118 0%, #10161d 46%, #0e2430 100%)', '#1a2832', 'linear-gradient(185deg, #3a2a1c 0%, #1c2832 46%, #102838 100%)')
        },
        {
            id: 'material',
            name: 'Material',
            source: 'Google',
            note: 'Tonal surfaces and large rounded cards.',
            radius: '28px',
            blur: '18px',
            accent: '#1a73e8',
            light: surface('#f8fafd', '#e8f0fe', '#ffffff', 'linear-gradient(180deg, #e8f0fe 0%, #f8fafd 42%, #ffffff 100%)', '#e8f0fe', 'linear-gradient(180deg, #d2e3fc 0%, #e8f0fe 40%, #f8fafd 100%)'),
            dark: surface('#1f1f1f', '#2d2f31', '#0e0e0e', 'linear-gradient(180deg, #2d2f31 0%, #1f1f1f 100%)', '#1f1f1f', 'linear-gradient(180deg, #394457 0%, #2d2f31 42%, #1f1f1f 100%)')
        },
        {
            id: 'youtube',
            name: 'YouTube',
            source: 'YouTube',
            note: 'Clean gray canvas and a strong red accent.',
            radius: '12px',
            blur: '12px',
            accent: '#ff0000',
            light: surface('#f9f9f9', '#ffffff', '#f2f2f2', 'linear-gradient(180deg, #ffffff 0%, #f2f2f2 100%)', '#f6f6f6', 'linear-gradient(180deg, #ffffff 0%, #f2f2f2 78%, #fde8e8 100%)'),
            dark: surface('#0f0f0f', '#272727', '#000000', 'linear-gradient(180deg, #212121 0%, #0f0f0f 100%)', '#0f0f0f', 'linear-gradient(180deg, #3a1515 0%, #212121 32%, #0f0f0f 100%)')
        },
        {
            id: 'instagram',
            name: 'Instagram',
            source: 'Instagram',
            note: 'Warm canvas with a pink-to-violet wash.',
            radius: '24px',
            blur: '22px',
            accent: '#e1306c',
            light: surface('#fff7f9', '#ffe8f1', '#f3e9ff', 'linear-gradient(145deg, #fff6e8 0%, #ffe1ee 46%, #efe4ff 100%)', '#ffe1ee', 'linear-gradient(180deg, #fff6e8 0%, #ffe1ee 48%, #efe4ff 100%)'),
            dark: surface('#1a1016', '#2a1520', '#120c18', 'linear-gradient(145deg, #2a1520 0%, #1a1016 50%, #161022 100%)', '#1a1016', 'linear-gradient(180deg, #4a2030 0%, #2a1520 42%, #161022 100%)')
        },
        {
            id: 'facebook',
            name: 'Facebook',
            source: 'Facebook',
            note: 'Soft gray field and a clear blue accent.',
            radius: '10px',
            blur: '10px',
            accent: '#0866ff',
            light: surface('#f0f2f5', '#ffffff', '#e4e6eb', 'linear-gradient(180deg, #e7f3ff 0%, #f0f2f5 38%, #f0f2f5 100%)', '#f0f2f5', 'linear-gradient(180deg, #e7f3ff 0%, #f0f2f5 48%, #e4e6eb 100%)'),
            dark: surface('#18191a', '#242526', '#121314', 'linear-gradient(180deg, #242526, #18191a)', '#18191a', 'linear-gradient(180deg, #1e3a5f 0%, #242526 40%, #18191a 100%)')
        },
        {
            id: 'x',
            name: 'X',
            source: 'X',
            note: 'High contrast, little decoration, sharp type.',
            radius: '16px',
            blur: '0px',
            accent: '#0f1419',
            light: surface('#ffffff', '#f7f9f9', '#ffffff', 'linear-gradient(180deg, #ffffff, #f7f9f9)', '#ffffff', 'linear-gradient(180deg, #ffffff 0%, #f7f9f9 100%)'),
            dark: surface('#000000', '#16181c', '#000000', 'linear-gradient(180deg, #16181c, #000000)', '#000000', 'linear-gradient(180deg, #1d232a 0%, #000000 100%)')
        },
        {
            id: 'whatsapp',
            name: 'WhatsApp',
            source: 'WhatsApp',
            note: 'Warm paper and a deep green accent.',
            radius: '14px',
            blur: '14px',
            accent: '#128c7e',
            light: surface('#f0f2f5', '#efeae2', '#d9fdd3', 'linear-gradient(180deg, #d9fdd3 0%, #efeae2 42%, #f0f2f5 100%)', '#efeae2', 'linear-gradient(180deg, #d9fdd3 0%, #efeae2 50%, #f0f2f5 100%)'),
            dark: surface('#111b21', '#202c33', '#0b141a', 'linear-gradient(180deg, #202c33, #111b21)', '#111b21', 'linear-gradient(180deg, #1a3c34 0%, #202c33 46%, #111b21 100%)')
        },
        {
            id: 'linkedin',
            name: 'LinkedIn',
            source: 'LinkedIn',
            note: 'Cool professional gray and a steady blue.',
            radius: '8px',
            blur: '8px',
            accent: '#0a66c2',
            light: surface('#f3f2ef', '#ffffff', '#eef3f8', 'linear-gradient(180deg, #eef3f8 0%, #f3f2ef 46%, #ffffff 100%)', '#f3f2ef', 'linear-gradient(180deg, #e8f3fc 0%, #f3f2ef 52%, #ffffff 100%)'),
            dark: surface('#1b1f23', '#2d3339', '#121417', 'linear-gradient(180deg, #2d3339, #1b1f23)', '#1b1f23', 'linear-gradient(180deg, #1c3d5c 0%, #1b1f23 48%, #121417 100%)')
        },
        {
            id: 'tiktok',
            name: 'TikTok',
            source: 'TikTok',
            note: 'Near-black energy with a cyan-to-pink edge.',
            radius: '16px',
            blur: '16px',
            accent: '#fe2c55',
            light: surface('#ffffff', '#f5fffe', '#fff0f4', 'linear-gradient(120deg, #e7fffd 0%, #ffffff 42%, #ffe6ee 100%)', '#ffffff', 'linear-gradient(180deg, #d9fffd 0%, #ffffff 46%, #ffe0ea 100%)'),
            dark: surface('#010101', '#121212', '#000000', 'linear-gradient(120deg, #042422 0%, #010101 46%, #2a0a12 100%)', '#010101', 'linear-gradient(180deg, #063633 0%, #010101 48%, #2a0a12 100%)')
        },
        {
            id: 'netflix',
            name: 'Netflix',
            source: 'Netflix',
            note: 'Cinematic dark field and a flat red accent.',
            radius: '4px',
            blur: '6px',
            accent: '#e50914',
            light: surface('#f5f5f1', '#ffffff', '#ececec', 'linear-gradient(180deg, #ffffff 0%, #f5f5f1 100%)', '#141414', 'linear-gradient(180deg, #6b1016 0%, #1c1c1c 38%, #141414 100%)'),
            dark: surface('#141414', '#1f1f1f', '#000000', 'linear-gradient(180deg, #1f1f1f, #141414)', '#141414', 'linear-gradient(180deg, #5c1016 0%, #141414 36%, #000000 100%)')
        }
    ];

    const SWATCHES = [
        { name: 'Bay', value: '#0d6e76' },
        { name: 'Bridge gold', value: '#c4a15a' },
        { name: 'Gate orange', value: '#c0362c' },
        { name: 'Apple blue', value: '#0071e3' },
        { name: 'Google blue', value: '#1a73e8' },
        { name: 'YouTube red', value: '#ff0000' },
        { name: 'Instagram', value: '#e1306c' },
        { name: 'Facebook', value: '#0866ff' },
        { name: 'WhatsApp', value: '#128c7e' },
        { name: 'LinkedIn', value: '#0a66c2' },
        { name: 'TikTok', value: '#fe2c55' },
        { name: 'Netflix', value: '#e50914' }
    ];

    let channel = null;
    let saved = { id: 'golden', accent: '#0d6e76' };
    let previous = null;
    let draft = { id: 'golden', accent: '#0d6e76' };
    let painted = { id: 'golden', accent: '#0d6e76' };
    let mode = 'kept';
    let booted = false;

    try { channel = new BroadcastChannel(CHANNEL); } catch (e) { /* ignore */ }

    function surface(bg, panel, wash, gradient, bar, barGradient) {
        return {
            bg: bg,
            panel: panel,
            panel2: wash,
            card: '#ffffff',
            line: 'rgba(18, 24, 31, 0.12)',
            text: '#12181f',
            muted: '#4a5560',
            edge: 'rgba(255, 255, 255, 0.72)',
            glass: 'color-mix(in srgb, #ffffff 78%, transparent)',
            bar: bar,
            gradient: gradient,
            barGradient: barGradient
        };
    }

    function hexToRgb(hex) {
        const raw = String(hex || '').replace('#', '');
        const full = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw;
        const num = parseInt(full, 16);
        if (!Number.isFinite(num) || full.length !== 6) return { r: 13, g: 110, b: 118 };
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }

    function rgbToHex(r, g, b) {
        const part = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
        return '#' + part(r) + part(g) + part(b);
    }

    function mix(a, b, t) {
        const from = hexToRgb(a);
        const to = hexToRgb(b);
        const amount = Math.max(0, Math.min(1, t));
        return rgbToHex(
            from.r + (to.r - from.r) * amount,
            from.g + (to.g - from.g) * amount,
            from.b + (to.b - from.b) * amount
        );
    }

    function luminance(hex) {
        const rgb = hexToRgb(hex);
        const channelValue = (value) => {
            const scaled = value / 255;
            return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * channelValue(rgb.r) + 0.7152 * channelValue(rgb.g) + 0.0722 * channelValue(rgb.b);
    }

    function normalize(value) {
        const id = value && LOOKS.some((look) => look.id === value.id) ? value.id : 'golden';
        const accent = /^#[0-9a-fA-F]{6}$/.test(value && value.accent) ? value.accent.toLowerCase() : lookById(id).accent;
        return { id: id, accent: accent };
    }

    function lookById(id) {
        return LOOKS.find((look) => look.id === id) || LOOKS[0];
    }

    function readStored(storage, key) {
        try {
            const raw = storage.getItem(key);
            return raw ? normalize(JSON.parse(raw)) : null;
        } catch (e) {
            return null;
        }
    }

    function isDark() {
        return document.documentElement.classList.contains('dark-mode');
    }

    function tokens(state) {
        const look = lookById(state.id);
        const dark = isDark();
        const face = dark ? darken(look.dark) : look.light;
        const accent = state.accent;
        const ink = dark ? mix(accent, '#ffffff', 0.42) : accent;
        const lum = luminance(ink);
        const onWhite = 1.05 / (lum + 0.05);
        const onBlack = (lum + 0.05) / 0.05;
        const onAccent = onWhite >= onBlack ? '#ffffff' : '#12181f';
        const barLight = luminance(face.bar) > 0.4;
        const sidebarAccent = barLight ? ink : mix(accent, '#ffffff', 0.5);
        return {
            '--accent': ink,
            '--accent-base': accent,
            '--accent-hover': mix(accent, dark ? '#ffffff' : '#000000', dark ? 0.2 : 0.14),
            '--accent-soft': mix(accent, dark ? '#10161d' : '#ffffff', dark ? 0.72 : 0.84),
            '--accent-ink': dark ? mix(accent, '#ffffff', 0.55) : mix(accent, '#000000', 0.38),
            '--accent-on-dark': mix(accent, '#ffffff', 0.5),
            '--on-accent': onAccent,
            '--bg-primary': face.bg,
            '--bg-secondary': face.panel,
            '--bg-sidebar': face.bar,
            '--text-primary': face.text,
            '--text-secondary': face.muted,
            '--text-sidebar-primary': barLight ? '#1a2832' : '#f4f7f8',
            '--text-sidebar-secondary': barLight ? '#3d4c58' : '#c5cdd4',
            '--sidebar-accent': sidebarAccent,
            '--border-color': face.line,
            '--bg': face.bg,
            '--panel': face.panel,
            '--panel-2': face.panel2,
            '--card': dark ? mix(face.panel, '#000000', 0.15) : face.card,
            '--line': face.line,
            '--text': face.text,
            '--muted': face.muted,
            '--cyan': ink,
            '--blue': ink,
            '--purple': mix(accent, face.text, 0.35),
            '--topbar': dark ? mix(face.panel, '#000000', 0.2) : 'color-mix(in srgb, ' + face.panel + ' 82%, transparent)',
            '--nav-active': mix(accent, face.panel, 0.82),
            '--nav-active-text': dark ? '#ffffff' : mix(accent, '#000000', 0.42),
            '--agent-active-bg': mix(accent, face.panel, 0.86),
            '--agent-active-text': dark ? '#ffffff' : mix(accent, '#000000', 0.42),
            '--jira': ink,
            '--pulse-blue': mix(accent, '#000000', 0.2),
            '--look-gradient': face.gradient,
            '--look-radius': look.radius,
            '--look-blur': look.blur,
            '--look-edge': face.edge,
            '--look-card': face.glass,
            '--look-bar': face.bar,
            '--look-bar-gradient': face.barGradient,
            '--frost': face.glass,
            '--menu-frost': face.glass
        };
    }

    function darken(face) {
        return {
            bg: face.bg,
            panel: face.panel,
            panel2: face.panel2,
            card: face.panel,
            line: 'rgba(255, 255, 255, 0.14)',
            text: '#e8eef2',
            muted: '#9aa5b1',
            edge: 'rgba(255, 255, 255, 0.16)',
            glass: 'color-mix(in srgb, ' + face.panel + ' 78%, transparent)',
            bar: face.bar,
            gradient: face.gradient,
            barGradient: face.barGradient
        };
    }

    function paint(state, nextMode) {
        const root = document.documentElement;
        const applied = normalize(state);
        const values = tokens(applied);
        Object.keys(values).forEach((key) => root.style.setProperty(key, values[key]));
        root.dataset.look = applied.id;
        root.dataset.lookMode = nextMode;
        painted = applied;
        mode = nextMode;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', isDark() ? values['--bg'] : applied.accent);
        document.dispatchEvent(new CustomEvent('cv-look-change', { detail: { id: applied.id, accent: applied.accent, mode: nextMode } }));
        renderControls();
    }

    function same(a, b) {
        return a && b && a.id === b.id && a.accent === b.accent;
    }

    function persist(state) {
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
        try {
            if (channel) channel.postMessage(state);
        } catch (e) { /* ignore */ }
    }

    function storePrevious(state) {
        previous = state;
        try {
            if (state) sessionStorage.setItem(PREVIOUS_KEY, JSON.stringify(state));
            else sessionStorage.removeItem(PREVIOUS_KEY);
        } catch (e) { /* ignore */ }
    }

    function preview() {
        paint(draft, same(draft, saved) ? 'kept' : 'preview');
    }

    function keep() {
        const next = normalize(draft);
        if (!same(next, saved)) storePrevious(saved);
        saved = next;
        persist(saved);
        paint(saved, 'kept');
    }

    function undo() {
        if (!same(painted, saved)) {
            draft = { id: saved.id, accent: saved.accent };
            paint(saved, 'kept');
            return;
        }
        if (!previous) return;
        saved = previous;
        storePrevious(null);
        draft = { id: saved.id, accent: saved.accent };
        persist(saved);
        paint(saved, 'kept');
    }

    function chooseLook(id) {
        const look = lookById(id);
        draft = { id: look.id, accent: look.accent };
        renderControls();
    }

    function chooseAccent(accent) {
        if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return;
        draft = { id: draft.id, accent: accent.toLowerCase() };
        renderControls();
    }

    function renderControls() {
        const root = document.getElementById('styles-pane');
        if (!root) return;
        root.querySelectorAll('[data-look-id]').forEach((card) => {
            card.classList.toggle('is-on', card.getAttribute('data-look-id') === draft.id);
        });
        root.querySelectorAll('[data-swatch]').forEach((swatch) => {
            swatch.classList.toggle('is-on', swatch.getAttribute('data-swatch') === draft.accent);
        });
        const color = document.getElementById('style-color');
        if (color && document.activeElement !== color) color.value = draft.accent;
        const status = document.getElementById('style-status');
        if (status) {
            const look = lookById(mode === 'preview' ? painted.id : draft.id);
            if (mode === 'preview') status.textContent = 'Previewing ' + look.name + '. Keep it for all four sites, or undo.';
            else status.textContent = lookById(saved.id).name + ' is kept. Pick another look, then preview it.';
        }
        const undoBtn = document.getElementById('style-undo');
        const keepBtn = document.getElementById('style-keep');
        const previewBtn = document.getElementById('style-preview');
        if (undoBtn) undoBtn.disabled = same(painted, saved) && !previous;
        if (keepBtn) keepBtn.disabled = same(draft, saved) && mode !== 'preview';
        if (previewBtn) previewBtn.disabled = same(draft, painted);
        paintMinis();
    }

    function paintMinis() {
        const row = document.getElementById('style-minis');
        if (!row) return;
        const values = tokens(draft);
        row.querySelectorAll('.style-mini').forEach((mini) => {
            mini.style.background = values['--look-gradient'];
            mini.style.borderRadius = values['--look-radius'];
            const bar = mini.querySelector('.style-mini-bar');
            const chip = mini.querySelector('.style-mini-chip');
            const btn = mini.querySelector('.style-mini-btn');
            if (bar) bar.style.background = values['--look-bar-gradient'];
            if (chip) {
                chip.style.background = values['--look-card'];
                chip.style.color = values['--text'];
            }
            if (btn) {
                btn.style.background = values['--accent'];
                btn.style.color = values['--on-accent'];
            }
        });
    }

    function mount(root) {
        if (!root || root.dataset.mounted === 'yes') return;
        root.dataset.mounted = 'yes';
        const grid = root.querySelector('#style-grid');
        const swatches = root.querySelector('#style-swatches');
        if (grid) {
            grid.innerHTML = LOOKS.map((look) => (
                '<button type="button" class="style-card" data-look-id="' + look.id + '">' +
                    '<span class="style-card-wash" style="background:' + look.light.gradient + '"></span>' +
                    '<strong>' + look.name + '</strong>' +
                    '<em>' + look.source + '</em>' +
                    '<span>' + look.note + '</span>' +
                '</button>'
            )).join('');
            grid.addEventListener('click', (event) => {
                const card = event.target.closest('[data-look-id]');
                if (card) chooseLook(card.getAttribute('data-look-id'));
            });
        }
        if (swatches) {
            swatches.innerHTML = SWATCHES.map((swatch) => (
                '<button type="button" class="style-swatch" data-swatch="' + swatch.value + '" style="background:' + swatch.value + '" aria-label="' + swatch.name + '"></button>'
            )).join('');
            swatches.addEventListener('click', (event) => {
                const swatch = event.target.closest('[data-swatch]');
                if (swatch) chooseAccent(swatch.getAttribute('data-swatch'));
            });
        }
        const color = document.getElementById('style-color');
        if (color) color.addEventListener('input', () => chooseAccent(color.value));
        const previewBtn = document.getElementById('style-preview');
        const undoBtn = document.getElementById('style-undo');
        const keepBtn = document.getElementById('style-keep');
        if (previewBtn) previewBtn.addEventListener('click', preview);
        if (undoBtn) undoBtn.addEventListener('click', undo);
        if (keepBtn) keepBtn.addEventListener('click', keep);
        renderControls();
    }

    function boot() {
        const stored = readStored(localStorage, KEY);
        if (stored) saved = stored;
        previous = readStored(sessionStorage, PREVIOUS_KEY);
        draft = { id: saved.id, accent: saved.accent };
        paint(saved, 'kept');
        if (booted) return;
        booted = true;
        global.addEventListener('storage', (event) => {
            if (event.key !== KEY || !event.newValue) return;
            saved = normalize(JSON.parse(event.newValue));
            if (mode !== 'preview') {
                draft = { id: saved.id, accent: saved.accent };
                paint(saved, 'kept');
            }
        });
        document.addEventListener('cv-theme-change', () => paint(painted, mode));
        if (channel) {
            channel.onmessage = (event) => {
                if (!event.data || !event.data.id) return;
                saved = normalize(event.data);
                if (mode === 'preview') return;
                draft = { id: saved.id, accent: saved.accent };
                paint(saved, 'kept');
            };
        }
        const mountPane = () => {
            const pane = document.getElementById('styles-pane');
            if (pane) mount(pane);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPane);
        else mountPane();
    }

    global.SiteLook = {
        KEY: KEY,
        LOOKS: LOOKS,
        SWATCHES: SWATCHES,
        boot: boot,
        mount: mount,
        preview: preview,
        undo: undo,
        keep: keep,
        chooseLook: chooseLook,
        chooseAccent: chooseAccent
    };
})(window);
