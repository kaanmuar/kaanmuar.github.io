/* The Social hub pane in admin.html: every hub post with its calendar slots per channel, caption and date
   edits, hiding, and items added by hand. Edits go to Firestore socialHub/live (js/social-hub-admin.js has
   the format); scripts/build-social-hub.js pulls them on its next online run, which the daily Live Reports
   workflow makes. */
import { createProposals } from './social-hub-proposals.js?v=20261024b';

const PAGE = 40;
const KIND = { tip: 'Tip', review: 'Site review', launch: 'Product', pick: 'Pick' };
const NET_NAMES = { linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

async function fetchJson(url, fallback) {
    try {
        const res = await fetch(url, { cache: 'no-store' });
        return res.ok ? await res.json() : fallback;
    } catch (error) {
        return fallback;
    }
}

export function createHubEditor(deps) {
    const { db, auth, doc, getDoc, setDoc, serverTimestamp } = deps;
    const Admin = window.SocialHubAdmin;
    const $ = (id) => document.getElementById(id);
    let feed = { posts: [], asOf: '' };
    let captions = {};
    let published = Admin.empty();
    let saved = Admin.empty();
    let slots = {};
    let ledgers = [];
    let loading = null;
    let shown = PAGE;
    let open = '';
    const proposals = createProposals({ Admin, $, escapeHtml, state: () => saved, persist, openAdd });

    function message(text, ok) {
        const el = $('hub-admin-message');
        el.textContent = text;
        el.style.color = ok ? '#047857' : '#b91c1c';
    }

    function hint(error) {
        if (error && error.code === 'permission-denied') return 'Firestore blocked this. Sign in with the admin account. Only that account can write socialHub.';
        return (error && error.message) || 'The hub edits could not be saved.';
    }

    function load() {
        if (!loading) loading = pull();
        return loading;
    }

    async function pull() {
        $('hub-admin-status').textContent = 'Loading the hub…';
        const [feedJson, captionsJson, editsJson, proposalsJson, bufferJson, facebookJson, openJson] = await Promise.all([
            fetchJson('assets/social/feed.json', { posts: [], asOf: '' }),
            fetchJson('assets/social/captions.json', {}),
            fetchJson('assets/social/edits.json', null),
            fetchJson('assets/social/proposals.json', null),
            fetchJson('assets/social/buffer.json', null),
            fetchJson('assets/social/facebook.json', null),
            fetchJson('assets/social/open-social.json', null)
        ]);
        proposals.load(proposalsJson);
        feed = feedJson;
        ledgers = [bufferJson, facebookJson, openJson];
        captions = captionsJson;
        published = Admin.clean(editsJson);
        saved = published;
        try {
            const snap = await getDoc(doc(db, 'socialHub', 'live'));
            if (snap.exists()) saved = Admin.clean(JSON.parse(snap.data().json || '{}'));
        } catch (error) {
            console.warn(error);
            message('Firestore did not return the saved edits. These are the ones on the hub.', false);
        }
        const batches = [...new Set(feed.posts.map((post) => Admin.batchOf(post.id)))].filter((batch) => batch && batch !== 'pick');
        const calendars = await Promise.all(batches.map(async (batch) => {
            try {
                const res = await fetch(`media/social-posts/${encodeURIComponent(batch)}/calendar.csv`, { cache: 'no-store' });
                return res.ok ? Admin.parseCalendar(await res.text(), batch) : {};
            } catch (error) {
                return {};
            }
        }));
        slots = Object.assign({}, ...calendars);
        paint();
    }

    function rows() {
        const today = new Date().toISOString().slice(0, 10);
        const onHub = new Set(feed.posts.map((post) => post.id));
        const list = feed.posts.map((post) => ({ post, onHub: true }));
        saved.items.filter((item) => !onHub.has(item.id)).forEach((item) => {
            list.push({ post: Object.assign(Admin.itemPost(item), { thumb: item.image }), onHub: false });
        });
        const hidden = Object.keys(saved.edits).filter((id) => saved.edits[id].hidden).concat(Object.keys(published.edits).filter((id) => published.edits[id].hidden));
        [...new Set(hidden)].filter((id) => !list.some((row) => row.post.id === id)).forEach((id) => {
            list.push({ post: { id, kind: '', title: id, date: '', lang: '', thumb: '' }, onHub: false });
        });
        return list.map((row) => {
            const id = row.post.id;
            const edit = saved.edits[id] || {};
            const item = saved.items.find((other) => other.id === id) || null;
            const before = published.items.find((other) => other.id === id) || null;
            const date = (item && item.date) || edit.date || row.post.date;
            return Object.assign(row, {
                id, edit, item, date,
                pending: !Admin.same(saved.edits[id], published.edits[id]) || !Admin.same(item, before),
                scheduled: !!date && date > today,
                hidden: !!edit.hidden,
                edited: !!saved.edits[id] || !!item,
                channels: Admin.channels(slots[id], row.post.youtube, Date.now(), Admin.ledgerEntries(ledgers, id))
            });
        }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id));
    }

    function matches(row, q, kind, state) {
        if (kind !== 'all' && row.post.kind !== kind) return false;
        if (state === 'queued' && !row.channels.some((channel) => channel.state === 'queued')) return false;
        if (state === 'failed' && !row.channels.some((channel) => channel.state === 'failed')) return false;
        if (state === 'missing' && !row.channels.some((channel) => channel.state === 'missing')) return false;
        if (state === 'scheduled' && !row.scheduled) return false;
        if (state === 'edited' && !row.edited) return false;
        if (state === 'hidden' && !row.hidden) return false;
        if (state === 'pending' && !row.pending) return false;
        return !q || `${row.id} ${row.post.title} ${row.post.text || ''}`.toLowerCase().includes(q);
    }

    function rowHtml(row) {
        const post = row.post;
        const tags = [KIND[post.kind] || post.kind, post.lang && post.lang.toUpperCase()].filter(Boolean).map((tag) => `<span class="hub-admin-tag">${escapeHtml(tag)}</span>`).join('')
            + (row.scheduled ? '<span class="hub-admin-tag is-scheduled">Scheduled on the hub</span>' : '')
            + (row.hidden ? '<span class="hub-admin-tag is-hidden">Hidden</span>' : '')
            + (row.edited && !row.hidden ? '<span class="hub-admin-tag is-edited">Edited</span>' : '')
            + (row.pending ? '<span class="hub-admin-tag is-pending">Waiting for the hub build</span>' : '');
        const channels = post.kind && post.kind !== 'pick'
            ? `<ul class="hub-admin-channels" aria-label="Channels">${row.channels.map((channel) => `<li class="is-${channel.state}" title="${escapeHtml(channel.error ? `${channel.via}: ${channel.error}` : channel.via)}"><b>${escapeHtml(channel.name)}</b> ${escapeHtml(Admin.statusLabel(channel))}</li>`).join('')}</ul>`
            : '';
        const thumb = post.thumb ? `<img src="${escapeHtml(post.thumb)}" alt="" width="72" height="90" loading="lazy">` : '<span class="hub-admin-thumb"></span>';
        const link = row.onHub ? `<a class="cv-btn" href="qa-review-social.html?p=${encodeURIComponent(post.id)}" target="_blank" rel="noopener">Open</a>` : '';
        return `<article class="hub-admin-row" data-id="${escapeHtml(row.id)}">${thumb}`
            + `<div class="hub-admin-main"><p class="hub-admin-meta">${tags}${row.date ? `<time datetime="${escapeHtml(row.date)}">${escapeHtml(row.date)}</time>` : ''}</p>`
            + `<h3>${escapeHtml(post.title)}</h3><p class="hub-admin-id">${escapeHtml(row.id)}</p>${channels}</div>`
            + `<div class="hub-admin-actions"><button type="button" class="cv-btn" data-act="edit" aria-expanded="false">Edit</button>${link}</div></article>`;
    }

    function baseCaptions(row) {
        return captions[row.id] || row.post.captions || {};
    }

    function editorHtml(row) {
        const base = baseCaptions(row);
        const own = row.edit.captions || {};
        const nets = row.post.kind ? Admin.NETS : [];
        const date = row.post.kind
            ? `<label class="filter-label">Date on the hub <input type="date" name="date" value="${escapeHtml(row.date)}" required></label>`
              + (row.item ? '' : '<button type="button" class="cv-btn" data-act="clear-date">Use the batch date</button>')
            : '';
        const fields = nets.map((net) => `<label class="filter-label">${NET_NAMES[net]}<textarea name="cap-${net}" rows="4" maxlength="5000">${escapeHtml(own[net] ?? base[net] ?? '')}</textarea></label>`).join('');
        return `<form class="hub-admin-edit">${date}`
            + `<label class="cv-check"><input type="checkbox" name="hidden"${row.hidden ? ' checked' : ''}> Hide from the hub</label>`
            + (fields ? `<div class="hub-admin-captions">${fields}</div><p class="cv-note">The hub's copy menu offers these captions. Posts Buffer or the Page already have queued keep their own text. Bluesky and Mastodon post the X caption.</p>` : '')
            + '<div class="hub-admin-buttons"><button type="submit" class="cv-btn">Save</button>'
            + (row.edited ? `<button type="button" class="cv-btn" data-act="${row.item ? 'remove' : 'reset'}">${row.item ? 'Remove the item' : 'Drop my edits'}</button>` : '')
            + '<button type="button" class="cv-btn" data-act="close">Close</button></div></form>';
    }

    function rowFor(id) {
        return rows().find((row) => row.id === id);
    }

    function openEditor(el) {
        const row = rowFor(el.dataset.id);
        if (!row) return;
        el.querySelector('.hub-admin-edit')?.remove();
        el.insertAdjacentHTML('beforeend', editorHtml(row));
        el.querySelector('[data-act="edit"]').setAttribute('aria-expanded', 'true');
    }

    function paint() {
        const all = rows();
        const q = $('hub-admin-q').value.trim().toLowerCase();
        const list = all.filter((row) => matches(row, q, $('hub-admin-kind').value, $('hub-admin-state').value));
        const waiting = all.filter((row) => row.pending).length;
        const edited = Object.keys(saved.edits).length + saved.items.filter((item) => !saved.edits[item.id]).length;
        $('hub-admin-status').textContent = `${feed.posts.length} posts on the hub, as of ${feed.asOf || 'an unknown day'}. ${edited} edited or added. `
            + (waiting ? `${waiting} wait for the next hub build.` : 'Every saved edit is on the hub.');
        $('hub-admin-count').textContent = `${list.length} of ${all.length} shown`;
        $('hub-admin-list').innerHTML = list.slice(0, shown).map(rowHtml).join('') || '<p class="cv-note">No posts match.</p>';
        $('hub-admin-more').hidden = list.length <= shown;
        const el = open && [...document.querySelectorAll('#hub-admin-list .hub-admin-row')].find((node) => node.dataset.id === open);
        if (el) openEditor(el);
        proposals.paint();
    }

    async function persist(next, done, after = 'The next daily hub build puts it on the public hub.') {
        if (!auth.currentUser) { message('Sign in before saving.', false); return false; }
        const state = Admin.clean(next);
        try {
            await setDoc(doc(db, 'socialHub', 'live'), { json: JSON.stringify(state), updatedAt: serverTimestamp() });
            saved = state;
            paint();
            message(`${done} ${after}`, true);
            return true;
        } catch (error) {
            console.error(error);
            message(hint(error), false);
            return false;
        }
    }

    function saveRow(id, form, clearDate) {
        const row = rowFor(id);
        if (!row) return;
        const next = Admin.clean(saved);
        const edit = Object.assign({}, next.edits[id]);
        const item = next.items.find((other) => other.id === id);
        const date = form.elements.date ? form.elements.date.value : '';
        if (item) {
            if (date) item.date = date;
        } else if (clearDate) {
            delete edit.date;
        } else if (date && (date !== row.post.date || edit.date)) {
            edit.date = date;
        }
        const base = baseCaptions(row);
        const own = Object.assign({}, edit.captions);
        Admin.NETS.forEach((net) => {
            const field = form.elements[`cap-${net}`];
            if (!field) return;
            const value = field.value.trim();
            if (value && (value !== String(base[net] || '').trim() || own[net])) own[net] = value;
            else delete own[net];
        });
        if (Object.keys(own).length) edit.captions = own;
        else delete edit.captions;
        if (form.elements.hidden.checked) edit.hidden = true;
        else delete edit.hidden;
        if (Object.keys(edit).length) next.edits[id] = edit;
        else delete next.edits[id];
        return persist(next, 'Saved.');
    }

    function addItem(form) {
        const field = (name) => form.elements[name].value.trim();
        if (field('url') && !/^https:\/\//.test(field('url'))) { message('The link must start with https://.', false); return; }
        if (field('youtube') && !Admin.videoId(field('youtube'))) { message('That is not a YouTube video link.', false); return; }
        const item = Admin.cleanItem({
            id: Admin.newId(field('title'), saved.items), title: field('title'), url: field('url'), image: field('image'),
            youtube: field('youtube'), lang: field('lang'), date: field('date'), text: field('text'), cat: field('cat')
        });
        if (!item) { message('An item needs a title, a date and an image: an https address or a committed file under assets/ or media/.', false); return; }
        const next = Admin.clean(saved);
        next.items.push(item);
        if (form.dataset.proposal) next.decisions = Object.assign({}, next.decisions, { [form.dataset.proposal]: 'approved' });
        return persist(next, form.dataset.proposal ? 'Approved and added.' : 'Added.').then((ok) => {
            if (!ok) return;
            form.reset();
            form.hidden = true;
            delete form.dataset.proposal;
        });
    }

    function openAdd(draft, proposal) {
        const form = $('hub-admin-add');
        form.reset();
        Object.entries(draft).forEach(([name, value]) => {
            if (form.elements[name]) form.elements[name].value = value;
        });
        form.dataset.proposal = proposal;
        form.hidden = false;
        form.scrollIntoView({ block: 'nearest' });
        form.elements.title.focus();
    }

    function bind() {
        ['hub-admin-q', 'hub-admin-kind', 'hub-admin-state'].forEach((id) => {
            $(id).addEventListener(id === 'hub-admin-q' ? 'input' : 'change', () => { shown = PAGE; paint(); });
        });
        $('hub-admin-more').addEventListener('click', () => { shown += PAGE; paint(); });
        $('hub-admin-add-open').addEventListener('click', () => {
            const form = $('hub-admin-add');
            if (form.dataset.proposal) form.reset();
            delete form.dataset.proposal;
            form.hidden = !form.hidden;
            if (!form.hidden && !form.elements.date.value) form.elements.date.value = new Date().toISOString().slice(0, 10);
        });
        $('hub-admin-add-cancel').addEventListener('click', () => {
            $('hub-admin-add').hidden = true;
            delete $('hub-admin-add').dataset.proposal;
        });
        proposals.bind();
        $('hub-admin-add').addEventListener('submit', (event) => { event.preventDefault(); addItem(event.target); });
        const list = $('hub-admin-list');
        list.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            const el = button && button.closest('.hub-admin-row');
            if (!el) return;
            const id = el.dataset.id;
            const act = button.dataset.act;
            if (act === 'edit') {
                open = id;
                openEditor(el);
            } else if (act === 'close') {
                open = '';
                el.querySelector('.hub-admin-edit')?.remove();
                el.querySelector('[data-act="edit"]').setAttribute('aria-expanded', 'false');
            } else if (act === 'clear-date') {
                saveRow(id, el.querySelector('.hub-admin-edit'), true);
            } else if (act === 'reset' || act === 'remove') {
                if (!confirm(act === 'remove' ? 'Remove this item from the hub?' : 'Drop your edits to this post?')) return;
                const next = Admin.clean(saved);
                delete next.edits[id];
                next.items = next.items.filter((item) => item.id !== id);
                open = '';
                persist(next, act === 'remove' ? 'Removed.' : 'Edits dropped.');
            }
        });
        list.addEventListener('submit', (event) => {
            event.preventDefault();
            const el = event.target.closest('.hub-admin-row');
            if (el) saveRow(el.dataset.id, event.target, false);
        });
    }

    return { bind, load };
}
