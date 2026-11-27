'use strict';
/*
 * Soft invites into our @qalab_live discussion group (#4467).
 * Live reports that name a public Telegram handle get one Jarvis draft (campaign telegram-group-invite) with our
 * group invite link. The bot cannot force-add or cold-DM; Carlos approves, then Mac/outreach can deliver.
 *
 *   engagement_private/telegram.groupInviteLink   reusable createChatInviteLink
 *   engagement_posts/<key>                        waiting draft (campaign telegram-group-invite)
 *   engagement_telegram_invites/<handle>          cadence: last invitedAt
 */
const E = require('./engagement');
const Handles = require('./telegram-handles');

const CAMPAIGN = 'telegram-group-invite';
const COLLECTION = 'engagement_telegram_invites';
const GAP_DAYS = 30;
const OWN = ['qalab_live', 'qalab_live_bot'];
const LINK_NAME = 'QA-lab live community';
const TTL = E.REPLY_TTL;

const clip = (v, n) =>
	String(v == null ? '' : v)
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, n);

const ownHandle = (h) => OWN.includes(String(h || '').replace(/^@/, '').toLowerCase());

/** Reports that carry at least one public Telegram handle worth inviting (not our own). */
function candidatesFromReports(reports) {
	const byHandle = new Map();
	(Array.isArray(reports) ? reports : []).forEach((r) => {
		Handles.fromReport(r).forEach((t) => {
			if (ownHandle(t.handle)) return;
			const prev = byHandle.get(t.handle);
			if (prev) return;
			byHandle.set(t.handle, {
				handle: t.handle,
				url: t.url,
				kind: t.kind,
				reportId: clip(r.id, 80),
				host: clip(r.host, 120),
				name: clip(r.name || r.host, 120),
			});
		});
	});
	return [...byHandle.values()];
}

/** Draft Carlos approves: soft invite with the discussion-group link. */
function inviteDraft(candidate, inviteLink) {
	const who = clip(candidate.name || candidate.host, 80);
	const handle = '@' + candidate.handle;
	const link = clip(inviteLink, 200);
	return (
		'Hi ' +
		handle +
		' — we published a free public URL review of ' +
		who +
		' in QA-lab Live Reports. You are welcome in our discussion group: ' +
		link +
		' (or open https://t.me/qalab_live).'
	);
}

function inviteDoc(candidate, inviteLink, now) {
	const id = candidate.handle + '/group-invite';
	const post = {
		network: 'telegram',
		id,
		thread: id,
		url: candidate.url || 'https://t.me/' + candidate.handle,
		author: { handle: candidate.handle, name: clip(candidate.name, 120) || candidate.handle },
		text: '',
		lang: 'en',
		via: 'live-reports',
		topic: 'Live reports',
		topics: ['Live reports'],
	};
	const draft = inviteDraft(candidate, inviteLink);
	const decision = {
		verdict: 'engage',
		skip: '',
		actions: {
			reply: {
				status: 'waiting',
				kind: CAMPAIGN,
				draft: clip(draft, 800),
				lang: 'en',
				expiresAt: new Date(now + TTL).toISOString(),
			},
		},
	};
	return Object.assign(E.postDoc(post, { lang: 'en', about: 'Invite to our Telegram discussion group' }, decision, now), {
		campaign: CAMPAIGN,
		telegramInvite: {
			handle: candidate.handle,
			reportId: candidate.reportId || '',
			host: candidate.host || '',
			inviteLink: clip(inviteLink, 200),
		},
	});
}

/**
 * Ensure engagement_private/telegram has a reusable discussion-group invite link.
 * tg is createApi(token)(...); saved is the private doc fields (group, groupInviteLink, …).
 */
async function ensureGroupInviteLink(tg, saved) {
	const group = saved && saved.group;
	if (!group) return { link: '', error: 'no discussion group' };
	const existing = clip(saved.groupInviteLink, 200);
	if (existing && /^https:\/\/t\.me\//i.test(existing)) return { link: existing, reused: true };
	const result = await tg('createChatInviteLink', {
		chat_id: group,
		name: LINK_NAME,
		creates_join_request: false,
	});
	const link = clip(result && result.invite_link, 200);
	if (!link) return { link: '', error: 'empty invite_link' };
	return { link, reused: false, raw: result };
}

/** Whether cadence allows inviting this handle again. */
function due(snap, now) {
	if (!snap || !snap.exists) return true;
	const at = Date.parse((snap.data() || {}).invitedAt || '');
	return !Number.isFinite(at) || now - at >= GAP_DAYS * 864e5;
}

/**
 * Queue Jarvis soft invites for live-report Telegram handles. Idempotent per handle within GAP_DAYS.
 * deps: { db, now, env? }; inviteLink required.
 */
async function queueInvites(deps, reports, inviteLink) {
	const { db, now } = deps;
	const link = clip(inviteLink, 200);
	const out = { candidates: 0, queued: 0, skipped: 0, errors: [] };
	if (!link || !/^https:\/\/t\.me\//i.test(link)) {
		out.errors.push('missing invite link');
		return out;
	}
	const list = candidatesFromReports(reports);
	out.candidates = list.length;
	for (const c of list) {
		const cadence = db.collection(COLLECTION).doc(c.handle);
		const postKey = E.keyOf('telegram', c.handle + '/group-invite');
		const postRef = db.collection('engagement_posts').doc(postKey);
		try {
			const [cadenceSnap, postSnap] = await Promise.all([cadence.get(), postRef.get()]);
			if (!due(cadenceSnap, now)) {
				out.skipped += 1;
				continue;
			}
			if (postSnap.exists) {
				const st = ((postSnap.data() || {}).actions || {}).reply || {};
				if (['waiting', 'approved', 'posted'].includes(st.status)) {
					out.skipped += 1;
					continue;
				}
			}
			await postRef.set(inviteDoc(c, link, now));
			await cadence.set(
				{
					handle: c.handle,
					url: c.url,
					host: c.host || '',
					reportId: c.reportId || '',
					invitedAt: new Date(now).toISOString(),
					inviteLink: link,
				},
				{ merge: true }
			);
			out.queued += 1;
		} catch (error) {
			out.errors.push(c.handle + ': ' + (error.message || error));
		}
	}
	return out;
}

module.exports = {
	CAMPAIGN,
	COLLECTION,
	GAP_DAYS,
	OWN,
	candidatesFromReports,
	inviteDraft,
	inviteDoc,
	ensureGroupInviteLink,
	due,
	queueInvites,
};
