'use strict';

/* Security heads-up (#3992, languages #3996): one factual warning per domain when our own scan observed a
   compromise on a site, sent to its security or abuse contact. It is a warning, not a sales sequence: no price,
   no urgency, no upsell, no login links, and no second message about the same finding.

   This module is pure. `evaluate` decides whether a threat record may get a heads-up and to which address,
   and `draft` writes the message. NOTHING IN THIS FILE SENDS MAIL. The caller loads the opt-out set
   (url_review_owner_stops), the domain's last notice and the site's contacts, and a person reviews each draft
   before any sender exists. Owner notices (url-review-owner-notice.js) stay a separate flow. */

const ownerNotice = require('./url-review-owner-notice');

// Only signals that show the site itself is compromised, seen by our own scan.
// Breach news, vulnerability catalogues, DDoS trends, lookalike domains and blocklists are not included.
const SITE_KINDS = ['hacked-spam', 'defacement', 'phishing-host', 'malware-host', 'exposed-secret'];
const LEVELS = ['high', 'critical'];
const ROLES = ['site_hit', 'host_used'];
const FRESH_MS = 7 * 864e5;
// The same contact sources the owner notice ranks, minus marketing and sales pages.
const SECURITY_SOURCES = ['security.txt', 'rdap', 'dmarc', 'soa'];
// Abuse and security mailboxes only. Generic roles (info, admin, webmaster, it) are left out on purpose.
const SECURITY_ROLE = /^(security|abuse|csirt|cert|soc|noc|infosec)(\+[a-z0-9._-]*)?$/;
const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/;
// §7 UWG (Germany) and Austria need prior consent for advertising mail, even between businesses.
const CONSENT_TLDS = /\.(de|at)$/i;
const CONSENT_COUNTRIES = ['DE', 'AT'];

const REASONS = {
	kind: 'Not a compromise signal we send about.',
	role: 'The host is not the one the signal was seen on.',
	level: 'Below high severity.',
	confidence: 'Only seen in a third-party list; a person must confirm it on the site first.',
	stale: 'Last seen more than 7 days ago, or dated in the future.',
	'false-positive': 'Marked as a false positive.',
	'recently-notified': 'This domain got a heads-up or owner notice in the last 182 days.',
	stopped: 'This address or domain asked for no messages.',
	'needs-consent': 'Germany or Austria: advertising mail needs prior consent.',
	'no-security-contact':
		"No security or abuse address on the site's own domain; nothing goes to sales or marketing inboxes.",
	'bad-host': 'The host is not a plain domain name.',
	'unknown-history': 'No opt-out list or last-notice record was given; a person must check first.',
};

// Anything that looks like a credential, token, key or address is removed from the evidence before it is quoted.
// Each pattern is linear: no nested or overlapping quantifiers, so hostile page text cannot make the scrub slow.
const SECRET_PATTERNS = [
	/AKIA[0-9A-Z]{12,64}/g,
	/eyJ[A-Za-z0-9_.-]{4,400}/g,
	/\b(?:sk|pk|rk|ghp|gho|xox[bpas])[_-][A-Za-z0-9_-]{8,200}/g,
	/(?:key|token|secret|pass(?:word)?)=[^\s&]{1,200}/gi,
	/[A-Za-z0-9+/_-]{24,200}={0,2}/g,
	/[a-f0-9]{32,200}/gi,
];
const LOCAL_CHAR = /[A-Za-z0-9._%+-]/;
const DOMAIN_CHAR = /[A-Za-z0-9.-]/;

/* Copy per language. Placeholders: {host}, {day}, {what} (from PLAIN), {ev} (scrubbed evidence).
   Every language carries the same parts: one message, a free check list, a false-positive reply and a STOP reply.
   Native review is required before any send (#3996). */
const COPY = {
	en: {
		subject: 'Possible compromise seen on {host}',
		intro: 'Our scanner, QA-lab URL Review, looked at {host} on {day} and saw {what}.',
		once: 'We are writing once so your team can check it. It may be a false positive; if so, reply with the word FALSE POSITIVE and we will confirm and stop.',
		evidence: 'What we saw: {ev}.',
		secret: 'A key-like string appears in public page code. We have withheld the value.',
		checksTitle: 'How to check (about 10 minutes):',
		checks: [
			'Open the page in a private window and view the source for scripts, hidden frames or redirects you do not recognise.',
			'Search Google for site:{host} and look for pages you did not publish.',
			'Check your hosting control panel and recent file changes, including plugins and themes.',
			'Use your usual hosting or Search Console login to review any security warning. This message contains no login links.',
		],
		realIf:
			'If it is real: change hosting, admin and API passwords; remove unknown files; update the CMS and plugins; then ask your host or an incident responder for help.',
		final: 'We will not write to you again about this finding. To stop all messages from us, reply with the word STOP.',
		plain: {
			'hacked-spam': 'spam or hidden links injected into pages',
			defacement: 'pages that changed without authorization',
			'phishing-host': 'a page that looks like a login or payment form used to trick visitors',
			'malware-host': 'a page that serves malicious code to visitors',
			'exposed-secret': 'a key-like string visible in public page code',
		},
	},
	es: {
		subject: 'Posible compromiso detectado en {host}',
		intro: 'Nuestro escáner, QA-lab URL Review, revisó {host} el {day} y detectó {what}.',
		once: 'Escribimos una sola vez para que tu equipo lo pueda revisar. Podría ser un falso positivo; si es así, responde con la palabra FALSO POSITIVO y lo confirmaremos y dejaremos de escribir.',
		evidence: 'Lo que vimos: {ev}.',
		secret: 'Aparece una cadena con formato de clave en el código público de la página. Hemos omitido el valor.',
		checksTitle: 'Cómo comprobarlo (unos 10 minutos):',
		checks: [
			'Abre la página en una ventana privada y revisa el código fuente en busca de scripts, iframes ocultos o redirecciones que no reconozcas.',
			'Busca en Google site:{host} y revisa si hay páginas que no publicaste.',
			'Revisa el panel de tu hosting y los cambios recientes de archivos, incluidos plugins y temas.',
			'Usa tu acceso habitual al hosting o a Search Console para revisar cualquier aviso de seguridad. Este mensaje no contiene enlaces de acceso.',
		],
		realIf:
			'Si es real: cambia las contraseñas del hosting, del administrador y de las API; elimina los archivos desconocidos; actualiza el CMS y los plugins; y pide ayuda a tu proveedor o a un equipo de respuesta a incidentes.',
		final:
			'No volveremos a escribirte sobre este hallazgo. Para dejar de recibir cualquier mensaje nuestro, responde con la palabra STOP.',
		plain: {
			'hacked-spam': 'spam o enlaces ocultos inyectados en las páginas',
			defacement: 'páginas que cambiaron sin autorización',
			'phishing-host':
				'una página que parece un formulario de inicio de sesión o de pago para engañar a los visitantes',
			'malware-host': 'una página que sirve código malicioso a los visitantes',
			'exposed-secret': 'una cadena con formato de clave visible en el código público',
		},
	},
	pt: {
		subject: 'Possível comprometimento detectado em {host}',
		intro: 'Nosso scanner, QA-lab URL Review, analisou {host} em {day} e encontrou {what}.',
		once: 'Escrevemos uma única vez para que a sua equipe possa verificar. Pode ser um falso positivo; se for, responda com a palavra FALSO POSITIVO e confirmaremos e pararemos.',
		evidence: 'O que vimos: {ev}.',
		secret: 'Uma cadeia com formato de chave aparece no código público da página. Omitimos o valor.',
		checksTitle: 'Como verificar (cerca de 10 minutos):',
		checks: [
			'Abra a página em uma janela privada e veja o código-fonte à procura de scripts, iframes ocultos ou redirecionamentos que você não reconhece.',
			'Pesquise no Google site:{host} e veja se há páginas que você não publicou.',
			'Verifique o painel da sua hospedagem e as alterações recentes de arquivos, incluindo plugins e temas.',
			'Use o seu acesso habitual à hospedagem ou ao Search Console para revisar qualquer alerta de segurança. Esta mensagem não contém links de acesso.',
		],
		realIf:
			'Se for real: troque as senhas da hospedagem, do administrador e das APIs; remova arquivos desconhecidos; atualize o CMS e os plugins; e peça ajuda ao seu provedor ou a uma equipe de resposta a incidentes.',
		final:
			'Não voltaremos a escrever sobre este achado. Para parar todas as mensagens nossas, responda com a palavra STOP.',
		plain: {
			'hacked-spam': 'spam ou links ocultos inseridos nas páginas',
			defacement: 'páginas alteradas sem autorização',
			'phishing-host': 'uma página que parece um formulário de login ou pagamento para enganar visitantes',
			'malware-host': 'uma página que entrega código malicioso aos visitantes',
			'exposed-secret': 'uma cadeia com formato de chave visível no código público',
		},
	},
	de: {
		subject: 'Mögliche Kompromittierung auf {host} festgestellt',
		intro: 'Unser Scanner, QA-lab URL Review, hat {host} am {day} geprüft und {what} festgestellt.',
		once: 'Wir schreiben einmalig, damit Ihr Team es prüfen kann. Es kann auch ein Fehlalarm sein; in dem Fall antworten Sie mit dem Wort FEHLALARM, dann bestätigen wir das und schreiben nicht weiter.',
		evidence: 'Was wir gesehen haben: {ev}.',
		secret: 'Im öffentlichen Seitencode erscheint eine schlüsselähnliche Zeichenfolge. Den Wert haben wir weggelassen.',
		checksTitle: 'So können Sie es prüfen (ca. 10 Minuten):',
		checks: [
			'Öffnen Sie die Seite in einem privaten Fenster und prüfen Sie den Quelltext auf Skripte, versteckte Frames oder Weiterleitungen, die Sie nicht kennen.',
			'Suchen Sie bei Google nach site:{host} und prüfen Sie, ob Seiten darunter sind, die Sie nicht veröffentlicht haben.',
			'Prüfen Sie das Hosting-Kontrollpanel und die letzten Dateiänderungen, auch bei Plugins und Themes.',
			'Nutzen Sie Ihren üblichen Zugang zu Hosting oder Search Console, um eine Sicherheitswarnung zu prüfen. Diese Nachricht enthält keine Anmeldelinks.',
		],
		realIf:
			'Falls es echt ist: ändern Sie Passwörter für Hosting, Administration und APIs; entfernen Sie unbekannte Dateien; aktualisieren Sie CMS und Plugins; und holen Sie sich Hilfe bei Ihrem Hoster oder einem Incident-Response-Team.',
		final:
			'Wir schreiben Ihnen zu diesem Befund nicht noch einmal. Um alle Nachrichten von uns zu beenden, antworten Sie mit dem Wort STOP.',
		plain: {
			'hacked-spam': 'Spam oder versteckte Links, die in Seiten eingeschleust wurden',
			defacement: 'Seiten, die unautorisiert verändert wurden',
			'phishing-host': 'eine Seite, die wie ein Login- oder Zahlungsformular aussieht und Besucher täuscht',
			'malware-host': 'eine Seite, die Besuchern schädlichen Code ausliefert',
			'exposed-secret': 'eine schlüsselähnliche Zeichenfolge im öffentlichen Seitencode',
		},
	},
	fr: {
		subject: 'Compromission possible détectée sur {host}',
		intro: 'Notre scanner, QA-lab URL Review, a examiné {host} le {day} et constaté {what}.',
		once: "Nous écrivons une seule fois pour que votre équipe puisse vérifier. Il peut s'agir d'un faux positif ; si c'est le cas, répondez avec le mot FAUX POSITIF et nous confirmerons et n'écrirons plus.",
		evidence: 'Ce que nous avons vu : {ev}.',
		secret: 'Une chaîne ressemblant à une clé apparaît dans le code public de la page. Nous avons omis la valeur.',
		checksTitle: 'Comment vérifier (environ 10 minutes) :',
		checks: [
			'Ouvrez la page dans une fenêtre privée et consultez le code source pour détecter des scripts, des cadres cachés ou des redirections que vous ne reconnaissez pas.',
			"Recherchez site:{host} sur Google et vérifiez si des pages que vous n'avez pas publiées apparaissent.",
			'Vérifiez le panneau de votre hébergeur et les modifications récentes de fichiers, y compris les extensions et thèmes.',
			"Utilisez votre accès habituel à l'hébergement ou à Search Console pour examiner tout avertissement de sécurité. Ce message ne contient aucun lien de connexion.",
		],
		realIf:
			"Si c'est réel : changez les mots de passe de l'hébergement, de l'administration et des API ; supprimez les fichiers inconnus ; mettez à jour le CMS et les extensions ; et demandez de l'aide à votre hébergeur ou à une équipe de réponse aux incidents.",
		final:
			'Nous ne vous écrirons plus à ce sujet. Pour arrêter tous les messages de notre part, répondez avec le mot STOP.',
		plain: {
			'hacked-spam': 'du spam ou des liens cachés injectés dans les pages',
			defacement: 'des pages modifiées sans autorisation',
			'phishing-host': 'une page qui ressemble à un formulaire de connexion ou de paiement pour tromper les visiteurs',
			'malware-host': 'une page qui sert du code malveillant aux visiteurs',
			'exposed-secret': 'une chaîne ressemblant à une clé visible dans le code public',
		},
	},
	it: {
		subject: 'Possibile compromissione rilevata su {host}',
		intro: 'Il nostro scanner, QA-lab URL Review, ha verificato {host} il {day} e ha rilevato {what}.',
		once: 'Scriviamo una sola volta, così il vostro team può verificare. Potrebbe trattarsi di un falso positivo; in quel caso rispondete con la parola FALSO POSITIVO e confermeremo e non scriveremo più.',
		evidence: 'Cosa abbiamo visto: {ev}.',
		secret: 'Nel codice pubblico della pagina compare una stringa simile a una chiave. Abbiamo omesso il valore.',
		checksTitle: 'Come verificare (circa 10 minuti):',
		checks: [
			'Apri la pagina in una finestra privata e controlla il codice sorgente per script, frame nascosti o reindirizzamenti che non riconosci.',
			'Cerca su Google site:{host} e controlla se ci sono pagine che non hai pubblicato.',
			'Controlla il pannello del tuo hosting e le modifiche recenti ai file, inclusi plugin e temi.',
			'Usa il tuo accesso abituale a hosting o Search Console per esaminare eventuali avvisi di sicurezza. Questo messaggio non contiene link di accesso.',
		],
		realIf:
			'Se è reale: cambia le password di hosting, amministrazione e API; rimuovi i file sconosciuti; aggiorna CMS e plugin; e chiedi aiuto al tuo provider o a un team di risposta agli incidenti.',
		final:
			'Non scriveremo più su questo rilievo. Per interrompere tutti i messaggi da parte nostra, rispondete con la parola STOP.',
		plain: {
			'hacked-spam': 'spam o link nascosti inseriti nelle pagine',
			defacement: 'pagine modificate senza autorizzazione',
			'phishing-host': 'una pagina che sembra un modulo di accesso o pagamento per ingannare i visitatori',
			'malware-host': 'una pagina che distribuisce codice dannoso ai visitatori',
			'exposed-secret': 'una stringa simile a una chiave visibile nel codice pubblico',
		},
	},
};

const LANGS = Object.keys(COPY);

// Same result as text.replace(/<[^>]{0,120}>/g, ' ') (#3965): each "<" closes at the first ">" after it, and only when
// no more than 120 characters lie between; the scan jumps straight to the first "<" that is close enough.
function blankTags(text) {
	let out = '';
	let kept = 0;
	for (let open = text.indexOf('<'); open >= 0; ) {
		const close = text.indexOf('>', open + 1);
		if (close < 0) break;
		const start = close - open > 121 ? text.indexOf('<', close - 121) : open;
		if (start >= 0 && start < close) {
			out += text.slice(kept, start) + ' ';
			kept = close + 1;
		}
		open = text.indexOf('<', close + 1);
	}
	return out + text.slice(kept);
}

// Same result as text.replace(/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}/g, '[removed]') as a scan (#3965): recheck
// cannot settle those bounded repeats. Each address keeps at most 64 characters before "@" and 253 after it, and the
// next one starts after the last one ends.
function scrubAddresses(text) {
	let out = '';
	let kept = 0;
	for (let at = text.indexOf('@'); at >= 0; at = text.indexOf('@', at + 1)) {
		if (at <= kept || !LOCAL_CHAR.test(text[at - 1]) || !DOMAIN_CHAR.test(text[at + 1] || '')) continue;
		let start = at - 1;
		while (start > kept && at - start < 64 && LOCAL_CHAR.test(text[start - 1])) start -= 1;
		let end = at + 1;
		while (end < text.length && end - at <= 253 && DOMAIN_CHAR.test(text[end])) end += 1;
		out += text.slice(kept, start) + '[removed]';
		kept = end;
		at = end - 1;
	}
	return out + text.slice(kept);
}

function scrub(value) {
	let text = blankTags(String(value == null ? '' : value))
		.replace(/https?:\/\/\S+/gi, '[link removed]')
		.replace(/\s+/g, ' ')
		.trim();
	SECRET_PATTERNS.forEach((pattern) => {
		text = text.replace(pattern, '[removed]');
	});
	text = scrubAddresses(text);
	return text.length > 200 ? text.slice(0, 199) + '…' : text;
}

function reasonsFor(threat, ctx) {
	const row = threat || {};
	const opts = ctx || {};
	const now = opts.now || Date.now();
	const out = [];
	const host = String(row.host || '')
		.toLowerCase()
		.replace(/\.$/, '');
	if (!HOST.test(host)) out.push('bad-host');
	if (SITE_KINDS.indexOf(row.kind) === -1) out.push('kind');
	if (ROLES.indexOf(row.role) === -1) out.push('role');
	if (LEVELS.indexOf(row.level) === -1) out.push('level');
	if (row.confidence !== 'observed') out.push('confidence');
	if (row.delist_status === 'false_positive') out.push('false-positive');
	const seen = Date.parse(row.last_seen || row.observed_at || '') || 0;
	if (!seen || now - seen > FRESH_MS || seen > now + 3600e3) out.push('stale');

	const domain = host ? ownerNotice.domainOf(host) : '';
	if (!(opts.stopped instanceof Set) || opts.lastNoticeAt === undefined) out.push('unknown-history');
	const stopped = opts.stopped instanceof Set ? opts.stopped : new Set();
	if (stopped.has('@' + domain) || (opts.contact && stopped.has(String(opts.contact).toLowerCase())))
		out.push('stopped');
	if (CONSENT_TLDS.test(host) || CONSENT_COUNTRIES.indexOf(String(row.company_country || '').toUpperCase()) !== -1) {
		out.push('needs-consent');
	}
	if (opts.lastNoticeAt) {
		const at = Date.parse(opts.lastNoticeAt) || 0;
		if (!at || now - at < ownerNotice.QUIET_MS) out.push('recently-notified');
	}
	return out;
}

// The best security or abuse address on the site's own domain, or null.
function securityContact(host, found) {
	const ranked = ownerNotice.rankContacts(found || [], host);
	const hit = ranked.find(
		(row) =>
			row.onDomain &&
			row.sources.some((source) => SECURITY_SOURCES.indexOf(source) !== -1) &&
			SECURITY_ROLE.test(row.email.split('@')[0])
	);
	return hit ? hit.email : null;
}

/* threat: a url_review_threats record. ctx: { now, found: contact rows [{email, source, url}], stopped: Set of
   emails and "@domain" keys, lastNoticeAt: ISO time of the domain's last heads-up or owner notice, or null when
   it has none }. Returns { decision: "draft" | "hold", reasons: [code], contact: email | null }. */
function evaluate(threat, ctx) {
	const opts = ctx || {};
	const contact = securityContact(
		String((threat && threat.host) || '')
			.toLowerCase()
			.replace(/\.$/, ''),
		opts.found
	);
	const reasons = reasonsFor(threat, Object.assign({}, opts, { contact: contact }));
	if (!contact) reasons.push('no-security-contact');
	return { decision: reasons.length ? 'hold' : 'draft', reasons: reasons, contact: contact };
}

function day(iso) {
	const ms = Date.parse(iso || '');
	return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : 'an unknown date';
}

function fill(text, vars) {
	return String(text).replace(/\{(host|day|what|ev)\}/g, (match, key) => vars[key]);
}

/* Writes the heads-up for a threat. The gate is always re-run here; a caller cannot pass a stale result.
   ctx: as evaluate, plus sender: { name, postalAddress, website } (postalAddress is required before any send),
   and lang: one of LANGS (unknown or missing falls back to English; the caller passes the site's language).
   Returns { to, subject, text, lang }. Throws when the threat does not pass the gate, so no draft skips it. */
function draft(threat, ctx) {
	const opts = ctx || {};
	const result = evaluate(threat, opts);
	if (result.decision !== 'draft' || !result.contact) throw new Error('heads-up: threat did not pass the gate');
	const sender = opts.sender || {};
	if (!sender.name || !sender.postalAddress || !sender.website) {
		throw new Error('heads-up: sender name, postal address and website are required');
	}
	const lang = LANGS.indexOf(opts.lang) === -1 ? 'en' : opts.lang;
	const c = COPY[lang];
	const host = String(threat.host).toLowerCase().replace(/\.$/, '');
	const vars = {
		host: host,
		day: day(threat.last_seen || threat.observed_at),
		what: c.plain[threat.kind],
		ev: scrub(threat.evidence) || (lang === 'en' ? 'see the page source' : 'ver el código fuente'),
	};
	const evidence = threat.kind === 'exposed-secret' ? c.secret : fill(c.evidence, vars);
	const text = [
		'Hello,',
		'',
		fill(c.intro, vars),
		fill(c.once, vars),
		'',
		evidence,
		'',
		c.checksTitle,
		...c.checks.map((line, i) => i + 1 + '. ' + fill(line, vars)),
		'',
		c.realIf,
		'',
		c.final,
		'',
		sender.name,
		sender.postalAddress,
		sender.website,
	].join('\n');
	return { to: result.contact, subject: fill(c.subject, vars), text: text, lang: lang };
}

module.exports = {
	blankTags,
	scrubAddresses,
	SITE_KINDS,
	LEVELS,
	ROLES,
	SECURITY_SOURCES,
	LANGS,
	REASONS,
	COPY,
	evaluate,
	draft,
	securityContact,
	reasonsFor,
	scrub,
};
