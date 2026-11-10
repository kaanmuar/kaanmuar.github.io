/**
 * Fix what the report found (#3082): every open finding gets "Get the fix" (Ask the report, on a paid report)
 * and "Fix this for me", and the report ends with the four paths: fix it yourself, a fixed-price package,
 * a quote, or a call. Requests go to /review/fix/request; prices come from functions/url-review-fix-offers.js.
 * A package is paid through the review checkout (#3102); a paid report also gets one free re-check after the client's own fix.
 */
(function (root) {
  "use strict";

  const T = {
    en: {
      getFix: "Get the fix", fixForMe: "Fix this for me",
      eyebrow: "Fix what this report found", title: "How do you want these fixed?",
      lead: "Open findings: {n}. Pick the path that suits you.",
      selfTitle: "Fix it yourself", selfCopy: "Ask the report writes the fix for the stack this review saw, the Playwright case that proves it, and a GitHub or Jira issue draft.",
      selfButton: "Open Ask the report", selfLocked: "Ask the report opens with the full report.",
      packTitle: "Fixed-price packages", packCopy: "We fix one area for a set price, then tell you when it is live.",
      packLine: "US${usd} · about {days} working days", packLaunch: "Launch price until Dec 10", packList: "List price US${usd}", packCovers: "Covers {list}", packOrder: "Order",
      quoteTitle: "We fix it for you", quoteCopy: "Tell us which findings to fix and how to reach the site. Carlos replies with a quote within two working days.", quoteButton: "Ask for a quote",
      callTitle: "Talk it through", callCopy: "A 30-minute call on these findings and what to fix first.", callButton: "Book a call",
      formTitle: "Ask us to fix it", formLead: "Pick a package and pay now with PayPal, or ask for a quote: Carlos replies within two working days with a price, a date and the access we need.",
      findingsLabel: "Findings to fix", packageLabel: "Package", packageNone: "No package, quote me",
      priceLine: "{name}: US${usd}, about {days} working days. You pay now with PayPal; when the fix is done we re-review the site for free and send you the before/after.",
      accessLabel: "How we reach the site (optional)", accessHint: "Host, CMS or repository, and who can give us access. Do not send passwords here.",
      deadlineLabel: "Deadline (optional)", budgetLabel: "Budget (optional)",
      payButton: "Send and pay US${usd}", paying: "Opening PayPal…", payLater: "Your request is saved, but PayPal did not open. Carlos will email you a pay link.",
      recheckCopy: "When your changes are live, re-check this report once for free and get the before/after by email.", recheckButton: "Re-check for free", rechecking: "Starting…",
      recheckSent: "We are reviewing the site again. The before/after arrives at {email} in a few minutes.", recheckUsed: "The free re-check of this report was already used.", recheckFailed: "The re-check did not start. Try again in a moment.",
      paidBanner: "Payment received. Carlos starts the fix within two working days; when it is done we re-review the site for free and email you the before/after.",
      submit: "Send the request", sending: "Sending…", close: "Close",
      pickOne: "Pick at least one finding.",
      doneTitle: "Request sent", done: "We emailed a copy to {email}. Carlos replies within two working days.",
      signIn: "Sign in with the account that ran this report to send the request.", signInButton: "Sign in",
      expired: "Your sign-in has expired. Sign in again with the account that ran this report.",
      notOwner: "Only the account that ran this report can ask us to fix it.",
      notFound: "That report was not found.",
      invalid: "Check the findings and the deadline, then send again.",
      limit: "You sent several requests today. Write to qa@carlosandmunoz.com for more.",
      failed: "The request did not go out. Try again in a moment."
    },
    es: {
      getFix: "Ver el arreglo", fixForMe: "Arréglenlo por mí",
      eyebrow: "Arregla lo que encontró este informe", title: "¿Cómo quieres arreglarlos?",
      lead: "Hallazgos abiertos: {n}. Elige el camino que te sirva.",
      selfTitle: "Arréglalo tú", selfCopy: "Pregúntale al informe escribe el arreglo para el stack que vio esta revisión, el caso de Playwright que lo comprueba y un borrador de issue para GitHub o Jira.",
      selfButton: "Abrir Pregúntale al informe", selfLocked: "Pregúntale al informe se abre con el informe completo.",
      packTitle: "Paquetes de precio fijo", packCopy: "Arreglamos un área por un precio fijo y te avisamos cuando esté en producción.",
      packLine: "US${usd} · unos {days} días hábiles", packLaunch: "Precio de lanzamiento hasta el 10 de dic.", packList: "Precio normal US${usd}", packCovers: "Cubre {list}", packOrder: "Pedir",
      quoteTitle: "Lo arreglamos por ti", quoteCopy: "Dinos qué hallazgos arreglar y cómo llegar al sitio. Carlos responde con una cotización en dos días hábiles.", quoteButton: "Pedir una cotización",
      callTitle: "Hablémoslo", callCopy: "Una llamada de 30 minutos sobre estos hallazgos y qué arreglar primero.", callButton: "Reservar una llamada",
      formTitle: "Pídenos que lo arreglemos", formLead: "Elige un paquete y paga ahora con PayPal, o pide una cotización: Carlos responde en dos días hábiles con un precio, una fecha y el acceso que necesitamos.",
      findingsLabel: "Hallazgos para arreglar", packageLabel: "Paquete", packageNone: "Sin paquete, quiero una cotización",
      priceLine: "{name}: US${usd}, unos {days} días hábiles. Pagas ahora con PayPal; cuando el arreglo esté listo revisamos el sitio de nuevo gratis y te enviamos el antes y después.",
      accessLabel: "Cómo llegamos al sitio (opcional)", accessHint: "Hosting, CMS o repositorio, y quién puede darnos acceso. No envíes contraseñas aquí.",
      deadlineLabel: "Fecha límite (opcional)", budgetLabel: "Presupuesto (opcional)",
      payButton: "Enviar y pagar US${usd}", paying: "Abriendo PayPal…", payLater: "Tu solicitud quedó guardada, pero PayPal no se abrió. Carlos te enviará un enlace de pago por correo.",
      recheckCopy: "Cuando tus cambios estén publicados, vuelve a revisar este informe una vez gratis y recibe el antes y después por correo.", recheckButton: "Revisar de nuevo gratis", rechecking: "Iniciando…",
      recheckSent: "Estamos revisando el sitio de nuevo. El antes y después llega a {email} en unos minutos.", recheckUsed: "La revisión gratuita de este informe ya se usó.", recheckFailed: "La revisión no empezó. Inténtalo de nuevo en un momento.",
      paidBanner: "Pago recibido. Carlos empieza el arreglo en dos días hábiles; cuando esté listo revisamos el sitio de nuevo gratis y te enviamos el antes y después.",
      submit: "Enviar la solicitud", sending: "Enviando…", close: "Cerrar",
      pickOne: "Elige al menos un hallazgo.",
      doneTitle: "Solicitud enviada", done: "Enviamos una copia a {email}. Carlos responde en dos días hábiles.",
      signIn: "Inicia sesión con la cuenta que hizo este informe para enviar la solicitud.", signInButton: "Iniciar sesión",
      expired: "Tu sesión venció. Inicia sesión de nuevo con la cuenta que hizo este informe.",
      notOwner: "Solo la cuenta que hizo este informe puede pedirnos que lo arreglemos.",
      notFound: "No encontramos ese informe.",
      invalid: "Revisa los hallazgos y la fecha límite, y envía de nuevo.",
      limit: "Enviaste varias solicitudes hoy. Escribe a qa@carlosandmunoz.com para más.",
      failed: "La solicitud no salió. Intenta de nuevo en un momento."
    },
    pt: {
      getFix: "Ver a correção", fixForMe: "Corrijam para mim",
      eyebrow: "Corrija o que este relatório encontrou", title: "Como você quer corrigir isso?",
      lead: "Achados em aberto: {n}. Escolha o caminho que serve para você.",
      selfTitle: "Corrija você mesmo", selfCopy: "Pergunte ao relatório escreve a correção para o stack que esta revisão viu, o caso de Playwright que a comprova e um rascunho de issue para GitHub ou Jira.",
      selfButton: "Abrir Pergunte ao relatório", selfLocked: "Pergunte ao relatório abre com o relatório completo.",
      packTitle: "Pacotes de preço fixo", packCopy: "Corrigimos uma área por um preço fixo e avisamos quando estiver no ar.",
      packLine: "US${usd} · cerca de {days} dias úteis", packLaunch: "Preço de lançamento até 10 de dez.", packList: "Preço normal US${usd}", packCovers: "Cobre {list}", packOrder: "Pedir",
      quoteTitle: "Nós corrigimos para você", quoteCopy: "Diga quais achados corrigir e como acessar o site. Carlos responde com um orçamento em dois dias úteis.", quoteButton: "Pedir um orçamento",
      callTitle: "Vamos conversar", callCopy: "Uma chamada de 30 minutos sobre estes achados e o que corrigir primeiro.", callButton: "Agendar uma chamada",
      formTitle: "Peça para corrigirmos", formLead: "Escolha um pacote e pague agora com PayPal, ou peça um orçamento: Carlos responde em dois dias úteis com um preço, uma data e o acesso de que precisamos.",
      findingsLabel: "Achados para corrigir", packageLabel: "Pacote", packageNone: "Sem pacote, quero um orçamento",
      priceLine: "{name}: US${usd}, cerca de {days} dias úteis. Você paga agora com PayPal; quando a correção estiver pronta, revisamos o site de novo de graça e enviamos o antes e depois.",
      accessLabel: "Como acessamos o site (opcional)", accessHint: "Host, CMS ou repositório, e quem pode nos dar acesso. Não envie senhas aqui.",
      deadlineLabel: "Prazo (opcional)", budgetLabel: "Orçamento disponível (opcional)",
      payButton: "Enviar e pagar US${usd}", paying: "Abrindo o PayPal…", payLater: "Seu pedido foi salvo, mas o PayPal não abriu. Carlos vai enviar um link de pagamento por e-mail.",
      recheckCopy: "Quando suas mudanças estiverem no ar, revise este relatório de novo uma vez de graça e receba o antes e depois por e-mail.", recheckButton: "Revisar de novo de graça", rechecking: "Iniciando…",
      recheckSent: "Estamos revisando o site de novo. O antes e depois chega em {email} em alguns minutos.", recheckUsed: "A revisão gratuita deste relatório já foi usada.", recheckFailed: "A revisão não começou. Tente de novo em instantes.",
      paidBanner: "Pagamento recebido. Carlos começa a correção em dois dias úteis; quando estiver pronta, revisamos o site de novo de graça e enviamos o antes e depois por e-mail.",
      submit: "Enviar o pedido", sending: "Enviando…", close: "Fechar",
      pickOne: "Escolha pelo menos um achado.",
      doneTitle: "Pedido enviado", done: "Enviamos uma cópia para {email}. Carlos responde em dois dias úteis.",
      signIn: "Entre com a conta que fez este relatório para enviar o pedido.", signInButton: "Entrar",
      expired: "Sua sessão expirou. Entre de novo com a conta que fez este relatório.",
      notOwner: "Só a conta que fez este relatório pode pedir para corrigirmos.",
      notFound: "Não encontramos esse relatório.",
      invalid: "Confira os achados e o prazo, e envie de novo.",
      limit: "Você enviou vários pedidos hoje. Escreva para qa@carlosandmunoz.com para mais.",
      failed: "O pedido não saiu. Tente de novo em instantes."
    },
    de: {
      getFix: "Korrektur ansehen", fixForMe: "Für mich beheben",
      eyebrow: "Beheben, was dieser Bericht gefunden hat", title: "Wie möchten Sie das beheben?",
      lead: "Offene Befunde: {n}. Wählen Sie den Weg, der zu Ihnen passt.",
      selfTitle: "Selbst beheben", selfCopy: "Den Bericht fragen schreibt die Korrektur für den Stack, den diese Prüfung gesehen hat, den Playwright-Fall, der sie belegt, und einen Issue-Entwurf für GitHub oder Jira.",
      selfButton: "Den Bericht fragen öffnen", selfLocked: "Den Bericht fragen öffnet sich mit dem vollständigen Bericht.",
      packTitle: "Pakete zum Festpreis", packCopy: "Wir beheben einen Bereich zum Festpreis und sagen Ihnen, wann es live ist.",
      packLine: "US${usd} · etwa {days} Werktage", packLaunch: "Einführungspreis bis 10. Dez.", packList: "Listenpreis US${usd}", packCovers: "Umfasst {list}", packOrder: "Bestellen",
      quoteTitle: "Wir beheben es für Sie", quoteCopy: "Sagen Sie uns, welche Befunde wir beheben sollen und wie wir die Website erreichen. Carlos antwortet innerhalb von zwei Werktagen mit einem Angebot.", quoteButton: "Angebot anfragen",
      callTitle: "Darüber sprechen", callCopy: "Ein 30-minütiges Gespräch über diese Befunde und was zuerst zu beheben ist.", callButton: "Gespräch buchen",
      formTitle: "Bitten Sie uns um die Korrektur", formLead: "Wählen Sie ein Paket und zahlen Sie jetzt mit PayPal, oder fragen Sie nach einem Angebot: Carlos antwortet innerhalb von zwei Werktagen mit Preis, Termin und dem Zugang, den wir brauchen.",
      findingsLabel: "Zu behebende Befunde", packageLabel: "Paket", packageNone: "Kein Paket, Angebot erwünscht",
      priceLine: "{name}: US${usd}, etwa {days} Werktage. Sie zahlen jetzt mit PayPal; ist die Korrektur fertig, prüfen wir die Website kostenlos erneut und senden Ihnen den Vorher-nachher-Vergleich.",
      accessLabel: "Wie wir die Website erreichen (optional)", accessHint: "Host, CMS oder Repository, und wer uns Zugang geben kann. Senden Sie hier keine Passwörter.",
      deadlineLabel: "Frist (optional)", budgetLabel: "Budget (optional)",
      payButton: "Senden und US${usd} zahlen", paying: "PayPal wird geöffnet…", payLater: "Ihre Anfrage ist gespeichert, aber PayPal hat sich nicht geöffnet. Carlos schickt Ihnen einen Zahlungslink per E-Mail.",
      recheckCopy: "Sind Ihre Änderungen live, prüfen Sie diesen Bericht einmal kostenlos erneut und erhalten den Vorher-nachher-Vergleich per E-Mail.", recheckButton: "Kostenlos erneut prüfen", rechecking: "Wird gestartet…",
      recheckSent: "Wir prüfen die Website erneut. Der Vorher-nachher-Vergleich kommt in wenigen Minuten an {email}.", recheckUsed: "Die kostenlose erneute Prüfung dieses Berichts wurde schon genutzt.", recheckFailed: "Die erneute Prüfung ist nicht gestartet. Versuchen Sie es gleich noch einmal.",
      paidBanner: "Zahlung erhalten. Carlos beginnt die Korrektur innerhalb von zwei Werktagen; danach prüfen wir die Website kostenlos erneut und senden Ihnen den Vorher-nachher-Vergleich.",
      submit: "Anfrage senden", sending: "Wird gesendet…", close: "Schließen",
      pickOne: "Wählen Sie mindestens einen Befund.",
      doneTitle: "Anfrage gesendet", done: "Wir haben eine Kopie an {email} geschickt. Carlos antwortet innerhalb von zwei Werktagen.",
      signIn: "Melden Sie sich mit dem Konto an, das diesen Bericht erstellt hat, um die Anfrage zu senden.", signInButton: "Anmelden",
      expired: "Ihre Anmeldung ist abgelaufen. Melden Sie sich erneut mit dem Konto an, das diesen Bericht erstellt hat.",
      notOwner: "Nur das Konto, das diesen Bericht erstellt hat, kann uns um die Korrektur bitten.",
      notFound: "Dieser Bericht wurde nicht gefunden.",
      invalid: "Prüfen Sie die Befunde und die Frist und senden Sie erneut.",
      limit: "Sie haben heute mehrere Anfragen gesendet. Schreiben Sie für weitere an qa@carlosandmunoz.com.",
      failed: "Die Anfrage wurde nicht gesendet. Versuchen Sie es gleich noch einmal."
    },
    fr: {
      getFix: "Voir le correctif", fixForMe: "Corrigez-le pour moi",
      eyebrow: "Corriger ce que ce rapport a trouvé", title: "Comment voulez-vous les corriger ?",
      lead: "Constats ouverts : {n}. Choisissez la voie qui vous convient.",
      selfTitle: "Corrigez vous-même", selfCopy: "Interroger le rapport écrit le correctif pour la pile vue par cette revue, le cas Playwright qui le prouve et un brouillon de ticket GitHub ou Jira.",
      selfButton: "Ouvrir Interroger le rapport", selfLocked: "Interroger le rapport s'ouvre avec le rapport complet.",
      packTitle: "Forfaits à prix fixe", packCopy: "Nous corrigeons un domaine à prix fixe, puis vous prévenons quand c'est en ligne.",
      packLine: "US${usd} · environ {days} jours ouvrés", packLaunch: "Prix de lancement jusqu'au 10 déc.", packList: "Prix normal US${usd}", packCovers: "Couvre {list}", packOrder: "Commander",
      quoteTitle: "Nous corrigeons pour vous", quoteCopy: "Dites-nous quels constats corriger et comment accéder au site. Carlos répond avec un devis sous deux jours ouvrés.", quoteButton: "Demander un devis",
      callTitle: "En parler", callCopy: "Un appel de 30 minutes sur ces constats et ce qu'il faut corriger d'abord.", callButton: "Réserver un appel",
      formTitle: "Demandez-nous de corriger", formLead: "Choisissez un forfait et payez maintenant avec PayPal, ou demandez un devis : Carlos répond sous deux jours ouvrés avec un prix, une date et l'accès dont nous avons besoin.",
      findingsLabel: "Constats à corriger", packageLabel: "Forfait", packageNone: "Pas de forfait, je veux un devis",
      priceLine: "{name} : US${usd}, environ {days} jours ouvrés. Vous payez maintenant avec PayPal ; une fois la correction faite, nous revoyons le site gratuitement et vous envoyons l'avant/après.",
      accessLabel: "Comment accéder au site (facultatif)", accessHint: "Hébergeur, CMS ou dépôt, et qui peut nous donner accès. N'envoyez pas de mots de passe ici.",
      deadlineLabel: "Échéance (facultatif)", budgetLabel: "Budget (facultatif)",
      payButton: "Envoyer et payer US${usd}", paying: "Ouverture de PayPal…", payLater: "Votre demande est enregistrée, mais PayPal ne s'est pas ouvert. Carlos vous enverra un lien de paiement par e-mail.",
      recheckCopy: "Quand vos changements sont en ligne, revoyez ce rapport une fois gratuitement et recevez l'avant/après par e-mail.", recheckButton: "Revoir gratuitement", rechecking: "Démarrage…",
      recheckSent: "Nous revoyons le site. L'avant/après arrive à {email} dans quelques minutes.", recheckUsed: "La nouvelle revue gratuite de ce rapport a déjà été utilisée.", recheckFailed: "La nouvelle revue n'a pas démarré. Réessayez dans un instant.",
      paidBanner: "Paiement reçu. Carlos commence la correction sous deux jours ouvrés ; une fois terminée, nous revoyons le site gratuitement et vous envoyons l'avant/après.",
      submit: "Envoyer la demande", sending: "Envoi…", close: "Fermer",
      pickOne: "Choisissez au moins un constat.",
      doneTitle: "Demande envoyée", done: "Nous avons envoyé une copie à {email}. Carlos répond sous deux jours ouvrés.",
      signIn: "Connectez-vous avec le compte qui a lancé ce rapport pour envoyer la demande.", signInButton: "Se connecter",
      expired: "Votre session a expiré. Reconnectez-vous avec le compte qui a lancé ce rapport.",
      notOwner: "Seul le compte qui a lancé ce rapport peut nous demander de le corriger.",
      notFound: "Ce rapport est introuvable.",
      invalid: "Vérifiez les constats et l'échéance, puis renvoyez.",
      limit: "Vous avez envoyé plusieurs demandes aujourd'hui. Écrivez à qa@carlosandmunoz.com pour d'autres.",
      failed: "La demande n'est pas partie. Réessayez dans un instant."
    },
    it: {
      getFix: "Vedi la correzione", fixForMe: "Correggetelo per me",
      eyebrow: "Correggi ciò che ha trovato questo report", title: "Come vuoi correggerli?",
      lead: "Risultati aperti: {n}. Scegli la strada più adatta a te.",
      selfTitle: "Correggilo tu", selfCopy: "Chiedi al report scrive la correzione per lo stack visto da questa revisione, il caso Playwright che la dimostra e una bozza di issue per GitHub o Jira.",
      selfButton: "Apri Chiedi al report", selfLocked: "Chiedi al report si apre con il report completo.",
      packTitle: "Pacchetti a prezzo fisso", packCopy: "Correggiamo un'area a prezzo fisso e ti avvisiamo quando è online.",
      packLine: "US${usd} · circa {days} giorni lavorativi", packLaunch: "Prezzo di lancio fino al 10 dic.", packList: "Prezzo di listino US${usd}", packCovers: "Copre {list}", packOrder: "Ordina",
      quoteTitle: "Lo correggiamo noi", quoteCopy: "Dicci quali risultati correggere e come raggiungere il sito. Carlos risponde con un preventivo entro due giorni lavorativi.", quoteButton: "Chiedi un preventivo",
      callTitle: "Parliamone", callCopy: "Una chiamata di 30 minuti su questi risultati e su cosa correggere per primo.", callButton: "Prenota una chiamata",
      formTitle: "Chiedici di correggerlo", formLead: "Scegli un pacchetto e paga ora con PayPal, oppure chiedi un preventivo: Carlos risponde entro due giorni lavorativi con un prezzo, una data e l'accesso che ci serve.",
      findingsLabel: "Risultati da correggere", packageLabel: "Pacchetto", packageNone: "Nessun pacchetto, voglio un preventivo",
      priceLine: "{name}: US${usd}, circa {days} giorni lavorativi. Paghi ora con PayPal; quando la correzione è pronta rivediamo il sito gratis e ti inviamo il prima e dopo.",
      accessLabel: "Come raggiungiamo il sito (facoltativo)", accessHint: "Host, CMS o repository, e chi può darci l'accesso. Non inviare password qui.",
      deadlineLabel: "Scadenza (facoltativa)", budgetLabel: "Budget (facoltativo)",
      payButton: "Invia e paga US${usd}", paying: "Apertura di PayPal…", payLater: "La tua richiesta è salvata, ma PayPal non si è aperto. Carlos ti invierà un link di pagamento via email.",
      recheckCopy: "Quando le tue modifiche sono online, rivedi questo report una volta gratis e ricevi il prima e dopo via email.", recheckButton: "Rivedi gratis", rechecking: "Avvio…",
      recheckSent: "Stiamo rivedendo il sito. Il prima e dopo arriva a {email} tra pochi minuti.", recheckUsed: "La revisione gratuita di questo report è già stata usata.", recheckFailed: "La revisione non è partita. Riprova tra un momento.",
      paidBanner: "Pagamento ricevuto. Carlos inizia la correzione entro due giorni lavorativi; quando è pronta rivediamo il sito gratis e ti inviamo il prima e dopo.",
      submit: "Invia la richiesta", sending: "Invio…", close: "Chiudi",
      pickOne: "Scegli almeno un risultato.",
      doneTitle: "Richiesta inviata", done: "Abbiamo inviato una copia a {email}. Carlos risponde entro due giorni lavorativi.",
      signIn: "Accedi con l'account che ha creato questo report per inviare la richiesta.", signInButton: "Accedi",
      expired: "La tua sessione è scaduta. Accedi di nuovo con l'account che ha creato questo report.",
      notOwner: "Solo l'account che ha creato questo report può chiederci di correggerlo.",
      notFound: "Report non trovato.",
      invalid: "Controlla i risultati e la scadenza, poi invia di nuovo.",
      limit: "Oggi hai inviato diverse richieste. Scrivi a qa@carlosandmunoz.com per altre.",
      failed: "La richiesta non è partita. Riprova tra un momento."
    }
  };

  const OPEN = ["fail", "risk"];
  // The four ways of the panel as qa_review_fix_way labels; the free re-check reports as qa_review_fix_recheck.
  const WAYS = { fixSelf: "self", fixGet: "self", fixRequest: "quote", fixPackage: "package", fixCall: "call" };

  function book(lang) {
    return T[lang] || T.en;
  }

  function fill(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, (all, key) => (vars && vars[key] != null ? String(vars[key]) : all));
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[ch]);
  }

  function openFindings(report) {
    return ((report && report.insights && report.insights.findings) || []).filter((f) => OPEN.indexOf(f.verdict) !== -1);
  }

  function packageFor(packages, key) {
    const text = String(key || "");
    const hit = (packages || []).find((item) => item.keys.some((prefix) => text.indexOf(prefix) === 0));
    return hit ? hit.id : "";
  }

  // The packages this report's open findings call for, each with the findings it covers, in the server's order.
  function offersFor(packages, findings) {
    return (packages || []).map((item) => Object.assign({}, item, { findings: findings.filter((f) => packageFor(packages, f.key) === item.id).map((f) => f.id) }))
      .filter((offer) => offer.findings.length);
  }

  function bookUrl(report, ids, lang) {
    const query = new URLSearchParams({ type: "walkthrough", lang, review: report.id, utm_source: "qa-review", utm_campaign: "fix" });
    if (report.host) query.set("host", report.host);
    if (ids.length) query.set("findings", ids.slice(0, 20).join(","));
    return "book.html?" + query.toString();
  }

  function mount() {
    const slot = document.getElementById("fix-offer");
    if (!slot) return null;
    const lang = () => String(document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    const L = () => book(lang());
    let payload = null;
    let titleOf = (item) => item.title;
    let packages = null;
    let loading = null;
    let sheet = null;

    function endpoint() {
      const host = location.hostname;
      if (host === "127.0.0.1" || host === "localhost") return "http://127.0.0.1:8768";
      return "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";
    }

    function loadPackages() {
      if (!loading) {
        loading = fetch(endpoint() + "/review/fix/offers").then((res) => (res.ok ? res.json() : { packages: [] }))
          .then((body) => { packages = Array.isArray(body.packages) ? body.packages : []; })
          .catch(() => { packages = []; loading = null; });
      }
      return loading;
    }

    // Localized copy is marked like Ask the report, so the page translator does not translate it again.
    function mark(node) {
      if (L() === T.en) {
        node.removeAttribute("lang");
        node.removeAttribute("translate");
      } else {
        node.setAttribute("lang", lang());
        node.setAttribute("translate", "no");
      }
    }

    function paid() {
      return !!payload && payload.paid === true;
    }

    function paint() {
      if (!payload) return;
      const words = L();
      const report = payload.report;
      const open = openFindings(report);
      const offers = offersFor(packages, open);
      const name = (item) => (item.name && (item.name[lang()] || item.name.en)) || item.id;
      const what = (item) => (item.what && (item.what[lang()] || item.what.en)) || "";
      const path = (key, title, copy, action) => '<article class="fix-path" data-path="' + key + '"><h3>' + esc(title) + "</h3><p>" + esc(copy) + "</p>" + action + "</article>";
      const self = paid()
        ? '<button type="button" class="btn btn-ghost" data-fix-self>' + esc(words.selfButton) + "</button>" +
          '<p class="fix-recheck">' + esc(words.recheckCopy) + '</p><button type="button" class="btn btn-ghost" data-fix-recheck>' + esc(words.recheckButton) + '</button><p class="fix-recheck-msg" role="status" aria-live="polite"></p>'
        : '<p class="fix-muted">' + esc(words.selfLocked) + "</p>";
      const banner = new URLSearchParams(location.search).get("fixPaid") === "1" ? '<p class="fix-paid" role="status">' + esc(words.paidBanner) + "</p>" : "";
      const packs = offers.length ? path("packages", words.packTitle, words.packCopy, '<ul class="fix-packs">' + offers.map((item) =>
        '<li data-package="' + esc(item.id) + '"><div><strong>' + esc(name(item)) + '</strong>' + (item.launch ? '<span class="fix-launch">' + esc(words.packLaunch) + "</span>" : "") + '<span class="fix-price">' + esc(fill(words.packLine, { usd: item.usd, days: item.days })) +
        (item.launch && item.listUsd > item.usd ? ' <s class="fix-list">' + esc(fill(words.packList, { usd: item.listUsd })) + "</s>" : "") + "</span>" +
        "<small>" + esc(what(item)) + '</small><small class="notranslate" translate="no">' + esc(fill(words.packCovers, { list: item.findings.join(", ") })) + "</small></div>" +
        '<button type="button" class="btn btn-primary" data-fix-package="' + esc(item.id) + '">' + esc(words.packOrder) + "</button></li>").join("") + "</ul>") : "";
      slot.innerHTML = banner + '<p class="eyebrow">' + esc(words.eyebrow) + '</p><h2 id="fix-offer-title">' + esc(words.title) + '</h2><p class="fix-lead">' + esc(fill(words.lead, { n: open.length })) + '</p><div class="fix-paths">' +
        path("self", words.selfTitle, words.selfCopy, self) + packs +
        path("quote", words.quoteTitle, words.quoteCopy, '<button type="button" class="btn btn-primary" data-fix-request="">' + esc(words.quoteButton) + "</button>") +
        path("call", words.callTitle, words.callCopy, '<a class="btn btn-ghost" data-fix-call href="' + esc(bookUrl(report, open.map((f) => f.id), lang())) + '">' + esc(words.callButton) + "</a>") +
        "</div>";
      mark(slot);
    }

    function show(next, options) {
      const report = next && next.report;
      const ok = !!(report && report.id && !next.sample && !report.preview && openFindings(report).length);
      payload = ok ? next : null;
      if (options && typeof options.title === "function") titleOf = options.title;
      slot.hidden = !ok;
      if (!ok) {
        slot.innerHTML = "";
        return;
      }
      paint();
      if (root.SiteAnalytics) root.SiteAnalytics.once("fix-open-" + report.id, "qa_review_fix_open", "URL Review", paid() ? "paid" : "unpaid");
      if (!packages) loadPackages().then(() => { if (payload === next) paint(); });
    }

    function cardLinks(item) {
      if (!payload || !item || OPEN.indexOf(item.verdict) === -1) return "";
      const words = L();
      const attrs = L() === T.en ? "" : ' lang="' + lang() + '" translate="no"';
      const id = esc(item.id);
      return '<div class="fix-card-links"' + attrs + ">" +
        (paid() && root.QAReviewAsk && root.QAReviewAsk.fix ? '<button type="button" class="fix-card-link" data-fix-get="' + id + '" aria-label="' + esc(words.getFix + ": " + item.id) + '">' + esc(words.getFix) + "</button>" : "") +
        '<button type="button" class="fix-card-link" data-fix-request="' + id + '" aria-label="' + esc(words.fixForMe + ": " + item.id) + '">' + esc(words.fixForMe) + "</button></div>";
    }

    function build() {
      const node = document.createElement("dialog");
      node.className = "fix-sheet no-print";
      node.id = "fix-sheet";
      node.setAttribute("aria-labelledby", "fix-sheet-title");
      document.body.appendChild(node);
      node.addEventListener("click", (event) => {
        if (event.target === node) node.close();
        const button = event.target.closest && event.target.closest("button");
        if (!button) return;
        if (button.hasAttribute("data-fix-close")) node.close();
        if (button.hasAttribute("data-fix-sign-in")) {
          node.close();
          const closer = document.getElementById("dash-close");
          if (closer) closer.click();
          if (root.ReviewAuth) root.ReviewAuth.focus();
        }
      });
      return node;
    }

    function say(form, message, action) {
      const box = form.querySelector(".fix-msg");
      box.innerHTML = esc(message) + (action ? ' <button type="button" class="btn btn-ghost" ' + action[0] + ">" + esc(action[1]) + "</button>" : "");
    }

    function priceNote(form) {
      const pick = form.querySelector("select[name=package]");
      const item = (packages || []).find((p) => p.id === pick.value);
      const name = item && ((item.name && (item.name[lang()] || item.name.en)) || item.id);
      form.querySelector(".fix-price-note").textContent = item ? fill(L().priceLine, { name, usd: item.usd, days: item.days }) : "";
      submitLabel(form);
    }

    function submitLabel(form) {
      const pick = form.querySelector("select[name=package]");
      const item = pick && (packages || []).find((p) => p.id === pick.value);
      const button = form.querySelector("button[type=submit]");
      if (button) button.textContent = item ? fill(L().payButton, { usd: item.usd }) : L().submit;
    }

    function testKey() {
      try { return localStorage.getItem("qa-review-test-key") || ""; } catch (error) { return ""; }
    }

    // A package is paid at once through the review checkout; PayPal returns to the pay page, which confirms and comes back here.
    async function pay(fixId, report, packageId) {
      if (root.SiteAnalytics) root.SiteAnalytics.trackEvent("qa_review_fix_checkout", "URL Review", packageId || "");
      try {
        const res = await fetch(endpoint() + "/checkout", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.assign(root.ReviewAuth.proof(), { purpose: "fix", provider: "paypal", fixId, reportId: report.id, lang: lang(), testKey: testKey() }))
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.url) {
          location.href = body.url;
          return true;
        }
      } catch (error) { /* the request is saved; the pay link comes by mail */ }
      return false;
    }

    async function recheck(button, report) {
      const words = L();
      const box = slot.querySelector(".fix-recheck-msg");
      if (!root.ReviewAuth || !root.ReviewAuth.signedIn()) {
        box.textContent = words.signIn;
        return;
      }
      button.disabled = true;
      button.textContent = words.rechecking;
      try {
        const res = await fetch(endpoint() + "/review/fix/recheck", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.assign(root.ReviewAuth.proof(), { id: report.id, lang: lang() }))
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok) {
          box.textContent = fill(words.recheckSent, { email: body.email || root.ReviewAuth.who().email });
          button.hidden = true;
          if (root.SiteAnalytics) root.SiteAnalytics.trackEvent("qa_review_fix_recheck", "URL Review", "sent");
          return;
        }
        box.textContent = res.status === 409 ? words.recheckUsed : body.code === "sign-in" || body.signIn ? words.expired : res.status === 403 ? words.notOwner : words.recheckFailed;
        if (res.status === 409) button.hidden = true;
      } catch (error) {
        box.textContent = words.recheckFailed;
      }
      button.disabled = false;
      button.textContent = words.recheckButton;
    }

    async function request(ids, packageId) {
      if (!payload) return;
      await loadPackages();
      sheet = sheet || build();
      const words = L();
      const report = payload.report;
      const open = openFindings(report);
      const offers = offersFor(packages, open);
      const firstPack = packageId || (ids.length === 1 ? packageFor(packages, (open.find((f) => f.id === ids[0]) || {}).key) : "");
      const picked = new Set(ids.length || packageId ? ids : open.map((f) => f.id));
      if (packageId) (offers.find((o) => o.id === packageId) || { findings: [] }).findings.forEach((id) => picked.add(id));
      const name = (item) => (item.name && (item.name[lang()] || item.name.en)) || item.id;
      const today = new Date().toISOString().slice(0, 10);
      sheet.innerHTML = '<form class="fix-form" novalidate><div class="fix-sheet-head"><h2 id="fix-sheet-title">' + esc(words.formTitle) + '</h2><button type="button" class="btn btn-ghost" data-fix-close>' + esc(words.close) + "</button></div>" +
        '<p class="fix-muted">' + esc(words.formLead) + "</p>" +
        '<fieldset class="fix-findings"><legend>' + esc(words.findingsLabel) + "</legend>" + open.map((f) =>
          '<label><input type="checkbox" name="finding" value="' + esc(f.id) + '"' + (picked.has(f.id) ? " checked" : "") + '> <span class="fix-id notranslate" translate="no">' + esc(f.id) + "</span> <span>" + esc(titleOf(f)) + "</span></label>").join("") + "</fieldset>" +
        (offers.length ? '<label class="fix-field"><span>' + esc(words.packageLabel) + '</span><select name="package"><option value="">' + esc(words.packageNone) + "</option>" +
          offers.map((o) => '<option value="' + esc(o.id) + '"' + (o.id === firstPack ? " selected" : "") + ">" + esc(name(o) + " · US$" + o.usd) + "</option>").join("") + '</select></label><p class="fix-price-note" aria-live="polite"></p>' : "") +
        '<label class="fix-field"><span>' + esc(words.accessLabel) + '</span><textarea name="access" rows="3" maxlength="2000"></textarea><small>' + esc(words.accessHint) + "</small></label>" +
        '<div class="fix-row"><label class="fix-field"><span>' + esc(words.deadlineLabel) + '</span><input type="date" name="deadline" min="' + today + '"></label>' +
        '<label class="fix-field"><span>' + esc(words.budgetLabel) + '</span><input type="text" name="budget" maxlength="80" autocomplete="off"></label></div>' +
        '<p class="fix-msg" role="status" aria-live="polite"></p>' +
        '<div class="fix-actions"><button type="submit" class="btn btn-primary">' + esc(words.submit) + "</button></div></form>";
      mark(sheet);
      const form = sheet.querySelector("form");
      const pick = form.querySelector("select[name=package]");
      if (pick) {
        priceNote(form);
        pick.addEventListener("change", () => {
          const offer = offers.find((o) => o.id === pick.value);
          if (offer) form.querySelectorAll("input[name=finding]").forEach((box) => { if (offer.findings.indexOf(box.value) !== -1) box.checked = true; });
          priceNote(form);
        });
      }
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        send(form, report);
      });
      if (!sheet.open) sheet.showModal();
      form.querySelector("input[name=finding]:checked, input[name=finding]").focus();
    }

    async function send(form, report) {
      const words = L();
      const findings = [...form.querySelectorAll("input[name=finding]:checked")].map((box) => box.value);
      if (!findings.length) return say(form, words.pickOne);
      if (!root.ReviewAuth || !root.ReviewAuth.signedIn()) return say(form, words.signIn, ["data-fix-sign-in", words.signInButton]);
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      button.textContent = words.sending;
      say(form, "");
      const value = (name) => (form.querySelector("[name=" + name + "]") || { value: "" }).value.trim();
      try {
        const res = await fetch(endpoint() + "/review/fix/request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.assign(root.ReviewAuth.proof(), {
            id: report.id, lang: lang(), name: root.ReviewAuth.who().name, findings,
            package: value("package"), access: value("access"), deadline: value("deadline"), budget: value("budget")
          }))
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok && body.package && body.priceUsd) {
          button.textContent = words.paying;
          if (root.SiteAnalytics) root.SiteAnalytics.trackEvent("qa_review_fix_request", "URL Review", body.package);
          if (await pay(body.id, report, body.package)) return;
          sheet.innerHTML = '<div class="fix-done"><div class="fix-sheet-head"><h2 id="fix-sheet-title">' + esc(words.doneTitle) + '</h2><button type="button" class="btn btn-ghost" data-fix-close>' + esc(words.close) + "</button></div><p>" + esc(words.payLater) + "</p></div>";
          sheet.querySelector("[data-fix-close]").focus();
          return;
        }
        if (res.ok && body.ok) {
          sheet.innerHTML = '<div class="fix-done"><div class="fix-sheet-head"><h2 id="fix-sheet-title">' + esc(words.doneTitle) + '</h2><button type="button" class="btn btn-ghost" data-fix-close>' + esc(words.close) + "</button></div><p>" +
            esc(fill(words.done, { email: body.email || root.ReviewAuth.who().email })) + "</p></div>";
          sheet.querySelector("[data-fix-close]").focus();
          if (root.SiteAnalytics) root.SiteAnalytics.trackEvent("qa_review_fix_request", "URL Review", value("package") || "quote");
          return;
        }
        const signIn = body.code === "sign-in" || body.signIn === true;
        if (signIn && root.ReviewAuth.expire) root.ReviewAuth.expire(words.expired);
        const said = signIn ? words.expired : { 400: words.invalid, 403: words.notOwner, 404: words.notFound, 429: words.limit }[res.status] || words.failed;
        say(form, said, signIn ? ["data-fix-sign-in", words.signInButton] : null);
      } catch (error) {
        say(form, words.failed);
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          submitLabel(form);
        }
      }
    }

    document.addEventListener("click", (event) => {
      const button = event.target.closest && event.target.closest("[data-fix-get], [data-fix-request], [data-fix-package], [data-fix-self], [data-fix-recheck], [data-fix-call]");
      if (!button || !payload) return;
      if (button.hasAttribute("data-fix-recheck")) recheck(button, payload.report);
      else if (button.hasAttribute("data-fix-get")) root.QAReviewAsk.fix(button.getAttribute("data-fix-get"));
      else if (button.hasAttribute("data-fix-self")) document.getElementById("ask-open").click();
      else if (button.hasAttribute("data-fix-package")) request([], button.getAttribute("data-fix-package"));
      else if (button.hasAttribute("data-fix-request")) {
        const id = button.getAttribute("data-fix-request");
        request(id ? [id] : [], "");
      }
      const way = WAYS[Object.keys(button.dataset)[0]];
      if (way && root.SiteAnalytics) root.SiteAnalytics.trackEvent("qa_review_fix_way", "URL Review", way);
    });

    return { show, cardLinks, request };
  }

  const api = { T, openFindings, offersFor, packageFor, bookUrl };
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.QAReviewFix = api;
    const panel = typeof document !== "undefined" ? mount() : null;
    api.show = panel ? panel.show : () => {};
    api.cardLinks = panel ? panel.cardLinks : () => "";
    api.request = panel ? panel.request : () => {};
  }
})(typeof window !== "undefined" ? window : globalThis);
