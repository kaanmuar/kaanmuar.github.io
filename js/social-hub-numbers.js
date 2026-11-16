/* Numbers at the top of the Social hub pane in admin.html, from Firestore socialHubStats/latest. refreshSocialHubStats
   (functions/social-hub-stats.js) writes it every morning from GA4 and site_events. */

const NET_NAMES = { linkedin: 'LinkedIn', x: 'X', facebook: 'Facebook', whatsapp: 'WhatsApp', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', link: 'Link' };
const TOP = 25;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function number(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function kpi(label, value, note) {
    return '<div class="stat-kpi"><span>' + escapeHtml(label) + '</span><strong>' + number(value) + '</strong>' + (note ? '<em>' + escapeHtml(note) + '</em>' : '') + '</div>';
}

function meters(rows, color) {
    if (!rows.length) return '<p class="stats-empty">Nothing yet.</p>';
    const max = Math.max(...rows.map((row) => row.count), 1);
    return rows.map((row) => '<div class="split-row"><span>' + escapeHtml(row.name) + '</span><div class="h-meter"><span style="width:'
        + Math.max(2, Math.round(row.count / max * 100)) + '%;background:' + color + '"></span></div><b>' + number(row.count) + '</b></div>').join('');
}

function daily(rows) {
    if (!rows.length) return '<p class="stats-empty">No views yet.</p>';
    const max = Math.max(...rows.map((row) => row.views), 1);
    const width = 600;
    const step = width / rows.length;
    const bars = rows.map((row, i) => {
        const h = Math.max(1, Math.round(row.views / max * 110));
        return '<rect x="' + (i * step + 1).toFixed(1) + '" y="' + (120 - h) + '" width="' + Math.max(1, step - 2).toFixed(1) + '" height="' + h + '" rx="2" fill="#0d6e76"><title>'
            + escapeHtml(row.date + ': ' + row.views) + '</title></rect>';
    }).join('');
    return '<svg viewBox="0 0 ' + width + ' 120" role="img" aria-label="Hub and post page views per day">' + bars + '</svg>'
        + '<div class="stats-legend"><span>' + escapeHtml(rows[0].date) + '</span><span>' + escapeHtml(rows[rows.length - 1].date) + '</span></div>';
}

function postsTable(posts) {
    if (!posts.length) return '<p class="stats-empty">No post has views or clicks yet.</p>';
    const head = ['Post', 'Views', 'Last 7 days', 'GA4 views', 'Opens', 'Plays', 'Copies', 'Shares', 'Downloads'];
    const rows = posts.slice(0, TOP).map((row) => '<tr><td><a href="social/' + escapeHtml(row.id) + '.html" target="_blank" rel="noopener" class="underline">' + escapeHtml(row.id) + '</a></td>'
        + [row.views, row.views7, row.gaViews, row.opens, row.plays, row.copies, row.shares, row.downloads].map((value) => '<td>' + number(value) + '</td>').join('') + '</tr>').join('');
    return '<div class="hub-numbers-table"><table><thead><tr>' + head.map((name) => '<th scope="col">' + name + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

export function createHubNumbers({ db, doc, getDoc }) {
    const box = document.getElementById('hub-numbers');
    let loaded = false;

    function render(data) {
        const totals = data.totals || {};
        const networks = data.networks || {};
        const named = (counts) => Object.entries(counts || {}).map(([net, count]) => ({ name: NET_NAMES[net] || net, count })).sort((a, b) => b.count - a.count);
        const sources = (data.sources || []).map((row) => ({ name: [row.source, row.medium, row.campaign && row.campaign !== '(not set)' ? row.campaign : ''].filter(Boolean).join(' / '), count: row.sessions }));
        const gaNote = data.ga && data.ga.ok ? '' : '<p class="cv-note">GA4 was not read on the last run' + (data.ga && data.ga.error ? ': ' + escapeHtml(data.ga.error) : '') + '. Everything else still comes from site events.</p>';
        const langs = (data.hubPages || []).map((row) => ({ name: row.lang.toUpperCase(), count: row.views }));
        box.innerHTML = '<p class="cv-note">Last 28 days, updated ' + escapeHtml(String(data.updatedAt || '').slice(0, 16).replace('T', ' ')) + ' UTC. Views and clicks are counted on every visit; GA4 only sees visitors who allowed analytics, so its sources and views are a sample.</p>' + gaNote
            + '<div class="site-kpis">' + kpi('Hub page views', totals.hubViews) + kpi('Post page views', totals.postViews, number(totals.postViews7) + ' in the last 7 days')
            + kpi('Clicks on posts', totals.interactions) + kpi('GA4 page views', totals.gaViews, 'Visitors who allowed analytics') + '</div>'
            + '<div class="stats-grid">'
            + '<section class="stats-card stats-wide"><h3>Views per day</h3><div class="stats-chart">' + daily(data.daily || []) + '</div></section>'
            + '<section class="stats-card"><h3>Hub views by language</h3>' + meters(langs, '#0f766e') + '</section>'
            + '<section class="stats-card"><h3>Where visitors came from (GA4)</h3>' + meters(sources, '#0d6e76') + '</section>'
            + '<section class="stats-card"><h3>Shared to</h3>' + meters(named(networks.share), '#b45309') + '</section>'
            + '<section class="stats-card"><h3>Captions copied for</h3>' + meters(named(networks.copy), '#3d7a82') + '</section>'
            + '<section class="stats-card stats-wide"><h3>Top posts</h3>' + postsTable(data.posts || []) + '</section>'
            + '<section class="stats-card stats-wide"><h3>Events in GA4</h3>' + meters((data.events || []).map((row) => ({ name: row.name, count: row.count })), '#4a5560') + '</section>'
            + '</div>';
    }

    async function load() {
        if (!box || loaded) return;
        loaded = true;
        box.innerHTML = '<p class="cv-note">Loading numbers…</p>';
        try {
            const snap = await getDoc(doc(db, 'socialHubStats', 'latest'));
            if (snap.exists()) render(snap.data());
            else box.innerHTML = '<p class="cv-note">No numbers yet. They appear after the first morning run of refreshSocialHubStats.</p>';
        } catch (error) {
            loaded = false;
            box.innerHTML = '<p class="cv-note">Numbers could not be loaded: ' + escapeHtml(error && error.message) + '</p>';
        }
    }

    return { load };
}
