(function (root) {
    const STORAGE_KEY = 'cv-preferred-lang';
    const PINNED = ['es', 'en', 'pt', 'de', 'fr', 'it'];
    const NATIVE = new Set(PINNED);

    const LANGUAGES = [
        { code: 'es', name: 'Spanish', native: 'Español', flag: 'es', aliases: ['espanol'] },
        { code: 'en', name: 'English', native: 'English', flag: 'gb', aliases: ['uk', 'gb', 'us'] },
        { code: 'pt', name: 'Portuguese', native: 'Português', flag: 'pt', aliases: ['br'] },
        { code: 'de', name: 'German', native: 'Deutsch', flag: 'de', aliases: ['ge', 'deutsch'] },
        { code: 'fr', name: 'French', native: 'Français', flag: 'fr', aliases: ['francais'] },
        { code: 'it', name: 'Italian', native: 'Italiano', flag: 'it' },
        { code: 'af', name: 'Afrikaans', native: 'Afrikaans', flag: 'za' },
        { code: 'sq', name: 'Albanian', native: 'Shqip', flag: 'al' },
        { code: 'am', name: 'Amharic', native: 'አማርኛ', flag: 'et' },
        { code: 'ar', name: 'Arabic', native: 'العربية', flag: 'sa' },
        { code: 'hy', name: 'Armenian', native: 'Հայերեն', flag: 'am' },
        { code: 'az', name: 'Azerbaijani', native: 'Azərbaycan', flag: 'az' },
        { code: 'eu', name: 'Basque', native: 'Euskara', flag: 'es' },
        { code: 'be', name: 'Belarusian', native: 'Беларуская', flag: 'by' },
        { code: 'bn', name: 'Bengali', native: 'বাংলা', flag: 'bd' },
        { code: 'bs', name: 'Bosnian', native: 'Bosanski', flag: 'ba' },
        { code: 'bg', name: 'Bulgarian', native: 'Български', flag: 'bg' },
        { code: 'ca', name: 'Catalan', native: 'Català', flag: 'es' },
        { code: 'ceb', name: 'Cebuano', native: 'Cebuano', flag: 'ph' },
        { code: 'ny', name: 'Chichewa', native: 'Chichewa', flag: 'mw' },
        { code: 'zh-CN', name: 'Chinese (Simplified)', native: '简体中文', flag: 'cn', aliases: ['zh', 'zh-hans', 'cn'] },
        { code: 'zh-TW', name: 'Chinese (Traditional)', native: '繁體中文', flag: 'tw', aliases: ['zh-hant', 'zh-hk', 'tw'] },
        { code: 'co', name: 'Corsican', native: 'Corsu', flag: 'fr' },
        { code: 'hr', name: 'Croatian', native: 'Hrvatski', flag: 'hr' },
        { code: 'cs', name: 'Czech', native: 'Čeština', flag: 'cz' },
        { code: 'da', name: 'Danish', native: 'Dansk', flag: 'dk' },
        { code: 'nl', name: 'Dutch', native: 'Nederlands', flag: 'nl' },
        { code: 'eo', name: 'Esperanto', native: 'Esperanto', flag: 'un' },
        { code: 'et', name: 'Estonian', native: 'Eesti', flag: 'ee' },
        { code: 'tl', name: 'Filipino', native: 'Filipino', flag: 'ph', aliases: ['fil'] },
        { code: 'fi', name: 'Finnish', native: 'Suomi', flag: 'fi' },
        { code: 'fy', name: 'Frisian', native: 'Frysk', flag: 'nl' },
        { code: 'gl', name: 'Galician', native: 'Galego', flag: 'es' },
        { code: 'ka', name: 'Georgian', native: 'ქართული', flag: 'ge' },
        { code: 'el', name: 'Greek', native: 'Ελληνικά', flag: 'gr' },
        { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', flag: 'in' },
        { code: 'ht', name: 'Haitian Creole', native: 'Kreyòl ayisyen', flag: 'ht' },
        { code: 'ha', name: 'Hausa', native: 'Hausa', flag: 'ng' },
        { code: 'haw', name: 'Hawaiian', native: 'ʻŌlelo Hawaiʻi', flag: 'us' },
        { code: 'iw', name: 'Hebrew', native: 'עברית', flag: 'il', aliases: ['he'] },
        { code: 'hi', name: 'Hindi', native: 'हिन्दी', flag: 'in' },
        { code: 'hmn', name: 'Hmong', native: 'Hmong', flag: 'cn' },
        { code: 'hu', name: 'Hungarian', native: 'Magyar', flag: 'hu' },
        { code: 'is', name: 'Icelandic', native: 'Íslenska', flag: 'is' },
        { code: 'ig', name: 'Igbo', native: 'Igbo', flag: 'ng' },
        { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', flag: 'id' },
        { code: 'ga', name: 'Irish', native: 'Gaeilge', flag: 'ie' },
        { code: 'ja', name: 'Japanese', native: '日本語', flag: 'jp' },
        { code: 'jw', name: 'Javanese', native: 'Basa Jawa', flag: 'id' },
        { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', flag: 'in' },
        { code: 'kk', name: 'Kazakh', native: 'Қазақ', flag: 'kz' },
        { code: 'km', name: 'Khmer', native: 'ខ្មែរ', flag: 'kh' },
        { code: 'ko', name: 'Korean', native: '한국어', flag: 'kr' },
        { code: 'ku', name: 'Kurdish', native: 'Kurdî', flag: 'iq' },
        { code: 'ky', name: 'Kyrgyz', native: 'Кыргызча', flag: 'kg' },
        { code: 'lo', name: 'Lao', native: 'ລາວ', flag: 'la' },
        { code: 'la', name: 'Latin', native: 'Latina', flag: 'va' },
        { code: 'lv', name: 'Latvian', native: 'Latviešu', flag: 'lv' },
        { code: 'lt', name: 'Lithuanian', native: 'Lietuvių', flag: 'lt' },
        { code: 'lb', name: 'Luxembourgish', native: 'Lëtzebuergesch', flag: 'lu' },
        { code: 'mk', name: 'Macedonian', native: 'Македонски', flag: 'mk' },
        { code: 'mg', name: 'Malagasy', native: 'Malagasy', flag: 'mg' },
        { code: 'ms', name: 'Malay', native: 'Bahasa Melayu', flag: 'my' },
        { code: 'ml', name: 'Malayalam', native: 'മലയാളം', flag: 'in' },
        { code: 'mt', name: 'Maltese', native: 'Malti', flag: 'mt' },
        { code: 'mi', name: 'Maori', native: 'Māori', flag: 'nz' },
        { code: 'mr', name: 'Marathi', native: 'मराठी', flag: 'in' },
        { code: 'mn', name: 'Mongolian', native: 'Монгол', flag: 'mn' },
        { code: 'my', name: 'Myanmar (Burmese)', native: 'မြန်မာ', flag: 'mm' },
        { code: 'ne', name: 'Nepali', native: 'नेपाली', flag: 'np' },
        { code: 'no', name: 'Norwegian', native: 'Norsk', flag: 'no', aliases: ['nb', 'nn'] },
        { code: 'ps', name: 'Pashto', native: 'پښتو', flag: 'af' },
        { code: 'fa', name: 'Persian', native: 'فارسی', flag: 'ir' },
        { code: 'pl', name: 'Polish', native: 'Polski', flag: 'pl' },
        { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', flag: 'in' },
        { code: 'ro', name: 'Romanian', native: 'Română', flag: 'ro' },
        { code: 'ru', name: 'Russian', native: 'Русский', flag: 'ru' },
        { code: 'sm', name: 'Samoan', native: 'Gagana Samoa', flag: 'ws' },
        { code: 'gd', name: 'Scots Gaelic', native: 'Gàidhlig', flag: 'gb-sct' },
        { code: 'sr', name: 'Serbian', native: 'Српски', flag: 'rs' },
        { code: 'st', name: 'Sesotho', native: 'Sesotho', flag: 'ls' },
        { code: 'sn', name: 'Shona', native: 'ChiShona', flag: 'zw' },
        { code: 'sd', name: 'Sindhi', native: 'سنڌي', flag: 'pk' },
        { code: 'si', name: 'Sinhala', native: 'සිංහල', flag: 'lk' },
        { code: 'sk', name: 'Slovak', native: 'Slovenčina', flag: 'sk' },
        { code: 'sl', name: 'Slovenian', native: 'Slovenščina', flag: 'si' },
        { code: 'so', name: 'Somali', native: 'Soomaali', flag: 'so' },
        { code: 'su', name: 'Sundanese', native: 'Basa Sunda', flag: 'id' },
        { code: 'sw', name: 'Swahili', native: 'Kiswahili', flag: 'ke' },
        { code: 'sv', name: 'Swedish', native: 'Svenska', flag: 'se' },
        { code: 'tg', name: 'Tajik', native: 'Тоҷикӣ', flag: 'tj' },
        { code: 'ta', name: 'Tamil', native: 'தமிழ்', flag: 'in' },
        { code: 'te', name: 'Telugu', native: 'తెలుగు', flag: 'in' },
        { code: 'th', name: 'Thai', native: 'ไทย', flag: 'th' },
        { code: 'tr', name: 'Turkish', native: 'Türkçe', flag: 'tr' },
        { code: 'uk', name: 'Ukrainian', native: 'Українська', flag: 'ua' },
        { code: 'ur', name: 'Urdu', native: 'اردو', flag: 'pk' },
        { code: 'uz', name: 'Uzbek', native: 'Oʻzbek', flag: 'uz' },
        { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', flag: 'vn' },
        { code: 'cy', name: 'Welsh', native: 'Cymraeg', flag: 'gb-wls' },
        { code: 'xh', name: 'Xhosa', native: 'isiXhosa', flag: 'za' },
        { code: 'yi', name: 'Yiddish', native: 'ייִדיש', flag: 'il' },
        { code: 'yo', name: 'Yoruba', native: 'Yorùbá', flag: 'ng' },
        { code: 'zu', name: 'Zulu', native: 'isiZulu', flag: 'za' }
    ];

    const COUNTRY_LANG = {
        AF: 'ps', AL: 'sq', DZ: 'ar', AD: 'ca', AO: 'pt', AR: 'es', AM: 'hy', AU: 'en', AT: 'de',
        AZ: 'az', BH: 'ar', BD: 'bn', BY: 'be', BE: 'nl', BZ: 'en', BO: 'es', BA: 'bs', BW: 'en',
        BR: 'pt', BN: 'ms', BG: 'bg', KH: 'km', CM: 'fr', CA: 'en', CL: 'es', CN: 'zh-CN', CO: 'es',
        CR: 'es', HR: 'hr', CU: 'es', CY: 'el', CZ: 'cs', DK: 'da', DO: 'es', EC: 'es', EG: 'ar',
        SV: 'es', EE: 'et', ET: 'am', FI: 'fi', FR: 'fr', GE: 'ka', DE: 'de', GH: 'en', GR: 'el',
        GT: 'es', HN: 'es', HK: 'zh-TW', HU: 'hu', IS: 'is', IN: 'hi', ID: 'id', IR: 'fa', IQ: 'ar',
        IE: 'en', IL: 'iw', IT: 'it', JM: 'en', JP: 'ja', JO: 'ar', KZ: 'kk', KE: 'sw', KR: 'ko',
        KW: 'ar', KG: 'ky', LA: 'lo', LV: 'lv', LB: 'ar', LY: 'ar', LT: 'lt', LU: 'lb', MO: 'zh-TW',
        MY: 'ms', MV: 'en', MT: 'mt', MX: 'es', MD: 'ro', MN: 'mn', ME: 'sr', MA: 'ar', MZ: 'pt',
        MM: 'my', NP: 'ne', NL: 'nl', NZ: 'en', NI: 'es', NG: 'en', MK: 'mk', NO: 'no', OM: 'ar',
        PK: 'ur', PA: 'es', PY: 'es', PE: 'es', PH: 'tl', PL: 'pl', PT: 'pt', PR: 'es', QA: 'ar',
        RO: 'ro', RU: 'ru', SA: 'ar', SN: 'fr', RS: 'sr', SG: 'en', SK: 'sk', SI: 'sl', SO: 'so',
        ZA: 'en', ES: 'es', LK: 'si', SE: 'sv', CH: 'de', TW: 'zh-TW', TJ: 'tg', TZ: 'sw', TH: 'th',
        TN: 'ar', TR: 'tr', TM: 'tr', UA: 'uk', AE: 'ar', GB: 'en', US: 'en', UY: 'es', UZ: 'uz',
        VE: 'es', VN: 'vi', YE: 'ar', ZW: 'en'
    };

    const byCode = {};
    LANGUAGES.forEach((lang) => {
        byCode[lang.code.toLowerCase()] = lang;
        (lang.aliases || []).forEach((alias) => { byCode[alias.toLowerCase()] = lang; });
    });

    function orderedLanguages() {
        const pinned = PINNED.map((code) => byCode[code]).filter(Boolean);
        const rest = LANGUAGES
            .filter((lang) => !PINNED.includes(lang.code))
            .sort((a, b) => a.name.localeCompare(b.name));
        return pinned.concat(rest);
    }

    function normalize(code) {
        if (!code) return null;
        const raw = String(code).replace('_', '-').trim();
        const lower = raw.toLowerCase();
        if (byCode[lower]) return byCode[lower].code;
        const base = lower.split('-')[0];
        if (base === 'zh' && /tw|hk|hant/.test(lower)) return 'zh-TW';
        if (base === 'zh') return 'zh-CN';
        if (byCode[base]) return byCode[base].code;
        return null;
    }

    function find(code) {
        const normalized = normalize(code);
        return normalized ? byCode[normalized.toLowerCase()] : null;
    }

    function flagUrl(code) {
        const lang = find(code);
        return `https://hatscripts.github.io/circle-flags/flags/${(lang && lang.flag) || 'un'}.svg`;
    }

    function displayName(code) {
        const lang = find(code);
        return lang ? lang.native : String(code || '').toUpperCase();
    }

    function matchesQuery(lang, query) {
        if (!query) return true;
        const haystack = [lang.code, lang.name, lang.native, lang.flag].concat(lang.aliases || []).join(' ').toLowerCase();
        return haystack.indexOf(query.toLowerCase()) !== -1;
    }

    function persist(code) {
        const normalized = normalize(code) || 'en';
        try { localStorage.setItem(STORAGE_KEY, normalized); } catch (e) { /* ignore */ }
        return normalized;
    }

    function saved() {
        try { return normalize(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
    }

    function fromBrowser() {
        const candidates = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).filter(Boolean);
        for (let i = 0; i < candidates.length; i += 1) {
            const match = normalize(candidates[i]);
            if (match) return match;
        }
        return 'en';
    }

    async function fromGeo() {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(() => { if (controller) controller.abort(); }, 2200);
        try {
            const response = await fetch('https://ipwho.is/', { signal: controller ? controller.signal : undefined });
            if (!response.ok) return null;
            const data = await response.json();
            if (!data || !data.success || !data.country_code) return null;
            return COUNTRY_LANG[String(data.country_code).toUpperCase()] || null;
        } catch (e) {
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    async function resolve() {
        const params = new URLSearchParams(root.location.search).get('lang');
        const fromUrl = normalize(params);
        if (fromUrl) return persist(fromUrl);
        const stored = saved();
        if (stored) return stored;
        const geo = await fromGeo();
        if (geo && find(geo)) return persist(geo);
        return persist(fromBrowser());
    }

    function isNative(code) {
        return NATIVE.has(normalize(code) || '');
    }

    function usesDictionary(code) {
        if (/simulador\.html$/i.test(root.location.pathname) || /qa-lab\.html$/i.test(root.location.pathname)) return false;
        return isNative(code);
    }

    function cookieDomain() {
        const host = root.location.hostname;
        if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return '';
        return ';domain=' + host;
    }

    function writeCookie(name, value, maxAge) {
        const expires = ';max-age=' + (typeof maxAge === 'number' ? maxAge : 31536000);
        const domain = cookieDomain();
        document.cookie = name + '=' + value + ';path=/' + expires;
        if (domain) document.cookie = name + '=' + value + ';path=/' + expires + domain;
    }

    function clearCookie(name) {
        writeCookie(name, '', 0);
    }

    function googtransValue() {
        const match = document.cookie.match(/(?:^|; )googtrans=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    function setGoogtrans(lang) {
        const normalized = normalize(lang) || 'en';
        if (normalized === 'en') {
            clearCookie('googtrans');
            return;
        }
        writeCookie('googtrans', '/en/' + normalized);
    }

    function applyEarlyCookie() {
        const params = new URLSearchParams(root.location.search).get('lang');
        const lang = normalize(params) || saved();
        if (!lang || lang === 'en' || usesDictionary(lang)) {
            clearCookie('googtrans');
            return;
        }
        setGoogtrans(lang);
    }

    let pendingMachineLang = null;

    function triggerCombo(lang) {
        const combo = document.querySelector('.goog-te-combo');
        if (!combo) return false;
        const value = (!lang || lang === 'en') ? '' : lang;
        combo.value = value;
        combo.dispatchEvent(new Event('change'));
        return true;
    }

    function forceMachine(lang) {
        const normalized = normalize(lang) || 'en';
        if (normalized === 'en') {
            applyMachineTranslate('en');
            return;
        }
        pendingMachineLang = normalized;
        setGoogtrans(normalized);
        loadWidget();
        if (!triggerCombo(normalized)) loadWidget();
    }

    function applyMachineTranslate(lang) {
        const normalized = normalize(lang) || 'en';
        if (usesDictionary(normalized) || normalized === 'en') {
            pendingMachineLang = 'en';
            clearCookie('googtrans');
        } else {
            pendingMachineLang = normalized;
            setGoogtrans(normalized);
        }
        if (!triggerCombo(pendingMachineLang) && pendingMachineLang && pendingMachineLang !== 'en') {
            loadWidget();
        }
    }

    function loadWidget() {
        if (document.getElementById('google-translate-script')) return;
        if (!document.getElementById('google_translate_element')) {
            const holder = document.createElement('div');
            holder.id = 'google_translate_element';
            holder.setAttribute('aria-hidden', 'true');
            holder.style.display = 'none';
            document.body.appendChild(holder);
        }
        root.googleTranslateElementInit = function googleTranslateElementInit() {
            if (!root.google || !google.translate) return;
            new google.translate.TranslateElement({
                pageLanguage: 'en',
                autoDisplay: false
            }, 'google_translate_element');
            setTimeout(function () {
                if (pendingMachineLang) triggerCombo(pendingMachineLang);
            }, 250);
        };
        const script = document.createElement('script');
        script.id = 'google-translate-script';
        script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
        document.body.appendChild(script);
    }

    function needsReload(nextLang) {
        const next = normalize(nextLang) || 'en';
        const cookie = googtransValue();
        const machineActive = cookie && cookie !== '/en/en' && cookie !== '/auto/en' && cookie !== '/en/';
        if ((usesDictionary(next) || next === 'en') && machineActive) return true;
        if (!usesDictionary(next) && next !== 'en' && cookie !== '/en/' + next) return true;
        return false;
    }

    function current() {
        const params = new URLSearchParams(root.location.search).get('lang');
        return normalize(params) || saved() || 'en';
    }

    function homeUrl() {
        const lang = current();
        return 'index.html?lang=' + encodeURIComponent(lang || 'en');
    }

    function goHome() {
        const url = homeUrl();
        if (root.opener && !root.opener.closed) {
            try { root.opener.focus(); } catch (e) { /* ignore */ }
            try { root.close(); } catch (e) { /* ignore */ }
        }
        root.location.href = url;
    }

    let refreshTimer = null;
    let refreshing = false;

    function refreshTranslation() {
        const lang = current();
        if (!lang || lang === 'en' || usesDictionary(lang)) return;
        pendingMachineLang = lang;
        setGoogtrans(lang);
        if (refreshing) return;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(function () {
            const combo = document.querySelector('.goog-te-combo');
            if (!combo) {
                loadWidget();
                return;
            }
            refreshing = true;
            const previous = combo.value;
            combo.value = previous === lang ? '' : lang;
            combo.dispatchEvent(new Event('change'));
            setTimeout(function () {
                combo.value = lang;
                combo.dispatchEvent(new Event('change'));
                setTimeout(function () { refreshing = false; }, 200);
            }, 40);
        }, 80);
    }

    function selectLanguage(nextLang) {
        const next = persist(nextLang);
        const url = new URL(root.location.href);
        url.searchParams.set('lang', next);
        if (needsReload(next)) {
            setGoogtrans(next);
            root.location.assign(url.toString());
            return true;
        }
        root.history.replaceState({}, '', url);
        applyMachineTranslate(next);
        return false;
    }

    applyEarlyCookie();

    root.SiteI18n = {
        LANGUAGES,
        PINNED,
        orderedLanguages,
        normalize,
        find,
        flagUrl,
        displayName,
        matchesQuery,
        persist,
        saved,
        current,
        homeUrl,
        goHome,
        resolve,
        isNative,
        usesDictionary,
        applyEarlyCookie,
        applyMachineTranslate,
        forceMachine,
        loadWidget,
        selectLanguage,
        refreshTranslation,
        needsReload
    };
}(window));
