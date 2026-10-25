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
        const paid = reviews.filter((row) => row.paid === true);
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

    // The instant briefing: rules over the summaries, most urgent first. Levels: alert, warn, good, info.
    function briefing(state) {
        const out = [];
        const add = (level, product, text) => out.push({ level, product, text });
        const p = state.products || {};
        const ext = state.external || {};
        const names = PRODUCTS.reduce((m, row) => { m[row.key] = row.name; return m; }, {});
        ['cv', 'studio', 'lab'].forEach((key) => {
            const s = p[key];
            if (!s) return;
            const visits = s.kpis[0];
            if (visits.pct !== null && Math.abs(visits.pct) >= 25 && Math.max(visits.value, visits.prior || 0) >= 10) {
                add(visits.pct > 0 ? 'good' : 'warn', key, `${names[key]} visits ${visits.pct > 0 ? 'rose' : 'fell'} ${Math.abs(visits.pct)}% (${visits.value} vs ${visits.prior}).`);
            }
            if (s.anomaly) add(s.anomaly.z > 0 ? 'info' : 'warn', key, `${names[key]}: today has ${s.anomaly.last} visits against a ${s.anomaly.mean}/day average (z ${s.anomaly.z}).`);
            const top = (s.lists.sources || [])[0];
            if (top && s.totals.visits >= 10) add('info', key, `${names[key]}'s top source is ${top.label} with ${top.value} of ${s.totals.visits} visits.`);
        });
        const r = p.review;
        if (r) {
            const opens = r.kpis[0];
            if (opens.pct !== null && Math.abs(opens.pct) >= 25 && Math.max(opens.value, opens.prior || 0) >= 10) add(opens.pct > 0 ? 'good' : 'warn', 'review', `URL Review opens ${opens.pct > 0 ? 'rose' : 'fell'} ${Math.abs(opens.pct)}% (${opens.value} vs ${opens.prior}).`);
            if (r.totals.usd > 0) add('good', 'review', `URL Review earned ${r.totals.usd} USD from ${r.totals.paid} paid reviews.`);
            if (r.totals.opens >= 50 && r.totals.conversion < 5) add('warn', 'review', `Only ${r.totals.conversion}% of URL Review opens start a review.`);
            if (r.anomaly) add(r.anomaly.z > 0 ? 'info' : 'warn', 'review', `URL Review: today has ${r.anomaly.last} opens against ${r.anomaly.mean}/day (z ${r.anomaly.z}).`);
        }
        const inbox = p.inbox;
        if (inbox) {
            if (inbox.totals.unanswered > 0) add('warn', 'inbox', `${inbox.totals.unanswered} message${inbox.totals.unanswered > 1 ? 's' : ''} in range still have no answer.`);
            if (inbox.totals.pending > 0) add('warn', 'inbox', `${inbox.totals.pending} rating${inbox.totals.pending > 1 ? 's wait' : ' waits'} for approval.`);
        }
        const hub = p.hub;
        if (hub && hub.ga && hub.ga.ok === false) add('warn', 'hub', 'Social hub stats could not read GA4 on the last refresh.');
        if (hub && hub.updatedAt && Date.now() - Date.parse(hub.updatedAt) > 2 * DAY) add('warn', 'hub', 'Social hub stats are more than two days old.');
        const health = ext.health;
        if (health && health.ok !== false) {
            (health.jobs || []).filter((job) => !job.ok).forEach((job) => add('alert', 'systems', `Job ${job.job} failed: ${job.error || job.note || 'no detail'}.`));
            if (health.failures && health.failures.total) add(health.failures.total >= 10 ? 'alert' : 'warn', 'systems', `${health.failures.total} URL review runs failed in range; top cause ${((health.failures.causes || [])[0] || {}).label || 'unknown'}.`);
            if (health.reruns && health.reruns.held) add('warn', 'systems', `${health.reruns.held} re-run${health.reruns.held > 1 ? 's are' : ' is'} held on the desk.`);
        }
        const jobs = ext.jobs;
        if (jobs && jobs.ok !== false) (jobs.jobs || []).filter((job) => !job.ok).forEach((job) => add('alert', 'systems', `Scheduler: ${job.name} last ended with ${job.error || 'an error'}.`));
        const gh = ext.github;
        if (gh && gh.ok) {
            (gh.ci || []).filter((run) => run.conclusion && run.conclusion !== 'success' && run.conclusion !== 'skipped').forEach((run) => add('alert', 'systems', `CI "${run.name}" on main is ${run.conclusion}.`));
            if (gh.openBugs) add('info', 'systems', `${gh.openBugs} open bugs; most in ${((gh.bugAreas || [])[0] || {}).label || 'none'}. ${gh.merged.total} PRs merged this week.`);
        }
        const speed = ext.speed;
        if (speed && speed.ok) (speed.pages || []).forEach((page) => {
            if (page.ok && page.score < 50) add('warn', page.product, `${page.name} scores ${page.score} on mobile PageSpeed.`);
            else if (page.ok && page.score >= 90) add('good', page.product, `${page.name} scores ${page.score} on mobile PageSpeed.`);
        });
        const up = ext.uptime;
        if (up && up.ok) {
            (up.pages || []).forEach((page) => {
                if (!page.ok) add('alert', page.product, `${page.name} answered ${page.status || 'nothing'}${page.error ? ' (' + page.error + ')' : ''}.`);
                else if (page.ms > 3000) add('warn', page.product, `${page.name} took ${page.ms} ms to answer.`);
            });
            if (up.tlsDaysLeft !== null && up.tlsDaysLeft !== undefined && up.tlsDaysLeft < 21) add('alert', 'systems', `The TLS certificate expires in ${up.tlsDaysLeft} days.`);
        }
        const ga = ext.ga4;
        if (ga && ga.ok) {
            const sessions = (ga.groups || []).reduce((s, g) => s + g.sessions, 0);
            const prior = (ga.groups || []).reduce((s, g) => s + g.priorSessions, 0);
            const d = delta(sessions, prior);
            if (d.pct !== null && Math.abs(d.pct) >= 20 && Math.max(sessions, prior) >= 20) add(d.pct > 0 ? 'good' : 'warn', 'traffic', `GA4 sessions ${d.pct > 0 ? 'rose' : 'fell'} ${Math.abs(d.pct)}% (${sessions} vs ${prior}).`);
        }
        const rank = { alert: 0, warn: 1, good: 2, info: 3 };
        return out.sort((a, b) => rank[a.level] - rank[b.level]);
    }

    // Share of checks that pass, for the reactor ring: jobs, CI, uptime, speed, failures.
    function readiness(external) {
        const checks = [];
        const e = external || {};
        if (e.health && e.health.jobs) e.health.jobs.forEach((job) => checks.push(job.ok));
        if (e.jobs && e.jobs.jobs) e.jobs.jobs.forEach((job) => checks.push(job.ok));
        if (e.github && e.github.ci) e.github.ci.forEach((run) => checks.push(run.conclusion === 'success' || run.conclusion === 'skipped'));
        if (e.uptime && e.uptime.pages) e.uptime.pages.forEach((page) => checks.push(!!page.ok && page.ms <= 3000));
        if (e.speed && e.speed.pages) e.speed.pages.forEach((page) => { if (page.ok) checks.push(page.score >= 50); });
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

    const api = { ZONE, DAY, PRODUCTS, WEEKDAYS, toDate, zoneParts, bump, topList, delta, dayKeys, dailySeries, anomaly, openSource, linkCode, actionTitle, isHubEvent, heatmap, peak, summarizeSite, summarizeReview, summarizeInbox, summarizeHub, briefing, readiness, csv, parseCommand, windowFor };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.JarvisCore = api;
})(typeof self !== 'undefined' ? self : this);
