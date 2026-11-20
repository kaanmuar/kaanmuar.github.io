/* book.html (#1971): pick a kind of call, a free time in Carlos's Google Calendar, and book it through the booking
   function. Google mails the invite with the Meet link. Copy is hand-written in the six site languages. */
(function () {
	'use strict';
	const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
	const ENDPOINT = 'https://us-central1-carlosm-interactive-cv.cloudfunctions.net/booking';
	const SITEKEY = LOCAL ? '1x00000000000000000000AA' : '0x4AAAAAAFoMHSvmRtt1Z3Lz';
	const LANGS = ['en', 'es', 'pt', 'de', 'fr', 'it'];
	const TYPES = ['intro', 'walkthrough', 'cv', 'call'];

	const COPY = {
		en: {
			taken: 'That time was just taken. Pick another one.',
			limit: 'You already have calls booked, or tried too often. Reply to your invite to move a call.',
			title: 'Schedule a call',
			eyebrow: 'Carlos A. Muñoz · QA Architect',
			lead: 'Pick a time that is free in my calendar. Google Calendar sends you the invite with a Meet link.',
			typeTitle: 'What is the call about?',
			timeTitle: 'Pick a time',
			formTitle: 'Your details',
			types: {
				intro: [
					'QA-lab URL Review intro',
					'15 min. What the review checks, what it costs, and whether it fits your site.',
				],
				walkthrough: ['Report walkthrough', '30 min. We go through your URL Review report and what to fix first.'],
				cv: [
					'A role or a project',
					'30 min. For recruiters and hiring managers: QA, test automation and QA leadership.',
				],
				call: ['Something else', '30 min. Any other question about QA, testing or this site.'],
			},
			zone: 'Times are in your time zone ({zone}).',
			loading: 'Reading my calendar…',
			closed: 'Booking is closed right now. Write to qa@carlosandmunoz.com and I will answer within two business days.',
			none: 'No free times in the next three weeks. Write to qa@carlosandmunoz.com.',
			failed: 'The calendar did not load. Reload the page or write to qa@carlosandmunoz.com.',
			picked: '{label}, {when}',
			name: 'Name',
			email: 'Email',
			company: 'Company or site (optional)',
			note: 'What would you like to talk about? (optional)',
			submit: 'Book the call',
			sending: 'Booking…',
			check: 'Complete the bot check above.',
			needName: 'Write your name.',
			needEmail: 'Check the email.',
			doneTitle: "You're booked",
			doneWhen: '{label}, {when}.',
			doneInvite:
				'We sent a confirmation to your email, and Google Calendar sends its own invite with the Meet link. Add the call to your calendar below.',
			addTitle: 'Add it to your calendar',
			addGoogle: 'Google Calendar',
			addOutlook: 'Outlook',
			addIcs: 'Apple Calendar / .ics file',
			prepTitle: 'To get the most from the call',
			prep: {
				intro: [
					'Have the site you want reviewed open, or its address ready.',
					'Bring the one thing you most want to know: cost, scope or fit.',
				],
				walkthrough: [
					'Open your report beforehand.',
					'Note the findings you want to start with; we cover those first.',
				],
				cv: [
					'Reply with the job description or a link, if you have one.',
					'Tell me the stack and the team size, so we use the time well.',
				],
				call: [
					'Send a line on what you want to talk about, if you can.',
					'Bring any link or document you want to look at together.',
				],
			},
			meet: 'Open the Meet link',
			other: 'Prefer email?',
			cv: 'Interactive CV',
			privacy: 'Privacy',
			site: 'Site: {host}',
			findings: 'Report findings to go through: {list}.',
		},
		es: {
			taken: 'Ese horario se acaba de ocupar. Elige otro.',
			limit:
				'Ya tienes llamadas agendadas o lo intentaste muchas veces. Responde a tu invitación para mover una llamada.',
			title: 'Agenda una llamada',
			eyebrow: 'Carlos A. Muñoz · Arquitecto de QA',
			lead: 'Elige un horario libre en mi calendario. Google Calendar te envía la invitación con un enlace de Meet.',
			typeTitle: '¿De qué quieres hablar?',
			timeTitle: 'Elige un horario',
			formTitle: 'Tus datos',
			types: {
				intro: ['Introducción a QA-lab URL Review', '15 min. Qué revisa, cuánto cuesta y si le sirve a tu sitio.'],
				walkthrough: [
					'Recorrido por tu informe',
					'30 min. Revisamos juntos tu informe de URL Review y qué corregir primero.',
				],
				cv: [
					'Un puesto o un proyecto',
					'30 min. Para reclutadores y responsables de contratación: QA, automatización de pruebas y liderazgo de QA.',
				],
				call: ['Otro tema', '30 min. Cualquier otra pregunta sobre QA, pruebas o este sitio.'],
			},
			zone: 'Los horarios están en tu zona horaria ({zone}).',
			loading: 'Leyendo mi calendario…',
			closed:
				'Las reservas están cerradas por ahora. Escribe a qa@carlosandmunoz.com y te respondo en dos días hábiles.',
			none: 'No hay horarios libres en las próximas tres semanas. Escribe a qa@carlosandmunoz.com.',
			failed: 'El calendario no cargó. Recarga la página o escribe a qa@carlosandmunoz.com.',
			picked: '{label}, {when}',
			name: 'Nombre',
			email: 'Correo',
			company: 'Empresa o sitio (opcional)',
			note: '¿De qué te gustaría hablar? (opcional)',
			submit: 'Agendar la llamada',
			sending: 'Agendando…',
			check: 'Completa la verificación de arriba.',
			needName: 'Escribe tu nombre.',
			needEmail: 'Revisa el correo.',
			doneTitle: 'Llamada agendada',
			doneWhen: '{label}, {when}.',
			doneInvite:
				'Te enviamos una confirmación por correo, y Google Calendar envía su propia invitación con el enlace de Meet. Añade la llamada a tu calendario aquí abajo.',
			addTitle: 'Añádela a tu calendario',
			addGoogle: 'Google Calendar',
			addOutlook: 'Outlook',
			addIcs: 'Apple Calendar / archivo .ics',
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
			meet: 'Abrir el enlace de Meet',
			other: '¿Prefieres escribir?',
			cv: 'CV interactivo',
			privacy: 'Privacidad',
			site: 'Sitio: {host}',
			findings: 'Hallazgos del informe para revisar: {list}.',
		},
		pt: {
			taken: 'Esse horário acabou de ser ocupado. Escolha outro.',
			limit: 'Você já tem conversas agendadas ou tentou muitas vezes. Responda ao convite para mudar uma conversa.',
			title: 'Agende uma conversa',
			eyebrow: 'Carlos A. Muñoz · Arquiteto de QA',
			lead: 'Escolha um horário livre na minha agenda. O Google Agenda envia o convite com um link do Meet.',
			typeTitle: 'Sobre o que você quer conversar?',
			timeTitle: 'Escolha um horário',
			formTitle: 'Seus dados',
			types: {
				intro: [
					'Introdução ao QA-lab URL Review',
					'15 min. O que a revisão verifica, quanto custa e se serve para o seu site.',
				],
				walkthrough: [
					'Tour pelo seu relatório',
					'30 min. Vemos juntos o seu relatório do URL Review e o que corrigir primeiro.',
				],
				cv: [
					'Uma vaga ou um projeto',
					'30 min. Para recrutadores e gestores: QA, automação de testes e liderança de QA.',
				],
				call: ['Outro assunto', '30 min. Qualquer outra pergunta sobre QA, testes ou este site.'],
			},
			zone: 'Os horários estão no seu fuso horário ({zone}).',
			loading: 'Lendo a minha agenda…',
			closed: 'O agendamento está fechado agora. Escreva para qa@carlosandmunoz.com e respondo em até dois dias úteis.',
			none: 'Não há horários livres nas próximas três semanas. Escreva para qa@carlosandmunoz.com.',
			failed: 'A agenda não carregou. Recarregue a página ou escreva para qa@carlosandmunoz.com.',
			picked: '{label}, {when}',
			name: 'Nome',
			email: 'E-mail',
			company: 'Empresa ou site (opcional)',
			note: 'Sobre o que você gostaria de falar? (opcional)',
			submit: 'Agendar a conversa',
			sending: 'Agendando…',
			check: 'Conclua a verificação acima.',
			needName: 'Escreva o seu nome.',
			needEmail: 'Confira o e-mail.',
			doneTitle: 'Conversa agendada',
			doneWhen: '{label}, {when}.',
			doneInvite:
				'Enviamos uma confirmação por e-mail, e o Google Agenda envia o próprio convite com o link do Meet. Adicione a conversa à sua agenda abaixo.',
			addTitle: 'Adicione à sua agenda',
			addGoogle: 'Google Agenda',
			addOutlook: 'Outlook',
			addIcs: 'Apple Calendar / arquivo .ics',
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
			meet: 'Abrir o link do Meet',
			other: 'Prefere e-mail?',
			cv: 'CV interativo',
			privacy: 'Privacidade',
			site: 'Site: {host}',
			findings: 'Achados do relatório para revisar: {list}.',
		},
		de: {
			taken: 'Diese Zeit wurde gerade vergeben. Wählen Sie eine andere.',
			limit:
				'Sie haben bereits Gespräche gebucht oder es zu oft versucht. Antworten Sie auf Ihre Einladung, um ein Gespräch zu verschieben.',
			title: 'Gespräch vereinbaren',
			eyebrow: 'Carlos A. Muñoz · QA-Architekt',
			lead: 'Wählen Sie eine freie Zeit in meinem Kalender. Google Kalender schickt Ihnen die Einladung mit einem Meet-Link.',
			typeTitle: 'Worum geht es?',
			timeTitle: 'Zeit wählen',
			formTitle: 'Ihre Angaben',
			types: {
				intro: [
					'Einführung in QA-lab URL Review',
					'15 Min. Was die Prüfung abdeckt, was sie kostet und ob sie zu Ihrer Website passt.',
				],
				walkthrough: [
					'Durchgang durch Ihren Bericht',
					'30 Min. Wir gehen Ihren URL-Review-Bericht durch und klären, was zuerst zu beheben ist.',
				],
				cv: [
					'Eine Stelle oder ein Projekt',
					'30 Min. Für Recruiter und Hiring Manager: QA, Testautomatisierung und QA-Führung.',
				],
				call: ['Etwas anderes', '30 Min. Jede andere Frage zu QA, Tests oder dieser Website.'],
			},
			zone: 'Die Zeiten sind in Ihrer Zeitzone ({zone}).',
			loading: 'Mein Kalender wird gelesen…',
			closed:
				'Buchungen sind gerade geschlossen. Schreiben Sie an qa@carlosandmunoz.com, ich antworte innerhalb von zwei Werktagen.',
			none: 'In den nächsten drei Wochen ist keine Zeit frei. Schreiben Sie an qa@carlosandmunoz.com.',
			failed: 'Der Kalender wurde nicht geladen. Laden Sie die Seite neu oder schreiben Sie an qa@carlosandmunoz.com.',
			picked: '{label}, {when}',
			name: 'Name',
			email: 'E-Mail',
			company: 'Firma oder Website (optional)',
			note: 'Worüber möchten Sie sprechen? (optional)',
			submit: 'Gespräch buchen',
			sending: 'Wird gebucht…',
			check: 'Schließen Sie die Prüfung oben ab.',
			needName: 'Geben Sie Ihren Namen ein.',
			needEmail: 'Prüfen Sie die E-Mail-Adresse.',
			doneTitle: 'Gespräch gebucht',
			doneWhen: '{label}, {when}.',
			doneInvite:
				'Wir haben Ihnen eine Bestätigung per E-Mail geschickt, und Google Kalender sendet eine eigene Einladung mit dem Meet-Link. Tragen Sie das Gespräch unten in Ihren Kalender ein.',
			addTitle: 'In Ihren Kalender eintragen',
			addGoogle: 'Google Kalender',
			addOutlook: 'Outlook',
			addIcs: 'Apple Kalender / .ics-Datei',
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
			meet: 'Meet-Link öffnen',
			other: 'Lieber per E-Mail?',
			cv: 'Interaktiver Lebenslauf',
			privacy: 'Datenschutz',
			site: 'Website: {host}',
			findings: 'Befunde aus dem Bericht, die wir besprechen: {list}.',
		},
		fr: {
			taken: 'Ce créneau vient d’être pris. Choisissez-en un autre.',
			limit:
				'Vous avez déjà des appels réservés ou avez essayé trop souvent. Répondez à votre invitation pour déplacer un appel.',
			title: 'Planifier un appel',
			eyebrow: 'Carlos A. Muñoz · Architecte QA',
			lead: 'Choisissez un créneau libre dans mon agenda. Google Agenda vous envoie l’invitation avec un lien Meet.',
			typeTitle: 'De quoi voulez-vous parler ?',
			timeTitle: 'Choisissez un créneau',
			formTitle: 'Vos coordonnées',
			types: {
				intro: [
					'Présentation de QA-lab URL Review',
					'15 min. Ce que la revue vérifie, ce qu’elle coûte et si elle convient à votre site.',
				],
				walkthrough: [
					'Visite de votre rapport',
					'30 min. Nous parcourons votre rapport URL Review et ce qu’il faut corriger en premier.',
				],
				cv: [
					'Un poste ou un projet',
					'30 min. Pour les recruteurs et les responsables du recrutement : QA, automatisation des tests et direction QA.',
				],
				call: ['Autre chose', '30 min. Toute autre question sur la QA, les tests ou ce site.'],
			},
			zone: 'Les horaires sont dans votre fuseau horaire ({zone}).',
			loading: 'Lecture de mon agenda…',
			closed:
				'Les réservations sont fermées pour le moment. Écrivez à qa@carlosandmunoz.com, je réponds sous deux jours ouvrés.',
			none: 'Aucun créneau libre dans les trois prochaines semaines. Écrivez à qa@carlosandmunoz.com.',
			failed: 'L’agenda ne s’est pas chargé. Rechargez la page ou écrivez à qa@carlosandmunoz.com.',
			picked: '{label}, {when}',
			name: 'Nom',
			email: 'E-mail',
			company: 'Entreprise ou site (facultatif)',
			note: 'De quoi souhaitez-vous parler ? (facultatif)',
			submit: 'Réserver l’appel',
			sending: 'Réservation…',
			check: 'Terminez la vérification ci-dessus.',
			needName: 'Indiquez votre nom.',
			needEmail: 'Vérifiez l’e-mail.',
			doneTitle: 'Appel réservé',
			doneWhen: '{label}, {when}.',
			doneInvite:
				"Nous vous avons envoyé une confirmation par e-mail, et Google Agenda envoie sa propre invitation avec le lien Meet. Ajoutez l'appel à votre agenda ci-dessous.",
			addTitle: 'Ajouter à votre agenda',
			addGoogle: 'Google Agenda',
			addOutlook: 'Outlook',
			addIcs: 'Apple Calendrier / fichier .ics',
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
			meet: 'Ouvrir le lien Meet',
			other: 'Vous préférez écrire ?',
			cv: 'CV interactif',
			privacy: 'Confidentialité',
			site: 'Site : {host}',
			findings: 'Constats du rapport à passer en revue : {list}.',
		},
		it: {
			taken: 'Quell’orario è appena stato preso. Scegline un altro.',
			limit:
				'Hai già delle chiamate prenotate o hai provato troppe volte. Rispondi al tuo invito per spostare una chiamata.',
			title: 'Prenota una chiamata',
			eyebrow: 'Carlos A. Muñoz · QA Architect',
			lead: 'Scegli un orario libero nel mio calendario. Google Calendar ti manda l’invito con un link Meet.',
			typeTitle: 'Di cosa vuoi parlare?',
			timeTitle: 'Scegli un orario',
			formTitle: 'I tuoi dati',
			types: {
				intro: [
					'Introduzione a QA-lab URL Review',
					'15 min. Cosa controlla la revisione, quanto costa e se fa al caso del tuo sito.',
				],
				walkthrough: [
					'Giro guidato del tuo report',
					'30 min. Guardiamo insieme il tuo report URL Review e cosa correggere per primo.',
				],
				cv: [
					'Una posizione o un progetto',
					'30 min. Per recruiter e responsabili delle assunzioni: QA, automazione dei test e guida di team QA.',
				],
				call: ['Altro', '30 min. Qualsiasi altra domanda su QA, test o questo sito.'],
			},
			zone: 'Gli orari sono nel tuo fuso orario ({zone}).',
			loading: 'Sto leggendo il mio calendario…',
			closed:
				'Le prenotazioni sono chiuse al momento. Scrivi a qa@carlosandmunoz.com e ti rispondo entro due giorni lavorativi.',
			none: 'Nessun orario libero nelle prossime tre settimane. Scrivi a qa@carlosandmunoz.com.',
			failed: 'Il calendario non si è caricato. Ricarica la pagina o scrivi a qa@carlosandmunoz.com.',
			picked: '{label}, {when}',
			name: 'Nome',
			email: 'Email',
			company: 'Azienda o sito (facoltativo)',
			note: 'Di cosa vorresti parlare? (facoltativo)',
			submit: 'Prenota la chiamata',
			sending: 'Prenotazione…',
			check: 'Completa la verifica qui sopra.',
			needName: 'Scrivi il tuo nome.',
			needEmail: 'Controlla l’email.',
			doneTitle: 'Chiamata prenotata',
			doneWhen: '{label}, {when}.',
			doneInvite:
				'Ti abbiamo inviato una conferma via email, e Google Calendar invia il suo invito con il link Meet. Aggiungi la chiamata al tuo calendario qui sotto.',
			addTitle: 'Aggiungila al tuo calendario',
			addGoogle: 'Google Calendar',
			addOutlook: 'Outlook',
			addIcs: 'Apple Calendar / file .ics',
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
			meet: 'Apri il link Meet',
			other: 'Preferisci scrivere?',
			cv: 'CV interattivo',
			privacy: 'Privacy',
			site: 'Sito: {host}',
			findings: 'Risultati del report da esaminare: {list}.',
		},
	};

	const params = new URLSearchParams(location.search);
	const $ = (id) => document.getElementById(id);
	const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
	const zone = (() => {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
		} catch (e) {
			return 'UTC';
		}
	})();

	function startLang() {
		const asked = String(params.get('lang') || '')
			.slice(0, 2)
			.toLowerCase();
		if (LANGS.includes(asked)) return asked;
		let saved = '';
		try {
			saved = String(localStorage.getItem('cv-preferred-lang') || '').slice(0, 2);
		} catch (e) {
			/* private mode */
		}
		if (LANGS.includes(saved)) return saved;
		const nav = String(navigator.language || 'en')
			.slice(0, 2)
			.toLowerCase();
		return LANGS.includes(nav) ? nav : 'en';
	}

	const state = {
		lang: startLang(),
		type: TYPES.includes(params.get('type')) ? params.get('type') : params.get('review') ? 'walkthrough' : 'intro',
		slots: [],
		day: '',
		start: '',
		open: false,
		widget: null,
	};
	const t = () => COPY[state.lang];

	function locale() {
		return state.lang === 'en' ? 'en-US' : state.lang;
	}
	function dayKey(iso) {
		return new Intl.DateTimeFormat('en-CA', {
			timeZone: zone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).format(new Date(iso));
	}
	function whenText(iso) {
		return (
			new Intl.DateTimeFormat(locale(), {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
				hour: 'numeric',
				minute: '2-digit',
				timeZone: zone,
			}).format(new Date(iso)) +
			' (' +
			zone +
			')'
		);
	}
	function el(tag, attrs, children) {
		const node = document.createElement(tag);
		Object.keys(attrs || {}).forEach((k) => {
			if (k === 'text') node.textContent = attrs[k];
			else node.setAttribute(k, attrs[k]);
		});
		(children || []).forEach((c) => node.appendChild(c));
		return node;
	}

	function paintCopy() {
		document.documentElement.lang = state.lang;
		$('book-lang').value = state.lang;
		document.querySelectorAll('[data-book]').forEach((node) => {
			const value = t()[node.getAttribute('data-book')];
			if (typeof value === 'string') node.textContent = value;
		});
		document.title = t().title + ' · Carlos A. Muñoz';
		$('book-zone').textContent = fill(t().zone, { zone });
		paintTypes();
		paintSlots();
		paintPicked();
	}

	function paintTypes() {
		const box = $('book-types');
		box.textContent = '';
		TYPES.forEach((type) => {
			const [label, about] = t().types[type];
			const button = el(
				'button',
				{ type: 'button', class: 'type', 'aria-pressed': String(type === state.type), 'data-type': type },
				[el('b', { text: label }), el('span', { text: about })]
			);
			button.addEventListener('click', () => {
				if (state.type === type) return;
				state.type = type;
				state.start = '';
				paintTypes();
				load();
			});
			box.appendChild(button);
		});
	}

	function paintSlots() {
		const days = $('book-days');
		const slots = $('book-slots');
		days.textContent = '';
		slots.textContent = '';
		const byDay = {};
		state.slots.forEach((iso) => {
			(byDay[dayKey(iso)] = byDay[dayKey(iso)] || []).push(iso);
		});
		const keys = Object.keys(byDay).sort();
		if (!keys.length) return;
		if (!byDay[state.day]) state.day = keys[0];
		keys.forEach((key) => {
			const first = new Date(byDay[key][0]);
			const fmt = (opts) => new Intl.DateTimeFormat(locale(), Object.assign({ timeZone: zone }, opts)).format(first);
			const button = el('button', { type: 'button', class: 'day', 'aria-pressed': String(key === state.day) }, [
				el('span', { text: fmt({ weekday: 'short' }) }),
				el('b', { text: fmt({ day: 'numeric' }) }),
				el('span', { text: fmt({ month: 'short' }) }),
			]);
			button.addEventListener('click', () => {
				state.day = key;
				paintSlots();
			});
			days.appendChild(button);
		});
		byDay[state.day].forEach((iso) => {
			const label = new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit', timeZone: zone }).format(
				new Date(iso)
			);
			const button = el('button', {
				type: 'button',
				class: 'slot',
				'aria-pressed': String(iso === state.start),
				text: label,
			});
			button.addEventListener('click', () => pick(iso));
			slots.appendChild(button);
		});
	}

	function paintPicked() {
		if (!state.start) return;
		$('book-picked').textContent = fill(t().picked, { label: t().types[state.type][0], when: whenText(state.start) });
	}

	function pick(iso) {
		state.start = iso;
		paintSlots();
		paintPicked();
		$('book-form').hidden = false;
		$('book-error').textContent = '';
		turnstile();
		$('book-name').focus({ preventScroll: true });
		$('book-form').scrollIntoView({
			behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
			block: 'start',
		});
	}

	async function post(body) {
		const res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		const data = await res.json().catch(() => ({}));
		return { status: res.status, data };
	}

	// Switching the kind of call starts a new read; an older answer that lands later is dropped.
	let reads = 0;
	async function load() {
		const read = ++reads;
		const status = $('book-status');
		state.slots = [];
		paintSlots();
		status.textContent = t().loading;
		try {
			const { data } = await post({ op: 'slots', type: state.type });
			if (read !== reads) return;
			state.open = data.open === true;
			state.slots = Array.isArray(data.slots) ? data.slots : [];
			status.textContent = !data.ok ? t().failed : !state.open ? t().closed : state.slots.length ? '' : t().none;
			if (!state.slots.includes(state.start)) {
				state.start = '';
				$('book-form').hidden = true;
			}
			paintSlots();
		} catch (e) {
			if (read === reads) status.textContent = t().failed;
		}
	}

	let turnstileReady = null;
	function turnstile() {
		if (!turnstileReady) {
			turnstileReady = new Promise((resolve, reject) => {
				if (window.turnstile) {
					resolve(window.turnstile);
					return;
				}
				const script = document.createElement('script');
				script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
				script.async = true;
				script.addEventListener('load', () =>
					window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not start'))
				);
				script.addEventListener('error', () => reject(new Error('Turnstile did not load')));
				document.head.appendChild(script);
			})
				.then((api) => {
					if (state.widget == null)
						state.widget = api.render('#book-turnstile', {
							sitekey: SITEKEY,
							action: 'booking',
							language: state.lang,
							theme: 'auto',
						});
					return api;
				})
				.catch((error) => {
					turnstileReady = null;
					throw error;
				});
		}
		return turnstileReady;
	}

	// The confirmation wears the look of the call: URL Review Fusion for the review calls, the CV card for a role,
	// plain ink for anything else. The links add the call to Google or Outlook; the .ics is built here.
	const LOOK = { intro: 'review', walkthrough: 'review', cv: 'cv', call: 'general' };
	function stamp(iso) {
		return new Date(iso)
			.toISOString()
			.replace(/[-:]/g, '')
			.replace(/\.\d{3}/, '');
	}
	function icsText(value) {
		return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
	}
	function paintDone(data) {
		const look = LOOK[state.type] || 'general';
		const label = t().types[state.type][0];
		const title = label + ': Carlos A. Muñoz';
		const meet = data.meet && /^https:\/\/meet\.google\.com\//.test(data.meet) ? data.meet : '';
		$('book-done').setAttribute('data-look', look);
		$('book-done-eyebrow').textContent = look === 'review' ? 'QA-lab URL Review' : 'Carlos A. Muñoz · QA Architect';
		const google = new URL('https://calendar.google.com/calendar/render');
		google.searchParams.set('action', 'TEMPLATE');
		google.searchParams.set('text', title);
		google.searchParams.set('dates', stamp(data.start) + '/' + stamp(data.end));
		if (meet) google.searchParams.set('location', meet);
		$('book-add-google').href = google.toString();
		const outlook = new URL('https://outlook.live.com/calendar/0/deeplink/compose');
		outlook.searchParams.set('path', '/calendar/action/compose');
		outlook.searchParams.set('rru', 'addevent');
		outlook.searchParams.set('subject', title);
		outlook.searchParams.set('startdt', new Date(data.start).toISOString());
		outlook.searchParams.set('enddt', new Date(data.end).toISOString());
		if (meet) outlook.searchParams.set('location', meet);
		$('book-add-outlook').href = outlook.toString();
		const ics = [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Carlos A. Munoz//Calls//EN',
			'METHOD:PUBLISH',
			'BEGIN:VEVENT',
			'UID:' + stamp(data.start) + '-' + state.type + '@carlosandmunoz.com',
			'DTSTAMP:' + stamp(new Date().toISOString()),
			'DTSTART:' + stamp(data.start),
			'DTEND:' + stamp(data.end),
			'SUMMARY:' + icsText(title),
			meet ? 'LOCATION:' + icsText(meet) : '',
			'BEGIN:VALARM',
			'ACTION:DISPLAY',
			'DESCRIPTION:' + icsText(label),
			'TRIGGER:-PT15M',
			'END:VALARM',
			'END:VEVENT',
			'END:VCALENDAR',
		]
			.filter(Boolean)
			.join('\r\n');
		$('book-add-ics').href = URL.createObjectURL(new Blob([ics + '\r\n'], { type: 'text/calendar' }));
		const prep = $('book-prep');
		prep.textContent = '';
		t().prep[state.type].forEach((line) => prep.appendChild(el('li', { text: line })));
	}

	async function submit(event) {
		event.preventDefault();
		const error = $('book-error');
		const name = $('book-name').value.trim();
		const email = $('book-email').value.trim();
		if (name.length < 2) {
			error.textContent = t().needName;
			$('book-name').focus();
			return;
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
			error.textContent = t().needEmail;
			$('book-email').focus();
			return;
		}
		let token = '';
		try {
			const api = await turnstile();
			token = api.getResponse(state.widget) || '';
		} catch (e) {
			token = '';
		}
		if (!token) {
			error.textContent = t().check;
			return;
		}
		const button = $('book-submit');
		button.disabled = true;
		button.textContent = t().sending;
		error.textContent = '';
		const host = params.get('host') || '';
		const note = $('book-note').value.trim();
		let savedLanding = null;
		try {
			savedLanding = JSON.parse(sessionStorage.getItem('qa-review-landing') || 'null');
		} catch (e) {
			savedLanding = null;
		}
		const savedParams = savedLanding && savedLanding.query ? new URLSearchParams(savedLanding.query) : null;
		const firstRef =
			(savedParams && (savedParams.get('utm_campaign') || savedParams.get('utm_source'))) ||
			(savedLanding && savedLanding.referrerHost) ||
			'';
		const docRefHost = (() => {
			try {
				return document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
			} catch (e) {
				return '';
			}
		})();
		const externalDocRef = docRefHost && docRefHost !== 'carlosandmunoz.com' ? docRefHost : '';
		try {
			const { data } = await post({
				op: 'book',
				type: state.type,
				start: state.start,
				lang: state.lang,
				token,
				name,
				email,
				company: $('book-company').value.trim(),
				note,
				host,
				tz: zone,
				report: params.get('review') || '',
				ref: params.get('utm_campaign') || params.get('ref') || firstRef || externalDocRef || docRefHost,
			});
			if (!data.ok)
				throw new Error(
					{ taken: t().taken, limit: t().limit, bot: t().check, closed: t().closed }[data.code] || t().failed
				);
			$('book-form').hidden = true;
			$('book-done').hidden = false;
			$('book-done-when').textContent = fill(t().doneWhen, {
				label: t().types[state.type][0],
				when: whenText(data.start),
			});
			if (data.meet && /^https:\/\/meet\.google\.com\//.test(data.meet)) {
				$('book-meet').href = data.meet;
				$('book-done-meet').hidden = false;
			}
			paintDone(data);
			$('book-done').focus();
			if (window.SiteAnalytics) window.SiteAnalytics.trackEvent('book_call', 'Booking', state.type);
			else if (typeof window.gtag === 'function')
				window.gtag('event', 'book_call', { event_category: 'Booking', event_label: state.type });
		} catch (e) {
			error.textContent = e.message;
			if (window.turnstile && state.widget != null) window.turnstile.reset(state.widget);
			load();
		} finally {
			button.disabled = false;
			button.textContent = t().submit;
		}
	}

	$('book-lang').addEventListener('change', (event) => {
		state.lang = LANGS.includes(event.target.value) ? event.target.value : 'en';
		try {
			localStorage.setItem('cv-preferred-lang', state.lang);
		} catch (e) {
			/* private mode */
		}
		const url = new URL(location.href);
		url.searchParams.set('lang', state.lang);
		history.replaceState(null, '', url);
		paintCopy();
	});
	$('book-form').addEventListener('submit', submit);
	const host = params.get('host');
	if (host && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) $('book-company').value = host;
	const findings = String(params.get('findings') || '')
		.split(',')
		.map((id) => id.trim().toUpperCase())
		.filter((id) => /^[A-Z]{1,6}-\d{1,3}$/.test(id))
		.slice(0, 20);
	if (findings.length && !$('book-note').value)
		$('book-note').value = fill(t().findings, { list: findings.join(', ') });
	paintCopy();
	load();
})();
