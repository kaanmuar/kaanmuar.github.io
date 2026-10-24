/* Proposals from the field sweep (scripts/field-sweep.js writes assets/social/proposals.json each day) in the
   Social hub pane. Approve fills in Add an item; the item and the decision save together when it is added.
   Dismiss saves the decision alone, so the sweep leaves that address out from then on. */
const PAGE = 10;

export function createProposals(deps) {
    const { Admin, $, escapeHtml, state, persist, openAdd } = deps;
    let proposals = [];
    let built = '';
    let shown = PAGE;

    function load(json) {
        proposals = (json && Array.isArray(json.proposals)) ? json.proposals : [];
        built = (json && json.built) || '';
    }

    function rowHtml(proposal) {
        const tags = [proposal.topic, proposal.source].filter(Boolean).map((tag) => `<span class="hub-admin-tag">${escapeHtml(tag)}</span>`).join('');
        const thumb = Admin.remote(proposal.image) ? `<img src="${escapeHtml(proposal.image)}" alt="" width="72" height="90" loading="lazy" referrerpolicy="no-referrer">` : '<span class="hub-admin-thumb"></span>';
        const link = /^https:\/\//.test(proposal.url || '') ? `<a href="${escapeHtml(proposal.url)}" target="_blank" rel="noopener nofollow">${escapeHtml(proposal.title)}</a>` : escapeHtml(proposal.title);
        const credit = [proposal.author && `by ${proposal.author}`, proposal.why].filter(Boolean).join(' · ');
        return `<article class="hub-admin-row hub-proposal" data-id="${escapeHtml(proposal.id)}">${thumb}`
            + `<div class="hub-admin-main"><p class="hub-admin-meta">${tags}${proposal.date ? `<time datetime="${escapeHtml(proposal.date)}">${escapeHtml(proposal.date)}</time>` : ''}</p>`
            + `<h3>${link}</h3>${credit ? `<p class="hub-admin-id">${escapeHtml(credit)}</p>` : ''}`
            + `${proposal.summary ? `<p class="hub-proposal-summary">${escapeHtml(proposal.summary)}</p>` : ''}</div>`
            + '<div class="hub-admin-actions"><button type="button" class="cv-btn" data-act="approve">Approve</button><button type="button" class="cv-btn" data-act="dismiss">Dismiss</button></div></article>';
    }

    function paint() {
        const waiting = Admin.pendingProposals(proposals, state());
        const when = built ? built.slice(0, 10) : 'not yet';
        $('hub-proposals-count').textContent = waiting.length
            ? `${waiting.length} waiting for a decision, best first. Last sweep: ${when}.`
            : `Nothing waiting. Last sweep: ${when}.`;
        $('hub-proposals-list').innerHTML = waiting.slice(0, shown).map(rowHtml).join('');
        $('hub-proposals-more').hidden = waiting.length <= shown;
    }

    function dismiss(id) {
        const next = Admin.clean(state());
        next.decisions = Object.assign({}, next.decisions, { [id]: 'dismissed' });
        return persist(next, 'Dismissed.', 'The sweep will not propose it again.');
    }

    function bind() {
        $('hub-proposals-list').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            const el = button && button.closest('.hub-proposal');
            const proposal = el && proposals.find((other) => other.id === el.dataset.id);
            if (!proposal) return;
            if (button.dataset.act === 'approve') openAdd(Admin.proposalDraft(proposal, new Date().toISOString().slice(0, 10)), proposal.id);
            else if (button.dataset.act === 'dismiss') dismiss(proposal.id);
        });
        $('hub-proposals-more').addEventListener('click', () => { shown += PAGE; paint(); });
    }

    return { load, paint, bind };
}
