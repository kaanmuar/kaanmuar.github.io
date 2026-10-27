/* Jarvis core: the numbers behind Admin > Statistics, without the DOM, so tests/unit/admin-jarvis.test.js can run them.

   Products are kept apart: Inbox (messages, ratings), CV, QA Studio and QA Lab (site_events by site), URL Review
   (url_review_opens, url_reviews, site_events site=review), Social hub (socialHubStats/latest and hub_/post_ events),
   Traffic (GA4, Cloudflare) and Systems (jobs, CI, speed, uptime) from the jarvis function. Hours are America/Bogota. */
(function (root) {
    const ZONE = 'America/Bogota';
    const DAY = 24 * 60 * 60 * 1000;
    const PRODUCTS = [
        { key: 'overview', name: 'Overview', short: 'OVR' },
        { key: 'inbox', name: 'Inbox', short: 'INB' },
        { key: 'cv', name: 'CV', short: 'CV' },
        { key: 'studio', name: 'QA Studio', short: 'STU' },
        { key: 'lab', name: 'QA Lab', short: 'LAB' },
        { key: 'review', name: 'URL Review', short: 'URL' },
        { key: 'hub', name: 'Social hub', short: 'HUB' },
        { key: 'business', name: 'Business', short: 'BIZ' },
        { key: 'outreach', name: 'Outreach', short: 'OUT' },
        { key: 'marketing', name: 'Marketing', short: 'MKT' },
        { key: 'traffic', name: 'Traffic', short: 'WEB' },
        { key: 'systems', name: 'Systems', short: 'SYS' }
    ];
    const ACTION_LABELS = {
        share_cv: 'Share', open_simulator: 'Open studio', open_qa_lab: 'Open lab', open_contact_widget: 'Contact',
        submit_message: 'Message', submit_rating: 'Rating', sim_run_sprint: 'Sprint start', sim_sprint_complete: 'Sprint finish',
        site_tour_start: 'Tour', open_clip: 'Clip', company_site: 'Company site'
    };
    const EXPORT_LABELS = { export_cv: 'CV file', print_cv: 'Print', lab_report: 'Lab report', studio_report: 'Studio report' };
    const PLAIN_VISIT_LABELS = { cv: 1, studio: 1, lab: 1, popup: 1, direct: 1 };
    const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    function toDate(value) {
        if (!value) return null;
        if (value instanceof Date) return value;
        if (typeof value.toDate === 'function') return value.toDate();
        if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function zoneParts(date) {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(date);
        const read = (type) => (parts.find((part) => part.type === type) || {}).value || '';
        return { day: `${read('year')}-${read('month')}-${read('day')}`, hour: Number(read('hour')) % 24, weekday: Math.max(0, WEEKDAYS.indexOf(read('weekday'))) };
    }

    function bump(map, key, by) {
        const name = String(key === undefined || key === null || key === '' ? 'unknown' : key).slice(0, 80);
        map[name] = (map[name] || 0) + (by || 1);
    }

    function topList(map, limit) {
        return Object.keys(map || {}).map((label) => ({ label, value: map[label] }))
            .filter((row) => row.value > 0)
            .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
            .slice(0, limit || 1000);
    }

    function delta(now, prior) {
        const a = Number(now) || 0;
        const b = Number(prior);
        if (!Number.isFinite(b)) return { pct: null, text: '', dir: 0 };
        if (b === 0) return a === 0 ? { pct: 0, text: '±0', dir: 0 } : { pct: null, text: 'new', dir: 1 };
        const pct = Math.round(((a - b) / b) * 100);
        return { pct, text: (pct > 0 ? '+' : '') + pct + '%', dir: pct > 0 ? 1 : pct < 0 ? -1 : 0 };
    }

    // One bucket per Bogota day from start to end, so a quiet day reads 0 instead of disappearing.
    function dayKeys(start, end) {
        const keys = [];
        const last = zoneParts(end).day;
        let cursor = new Date(start.getTime());
        for (let i = 0; i < 400; i += 1) {
            const key = zoneParts(cursor).day;
            if (!keys.length || keys[keys.length - 1] !== key) keys.push(key);
            if (key >= last) break;
            cursor = new Date(cursor.getTime() + DAY);
        }
        return keys;
    }

    function dailySeries(rows, start, end, pick) {
        const keys = dayKeys(start, end);
        const index = {};
        keys.forEach((key, i) => { index[key] = i; });
        const values = keys.map(() => 0);
        rows.forEach((row) => {
            if (pick && !pick(row)) return;
            const when = toDate(row.createdAt || row.at);
            if (!when) return;
            const i = index[zoneParts(when).day];
            if (i !== undefined) values[i] += 1;
        });
        return { labels: keys, values };
    }

    // The newest full-or-partial day against the days before it; flags a z-score of 2.5 or more with enough volume.
    function anomaly(values) {
        if (!values || values.length < 6) return null;
        const last = values[values.length - 1];
        const base = values.slice(0, -1);
        const mean = base.reduce((a, b) => a + b, 0) / base.length;
        const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) * (b - mean), 0) / base.length);
        if (sd === 0 || Math.max(last, mean) < 5) return null;
        const z = (last - mean) / sd;
        return Math.abs(z) >= 2.5 ? { z: Math.round(z * 10) / 10, last, mean: Math.round(mean * 10) / 10 } : null;
    }

    function openSource(row) {
        let tagged = '';
        let campaign = '';
        try {
            const params = new URLSearchParams(String((row && row.query) || ''));
            tagged = params.get('utm_source') || '';
            campaign = params.get('utm_campaign') || '';
        } catch (error) { tagged = ''; }
        if (tagged) return tagged.toLowerCase().slice(0, 40) + (campaign ? ' / ' + campaign.toLowerCase().slice(0, 40) : '') + ' (tagged link)';
        return (row && row.referrerHost) || 'Direct';
    }

    function linkCode(label) {
        const code = String(label || '').trim().toLowerCase();
        if (!code || code.length > 40 || PLAIN_VISIT_LABELS[code]) return '';
        return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code) ? code : '';
    }

    function actionTitle(row) {
        const raw = String(row.name || 'click').slice(0, 40);
        const title = ACTION_LABELS[raw] || raw;
        const detail = String(row.label || '').trim().slice(0, 40);
        if ((raw === 'site_tour_start' || raw === 'open_clip' || raw === 'company_site') && detail && detail !== 'start') return title + ' (' + detail + ')';
        return title;
    }

    // Same rule as the admin's Real / Tests switch: test domains and automation-looking local parts.
    function isTestEmail(email) {
        const value = String(email || '').trim().toLowerCase();
        const at = value.lastIndexOf('@');
        if (at < 1) return true;
        const local = value.slice(0, at);
        const domain = value.slice(at + 1);
        if (/^(example\.(com|org|net)|test\.com|mailinator\.com|localhost|invalid)$/.test(domain)) return true;
        if (/\.(test|example|invalid)$/.test(domain)) return true;
        if (/(^|[.+_-])(playwright|cypress|selenium|appium|webdriver|robotframework|qa-?lab)([.+_-]|$)/.test(local)) return true;
        if (/^(pw|cy|e2e|test)[_-]/.test(local)) return true;
        return false;
    }

    function isHubEvent(row) {
        return /^(hub|post)_/.test(String((row && row.name) || ''));
    }

    function heatmap(rows, pick) {
        const grid = WEEKDAYS.map(() => new Array(24).fill(0));
        rows.forEach((row) => {
            if (pick && !pick(row)) return;
            const when = toDate(row.createdAt || row.at);
            if (!when) return;
            const parts = zoneParts(when);
            grid[parts.weekday][parts.hour] += 1;
        });
        return grid;
    }

    function peak(grid) {
        let best = { day: -1, hour: -1, value: 0 };
        grid.forEach((row, day) => row.forEach((value, hour) => { if (value > best.value) best = { day, hour, value }; }));
        return best.value ? `${WEEKDAYS[best.day]} ${String(best.hour).padStart(2, '0')}:00 (${best.value})` : 'None';
    }

    function kpi(label, value, prior, extra) {
        const d = prior === undefined ? { text: '', dir: 0, pct: null } : delta(value, prior);
        return Object.assign({ label, value, prior, delta: d.text, dir: d.dir, pct: d.pct }, extra || {});
    }

    // CV, QA Studio and QA Lab: one site of site_events each. Hub events belong to the Social hub.
    function summarizeSite(site, rows, priorRows, window) {
        const mine = rows.filter((row) => row.site === site && !isHubEvent(row) && row.kind !== 'view');
        const prior = (priorRows || []).filter((row) => row.site === site && !isHubEvent(row) && row.kind !== 'view');
        const tally = (list) => {
            const t = { visits: 0, clicks: 0, exports: 0, runs: 0 };
            list.forEach((row) => {
                if (row.kind === 'visit') t.visits += 1;
                else if (row.kind === 'export') t.exports += 1;
                else if (row.kind === 'run') t.runs += 1;
                else t.clicks += 1;
            });
            return t;
        };
        const now = tally(mine);
        const was = tally(prior);
        const maps = { actions: {}, exports: {}, langs: {}, sources: {}, pages: {}, countries: {}, cities: {}, zones: {}, screens: {}, links: {} };
        mine.forEach((row) => {
            if (row.page) bump(maps.pages, row.page);
            if (row.country) bump(maps.countries, row.country);
            if (row.city) bump(maps.cities, row.city);
            if (row.timezone) bump(maps.zones, row.timezone);
            if (row.kind === 'visit') {
                bump(maps.langs, row.lang || 'en');
                bump(maps.sources, openSource(row));
                bump(maps.screens, row.screen === 'phone' || row.screen === 'desktop' ? row.screen : 'unrecorded');
                const code = linkCode(row.label);
                if (code) bump(maps.links, code);
            } else if (row.kind === 'export') {
                const raw = String(row.name || 'export').slice(0, 40);
                const label = EXPORT_LABELS[raw] || raw;
                bump(maps.exports, row.label ? `${label} (${String(row.label).slice(0, 40)})` : label);
            } else if (row.kind !== 'run') {
                bump(maps.actions, actionTitle(row));
            }
        });
        const visits = dailySeries(mine, window.start, window.end, (row) => row.kind === 'visit');
        const grid = heatmap(mine, (row) => row.kind === 'visit');
        const hasPrior = !!priorRows;
        const engaged = now.visits ? Math.round(((now.clicks + now.exports + now.runs) / now.visits) * 100) / 100 : 0;
        return {
            key: site,
            totals: now,
            prior: hasPrior ? was : null,
            kpis: [
                kpi('Visits', now.visits, hasPrior ? was.visits : undefined),
                kpi('Clicks', now.clicks, hasPrior ? was.clicks : undefined),
                kpi(site === 'cv' ? 'Exports' : 'Reports', now.exports, hasPrior ? was.exports : undefined),
                kpi('Runs', now.runs, hasPrior ? was.runs : undefined),
                kpi('Actions per visit', engaged, undefined)
            ],
            series: visits,
            anomaly: anomaly(visits.values),
            heatmap: grid,
            peak: peak(grid),
            lists: Object.keys(maps).reduce((out, key) => { out[key] = topList(maps[key]); return out; }, {})
        };
    }

    function reviewSource(row) {
        return row && (row.query || row.referrerHost) ? openSource(row) : 'not recorded';
    }

    // URL Review: page opens, reviews, payments, and the qa_review_* clicks on the review pages.
    function summarizeReview(data, window) {
        const opens = data.opens || [];
        const reviews = data.reviews || [];
        const clicks = (data.events || []).filter((row) => row.site === 'review' && !isHubEvent(row) && row.kind !== 'visit' && row.kind !== 'view');
        const prior = data.prior || null;
        const paid = reviews.filter((row) => row.paid === true && row.test !== true);
        const usd = Math.round(paid.reduce((sum, row) => sum + (Number(row.priceUsd) || 0), 0) * 100) / 100;
        const complete = reviews.filter((row) => row.status === 'complete').length;
        const scores = reviews.map((row) => Number(row.score)).filter((n) => Number.isFinite(n) && n > 0);
        const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        const maps = { sources: {}, reviewSources: {}, pages: {}, statuses: {}, hosts: {}, frameworks: {}, countries: {}, cities: {}, langs: {}, screens: {}, actions: {} };
        opens.forEach((row) => {
            bump(maps.sources, openSource(row));
            bump(maps.pages, row.page);
            bump(maps.countries, row.country || 'unknown');
            bump(maps.cities, row.city || 'unknown');
            bump(maps.langs, row.lang || 'en');
            bump(maps.screens, row.screen || 'unrecorded');
        });
        reviews.forEach((row) => {
            bump(maps.statuses, row.status || 'unknown');
            bump(maps.reviewSources, reviewSource(row));
            let host = '';
            try { host = new URL(String(row.requestedUrl || row.url || '')).hostname; } catch (error) { host = ''; }
            bump(maps.hosts, host || 'none');
            (Array.isArray(row.frameworks) ? row.frameworks : []).forEach((name) => bump(maps.frameworks, name));
        });
        clicks.forEach((row) => bump(maps.actions, actionTitle(row)));
        const openTotal = data.openTotal !== undefined ? data.openTotal : opens.length;
        const reviewTotal = data.reviewTotal !== undefined ? data.reviewTotal : reviews.length;
        const conversion = openTotal ? Math.round((reviewTotal / openTotal) * 1000) / 10 : 0;
        const opensSeries = dailySeries(opens, window.start, window.end);
        const reviewSeries = dailySeries(reviews, window.start, window.end);
        const grid = heatmap(opens);
        return {
            key: 'review',
            totals: { opens: openTotal, reviews: reviewTotal, paid: paid.length, usd, complete, conversion, avgScore },
            kpis: [
                kpi('Opens', openTotal, prior ? prior.opens : undefined),
                kpi('Reviews', reviewTotal, prior ? prior.reviews : undefined),
                kpi('Open → review', conversion + '%', undefined, { raw: conversion }),
                kpi('Paid', paid.length, undefined),
                kpi('Revenue', usd + ' USD', undefined, { raw: usd }),
                kpi('Avg score', avgScore === null ? '—' : avgScore, undefined)
            ],
            funnel: [
                { label: 'Opens', value: openTotal },
                { label: 'Reviews started', value: reviewTotal },
                { label: 'Completed', value: complete },
                { label: 'Paid', value: paid.length }
            ],
            series: opensSeries,
            reviewSeries,
            anomaly: anomaly(opensSeries.values),
            heatmap: grid,
            peak: peak(grid),
            truncated: (data.openTotal || 0) > opens.length || (data.reviewTotal || 0) > reviews.length,
            lists: Object.keys(maps).reduce((out, key) => { out[key] = topList(maps[key]); return out; }, {})
        };
    }

    function summarizeInbox(messages, ratings, window, priorWindow, keep) {
        const inside = (row, w) => { const when = toDate(row.createdAt); return when && when >= w.start && when <= w.end; };
        const pass = (row) => (keep ? keep(row.email) : true);
        const m = messages.filter((row) => pass(row) && inside(row, window));
        const r = ratings.filter((row) => pass(row) && inside(row, window));
        const pm = priorWindow ? messages.filter((row) => pass(row) && inside(row, priorWindow)) : null;
        const pr = priorWindow ? ratings.filter((row) => pass(row) && inside(row, priorWindow)) : null;
        const topics = {}, stars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, status = {};
        m.forEach((row) => bump(topics, row.topic || 'Unspecified'));
        r.forEach((row) => { const n = Number(row.rating); if (stars[n] !== undefined) stars[n] += 1; bump(status, row.status || 'pending'); });
        const rated = r.filter((row) => Number(row.rating) > 0);
        const avg = rated.length ? Math.round((rated.reduce((s, row) => s + Number(row.rating), 0) / rated.length) * 10) / 10 : null;
        const unanswered = m.filter((row) => row.status !== 'rejected' && !row.response && !row.respondedAt).length;
        const pending = ratings.filter((row) => pass(row) && (row.status || 'pending') === 'pending').length;
        const all = m.map((row) => Object.assign({ createdAt: row.createdAt }, { kind: 'message' })).concat(r.map((row) => ({ createdAt: row.createdAt, kind: 'rating' })));
        return {
            key: 'inbox',
            totals: { messages: m.length, ratings: r.length, unanswered, pending, avg },
            kpis: [
                kpi('Messages', m.length, pm ? pm.length : undefined),
                kpi('Ratings', r.length, pr ? pr.length : undefined),
                kpi('Avg rating', avg === null ? '—' : avg, undefined),
                kpi('Unanswered', unanswered, undefined, { alert: unanswered > 0 }),
                kpi('Pending ratings', pending, undefined, { alert: pending > 0 })
            ],
            series: dailySeries(all, window.start, window.end, (row) => row.kind === 'message'),
            ratingSeries: dailySeries(all, window.start, window.end, (row) => row.kind === 'rating'),
            lists: { topics: topList(topics), stars: [5, 4, 3, 2, 1].map((n) => ({ label: n + ' star' + (n > 1 ? 's' : ''), value: stars[n] })), status: topList(status) }
        };
    }

    function summarizeHub(stats, rows, window) {
        const s = stats || {};
        const totals = s.totals || {};
        const hubRows = (rows || []).filter(isHubEvent);
        const names = {};
        hubRows.forEach((row) => bump(names, row.name));
        const posts = (s.posts || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
        return {
            key: 'hub',
            updatedAt: s.updatedAt || '',
            ga: s.ga || null,
            totals,
            kpis: [
                kpi('Hub views', totals.hubViews || 0),
                kpi('Post views', totals.postViews || 0),
                kpi('Post views, 7 days', totals.postViews7 || 0),
                kpi('GA4 views', totals.gaViews || 0),
                kpi('Interactions', totals.interactions || 0)
            ],
            series: dailySeries(hubRows, window.start, window.end),
            lists: {
                posts: posts.slice(0, 15).map((p) => ({ label: p.id, value: p.score || p.views || 0 })),
                sources: (s.sources || []).slice(0, 15).map((row) => ({ label: [row.source, row.medium, row.campaign].filter(Boolean).join(' / '), value: row.sessions || 0 })),
                networks: topList(Object.assign({}, (s.networks || {}).share || {})),
                events: topList(names),
                langs: (s.hubPages || []).map((row) => ({ label: row.lang || 'en', value: row.views || 0 }))
            }
        };
    }

    // The owner's limits for the briefing, the daily email and the hourly watch. Saved in jarvis_settings/main.
    const THRESHOLDS = {
        swingPct: { value: 25, label: 'Visit or open swing worth a line (%)', min: 5, max: 500 },
        swingMin: { value: 10, label: 'Least volume for a swing line', min: 1, max: 100000 },
        failuresWarn: { value: 1, label: 'Failed review runs in range: warn at', min: 1, max: 100000 },
        failuresAlert: { value: 10, label: 'Failed review runs in range: alert at', min: 1, max: 100000 },
        heldReruns: { value: 1, label: 'Held re-runs: warn at', min: 1, max: 100000 },
        unanswered: { value: 1, label: 'Unanswered messages: warn at', min: 1, max: 100000 },
        pendingRatings: { value: 1, label: 'Pending ratings: warn at', min: 1, max: 100000 },
        conversionMin: { value: 5, label: 'Open → review rate below (%)', min: 0, max: 100 },
        conversionOpens: { value: 50, label: 'Least opens before judging the rate', min: 1, max: 100000 },
        uptimeMs: { value: 3000, label: 'Slow page above (ms)', min: 200, max: 60000 },
        speedWarn: { value: 50, label: 'PageSpeed warn below', min: 1, max: 100 },
        speedGood: { value: 90, label: 'PageSpeed praise at', min: 1, max: 100 },
        tlsDays: { value: 21, label: 'TLS certificate days left: alert below', min: 1, max: 365 },
        hubStaleDays: { value: 2, label: 'Social hub stats older than (days)', min: 1, max: 60 },
        sessionsSwingPct: { value: 20, label: 'GA4 sessions swing worth a line (%)', min: 5, max: 500 },
        readinessMin: { value: 80, label: 'Readiness turns amber below (%)', min: 1, max: 100 },
        emailBadPct: { value: 5, label: 'Emails bounced or blocked: warn at (%)', min: 1, max: 100 },
        fnFailures: { value: 10, label: 'Real function failures in 24 hours: warn at', min: 1, max: 100000 },
        geminiErrorPct: { value: 50, label: 'Failed Gemini calls in 7 days: warn at (%)', min: 1, max: 100 },
        domainDays: { value: 30, label: 'Domain days left: alert below', min: 1, max: 365 },
        firestoreFreePct: { value: 80, label: 'Firestore free daily reads used: warn at (%)', min: 1, max: 1000 },
        outreachBouncePct: { value: 3, label: 'Outreach emails bounced: alert at (%)', min: 0.5, max: 50 },
        outreachWarmup: { value: 80, label: 'Mailbox warm-up score needed before campaigns send', min: 0, max: 100 },
        outreachDeadlineDays: { value: 14, label: 'Outreach deadlines: remind this many days ahead', min: 1, max: 90 }
    };

    // What Jarvis ranks on Brave when the owner has not set searches in Settings.
    const SEARCH_QUERIES = ['carlos andres munoz qa', 'carlosandmunoz', 'qa-lab url review', 'free website qa review', 'website qa audit online'];

    // Every source Jarvis reads, for Systems > Connections. needs[] lists the one-time grants a source still waits for.
    const CONNECTIONS = [
        { key: 'health', name: 'Firestore (server collections)' }, { key: 'jobs', name: 'Cloud Scheduler' }, { key: 'github', name: 'GitHub' },
        { key: 'ga4', name: 'Google Analytics 4' }, { key: 'cloudflare', name: 'Cloudflare' }, { key: 'speed', name: 'PageSpeed and CrUX' },
        { key: 'uptime', name: 'Uptime and TLS' }, { key: 'money', name: 'Payments (paid reviews, PayPal, Stripe)' }, { key: 'email', name: 'SendGrid' },
        { key: 'search', name: 'Search (Brave, Search Console)' }, { key: 'social', name: 'Social (ledgers, YouTube, Facebook)' },
        { key: 'safety', name: 'Safety (Web Risk, DNS, domain, TLS)' }, { key: 'platform', name: 'Google Cloud (Monitoring, Logging, Auth)' },
        { key: 'outreach', name: 'Outreach (sweep prospects, Instantly, 90-day plan)' }
    ];

    function connections(external, pending) {
        const e = external || {};
        return CONNECTIONS.map((c) => {
            const x = e[c.key];
            const needs = (x && x.needs) || [];
            const state = pending && pending[c.key] && !x ? 'loading' : !x ? 'off' : x.ok === false ? 'down' : needs.length ? 'partial' : 'live';
            return { key: c.key, name: c.name, state, detail: x && x.ok === false ? String(x.error || 'failed') : '', needs, at: x && x.cachedAt };
        });
    }

    // Visits and review opens that came from outreach links (utm_source=outreach), by utm_campaign.
    function outreachVisits(rows) {
        const by = {};
        let total = 0;
        (rows || []).forEach((row) => {
            let params;
            try { params = new URLSearchParams(String((row && row.query) || '')); } catch (error) { return; }
            if ((params.get('utm_source') || '').toLowerCase() !== 'outreach') return;
            if (row.kind && row.kind !== 'visit') return;
            total += 1;
            const c = params.get('utm_campaign') || 'no campaign';
            by[c] = (by[c] || 0) + 1;
        });
        return { total, campaigns: Object.keys(by).map((label) => ({ label, value: by[label] })).sort((a, b) => b.value - a.value) };
    }

    function thresholds(saved) {
        const out = {};
        Object.keys(THRESHOLDS).forEach((key) => {
            const n = Number(saved && saved[key]);
            const spec = THRESHOLDS[key];
            out[key] = Number.isFinite(n) && n >= spec.min && n <= spec.max ? n : spec.value;
        });
        return out;
    }

    // Goals: a target for one product metric over the current Bogota day, week (from Monday) or month.
    const GOAL_METRICS = {
        cv: { visits: 'Visits', exports: 'Exports', runs: 'Runs' },
        studio: { visits: 'Visits', exports: 'Reports', runs: 'Runs' },
        lab: { visits: 'Visits', exports: 'Reports', runs: 'Runs' },
        review: { opens: 'Opens', reviews: 'Reviews', paid: 'Paid reviews', usd: 'Revenue (USD)' },
        inbox: { messages: 'Messages', ratings: 'Ratings' }
    };
    const GOAL_PERIODS = { day: 'today', week: 'this week', month: 'this month' };

    function cleanGoals(list) {
        return (Array.isArray(list) ? list : []).map((goal) => ({
            product: String((goal && goal.product) || ''),
            metric: String((goal && goal.metric) || ''),
            period: String((goal && goal.period) || ''),
            target: Math.round(Number(goal && goal.target) * 100) / 100
        })).filter((goal) => GOAL_METRICS[goal.product] && GOAL_METRICS[goal.product][goal.metric] && GOAL_PERIODS[goal.period] && goal.target > 0 && goal.target <= 1e7).slice(0, 24);
    }

    function goalKey(goal) { return goal.product + '.' + goal.metric + '.' + goal.period; }

    function goalLabel(goal) {
        const name = (PRODUCTS.find((p) => p.key === goal.product) || {}).name || goal.product;
        return `${name} ${GOAL_METRICS[goal.product][goal.metric].toLowerCase()} ${GOAL_PERIODS[goal.period]}`;
    }

    // Bogota is UTC-5 all year, so its midnight is 05:00 UTC.
    function periodWindow(period, now) {
        const at = now || new Date();
        const local = new Date(at.getTime() - 5 * 3600 * 1000);
        let start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
        let end = start + DAY;
        if (period === 'week') { start -= ((local.getUTCDay() + 6) % 7) * DAY; end = start + 7 * DAY; }
        if (period === 'month') { start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1); end = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1); }
        return { start: new Date(start + 5 * 3600 * 1000), end: new Date(end + 5 * 3600 * 1000) };
    }

    function goalProgress(goal, value, now) {
        const at = now || new Date();
        const w = periodWindow(goal.period, at);
        const elapsed = Math.min(1, Math.max(0.0001, (at - w.start) / (w.end - w.start)));
        const v = Number(value) || 0;
        const pct = Math.round((v / goal.target) * 100);
        const expected = goal.target * elapsed;
        const projected = Math.round((v / elapsed) * 10) / 10;
        const status = v >= goal.target ? 'done' : v >= expected * 0.9 ? 'on-track' : v >= expected * 0.6 ? 'behind' : 'far-behind';
        return { key: goalKey(goal), product: goal.product, metric: goal.metric, period: goal.period, target: goal.target, label: goalLabel(goal), value: v, pct, expected: Math.round(expected * 10) / 10, projected, elapsed: Math.round(elapsed * 100), status };
    }

    // The instant briefing: rules over the summaries, most urgent first. Levels: alert, warn, good, info.
    function briefing(state) {
        const out = [];
        const add = (level, product, text, key) => out.push({ level, product, text, key: key || product + ':' + text.slice(0, 40) });
        const p = state.products || {};
        const ext = state.external || {};
        const th = thresholds(state.thresholds);
        const names = PRODUCTS.reduce((m, row) => { m[row.key] = row.name; return m; }, {});
        const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
        const swing = (k) => k.pct !== null && Math.abs(k.pct) >= th.swingPct && Math.max(k.value, k.prior || 0) >= th.swingMin;
        ['cv', 'studio', 'lab'].forEach((key) => {
            const s = p[key];
            if (!s) return;
            const visits = s.kpis[0];
            if (swing(visits)) add(visits.pct > 0 ? 'good' : 'warn', key, `${names[key]} visits ${visits.pct > 0 ? 'rose' : 'fell'} ${Math.abs(visits.pct)}% (${visits.value} vs ${visits.prior}).`, key + ':swing');
            if (s.anomaly) add(s.anomaly.z > 0 ? 'info' : 'warn', key, `${names[key]}: today has ${s.anomaly.last} visits against a ${s.anomaly.mean}/day average (z ${s.anomaly.z}).`, key + ':anomaly');
            const top = (s.lists.sources || [])[0];
            if (top && s.totals.visits >= th.swingMin) add('info', key, `${names[key]}'s top source is ${top.label} with ${top.value} of ${s.totals.visits} visits.`, key + ':source');
        });
        const r = p.review;
        if (r) {
            const opens = r.kpis[0];
            if (swing(opens)) add(opens.pct > 0 ? 'good' : 'warn', 'review', `URL Review opens ${opens.pct > 0 ? 'rose' : 'fell'} ${Math.abs(opens.pct)}% (${opens.value} vs ${opens.prior}).`, 'review:swing');
            if (r.totals.usd > 0) add('good', 'review', `URL Review earned ${r.totals.usd} USD from ${plural(r.totals.paid, 'paid review', 'paid reviews')}.`, 'review:usd');
            if (r.totals.opens >= th.conversionOpens && r.totals.conversion < th.conversionMin) add('warn', 'review', `Only ${r.totals.conversion}% of URL Review opens start a review.`, 'review:conversion');
            if (r.anomaly) add(r.anomaly.z > 0 ? 'info' : 'warn', 'review', `URL Review: today has ${r.anomaly.last} opens against ${r.anomaly.mean}/day (z ${r.anomaly.z}).`, 'review:anomaly');
        }
        const inbox = p.inbox;
        if (inbox) {
            const u = inbox.totals.unanswered;
            const n = inbox.totals.pending;
            if (u >= th.unanswered) add('warn', 'inbox', `${plural(u, 'message', 'messages')} in range ${u === 1 ? 'still has' : 'still have'} no answer.`, 'inbox:unanswered');
            if (n >= th.pendingRatings) add('warn', 'inbox', `${plural(n, 'rating', 'ratings')} ${n === 1 ? 'waits' : 'wait'} for approval.`, 'inbox:pending');
        }
        const hub = p.hub;
        if (hub && hub.ga && hub.ga.ok === false) add('warn', 'hub', 'Social hub stats could not read GA4 on the last refresh.', 'hub:ga');
        if (hub && hub.updatedAt && Date.now() - Date.parse(hub.updatedAt) > th.hubStaleDays * DAY) add('warn', 'hub', `Social hub stats are more than ${plural(th.hubStaleDays, 'day', 'days')} old.`, 'hub:stale');
        const health = ext.health;
        if (health && health.ok !== false) {
            (health.jobs || []).filter((job) => !job.ok).forEach((job) => add('alert', 'systems', `Job ${job.job} failed: ${job.error || job.note || 'no detail'}.`, 'job:' + job.job));
            const failed = (health.failures || {}).total || 0;
            if (failed >= th.failuresWarn) {
                const cause = ((health.failures.causes || [])[0] || {}).label;
                add(failed >= th.failuresAlert ? 'alert' : 'warn', 'systems', `${plural(failed, 'URL review run', 'URL review runs')} failed in range${cause ? '; top cause: ' + cause : ''}.`, 'review:failures');
            }
            const held = (health.reruns || {}).held || 0;
            if (held >= th.heldReruns) add('warn', 'systems', `${plural(held, 're-run is', 're-runs are')} held on the desk.`, 'review:held');
        }
        const jobs = ext.jobs;
        if (jobs && jobs.ok !== false) (jobs.jobs || []).filter((job) => !job.ok).forEach((job) => add('alert', 'systems', `Scheduler: ${job.name} last ended with ${job.error || 'an error'}.`, 'scheduler:' + job.name));
        const gh = ext.github;
        if (gh && gh.ok) {
            (gh.ci || []).filter((run) => run.conclusion && !['success', 'skipped', 'cancelled', 'neutral'].includes(run.conclusion)).forEach((run) => add('alert', 'systems', `CI "${run.name}" on main is ${run.conclusion}.`, 'ci:' + run.name));
            if (gh.openBugs) add('info', 'systems', `${plural(gh.openBugs, 'open bug', 'open bugs')}; most in ${((gh.bugAreas || [])[0] || {}).label || 'none'}. ${plural((gh.merged || {}).total || 0, 'PR', 'PRs')} merged this week.`, 'github:bugs');
        }
        const speed = ext.speed;
        if (speed && speed.ok) (speed.pages || []).forEach((page) => {
            if (page.ok && page.score < th.speedWarn) add('warn', page.product, `${page.name} scores ${page.score} on mobile PageSpeed.`, 'speed:' + page.product);
            else if (page.ok && page.score >= th.speedGood) add('good', page.product, `${page.name} scores ${page.score} on mobile PageSpeed.`, 'speed:' + page.product);
        });
        const up = ext.uptime;
        if (up && up.ok) {
            (up.pages || []).forEach((page) => {
                if (!page.ok) add('alert', page.product, `${page.name} answered ${page.status || 'nothing'}${page.error ? ' (' + page.error + ')' : ''}.`, 'uptime:' + page.product);
                else if (page.ms > th.uptimeMs) add('warn', page.product, `${page.name} took ${page.ms} ms to answer.`, 'slow:' + page.product);
            });
            if (up.tlsDaysLeft !== null && up.tlsDaysLeft !== undefined && up.tlsDaysLeft < th.tlsDays) add('alert', 'systems', `The TLS certificate expires in ${plural(up.tlsDaysLeft, 'day', 'days')}.`, 'tls');
        }
        const ga = ext.ga4;
        if (ga && ga.ok) {
            const sessions = (ga.groups || []).reduce((s, g) => s + g.sessions, 0);
            const prior = (ga.groups || []).reduce((s, g) => s + g.priorSessions, 0);
            const d = delta(sessions, prior);
            if (d.pct !== null && Math.abs(d.pct) >= th.sessionsSwingPct && Math.max(sessions, prior) >= 20) add(d.pct > 0 ? 'good' : 'warn', 'traffic', `GA4 sessions ${d.pct > 0 ? 'rose' : 'fell'} ${Math.abs(d.pct)}% (${sessions} vs ${prior}).`, 'ga4:swing');
        }
        const money = ext.money;
        if (money && money.ok) {
            const r = money.revenue || {};
            const before = (money.prior || {}).usd || 0;
            if (r.usd > 0) add('good', 'business', `${plural(r.count, 'sale', 'sales')} brought ${r.usd} USD in range${before ? ' (' + before + ' USD the period before)' : ''}.`, 'money:revenue');
            else if (before > 0) add('warn', 'business', `No sales in range, after ${before} USD the period before.`, 'money:none');
            if (money.refundsUsd > 0) add('warn', 'business', `${money.refundsUsd} USD refunded in range.`, 'money:refunds');
            if (money.paypal && money.paypal.disputesOpen > 0) add('alert', 'business', `${plural(money.paypal.disputesOpen, 'PayPal dispute is', 'PayPal disputes are')} open.`, 'money:disputes');
        }
        const mail = ext.email;
        const listed = (mail && mail.ok && mail.blocklisted) || [];
        if (listed.length) add('alert', 'business', `${plural(listed.reduce((n, l) => n + l.value, 0), 'email was', 'emails were')} refused because the sending IP is on ${listed.map((l) => l.label).join(', ')}.`, 'email:blocklist');
        if (mail && mail.ok && mail.totals && mail.totals.processed >= 10) {
            const m = mail.totals;
            if (m.spam_reports > 0) add('alert', 'business', `${plural(m.spam_reports, 'email was', 'emails were')} reported as spam in range.`, 'email:spam');
            if (mail.rates.bad >= th.emailBadPct) add('warn', 'business', `${mail.rates.bad}% of emails bounced or were blocked (${m.bounces + m.blocks} of ${m.processed}).`, 'email:bad');
        }
        const search = ext.search;
        if (search && search.ok && search.brave && search.brave.ok) {
            const asked = search.brave.queries.filter((q) => !q.error);
            const missing = asked.filter((q) => q.position === null);
            if (missing.length) add('info', 'business', `Not in Brave's top 20 for ${missing.length} of ${asked.length} searches, such as "${missing[0].query}".`, 'search:brave');
        }
        if (search && search.console && search.console.ok && search.console.impressions) add('info', 'business', `Google search: ${plural(search.console.clicks, 'click', 'clicks')} from ${search.console.impressions} impressions, average position ${search.console.position}.`, 'search:console');
        const social = ext.social;
        if (social && social.ok) {
            if (social.failed > 0) add('warn', 'business', `${plural(social.failed, 'social post', 'social posts')} failed to publish in range.`, 'social:failed');
            else if (!social.sent) add('info', 'business', 'No social posts went out in range.', 'social:none');
        }
        const safety = ext.safety;
        if (safety && safety.ok) (safety.checks || []).filter((c) => c.level === 'alert' || c.level === 'warn').forEach((c) => add(c.level, 'systems', `${c.name}: ${c.detail}`, 'safety:' + c.key));
        const pf = ext.platform;
        if (pf && pf.ok) {
            const f = pf.functions || {};
            if (f.failures >= th.fnFailures) add(f.failures >= th.fnFailures * 5 ? 'alert' : 'warn', 'systems', `${plural(f.failures, 'function run', 'function runs')} really failed in 24 hours (${f.failureRate}%), most in ${((f.byFunction || [])[0] || {}).label || 'unknown'}.`, 'platform:failures');
            const g = pf.gemini || {};
            if (g.requests >= 10 && g.errorRate >= th.geminiErrorPct) add('warn', 'systems', `${g.errorRate}% of Gemini calls failed this week (${g.requests - g.ok} of ${g.requests}), most in ${((g.failedMethods || [])[0] || {}).label || 'unknown'}.`, 'platform:gemini');
            const fs = pf.firestore || {};
            if (fs.readsFreePct >= th.firestoreFreePct) add('warn', 'systems', `Firestore used ${fs.readsFreePct}% of the free daily reads (${fs.reads}).`, 'platform:reads');
        }
        CONNECTIONS.forEach((c) => {
            const x = ext[c.key];
            if (x && x.ok === false) add('warn', 'systems', `${c.name} did not answer: ${String(x.error || 'failed').slice(0, 140)}`, 'connections:down:' + c.key);
        });
        const ou = ext.outreach;
        if (ou && ou.ok) {
            const plan = ou.plan && ou.plan.ok !== false ? ou.plan : null;
            const pipe = ou.pipeline && ou.pipeline.ok ? ou.pipeline : null;
            const mail = ou.instantly && ou.instantly.ok ? ou.instantly : null;
            if (plan) {
                (plan.deadlines || []).filter((d) => d.daysLeft >= 0 && d.daysLeft <= th.outreachDeadlineDays).forEach((d) => add(d.daysLeft <= 7 ? 'warn' : 'info', 'outreach', `${d.label} in ${plural(d.daysLeft, 'day', 'days')} (${d.date}).`, 'outreach:deadline:' + d.date));
                if (plan.next && plan.next.daysLeft >= 0 && plan.next.daysLeft <= 7) add('info', 'outreach', `Outreach milestone in ${plural(plan.next.daysLeft, 'day', 'days')} (${plan.next.date}): ${plan.next.label}.`, 'outreach:milestone');
            }
            if (pipe) {
                const weekly = plan && plan.weekly && plan.weekly.prospects;
                if (plan && plan.day > 0 && pipe.left === 0) add('warn', 'outreach', 'The outreach prospect queue is empty; add the next list with scripts/sweep-outreach.js.', 'outreach:queue');
                else if (plan && plan.day > 7 && weekly && pipe.thisWeek < weekly / 2) add('info', 'outreach', `${pipe.thisWeek} of ${weekly} outreach prospects reviewed this week.`, 'outreach:pace');
            }
            if (mail) {
                if (mail.sent >= 20 && mail.rates.bounce >= th.outreachBouncePct) add('alert', 'outreach', `${mail.rates.bounce}% of outreach emails bounced (${mail.bounced} of ${mail.sent}); pause and clean the list.`, 'outreach:bounce');
                const replies = mail.replies - (mail.autoReplies || 0);
                if (replies > 0) add('info', 'outreach', `${plural(replies, 'outreach reply', 'outreach replies')} in range, ${mail.interested} interested.`, 'outreach:replies');
                (mail.accounts || []).filter((a) => a.status !== 'active' || a.warmup !== 'on').forEach((a) => add('warn', 'outreach', `Mailbox ${a.email} is ${a.status}, warm-up ${a.warmup}.`, 'outreach:mailbox:' + a.email));
                const active = (mail.status || []).some((s) => s.label === 'active' && s.value > 0);
                const cold = (mail.accounts || []).filter((a) => a.score !== null && a.score < th.outreachWarmup);
                if (active && cold.length) add('warn', 'outreach', `Campaigns are sending while ${plural(cold.length, 'mailbox has', 'mailboxes have')} a warm-up score under ${th.outreachWarmup}.`, 'outreach:warmup');
            }
            if (ou.mail && ou.mail.checks) ou.mail.checks.filter((c) => !c.ok).forEach((c) => add('warn', 'outreach', `${ou.mail.domain} ${c.name}: ${c.detail}`, 'outreach:dns:' + c.name));
        }
        const waiting = CONNECTIONS.reduce((n, c) => n + (((ext[c.key] || {}).needs) || []).length, 0);
        if (waiting) add('info', 'systems', `${plural(waiting, 'connection waits', 'connections wait')} for a one-time grant; see Systems > Connections.`, 'connections:needs');
        (state.goals || []).forEach((g) => {
            if (g.status === 'done') add('good', g.product, `Goal met: ${g.label}, ${g.value} of ${g.target}.`, 'goal:' + g.key);
            else if (g.status === 'far-behind' && g.elapsed >= 25) add('warn', g.product, `Goal behind: ${g.label} is at ${g.value} of ${g.target} with ${g.elapsed}% of the time gone (pace ${g.projected}).`, 'goal:' + g.key);
            else if (g.status === 'behind' && g.elapsed >= 25) add('info', g.product, `Goal slipping: ${g.label} is at ${g.value} of ${g.target} (pace ${g.projected}).`, 'goal:' + g.key);
        });
        const rank = { alert: 0, warn: 1, good: 2, info: 3 };
        return out.sort((a, b) => rank[a.level] - rank[b.level]);
    }

    // Proposals: what to do next, from the briefing lines. Impact 5 means money, customers or the site at risk today, 1 a nice-to-have.
    // A rule matches a briefing key by prefix; grouped rules fold every match into one proposal. action names the safe action #1337 may run.
    const PROPOSAL_RULES = [
        { prefix: 'uptime:', impact: 5, title: (i) => `Bring ${(PRODUCTS.find((p) => p.key === i.product) || {}).name || i.product} back up`, tab: 'systems' },
        { prefix: 'tls', impact: 5, title: 'Renew the TLS certificate', tab: 'systems' },
        { prefix: 'money:disputes', impact: 5, title: 'Answer the open PayPal disputes before PayPal decides them', link: 'https://www.paypal.com/resolutioncenter' },
        { prefix: 'email:blocklist', impact: 5, title: 'Get the sending IP off the blocklist', link: 'https://app.sendgrid.com/' },
        { prefix: 'outreach:bounce', impact: 5, title: 'Pause outreach and clean the prospect list', tab: 'outreach' },
        { prefix: 'email:spam', impact: 4, title: 'Find which emails were reported as spam and fix the list or the copy', link: 'https://app.sendgrid.com/' },
        { prefix: 'safety:', impact: 4, group: true, title: (n) => `Fix ${n === 1 ? 'the failing safety check' : n + ' failing safety checks'}`, tab: 'systems' },
        { prefix: 'job:', impact: 4, group: true, title: (n) => `Fix ${n === 1 ? 'the failing job' : n + ' failing jobs'}`, tab: 'systems' },
        { prefix: 'scheduler:', impact: 4, group: true, title: (n) => `Fix ${n === 1 ? 'the scheduler job that failed' : n + ' scheduler jobs that failed'}`, tab: 'systems' },
        { prefix: 'ci:', impact: 4, group: true, title: 'Get CI on main green again', link: 'https://github.com/kaanmuar/kaanmuar.github.io/actions' },
        { prefix: 'review:failures', impact: 4, title: 'Fix the top cause of failed URL review runs', tab: 'systems' },
        { prefix: 'inbox:unanswered', impact: 4, title: 'Answer the messages that are waiting', tab: 'inbox' },
        { prefix: 'review:conversion', impact: 4, title: 'Make the URL Review page turn more opens into reviews', tab: 'review' },
        { prefix: 'money:none', impact: 4, title: 'Find out why sales stopped', tab: 'business' },
        { prefix: 'outreach:warmup', impact: 4, title: 'Hold the campaigns until the mailboxes are warm', tab: 'outreach' },
        { prefix: 'outreach:dns:', impact: 4, group: true, title: 'Fix the sending domain records', tab: 'outreach' },
        { prefix: 'review:held', impact: 3, title: 'Re-run the held reviews', action: 'rerun-held', tab: 'systems' },
        { prefix: 'notices:failed', impact: 3, title: 'Re-send the owner notices that failed', action: 'resend-notices', tab: 'review' },
        { prefix: 'hub:stale', impact: 3, title: 'Publish the Social hub', action: 'publish-hub', tab: 'hub' },
        { prefix: 'money:refunds', impact: 3, title: 'Read why customers asked for refunds', tab: 'business' },
        { prefix: 'email:bad', impact: 3, title: 'Clean the addresses that bounce or block', link: 'https://app.sendgrid.com/' },
        { prefix: 'speed:', impact: 3, levels: ['warn'], title: (i) => `Speed up ${(PRODUCTS.find((p) => p.key === i.product) || {}).name || i.product} on mobile`, tab: 'systems' },
        { prefix: 'slow:', impact: 3, group: true, title: 'Find why the pages answer slowly', tab: 'systems' },
        { prefix: 'platform:failures', impact: 3, title: 'Fix the function that fails most', tab: 'systems' },
        { prefix: 'platform:gemini', impact: 3, title: 'Fix the failing Gemini calls', tab: 'systems' },
        { prefix: 'platform:reads', impact: 3, title: 'Cut Firestore reads before the free quota runs out', tab: 'systems' },
        { prefix: 'social:failed', impact: 3, title: 'Re-post the social posts that failed', tab: 'hub' },
        { prefix: 'outreach:queue', impact: 3, title: 'Add the next outreach prospect list', tab: 'outreach' },
        { prefix: 'outreach:mailbox:', impact: 3, group: true, title: 'Turn the outreach mailboxes and warm-up back on', tab: 'outreach' },
        { prefix: 'outreach:deadline:', impact: 3, levels: ['warn'], group: true, title: 'Get ready for the outreach deadline', tab: 'outreach' },
        { prefix: 'goal:', impact: 3, levels: ['warn'], title: (i) => 'Catch up on the goal: ' + i.text.replace(/^Goal behind: /, '').split(' is at ')[0], tab: 'overview' },
        { prefix: 'inbox:pending', impact: 2, title: 'Approve or reject the waiting ratings', tab: 'inbox' },
        { prefix: 'hub:ga', impact: 2, title: 'Reconnect GA4 for the Social hub stats', tab: 'hub' },
        { prefix: 'connections:down:', impact: 2, group: true, title: (n) => `Reconnect ${n === 1 ? 'the source that did not answer' : n + ' sources that did not answer'}`, tab: 'systems' },
        { prefix: 'connections:needs', impact: 2, title: 'Grant the connections that wait for a one-time step', tab: 'systems' },
        { prefix: 'search:brave', impact: 2, title: 'Write for the searches where we are not in the top 20', tab: 'business' },
        { prefix: 'social:none', impact: 2, title: 'Schedule social posts', tab: 'hub' },
        { prefix: 'outreach:pace', impact: 2, title: 'Review more outreach prospects this week', tab: 'outreach' },
        { prefix: 'ga4:swing', impact: 2, levels: ['warn'], title: 'Find why GA4 sessions fell', tab: 'traffic' },
        { prefix: 'cv:swing', impact: 2, levels: ['warn'], title: 'Find why CV visits fell', tab: 'cv' },
        { prefix: 'studio:swing', impact: 2, levels: ['warn'], title: 'Find why QA Studio visits fell', tab: 'studio' },
        { prefix: 'lab:swing', impact: 2, levels: ['warn'], title: 'Find why QA Lab visits fell', tab: 'lab' },
        { prefix: 'review:swing', impact: 2, levels: ['warn'], title: 'Find why URL Review opens fell', tab: 'review' }
    ];
    const SAFE_ACTIONS = ['rerun-held', 'resend-notices', 'publish-hub'];

    function proposalRules(state, briefed) {
        const items = (briefed || briefing(state)).slice();
        const notices = ((state.external || {}).health || {}).notices;
        if (notices && notices.failed > 0) items.push({ level: 'warn', product: 'review', text: `${notices.failed} owner ${notices.failed === 1 ? 'notice' : 'notices'} failed to send and wait on the desk.`, key: 'notices:failed' });
        const out = new Map();
        items.forEach((item) => {
            const rule = PROPOSAL_RULES.find((r) => item.key === r.prefix || item.key.startsWith(r.prefix));
            if (!rule || (rule.levels ? !rule.levels.includes(item.level) : !['alert', 'warn'].includes(item.level) && !['search:brave', 'connections:needs', 'social:none', 'outreach:pace'].includes(rule.prefix))) return;
            const key = rule.group ? rule.prefix.replace(/:$/, '') : item.key;
            const row = out.get(key) || { key, product: item.product, impact: rule.impact, level: item.level, evidence: [], source: 'rules', action: rule.action || null, tab: rule.tab || null, link: rule.link || null, rule };
            row.evidence.push(item.text);
            if (/^(job|scheduler):/.test(item.key)) (row.jobs = row.jobs || []).push(item.key.slice(item.key.indexOf(':') + 1));
            if (item.level === 'alert') row.level = 'alert';
            row.item = row.item || item;
            out.set(key, row);
        });
        const rank = { alert: 0, warn: 1, good: 2, info: 3 };
        return Array.from(out.values()).map((row) => {
            const t = row.rule.title;
            const title = typeof t === 'function' ? t(row.rule.group ? row.evidence.length : row.item) : t;
            const impact = Math.min(5, row.impact + (row.level === 'alert' && row.impact < 5 ? 1 : 0));
            return { key: row.key, product: row.product, impact, level: row.level, title, evidence: row.evidence.slice(0, 4), source: 'rules', action: row.action, jobs: row.jobs ? Array.from(new Set(row.jobs)).slice(0, 6) : null, tab: row.tab, link: row.link };
        }).sort((a, b) => b.impact - a.impact || rank[a.level] - rank[b.level]);
    }

    // Done hides a proposal for a week, Dismiss for a month; a saved state is { key, status, until }.
    function openProposals(list, saved, now) {
        const at = (now || new Date()).getTime();
        const hidden = new Set((saved || []).filter((s) => (s.status === 'done' || s.status === 'dismissed') && Date.parse(s.until) > at).map((s) => s.key));
        return (list || []).filter((p) => !hidden.has(p.key));
    }

    // Snooze hides a briefing line for a day or a week, Dismiss for a month; a saved state is { key, status, until }.
    const BRIEF_HIDE_DAYS = { snoozed: 1, week: 7, dismissed: 30 };
    function openBrief(items, saved, now) {
        const at = (now || new Date()).getTime();
        const hidden = new Set((saved || []).filter((s) => BRIEF_HIDE_DAYS[s.status] && Date.parse(s.until) > at).map((s) => s.key));
        return { open: (items || []).filter((b) => !hidden.has(b.key)), hidden: (items || []).filter((b) => hidden.has(b.key)) };
    }

    const BRIEF_LINKS = {
        github: 'https://github.com/kaanmuar/kaanmuar.github.io/actions', sendgrid: 'https://app.sendgrid.com/suppressions/blocks', spamcop: 'https://www.spamcop.net/bl.shtml',
        paypal: 'https://www.paypal.com/resolutioncenter', ga4: 'https://analytics.google.com/analytics/web/#/p495572902/reports/intelligenthome',
        admin: 'https://carlosandmunoz.com/admin.html', cloudflare: 'https://dash.cloudflare.com/', firebase: 'https://console.firebase.google.com/project/carlosm-interactive-cv/functions'
    };

    /* What a briefing line opens: a title and tab from PROPOSAL_RULES, the numbers behind it, links, the actions the jarvis
       function can run (action-run ids), and list: 'ratings' | 'messages' when the sheet loads rows through brief-items. */
    function briefDetail(item, state) {
        const k = (item && item.key) || '';
        const s = state || {};
        const ext = s.external || {};
        const p = s.products || {};
        const tail = k.slice(k.indexOf(':') + 1);
        const rule = PROPOSAL_RULES.find((r) => k === r.prefix || k.startsWith(r.prefix));
        const t = rule && rule.title;
        const facts = [], links = [], actions = [];
        const fact = (label, value) => { if (value !== null && value !== undefined && value !== '') facts.push({ label, value: String(value) }); };
        const link = (label, url) => { if (url) links.push({ label, url }); };
        const act = (id, label, extra) => actions.push(Object.assign({ id, label }, extra || {}));
        const name = (key) => (PRODUCTS.find((r) => r.key === key) || {}).name || key;
        const out = { title: (typeof t === 'function' ? t(rule.group ? 1 : item) : t) || item.text, tab: (rule && rule.tab) || (item.product !== 'overview' ? item.product : null), facts, links, actions, list: null };
        const health = ext.health || {};
        const mail = ext.email || {};
        const pf = ext.platform || {};
        if (k.startsWith('ci:')) {
            const run = ((ext.github || {}).ci || []).find((r) => r.name === tail) || {};
            fact('Workflow', tail); fact('Result', run.conclusion); fact('Commit', run.sha); fact('Finished', run.at);
            link('Open the run on GitHub', run.url || BRIEF_LINKS.github);
            act('rerun-ci', 'Re-run the failed jobs', { workflow: tail });
        } else if (k === 'review:failures') {
            const f = health.failures || {};
            fact('Failed runs', f.total);
            (f.causes || []).slice(0, 5).forEach((c) => fact(c.label, c.value));
            (f.hosts || []).slice(0, 3).forEach((h) => fact('Site: ' + h.label, h.value));
            (f.latest || []).slice(0, 3).forEach((r) => fact('Latest: ' + r.host, r.cause));
        } else if (k === 'review:held') {
            fact('Held re-runs', (health.reruns || {}).held); fact('Re-runs in range', (health.reruns || {}).total);
            act('rerun-held', 'Send the held re-runs');
        } else if (k.startsWith('job:')) {
            const job = (health.jobs || []).find((j) => j.job === tail) || {};
            fact('Job', tail); fact('Started', job.startedAt); fact('Ended', job.endedAt); fact('Error', job.error || job.note);
            link('Function logs', BRIEF_LINKS.firebase);
            act('run-job', 'Run ' + tail + ' again', { job: tail });
        } else if (k.startsWith('scheduler:')) {
            const job = ((ext.jobs || {}).jobs || []).find((j) => j.name === tail) || {};
            fact('Job', tail); fact('Schedule', job.schedule && job.schedule + (job.timeZone ? ' (' + job.timeZone + ')' : '')); fact('Last attempt', job.lastAttempt); fact('Next run', job.nextRun); fact('Error', job.error);
            act('run-job', 'Run ' + tail + ' again', { job: tail });
        } else if (k === 'email:blocklist') {
            (mail.blocklisted || []).forEach((l) => fact('Refused by ' + l.label, l.value));
            ((mail.suppressions || {}).blocks || []).filter((r) => /list|spamcop|spamhaus|barracuda/i.test(r.reason)).slice(0, 3).forEach((r) => fact('Blocked at ' + r.domain, r.reason));
            link('SendGrid blocks', BRIEF_LINKS.sendgrid); link('SpamCop lookup', BRIEF_LINKS.spamcop);
        } else if (/^email:(spam|bad)$/.test(k)) {
            const m = mail.totals || {};
            fact('Processed', m.processed); fact('Bounces', m.bounces); fact('Blocks', m.blocks); fact('Spam reports', m.spam_reports); fact('Bad rate', (mail.rates || {}).bad !== undefined ? mail.rates.bad + '%' : null);
            link('SendGrid suppressions', BRIEF_LINKS.sendgrid);
        } else if (k === 'inbox:unanswered' || k === 'inbox:pending') {
            const i = (p.inbox || {}).totals || {};
            fact('Messages in range', i.messages); fact('No answer yet', i.unanswered); fact('Ratings waiting', i.pending); fact('Average rating', i.avg);
            out.list = k === 'inbox:pending' ? 'ratings' : 'messages';
            link('Open the admin inbox', BRIEF_LINKS.admin);
        } else if (k === 'ga4:swing') {
            const groups = (ext.ga4 || {}).groups || [];
            fact('Sessions', groups.reduce((n, g) => n + g.sessions, 0)); fact('Period before', groups.reduce((n, g) => n + g.priorSessions, 0));
            groups.slice().sort((a, b) => (a.sessions - a.priorSessions) - (b.sessions - b.priorSessions)).slice(0, 4).forEach((g) => fact(g.group, g.sessions + ' vs ' + g.priorSessions));
            ((ext.ga4 || {}).sources || []).slice(0, 3).forEach((r) => fact('Source: ' + r.label, r.value + ' vs ' + r.prior));
            link('Open GA4', BRIEF_LINKS.ga4);
        } else if (/^(cv|studio|lab|review):(swing|anomaly|source)$/.test(k)) {
            const sum = p[item.product] || {};
            const kpi = (sum.kpis || [])[0] || {};
            fact(kpi.label, kpi.value); fact('Period before', kpi.prior);
            if (sum.anomaly) fact('Today vs daily average', sum.anomaly.last + ' vs ' + sum.anomaly.mean);
            ((sum.lists || {}).sources || []).slice(0, 4).forEach((r) => fact('Source: ' + r.label, r.value));
        } else if (/^(uptime|slow|speed):/.test(k)) {
            const page = (((k.startsWith('speed:') ? ext.speed : ext.uptime) || {}).pages || []).find((r) => r.product === item.product) || {};
            fact('Page', page.name); fact('Status', page.status); fact('Answer time', page.ms !== undefined ? page.ms + ' ms' : null); fact('Mobile score', page.score); fact('Error', page.error);
            link('Open the page', page.url); link('Cloudflare', BRIEF_LINKS.cloudflare);
        } else if (k === 'tls') {
            fact('Days left', (ext.uptime || {}).tlsDaysLeft);
        } else if (k.startsWith('money:')) {
            const m = ext.money || {};
            fact('Revenue', (m.revenue || {}).usd !== undefined ? m.revenue.usd + ' USD' : null); fact('Sales', (m.revenue || {}).count); fact('Period before', (m.prior || {}).usd !== undefined ? m.prior.usd + ' USD' : null);
            fact('Refunded', m.refundsUsd ? m.refundsUsd + ' USD' : null); fact('Open disputes', (m.paypal || {}).disputesOpen);
            if (k === 'money:disputes') link('PayPal resolution center', BRIEF_LINKS.paypal);
        } else if (k.startsWith('platform:')) {
            const f = pf.functions || {}, g = pf.gemini || {}, fs = pf.firestore || {};
            if (k === 'platform:failures') { fact('Failed runs (24 h)', f.failures); fact('Failure rate', f.failureRate !== undefined ? f.failureRate + '%' : null); (f.byFunction || []).slice(0, 4).forEach((r) => fact(r.label, r.value)); link('Function logs', BRIEF_LINKS.firebase); }
            if (k === 'platform:gemini') { fact('Calls', g.requests); fact('Error rate', g.errorRate + '%'); (g.failedMethods || []).slice(0, 4).forEach((r) => fact(r.label, r.value)); }
            if (k === 'platform:reads') { fact('Reads today', fs.reads); fact('Share of the free quota', fs.readsFreePct + '%'); }
        } else if (k.startsWith('goal:')) {
            const g = (s.goals || []).find((r) => 'goal:' + r.key === k) || {};
            fact('Goal', g.label); fact('Now', g.value); fact('Target', g.target); fact('Time gone', g.elapsed !== undefined ? g.elapsed + '%' : null); fact('Pace', g.projected);
        } else if (k === 'hub:stale' || k === 'hub:ga') {
            fact('Updated', (p.hub || {}).updatedAt);
            if (k === 'hub:stale') act('publish-hub', 'Publish the Social hub');
        } else if (k.startsWith('safety:')) {
            const c = ((ext.safety || {}).checks || []).find((r) => 'safety:' + r.key === k) || {};
            fact('Check', c.name); fact('Detail', c.detail);
        }
        if (rule && rule.link) link('Open ↗', rule.link);
        if (rule && rule.action && !actions.some((a) => a.id === rule.action)) act(rule.action, rule.title);
        return out;
    }

    // Share of checks that pass, for the reactor ring: jobs, CI, uptime, speed, failures.
    function readiness(external) {
        const checks = [];
        const e = external || {};
        if (e.health && e.health.jobs) e.health.jobs.forEach((job) => checks.push(job.ok));
        if (e.jobs && e.jobs.jobs) e.jobs.jobs.forEach((job) => checks.push(job.ok));
        if (e.github && e.github.ci) e.github.ci.forEach((run) => { if (run.conclusion !== 'cancelled') checks.push(['success', 'skipped', 'neutral'].includes(run.conclusion)); });
        if (e.uptime && e.uptime.pages) e.uptime.pages.forEach((page) => checks.push(!!page.ok && page.ms <= 3000));
        if (e.speed && e.speed.pages) e.speed.pages.forEach((page) => { if (page.ok) checks.push(page.score >= 50); });
        if (e.safety && e.safety.checks) e.safety.checks.forEach((c) => { if (c.level !== 'info') checks.push(c.ok); });
        if (!checks.length) return null;
        return Math.round((checks.filter(Boolean).length / checks.length) * 100);
    }

    function csv(rows) {
        if (!rows || !rows.length) return '';
        const cols = Object.keys(rows.reduce((all, row) => Object.assign(all, row), {}));
        const cell = (value) => {
            const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
            return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
        };
        return [cols.join(',')].concat(rows.map((row) => cols.map((col) => cell(row[col])).join(','))).join('\n');
    }

    // Voice and command-bar phrases: "show url review", "last 7 days", "print", "read the briefing", "run sweepReviews".
    function parseCommand(text) {
        const raw = String(text || '').trim();
        const t = raw.toLowerCase().replace(/^(hey |ok |okay )?jarvis[,.!]?\s*/, '').trim();
        if (!t) return { type: 'none' };
        const range = t.match(/\b(?:last|past)?\s*(24 hours|today|7|14|30|90)\s*(?:days?)?\b|\ball time\b/);
        if (/\ball time\b/.test(t)) return { type: 'range', value: 'all' };
        if (range && /\b(day|days|hours|today|range|last|past)\b/.test(t)) return { type: 'range', value: /24 hours|today/.test(range[1]) ? '1' : range[1] };
        if (/\b(print|pdf)\b/.test(t)) return { type: 'print', all: /\b(all|everything)\b/.test(t) };
        if (/\b(export|download)\b/.test(t)) return { type: 'export', format: /\bcsv\b/.test(t) ? 'csv' : /\b(png|image|picture)\b/.test(t) ? 'png' : 'json' };
        if (/\b(share|link)\b/.test(t)) return { type: 'share' };
        if (/\b(settings|goals?|targets?|thresholds?|limits?)\b/.test(t) && !/\?$/.test(t)) return { type: 'settings' };
        if (/\b(daily|morning) (briefing|email|mail)\b/.test(t)) return { type: 'daily' };
        if (/\b(email|mail)\b/.test(t)) return { type: 'email' };
        if (/\b(refresh|reload|update)\b/.test(t)) return { type: 'refresh' };
        if (/\b(read|speak|say|brief|briefing|status|report)\b/.test(t) && !/\?$/.test(t)) return { type: 'speak' };
        if (/\b(stop|quiet|silence|mute)\b/.test(t)) return { type: 'stop' };
        const run = raw.match(/\brun\s+(?:the\s+)?(?:job\s+)?([A-Za-z][A-Za-z0-9]{2,60})\b/i);
        if (run && !/^(the|a|job)$/i.test(run[1])) return { type: 'run-job', job: run[1] };
        const aliases = [
            ['overview', /\b(overview|home|summary|everything)\b/], ['inbox', /\b(inbox|messages?|ratings?)\b/],
            ['review', /\b(url review|review|reviews|qa-?lab url)\b/], ['studio', /\b(studio|simulator|simulador)\b/],
            ['lab', /\b(lab|regression)\b/], ['cv', /\b(cv|resume|résumé)\b/], ['hub', /\b(hub|social)\b/],
            ['traffic', /\b(traffic|ga4|analytics|cloudflare)\b/], ['systems', /\b(systems?|health|ops|jobs|ci|speed|uptime)\b/]
        ];
        if (/\b(show|open|go to|switch to|display)\b/.test(t) || t.split(/\s+/).length <= 3) {
            const hit = aliases.find(([, re]) => re.test(t));
            if (hit) return { type: 'go', product: hit[0] };
        }
        return { type: 'ask', question: raw };
    }

    function windowFor(range, now) {
        const end = now || new Date();
        if (range === 'all') return { start: new Date(end.getTime() - 3 * 365 * DAY), end, days: 0, prior: null };
        const days = Math.max(1, Number(range) || 30);
        const start = new Date(end.getTime() - days * DAY);
        return { start, end, days, prior: { start: new Date(start.getTime() - days * DAY), end: start } };
    }

    const api = { THRESHOLDS, thresholds, CONNECTIONS, connections, outreachVisits, SEARCH_QUERIES, GOAL_METRICS, GOAL_PERIODS, cleanGoals, goalKey, goalLabel, periodWindow, goalProgress, ZONE, DAY, PRODUCTS, WEEKDAYS, toDate, zoneParts, bump, topList, delta, dayKeys, dailySeries, anomaly, openSource, linkCode, actionTitle, isHubEvent, isTestEmail, heatmap, peak, summarizeSite, summarizeReview, summarizeInbox, summarizeHub, briefing, PROPOSAL_RULES, SAFE_ACTIONS, proposalRules, openProposals, BRIEF_HIDE_DAYS, openBrief, briefDetail, readiness, csv, parseCommand, windowFor };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.JarvisCore = api;
})(typeof self !== 'undefined' ? self : this);
