'use strict';
/*
 * After a Mac join of a field Telegram group (#4468), try to add @qalab_live_bot when the session can; otherwise queue a
 * short admin ask for Carlos in Jarvis. Bots cannot self-join.
 */
const E = require('./engagement');

const CAMPAIGN = 'telegram-bot-add';
const OWN = 'qalab_live';
const TTL = E.REPLY_TTL;
const COPY = {
	en: 'Hi — could you add @{bot} to this chat (member or admin) so our QA-lab bot can help with URL reviews here? Thanks!',
	es: 'Hola — ¿pueden agregar a @{bot} a este chat (miembro o admin) para que nuestro bot de QA-lab ayude con revisiones de URL aquí? Gracias.',
	pt: 'Olá — podem adicionar @{bot} a este chat (membro ou admin) para o nosso bot QA-lab ajudar com revisões de URL aqui? Obrigado.',
	de: 'Hallo — könnt ihr @{bot} zu diesem Chat hinzufügen (Mitglied oder Admin), damit unser QA-lab-Bot hier bei URL-Reviews hilft? Danke!',
	fr: 'Bonjour — pouvez-vous ajouter @{bot} à ce chat (membre ou admin) pour que notre bot QA-lab aide aux revues d’URL ici ? Merci.',
	it: 'Ciao — potete aggiungere @{bot} a questa chat (membro o admin) così il nostro bot QA-lab aiuta con le revisioni URL qui? Grazie!',
};

const clip = (v, n) =>
	String(v == null ? '' : v)
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, n);

/** Our bot username without @ (TELEGRAM_BOT, default qalab_live_bot). */
function botUser(env) {
	return String((env || process.env).TELEGRAM_BOT || 'qalab_live_bot')
		.replace(/^@/, '')
		.toLowerCase();
}

/** Whether a join should try to add the bot (not our own channel). */
function shouldAddBot(groupId, bot) {
	const id = String(groupId || '')
		.replace(/^@/, '')
		.toLowerCase();
	const b = String(bot || '')
		.replace(/^@/, '')
		.toLowerCase();
	if (!id || !b || id === OWN || id === b) return false;
	return true;
}

/** Normalize what the Mac reported after join into botAdd on the join log. */
function botAddStatus(body) {
	const raw = clip((body || {}).botAdd, 40);
	if (raw) return raw;
	if ((body || {}).botError) return 'failed';
	return '';
}

const pickLang = (v) => {
	const lang = String(v || '')
		.toLowerCase()
		.slice(0, 2);
	return E.LANGS.includes(lang) ? lang : 'en';
};

/** Short message for group admins, in the join's language. */
function adminAskDraft(join, bot) {
	const lang = pickLang((join || {}).lang);
	const text = (COPY[lang] || COPY.en).replace(/\{bot\}/g, String(bot || botUser()).replace(/^@/, ''));
	const name = clip((join || {}).name, 80);
	return name ? '“' + name + '” (@' + join.id + '): ' + text : text;
}

/** The engagement_posts document: a reply waiting for Carlos, sent with say in the group once approved. */
function adminAskDoc(join, joinKey, draft, now) {
	const id = String(join.id) + '/bot-ask';
	const post = {
		network: 'telegram',
		id,
		thread: id,
		url: clip(join.url, 500) || 'https://t.me/' + join.id,
		author: { handle: join.id, name: clip(join.name, 120) || join.id },
		text: '',
		lang: pickLang(join.lang),
		via: 'mac',
		topic: 'Joins',
		topics: ['Joins'],
	};
	const decision = {
		verdict: 'engage',
		skip: '',
		actions: {
			reply: {
				status: 'waiting',
				kind: CAMPAIGN,
				draft: clip(draft, 500),
				lang: post.lang,
				expiresAt: new Date(now + TTL).toISOString(),
			},
		},
	};
	return Object.assign(E.postDoc(post, { lang: post.lang, about: 'Ask admins to add the QA-lab bot' }, decision, now), {
		campaign: CAMPAIGN,
		join: { key: joinKey, id: join.id, name: clip(join.name, 120), url: post.url, kind: join.kind || '' },
	});
}

/**
 * Queue one admin ask per joined group when the Mac lacked rights. Idempotent: skips when a draft already exists or
 * botAskAt is set on the join.
 */
async function queueAdminAsk(deps, join, joinKey) {
	const { db, now, env } = deps;
	if (!join || join.network !== 'telegram' || join.botAskAt) return { queued: false };
	const askId = String(join.id) + '/bot-ask';
	const postKey = E.keyOf('telegram', askId);
	const ref = db.collection('engagement_posts').doc(postKey);
	if ((await ref.get()).exists) return { queued: false, key: postKey };
	const bot = botUser(env);
	const draft = adminAskDraft(join, bot);
	await ref.set(adminAskDoc(join, joinKey, draft, now));
	await db
		.collection('engagement_joins')
		.doc(joinKey)
		.set({ botAskAt: new Date(now).toISOString(), botAdd: 'needs_admin' }, { merge: true });
	return { queued: true, key: postKey };
}

module.exports = {
	CAMPAIGN,
	OWN,
	botUser,
	shouldAddBot,
	botAddStatus,
	adminAskDraft,
	adminAskDoc,
	queueAdminAsk,
};