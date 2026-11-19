'use strict';
/* The look of a booked call (#3867), in the visitor's language: the confirmation and reminder mail, the .ics and
   add-to-calendar links, and the branded text of the Google Calendar event.

   Three looks, by the kind of call (the site the visitor came from):
     review  (intro, walkthrough)  QA-lab URL Review: the Fusion night band, the face address of the language
     cv      (cv)                  the Interactive CV: teal band, serif title
     general (call)                Carlos's plain look: ink band, teal accent
   Google keeps sending its own invite (RSVP and reminders stay synced); this mail sits beside it. */

const fusion = require('./url-review-fusion');
const mailFace = require('./mail-face');
const { escapeHtml: esc } = require('./owner-mail');

const SITE = 'https://carlosandmunoz.com';
const TZ = 'America/Bogota';
const REPLY_TO = 'qa@carlosandmunoz.com';
const LANGS = ['en', 'es', 'pt', 'de', 'fr', 'it'];
const HOUR = 3600000;
const booking = () => require('./booking');

const LOOKS = {
	review: {
		eyebrow: 'QA-lab URL Review',
		accent: fusion.TEXT.link,
		soft: '#f3f8f8',
		line: fusion.LINE,
		color: '#0d6e76',
		colorId: '7',
	},
	cv: {
		eyebrow: 'Carlos A. Muñoz · QA Architect',
		accent: '#0d6e76',
		soft: '#eef6f6',
		line: '#d3e4e6',
		color: '#0d6e76',
		colorId: '9',
	},
	general: {
		eyebrow: 'Carlos A. Muñoz · QA Architect',
		accent: '#0d6e76',
		soft: '#f3f5f7',
		line: '#d9dfe5',
		color: '#12181f',
		colorId: '8',
	},
};

const lookOf = (type) => (type === 'intro' || type === 'walkthrough' ? 'review' : type === 'cv' ? 'cv' : 'general');
const langOf = (lang) => (LANGS.includes(String(lang || '').slice(0, 2)) ? String(lang).slice(0, 2) : 'en');

const COPY = {
	en: {
		confirmSubject: 'Booked: {label}, {when}',
		subject24: 'Coming up: {label}, {when}',
		subject1: 'Starting soon: {label}, {when}',
		pre: '{when}. Meet link and calendar buttons inside.',
		preSoon: '{when}. Your Meet link is inside.',
		title: "You're booked, {name}.",
		title24: 'Your call is coming up, {name}.',
		title1: 'Your call starts soon, {name}.',
		lead: '{label} is on the calendar. Everything you need is below.',
		lead24: '{label} is in about a day.',
		lead1: '{label} starts in about an hour.',
		with: 'With',
		when: 'When',
		length: 'Length',
		minutes: '{n} minutes',
		bogota: "Carlos's time (Colombia)",
		meet: 'Join with Google Meet',
		meetNote: "It is the same link as in Google's invite.",
		noMeet: "The Meet link is in Google's invite.",
		addTitle: 'Add it to your calendar',
		google: 'Google Calendar',
		outlook: 'Outlook',
		icsNote: 'Apple Calendar and others: open the attached .ics file.',
		prepTitle: 'To get the most from the call',
		prep: {
			intro: [
				'Have the site you want reviewed open, or its address ready.',
				'Bring the one thing you most want to know: cost, scope or fit.',
			],
			walkthrough: ['Open your report beforehand.', 'Note the findings you want to start with; we cover those first.'],
			cv: [
				'Reply with the job description or a link, if you have one.',
				'Tell me the stack and the team size, so we use the time well.',
			],
			call: [
				'Send a line on what you want to talk about, if you can.',
				'Bring any link or document you want to look at together.',
			],
		},
		report: 'Open your report',
		site: 'Site: {host}',
		details: 'Booking details',
		move: "Need to move it? Reply to this email or to Google's invite and we will find another time.",
		dup: 'Google Calendar also sends its own invite for this call. Accepting either one is enough.',
		privacy: 'Privacy',
		why: 'You get this because you booked a call at carlosandmunoz.com.',
	},
	es: {
		confirmSubject: 'Agendada: {label}, {when}',
		subject24: 'Próxima llamada: {label}, {when}',
		subject1: 'Empieza pronto: {label}, {when}',
		pre: '{when}. Dentro: enlace de Meet y botones de calendario.',
		preSoon: '{when}. Dentro: tu enlace de Meet.',
		title: 'Llamada agendada, {name}.',
		title24: 'Tu llamada se acerca, {name}.',
		title1: 'Tu llamada empieza pronto, {name}.',
		lead: '{label} ya está en el calendario. Abajo tienes todo lo que necesitas.',
		lead24: '{label} es en aproximadamente un día.',
		lead1: '{label} empieza en aproximadamente una hora.',
		with: 'Con',
		when: 'Cuándo',
		length: 'Duración',
		minutes: '{n} minutos',
		bogota: 'Hora de Carlos (Colombia)',
		meet: 'Entrar con Google Meet',
		meetNote: 'Es el mismo enlace de la invitación de Google.',
		noMeet: 'El enlace de Meet está en la invitación de Google.',
		addTitle: 'Añádela a tu calendario',
		google: 'Google Calendar',
		outlook: 'Outlook',
		icsNote: 'Apple Calendar y otros: abre el archivo .ics adjunto.',
		prepTitle: 'Para aprovechar la llamada',
		prep: {
			intro: [
				'Ten a mano el sitio que quieres revisar, o su dirección.',
				'Trae lo que más quieres saber: costo, alcance o si te sirve.',
			],
			walkthrough: [
				'Abre tu informe antes de la llamada.',
				'Anota los hallazgos con los que quieres empezar; vemos esos primero.',
			],
			cv: [
				'Responde con la descripción del puesto o un enlace, si lo tienes.',
				'Cuéntame el stack y el tamaño del equipo para aprovechar el tiempo.',
			],
			call: [
				'Envíame una línea sobre lo que quieres tratar, si puedes.',
				'Trae cualquier enlace o documento que quieras ver juntos.',
			],
		},
		report: 'Abrir tu informe',
		site: 'Sitio: {host}',
		details: 'Datos de la reserva',
		move: '¿Necesitas moverla? Responde a este correo o a la invitación de Google y buscamos otro horario.',
		dup: 'Google Calendar también envía su propia invitación de esta llamada. Basta con aceptar una.',
		privacy: 'Privacidad',
		why: 'Recibes esto porque agendaste una llamada en carlosandmunoz.com.',
	},
	pt: {
		confirmSubject: 'Agendada: {label}, {when}',
		subject24: 'Em breve: {label}, {when}',
		subject1: 'Começa logo: {label}, {when}',
		pre: '{when}. Dentro: link do Meet e botões de agenda.',
		preSoon: '{when}. Dentro: seu link do Meet.',
		title: 'Conversa agendada, {name}.',
		title24: 'Sua conversa está chegando, {name}.',
		title1: 'Sua conversa começa logo, {name}.',
		lead: '{label} já está na agenda. Abaixo está tudo de que você precisa.',
		lead24: '{label} é em cerca de um dia.',
		lead1: '{label} começa em cerca de uma hora.',
		with: 'Com',
		when: 'Quando',
		length: 'Duração',
		minutes: '{n} minutos',
		bogota: 'Horário do Carlos (Colômbia)',
		meet: 'Entrar no Google Meet',
		meetNote: 'É o mesmo link do convite do Google.',
		noMeet: 'O link do Meet está no convite do Google.',
		addTitle: 'Adicione à sua agenda',
		google: 'Google Agenda',
		outlook: 'Outlook',
		icsNote: 'Apple Calendar e outros: abra o arquivo .ics anexo.',
		prepTitle: 'Para aproveitar a conversa',
		prep: {
			intro: [
				'Deixe aberto o site que quer revisar, ou tenha o endereço à mão.',
				'Traga o que mais quer saber: custo, escopo ou se serve para você.',
			],
			walkthrough: [
				'Abra o seu relatório antes da conversa.',
				'Anote as descobertas com que quer começar; vemos essas primeiro.',
			],
			cv: [
				'Responda com a descrição da vaga ou um link, se tiver.',
				'Conte a stack e o tamanho da equipe para aproveitarmos o tempo.',
			],
			call: [
				'Mande uma linha sobre o que quer conversar, se puder.',
				'Traga qualquer link ou documento que queira ver junto.',
			],
		},
		report: 'Abrir seu relatório',
		site: 'Site: {host}',
		details: 'Dados da reserva',
		move: 'Precisa mudar? Responda a este e-mail ou ao convite do Google e achamos outro horário.',
		dup: 'O Google Agenda também envia um convite próprio desta conversa. Aceitar um dos dois basta.',
		privacy: 'Privacidade',
		why: 'Você recebe isto porque agendou uma conversa em carlosandmunoz.com.',
	},
	de: {
		confirmSubject: 'Gebucht: {label}, {when}',
		subject24: 'Bald: {label}, {when}',
		subject1: "Gleich geht's los: {label}, {when}",
		pre: '{when}. Drin: Meet-Link und Kalender-Buttons.',
		preSoon: '{when}. Drin: Ihr Meet-Link.',
		title: 'Gebucht, {name}.',
		title24: 'Ihr Gespräch steht bevor, {name}.',
		title1: 'Ihr Gespräch beginnt gleich, {name}.',
		lead: '{label} steht im Kalender. Unten finden Sie alles, was Sie brauchen.',
		lead24: '{label} ist in etwa einem Tag.',
		lead1: '{label} beginnt in etwa einer Stunde.',
		with: 'Mit',
		when: 'Wann',
		length: 'Dauer',
		minutes: '{n} Minuten',
		bogota: 'Zeit von Carlos (Kolumbien)',
		meet: 'Mit Google Meet beitreten',
		meetNote: 'Es ist derselbe Link wie in der Google-Einladung.',
		noMeet: 'Den Meet-Link finden Sie in der Google-Einladung.',
		addTitle: 'In Ihren Kalender eintragen',
		google: 'Google Kalender',
		outlook: 'Outlook',
		icsNote: 'Apple Kalender und andere: Öffnen Sie die angehängte .ics-Datei.',
		prepTitle: 'Damit das Gespräch viel bringt',
		prep: {
			intro: [
				'Halten Sie die zu prüfende Website offen oder die Adresse bereit.',
				'Bringen Sie mit, was Sie am meisten wissen wollen: Kosten, Umfang oder Passung.',
			],
			walkthrough: [
				'Öffnen Sie Ihren Bericht vorab.',
				'Notieren Sie die Befunde, mit denen wir beginnen sollen; die gehen wir zuerst durch.',
			],
			cv: [
				'Antworten Sie mit der Stellenbeschreibung oder einem Link, falls vorhanden.',
				'Nennen Sie Stack und Teamgröße, damit wir die Zeit gut nutzen.',
			],
			call: [
				'Schreiben Sie kurz, worüber Sie sprechen möchten, wenn möglich.',
				'Bringen Sie Links oder Dokumente mit, die wir gemeinsam ansehen sollen.',
			],
		},
		report: 'Ihren Bericht öffnen',
		site: 'Website: {host}',
		details: 'Buchungsdaten',
		move: 'Termin verschieben? Antworten Sie auf diese E-Mail oder die Google-Einladung, wir finden einen neuen Termin.',
		dup: 'Google Kalender sendet für dieses Gespräch auch eine eigene Einladung. Eine der beiden anzunehmen genügt.',
		privacy: 'Datenschutz',
		why: 'Sie erhalten dies, weil Sie auf carlosandmunoz.com ein Gespräch gebucht haben.',
	},
	fr: {
		confirmSubject: 'Réservé : {label}, {when}',
		subject24: 'Bientôt : {label}, {when}',
		subject1: 'Ça commence bientôt : {label}, {when}',
		pre: "{when}. Dedans : lien Meet et boutons d'agenda.",
		preSoon: '{when}. Dedans : votre lien Meet.',
		title: "C'est réservé, {name}.",
		title24: 'Votre appel approche, {name}.',
		title1: 'Votre appel commence bientôt, {name}.',
		lead: "{label} est dans l'agenda. Vous trouverez tout ce qu'il faut ci-dessous.",
		lead24: '{label} a lieu dans environ un jour.',
		lead1: '{label} commence dans environ une heure.',
		with: 'Avec',
		when: 'Quand',
		length: 'Durée',
		minutes: '{n} minutes',
		bogota: 'Heure de Carlos (Colombie)',
		meet: 'Rejoindre avec Google Meet',
		meetNote: "C'est le même lien que dans l'invitation Google.",
		noMeet: "Le lien Meet se trouve dans l'invitation Google.",
		addTitle: 'Ajouter à votre agenda',
		google: 'Google Agenda',
		outlook: 'Outlook',
		icsNote: 'Apple Calendrier et autres : ouvrez le fichier .ics joint.',
		prepTitle: "Pour tirer le meilleur de l'appel",
		prep: {
			intro: [
				'Gardez le site à analyser ouvert, ou son adresse sous la main.',
				'Apportez ce que vous voulez le plus savoir : coût, périmètre ou adéquation.',
			],
			walkthrough: [
				"Ouvrez votre rapport avant l'appel.",
				'Notez les constats par lesquels commencer ; nous les verrons en premier.',
			],
			cv: [
				'Répondez avec la description du poste ou un lien, si vous en avez un.',
				"Indiquez la stack et la taille de l'équipe pour bien utiliser le temps.",
			],
			call: [
				'Envoyez une ligne sur le sujet qui vous intéresse, si possible.',
				'Apportez tout lien ou document à regarder ensemble.',
			],
		},
		report: 'Ouvrir votre rapport',
		site: 'Site : {host}',
		details: 'Détails de la réservation',
		move: "Besoin de le déplacer ? Répondez à cet e-mail ou à l'invitation Google et nous trouverons un autre créneau.",
		dup: "Google Agenda envoie aussi sa propre invitation pour cet appel. Accepter l'une des deux suffit.",
		privacy: 'Confidentialité',
		why: 'Vous recevez ceci parce que vous avez réservé un appel sur carlosandmunoz.com.',
	},
	it: {
		confirmSubject: 'Prenotata: {label}, {when}',
		subject24: 'In arrivo: {label}, {when}',
		subject1: 'Sta per iniziare: {label}, {when}',
		pre: '{when}. Dentro: link Meet e pulsanti calendario.',
		preSoon: '{when}. Dentro: il tuo link Meet.',
		title: 'Prenotata, {name}.',
		title24: 'La tua chiamata si avvicina, {name}.',
		title1: 'La tua chiamata sta per iniziare, {name}.',
		lead: '{label} è in calendario. Qui sotto trovi tutto ciò che serve.',
		lead24: '{label} è tra circa un giorno.',
		lead1: "{label} inizia tra circa un'ora.",
		with: 'Con',
		when: 'Quando',
		length: 'Durata',
		minutes: '{n} minuti',
		bogota: 'Orario di Carlos (Colombia)',
		meet: 'Entra con Google Meet',
		meetNote: "È lo stesso link dell'invito di Google.",
		noMeet: "Il link Meet è nell'invito di Google.",
		addTitle: 'Aggiungila al tuo calendario',
		google: 'Google Calendar',
		outlook: 'Outlook',
		icsNote: 'Apple Calendar e altri: apri il file .ics allegato.',
		prepTitle: 'Per sfruttare al meglio la chiamata',
		prep: {
			intro: [
				"Tieni aperto il sito da analizzare, o l'indirizzo a portata di mano.",
				'Porta ciò che vuoi sapere di più: costo, ambito o se fa per te.',
			],
			walkthrough: [
				'Apri il tuo report prima della chiamata.',
				'Annota i risultati da cui vuoi partire; vedremo quelli per primi.',
			],
			cv: [
				"Rispondi con la descrizione del ruolo o un link, se ce l'hai.",
				'Indica lo stack e la dimensione del team per usare bene il tempo.',
			],
			call: ['Manda una riga su ciò di cui vuoi parlare, se puoi.', 'Porta link o documenti da guardare insieme.'],
		},
		report: 'Apri il tuo report',
		site: 'Sito: {host}',
		details: 'Dati della prenotazione',
		move: "Devi spostarla? Rispondi a questa email o all'invito di Google e troviamo un altro orario.",
		dup: 'Google Calendar invia anche un suo invito per questa chiamata. Basta accettarne uno.',
		privacy: 'Privacy',
		why: 'Ricevi questo perché hai prenotato una chiamata su carlosandmunoz.com.',
	},
};

const fill = (text, vars) =>
	String(text).replace(/\{(\w+)\}/g, (all, key) => (vars[key] == null ? all : String(vars[key])));
const firstName = (name) =>
	String(name || '')
		.trim()
		.split(/\s+/)[0] || '';

// A time zone name Intl knows, or "" (the visitor's browser sends one; nothing else is trusted).
function safeZone(tz) {
	const zone = String(tz || '').slice(0, 60);
	if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+){0,2}$/.test(zone)) return '';
	try {
		new Intl.DateTimeFormat('en', { timeZone: zone });
		return zone;
	} catch (error) {
		return '';
	}
}

function whenIn(iso, lang, zone) {
	return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : lang, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		hour: 'numeric',
		minute: '2-digit',
		timeZone: zone || TZ,
	}).format(new Date(iso));
}

// The visitor's own time first; Carlos's time under it when the zones differ.
function times(b, lang, t) {
	const zone = safeZone(b.tz);
	const bogota = whenIn(b.start, lang, TZ);
	if (!zone || zone === TZ) return { main: bogota + ' (' + TZ + ')', other: '' };
	return { main: whenIn(b.start, lang, zone) + ' (' + zone + ')', other: t.bogota + ': ' + bogota };
}

function labelOf(b) {
	return booking().LABELS[b.lang][b.type];
}
function minutesOf(b) {
	return booking().TYPES[b.type].minutes;
}

// ---- calendar files and links ----

const stamp = (iso) =>
	new Date(iso)
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');
const icsText = (value) =>
	String(value == null ? '' : value)
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');

function fold(line) {
	const out = [];
	let cur = '';
	let bytes = 0;
	for (const ch of line) {
		const n = Buffer.byteLength(ch);
		if (bytes + n > 74) {
			out.push(cur);
			cur = ' ' + ch;
			bytes = 1 + n;
		} else {
			cur += ch;
			bytes += n;
		}
	}
	out.push(cur);
	return out.join('\r\n');
}

function plainDetails(b, t) {
	return [labelOf(b) + ' (' + fill(t.minutes, { n: minutesOf(b) }) + ')', '', t.prepTitle + ':']
		.concat(t.prep[b.type].map((line) => '- ' + line))
		.concat(b.report ? ['', t.report + ': ' + booking().reportUrl(b.lang, b.report)] : [])
		.join('\n');
}

// A calendar file to add the call (METHOD:PUBLISH, so no second RSVP). The UID is Google's, so importing it
// over the invite replaces the event instead of adding a second one.
function ics(b, extra) {
	const t = COPY[langOf(b.lang)];
	const x = extra || {};
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Carlos A. Munoz//Calls//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		'UID:' + (x.icalUid || (x.id || 'call') + '@carlosandmunoz.com'),
		'DTSTAMP:' + stamp(x.now || Date.now()),
		'DTSTART:' + stamp(b.start),
		'DTEND:' + stamp(b.end),
		'SUMMARY:' + icsText(labelOf(b) + ': ' + b.name + ' & Carlos A. Muñoz'),
		'DESCRIPTION:' + icsText(plainDetails(b, t) + (x.meet ? '\n\nGoogle Meet: ' + x.meet : '')),
		x.meet ? 'LOCATION:' + icsText(x.meet) : '',
		x.meet ? 'URL:' + x.meet : '',
		'STATUS:CONFIRMED',
		'BEGIN:VALARM',
		'ACTION:DISPLAY',
		'DESCRIPTION:' + icsText(labelOf(b)),
		'TRIGGER:-PT15M',
		'END:VALARM',
		'END:VEVENT',
		'END:VCALENDAR',
	].filter(Boolean);
	return lines.map(fold).join('\r\n') + '\r\n';
}

function calendarLinks(b, meet) {
	const t = COPY[langOf(b.lang)];
	const title = labelOf(b) + ': ' + b.name + ' & Carlos A. Muñoz';
	const google = new URL('https://calendar.google.com/calendar/render');
	google.searchParams.set('action', 'TEMPLATE');
	google.searchParams.set('text', title);
	google.searchParams.set('dates', stamp(b.start) + '/' + stamp(b.end));
	if (meet) google.searchParams.set('location', meet);
	const outlook = new URL('https://outlook.live.com/calendar/0/deeplink/compose');
	outlook.searchParams.set('path', '/calendar/action/compose');
	outlook.searchParams.set('rru', 'addevent');
	outlook.searchParams.set('subject', title);
	outlook.searchParams.set('startdt', new Date(b.start).toISOString());
	outlook.searchParams.set('enddt', new Date(b.end).toISOString());
	if (meet) outlook.searchParams.set('location', meet);
	return { google: google.toString(), outlook: outlook.toString() };
}

// ---- the Google Calendar event ----

// What the event adds to booking.eventBody: the description in the visitor's language, the color, the source link.
function eventExtras(b, id) {
	const lang = langOf(b.lang);
	const t = COPY[lang];
	const look = LOOKS[lookOf(b.type)];
	const list = t.prep[b.type].map((line) => '<li>' + esc(line) + '</li>').join('');
	const who = esc(b.name) + ' &lt;' + esc(b.email) + '&gt;' + (b.company ? ', ' + esc(b.company) : '');
	const note = b.note ? '<br><br>' + esc(b.note.slice(0, 900)).replace(/\n/g, '<br>') : '';
	const report = b.report ? booking().reportUrl(lang, b.report) : '';
	const html = [
		'<b>' + esc(labelOf(b)) + '</b> · ' + esc(fill(t.minutes, { n: minutesOf(b) })),
		'<br>Carlos A. Muñoz · QA Architect<br><br>',
		'<b>' + esc(t.prepTitle) + '</b><ul>' + list + '</ul>',
		'<b>' + esc(t.details) + '</b><br>' + who,
		b.host ? '<br>' + esc(fill(t.site, { host: b.host })) : '',
		report ? '<br>' + esc(t.report) + ': <a href="' + esc(report) + '">' + esc(report) + '</a>' : '',
		note,
		'<br><br><i>' + esc(SITE + '/book.html' + (b.ref ? ' · ' + b.ref : '') + ' · ' + lang) + '</i>',
	].join('');
	return {
		description: html,
		colorId: look.colorId,
		guestsCanSeeOtherGuests: false,
		source: {
			title: 'carlosandmunoz.com',
			url: booking().bookUrl(b.type, lang, { from: 'event', source: 'calendar' }),
		},
	};
}

// ---- the mail ----

const FONT = 'font-family:Arial,Helvetica,sans-serif;';
const SERIF = "font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-weight:normal;";

function button(look, href, label, primary) {
	if (look === 'review') return fusion.button(esc(href), esc(label), primary);
	const c = LOOKS[look].color;
	const style = primary
		? 'background:' + c + ';color:#ffffff;border:1px solid ' + c + ';'
		: 'background:#ffffff;color:' + LOOKS[look].accent + ';border:1px solid ' + LOOKS[look].accent + ';';
	return (
		'<a href="' +
		esc(href) +
		'" style="display:inline-block;' +
		style +
		'text-decoration:none;' +
		FONT +
		'font-size:15px;font-weight:bold;line-height:20px;padding:13px 22px;border-radius:999px;margin:0 8px 10px 0;">' +
		esc(label) +
		'</a>'
	);
}

function band(look, title) {
	if (look === 'review') return fusion.band(esc(LOOKS.review.eyebrow), esc(title), '', { size: 28 });
	const c = LOOKS[look].color;
	const gradient =
		look === 'cv'
			? 'linear-gradient(135deg,#0a5258 0%,#0d6e76 62%,#2a8c94 100%)'
			: 'linear-gradient(135deg,#12181f 0%,#1c2630 70%,#0d4f55 100%)';
	return (
		'<tr><td bgcolor="' +
		c +
		'" style="background:' +
		c +
		';background-image:' +
		gradient +
		';border-radius:16px 16px 0 0;padding:28px 28px 26px;' +
		FONT +
		'">' +
		'<p style="margin:0 0 14px;' +
		FONT +
		'font-size:12px;line-height:18px;letter-spacing:0.12em;text-transform:uppercase;color:#bfeef1;">' +
		esc(LOOKS[look].eyebrow) +
		'</p>' +
		'<p style="margin:0;' +
		SERIF +
		'font-size:28px;line-height:34px;color:#ffffff;">' +
		esc(title) +
		'</p>' +
		'</td></tr><tr><td bgcolor="#4db3bb" style="background:#4db3bb;height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>'
	);
}

function card(look, rows) {
	const l = LOOKS[look];
	return (
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:' +
		l.soft +
		';border-left:4px solid ' +
		l.accent +
		';border-radius:10px;"><tr><td style="padding:16px 18px;">' +
		rows
			.map(
				(row) =>
					'<p style="margin:0 0 10px;' +
					FONT +
					'font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#56707a;">' +
					esc(row[0]) +
					'<br><span style="font-size:16px;line-height:24px;letter-spacing:0;text-transform:none;font-weight:bold;color:' +
					fusion.TEXT.strong +
					';">' +
					esc(row[1]) +
					'</span>' +
					(row[2]
						? '<br><span style="font-size:13px;line-height:20px;letter-spacing:0;text-transform:none;color:#56707a;">' +
							esc(row[2]) +
							'</span>'
						: '') +
					'</p>'
			)
			.join('') +
		'</td></tr></table>'
	);
}

const heading = (look, text) =>
	'<p style="margin:22px 0 8px;' +
	FONT +
	'font-size:12px;font-weight:bold;letter-spacing:0.1em;text-transform:uppercase;color:' +
	LOOKS[look].accent +
	';">' +
	esc(text) +
	'</p>';
const para = (text, muted) =>
	'<p style="margin:0 0 12px;' +
	FONT +
	'font-size:' +
	(muted ? 13 : 15) +
	'px;line-height:' +
	(muted ? 20 : 24) +
	'px;color:' +
	(muted ? fusion.TEXT.muted : fusion.TEXT.body) +
	';">' +
	esc(text) +
	'</p>';

/**
 * One mail for a booked call. kind: "confirm" | "24h" | "1h". extra: { meet, icalUid, id, now }.
 * Returns { subject, text, html, attachments, look, lang } with no sender: message() adds it.
 */
function build(kind, b, extra) {
	const x = extra || {};
	const lang = langOf(b.lang);
	const t = COPY[lang];
	const lookId = lookOf(b.type);
	const l = LOOKS[lookId];
	const label = labelOf(b);
	const when = whenIn(b.start, lang, safeZone(b.tz) || TZ);
	const vars = { label, when, name: firstName(b.name), host: b.host, n: minutesOf(b) };
	const reminder = kind !== 'confirm';
	const subject = fill(kind === 'confirm' ? t.confirmSubject : kind === '24h' ? t.subject24 : t.subject1, vars);
	const title = fill(kind === 'confirm' ? t.title : kind === '24h' ? t.title24 : t.title1, vars);
	const lead = fill(kind === 'confirm' ? t.lead : kind === '24h' ? t.lead24 : t.lead1, vars);
	const pre = fill(reminder ? t.preSoon : t.pre, vars);
	const tm = times(b, lang, t);
	const links = calendarLinks(b, x.meet);
	const report = b.report ? booking().reportUrl(lang, b.report) : '';
	const rows = [
		[t.with, 'Carlos A. Muñoz · QA Architect'],
		[t.when, tm.main, tm.other],
		[t.length, fill(t.minutes, vars), b.host ? fill(t.site, vars) : ''],
	];

	const meetBlock = x.meet
		? '<p style="margin:0 0 4px;">' + button(lookId, x.meet, t.meet, true) + '</p>' + para(t.meetNote, true)
		: para(t.noMeet, true);
	const calBlock = reminder
		? ''
		: heading(lookId, t.addTitle) +
			'<p style="margin:0 0 4px;">' +
			button(lookId, links.google, t.google, false) +
			button(lookId, links.outlook, t.outlook, false) +
			'</p>' +
			para(t.icsNote, true);
	const prepBlock =
		heading(lookId, t.prepTitle) +
		'<ul style="margin:0 0 12px;padding:0 0 0 20px;' +
		FONT +
		'font-size:15px;line-height:24px;color:' +
		fusion.TEXT.body +
		';">' +
		t.prep[b.type].map((line) => '<li style="margin:0 0 6px;">' + esc(line) + '</li>').join('') +
		'</ul>' +
		(report ? '<p style="margin:0 0 4px;">' + button(lookId, report, t.report, false) + '</p>' : '');
	const noteBlock = para(t.move, true) + (reminder ? '' : para(t.dup, true));
	const legal = SITE + '/qa-review-legal.html';
	const footer =
		esc(t.why) +
		(lookId === 'review'
			? ' <a href="' + legal + '" style="color:' + fusion.TEXT.link + ';">' + esc(t.privacy) + '</a>'
			: '') +
		'<br>' +
		esc('Carlos A. Muñoz · carlosandmunoz.com');
	const inner = para(lead) + card(lookId, rows) + meetBlock + calBlock + prepBlock + noteBlock;

	const html =
		'<!DOCTYPE html><html lang="' +
		lang +
		'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
		'<body style="margin:0;padding:24px 12px;background:' +
		fusion.PAGE_BG +
		';">' +
		'<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' +
		esc(pre) +
		'</div>' +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">' +
		band(lookId, title) +
		'<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:0 0 16px 16px;padding:26px 28px 24px;">' +
		inner +
		'</td></tr>' +
		'<tr><td style="padding:18px 8px 0;' +
		FONT +
		'font-size:12px;line-height:18px;color:#4a5d63;text-align:center;">' +
		footer +
		'</td></tr>' +
		'</table></body></html>';

	const text = [
		title,
		'',
		lead,
		'',
		t.with + ': Carlos A. Muñoz',
		t.when + ': ' + tm.main,
		tm.other,
		t.length + ': ' + fill(t.minutes, vars),
		b.host ? fill(t.site, vars) : '',
		'',
		x.meet ? t.meet + ': ' + x.meet : t.noMeet,
		'',
		reminder
			? ''
			: t.addTitle +
				':\n' +
				t.google +
				': ' +
				links.google +
				'\n' +
				t.outlook +
				': ' +
				links.outlook +
				'\n' +
				t.icsNote +
				'\n',
		t.prepTitle + ':',
		...t.prep[b.type].map((line) => '- ' + line),
		report ? '\n' + t.report + ': ' + report : '',
		'',
		t.move,
		reminder ? '' : t.dup,
		'',
		'-- ',
		t.why,
		'Carlos A. Muñoz · carlosandmunoz.com',
	]
		.filter((line, i, all) => line !== '' || all[i - 1] !== '')
		.join('\n');

	const attachments = reminder
		? []
		: [
				{
					content: Buffer.from(ics(b, x), 'utf8').toString('base64'),
					filename: 'call-with-carlos.ics',
					type: 'text/calendar',
					disposition: 'attachment',
				},
			];
	return { subject, text, html, attachments, look: lookId, lang, accent: l.accent };
}

/** The SendGrid message: the review look goes out from the language's face, the others from the default sender. */
function message(kind, b, extra, defaultFrom) {
	const built = build(kind, b, extra);
	const env =
		built.look === 'review' ? mailFace.envelope(built.lang, defaultFrom) : { from: defaultFrom, replyTo: REPLY_TO };
	const msg = {
		to: {
			email: b.email,
			name:
				String(b.name)
					.replace(/[<>"(),;:#]/g, ' ')
					.replace(/\s+/g, ' ')
					.trim() || b.email,
		},
		from: env.from,
		subject: built.subject.slice(0, 140),
		text: built.text,
		html: built.html,
	};
	if (env.replyTo) msg.replyTo = env.replyTo;
	if (built.attachments.length) msg.attachments = built.attachments;
	return msg;
}

// ---- reminders ----

/**
 * The reminders to send now. rows: [{ id, ...booking }]. A 24-hour note goes out inside the last day, only for a call
 * booked more than 26 hours ahead (a call booked for tomorrow gets the 1-hour note alone); a 1-hour note inside the
 * last hour. Each goes once: remind24 / remind1 hold the send time.
 */
function remindersDue(rows, now) {
	const out = [];
	(rows || []).forEach((row) => {
		if (!row || row.status !== 'booked' || !row.start || !row.email || !row.type) return;
		const left = Date.parse(row.start) - now;
		if (!(left > 0)) return;
		const lead = Date.parse(row.start) - (Date.parse(row.createdAt) || 0);
		if (left <= HOUR && !row.remind1) out.push({ id: row.id, kind: '1h' });
		else if (left <= 24 * HOUR && left > 3 * HOUR && !row.remind24 && lead > 26 * HOUR)
			out.push({ id: row.id, kind: '24h' });
	});
	return out;
}

module.exports = {
	LOOKS,
	COPY,
	LANGS,
	lookOf,
	safeZone,
	ics,
	calendarLinks,
	eventExtras,
	build,
	message,
	remindersDue,
};
