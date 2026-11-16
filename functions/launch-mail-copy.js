/**
 * Copy for launch-mail.js (#3393) in six languages: the launch mail (L), the outreach mail to site owners (O), the
 * student outreach mail (S) and the "your report found something we can fix" follow-up (F).
 * Placeholders: {code} {host} {name} {n} {usd} {days} {pct} {from} {date} {count} {critical}.
 */
module.exports = {
  en: {
    L: {
      subjects: {
        glass: "Your site, shielded: new safety checks and 50% off your next review",
        night: "We now scan where others don't. 50% off your next review inside.",
        editorial: "Found it, fixed it, fixed price. And 50% off your next review."
      },
      preheader: "Code {code}: half off one review until Dec 10. New safety checks and fixed-price fixes.",
      eyebrow: "New in QA-lab URL Review",
      titles: { glass: "Your site, shielded.", night: "We scan where others don't.", editorial: "Found it. Fixed it. Fixed price." },
      lead: "Every review now runs six new safety checks. When one finds something, we can fix it for a fixed price, and check again for free.",
      checksTitle: "Six new checks in every review",
      checks: [
        ["Phishing and malware lists", "Google's lists and the Cloudflare URL Scanner, not just one source."],
        ["Every host your pages load", "Each third-party script, iframe, form and link checked with Google Web Risk."],
        ["Signs of a hacked site", "Spam injected into search results, cloaking for Googlebot, hidden links."],
        ["Lookalike domains", "Registered domains that imitate yours and have a website or mail server."],
        ["Spam blocklists", "Your domain and mail servers looked up on free public blocklists."],
        ["Mail authentication", "SPF, DKIM and DMARC read in depth, so no one sends mail as you."]
      ],
      fixTitle: "Fixed-price fixes, launch prices until Dec 10",
      fixLead: "Pay with PayPal. When the work is done, we re-review your site for free and send you the before and after.",
      fixDays: "about {days} working days",
      launchLabel: "Launch price until Dec 10",
      listLabel: "List US${usd}",
      codeTitle: "Your code for 50% off your next review",
      codeNote: "One use, valid until Dec 10, 2026. It takes half off a review; it does not apply to fix packages, which already carry their launch price.",
      cta: "Run your next review",
      cta2: "Book a 15-min call",
      heroAlt: {
        glass: "A glass shield turning in 3D, with six safety checks orbiting it",
        night: "A radar sweep finding phishing, lookalike and blocklist signals",
        editorial: "A 3D stack of fix package cards with their fixed prices"
      },
      why: "You get this one launch note because you ran a review at carlosandmunoz.com with this address.",
      stop: "Unsubscribe"
    },
    O: {
      subject: "{host}: is it on a phishing list? A free check",
      preheader: "Phishing lists, hacked-site signs, lookalike domains, blocklists and mail authentication. Fixes at a fixed price.",
      hello: "Hi {name},",
      helloAnon: "Hello,",
      intro: "I'm Carlos Muñoz. I run QA-lab URL Review, a website review made in Medellín. A review of {host} now checks the things that can cost a site its visitors overnight:",
      fixes: "The scores are free. If the review finds something, we fix it for a fixed price, from US${from}, and re-review the site for free when it is done.",
      report: "We already reviewed {host} on {date}: {count} findings, {critical} of them critical.",
      reportCta: "Open the report",
      cta: "Check {host} for free",
      sign: "Carlos",
      why: "You get this single note because {host} lists this address as its contact. Reply \"stop\" or use the link and we won't write again.",
      stop: "Don't write to me again"
    },
    S: {
      subject: "Your portfolio, checked like a security team would",
      preheader: "Phishing lists, hacked-site signs, HTTPS and more. Free for {days} days with your school email.",
      hello: "Hi {name},",
      helloAnon: "Hi,",
      intro: "Before a recruiter opens your portfolio, see what they would see. A QA-lab review now checks your site for:",
      extra: [
        ["HTTPS and redirects", "A valid certificate, one clean redirect, no mixed content."],
        ["Accessibility, SEO and speed", "Every finding comes with the fix for your stack."]
      ],
      offer: "Full reviews are free for {days} days with your school email, then {pct}% off your next one.",
      fixes: "Rather have it fixed for you? Fixed-price packages start at US${from}, with a free re-check when the work is done.",
      cta: "Start the free trial",
      sign: "Carlos, QA-lab URL Review",
      why: "You get this one note because you shared your portfolio and asked for feedback.",
      stop: "Don't write to me again"
    },
    F: {
      subject: "Your report on {host} found {n} things we can fix",
      preheader: "Fixed prices from US${from}, with a free re-review when the work is done.",
      eyebrow: "Fix what it found",
      title: "We can fix what your report found",
      lead: "The review of {host} found {n} issues our fixed-price packages cover. Pick one and we do the work; when it is live, we review the site again for free and send you the before and after.",
      one: "1 finding",
      many: "{count} findings",
      selfTitle: "Prefer to fix it yourself?",
      self: "Ask the report writes each fix for your stack, and a paid report includes one free re-check.",
      cta: "Ask us to fix it",
      noCoupon: "Codes and discounts apply to reviews, not to fix packages."
    }
  },
  es: {
    L: {
      subjects: {
        glass: "Tu sitio, blindado: nuevas comprobaciones de seguridad y 50% en tu próxima revisión",
        night: "Ahora escaneamos donde otros no miran. Dentro, 50% en tu próxima revisión.",
        editorial: "Lo encontramos, lo arreglamos, a precio fijo. Y 50% en tu próxima revisión."
      },
      preheader: "Código {code}: la mitad en una revisión hasta el 10 de dic. Nuevas comprobaciones y arreglos a precio fijo.",
      eyebrow: "Novedades en QA-lab URL Review",
      titles: { glass: "Tu sitio, blindado.", night: "Escaneamos donde otros no miran.", editorial: "Lo encontramos. Lo arreglamos. A precio fijo." },
      lead: "Cada revisión hace ahora seis comprobaciones de seguridad nuevas. Cuando una encuentra algo, podemos arreglarlo a precio fijo y volver a revisar gratis.",
      checksTitle: "Seis comprobaciones nuevas en cada revisión",
      checks: [
        ["Listas de phishing y malware", "Las listas de Google y el Cloudflare URL Scanner, no una sola fuente."],
        ["Cada host que cargan tus páginas", "Cada script, iframe, formulario y enlace de terceros, revisado con Google Web Risk."],
        ["Señales de un sitio hackeado", "Spam inyectado en los resultados de búsqueda, cloaking para Googlebot, enlaces ocultos."],
        ["Dominios parecidos", "Dominios registrados que imitan el tuyo y tienen web o servidor de correo."],
        ["Listas negras de spam", "Tu dominio y tus servidores de correo, consultados en listas públicas gratuitas."],
        ["Autenticación del correo", "SPF, DKIM y DMARC leídos a fondo, para que nadie envíe correo en tu nombre."]
      ],
      fixTitle: "Arreglos a precio fijo, precios de lanzamiento hasta el 10 de dic.",
      fixLead: "Pagas con PayPal. Cuando el trabajo está listo, revisamos tu sitio de nuevo gratis y te enviamos el antes y después.",
      fixDays: "unos {days} días hábiles",
      launchLabel: "Precio de lanzamiento hasta el 10 de dic.",
      listLabel: "Normal US${usd}",
      codeTitle: "Tu código: 50% en tu próxima revisión",
      codeNote: "Un uso, válido hasta el 10 de diciembre de 2026. Descuenta la mitad de una revisión; no aplica a los paquetes de arreglos, que ya tienen su precio de lanzamiento.",
      cta: "Haz tu próxima revisión",
      cta2: "Agenda una llamada de 15 min",
      heroAlt: {
        glass: "Un escudo de cristal que gira en 3D, con seis comprobaciones de seguridad orbitando",
        night: "Un barrido de radar que detecta señales de phishing, dominios parecidos y listas negras",
        editorial: "Una pila 3D de tarjetas de paquetes de arreglos con sus precios fijos"
      },
      why: "Recibes esta única nota del lanzamiento porque hiciste una revisión en carlosandmunoz.com con esta dirección.",
      stop: "Darse de baja"
    },
    O: {
      subject: "{host}: ¿está en una lista de phishing? Una revisión gratis",
      preheader: "Listas de phishing, señales de hackeo, dominios parecidos, listas negras y autenticación del correo. Arreglos a precio fijo.",
      hello: "Hola, {name}:",
      helloAnon: "Hola:",
      intro: "Soy Carlos Muñoz. Dirijo QA-lab URL Review, una revisión de sitios web hecha en Medellín. Una revisión de {host} comprueba ahora lo que puede costarle a un sitio sus visitas de un día para otro:",
      fixes: "Las puntuaciones son gratis. Si la revisión encuentra algo, lo arreglamos a precio fijo, desde US${from}, y volvemos a revisar el sitio gratis cuando está listo.",
      report: "Ya revisamos {host} el {date}: {count} hallazgos, {critical} de ellos críticos.",
      reportCta: "Abrir el informe",
      cta: "Revisa {host} gratis",
      sign: "Carlos",
      why: "Recibes esta única nota porque {host} publica esta dirección como contacto. Responde \"stop\" o usa el enlace y no volveremos a escribir.",
      stop: "No volver a escribirme"
    },
    S: {
      subject: "Tu portafolio, revisado como lo haría un equipo de seguridad",
      preheader: "Listas de phishing, señales de hackeo, HTTPS y más. Gratis por {days} días con tu correo de la universidad.",
      hello: "Hola, {name}:",
      helloAnon: "Hola:",
      intro: "Antes de que un reclutador abra tu portafolio, mira lo que vería. Una revisión de QA-lab comprueba ahora en tu sitio:",
      extra: [
        ["HTTPS y redirecciones", "Un certificado válido, una sola redirección limpia, sin contenido mixto."],
        ["Accesibilidad, SEO y velocidad", "Cada hallazgo trae el arreglo para tu stack."]
      ],
      offer: "Las revisiones completas son gratis por {days} días con tu correo de la universidad, y luego tienes {pct}% en la siguiente.",
      fixes: "¿Prefieres que te lo arreglemos? Los paquetes a precio fijo empiezan en US${from}, con una nueva revisión gratis cuando el trabajo está listo.",
      cta: "Empieza la prueba gratis",
      sign: "Carlos, QA-lab URL Review",
      why: "Recibes esta única nota porque compartiste tu portafolio y pediste opiniones.",
      stop: "No volver a escribirme"
    },
    F: {
      subject: "Tu informe de {host} encontró {n} cosas que podemos arreglar",
      preheader: "Precios fijos desde US${from}, con una nueva revisión gratis cuando el trabajo está listo.",
      eyebrow: "Arregla lo que encontró",
      title: "Podemos arreglar lo que encontró tu informe",
      lead: "La revisión de {host} encontró {n} problemas que cubren nuestros paquetes a precio fijo. Elige uno y hacemos el trabajo; cuando esté publicado, revisamos el sitio de nuevo gratis y te enviamos el antes y después.",
      one: "1 hallazgo",
      many: "{count} hallazgos",
      selfTitle: "¿Prefieres arreglarlo tú?",
      self: "Pregúntale al informe escribe cada arreglo para tu stack, y un informe pagado incluye una nueva revisión gratis.",
      cta: "Pídenos que lo arreglemos",
      noCoupon: "Los códigos y descuentos aplican a las revisiones, no a los paquetes de arreglos."
    }
  },
  pt: {
    L: {
      subjects: {
        glass: "Seu site, blindado: novas verificações de segurança e 50% na sua próxima revisão",
        night: "Agora escaneamos onde os outros não olham. 50% na sua próxima revisão.",
        editorial: "Encontramos, corrigimos, a preço fixo. E 50% na sua próxima revisão."
      },
      preheader: "Código {code}: metade do preço em uma revisão até 10 de dez. Novas verificações e correções a preço fixo.",
      eyebrow: "Novidades no QA-lab URL Review",
      titles: { glass: "Seu site, blindado.", night: "Escaneamos onde os outros não olham.", editorial: "Encontramos. Corrigimos. A preço fixo." },
      lead: "Cada revisão agora faz seis novas verificações de segurança. Quando uma encontra algo, podemos corrigir a preço fixo e revisar de novo de graça.",
      checksTitle: "Seis novas verificações em cada revisão",
      checks: [
        ["Listas de phishing e malware", "As listas do Google e o Cloudflare URL Scanner, não uma fonte só."],
        ["Cada host que suas páginas carregam", "Cada script, iframe, formulário e link de terceiros verificado com o Google Web Risk."],
        ["Sinais de site invadido", "Spam injetado nos resultados de busca, cloaking para o Googlebot, links ocultos."],
        ["Domínios parecidos", "Domínios registrados que imitam o seu e têm site ou servidor de e-mail."],
        ["Listas de bloqueio de spam", "Seu domínio e seus servidores de e-mail consultados em listas públicas gratuitas."],
        ["Autenticação de e-mail", "SPF, DKIM e DMARC lidos a fundo, para ninguém enviar e-mail em seu nome."]
      ],
      fixTitle: "Correções a preço fixo, preços de lançamento até 10 de dez.",
      fixLead: "Você paga com PayPal. Quando o trabalho termina, revisamos seu site de novo de graça e enviamos o antes e depois.",
      fixDays: "cerca de {days} dias úteis",
      launchLabel: "Preço de lançamento até 10 de dez.",
      listLabel: "Normal US${usd}",
      codeTitle: "Seu código: 50% na sua próxima revisão",
      codeNote: "Um uso, válido até 10 de dezembro de 2026. Desconta metade de uma revisão; não vale para os pacotes de correção, que já têm preço de lançamento.",
      cta: "Faça sua próxima revisão",
      cta2: "Agende uma conversa de 15 min",
      heroAlt: {
        glass: "Um escudo de vidro girando em 3D, com seis verificações de segurança em órbita",
        night: "Uma varredura de radar encontrando sinais de phishing, domínios parecidos e listas de bloqueio",
        editorial: "Uma pilha 3D de cartões de pacotes de correção com seus preços fixos"
      },
      why: "Você recebe esta única nota do lançamento porque fez uma revisão em carlosandmunoz.com com este endereço.",
      stop: "Cancelar inscrição"
    },
    O: {
      subject: "{host}: está em uma lista de phishing? Uma verificação grátis",
      preheader: "Listas de phishing, sinais de invasão, domínios parecidos, listas de bloqueio e autenticação de e-mail. Correções a preço fixo.",
      hello: "Olá, {name},",
      helloAnon: "Olá,",
      intro: "Sou Carlos Muñoz. Dirijo o QA-lab URL Review, uma revisão de sites feita em Medellín. Uma revisão de {host} agora verifica o que pode custar a um site os seus visitantes da noite para o dia:",
      fixes: "As notas são grátis. Se a revisão encontrar algo, corrigimos a preço fixo, a partir de US${from}, e revisamos o site de novo de graça quando estiver pronto.",
      report: "Já revisamos {host} em {date}: {count} achados, {critical} deles críticos.",
      reportCta: "Abrir o relatório",
      cta: "Verifique {host} de graça",
      sign: "Carlos",
      why: "Você recebe esta única nota porque {host} publica este endereço como contato. Responda \"stop\" ou use o link e não escreveremos de novo.",
      stop: "Não me escreva de novo"
    },
    S: {
      subject: "Seu portfólio, verificado como faria uma equipe de segurança",
      preheader: "Listas de phishing, sinais de invasão, HTTPS e mais. Grátis por {days} dias com seu e-mail da faculdade.",
      hello: "Oi, {name},",
      helloAnon: "Oi,",
      intro: "Antes que um recrutador abra seu portfólio, veja o que ele veria. Uma revisão do QA-lab agora verifica no seu site:",
      extra: [
        ["HTTPS e redirecionamentos", "Um certificado válido, um único redirecionamento limpo, sem conteúdo misto."],
        ["Acessibilidade, SEO e velocidade", "Cada achado vem com a correção para o seu stack."]
      ],
      offer: "As revisões completas são grátis por {days} dias com seu e-mail da faculdade, depois {pct}% na próxima.",
      fixes: "Prefere que a gente corrija? Os pacotes a preço fixo começam em US${from}, com uma nova verificação grátis quando o trabalho termina.",
      cta: "Começar o teste grátis",
      sign: "Carlos, QA-lab URL Review",
      why: "Você recebe esta única nota porque compartilhou seu portfólio e pediu opiniões.",
      stop: "Não me escreva de novo"
    },
    F: {
      subject: "Seu relatório de {host} encontrou {n} coisas que podemos corrigir",
      preheader: "Preços fixos a partir de US${from}, com uma nova revisão grátis quando o trabalho termina.",
      eyebrow: "Corrija o que ele encontrou",
      title: "Podemos corrigir o que seu relatório encontrou",
      lead: "A revisão de {host} encontrou {n} problemas que nossos pacotes a preço fixo cobrem. Escolha um e fazemos o trabalho; quando estiver no ar, revisamos o site de novo de graça e enviamos o antes e depois.",
      one: "1 achado",
      many: "{count} achados",
      selfTitle: "Prefere corrigir você mesmo?",
      self: "Pergunte ao relatório escreve cada correção para o seu stack, e um relatório pago inclui uma nova verificação grátis.",
      cta: "Peça para corrigirmos",
      noCoupon: "Códigos e descontos valem para revisões, não para pacotes de correção."
    }
  },
  de: {
    L: {
      subjects: {
        glass: "Ihre Website, abgeschirmt: neue Sicherheitsprüfungen und 50 % auf Ihre nächste Prüfung",
        night: "Wir prüfen jetzt, wo andere nicht hinsehen. 50 % auf Ihre nächste Prüfung.",
        editorial: "Gefunden, behoben, zum Festpreis. Und 50 % auf Ihre nächste Prüfung."
      },
      preheader: "Code {code}: die Hälfte auf eine Prüfung bis 10. Dez. Neue Sicherheitsprüfungen und Korrekturen zum Festpreis.",
      eyebrow: "Neu bei QA-lab URL Review",
      titles: { glass: "Ihre Website, abgeschirmt.", night: "Wir prüfen, wo andere nicht hinsehen.", editorial: "Gefunden. Behoben. Zum Festpreis." },
      lead: "Jede Prüfung führt jetzt sechs neue Sicherheitschecks durch. Findet einer etwas, beheben wir es zum Festpreis und prüfen danach kostenlos erneut.",
      checksTitle: "Sechs neue Checks in jeder Prüfung",
      checks: [
        ["Phishing- und Malware-Listen", "Die Listen von Google und der Cloudflare URL Scanner, nicht nur eine Quelle."],
        ["Jeder Host, den Ihre Seiten laden", "Jedes Drittanbieter-Skript, iframe, Formular und jeder Link, geprüft mit Google Web Risk."],
        ["Anzeichen eines Hacks", "In Suchergebnisse eingeschleuster Spam, Cloaking für Googlebot, versteckte Links."],
        ["Ähnliche Domains", "Registrierte Domains, die Ihre imitieren und eine Website oder einen Mailserver haben."],
        ["Spam-Blocklisten", "Ihre Domain und Ihre Mailserver, abgefragt in freien öffentlichen Blocklisten."],
        ["E-Mail-Authentifizierung", "SPF, DKIM und DMARC im Detail gelesen, damit niemand in Ihrem Namen Mails sendet."]
      ],
      fixTitle: "Korrekturen zum Festpreis, Einführungspreise bis 10. Dez.",
      fixLead: "Sie zahlen mit PayPal. Ist die Arbeit fertig, prüfen wir Ihre Website kostenlos erneut und senden Ihnen den Vorher-nachher-Vergleich.",
      fixDays: "etwa {days} Werktage",
      launchLabel: "Einführungspreis bis 10. Dez.",
      listLabel: "Listenpreis US${usd}",
      codeTitle: "Ihr Code: 50 % auf Ihre nächste Prüfung",
      codeNote: "Einmal einlösbar, gültig bis 10. Dezember 2026. Er halbiert den Preis einer Prüfung; für Korrekturpakete gilt er nicht, sie haben bereits ihren Einführungspreis.",
      cta: "Nächste Prüfung starten",
      cta2: "15-Minuten-Gespräch buchen",
      heroAlt: {
        glass: "Ein gläserner Schild, der sich in 3D dreht, umkreist von sechs Sicherheitschecks",
        night: "Ein Radarschwenk, der Phishing-, Doppelgänger- und Blocklisten-Signale findet",
        editorial: "Ein 3D-Stapel von Korrekturpaket-Karten mit ihren Festpreisen"
      },
      why: "Sie erhalten diese einmalige Nachricht zum Start, weil Sie mit dieser Adresse eine Prüfung auf carlosandmunoz.com durchgeführt haben.",
      stop: "Abmelden"
    },
    O: {
      subject: "{host}: Steht die Domain auf einer Phishing-Liste? Eine kostenlose Prüfung",
      preheader: "Phishing-Listen, Hack-Anzeichen, ähnliche Domains, Blocklisten und E-Mail-Authentifizierung. Korrekturen zum Festpreis.",
      hello: "Guten Tag {name},",
      helloAnon: "Guten Tag,",
      intro: "Ich bin Carlos Muñoz und betreibe QA-lab URL Review, eine Website-Prüfung aus Medellín. Eine Prüfung von {host} kontrolliert jetzt, was eine Website über Nacht ihre Besucher kosten kann:",
      fixes: "Die Bewertungen sind kostenlos. Findet die Prüfung etwas, beheben wir es zum Festpreis ab US${from} und prüfen die Website danach kostenlos erneut.",
      report: "Wir haben {host} am {date} bereits geprüft: {count} Befunde, davon {critical} kritisch.",
      reportCta: "Bericht öffnen",
      cta: "{host} kostenlos prüfen",
      sign: "Carlos",
      why: "Sie erhalten diese einzelne Nachricht, weil {host} diese Adresse als Kontakt angibt. Antworten Sie mit \"stop\" oder nutzen Sie den Link, dann schreiben wir nicht wieder.",
      stop: "Nicht mehr schreiben"
    },
    S: {
      subject: "Ihr Portfolio, geprüft wie von einem Sicherheitsteam",
      preheader: "Phishing-Listen, Hack-Anzeichen, HTTPS und mehr. {days} Tage kostenlos mit Ihrer Hochschul-Adresse.",
      hello: "Hallo {name},",
      helloAnon: "Hallo,",
      intro: "Bevor eine Recruiterin Ihr Portfolio öffnet, sehen Sie, was sie sehen würde. Eine QA-lab-Prüfung kontrolliert jetzt auf Ihrer Website:",
      extra: [
        ["HTTPS und Weiterleitungen", "Ein gültiges Zertifikat, eine saubere Weiterleitung, kein Mixed Content."],
        ["Barrierefreiheit, SEO und Tempo", "Zu jedem Befund gibt es die Korrektur für Ihren Stack."]
      ],
      offer: "Vollständige Prüfungen sind {days} Tage lang kostenlos mit Ihrer Hochschul-Adresse, danach {pct} % auf die nächste.",
      fixes: "Lieber beheben lassen? Festpreis-Pakete gibt es ab US${from}, mit einer kostenlosen Nachprüfung, wenn die Arbeit fertig ist.",
      cta: "Kostenlos testen",
      sign: "Carlos, QA-lab URL Review",
      why: "Sie erhalten diese einzelne Nachricht, weil Sie Ihr Portfolio geteilt und um Feedback gebeten haben.",
      stop: "Nicht mehr schreiben"
    },
    F: {
      subject: "Ihr Bericht zu {host} hat {n} Punkte gefunden, die wir beheben können",
      preheader: "Festpreise ab US${from}, mit einer kostenlosen Nachprüfung, wenn die Arbeit fertig ist.",
      eyebrow: "Beheben, was gefunden wurde",
      title: "Wir können beheben, was Ihr Bericht gefunden hat",
      lead: "Die Prüfung von {host} hat {n} Probleme gefunden, die unsere Festpreis-Pakete abdecken. Wählen Sie eines, wir erledigen die Arbeit; ist sie live, prüfen wir die Website kostenlos erneut und senden Ihnen den Vorher-nachher-Vergleich.",
      one: "1 Befund",
      many: "{count} Befunde",
      selfTitle: "Lieber selbst beheben?",
      self: "Den Bericht fragen schreibt jede Korrektur für Ihren Stack, und ein bezahlter Bericht enthält eine kostenlose Nachprüfung.",
      cta: "Uns um die Korrektur bitten",
      noCoupon: "Codes und Rabatte gelten für Prüfungen, nicht für Korrekturpakete."
    }
  },
  fr: {
    L: {
      subjects: {
        glass: "Votre site, protégé : nouveaux contrôles de sécurité et 50 % sur votre prochaine revue",
        night: "Nous scannons là où les autres ne regardent pas. 50 % sur votre prochaine revue.",
        editorial: "Trouvé, corrigé, à prix fixe. Et 50 % sur votre prochaine revue."
      },
      preheader: "Code {code} : moitié prix sur une revue jusqu'au 10 déc. Nouveaux contrôles et corrections à prix fixe.",
      eyebrow: "Nouveau dans QA-lab URL Review",
      titles: { glass: "Votre site, protégé.", night: "Nous scannons là où les autres ne regardent pas.", editorial: "Trouvé. Corrigé. À prix fixe." },
      lead: "Chaque revue effectue désormais six nouveaux contrôles de sécurité. Quand l'un d'eux trouve quelque chose, nous pouvons le corriger à prix fixe, puis revérifier gratuitement.",
      checksTitle: "Six nouveaux contrôles dans chaque revue",
      checks: [
        ["Listes de phishing et de malware", "Les listes de Google et le Cloudflare URL Scanner, pas une seule source."],
        ["Chaque hôte que vos pages chargent", "Chaque script, iframe, formulaire et lien tiers vérifié avec Google Web Risk."],
        ["Signes d'un site piraté", "Spam injecté dans les résultats de recherche, cloaking pour Googlebot, liens cachés."],
        ["Domaines sosies", "Des domaines enregistrés qui imitent le vôtre et ont un site ou un serveur de messagerie."],
        ["Listes noires de spam", "Votre domaine et vos serveurs de messagerie consultés sur des listes publiques gratuites."],
        ["Authentification des e-mails", "SPF, DKIM et DMARC lus en détail, pour que personne n'envoie d'e-mails en votre nom."]
      ],
      fixTitle: "Corrections à prix fixe, prix de lancement jusqu'au 10 déc.",
      fixLead: "Vous payez avec PayPal. Une fois le travail terminé, nous revoyons votre site gratuitement et vous envoyons l'avant/après.",
      fixDays: "environ {days} jours ouvrés",
      launchLabel: "Prix de lancement jusqu'au 10 déc.",
      listLabel: "Prix normal US${usd}",
      codeTitle: "Votre code : 50 % sur votre prochaine revue",
      codeNote: "Usage unique, valable jusqu'au 10 décembre 2026. Il divise par deux le prix d'une revue ; il ne s'applique pas aux forfaits de correction, qui ont déjà leur prix de lancement.",
      cta: "Lancer ma prochaine revue",
      cta2: "Réserver un appel de 15 min",
      heroAlt: {
        glass: "Un bouclier de verre qui tourne en 3D, entouré de six contrôles de sécurité en orbite",
        night: "Un balayage radar qui repère des signaux de phishing, de domaines sosies et de listes noires",
        editorial: "Une pile 3D de cartes de forfaits de correction avec leurs prix fixes"
      },
      why: "Vous recevez ce message de lancement unique parce que vous avez lancé une revue sur carlosandmunoz.com avec cette adresse.",
      stop: "Se désinscrire"
    },
    O: {
      subject: "{host} : est-il sur une liste de phishing ? Une vérification gratuite",
      preheader: "Listes de phishing, signes de piratage, domaines sosies, listes noires et authentification des e-mails. Corrections à prix fixe.",
      hello: "Bonjour {name},",
      helloAnon: "Bonjour,",
      intro: "Je suis Carlos Muñoz. Je dirige QA-lab URL Review, une revue de sites web faite à Medellín. Une revue de {host} vérifie désormais ce qui peut faire perdre ses visiteurs à un site du jour au lendemain :",
      fixes: "Les scores sont gratuits. Si la revue trouve quelque chose, nous le corrigeons à prix fixe, à partir de US${from}, puis revoyons le site gratuitement une fois le travail fini.",
      report: "Nous avons déjà revu {host} le {date} : {count} constats, dont {critical} critiques.",
      reportCta: "Ouvrir le rapport",
      cta: "Vérifier {host} gratuitement",
      sign: "Carlos",
      why: "Vous recevez ce message unique parce que {host} indique cette adresse comme contact. Répondez « stop » ou utilisez le lien et nous n'écrirons plus.",
      stop: "Ne plus m'écrire"
    },
    S: {
      subject: "Votre portfolio, vérifié comme le ferait une équipe sécurité",
      preheader: "Listes de phishing, signes de piratage, HTTPS et plus. Gratuit pendant {days} jours avec votre adresse d'école.",
      hello: "Bonjour {name},",
      helloAnon: "Bonjour,",
      intro: "Avant qu'un recruteur n'ouvre votre portfolio, voyez ce qu'il verrait. Une revue QA-lab vérifie désormais sur votre site :",
      extra: [
        ["HTTPS et redirections", "Un certificat valide, une seule redirection propre, aucun contenu mixte."],
        ["Accessibilité, SEO et vitesse", "Chaque constat arrive avec la correction pour votre stack."]
      ],
      offer: "Les revues complètes sont gratuites pendant {days} jours avec votre adresse d'école, puis {pct} % sur la suivante.",
      fixes: "Vous préférez qu'on corrige pour vous ? Les forfaits à prix fixe commencent à US${from}, avec une revérification gratuite une fois le travail fini.",
      cta: "Commencer l'essai gratuit",
      sign: "Carlos, QA-lab URL Review",
      why: "Vous recevez ce message unique parce que vous avez partagé votre portfolio en demandant des avis.",
      stop: "Ne plus m'écrire"
    },
    F: {
      subject: "Votre rapport sur {host} a trouvé {n} points que nous pouvons corriger",
      preheader: "Prix fixes à partir de US${from}, avec une nouvelle revue gratuite une fois le travail fini.",
      eyebrow: "Corriger ce qu'il a trouvé",
      title: "Nous pouvons corriger ce que votre rapport a trouvé",
      lead: "La revue de {host} a trouvé {n} problèmes couverts par nos forfaits à prix fixe. Choisissez-en un et nous faisons le travail ; une fois en ligne, nous revoyons le site gratuitement et vous envoyons l'avant/après.",
      one: "1 constat",
      many: "{count} constats",
      selfTitle: "Vous préférez corriger vous-même ?",
      self: "Interroger le rapport rédige chaque correction pour votre stack, et un rapport payé inclut une revérification gratuite.",
      cta: "Nous demander de corriger",
      noCoupon: "Les codes et remises s'appliquent aux revues, pas aux forfaits de correction."
    }
  },
  it: {
    L: {
      subjects: {
        glass: "Il tuo sito, protetto: nuovi controlli di sicurezza e 50% sulla prossima revisione",
        night: "Ora scansioniamo dove gli altri non guardano. 50% sulla prossima revisione.",
        editorial: "Trovato, corretto, a prezzo fisso. E 50% sulla prossima revisione."
      },
      preheader: "Codice {code}: metà prezzo su una revisione fino al 10 dic. Nuovi controlli e correzioni a prezzo fisso.",
      eyebrow: "Novità in QA-lab URL Review",
      titles: { glass: "Il tuo sito, protetto.", night: "Scansioniamo dove gli altri non guardano.", editorial: "Trovato. Corretto. A prezzo fisso." },
      lead: "Ogni revisione ora esegue sei nuovi controlli di sicurezza. Quando uno trova qualcosa, possiamo correggerlo a prezzo fisso e ricontrollare gratis.",
      checksTitle: "Sei nuovi controlli in ogni revisione",
      checks: [
        ["Liste di phishing e malware", "Le liste di Google e il Cloudflare URL Scanner, non una sola fonte."],
        ["Ogni host che le tue pagine caricano", "Ogni script, iframe, modulo e link di terze parti verificato con Google Web Risk."],
        ["Segni di un sito violato", "Spam iniettato nei risultati di ricerca, cloaking per Googlebot, link nascosti."],
        ["Domini sosia", "Domini registrati che imitano il tuo e hanno un sito o un server di posta."],
        ["Blocklist antispam", "Il tuo dominio e i tuoi server di posta cercati in blocklist pubbliche gratuite."],
        ["Autenticazione della posta", "SPF, DKIM e DMARC letti a fondo, perché nessuno invii posta a tuo nome."]
      ],
      fixTitle: "Correzioni a prezzo fisso, prezzi di lancio fino al 10 dic.",
      fixLead: "Paghi con PayPal. Quando il lavoro è finito, rivediamo il sito gratis e ti inviamo il prima e dopo.",
      fixDays: "circa {days} giorni lavorativi",
      launchLabel: "Prezzo di lancio fino al 10 dic.",
      listLabel: "Listino US${usd}",
      codeTitle: "Il tuo codice: 50% sulla prossima revisione",
      codeNote: "Un solo uso, valido fino al 10 dicembre 2026. Dimezza il prezzo di una revisione; non vale per i pacchetti di correzione, che hanno già il prezzo di lancio.",
      cta: "Avvia la prossima revisione",
      cta2: "Prenota una chiamata di 15 min",
      heroAlt: {
        glass: "Uno scudo di vetro che ruota in 3D, con sei controlli di sicurezza in orbita",
        night: "Una scansione radar che trova segnali di phishing, domini sosia e blocklist",
        editorial: "Una pila 3D di schede dei pacchetti di correzione con i loro prezzi fissi"
      },
      why: "Ricevi questa unica nota di lancio perché hai eseguito una revisione su carlosandmunoz.com con questo indirizzo.",
      stop: "Annulla l'iscrizione"
    },
    O: {
      subject: "{host}: è in una lista di phishing? Un controllo gratuito",
      preheader: "Liste di phishing, segni di violazione, domini sosia, blocklist e autenticazione della posta. Correzioni a prezzo fisso.",
      hello: "Ciao {name},",
      helloAnon: "Buongiorno,",
      intro: "Sono Carlos Muñoz e gestisco QA-lab URL Review, una revisione di siti web fatta a Medellín. Una revisione di {host} ora controlla ciò che può far perdere a un sito i suoi visitatori dall'oggi al domani:",
      fixes: "I punteggi sono gratuiti. Se la revisione trova qualcosa, lo correggiamo a prezzo fisso, da US${from}, e rivediamo il sito gratis quando il lavoro è finito.",
      report: "Abbiamo già rivisto {host} il {date}: {count} risultati, {critical} dei quali critici.",
      reportCta: "Apri il report",
      cta: "Controlla {host} gratis",
      sign: "Carlos",
      why: "Ricevi questa unica nota perché {host} indica questo indirizzo come contatto. Rispondi \"stop\" o usa il link e non scriveremo più.",
      stop: "Non scrivermi più"
    },
    S: {
      subject: "Il tuo portfolio, controllato come farebbe un team di sicurezza",
      preheader: "Liste di phishing, segni di violazione, HTTPS e altro. Gratis per {days} giorni con la tua email universitaria.",
      hello: "Ciao {name},",
      helloAnon: "Ciao,",
      intro: "Prima che un recruiter apra il tuo portfolio, guarda cosa vedrebbe. Una revisione QA-lab ora controlla sul tuo sito:",
      extra: [
        ["HTTPS e reindirizzamenti", "Un certificato valido, un solo reindirizzamento pulito, nessun contenuto misto."],
        ["Accessibilità, SEO e velocità", "Ogni risultato arriva con la correzione per il tuo stack."]
      ],
      offer: "Le revisioni complete sono gratis per {days} giorni con la tua email universitaria, poi il {pct}% sulla successiva.",
      fixes: "Preferisci che lo correggiamo noi? I pacchetti a prezzo fisso partono da US${from}, con un nuovo controllo gratuito a lavoro finito.",
      cta: "Inizia la prova gratuita",
      sign: "Carlos, QA-lab URL Review",
      why: "Ricevi questa unica nota perché hai condiviso il tuo portfolio chiedendo un parere.",
      stop: "Non scrivermi più"
    },
    F: {
      subject: "Il tuo report su {host} ha trovato {n} cose che possiamo correggere",
      preheader: "Prezzi fissi da US${from}, con una nuova revisione gratuita a lavoro finito.",
      eyebrow: "Correggi ciò che ha trovato",
      title: "Possiamo correggere ciò che ha trovato il tuo report",
      lead: "La revisione di {host} ha trovato {n} problemi coperti dai nostri pacchetti a prezzo fisso. Scegline uno e facciamo il lavoro; quando è online, rivediamo il sito gratis e ti inviamo il prima e dopo.",
      one: "1 risultato",
      many: "{count} risultati",
      selfTitle: "Preferisci correggere da solo?",
      self: "Chiedi al report scrive ogni correzione per il tuo stack, e un report pagato include un nuovo controllo gratuito.",
      cta: "Chiedici di correggerlo",
      noCoupon: "Codici e sconti valgono per le revisioni, non per i pacchetti di correzione."
    }
  }
};
