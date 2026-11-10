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
        { key: 'geo', name: 'Map', short: 'MAP' },
        { key: 'engagement', name: 'Engagement', short: 'ENG' },
        { key: 'traffic', name: 'Traffic', short: 'WEB' },
        { key: 'systems', name: 'Systems', short: 'SYS' },
        { key: 'github', name: 'GitHub', short: 'GH' },
        { key: 'console', name: 'Console', short: 'LOG' }
    ];
    // Jarvis > Console (#2810): the jarvis_log line sources and levels, lowest level first.
    const LOG_SOURCES = ['jarvis', 'function', 'actions', 'mac', 'board', 'github', 'gemini', 'push', 'countdown'];
    const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
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

    // url_reviews also holds payments, owner claims and runs turned away; only the rest are review runs.
    const NOT_RUNS = ['owner-claim', 'paid-report', 'paid-addon', 'run-credit', 'run-credit-used', 'run-credit-refunded', 'monthly-pass', 'checkout-open', 'payment-due', 'blocked'];
    function isReviewRun(row) {
        return !!row && !NOT_RUNS.includes(row.status);
    }

    // Runs nobody outside asked for (#3194). Sweep and rival runs have no asker email, and stored Jarvis days before
    // #3194 have no source, so an empty email counts as ours too.
    const REVIEW_ORIGINS = { sweep: 'country sweep', rivals: 'rival sweep', jarvis: 'shared from Jarvis', test: 'test', team: 'our address', automated: 'no asker email' };
    const TEAM_EMAIL = /^kaanmuar@gmail\.com$|@(carlosandmunoz\.com|qalabreview\.com|qa-lab\.co)$/;
    function reviewOrigin(row) {
        if (!isReviewRun(row)) return '';
        if (row.source === 'sweep' || row.sweep) return 'sweep';
        if (row.source === 'rivals' || row.rivalOf) return 'rivals';
        if (row.source === 'jarvis') return 'jarvis';
        const email = String(row.email || '').trim().toLowerCase();
        if (!email) return 'automated';
        if (row.test === true || isTestEmail(email)) return 'test';
        return TEAM_EMAIL.test(email) ? 'team' : '';
    }

    function splitReviews(rows) {
        const out = { people: [], ours: [], kinds: {} };
        (rows || []).filter(isReviewRun).forEach((row) => {
            const origin = reviewOrigin(row);
            if (!origin) { out.people.push(row); return; }
            out.ours.push(row);
            bump(out.kinds, REVIEW_ORIGINS[origin]);
        });
        return out;
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
    // Reviews are the runs people asked for; our sweeps, Jarvis runs and tests are counted apart as ours (#3194).
    function summarizeReview(data, window) {
        const opens = data.opens || [];
        const split = splitReviews(data.reviews);
        const reviews = split.people;
        const clicks = (data.events || []).filter((row) => row.site === 'review' && !isHubEvent(row) && row.kind !== 'visit' && row.kind !== 'view');
        const prior = data.prior || null;
        const paid = (data.reviews || []).filter((row) => row.paid === true && row.test !== true && !reviewOrigin(row));
        const usd = Math.round(paid.reduce((sum, row) => sum + (Number(row.priceUsd) || 0), 0) * 100) / 100;
        const complete = reviews.filter((row) => row.status === 'complete').length;
        const scores = reviews.map((row) => Number(row.score)).filter((n) => Number.isFinite(n) && n > 0);
        const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        const maps = { sources: {}, reviewSources: {}, pages: {}, statuses: {}, hosts: {}, frameworks: {}, countries: {}, cities: {}, langs: {}, screens: {}, actions: {}, ourRuns: split.kinds };
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
        const oursSeries = dailySeries(split.ours, window.start, window.end);
        const grid = heatmap(opens);
        return {
            key: 'review',
            totals: { opens: openTotal, reviews: reviewTotal, ours: split.ours.length, paid: paid.length, usd, complete, conversion, avgScore },
            kpis: [
                kpi('Opens', openTotal, prior ? prior.opens : undefined),
                kpi('Reviews by people', reviewTotal, prior ? prior.reviews : undefined),
                kpi('Our runs', split.ours.length, prior && prior.ours !== undefined ? prior.ours : undefined),
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
            oursSeries,
            anomaly: anomaly(opensSeries.values),
            heatmap: grid,
            peak: peak(grid),
            truncated: (data.openTotal || 0) > opens.length || (data.reviewTotal || 0) > (data.reviews || []).length,
            lists: Object.keys(maps).reduce((out, key) => { out[key] = topList(maps[key]); return out; }, {})
        };
    }

    function summarizeInbox(messages, ratings, window, priorWindow, keep, pendingCount) {
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
        const pending = pendingCount !== undefined ? pendingCount : ratings.filter((row) => pass(row) && (row.status || 'pending') === 'pending').length;
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

    // Social hub: views and interactions in the range from hub_/post_ site_events, so each has a period before.
    // socialHubStats/latest keeps the running totals, the GA4 views and the post ranking.
    function summarizeHub(stats, rows, window, priorRows) {
        const s = stats || {};
        const totals = s.totals || {};
        const hubRows = (rows || []).filter(isHubEvent);
        const isView = (row) => row.name === 'hub_view' || row.name === 'post_view';
        const tally = (list) => {
            const t = { views: 0, hubViews: 0, postViews: 0, interactions: 0 };
            list.forEach((row) => {
                if (row.name === 'hub_view') t.hubViews += 1;
                else if (row.name === 'post_view') t.postViews += 1;
                else t.interactions += 1;
            });
            t.views = t.hubViews + t.postViews;
            return t;
        };
        const now = tally(hubRows);
        const was = priorRows ? tally(priorRows.filter(isHubEvent)) : null;
        const prior = (key) => (was ? was[key] : undefined);
        const names = {};
        hubRows.forEach((row) => bump(names, row.name));
        const posts = (s.posts || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
        return {
            key: 'hub',
            updatedAt: s.updatedAt || '',
            ga: s.ga || null,
            totals,
            range: now,
            prior: was,
            kpis: [
                kpi('Hub + post views', now.views, prior('views')),
                kpi('Hub views', now.hubViews, prior('hubViews')),
                kpi('Post views', now.postViews, prior('postViews')),
                kpi('Interactions', now.interactions, prior('interactions')),
                kpi('GA4 views', totals.gaViews || 0)
            ],
            series: dailySeries(hubRows, window.start, window.end, isView),
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

    // The repos the GitHub tab shows when Settings lists none (#2807): jarvis_settings/main github.repos, owner/name each.
    const GITHUB_REPOS = ['kaanmuar/kaanmuar.github.io', 'kaanmuar/qa-lab-outreach', 'kaanmuar/cursor-quota', 'kaanmuar/cursor-quota-releases'];
    function githubRepos(list) {
        const clean = Array.from(new Set((Array.isArray(list) ? list : []).map((r) => String(r || '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\/+$/, '')).filter((r) => /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(r)))).slice(0, 20);
        return clean.length ? clean : GITHUB_REPOS.slice();
    }

    // Section layout per tab (#2809): jarvis_settings/main layout[tab] = { order, hidden } of panel ids, saved by the web and the app.
    // The app names a panel panelSlug(title); ids one side does not show keep their place when the other side saves.
    const LAYOUT_TABS = PRODUCTS.map((p) => p.key);
    const LAYOUT_ID = /^[a-z0-9][a-z0-9_.:-]{0,79}$/i;
    const LAYOUT_MAX = 200;
    function panelSlug(title) {
        const slug = String(title || '').split(' · ')[0].replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
        return slug || 'panel';
    }
    const layoutIds = (list) => Array.from(new Set((Array.isArray(list) ? list : []).filter((id) => typeof id === 'string' && LAYOUT_ID.test(id)))).slice(0, LAYOUT_MAX);
    function cleanLayout(input) {
        const out = {};
        if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
        LAYOUT_TABS.forEach((tab) => {
            const t = input[tab];
            if (!t || typeof t !== 'object' || Array.isArray(t)) return;
            const order = layoutIds(t.order);
            const hidden = layoutIds(t.hidden);
            if (order.length || hidden.length) out[tab] = { order, hidden };
        });
        return out;
    }
    // base, then each id of ref that base lacks, right after the nearest id before it in ref that is already placed (first when none is).
    function layoutWeave(base, ref) {
        const out = base.slice();
        const placed = new Set(out);
        ref.forEach((id, i) => {
            if (placed.has(id)) return;
            let at = 0;
            for (let k = i - 1; k >= 0; k--) { const j = out.indexOf(ref[k]); if (j >= 0) { at = j + 1; break; } }
            out.splice(at, 0, id);
            placed.add(id);
        });
        return out;
    }
    // The panels a tab shows, in the saved order: new panels at their default place, saved ids no panel has any more ignored.
    function applyLayout(defaultIds, layout) {
        const ids = Array.from(new Set(Array.isArray(defaultIds) ? defaultIds : []));
        const present = new Set(ids);
        const l = layout || {};
        const all = layoutWeave(layoutIds(l.order).filter((id) => present.has(id)), ids);
        const hide = new Set(layoutIds(l.hidden));
        return { all, order: all.filter((id) => !hide.has(id)), hidden: all.filter((id) => hide.has(id)) };
    }
    // One step up (-1) or down (1) past the next shown panel; hidden panels keep their place.
    function layoutMove(all, hidden, id, step) {
        const hide = new Set(hidden || []);
        const seen = all.filter((x) => x === id || !hide.has(x));
        const k = seen.indexOf(id) + step;
        if (seen.indexOf(id) < 0 || k < 0 || k >= seen.length) return all.slice();
        const out = all.filter((x) => x !== id);
        const j = out.indexOf(seen[k]);
        out.splice(step < 0 ? j : j + 1, 0, id);
        return out;
    }
    // What to save after an edit: this side's order and hidden panels, with the ids it did not show (the other side's, or empty panels) kept.
    function keepLayout(prev, all, hidden, shown) {
        const p = prev || {};
        const mine = new Set(shown || all);
        return {
            order: layoutWeave(layoutIds(all), layoutIds(p.order)).slice(0, LAYOUT_MAX),
            hidden: layoutIds(layoutIds(p.hidden).filter((id) => !mine.has(id)).concat(layoutIds(hidden)))
        };
    }

    // Every source Jarvis reads, for Systems > Connections. needs[] lists the one-time grants a source still waits for.
    const CONNECTIONS = [
        { key: 'health', name: 'Firestore (server collections)' }, { key: 'jobs', name: 'Cloud Scheduler' }, { key: 'github', name: 'GitHub' },
        { key: 'ga4', name: 'Google Analytics 4' }, { key: 'cloudflare', name: 'Cloudflare' }, { key: 'speed', name: 'PageSpeed and CrUX' },
        { key: 'uptime', name: 'Uptime and TLS' }, { key: 'money', name: 'Payments (paid reviews, PayPal, Stripe)' }, { key: 'email', name: 'SendGrid' },
        { key: 'search', name: 'Search (Brave, Search Console)' }, { key: 'social', name: 'Social (ledgers, YouTube, Facebook)' },
        { key: 'safety', name: 'Safety (Web Risk, DNS, domain, TLS)' }, { key: 'platform', name: 'Google Cloud (Monitoring, Logging, Auth)' },
        { key: 'outreach', name: 'Outreach (sweep prospects, Instantly, 90-day plan)' }, { key: 'mailbox', name: 'ImprovMX (mail forwarding)' },
        { key: 'addresses', name: 'Email addresses (ImprovMX, Microsoft 365, Instantly, SendGrid)' },
        { key: 'pagespeed', name: 'Daily PageSpeed run (every page, its PRs)' },
        { key: 'github-work', name: 'GitHub work (repos, CI, PRs, board, security)' }
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

    const SOCIAL = /linkedin|facebook|youtube|tiktok|instagram|threads|twitter|\bx\b|t\.co|buffer|reddit|telegram|\bt\.me\b/i;

    /** Marketing's "when they come" grid: visits from a social network or an outreach link, by weekday and hour. */
    function socialHeat(events) {
        return heatmap((events || []).filter((r) => r.kind === 'visit' && (SOCIAL.test(openSource(r)) || /utm_source=outreach/i.test(String(r.query || '')))));
    }

    /** The overview's live feed (#2102): the newest events, opens and reviews of the range, newest first, as plain lines. */
    function feed(rows, max) {
        const r = rows || {};
        const iso = (v) => { const d = toDate(v); return d ? d.toISOString() : ''; };
        const product = (key) => (PRODUCTS.find((p) => p.key === key) || { name: key }).name;
        return [].concat(
            (r.events || []).slice(0, 40).map((x) => ({ at: iso(x.createdAt), text: `${product(x.site)}: ${x.kind === 'visit' ? 'visit from ' + openSource(x) : actionTitle(x)}` })),
            (r.opens || []).slice(0, 20).map((x) => ({ at: iso(x.createdAt), text: `URL Review: open from ${openSource(x)}` })),
            (r.reviews || []).filter(isReviewRun).slice(0, 20).map((x) => {
                const origin = reviewOrigin(x);
                return { at: iso(x.createdAt), text: `URL Review: ${origin ? 'our ' : x.paid ? 'paid ' : ''}review of ${String(x.requestedUrl || x.url || '').replace(/^https?:\/\//, '').slice(0, 50)} (${origin ? REVIEW_ORIGINS[origin] + ', ' : ''}${x.status || '…'})` };
            })
        ).filter((x) => x.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, max || 18);
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

    // Visits the site records itself (CV, Studio and Lab visits, URL Review opens), with or without analytics consent.
    // GA4 only sees visitors who allow analytics, so this is the traffic number that does not drop with consent.
    function siteVisits(products) {
        const p = products || {};
        const parts = [['cv', 'CV'], ['studio', 'QA Studio'], ['lab', 'QA Lab'], ['review', 'URL Review']]
            .filter(([key]) => p[key] && p[key].kpis && p[key].kpis[0])
            .map(([key, name]) => ({ key, name, value: Number(p[key].kpis[0].value) || 0, prior: p[key].kpis[0].prior, series: p[key].series || { labels: [], values: [] } }));
        if (!parts.length) return null;
        const value = parts.reduce((sum, row) => sum + row.value, 0);
        const hasPrior = parts.every((row) => row.prior !== undefined && row.prior !== null);
        const prior = hasPrior ? parts.reduce((sum, row) => sum + (Number(row.prior) || 0), 0) : undefined;
        const labels = parts.reduce((best, row) => (row.series.labels.length > best.length ? row.series.labels : best), []);
        const values = labels.map((day) => parts.reduce((sum, row) => {
            const i = row.series.labels.indexOf(day);
            return sum + (i === -1 ? 0 : Number(row.series.values[i]) || 0);
        }, 0));
        return Object.assign(kpi('Site visits', value, prior), {
            parts: parts.map((row) => kpi(row.name, row.value, row.prior === null ? undefined : row.prior, { key: row.key })),
            series: { labels, values }
        });
    }

    const GH_BOT = /\[bot\]$|^dependabot|^github-actions|^renovate/i;
    const GH_CODE = ['code', 'test', 'config'];
    const GH_GRADES = ['A', 'B', 'C', 'D', 'F'];
    const ghGrade = (v) => (v >= 90 ? 'A' : v >= 80 ? 'B' : v >= 70 ? 'C' : v >= 60 ? 'D' : 'F');

    /* What the GitHub briefing lines and the hourly pass (functions/jarvis-actions.js) act on, from the github-work
       source (#2526). mainBroken: main's newest failed push commit whose failure is not flaky (it failed again after a
       re-run, or Gemini says code, test or config), unless the source names it itself in ci.mainBroken. */
    function githubTargets(g) {
        const x = g || {};
        const prs = ((x.prs || {}).items || []).filter((pr) => pr && pr.number && pr.state !== 'draft');
        const ci = x.ci || {};
        const board = x.board || {};
        const worktrees = (x.branches || {}).worktrees || [];
        const held = new Set(worktrees.filter((w) => w.alive).map((w) => w.branch));
        let mainBroken = Array.isArray(ci.mainBroken) ? ci.mainBroken : ci.mainBroken ? [ci.mainBroken] : null;
        if (!mainBroken) {
            const red = (ci.failing || []).filter((r) => r.branch === 'main' && r.sha && r.event === 'push' && (r.attempt > 1 || (r.diag && GH_CODE.includes(r.diag.category))))
                .sort((a, b) => String(b.at).localeCompare(String(a.at)));
            const sha = red.length ? red[0].sha : '';
            const same = red.filter((r) => r.sha === sha);
            mainBroken = sha ? [{ sha, url: same[0].url, why: same.map((r) => r.name + (r.diag ? ' (' + r.diag.cause + ')' : ' failed again after a re-run')).join('; ').slice(0, 300) }] : [];
        }
        return {
            drift: (board.drift || []).filter((d) => d && d.number && d.should),
            orphans: prs.filter((pr) => !pr.ticket && !pr.bot && !GH_BOT.test(pr.author || '')),
            behind: prs.filter((pr) => pr.state === 'behind'),
            conflicts: prs.filter((pr) => pr.state === 'dirty'),
            green: prs.filter((pr) => pr.state === 'clean' && pr.checks === 'pass'),
            stale: prs.filter((pr) => Number(pr.updatedH) >= 72),
            aging: (board.aging || []).filter((a) => a && ['Dev', 'QA', 'Stg'].includes(a.column) && a.days > 7),
            merged: ((x.branches || {}).merged || []).filter((b) => b && b.name && !['main', 'master'].includes(b.name) && !held.has(b.name)),
            worktrees: worktrees.filter((w) => w && w.path && w.prState === 'merged' && !w.alive && w.dirty === false).map((w) => Object.assign({ dir: String(w.path).split('/').pop() }, w)),
            mainBroken: mainBroken.filter((m) => m && m.sha),
            flaky: ((ci.flaky || {}).workflows || []).filter((w) => w && w.name && w.runs >= 5 && w.pct >= 10),
            diag: (ci.failing || []).filter((r) => r && r.id && r.diag && GH_CODE.includes(r.diag.category))
        };
    }

    // The instant briefing: rules over the summaries, most urgent first. Levels: alert, warn, good, info.
    // Country dates (#2989): the settings Jarvis warns and reminds by, and the share of a campaign's leads that makes a holiday pause it.
    const CALENDAR = { warnDays: 14, remindDays: 3, share: 50, horizon: 60 };
    const dayDiff = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY);
    const dayLabel = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
    const inDays = (n) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
    function calendarSettings(s) {
        const d = s || {};
        const warnDays = Math.min(CALENDAR.horizon, Math.max(1, Math.round(Number(d.warnDays)) || CALENDAR.warnDays));
        const remind = Number.isFinite(Number(d.remindDays)) && d.remindDays !== null && d.remindDays !== '' ? Math.round(Number(d.remindDays)) : CALENDAR.remindDays;
        return { autoPause: d.autoPause === true, warnDays, remindDays: Math.min(warnDays, Math.max(0, remind)) };
    }
    /** A country's sending campaigns with at least half their leads there (the geo row's camps, statuses from Marketing). */
    function heldCampaigns(row, campaigns) {
        const live = {};
        (campaigns || []).forEach((c) => { if (c && c.id) live[c.id] = c.status; });
        return ((row && row.camps) || []).filter((c) => Number(c.share) >= CALENDAR.share && /^(active|running subsequences)$/i.test(String(live[c.id] !== undefined ? live[c.id] : c.status || '')))
            .map((c) => ({ id: c.id, name: c.name, share: Number(c.share) }));
    }
    /* The calendar's briefing lines: a holiday pause for each country whose campaigns would send into closed offices, the
       pauses planned and running, and a themed campaign, routine or post ahead of a date, inside its warning window. */
    function calendarLines(ext, now) {
        const cal = ext.calendar;
        if (!cal || cal.ok === false || !Array.isArray(cal.days)) return [];
        const s = calendarSettings(cal.settings);
        const today = zoneParts(toDate(now) || new Date()).day;
        const rows = {};
        ((ext.geo && ext.geo.ok !== false && ext.geo.countries) || []).forEach((r) => { rows[r.cc] = r; });
        const mk = (ext.marketing && ext.marketing.campaigns && ext.marketing.campaigns.ok !== false && ext.marketing.campaigns.rows) || [];
        const pauses = cal.pauses || [];
        const taken = new Set(pauses.filter((p) => p.status === 'planned' || p.status === 'paused').map((p) => p.id));
        const country = (cc) => (rows[cc] && rows[cc].name) || cc;
        const lines = [];
        let pausing = 0, themed = 0;
        cal.days.forEach((d) => {
            if (dayDiff(today, d.end || d.date) < 0) return;
            const n = Math.max(0, dayDiff(today, d.date));
            if (n > Math.min(CALENDAR.horizon, Math.max(s.warnDays, Number(d.lead) || 0))) return;
            const level = n <= s.remindDays ? 'warn' : 'info';
            if (d.kind === 'holiday') {
                if (d.weekend) return;
                (d.ccs || []).forEach((cc) => {
                    const held = heldCampaigns(rows[cc], mk);
                    if (!held.length || taken.has(cc + '-' + d.date) || pausing >= 6) return;
                    pausing++;
                    const name = (d.local && d.local[cc]) || d.name;
                    const after = d.after && d.after[cc];
                    lines.push({ level, product: 'geo', key: `calendar:pause:${cc}:${d.date}`, title: `Pause ${held.length === 1 ? held[0].name : held.length + ' campaigns'} in ${country(cc)} for ${name} (${dayLabel(d.date)})`,
                        text: `${name} in ${country(cc)} on ${dayLabel(d.date)}, ${inDays(n)}: ${held.map((c) => `${c.name} (${c.share}% of its leads)`).join(', ')} would send into closed offices. Pause ${held.length === 1 ? 'it' : 'them'} that day${after ? ' and resume ' + dayLabel(after) : ''}.` });
                });
                return;
            }
            if (!d.do || themed >= 6) return;
            themed++;
            const where = d.all ? 'all target markets' : (d.ccs || []).slice(0, 3).map(country).join(', ') + ((d.ccs || []).length > 3 ? ` and ${d.ccs.length - 3} more` : '');
            const span = d.end ? `${dayLabel(d.date)} to ${dayLabel(d.end)}` : dayLabel(d.date);
            const prefix = d.do === 'post' ? 'calendar:post:' : d.do === 'routine' ? 'calendar:routine:' : 'calendar:campaign:';
            lines.push({ level, product: 'geo', key: prefix + (d.ref || d.id) + ':' + d.date, title: `${d.name} ${inDays(n)}: ${String(d.action || '').replace(/\.$/, '')}`.slice(0, 140),
                text: `${d.name} (${where}) ${d.ongoing ? 'is on until ' + dayLabel(d.end) : inDays(n) + ', ' + span}: ${d.action}` });
        });
        pauses.forEach((p) => {
            const names = (p.campaigns || []).map((c) => c.name).join(', ');
            if (p.status === 'planned') lines.push({ level: 'info', product: 'geo', key: `calendar:planned:${p.cc}:${p.date}`, text: `Planned: ${names} ${(p.campaigns || []).length === 1 ? 'pauses' : 'pause'} on ${dayLabel(p.date)} for ${p.name} in ${country(p.cc)} and ${(p.campaigns || []).length === 1 ? 'resumes' : 'resume'} ${dayLabel(p.resumeOn)}.` });
            if (p.status === 'paused') {
                const late = dayDiff(today, p.resumeOn) < 0;
                lines.push({ level: late ? 'warn' : 'info', product: 'geo', key: `calendar:resume:${p.cc}:${p.date}`, title: `Resume ${names} after ${p.name} in ${country(p.cc)}`,
                    text: late ? `${names} still paused after ${p.name} in ${country(p.cc)}; ${dayLabel(p.resumeOn)} was the day to resume.` : `${names} paused for ${p.name} in ${country(p.cc)}; resumes on its own ${dayLabel(p.resumeOn)}.` });
            }
        });
        return lines;
    }

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
            (gh.prsStale || []).forEach((w) => add('warn', 'systems', `${plural(w.prs.length, 'open PR', 'open PRs')} failed "${w.workflow}" before main went green again; a re-run would test the old main.`, 'ci-prs:' + w.workflow));
            const waiting = gh.needsAgent || [];
            if (waiting.length) add('alert', 'systems', `${plural(waiting.length, 'URL review bug waits', 'URL review bugs wait')} for the daily fix agent, held back to stay inside the Cursor plan: ${waiting.slice(0, 5).map((bug) => '#' + bug.number).join(', ')}.`, 'github:needs-agent');
            if (gh.openBugs) add('info', 'systems', `${plural(gh.openBugs, 'open bug', 'open bugs')}; most in ${((gh.bugAreas || [])[0] || {}).label || 'none'}. ${plural((gh.merged || {}).total || 0, 'PR', 'PRs')} merged this week.`, 'github:bugs');
        }
        // #2526: the GitHub tab's lines; per-item kinds stop at 8 lines each.
        const gw = ext['github-work'];
        if (gw && gw.ok !== false) {
            const t = githubTargets(gw);
            const few = (list) => list.slice(0, 8);
            const title = (pr) => String(pr.title || '').slice(0, 90);
            t.mainBroken.forEach((m) => add('alert', 'github', `Main went red after ${String(m.sha).slice(0, 7)}${m.title ? ' (' + String(m.title).slice(0, 80) + ')' : ''}: ${m.why || 'CI failed'}.`, 'gh:main-broken:' + m.sha));
            few(t.flaky).forEach((w) => add('warn', 'github', `CI "${w.name}" is flaky: ${w.pct}% of its ${w.runs} runs passed only on a re-run.`, 'gh:flaky:' + w.name));
            few(t.diag).forEach((r) => add('warn', 'github', `"${r.name}" failed on ${r.branch}: ${String(r.diag.cause).replace(/\.$/, '')}. A fix agent prompt is ready.`, 'gh:diag:' + r.id));
            few(t.conflicts).forEach((pr) => add('warn', 'github', `PR #${pr.number} has merge conflicts: ${title(pr)}.`, 'gh:pr-conflict:' + pr.number));
            few(t.stale).forEach((pr) => add('warn', 'github', `PR #${pr.number} has had no update in ${Math.floor(pr.updatedH / 24)} days: ${title(pr)}.`, 'gh:pr-stale:' + pr.number));
            few(t.orphans).forEach((pr) => add('warn', 'github', `PR #${pr.number} names no ticket: ${title(pr)}.`, 'gh:orphan-pr:' + pr.number));
            few(t.drift).forEach((d) => add('warn', 'github', `#${d.number} is in ${d.column || 'no column'} but should be in ${d.should}${d.why ? ': ' + d.why : ''}.`, 'gh:drift:' + d.number));
            few(t.aging).forEach((a) => add('warn', 'github', `#${a.number} has sat in ${a.column} for ${plural(a.days, 'day', 'days')}: ${title(a)}.`, 'gh:aging:' + a.number));
            const b = gw.board || {};
            const limit = b.wipLimit || 15;
            if (b.wip > limit) add('warn', 'github', `${b.wip} tickets are in progress, over the WIP limit of ${limit}.`, 'gh:wip');
            few(t.green).forEach((pr) => add('info', 'github', `PR #${pr.number} is green and mergeable: ${title(pr)}.`, 'gh:pr-green:' + pr.number));
            few(t.behind).forEach((pr) => add('info', 'github', `PR #${pr.number} is behind main: ${title(pr)}.`, 'gh:pr-behind:' + pr.number));
            if (t.merged.length) add('info', 'github', `${t.merged.length} merged ${t.merged.length === 1 ? 'branch is' : 'branches are'} still on GitHub, such as ${t.merged[0].name}.`, 'gh:branch-merged');
            few(t.worktrees).forEach((w) => add('info', 'github', `Worktree ${w.dir} (${w.branch}) is merged and clean, and no chat holds it.`, 'gh:worktree-merged:' + w.dir));
            const sec = gw.security || {};
            const dep = sec.dependabot || {};
            const severe = (Number(dep.critical) || 0) + (Number(dep.high) || 0);
            if (dep.ok !== false && severe) add('alert', 'github', `${plural(severe, 'critical or high Dependabot alert is', 'critical or high Dependabot alerts are')} open.`, 'gh:security:dependabot');
            const scan = sec.codeScanning || {};
            const scanSevere = (scan.items || []).filter((i) => /critical|high/i.test(String(i.severity || i.security_severity_level || ''))).length;
            if (scan.ok !== false && scanSevere) add('alert', 'github', `${plural(scanSevere, 'critical or high code scanning alert is', 'critical or high code scanning alerts are')} open.`, 'gh:security:code-scanning');
            const secrets = sec.secrets || {};
            if (secrets.ok !== false && secrets.open > 0) add('alert', 'github', `${plural(secrets.open, 'leaked secret is', 'leaked secrets are')} open in secret scanning.`, 'gh:security:secrets');
            const gq = ((gw.budget || {}).kaanmuar || {}).graphql;
            if (gq && gq.limit > 0) {
                const leftPct = Math.round(((gq.limit - gq.used) / gq.limit) * 100);
                if (leftPct < 20) add(leftPct < 5 ? 'alert' : 'warn', 'github', `Only ${leftPct}% of kaanmuar's GitHub GraphQL budget is left this hour (${gq.used} of ${gq.limit} used).`, 'gh:budget');
            }
            (gw.needs || []).slice(0, 6).forEach((n) => add('warn', 'github', String(n).slice(0, 220), 'gh:needs:' + String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)));
            if (!gw.local || gw.local.ageMin > 30) add('warn', 'github', gw.local ? `The Mac uploader has not reported for ${gw.local.ageMin} minutes; worktrees and usage are stale.` : 'The Mac uploader has never reported; install it with scripts/github-local-report.js so Jarvis sees worktrees and usage.', 'gh:needs:uploader');
            (gw.repos || []).filter((r) => r && r.ci && ['failure', 'timed_out', 'startup_failure'].includes(r.ci.conclusion) && !/kaanmuar\.github\.io$/.test(r.name)).slice(0, 6)
                .forEach((r) => add('warn', 'github', `CI in ${r.name} is ${r.ci.conclusion} on ${r.defaultBranch || 'its default branch'}.`, 'gh:repo-red:' + r.name));
            const now = ((gw.score || {}).overall || {});
            const before = (gw.history || []).filter((h) => typeof h.score === 'number').slice(-2)[0];
            if (now.grade && before && GH_GRADES.indexOf(now.grade) > GH_GRADES.indexOf(ghGrade(before.score))) add('info', 'github', `The GitHub score fell to ${now.grade} (${now.value}) from ${ghGrade(before.score)} (${before.score}) on ${before.day}.`, 'gh:score');
        }
        const speed = ext.speed;
        if (speed && speed.ok) (speed.pages || []).forEach((page) => {
            if (page.ok && page.score < th.speedWarn) add('warn', page.product, `${page.name} scores ${page.score} on mobile PageSpeed.`, 'speed:' + page.product);
            else if (page.ok && page.score >= th.speedGood) add('good', page.product, `${page.name} scores ${page.score} on mobile PageSpeed.`, 'speed:' + page.product);
        });
        const ps = ext.pagespeed;
        if (ps && ps.ok && !ps.empty) {
            if (ps.stale) add('alert', 'systems', `The daily PageSpeed run has not finished in over a day${ps.lastError ? ': ' + ps.lastError : ''}.`, 'pagespeed:run');
            else if (ps.lastStatus === 'failed') add('warn', 'systems', `The last daily PageSpeed run failed: ${ps.lastError || 'no detail'}.`, 'pagespeed:run');
            (ps.prs || []).filter((pr) => pr.open).forEach((pr) => {
                if (pr.stage === 'proposal') add('warn', 'systems', `PageSpeed fixes #${pr.number} wait for you: ${pr.reason || pr.title}`, 'pagespeed:pr:' + pr.number);
                else if (pr.stage === 'countdown') add('info', 'systems', `PageSpeed fixes #${pr.number} merge themselves at ${pr.dueAt ? new Date(pr.dueAt).toLocaleTimeString('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' }) + ' Bogotá' : 'the end of the countdown'} unless you cancel.`, 'pagespeed:countdown:' + pr.number);
            });
            const c = ps.counts || {};
            if (c.under50) add('warn', 'systems', `${plural(c.under50, 'page scores', 'pages score')} under 50 on PageSpeed, of ${c.scored} measured.`, 'pagespeed:slow');
            else if (c.below) add('info', 'systems', `${plural(c.below, 'page scores', 'pages score')} under ${ps.threshold || 90} on PageSpeed, of ${c.scored} measured.`, 'pagespeed:below');
            else if (c.scored) add('good', 'systems', `All ${c.scored} measured pages score ${ps.threshold || 90} or more on PageSpeed.`, 'pagespeed:good');
        }
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
            const site = siteVisits(p);
            const siteHeld = site && site.pct !== null && site.pct > -th.sessionsSwingPct;
            if (d.pct !== null && Math.abs(d.pct) >= th.sessionsSwingPct && Math.max(sessions, prior) >= 20) {
                if (d.pct < 0 && siteHeld) add('info', 'traffic', `GA4 sessions fell ${Math.abs(d.pct)}% (${sessions} vs ${prior}) while the site's own visit count moved ${site.delta} (${site.value} vs ${site.prior}). GA4 only counts visitors who allow analytics.`, 'ga4:swing');
                else add(d.pct > 0 ? 'good' : 'warn', 'traffic', `GA4 sessions ${d.pct > 0 ? 'rose' : 'fell'} ${Math.abs(d.pct)}% (${sessions} vs ${prior}).`, 'ga4:swing');
            }
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
            if (missing.length) add('info', 'business', `Not in Brave's top ${search.brave.depth || 20} for ${missing.length} of ${asked.length} searches, such as "${missing[0].query}".`, 'search:brave');
        }
        const index = search && search.ok && search.index;
        if (index && index.ok && index.total && index.missing) {
            const pushed = index.pushedAt ? ` Jarvis last sent the missing ones on ${index.pushedAt.slice(0, 10)}.` : ' Jarvis sends the missing ones to Brave and IndexNow weekly.';
            if (!index.indexed) add('warn', 'business', `Brave has none of our ${index.total} sitemap pages indexed${index.zeroSince ? ` (none since ${index.zeroSince.slice(0, 10)})` : ''}.${pushed}`, 'search:index');
            else add('info', 'business', `Brave has ${index.indexed} of our ${index.total} sitemap pages indexed.${pushed}`, 'search:index');
        }
        if (search && search.console && search.console.ok && search.console.impressions) add('info', 'business', `Google search: ${plural(search.console.clicks, 'click', 'clicks')} from ${search.console.impressions} impressions, average position ${search.console.position}.`, 'search:console');
        const social = ext.social;
        if (social && social.ok) {
            if (social.failed > 0) add('warn', 'business', `${plural(social.failed, 'social post', 'social posts')} failed to publish in range.`, 'social:failed');
            else if (!social.sent) add('info', 'business', 'No social posts went out in range.', 'social:none');
        }
        const safety = ext.safety;
        if (safety && safety.ok) (safety.checks || []).filter((c) => c.level === 'alert' || c.level === 'warn').forEach((c) => add(c.level, 'systems', `${c.name}: ${c.detail}`, 'safety:' + c.key));
        const box = ext.mailbox;
        if (box && box.ok) {
            const byAlias = {};
            (box.problems || []).forEach((m) => { (byAlias[m.alias] = byAlias[m.alias] || []).push(m); });
            Object.keys(byAlias).forEach((alias) => {
                const rows = byAlias[alias];
                const refused = rows.filter((m) => m.outcome === 'refused').length;
                const what = refused === rows.length ? 'refused' : refused ? 'bounced or refused' : 'bounced';
                add('alert', 'systems', `${plural(rows.length, 'mail to ' + alias + '@ was', 'mails to ' + alias + '@ were')} ${what} by ImprovMX in range: ${rows[0].reason || rows[0].code || 'no detail'}.`, 'mailbox:' + alias + ':' + rows[0].id);
            });
            const c = box.canary || {};
            if (c.state === 'lost') add('alert', 'systems', 'The daily mail round trip to canary@ did not come back through ImprovMX and the webhook within 30 minutes.', 'mailbox:canary:' + c.sentAt);
            else if (c.state === 'stale') add('warn', 'systems', 'The daily mail round trip (mailCanary) has not run in over a day.', 'mailbox:canary-stale');
            const smtp = box.smtp || {};
            if (smtp.monthLimit && smtp.month >= smtp.monthLimit * 0.8) add(smtp.month >= smtp.monthLimit ? 'alert' : 'warn', 'systems', `ImprovMX SMTP: ${smtp.month} of ${smtp.monthLimit} sends used this month.`, 'mailbox:smtp');
        }
        const pf = ext.platform;
        if (pf && pf.ok) {
            const f = pf.functions || {};
            if (f.failures >= th.fnFailures) add(f.failures >= th.fnFailures * 5 ? 'alert' : 'warn', 'systems', `${plural(f.failures, 'function run', 'function runs')} really failed in 24 hours (${f.failureRate}%), most in ${((f.byFunction || [])[0] || {}).label || 'unknown'}.`, 'platform:failures');
            const g = pf.gemini || {};
            if (g.requests >= 10 && g.errorRate >= th.geminiErrorPct) add('warn', 'systems', `${g.errorRate}% of Gemini calls failed this week (${g.requests - g.ok} of ${g.requests}), most in ${((g.failedMethods || [])[0] || {}).label || 'unknown'}.`, 'platform:gemini');
            const fs = pf.firestore || {};
            if (fs.readsFreePct >= th.firestoreFreePct) add('warn', 'systems', `Firestore used ${fs.readsFreePct}% of today's free reads (${fs.reads} since midnight Pacific).`, 'platform:reads');
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
                (mail.accounts || []).filter((a) => a.status !== 'active' || a.warmup !== 'on').forEach((a) => add('warn', 'outreach', `Mailbox ${a.email} is ${a.status}, warm-up ${a.warmup}${a.error ? ': ' + a.error.slice(0, 140) + ' Reconnect it in Instantly' : ''}.`, 'outreach:mailbox:' + a.email));
                const active = (mail.status || []).some((s) => s.label === 'active' && s.value > 0);
                const cold = (mail.accounts || []).filter((a) => a.score !== null && a.score < th.outreachWarmup);
                if (active && cold.length) add('warn', 'outreach', `Campaigns are sending while ${plural(cold.length, 'mailbox has', 'mailboxes have')} a warm-up score under ${th.outreachWarmup}.`, 'outreach:warmup');
            }
            if (ou.mail && ou.mail.checks) ou.mail.checks.filter((c) => !c.ok).forEach((c) => add('warn', 'outreach', `${ou.mail.domain} ${c.name}: ${c.detail}`, 'outreach:dns:' + c.name));
            const links = ou.links && ou.links.ok ? ou.links : null;
            if (links) {
                const sending = mail && (mail.status || []).some((s) => s.label === 'active' && s.value > 0);
                if (!links.live) add(sending ? 'alert' : 'warn', 'outreach', `qalabreview.com short links are not live (robots.txt answered ${links.workerStatus || 'nothing'}); emails${sending ? '' : ' about to go out'} link to them. Deploy the Worker in qalabreview/.`, 'outreach:links-down');
                if (links.paid > 0) add('info', 'outreach', `${plural(links.paid, 'paid unlock', 'paid unlocks')} (${links.usd} USD) came from qalabreview.com links.`, 'outreach:links-paid');
                else if (links.visits > 0) add('info', 'outreach', `${plural(links.visits, 'visit', 'visits')} and ${plural(links.reviews, 'free review', 'free reviews')} came from qalabreview.com links.`, 'outreach:links-visits');
            }
        }
        // 90-day targets (#2649): behind pace becomes a proposal; missed and quiet hand-logged ones stay lines.
        const tg = ext.targets;
        if (tg && tg.ok) {
            (tg.targets || []).forEach((t) => {
                if (t.status === 'behind') add('warn', 'outreach', `90-day target behind: ${t.label}, ${t.actual} of ${t.target} (about ${t.expected} by now); ${t.perWeek} a week from here.`, 'targets:behind:' + t.key);
                else if (t.status === 'missed' && tg.day - tg.length <= 14) add('info', 'outreach', `90-day target missed: ${t.label}, ${t.actual} of ${t.target}.`, 'targets:missed:' + t.key);
                else if (t.status === 'on-pace' && t.stale) add('info', 'outreach', `90-day target ${t.label}: nothing logged in 14 days; log it when one happens.`, 'targets:stale:' + t.key);
            });
        }
        // Email addresses (#2338): a line only for what the outreach and mailbox sources do not already say.
        const ad = ext.addresses;
        if (ad && ad.ok) {
            const outBoxes = new Set(((ou && ou.ok && ou.instantly && ou.instantly.accounts) || []).map((a) => String(a.email).toLowerCase()));
            const outDns = new Set(((ou && ou.ok && ou.mail && ou.mail.checks) || []).filter((c) => !c.ok).map((c) => ou.mail.domain + ':' + c.name));
            const siteDns = new Set(((ext.safety && ext.safety.ok && ext.safety.checks) || []).filter((c) => c.level === 'alert' || c.level === 'warn').map((c) => c.name));
            const bouncing = new Set(((box && box.ok && box.problems) || []).map((m) => m.alias));
            (ad.issues || []).forEach((i) => {
                if (i.system === 'Instantly' && outBoxes.has(i.address)) return;
                if (i.system === 'DNS' && (outDns.has(i.address + ':' + i.check) || ((ad.domains || []).some((d) => d.site && d.domain === i.address) && siteDns.has(i.check)))) return;
                if (i.problem === 'bounce' && bouncing.has(i.address.split('@')[0])) return;
                add(i.level, 'systems', i.text, 'addresses:' + i.key);
            });
        }
        const waiting = CONNECTIONS.reduce((n, c) => n + (((ext[c.key] || {}).needs) || []).length, 0);
        if (waiting) add('info', 'systems', `${plural(waiting, 'connection waits', 'connections wait')} for a one-time grant; see Systems > Connections.`, 'connections:needs');
        calendarLines(ext, state.now).forEach((line) => out.push(line));
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
        { prefix: 'outreach:bounce', impact: 5, title: 'Pause outreach and clean the prospect list', click: 'pause-outreach', tab: 'outreach' },
        { prefix: 'outreach:links-down', impact: 5, title: 'Deploy the qalabreview.com short-link Worker', tab: 'outreach' },
        { prefix: 'email:spam', impact: 4, title: 'Find which emails were reported as spam and fix the list or the copy', link: 'https://app.sendgrid.com/' },
        { prefix: 'safety:', impact: 4, group: true, title: (n) => `Fix ${n === 1 ? 'the failing safety check' : n + ' failing safety checks'}`, tab: 'systems' },
        { prefix: 'job:', impact: 4, group: true, title: (n) => `Fix ${n === 1 ? 'the failing job' : n + ' failing jobs'}`, tab: 'systems' },
        { prefix: 'scheduler:', impact: 4, group: true, title: (n) => `Fix ${n === 1 ? 'the scheduler job that failed' : n + ' scheduler jobs that failed'}`, tab: 'systems' },
        { prefix: 'ci:', impact: 4, group: true, title: 'Get CI on main green again', link: 'https://github.com/kaanmuar/kaanmuar.github.io/actions' },
        { prefix: 'review:failures', impact: 4, title: 'Fix the top cause of failed URL review runs', tab: 'systems' },
        { prefix: 'inbox:unanswered', impact: 4, title: 'Answer the messages that are waiting', tab: 'inbox' },
        { prefix: 'review:conversion', impact: 4, title: 'Make the URL Review page turn more opens into reviews', tab: 'review' },
        { prefix: 'money:none', impact: 4, title: 'Find out why sales stopped', tab: 'business' },
        { prefix: 'outreach:warmup', impact: 4, title: 'Hold the campaigns until the mailboxes are warm', click: 'pause-outreach', tab: 'outreach' },
        { prefix: 'outreach:dns:', impact: 4, group: true, title: 'Fix the sending domain records', click: 'pause-outreach', tab: 'outreach' },
        { prefix: 'addresses:instantly:reconnect:', impact: 4, group: true, title: 'Reconnect the mailboxes in Instantly', link: 'https://app.instantly.ai/app/accounts' },
        { prefix: 'addresses:dns:', impact: 4, group: true, title: 'Fix the mail records on our domains', tab: 'systems' },
        { prefix: 'addresses:m365:', impact: 3, group: true, title: 'Fix the Microsoft 365 mailboxes', link: 'https://admin.microsoft.com/#/users' },
        { prefix: 'addresses:improvmx:', impact: 3, group: true, title: 'Fix the ImprovMX aliases', tab: 'systems' },
        { prefix: 'addresses:sendgrid:', impact: 3, title: 'Add an ImprovMX alias for the SendGrid sender', link: 'https://app.improvmx.com/' },
        { prefix: 'review:held', impact: 3, title: 'Re-run the held reviews', action: 'rerun-held', tab: 'systems' },
        { prefix: 'ci-prs:', impact: 3, group: true, title: 'Close and reopen the PRs that failed on the old main', link: 'https://github.com/kaanmuar/kaanmuar.github.io/pulls' },
        { prefix: 'notices:failed', impact: 3, title: 'Re-send the owner notices that failed', action: 'resend-notices', tab: 'review' },
        { prefix: 'hub:stale', impact: 3, title: 'Publish the Social hub', action: 'publish-hub', tab: 'hub' },
        { prefix: 'money:refunds', impact: 3, title: 'Read why customers asked for refunds', tab: 'business' },
        { prefix: 'email:bad', impact: 3, title: 'Clean the addresses that bounce or block', link: 'https://app.sendgrid.com/' },
        { prefix: 'speed:', impact: 3, levels: ['warn'], title: (i) => `Speed up ${(PRODUCTS.find((p) => p.key === i.product) || {}).name || i.product} on mobile`, tab: 'systems' },
        { prefix: 'pagespeed:run', impact: 3, title: 'Get the daily PageSpeed run working again', tab: 'systems' },
        { prefix: 'pagespeed:pr:', impact: 3, title: (i) => 'Merge or close PageSpeed fixes #' + i.key.split(':')[2], tab: 'systems' },
        { prefix: 'pagespeed:slow', impact: 3, title: 'Speed up the pages that score under 50 on PageSpeed', tab: 'systems' },
        { prefix: 'slow:', impact: 3, group: true, title: 'Find why the pages answer slowly', tab: 'systems' },
        { prefix: 'platform:failures', impact: 3, title: 'Fix the function that fails most', tab: 'systems' },
        { prefix: 'platform:gemini', impact: 3, title: 'Fix the failing Gemini calls', tab: 'systems' },
        { prefix: 'platform:reads', impact: 3, title: 'Cut Firestore reads before the free quota runs out', tab: 'systems' },
        { prefix: 'social:failed', impact: 3, title: 'Re-post the social posts that failed', click: 'retry-social', tab: 'hub' },
        { prefix: 'outreach:queue', impact: 3, title: 'Add the next outreach prospect list', tab: 'outreach' },
        { prefix: 'outreach:mailbox:', impact: 3, group: true, title: 'Turn the outreach mailboxes and warm-up back on', click: 'resume-outreach', tab: 'outreach' },
        { prefix: 'outreach:deadline:', impact: 3, levels: ['warn'], group: true, title: 'Get ready for the outreach deadline', tab: 'outreach' },
        { prefix: 'goal:', impact: 3, levels: ['warn'], title: (i) => 'Catch up on the goal: ' + i.text.replace(/^Goal behind: /, '').split(' is at ')[0], tab: 'overview' },
        { prefix: 'inbox:pending', impact: 2, title: 'Approve or reject the waiting ratings', tab: 'inbox' },
        { prefix: 'hub:ga', impact: 2, title: 'Reconnect GA4 for the Social hub stats', tab: 'hub' },
        { prefix: 'connections:down:', impact: 2, group: true, title: (n) => `Reconnect ${n === 1 ? 'the source that did not answer' : n + ' sources that did not answer'}`, tab: 'systems' },
        { prefix: 'connections:needs', impact: 2, title: 'Grant the connections that wait for a one-time step', tab: 'systems' },
        { prefix: 'search:index', impact: 3, title: 'Get the missing pages into Brave\'s index: link to them from pages Brave already has', tab: 'business' },
        { prefix: 'search:brave', impact: 2, title: 'Write for the searches where we are not in the top 100', tab: 'business' },
        { prefix: 'social:none', impact: 2, title: 'Schedule social posts', tab: 'hub' },
        { prefix: 'outreach:pace', impact: 2, title: 'Review more outreach prospects this week', tab: 'outreach' },
        { prefix: 'targets:behind:', impact: 3, group: true, title: (n) => (n === 1 ? 'Catch up on a 90-day target' : `Catch up on ${n} 90-day targets`), tab: 'outreach' },
        { prefix: 'ga4:swing', impact: 2, levels: ['warn'], title: 'Find why GA4 sessions fell', tab: 'traffic' },
        { prefix: 'cv:swing', impact: 2, levels: ['warn'], title: 'Find why CV visits fell', tab: 'cv' },
        { prefix: 'studio:swing', impact: 2, levels: ['warn'], title: 'Find why QA Studio visits fell', tab: 'studio' },
        { prefix: 'lab:swing', impact: 2, levels: ['warn'], title: 'Find why QA Lab visits fell', tab: 'lab' },
        { prefix: 'review:swing', impact: 2, levels: ['warn'], title: 'Find why URL Review opens fell', tab: 'review' },
        // #2526: the GitHub tab. A click runs a gh-* action through action-run or github-act; the key's tail is its target.
        { prefix: 'gh:main-broken:', impact: 5, title: (i) => `Get main green: revert ${i.key.split(':')[2].slice(0, 7)} or fix forward`, click: 'gh-revert', tab: 'github' },
        { prefix: 'gh:security:', impact: 5, group: true, title: 'Fix the open GitHub security alerts', tab: 'github', link: 'https://github.com/kaanmuar/kaanmuar.github.io/security' },
        { prefix: 'gh:budget', impact: 4, title: 'Slow GitHub GraphQL use before the hourly budget runs out', tab: 'github' },
        { prefix: 'gh:diag:', impact: 4, title: (i) => 'Launch a fix agent for ' + ((/^"([^"]+)"/.exec(i.text) || [])[1] || 'the failed run'), click: 'gh-agent', tab: 'github' },
        { prefix: 'gh:needs:', impact: 3, title: (i) => i.text.slice(0, 110), tab: 'github' },
        { prefix: 'gh:pr-conflict:', impact: 3, title: (i) => 'Resolve the merge conflicts in PR #' + i.key.split(':')[2], click: 'gh-agent', tab: 'github' },
        { prefix: 'gh:flaky:', impact: 3, title: (i) => 'Steady the flaky workflow ' + i.key.slice(9), tab: 'github' },
        { prefix: 'gh:pr-green:', impact: 3, levels: ['info'], title: (i) => 'Merge the green PR #' + i.key.split(':')[2], click: 'gh-merge-pr', tab: 'github' },
        { prefix: 'gh:drift:', impact: 3, group: true, title: (n) => `Sync ${n === 1 ? 'the board item in the wrong column' : n + ' board items in the wrong column'}`, click: 'gh-board-sync', tab: 'github' },
        { prefix: 'gh:orphan-pr:', impact: 2, group: true, title: (n) => `File tickets for ${n === 1 ? 'the PR' : n + ' PRs'} that name none`, click: 'gh-orphan-ticket', tab: 'github' },
        { prefix: 'gh:pr-behind:', impact: 2, levels: ['info'], group: true, title: (n) => `Update ${n === 1 ? 'the PR' : n + ' PRs'} behind main`, click: 'gh-update-pr', tab: 'github' },
        { prefix: 'gh:pr-stale:', impact: 2, group: true, title: (n) => `Finish or close ${n === 1 ? 'the stale PR' : n + ' stale PRs'}`, tab: 'github' },
        { prefix: 'gh:aging:', impact: 2, group: true, title: (n) => `Move ${n === 1 ? 'the ticket' : n + ' tickets'} sitting in Dev, QA or Stg`, tab: 'github' },
        { prefix: 'gh:wip', impact: 2, title: 'Finish work in progress before starting more', tab: 'github' },
        { prefix: 'gh:repo-red:', impact: 2, group: true, title: 'Get CI green in the other repositories', tab: 'github' },
        { prefix: 'gh:score', impact: 2, levels: ['info'], title: 'Find why the GitHub score dropped', tab: 'github' },
        { prefix: 'gh:branch-merged', impact: 1, levels: ['info'], title: 'Delete the merged branches', click: 'gh-delete-branch', tab: 'github' },
        { prefix: 'gh:worktree-merged:', impact: 1, levels: ['info'], group: true, title: 'Remove the merged worktrees', click: 'gh-remove-worktree', tab: 'github' },
        // #2989: country dates. A pause today runs at once, a later one waits for the daily job; resume runs at once.
        { prefix: 'calendar:pause:', impact: 3, levels: ['info', 'warn'], title: (i) => i.title || i.text.slice(0, 110), click: 'calendar-pause', tab: 'geo' },
        { prefix: 'calendar:resume:', impact: 3, levels: ['info', 'warn'], title: (i) => i.title || i.text.slice(0, 110), click: 'calendar-resume', tab: 'geo' },
        { prefix: 'calendar:campaign:', impact: 2, levels: ['info', 'warn'], title: (i) => i.title || i.text.slice(0, 110), tab: 'marketing' },
        { prefix: 'calendar:routine:', impact: 2, levels: ['info', 'warn'], title: (i) => i.title || i.text.slice(0, 110), tab: 'marketing' },
        { prefix: 'calendar:post:', impact: 1, levels: ['info', 'warn'], title: (i) => i.title || i.text.slice(0, 110), tab: 'hub' }
    ];
    const SAFE_ACTIONS = ['rerun-held', 'resend-notices', 'publish-hub'];
    // Actions a proposal offers as a button that only run on a click (#1977); gh-* (#2526) through action-run.
    const CLICK_ACTIONS = ['retry-social', 'resume-outreach', 'pause-outreach', 'gh-board-sync', 'gh-orphan-ticket', 'gh-update-pr', 'gh-merge-pr', 'gh-revert', 'gh-delete-branch', 'gh-close-issue', 'gh-remove-worktree', 'gh-agent', 'calendar-pause', 'calendar-resume'];

    function proposalRules(state, briefed) {
        const items = (briefed || briefing(state)).slice();
        const notices = ((state.external || {}).health || {}).notices;
        if (notices && notices.failed > 0) items.push({ level: 'warn', product: 'review', text: `${notices.failed} owner ${notices.failed === 1 ? 'notice' : 'notices'} failed to send and wait on the desk.`, key: 'notices:failed' });
        const out = new Map();
        items.forEach((item) => {
            const rule = PROPOSAL_RULES.find((r) => item.key === r.prefix || item.key.startsWith(r.prefix));
            if (!rule || (rule.levels ? !rule.levels.includes(item.level) : !['alert', 'warn'].includes(item.level) && !['search:brave', 'connections:needs', 'social:none', 'outreach:pace'].includes(rule.prefix))) return;
            const key = rule.group ? rule.prefix.replace(/:$/, '') : item.key;
            const row = out.get(key) || { key, product: item.product, impact: rule.impact, level: item.level, evidence: [], source: 'rules', action: rule.action || null, click: rule.click || null, tab: rule.tab || null, link: rule.link || null, rule };
            row.evidence.push(item.text);
            if (/^(job|scheduler):/.test(item.key)) (row.jobs = row.jobs || []).push(item.key.slice(item.key.indexOf(':') + 1));
            if (/^ci(-prs)?:/.test(item.key)) (row.workflows = row.workflows || []).push(item.key.slice(item.key.indexOf(':') + 1));
            if (item.key.startsWith('gh:flaky:')) (row.workflows = row.workflows || []).push(item.key.slice(9));
            if (item.level === 'alert') row.level = 'alert';
            row.item = row.item || item;
            out.set(key, row);
        });
        const rank = { alert: 0, warn: 1, good: 2, info: 3 };
        return Array.from(out.values()).map((row) => {
            const t = row.rule.title;
            const title = typeof t === 'function' ? t(row.rule.group ? row.evidence.length : row.item) : t;
            const impact = Math.min(5, row.impact + (row.level === 'alert' && row.impact < 5 ? 1 : 0));
            return { key: row.key, product: row.product, impact, level: row.level, title, evidence: row.evidence.slice(0, 4), source: 'rules', action: row.action, click: row.click,
                jobs: row.jobs ? Array.from(new Set(row.jobs)).slice(0, 6) : null, workflows: row.workflows ? Array.from(new Set(row.workflows)).slice(0, 6) : null, tab: row.tab, link: row.link };
        }).sort((a, b) => b.impact - a.impact || rank[a.level] - rank[b.level]);
    }

    const RUN_LABELS = {
        'rerun-held': 'Send held re-runs', 'resend-notices': 'Re-send failed notices', 'publish-hub': 'Publish the hub',
        'retry-social': 'Retry failed posts', 'resume-outreach': 'Resume mailboxes', 'pause-outreach': 'Pause outreach',
        'gh-board-sync': 'Sync the board', 'gh-orphan-ticket': 'File the tickets', 'gh-update-pr': 'Update with main', 'gh-merge-pr': 'Merge', 'gh-revert': 'Open a revert PR',
        'gh-delete-branch': 'Delete the branches', 'gh-close-issue': 'Close the issue', 'gh-remove-worktree': 'Remove the worktrees', 'gh-agent': 'Launch a fix agent',
        'calendar-pause': 'Pause over the holiday', 'calendar-resume': 'Resume now'
    };

    const pageSpeedPr = (key) => Number((/^pagespeed:pr:(\d+)$/.exec(key || '') || [])[1]) || 0;
    // A gh:* key's target: gh:pr-green:12 -> "12", gh:main-broken:<sha> -> the sha; a grouped key has none.
    const ghTarget = (key) => String(key || '').split(':').slice(2).join(':');

    /* What a proposal's run button does (#1977), or null: { action, label, jobs?, workflows?, pr? } for the jarvis
       action-run op. A PageSpeed PR merges; otherwise its own action, then its click, then its failed jobs or workflows. */
    function proposalRun(p) {
        if (!p) return null;
        const pr = pageSpeedPr(p.key);
        if (pr) return { action: 'pagespeed-merge', pr, label: `Merge #${pr}` };
        const many = (list, one, n) => (list.length === 1 ? one(list[0]) : n(list.length));
        if (/^gh-/.test(p.click || '') && CLICK_ACTIONS.includes(p.click)) {
            const target = ghTarget(p.key);
            return Object.assign({ action: p.click, key: p.key, label: RUN_LABELS[p.click] + (p.click === 'gh-merge-pr' && target ? ' #' + target : '') }, target ? { target } : {});
        }
        if (SAFE_ACTIONS.includes(p.action) || CLICK_ACTIONS.includes(p.click)) {
            const action = SAFE_ACTIONS.includes(p.action) ? p.action : p.click;
            return { action, label: RUN_LABELS[action] };
        }
        if (p.jobs && p.jobs.length) return { action: 'run-job', jobs: p.jobs.slice(0, 6), label: many(p.jobs, (j) => `Run ${j} again`, (n) => `Run ${n} jobs again`) };
        if (p.workflows && p.workflows.length && p.key === 'ci-prs') return { action: 'rerun-ci', workflows: p.workflows.slice(0, 6), label: 'Close and reopen the PRs' };
        if (p.workflows && p.workflows.length) return { action: 'rerun-ci', workflows: p.workflows.slice(0, 6), label: many(p.workflows, (w) => `Re-run ${w}`, (n) => `Re-run ${n} workflows`) };
        return null;
    }

    /* A proposal's buttons on its card and its push (#1977), at most 3: its run, then Open, then Dismiss; Done only
       when there is nothing to run. A PageSpeed PR gets Close in Open's place. act is run, close, open, done or
       dismissed; open carries tab or link. */
    function proposalButtons(p) {
        const run = proposalRun(p);
        if (run && run.action === 'pagespeed-merge') return [Object.assign({ act: 'run' }, run), { act: 'close', action: 'pagespeed-close', pr: run.pr, label: `Close #${run.pr}` }, { act: 'dismissed', label: 'Dismiss' }];
        const tab = p && p.tab && p.tab !== 'overview' ? p.tab : null;
        const open = p && p.link ? { act: 'open', label: 'Open ↗', link: p.link }
            : tab ? { act: 'open', label: 'Open ' + ((PRODUCTS.find((x) => x.key === tab) || {}).name || tab), tab } : null;
        return [run && Object.assign({ act: 'run' }, run), open, run ? null : { act: 'done', label: 'Done' }, { act: 'dismissed', label: 'Dismiss' }].filter(Boolean).slice(0, 3);
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
        } else if (k.startsWith('ci-prs:')) {
            const prs = (((ext.github || {}).prsStale || []).find((w) => w.workflow === tail) || {}).prs || [];
            fact('Workflow', tail); fact('PRs that failed on the old main', prs.length);
            fact('What the button does', 'Closes and reopens each PR, 3 seconds apart, so GitHub builds a fresh merge with today\'s main. At most 20 a click; PRs that conflict with main are skipped and listed.');
            prs.slice(0, 8).forEach((pr) => link('#' + pr.number + ' ' + pr.title, pr.url));
            act('rerun-ci', 'Close and reopen them', { workflow: tail });
        } else if (k === 'github:needs-agent') {
            const waiting = (ext.github || {}).needsAgent || [];
            fact('Waiting for an agent', waiting.length);
            waiting.slice(0, 8).forEach((bug) => link('#' + bug.number + ' ' + bug.title, bug.url));
        } else if (k.startsWith('gh:')) {
            const gw = ext['github-work'] || {};
            const target = ghTarget(k);
            const n = Number(target);
            const pr = ((gw.prs || {}).items || []).find((r) => r.number === n);
            const run = ((gw.ci || {}).failing || []).find((r) => String(r.id) === target);
            const ticket = ((gw.board || {}).drift || []).concat((gw.board || {}).aging || []).find((r) => r.number === n);
            if (pr) {
                fact('PR', '#' + pr.number + ' ' + pr.title); fact('Author', pr.author); fact('Branch', pr.branch); fact('State', pr.state); fact('Checks', pr.checks);
                fact('Updated', pr.updatedH !== undefined ? Math.round(pr.updatedH) + ' h ago' : null); fact('Ticket', pr.ticket ? '#' + pr.ticket : 'none');
                link('Open the PR on GitHub', pr.url);
            }
            if (run) {
                fact('Workflow', run.name); fact('Branch', run.branch); fact('Attempt', run.attempt); fact('Commit', run.sha);
                if (run.diag) { fact('Cause', run.diag.cause); fact('Category', run.diag.category); fact('Fix', run.diag.fix); fact('Confidence', run.diag.confidence); }
                link('Open the run on GitHub', run.url);
            }
            if (ticket) { fact('Ticket', '#' + ticket.number + ' ' + ticket.title); fact('Column', ticket.column); fact('Should be', ticket.should); fact('Why', ticket.why); fact('Days', ticket.days); link('Open on GitHub', ticket.url); }
            if (k === 'gh:wip') { fact('In progress', (gw.board || {}).wip); fact('WIP limit', (gw.board || {}).wipLimit || 15); }
            if (k === 'gh:budget') { const gq = ((gw.budget || {}).kaanmuar || {}).graphql || {}; fact('GraphQL used', gq.used); fact('Limit', gq.limit); fact('Resets', gq.resetAt); }
            if (k === 'gh:branch-merged') githubTargets(gw).merged.slice(0, 8).forEach((b) => fact(b.name, (b.pr ? 'PR #' + b.pr + ', ' : '') + (b.days || 0) + (b.days === 1 ? ' day' : ' days') + ' ago'));
            if (k.startsWith('gh:security:')) link('Security on GitHub', 'https://github.com/kaanmuar/kaanmuar.github.io/security');
            const rule2 = rule && rule.click;
            if (rule2 && !actions.some((a) => a.id === rule2)) act(rule2, RUN_LABELS[rule2], Object.assign({ key: k }, target ? { target } : {}));
            if (k.startsWith('gh:flaky:')) act('rerun-ci', 'Re-run the failed jobs', { workflow: target });
            link('Board', 'https://github.com/orgs/carlosandmunoz-hq/projects/1');
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
        } else if (k.startsWith('pagespeed:')) {
            const ps = ext.pagespeed || {};
            const n = /^pagespeed:(pr|countdown):/.test(k) ? Number(k.split(':')[2]) : 0;
            const pr = (ps.prs || []).find((r) => r.number === n);
            if (pr) {
                fact('PR', '#' + pr.number + ' ' + pr.title); fact('Fixes', pr.kind === 'ai' ? "Gemini's" : 'Safe'); fact('Stage', pr.stage); fact('Why', pr.reason); fact('Merges at', pr.dueAt);
                link('Open the PR on GitHub', pr.url);
                if (pr.open) { act('pagespeed-merge', 'Merge #' + n, { pr: n }); act('pagespeed-close', 'Close #' + n, { pr: n }); }
            } else {
                const c = ps.counts || {}, last = (ps.runs || [])[0] || {}, avg = last.avg || {};
                fact('Pages', c.pages); fact('Measured', c.scored); fact('Under ' + (ps.threshold || 90), c.below); fact('Under 50', c.under50);
                fact('Average', avg.mobile !== undefined ? 'mobile ' + avg.mobile + ', desktop ' + avg.desktop : null);
                fact('Last run', last.at); fact('Result', last.status); fact('Error', last.error);
                const score = (p, m) => (Number.isFinite((p[m] || {}).score) ? p[m].score : null);
                const low = (p) => Math.min(...['mobile', 'desktop'].map((m) => (score(p, m) === null ? 101 : score(p, m))));
                (ps.pages || []).filter((p) => low(p) < 101).sort((a, b) => low(a) - low(b)).slice(0, 5).forEach((p) => fact(p.file || p.url, 'mobile ' + (score(p, 'mobile') === null ? '—' : score(p, 'mobile')) + ', desktop ' + (score(p, 'desktop') === null ? '—' : score(p, 'desktop'))));
                link('Last run on GitHub', last.run && last.run.url);
                link('The daily workflow', 'https://github.com/kaanmuar/kaanmuar.github.io/actions/workflows/pagespeed-daily.yml');
                if (k === 'pagespeed:run') act('pagespeed-run', 'Start the PageSpeed run now');
            }
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
            if (k === 'platform:reads') { fact('Reads since midnight Pacific', fs.reads); fact('Share of the free quota', fs.readsFreePct + '%'); }
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

    // What the headline names once the briefing is empty, so it never reads all clear beside a down connection or low readiness.
    function systemsNote(conns, ready, readinessMin) {
        const off = (conns || []).filter((c) => c.state === 'down' || c.state === 'partial').length;
        if (off) return off + (off > 1 ? ' connections need' : ' connection needs') + ' a look';
        if (typeof ready === 'number' && ready < readinessMin) return 'Readiness below ' + readinessMin + '%';
        return '';
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
        if (e.pagespeed && e.pagespeed.ok && !e.pagespeed.empty) checks.push(!e.pagespeed.stale && e.pagespeed.lastStatus !== 'failed');
        if (e.safety && e.safety.checks) e.safety.checks.forEach((c) => { if (c.level !== 'info') checks.push(c.ok); });
        const ghScore = e['github-work'] && e['github-work'].score && e['github-work'].score.overall;
        if (ghScore && typeof ghScore.value === 'number') checks.push(ghScore.value >= 70);
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
        if (/\b(all time|(?:last|past|a|1|one) year)\b/.test(t)) return { type: 'range', value: '365' };
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
            ['traffic', /\b(traffic|ga4|analytics|cloudflare)\b/], ['github', /\b(github|pull requests?|prs|board|branches|worktrees?)\b/], ['systems', /\b(systems?|health|ops|jobs|ci|speed|uptime)\b/]
        ];
        if (/\b(show|open|go to|switch to|display)\b/.test(t) || t.split(/\s+/).length <= 3) {
            const hit = aliases.find(([, re]) => re.test(t));
            if (hit) return { type: 'go', product: hit[0] };
        }
        return { type: 'ask', question: raw };
    }

    // A section push (#2509): the sections to fetch. It carries the one-day versions, so on one day only those this
    // page does not hold; on any other range the ones it names as moved.
    function sectionsToFetch(msg, versions, range) {
        const moved = String((msg && msg.sections) || '').split(',').filter(Boolean);
        let pushed;
        try { pushed = JSON.parse((msg && msg.versions) || '{}') || {}; } catch (error) { return moved; }
        if (String((msg && msg.days) || '') !== String(range)) return moved;
        const stale = Object.keys(pushed).filter((name) => !versions || !versions[name] || versions[name].v !== pushed[name]);
        return stale.concat(moved.filter((name) => !(name in pushed)));
    }

    // Jarvis 2.0 sections (#2510, contract on #2507). The versions a kept snapshot sends as `since`, or null when it
    // has none (an answer from before #2508), which means a full fetch.
    function sectionSince(versions) {
        if (!versions || typeof versions !== 'object') return null;
        const since = {};
        Object.keys(versions).forEach((name) => { if (versions[name] && versions[name].v) since[name] = versions[name].v; });
        return Object.keys(since).length ? since : null;
    }

    // A delta answer applied to the kept full snapshot: each field replaced (null drops it), `external` merged by
    // source, each source's checked time taken from `checked` (its section is not resent when only that moved), and
    // the window moved with the build time when products did not change. Null when it cannot be applied: fetch it all.
    function applySections(kept, answer) {
        if (!kept || typeof kept !== 'object' || !answer || answer.delta !== true) return null;
        if (!answer.sections || typeof answer.sections !== 'object' || !answer.versions || typeof answer.versions !== 'object') return null;
        const out = Object.assign({}, kept, { external: Object.assign({}, kept.external) });
        const put = (into, key, value) => { if (value === null) delete into[key]; else into[key] = value; };
        Object.keys(answer.sections).forEach((name) => {
            const payload = answer.sections[name] || {};
            Object.keys(payload).forEach((key) => {
                if (key === 'external') Object.keys(payload.external || {}).forEach((source) => put(out.external, source, payload.external[source]));
                else put(out, key, payload[key]);
            });
        });
        const checked = answer.checked || {};
        Object.keys(checked).forEach((source) => {
            const x = out.external[source];
            if (x && typeof x === 'object' && x.cachedAt !== checked[source]) out.external[source] = Object.assign({}, x, { cachedAt: checked[source] });
        });
        if (Array.isArray(out.connections) && Object.keys(checked).length) {
            out.connections = out.connections.map((c) => (c && c.key in checked && out.external[c.key] && c.at !== checked[c.key] ? Object.assign({}, c, { at: checked[c.key] }) : c));
        }
        const shift = Date.parse(answer.cachedAt) - Date.parse(kept.cachedAt);
        if (!answer.sections.products && out.window && shift) {
            const move = (iso) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(Date.parse(iso) + shift).toISOString() : iso);
            const w = out.window;
            out.window = Object.assign({}, w, { start: move(w.start), end: move(w.end) }, w.prior ? { prior: Object.assign({}, w.prior, { start: move(w.prior.start), end: move(w.prior.end) }) } : {});
        }
        if (answer.cachedAt !== undefined) out.cachedAt = answer.cachedAt;
        out.versions = Object.assign({}, kept.versions, answer.versions);
        return out;
    }

    function windowFor(range, now) {
        const end = now || new Date();
        if (range === 'all') return { start: new Date(end.getTime() - 3 * 365 * DAY), end, days: 0, prior: null };
        const days = Math.max(1, Number(range) || 30);
        const start = new Date(end.getTime() - days * DAY);
        return { start, end, days, prior: { start: new Date(start.getTime() - days * DAY), end: start } };
    }

    /** #1674: the jarvis function's voice catalog; the first of each language is its default. */
    const VOICES = [
        { name: 'en-GB-Chirp3-HD-Orus', lang: 'en', label: 'Orus, British' },
        { name: 'en-US-Chirp3-HD-Charon', lang: 'en', label: 'Charon, American' },
        { name: 'es-US-Chirp3-HD-Algenib', lang: 'es', label: 'Algenib, Latin American' },
        { name: 'es-ES-Chirp3-HD-Charon', lang: 'es', label: 'Charon, Spain' }
    ];
    const VOICE_RATE = { min: 0.75, max: 1.25, step: 0.05, default: 0.95 };
    const VOICE_SAMPLE = { en: 'Good evening, Carlos. All systems are running, and two things need you today.', es: 'Buenas noches, Carlos. Todos los sistemas funcionan, y hoy hay dos cosas que te esperan.' };

    /** Saved voice choices made safe: lang is "en", "es" or null (follow the browser), voices belong to their language, rate is in range. */
    function voicePrefs(saved, browserLang) {
        const s = saved && typeof saved === 'object' ? saved : {};
        const lang = s.lang === 'en' || s.lang === 'es' ? s.lang : null;
        const pick = (code) => (VOICES.find((v) => v.name === s[code] && v.lang === code) || VOICES.find((v) => v.lang === code)).name;
        const rate = Number(s.rate);
        return { lang, speak: lang || String(browserLang || 'en').slice(0, 2).toLowerCase(), en: pick('en'), es: pick('es'),
            rate: Number.isFinite(rate) && rate > 0 ? Math.min(VOICE_RATE.max, Math.max(VOICE_RATE.min, rate)) : VOICE_RATE.default };
    }

    /** #2068: what Jarvis runs on. The Android app (device/Device.kt) sends the same kinds and postures. */
    const DEVICE_KINDS = { phone: 'Phone', 'foldable-folded': 'Foldable, folded', 'foldable-open': 'Foldable, open', tablet: 'Tablet', desktop: 'Desktop' };
    const POSTURES = { flat: 'flat', tabletop: 'tabletop', book: 'half open like a book' };
    const FOLD_MODEL = /SM-F9\d\d|Fold|OnePlus Open|CPH2551/i;

    /** A device as the app or the browser reports it, made safe to store; null when the kind is unknown. */
    function cleanDevice(d) {
        if (!d || typeof d !== 'object' || !Object.prototype.hasOwnProperty.call(DEVICE_KINDS, d.kind)) return null;
        const size = (n) => { const v = Math.round(Number(n)); return Number.isFinite(v) && v > 0 && v < 10000 ? v : null; };
        const text = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) || null;
        return {
            kind: d.kind, posture: Object.prototype.hasOwnProperty.call(POSTURES, d.posture) ? d.posture : null,
            width: size(d.width), height: size(d.height), name: text(d.name, 80), model: text(d.model, 40),
            app: d.app === 'android' ? 'android' : 'web', dex: d.dex === true, windowed: d.windowed === true
        };
    }

    /** "Foldable, open · tabletop · 832×750 dp", as both Settings show it. */
    function deviceLabel(d) {
        const c = cleanDevice(d);
        if (!c) return 'Unknown device';
        return [DEVICE_KINDS[c.kind], c.posture && c.posture !== 'flat' ? POSTURES[c.posture] : null, c.dex ? 'Samsung DeX' : c.windowed ? 'in a window' : null,
            c.width && c.height ? c.width + '×' + c.height + (c.app === 'android' ? ' dp' : ' px') : null].filter(Boolean).join(' · ');
    }

    /** How long an Ask answer should be for the screen it lands on; '' when the device is unknown. */
    function askHint(d) {
        const c = cleanDevice(d);
        if (!c) return '';
        if (c.posture === 'tabletop') return 'The reader has a foldable half-folded on a table and reads the lower half: answer in at most four short sentences, the key number first.';
        if (c.kind === 'phone' || c.kind === 'foldable-folded' || (c.width && c.width < 600)) return 'The reader is on a phone-sized screen: answer in at most four short sentences, the key number first.';
        return 'The reader has a large screen (' + DEVICE_KINDS[c.kind].toLowerCase() + '): answer in up to eight sentences, with a short list when it helps compare numbers.';
    }

    /**
     * The browser's kind from what it reports: o.ua, o.model and o.mobile (Client Hints), the window (width, height) and screen
     * (screenW, screenH), touch and a coarse pointer, and the fold: o.posture ('folded' or 'continuous', Device Posture API)
     * and o.segments ({ across, down }, viewport segments).
     */
    function browserDevice(o) {
        const ua = String(o.ua || '');
        const seg = o.segments || {};
        const short = Math.min(Number(o.screenW) || 0, Number(o.screenH) || 0);
        const split = seg.across > 1 || seg.down > 1 || o.posture === 'folded';
        const foldable = split || FOLD_MODEL.test(String(o.model || '')) || FOLD_MODEL.test(ua);
        const tabletUa = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) || (/Macintosh/.test(ua) && o.touch === true);
        const phoneUa = o.mobile === true || /Android.+Mobile|iPhone|iPod/.test(ua);
        let kind = 'desktop';
        let posture = null;
        if (foldable && (split || short >= 600)) {
            kind = 'foldable-open';
            if (seg.down > 1) posture = 'tabletop';
            else if (seg.across > 1) posture = o.posture === 'folded' ? 'book' : 'flat';
            else if (o.posture === 'folded') posture = Number(o.width) > Number(o.height) ? 'tabletop' : 'book';
            else posture = 'flat';
        } else if (foldable) kind = 'foldable-folded';
        else if (phoneUa) kind = 'phone';
        else if (tabletUa || (o.touch === true && o.coarse === true)) kind = short >= 600 ? 'tablet' : 'phone';
        return cleanDevice({ kind, posture, width: o.width, height: o.height, name: o.name, model: o.model, app: 'web' });
    }

    // --- #2139: the wide-screen deck and charts. The app reads the same numbers from the snapshot's `wide` field. ---

    const TREND = [['cv', 'CV'], ['studio', 'QA Studio'], ['lab', 'QA Lab'], ['review', 'URL Review'], ['inbox', 'Inbox'], ['hub', 'Social hub']];
    const PURPOSES = { review: 'Review run', report: 'Full report', pass: 'Review pass', fixlist: 'Fix list', cases: 'Test cases', 'new-run': 'New run', credentials: 'Signed-in run', alerts: 'Alerts', credit: 'Credits' };
    const ok = (x) => !!(x && x.ok !== false);
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

    function uptimeNow(up) {
        const pages = ok(up) && Array.isArray(up.pages) ? up.pages : [];
        return pages.length ? Math.round((pages.filter((p) => p.ok).length / pages.length) * 100) : null;
    }

    // Readiness, revenue, visits, alerts and uptime: the strip across the top of Overview.
    function deck(products, external, brief) {
        const e = external || {};
        const r = readiness(e);
        const mo = ok(e.money) && e.money.revenue ? e.money : null;
        const sv = siteVisits(products);
        const list = Array.isArray(brief) ? brief : [];
        const alerts = list.filter((b) => b.level === 'alert').length;
        const warns = list.filter((b) => b.level === 'warn').length;
        const strip = uptimeStrip(e.uptime && e.uptime.history);
        const now = uptimeNow(e.uptime);
        const money = mo ? delta(mo.revenue.usd, mo.prior && mo.prior.usd) : { text: '', dir: 0 };
        return [
            { key: 'readiness', label: 'Readiness', value: r === null ? '—' : r + '%', raw: r, alert: r !== null && r < THRESHOLDS.readinessMin.value },
            { key: 'revenue', label: 'Revenue', value: mo ? '$' + (Math.round(num(mo.revenue.usd) * 100) / 100).toLocaleString('en-US') : '—', raw: mo ? num(mo.revenue.usd) : null, delta: money.text, dir: money.dir },
            { key: 'visits', label: 'Site visits', value: sv ? sv.value : '—', raw: sv ? sv.value : null, delta: sv ? sv.delta : '', dir: sv ? sv.dir : 0 },
            { key: 'alerts', label: 'Alerts', value: alerts, raw: alerts, delta: warns ? warns + (warns === 1 ? ' warning' : ' warnings') : '', dir: 0, alert: alerts > 0 },
            { key: 'uptime', label: strip.pct === null ? 'Uptime now' : 'Uptime, 90 days', value: strip.pct !== null ? strip.pct + '%' : now === null ? '—' : now + '%', raw: strip.pct !== null ? strip.pct : now, delta: strip.pct !== null && now !== null ? 'now ' + now + '%' : '', dir: 0, alert: now !== null && now < 100 }
        ];
    }

    // One daily line per product over shared dates; products without a series are left out.
    function trend(products) {
        const p = products || {};
        const rows = TREND.filter(([key]) => p[key] && p[key].series && p[key].series.labels && p[key].series.labels.length);
        const labels = rows.reduce((best, [key]) => (p[key].series.labels.length > best.length ? p[key].series.labels : best), []);
        return {
            labels,
            series: rows.map(([key, name]) => {
                const s = p[key].series;
                return { key, name, values: labels.map((day) => { const i = s.labels.indexOf(day); return i === -1 ? 0 : num(s.values[i]); }) };
            })
        };
    }

    // Visits across the CV, Studio and Lab sites and URL Review opens: when they come and where from.
    function trafficMix(products) {
        const p = products || {};
        const grid = WEEKDAYS.map(() => new Array(24).fill(0));
        const sources = {};
        ['cv', 'studio', 'lab', 'review'].forEach((key) => {
            const x = p[key];
            if (!x) return;
            (Array.isArray(x.heatmap) ? x.heatmap : []).forEach((row, d) => (row || []).forEach((n, h) => { if (grid[d] && h < 24) grid[d][h] += num(n); }));
            ((x.lists && x.lists.sources) || []).forEach((r) => bump(sources, String(r.label).replace(/\s*\(tagged link\)$/, ''), num(r.value)));
        });
        const total = grid.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);
        return { heatmap: grid, peak: peak(grid), total, sources: topList(sources, 12) };
    }

    // The site's own counter against GA4 sessions and Cloudflare page views, day by day.
    function trafficCompare(products, external) {
        const e = external || {};
        const sv = siteVisits(products);
        const ga = ok(e.ga4) && Array.isArray(e.ga4.daily) ? e.ga4.daily : [];
        const cf = ok(e.cloudflare) && Array.isArray(e.cloudflare.daily) ? e.cloudflare.daily : [];
        const site = sv ? sv.series : { labels: [], values: [] };
        const labels = Array.from(new Set(site.labels.concat(ga.map((r) => r.date), cf.map((r) => r.date)).filter(Boolean))).sort();
        const by = (rows, key) => { const m = {}; rows.forEach((r) => { m[r.date] = num(r[key]); }); return labels.map((d) => m[d] || 0); };
        const siteBy = {};
        site.labels.forEach((d, i) => { siteBy[d] = num(site.values[i]); });
        const series = [
            { key: 'site', name: 'Site counter', values: labels.map((d) => siteBy[d] || 0), on: !!sv },
            { key: 'ga4', name: 'GA4 sessions', values: by(ga, 'sessions'), on: ga.length > 0 },
            { key: 'cloudflare', name: 'Cloudflare page views', values: by(cf, 'pageViews'), on: cf.length > 0 }
        ];
        const why = { site: 'No site events in range.', ga4: (e.ga4 && e.ga4.error) || 'GA4 is not loaded.', cloudflare: (e.cloudflare && e.cloudflare.error) || 'Cloudflare is not loaded.' };
        return {
            labels,
            series: series.filter((s) => s.on).map(({ key, name, values }) => ({ key, name, values })),
            totals: series.map((s) => ({ key: s.key, label: s.name, value: s.on ? s.values.reduce((a, b) => a + b, 0) : null, why: s.on ? '' : why[s.key] }))
        };
    }

    function revenueByProduct(money) {
        if (!ok(money) || !Array.isArray(money.byPurpose)) return [];
        return money.byPurpose.filter((r) => num(r.value) > 0).map((r) => ({ label: PURPOSES[r.label] || r.label, value: Math.round(num(r.value) * 100) / 100 }));
    }

    // Reviewed by the sweep, emailed through Instantly, replied, paid through a qalabreview.com link.
    function outreachFunnel(external) {
        const ou = (external || {}).outreach;
        if (!ok(ou)) return null;
        const pipe = ok(ou.pipeline) && ou.pipeline ? ou.pipeline : null;
        const mail = ok(ou.instantly) && ou.instantly ? ou.instantly : null;
        const links = ok(ou.links) && ou.links ? ou.links : null;
        if (!pipe && !mail && !links) return null;
        return [
            { key: 'reviewed', label: 'Reviewed', value: pipe ? num(pipe.reviews) : null },
            { key: 'notified', label: 'Notified', value: mail ? num(mail.contacted) : null },
            { key: 'replied', label: 'Replied', value: mail ? num(mail.replies) : null },
            { key: 'paid', label: 'Paid', value: links ? num(links.paid) : null }
        ];
    }

    // One tile per connection, scheduled job and CI workflow: good, warn, alert or off.
    function statusMatrix(external, pending) {
        const e = external || {};
        const conn = connections(e, pending).map((c) => ({ group: 'Connections', name: c.name.replace(/\s*\(.*\)$/, ''), level: { live: 'good', partial: 'warn', down: 'alert' }[c.state] || 'off', detail: c.detail || c.state }));
        // Scheduler only knows the trigger fired; the job's own last run (health.jobs) says whether it worked.
        const runs = new Map((ok(e.health) && Array.isArray(e.health.jobs) ? e.health.jobs : []).map((j) => [j.job, j]));
        const jobs = (ok(e.jobs) && Array.isArray(e.jobs.jobs) ? e.jobs.jobs : []).map((j) => {
            const run = runs.get(j.name);
            runs.delete(j.name);
            const failed = !j.ok || (run && run.ok === false);
            return { group: 'Jobs', name: j.name, level: failed ? 'alert' : j.state === 'PAUSED' ? 'warn' : 'good', detail: failed ? (run && run.ok === false ? run.error : j.error) || 'failed' : j.state === 'PAUSED' ? 'paused' : j.note || 'ok' };
        }).concat([...runs.values()].map((run) => ({ group: 'Jobs', name: run.job, level: run.ok === false ? 'alert' : 'good', detail: run.ok === false ? run.error || 'failed' : 'ok' })));
        const ci = (ok(e.github) && Array.isArray(e.github.ci) ? e.github.ci : []).map((c) => ({ group: 'CI', name: c.name, level: ['success', 'skipped', 'neutral'].includes(c.conclusion) ? 'good' : !c.conclusion ? 'off' : c.conclusion === 'cancelled' ? 'warn' : 'alert', detail: c.conclusion || 'running' }));
        return conn.concat(jobs, ci);
    }

    // The last 90 Bogota days of the hourly uptime checks (jarvis_uptime); a day without checks is null, not 100.
    function uptimeStrip(history, now) {
        const rows = Array.isArray(history) ? history : [];
        const by = {};
        rows.forEach((r) => { if (r && r.date && num(r.checks) > 0) by[r.date] = r; });
        const end = now || new Date();
        const days = dayKeys(new Date(end.getTime() - 89 * DAY), end).slice(-90);
        let checks = 0, up = 0;
        const out = days.map((date) => {
            const r = by[date];
            if (!r) return { date, pct: null };
            checks += num(r.checks);
            up += num(r.up);
            return { date, pct: Math.round((num(r.up) / num(r.checks)) * 1000) / 10 };
        });
        const since = out.find((d) => d.pct !== null);
        return { days: out, pct: checks ? Math.round((up / checks) * 1000) / 10 : null, since: since ? since.date : null };
    }

    // The Products list: each product's lead number and daily series, for the list-detail view and the tiles.
    function productList(products, external) {
        const p = products || {};
        const e = external || {};
        const out = PRODUCTS.filter((x) => ['inbox', 'cv', 'studio', 'lab', 'review', 'hub'].includes(x.key) && p[x.key]).map((x) => {
            const s = p[x.key];
            return { key: x.key, name: x.name, kpis: (s.kpis || []).slice(0, 6), series: s.series || { labels: [], values: [] } };
        });
        const ou = ok(e.outreach) ? e.outreach : null;
        const pipe = ou && ok(ou.pipeline) && ou.pipeline ? ou.pipeline : null;
        const mail = ou && ok(ou.instantly) && ou.instantly ? ou.instantly : null;
        out.push({ key: 'outreach', name: 'Outreach', kpis: [pipe && kpi('Reviewed', num(pipe.reviews)), pipe && kpi('Queued', num(pipe.queued)), mail && kpi('Emails sent', num(mail.sent)), mail && kpi('Replies', num(mail.replies))].filter(Boolean),
            series: pipe ? { labels: (pipe.daily || []).map((d) => d.date), values: (pipe.daily || []).map((d) => num(d.reviews)) } : { labels: [], values: [] } });
        const so = ok(e.social) && e.social.daily ? e.social : null;
        out.push({ key: 'marketing', name: 'Marketing', kpis: [so && kpi('Social posts', num(so.sent)), so && kpi('Failed', num(so.failed), undefined, { alert: num(so.failed) > 0 })].filter(Boolean),
            series: so ? { labels: so.daily.map((d) => d.date), values: so.daily.map((d) => num(d.posts)) } : { labels: [], values: [] } });
        const geo = ok(e.geo) && e.geo.totals ? e.geo.totals : null;
        out.push({ key: 'geo', name: 'Map', kpis: geo ? [kpi('Countries active', num(geo.countries)), kpi('Targets missing', num(geo.missing), undefined, { alert: num(geo.missing) > 0 }), kpi('Replies', num(geo.replies))] : [],
            series: { labels: [], values: [] } });
        const eg = ok(e.engagement) && Array.isArray(e.engagement.daily) ? e.engagement : null;
        const t = (eg && eg.report && eg.report.totals) || {};
        out.push({ key: 'engagement', name: 'Engagement', kpis: eg ? [kpi('Posts read', num(t.read)), kpi('Candidates', num(t.candidates)), kpi('Replies drafted', num(t.drafted))] : [],
            series: eg ? { labels: eg.daily.map((d) => d.day), values: eg.daily.map((d) => num(d.read)) } : { labels: [], values: [] } });
        const gw = ok(e['github-work']) ? e['github-work'] : null;
        const sc = gw && gw.score && gw.score.overall;
        const hist = gw && Array.isArray(gw.history) ? gw.history.filter((d) => d && d.score !== null && d.score !== undefined) : [];
        const rate = gw && gw.ci && gw.ci.passRate !== null && gw.ci.passRate !== undefined ? num(gw.ci.passRate) : null;
        out.push({ key: 'github', name: 'GitHub', kpis: gw ? [sc && kpi('Score', (num(sc.value) + ' ' + (sc.grade || '')).trim(), undefined, { raw: num(sc.value) }), rate !== null && kpi('CI pass rate', rate + '%', undefined, { raw: rate }),
            gw.prs && kpi('Open PRs', num(gw.prs.open)), gw.issues && kpi('Open bugs', num(gw.issues.openBugs))].filter(Boolean) : [],
            series: { labels: hist.map((d) => d.day), values: hist.map((d) => num(d.score)) } });
        return out;
    }

    // Everything above in one object: the snapshot carries it for the app, the web builds it from the same inputs.
    function wide(state) {
        const s = state || {};
        const traffic = trafficMix(s.products);
        return {
            deck: deck(s.products, s.external, s.briefing), trend: trend(s.products), products: productList(s.products, s.external),
            traffic: { heatmap: traffic.heatmap, peak: traffic.peak, total: traffic.total, sources: traffic.sources, compare: trafficCompare(s.products, s.external) },
            revenue: revenueByProduct((s.external || {}).money), funnel: outreachFunnel(s.external),
            matrix: statusMatrix(s.external), uptime: uptimeStrip(((s.external || {}).uptime || {}).history, s.now)
        };
    }

    // The day's LinkedIn list labels each line under a person: "- Note: ...", "- Check first: ..." (#2479).
    function linkedinLine(person, label) {
        const head = label.toLowerCase() + ':';
        const line = ((person && person.lines) || []).map((l) => String(l).trim()).find((l) => l.toLowerCase().startsWith(head));
        return line ? line.slice(head.length).trim() : '';
    }

    /* The console's filter, on the server (the log op) and in the page: sources = a list or "a,b" (empty is all),
       level = the lowest level shown, q = words that must all appear in the line's text, source or ref. */
    function logFilter(rows, f) {
        const o = f || {};
        const sources = (Array.isArray(o.sources) ? o.sources : String(o.sources || '').split(',')).map((s) => String(s).trim()).filter(Boolean);
        const min = Math.max(0, LOG_LEVELS.indexOf(o.level));
        const words = String(o.q || '').toLowerCase().split(/\s+/).filter(Boolean);
        return (rows || []).filter((r) => r && (!sources.length || sources.includes(r.source)) && Math.max(0, LOG_LEVELS.indexOf(r.level)) >= min
            && (!words.length || words.every((w) => (String(r.text || '') + ' ' + r.source + ' ' + String(r.ref || '')).toLowerCase().includes(w))));
    }

    const api = { LOG_SOURCES, LOG_LEVELS, logFilter, linkedinLine, TREND, PURPOSES, deck, trend, trafficMix, trafficCompare, revenueByProduct, outreachFunnel, statusMatrix, uptimeStrip, productList, wide, DEVICE_KINDS, POSTURES, cleanDevice, deviceLabel, askHint, browserDevice, VOICES, VOICE_RATE, VOICE_SAMPLE, voicePrefs, THRESHOLDS, thresholds, CONNECTIONS, connections, outreachVisits, SOCIAL, socialHeat, feed, SEARCH_QUERIES, GITHUB_REPOS, githubRepos, LAYOUT_TABS, panelSlug, cleanLayout, layoutWeave, applyLayout, layoutMove, keepLayout, GOAL_METRICS, GOAL_PERIODS, cleanGoals, goalKey, goalLabel, periodWindow, goalProgress, ZONE, DAY, PRODUCTS, WEEKDAYS, toDate, zoneParts, bump, topList, delta, kpi, dayKeys, dailySeries, anomaly, openSource, linkCode, actionTitle, isHubEvent, isTestEmail, isReviewRun, REVIEW_ORIGINS, reviewOrigin, splitReviews, heatmap, peak, summarizeSite, summarizeReview, summarizeInbox, summarizeHub, siteVisits, briefing, CALENDAR, calendarSettings, heldCampaigns, calendarLines, dayDiff, dayLabel, githubTargets, PROPOSAL_RULES, SAFE_ACTIONS, CLICK_ACTIONS, RUN_LABELS, proposalRules, pageSpeedPr, ghTarget, proposalRun, proposalButtons, openProposals, BRIEF_HIDE_DAYS, openBrief, briefDetail, readiness, systemsNote, csv, parseCommand, windowFor, sectionsToFetch, sectionSince, applySections };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.JarvisCore = api;
})(typeof self !== 'undefined' ? self : this);
