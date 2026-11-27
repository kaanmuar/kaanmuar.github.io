'use strict';
/*
 * Jarvis monitor for Telegram soft-invites (#4467/#4481) and field bot-add (#4468): quality, funnel and advance.
 */
const Invites = require('./telegram-invites');
const JoinBot = require('./telegram-join-bot');

const DAY = 864e5;

const clip = (v, n) =>
	String(v == null ? '' : v)
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, n);

const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);

/** Reply status buckets for a campaign. */
function tallyCampaign(docs, campaign) {
	const out = { waiting: 0, approved: 0, posted: 0, failed: 0, dismissed: 0, total: 0 };
	(docs || []).forEach((d) => {
		if ((d.campaign || '') !== campaign) return;
		out.total += 1;
		const st = ((d.actions || {}).reply || {}).status || '';
		if (st === 'waiting') out.waiting += 1;
		else if (st === 'approved' || st === 'copy') out.approved += 1;
		else if (st === 'posted' || st === 'replied') out.posted += 1;
		else if (st === 'failed' || st === 'missed') out.failed += 1;
		else if (st === 'dismissed') out.dismissed += 1;
	});
	return out;
}

/** botAdd outcomes from Telegram join log rows. */
function tallyBotAdd(joinLog) {
	const out = { added: 0, already: 0, needs_admin: 0, failed: 0, skipped: 0, total: 0 };
	(joinLog || [])
		.filter((j) => j.network === 'telegram')
		.forEach((j) => {
			const s = String(j.botAdd || '').trim();
			if (!s) return;
			out.total += 1;
			if (out[s] !== undefined) out[s] += 1;
			else out.failed += 1;
		});
	return out;
}

/** Advance vs a prior window: +1 improving, 0 flat, -1 slipping. */
function advanceOf(cur, prev) {
	const score = (x) => num(x.posted) * 3 + num(x.approved) + num(x.added) * 2 - num(x.failed) * 2 - num(x.needs_admin);
	const a = score(cur);
	const b = score(prev);
	if (a > b) return 1;
	if (a < b) return -1;
	return 0;
}

/**
 * Quality flags and needs for Carlos. cred: engagement_private/telegram; invite/bot tallies; last scout telegramInvites.
 */
function quality(cred, invites, botAdd, lastTg) {
	const flags = [];
	const needs = [];
	const c = cred || {};
	if (!c.token) {
		flags.push({ id: 'no-token', level: 'bad', text: 'Telegram bot not connected' });
		needs.push('Telegram: connect the bot under Engagement > Accounts.');
	} else if (!c.group) {
		flags.push({ id: 'no-group', level: 'bad', text: 'Channel has no discussion group' });
		needs.push('Telegram: add a discussion group to @qalab_live and make the bot an admin.');
	} else if (!c.admin) {
		flags.push({ id: 'not-admin', level: 'warn', text: 'Bot is not admin of the discussion group' });
		needs.push('Telegram: make @' + clip(String(c.handle || 'qalab_live_bot').replace(/^@/, ''), 40) + ' an admin of the discussion group.');
	} else if (!c.groupInviteLink) {
		flags.push({ id: 'no-invite-link', level: 'warn', text: 'No discussion-group invite link yet' });
		needs.push('Telegram: reconnect the bot so Jarvis stores a discussion-group invite link for soft invites.');
	} else {
		flags.push({ id: 'invite-link', level: 'ok', text: 'Discussion invite ready' });
	}
	if (c.error) {
		flags.push({ id: 'cred-error', level: 'warn', text: clip(c.error, 120) });
		needs.push('Telegram: ' + clip(c.error, 160));
	}
	if (lastTg && lastTg.error) {
		flags.push({ id: 'scout-error', level: 'warn', text: 'Last scout: ' + clip(lastTg.error, 100) });
		needs.push('Telegram soft-invites: last scout said ' + clip(lastTg.error, 140));
	}
	if (invites.waiting > 8) {
		flags.push({ id: 'invite-backlog', level: 'warn', text: invites.waiting + ' soft-invites waiting approval' });
		needs.push('Telegram: ' + invites.waiting + ' soft-invites wait in Engagement — approve, edit or dismiss.');
	}
	if (invites.failed > 0 && invites.posted === 0 && invites.total >= 3) {
		flags.push({ id: 'invite-fail', level: 'bad', text: invites.failed + ' soft-invite deliveries failed, none posted' });
		needs.push('Telegram: soft-invite delivery is failing — check Mac WebK and handle privacy.');
	}
	if (botAdd.needs_admin > 0 && botAdd.added + botAdd.already === 0 && botAdd.total >= 2) {
		flags.push({
			id: 'bot-add-stuck',
			level: 'warn',
			text: botAdd.needs_admin + ' joins need admins to add the bot',
		});
		needs.push('Telegram: ' + botAdd.needs_admin + ' field groups need an admin ask approved (or rights to add the bot).');
	}
	if (botAdd.added + botAdd.already > 0) {
		flags.push({
			id: 'bot-add-ok',
			level: 'ok',
			text: botAdd.added + botAdd.already + ' field chats have the bot',
		});
	}
	return { flags, needs: [...new Set(needs)].slice(0, 8) };
}

/**
 * Full monitor payload for Jarvis Engagement.
 * deps: { db, now }; posts: engagement post docs (waiting+approved mixes); joinsLog from Joins.summary; lastRun from scout.
 */
async function summary(deps, posts, joinsLog, lastRun) {
	const { db, now } = deps;
	const snap = await db.collection('engagement_private').doc('telegram').get();
	const cred = snap.exists ? snap.data() || {} : {};
	const invite = tallyCampaign(posts, Invites.CAMPAIGN);
	const botAsk = tallyCampaign(posts, JoinBot.CAMPAIGN);
	const botAdd = tallyBotAdd(joinsLog);
	const lastTg = (lastRun && lastRun.telegramInvites) || {};
	const q = quality(cred, invite, botAdd, lastTg);

	let cadence = 0;
	try {
		const cad = await db.collection(Invites.COLLECTION).limit(200).get();
		cadence = cad.size;
	} catch (error) {
		/* collection may be empty / missing index */
	}

	const cur = {
		posted: invite.posted + botAsk.posted,
		approved: invite.approved + botAsk.approved,
		added: botAdd.added + botAdd.already,
		failed: invite.failed + botAdd.failed,
		needs_admin: botAdd.needs_admin,
	};
	// Prior window approx: lastRun only; advance uses scout queued vs posted backlog pressure.
	const prev = {
		posted: Math.max(0, cur.posted - num(lastTg.queued)),
		approved: cur.approved,
		added: cur.added,
		failed: cur.failed,
		needs_admin: botAdd.needs_admin,
	};
	const advance = advanceOf(cur, prev);

	return {
		ok: !q.flags.some((f) => f.level === 'bad'),
		connected: !!cred.token,
		channel: clip(cred.channel, 64),
		groupTitle: clip(cred.groupTitle, 120),
		groupInviteLink: clip(cred.groupInviteLink, 200),
		admin: !!cred.admin,
		credError: clip(cred.error, 200),
		invites: invite,
		botAsk,
		botAdd,
		cadence,
		lastScout: {
			candidates: num(lastTg.candidates),
			queued: num(lastTg.queued),
			skipped: num(lastTg.skipped),
			error: clip(lastTg.error, 200),
			at: lastRun && lastRun.at ? lastRun.at : '',
		},
		advance,
		advanceLabel: advance > 0 ? 'advancing' : advance < 0 ? 'slipping' : 'steady',
		flags: q.flags,
		needs: q.needs,
		at: new Date(now).toISOString(),
	};
}

module.exports = {
	tallyCampaign,
	tallyBotAdd,
	advanceOf,
	quality,
	summary,
	DAY,
};
