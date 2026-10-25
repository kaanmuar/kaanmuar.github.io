/* Account page: the owner's qa-lab-verify token for a site, the two ways to add it, and the sites verified for the account. */
(function () {
  const COPY = {
    en: {
      title: "Verify a site you own",
      intro: "A verified site gets a short scripted conversation with its chatbot in your reviews. Asking from a mailbox at the site's domain already counts. Otherwise, add your token to the site in one of two ways.",
      host: "Site host",
      get: "Get my token",
      dns: "DNS record",
      dnsHow: "Add a TXT record on the host or on its main domain with this value:",
      meta: "Homepage tag",
      metaHow: "Or put this tag in the <head> of the homepage (the site's root address, not another page):",
      check: "Check now",
      checking: "Checking the DNS record and the homepage…",
      okDns: "Verified by the DNS record. Your reviews of this site count as the owner's for 30 days, and each review checks again.",
      okMeta: "Verified by the homepage tag. Your reviews of this site count as the owner's for 30 days, and each review checks again.",
      missing: "The token was not found yet. DNS changes can take a while to show; leave the record or tag in place and check again.",
      off: "Site verification is not open yet. Ask from a mailbox at the site's domain, or write to qa@carlosandmunoz.com.",
      bad: "Enter a public host name, such as shop.example.com.",
      failed: "That did not work. Try again in a moment.",
      list: "Verified for this account",
      none: "No site is verified for this account yet.",
      operator: "QA-lab recorded a signed-in run",
      byDns: "DNS record",
      byMeta: "homepage tag",
      until: "until"
    },
    es: {
      title: "Verifica un sitio que es tuyo",
      intro: "Un sitio verificado recibe en tus revisiones una conversación breve y guionizada con su chatbot. Pedir la revisión desde un correo del dominio del sitio ya cuenta. Si no, añade tu token al sitio de una de estas dos formas.",
      host: "Host del sitio",
      get: "Obtener mi token",
      dns: "Registro DNS",
      dnsHow: "Añade un registro TXT en el host o en su dominio principal con este valor:",
      meta: "Etiqueta en la página de inicio",
      metaHow: "O pon esta etiqueta en el <head> de la página de inicio (la dirección raíz del sitio, no otra página):",
      check: "Comprobar ahora",
      checking: "Comprobando el registro DNS y la página de inicio…",
      okDns: "Verificado por el registro DNS. Tus revisiones de este sitio cuentan como del dueño durante 30 días, y cada revisión vuelve a comprobarlo.",
      okMeta: "Verificado por la etiqueta de la página de inicio. Tus revisiones de este sitio cuentan como del dueño durante 30 días, y cada revisión vuelve a comprobarlo.",
      missing: "Aún no se encuentra el token. Los cambios de DNS pueden tardar en verse; deja el registro o la etiqueta y vuelve a comprobar.",
      off: "La verificación de sitios aún no está abierta. Pide la revisión desde un correo del dominio del sitio o escribe a qa@carlosandmunoz.com.",
      bad: "Escribe un nombre de host público, como tienda.ejemplo.com.",
      failed: "No funcionó. Inténtalo de nuevo en un momento.",
      list: "Verificados para esta cuenta",
      none: "Aún no hay ningún sitio verificado para esta cuenta.",
      operator: "QA-lab registró una ejecución con sesión iniciada",
      byDns: "registro DNS",
      byMeta: "etiqueta de inicio",
      until: "hasta"
    },
    pt: {
      title: "Verifique um site que é seu",
      intro: "Um site verificado recebe nas suas revisões uma conversa curta e roteirizada com o chatbot dele. Pedir a revisão de um e-mail no domínio do site já conta. Se não, adicione seu token ao site de uma destas duas formas.",
      host: "Host do site",
      get: "Obter meu token",
      dns: "Registro DNS",
      dnsHow: "Adicione um registro TXT no host ou no domínio principal com este valor:",
      meta: "Tag na página inicial",
      metaHow: "Ou coloque esta tag no <head> da página inicial (o endereço raiz do site, não outra página):",
      check: "Verificar agora",
      checking: "Verificando o registro DNS e a página inicial…",
      okDns: "Verificado pelo registro DNS. Suas revisões deste site contam como do dono por 30 dias, e cada revisão verifica de novo.",
      okMeta: "Verificado pela tag da página inicial. Suas revisões deste site contam como do dono por 30 dias, e cada revisão verifica de novo.",
      missing: "O token ainda não foi encontrado. Mudanças de DNS podem demorar a aparecer; deixe o registro ou a tag no lugar e verifique de novo.",
      off: "A verificação de sites ainda não está aberta. Peça a revisão de um e-mail no domínio do site ou escreva para qa@carlosandmunoz.com.",
      bad: "Digite um nome de host público, como loja.exemplo.com.",
      failed: "Não funcionou. Tente de novo em um instante.",
      list: "Verificados para esta conta",
      none: "Nenhum site está verificado para esta conta ainda.",
      operator: "A QA-lab registrou uma execução com login",
      byDns: "registro DNS",
      byMeta: "tag da página inicial",
      until: "até"
    },
    de: {
      title: "Eine eigene Website verifizieren",
      intro: "Eine verifizierte Website bekommt in Ihren Prüfungen ein kurzes, vorgegebenes Gespräch mit ihrem Chatbot. Eine Anfrage von einem Postfach unter der Domain der Website zählt bereits. Sonst fügen Sie Ihr Token auf eine von zwei Arten zur Website hinzu.",
      host: "Host der Website",
      get: "Mein Token anzeigen",
      dns: "DNS-Eintrag",
      dnsHow: "Legen Sie auf dem Host oder seiner Hauptdomain einen TXT-Eintrag mit diesem Wert an:",
      meta: "Tag auf der Startseite",
      metaHow: "Oder setzen Sie dieses Tag in den <head> der Startseite (die Stammadresse der Website, keine andere Seite):",
      check: "Jetzt prüfen",
      checking: "DNS-Eintrag und Startseite werden geprüft…",
      okDns: "Über den DNS-Eintrag verifiziert. Ihre Prüfungen dieser Website gelten 30 Tage lang als die des Inhabers, und jede Prüfung kontrolliert es erneut.",
      okMeta: "Über das Tag auf der Startseite verifiziert. Ihre Prüfungen dieser Website gelten 30 Tage lang als die des Inhabers, und jede Prüfung kontrolliert es erneut.",
      missing: "Das Token wurde noch nicht gefunden. DNS-Änderungen brauchen manchmal etwas Zeit; lassen Sie Eintrag oder Tag stehen und prüfen Sie erneut.",
      off: "Die Verifizierung von Websites ist noch nicht geöffnet. Fragen Sie von einem Postfach unter der Domain der Website an oder schreiben Sie an qa@carlosandmunoz.com.",
      bad: "Geben Sie einen öffentlichen Hostnamen ein, etwa shop.example.com.",
      failed: "Das hat nicht geklappt. Versuchen Sie es gleich noch einmal.",
      list: "Für dieses Konto verifiziert",
      none: "Für dieses Konto ist noch keine Website verifiziert.",
      operator: "QA-lab hat einen angemeldeten Lauf erfasst",
      byDns: "DNS-Eintrag",
      byMeta: "Startseiten-Tag",
      until: "bis"
    },
    fr: {
      title: "Vérifier un site qui vous appartient",
      intro: "Un site vérifié reçoit dans vos revues une courte conversation scénarisée avec son chatbot. Demander depuis une adresse e-mail du domaine du site compte déjà. Sinon, ajoutez votre jeton au site de l'une de ces deux façons.",
      host: "Hôte du site",
      get: "Obtenir mon jeton",
      dns: "Enregistrement DNS",
      dnsHow: "Ajoutez un enregistrement TXT sur l'hôte ou sur son domaine principal avec cette valeur :",
      meta: "Balise sur la page d'accueil",
      metaHow: "Ou placez cette balise dans le <head> de la page d'accueil (l'adresse racine du site, pas une autre page) :",
      check: "Vérifier maintenant",
      checking: "Vérification de l'enregistrement DNS et de la page d'accueil…",
      okDns: "Vérifié par l'enregistrement DNS. Vos revues de ce site comptent comme celles du propriétaire pendant 30 jours, et chaque revue vérifie à nouveau.",
      okMeta: "Vérifié par la balise de la page d'accueil. Vos revues de ce site comptent comme celles du propriétaire pendant 30 jours, et chaque revue vérifie à nouveau.",
      missing: "Le jeton n'est pas encore trouvé. Les changements DNS peuvent mettre du temps à apparaître ; laissez l'enregistrement ou la balise en place et vérifiez à nouveau.",
      off: "La vérification des sites n'est pas encore ouverte. Demandez depuis une adresse du domaine du site ou écrivez à qa@carlosandmunoz.com.",
      bad: "Saisissez un nom d'hôte public, comme boutique.exemple.com.",
      failed: "Cela n'a pas fonctionné. Réessayez dans un instant.",
      list: "Vérifiés pour ce compte",
      none: "Aucun site n'est encore vérifié pour ce compte.",
      operator: "QA-lab a enregistré une exécution connectée",
      byDns: "enregistrement DNS",
      byMeta: "balise d'accueil",
      until: "jusqu'au"
    },
    it: {
      title: "Verifica un sito di tua proprietà",
      intro: "Un sito verificato riceve nelle tue revisioni una breve conversazione con copione con il suo chatbot. Chiedere da una casella di posta del dominio del sito conta già. Altrimenti, aggiungi il tuo token al sito in uno di questi due modi.",
      host: "Host del sito",
      get: "Ottieni il mio token",
      dns: "Record DNS",
      dnsHow: "Aggiungi un record TXT sull'host o sul suo dominio principale con questo valore:",
      meta: "Tag nella home page",
      metaHow: "Oppure metti questo tag nell'<head> della home page (l'indirizzo radice del sito, non un'altra pagina):",
      check: "Controlla ora",
      checking: "Controllo del record DNS e della home page…",
      okDns: "Verificato dal record DNS. Le tue revisioni di questo sito contano come del proprietario per 30 giorni, e ogni revisione controlla di nuovo.",
      okMeta: "Verificato dal tag nella home page. Le tue revisioni di questo sito contano come del proprietario per 30 giorni, e ogni revisione controlla di nuovo.",
      missing: "Il token non è ancora stato trovato. Le modifiche DNS possono richiedere tempo; lascia il record o il tag al suo posto e controlla di nuovo.",
      off: "La verifica dei siti non è ancora aperta. Chiedi da una casella del dominio del sito o scrivi a qa@carlosandmunoz.com.",
      bad: "Inserisci un nome host pubblico, come negozio.esempio.com.",
      failed: "Non ha funzionato. Riprova tra un momento.",
      list: "Verificati per questo account",
      none: "Nessun sito è ancora verificato per questo account.",
      operator: "QA-lab ha registrato un'esecuzione con accesso",
      byDns: "record DNS",
      byMeta: "tag della home page",
      until: "fino al"
    }
  };
  const section = document.getElementById("verify");
  if (!section || !window.ReviewAuth) return;
  let copy = COPY.en;
  let lang = "en";
  const $ = (id) => document.getElementById(id);
  const hostEl = $("verify-host");
  const statusEl = $("verify-status");

  function paint() {
    section.lang = lang;
    section.querySelectorAll("[data-copy]").forEach((el) => { el.textContent = copy[el.getAttribute("data-copy")]; });
  }
  function say(message, tone) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("bad", tone === "bad");
    statusEl.classList.toggle("ok", tone === "ok");
  }
  function part(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
  }
  function list(proofs) {
    const ul = $("verify-list");
    ul.replaceChildren();
    (proofs || []).forEach((row) => {
      const li = document.createElement("li");
      li.appendChild(part("strong", "", row.host));
      li.appendChild(part("span", "pill open", row.kind === "operator" ? copy.operator : row.how === "meta" ? copy.byMeta : copy.byDns));
      if (row.until) li.appendChild(part("span", "verify-until", copy.until + " " + new Date(row.until).toLocaleDateString(lang)));
      ul.appendChild(li);
    });
    $("verify-none").hidden = !!(proofs || []).length;
  }
  function show(data) {
    $("verify-steps").hidden = !data.token;
    if (data.token) {
      $("verify-txt").textContent = data.txt;
      $("verify-meta").textContent = data.meta;
    }
    list(data.proofs);
  }
  async function call(path, host) {
    const response = await window.account(path, host ? { host } : {});
    if (window.signedOut(response)) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      say(response.status === 400 ? copy.bad : copy.failed, "bad");
      return null;
    }
    if (data.available === false) {
      $("verify-form").hidden = true;
      say(copy.off);
    }
    return data;
  }
  $("verify-get").addEventListener("click", async () => {
    const host = hostEl.value.trim();
    if (!host) { say(copy.bad, "bad"); hostEl.focus(); return; }
    say("");
    const data = await call("/account/verify", host);
    if (data) show(data);
  });
  $("verify-check").addEventListener("click", async (event) => {
    const host = hostEl.value.trim();
    if (!host) { say(copy.bad, "bad"); hostEl.focus(); return; }
    const button = event.currentTarget;
    button.disabled = true;
    say(copy.checking);
    try {
      const data = await call("/account/verify-check", host);
      if (!data) return;
      show(data);
      say(data.ok ? (data.how === "meta" ? copy.okMeta : copy.okDns) : copy.missing, data.ok ? "ok" : "bad");
      if (data.ok && window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_account_verify", "URL Review", data.how);
    } finally {
      button.disabled = false;
    }
  });
  window.ReviewAuth.onChange(async (signed) => {
    section.hidden = !signed;
    if (!signed) return;
    const data = await call("/account/verify");
    if (data) list(data.proofs);
    if (location.hash === "#verify") section.scrollIntoView();
  });
  function use(resolved) {
    const code = String(resolved || "en").slice(0, 2);
    lang = COPY[code] ? code : "en";
    copy = COPY[lang];
    paint();
  }
  paint();
  if (window.SiteI18n) SiteI18n.resolve().then(use);
  window.addEventListener("site-lang-applied", (event) => use(event.detail && event.detail.lang));
})();
