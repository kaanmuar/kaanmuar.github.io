/* Sign-in for URL reviews. The session and the device key live in this browser only;
   the server refuses a run, or a code or link, that comes from any other device. */
(function () {
  const DEVICE_KEY = "qa-review-device-key";
  const SESSION_KEY = "qa-review-session";
  const PENDING_KEY = "qa-review-sign-in";
  const RETURN_KEY = "qa-review-oauth-page";
  const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
  const FIREBASE = { apiKey: "AIzaSyA2-6WkecV3GoAK4qlsdGtH3jisjk3bK0w", authDomain: "carlosm-interactive-cv.firebaseapp.com", projectId: "carlosm-interactive-cv", appId: "1:976558418058:web:1dc19bcd40915ea233e573" };
  const GOOGLE_SCOPES = ["email", "profile"].concat(["emails", "organization", "birthday", "phonenumbers", "addresses", "gender"].map((name) => "https://www.googleapis.com/auth/user." + name + ".read"));
  const LABELS = { "google.com": "Google", "microsoft.com": "Microsoft", "apple.com": "Apple", "github.com": "GitHub", "yahoo.com": "Yahoo", "facebook.com": "Facebook", "twitter.com": "X", linkedin: "LinkedIn", gitlab: "GitLab", discord: "Discord", twitch: "Twitch", slack: "Slack" };
  // Read at each message, since the account page switches language without a reload.
  const COPY = {
    en: {
      failed: "Sign-in failed. Try again in a moment.", appCode: "Code from your authenticator app", sentTo: "Code sent to {to}", enterEmail: "Enter your email.", sending: "Sending a code to {email}…",
      appDigits: "Type the 6 digits from your authenticator app.", mailDigits: "Type the 6 digits from the email.", appMismatch: "That authenticator code did not match. Try the current one.",
      finish: "Finish the {name} sign-in in the window that opened.", noSecondStep: "This account asks for a second step this page cannot take. Use email instead.",
      twoStep: "This account has two-step sign-in. Type the code from your authenticator app.", closed: "The {name} window closed before sign-in finished.",
      blocked: "This browser blocked the {name} window. Allow pop-ups for this site, or use email.", otherWay: "This email already signs in another way. Use that option, or email.",
      providerFailed: "{name} sign-in failed ({code}). Try again, or use email.", unconfirmed: "{name} did not confirm this address, so we emailed it a code.",
      unconfirmedAny: "That account did not confirm this address, so we emailed it a code.", opening: "Opening {name}…", checking: "Checking the sign-in…", checkingLink: "Checking the sign-in link…", continueWith: "Continue with {name}"
    },
    es: {
      failed: "El inicio de sesión falló. Inténtalo de nuevo en un momento.", appCode: "Código de tu app de autenticación", sentTo: "Código enviado a {to}", enterEmail: "Escribe tu correo.", sending: "Enviando un código a {email}…",
      appDigits: "Escribe los 6 dígitos de tu app de autenticación.", mailDigits: "Escribe los 6 dígitos del correo.", appMismatch: "Ese código de autenticación no coincide. Prueba con el actual.",
      finish: "Termina el inicio de sesión con {name} en la ventana que se abrió.", noSecondStep: "Esta cuenta pide un segundo paso que esta página no puede hacer. Usa el correo.",
      twoStep: "Esta cuenta tiene inicio de sesión en dos pasos. Escribe el código de tu app de autenticación.", closed: "La ventana de {name} se cerró antes de terminar el inicio de sesión.",
      blocked: "Este navegador bloqueó la ventana de {name}. Permite las ventanas emergentes para este sitio o usa el correo.", otherWay: "Este correo ya inicia sesión de otra forma. Usa esa opción o el correo.",
      providerFailed: "El inicio de sesión con {name} falló ({code}). Inténtalo de nuevo o usa el correo.", unconfirmed: "{name} no confirmó esta dirección, así que le enviamos un código por correo.",
      unconfirmedAny: "Esa cuenta no confirmó esta dirección, así que le enviamos un código por correo.", opening: "Abriendo {name}…", checking: "Comprobando el inicio de sesión…", checkingLink: "Comprobando el enlace de inicio de sesión…", continueWith: "Continuar con {name}"
    },
    pt: {
      failed: "A entrada falhou. Tente de novo em instantes.", appCode: "Código do seu app autenticador", sentTo: "Código enviado para {to}", enterEmail: "Escreva o seu e-mail.", sending: "Enviando um código para {email}…",
      appDigits: "Digite os 6 dígitos do seu app autenticador.", mailDigits: "Digite os 6 dígitos do e-mail.", appMismatch: "Esse código do autenticador não confere. Tente o atual.",
      finish: "Conclua a entrada com {name} na janela que abriu.", noSecondStep: "Esta conta pede uma segunda etapa que esta página não consegue fazer. Use o e-mail.",
      twoStep: "Esta conta tem entrada em duas etapas. Digite o código do seu app autenticador.", closed: "A janela de {name} fechou antes de a entrada terminar.",
      blocked: "Este navegador bloqueou a janela de {name}. Permita pop-ups para este site ou use o e-mail.", otherWay: "Este e-mail já entra de outra forma. Use essa opção ou o e-mail.",
      providerFailed: "A entrada com {name} falhou ({code}). Tente de novo ou use o e-mail.", unconfirmed: "{name} não confirmou este endereço, então enviamos um código para ele.",
      unconfirmedAny: "Essa conta não confirmou este endereço, então enviamos um código para ele.", opening: "Abrindo {name}…", checking: "Verificando a entrada…", checkingLink: "Verificando o link de entrada…", continueWith: "Continuar com {name}"
    },
    de: {
      failed: "Die Anmeldung ist fehlgeschlagen. Versuchen Sie es gleich noch einmal.", appCode: "Code aus Ihrer Authenticator-App", sentTo: "Code gesendet an {to}", enterEmail: "Geben Sie Ihre E-Mail-Adresse ein.", sending: "Ein Code wird an {email} gesendet …",
      appDigits: "Geben Sie die 6 Ziffern aus Ihrer Authenticator-App ein.", mailDigits: "Geben Sie die 6 Ziffern aus der E-Mail ein.", appMismatch: "Dieser Authenticator-Code passt nicht. Versuchen Sie den aktuellen.",
      finish: "Schließen Sie die Anmeldung mit {name} im geöffneten Fenster ab.", noSecondStep: "Dieses Konto verlangt einen zweiten Schritt, den diese Seite nicht ausführen kann. Nutzen Sie stattdessen die E-Mail.",
      twoStep: "Dieses Konto hat eine Anmeldung in zwei Schritten. Geben Sie den Code aus Ihrer Authenticator-App ein.", closed: "Das Fenster von {name} wurde geschlossen, bevor die Anmeldung fertig war.",
      blocked: "Dieser Browser hat das Fenster von {name} blockiert. Erlauben Sie Pop-ups für diese Website oder nutzen Sie die E-Mail.", otherWay: "Diese E-Mail-Adresse meldet sich bereits anders an. Nutzen Sie diese Option oder die E-Mail.",
      providerFailed: "Die Anmeldung mit {name} ist fehlgeschlagen ({code}). Versuchen Sie es noch einmal oder nutzen Sie die E-Mail.", unconfirmed: "{name} hat diese Adresse nicht bestätigt, daher haben wir ihr einen Code gemailt.",
      unconfirmedAny: "Dieses Konto hat diese Adresse nicht bestätigt, daher haben wir ihr einen Code gemailt.", opening: "{name} wird geöffnet …", checking: "Die Anmeldung wird geprüft …", checkingLink: "Der Anmeldelink wird geprüft …", continueWith: "Weiter mit {name}"
    },
    fr: {
      failed: "La connexion a échoué. Réessayez dans un instant.", appCode: "Code de votre application d’authentification", sentTo: "Code envoyé à {to}", enterEmail: "Saisissez votre adresse e-mail.", sending: "Envoi d’un code à {email}…",
      appDigits: "Saisissez les 6 chiffres de votre application d’authentification.", mailDigits: "Saisissez les 6 chiffres de l’e-mail.", appMismatch: "Ce code d’authentification ne correspond pas. Essayez le code actuel.",
      finish: "Terminez la connexion {name} dans la fenêtre qui s’est ouverte.", noSecondStep: "Ce compte demande une deuxième étape que cette page ne peut pas faire. Utilisez plutôt l’e-mail.",
      twoStep: "Ce compte a une connexion en deux étapes. Saisissez le code de votre application d’authentification.", closed: "La fenêtre {name} s’est fermée avant la fin de la connexion.",
      blocked: "Ce navigateur a bloqué la fenêtre {name}. Autorisez les fenêtres pop-up pour ce site, ou utilisez l’e-mail.", otherWay: "Cette adresse se connecte déjà d’une autre façon. Utilisez cette option, ou l’e-mail.",
      providerFailed: "La connexion {name} a échoué ({code}). Réessayez, ou utilisez l’e-mail.", unconfirmed: "{name} n’a pas confirmé cette adresse, nous lui avons donc envoyé un code par e-mail.",
      unconfirmedAny: "Ce compte n’a pas confirmé cette adresse, nous lui avons donc envoyé un code par e-mail.", opening: "Ouverture de {name}…", checking: "Vérification de la connexion…", checkingLink: "Vérification du lien de connexion…", continueWith: "Continuer avec {name}"
    },
    it: {
      failed: "L’accesso non è riuscito. Riprova tra un momento.", appCode: "Codice dalla tua app di autenticazione", sentTo: "Codice inviato a {to}", enterEmail: "Scrivi la tua email.", sending: "Invio di un codice a {email}…",
      appDigits: "Scrivi le 6 cifre della tua app di autenticazione.", mailDigits: "Scrivi le 6 cifre dell’email.", appMismatch: "Quel codice di autenticazione non corrisponde. Prova quello attuale.",
      finish: "Completa l’accesso con {name} nella finestra che si è aperta.", noSecondStep: "Questo account chiede un secondo passaggio che questa pagina non può fare. Usa l’email.",
      twoStep: "Questo account ha l’accesso in due passaggi. Scrivi il codice della tua app di autenticazione.", closed: "La finestra di {name} si è chiusa prima della fine dell’accesso.",
      blocked: "Questo browser ha bloccato la finestra di {name}. Consenti i pop-up per questo sito o usa l’email.", otherWay: "Questa email accede già in un altro modo. Usa quell’opzione o l’email.",
      providerFailed: "L’accesso con {name} non è riuscito ({code}). Riprova o usa l’email.", unconfirmed: "{name} non ha confermato questo indirizzo, quindi gli abbiamo inviato un codice per email.",
      unconfirmedAny: "Quell’account non ha confermato questo indirizzo, quindi gli abbiamo inviato un codice per email.", opening: "Apertura di {name}…", checking: "Controllo dell’accesso…", checkingLink: "Controllo del link di accesso…", continueWith: "Continua con {name}"
    }
  };
  function t(key, vars) {
    const book = COPY[String(document.documentElement.lang || "en").slice(0, 2).toLowerCase()] || COPY.en;
    return String(book[key] || COPY.en[key]).replace(/\{(\w+)\}/g, (match, name) => (vars && vars[name] != null ? String(vars[name]) : match));
  }
  const box = document.getElementById("sign-in");
  if (!box) return;
  const el = (id) => document.getElementById(id);
  const listeners = [];
  let firebase = null;
  let factor = null;
  let busy = false;

  function endpoint() {
    const host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") return "http://127.0.0.1:8768";
    return "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";
  }

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (error) { return null; }
  }

  function write(key, value) {
    try {
      if (value) localStorage.setItem(key, JSON.stringify(value));
      else localStorage.removeItem(key);
    } catch (error) { /* private mode keeps it for this page only */ }
  }

  function deviceKey() {
    let key = read(DEVICE_KEY);
    if (!/^[a-f0-9]{64}$/.test(String(key))) {
      key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      write(DEVICE_KEY, key);
    }
    return key;
  }

  const current = () => read(SESSION_KEY);

  async function post(path, body) {
    const res = await fetch(endpoint() + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({ deviceKey: deviceKey(), lang: document.documentElement.lang || "en", page: location.pathname }, body))
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.error || t("failed"));
      error.code = data.code || "";
      throw error;
    }
    return data;
  }

  function say(text, bad) {
    el("sign-in-status").textContent = text || "";
    el("sign-in-status").classList.toggle("bad", !!bad);
  }

  function paint() {
    const signed = current();
    const pending = read(PENDING_KEY);
    const waiting = !signed && (!!factor || !!pending);
    box.classList.toggle("done", !!signed);
    el("sign-in-start").hidden = !!signed || waiting;
    el("sign-in-code-step").hidden = !waiting;
    el("sign-in-done").hidden = !signed;
    el("sign-in-code-note").hidden = !!factor;
    if (waiting) el("sign-in-code-label").textContent = factor ? t("appCode") : t("sentTo", { to: pending.sentTo });
    const mail = el("sign-in-mail");
    if (signed && mail) {
      el("sign-in-who").textContent = signed.name || signed.email;
      mail.textContent = signed.email;
      mail.hidden = !signed.name;
    } else if (signed) el("sign-in-who").textContent = signed.name ? signed.name + " (" + signed.email + ")" : signed.email;
    const initial = el("sign-in-initial");
    if (initial) initial.textContent = signed ? (signed.name || signed.email).trim().charAt(0).toUpperCase() : "";
    const photo = el("sign-in-photo");
    photo.hidden = !(signed && signed.picture);
    if (signed && signed.picture) photo.src = signed.picture;
    const email = el("email");
    if (email) {
      email.value = signed ? signed.email : "";
      email.readOnly = true;
    }
    const name = el("name");
    if (name && signed && signed.name && !name.value.trim()) name.value = signed.name;
    listeners.forEach((fn) => fn(!!signed));
  }

  function signedIn(data) {
    write(SESSION_KEY, { session: data.session, email: data.email, provider: data.provider, name: data.name || "", picture: data.picture || "" });
    write(PENDING_KEY, null);
    say("");
    paint();
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_sign_in", "URL Review", data.provider);
  }

  function waitForCode(data) {
    write(PENDING_KEY, { id: data.id, sentTo: data.sentTo });
    paint();
    say("");
    el("sign-in-code").focus();
  }

  async function run(task) {
    if (busy) return;
    busy = true;
    box.setAttribute("aria-busy", "true");
    try { await task(); } catch (error) { say(error.message, true); } finally {
      busy = false;
      box.removeAttribute("aria-busy");
    }
  }

  function sendCode() {
    return run(async () => {
      const email = el("sign-in-email").value.trim();
      if (!email) {
        say(t("enterEmail"), true);
        return;
      }
      say(t("sending", { email }));
      const openedAt = Number(box.getAttribute("data-opened")) || Date.now();
      waitForCode(await post("/auth/email", { email, openedAt, company: (el("hp-note") || { value: "" }).value }));
    });
  }

  function checkCode() {
    return run(async () => {
      const pending = read(PENDING_KEY);
      const code = el("sign-in-code").value.replace(/\D/g, "");
      if (code.length !== 6) {
        say(factor ? t("appDigits") : t("mailDigits"), true);
        return;
      }
      if (factor) {
        const { auth } = await loadFirebase();
        let result;
        try {
          result = await factor.resolver.resolveSignIn(auth.TotpMultiFactorGenerator.assertionForSignIn(factor.hint.uid, code));
        } catch (error) {
          throw new Error(t("appMismatch"));
        }
        const id = factor.id;
        factor = null;
        await finishProvider(result, id);
        return;
      }
      try {
        signedIn(await post("/auth/email/finish", { id: pending && pending.id, code }));
      } catch (error) {
        if (error.code === "expired") write(PENDING_KEY, null);
        paint();
        throw error;
      }
    });
  }

  async function loadFirebase() {
    if (firebase) return firebase;
    const [app, auth] = await Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js")]);
    const instance = auth.initializeAuth(app.initializeApp(FIREBASE, "review-sign-in"), {
      persistence: auth.inMemoryPersistence,
      popupRedirectResolver: auth.browserPopupRedirectResolver
    });
    firebase = { auth, instance };
    return firebase;
  }

  function providerFor(auth, id) {
    if (id === "google.com") {
      const google = new auth.GoogleAuthProvider();
      GOOGLE_SCOPES.forEach((scope) => google.addScope(scope));
      google.setCustomParameters({ prompt: "select_account" });
      return google;
    }
    if (id === "github.com") return new auth.GithubAuthProvider().addScope("user:email");
    const provider = new auth.OAuthProvider(id);
    if (id === "apple.com") ["email", "name"].forEach((scope) => provider.addScope(scope));
    if (id === "microsoft.com") provider.setCustomParameters({ prompt: "select_account" });
    return provider;
  }

  function withProvider(id) {
    return run(async () => {
      const { auth, instance } = await loadFirebase();
      say(t("finish", { name: LABELS[id] }));
      let result;
      try {
        result = await auth.signInWithPopup(instance, providerFor(auth, id));
      } catch (error) {
        const code = String((error && error.code) || "unknown").replace(/^auth\//, "");
        if (code === "multi-factor-auth-required") {
          const resolver = auth.getMultiFactorResolver(instance, error);
          const hint = resolver.hints.find((item) => item.factorId === auth.TotpMultiFactorGenerator.FACTOR_ID);
          if (!hint) throw new Error(t("noSecondStep"));
          factor = { resolver, hint, id };
          paint();
          say(t("twoStep"));
          el("sign-in-code").focus();
          return;
        }
        if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_sign_in_failed", "URL Review", id + " " + code);
        if (/popup-closed|cancelled-popup/.test(code)) throw new Error(t("closed", { name: LABELS[id] }));
        if (code === "popup-blocked") throw new Error(t("blocked", { name: LABELS[id] }));
        if (code === "account-exists-with-different-credential") throw new Error(t("otherWay"));
        throw new Error(t("providerFailed", { name: LABELS[id], code }));
      }
      await finishProvider(result, id);
    });
  }

  async function finishProvider(result, id) {
    const { auth, instance } = await loadFirebase();
    const idToken = await result.user.getIdToken();
    const shown = (auth.getAdditionalUserInfo(result) || {}).profile || {};
    const profile = {
      givenName: shown.given_name || shown.givenName || "",
      familyName: shown.family_name || shown.surname || "",
      locale: shown.locale || shown.preferredLanguage || "",
      workspaceDomain: shown.hd || ""
    };
    const google = id === "google.com" ? auth.GoogleAuthProvider.credentialFromResult(result) : null;
    await auth.signOut(instance);
    const data = await post("/auth/provider", { idToken, profile, googleAccessToken: (google && google.accessToken) || "" });
    if (data.session) signedIn(data);
    else {
      waitForCode(data);
      say(t("unconfirmed", { name: LABELS[id] }));
    }
  }

  function withOAuth(id) {
    return run(async () => {
      say(t("opening", { name: LABELS[id] }));
      const data = await post("/auth/oauth/" + id + "/start", {});
      write(RETURN_KEY, location.pathname);
      location.assign(data.url);
    });
  }

  function paintProviders(list) {
    const others = list.filter((item) => item.id !== "email" && LABELS[item.id]);
    el("sign-in-providers").innerHTML = others.map((item) =>
      '<button type="button" class="btn sign-in-provider" data-provider="' + item.id + '"' + (item.oauth ? " data-oauth" : "") + '><span class="sign-in-mark sign-in-' + item.id.split(".")[0] + '" aria-hidden="true"></span>' + t("continueWith", { name: LABELS[item.id] }) + "</button>"
    ).join("");
    el("sign-in-or").hidden = !others.length;
    el("sign-in-google-note").hidden = !others.some((item) => item.id === "google.com");
    if (others.some((item) => !item.oauth)) loadFirebase().catch(() => { /* the button retries the load */ });
  }

  async function finishOAuth(params) {
    const sent = { state: params.get("state"), code: params.get("code") || "", error: params.get("error") || "" };
    ["state", "code", "scope", "error", "error_description", "error_uri", "iss"].forEach((name) => params.delete(name));
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
    const page = read(RETURN_KEY);
    write(RETURN_KEY, null);
    await run(async () => {
      say(t("checking"));
      let data;
      try {
        data = await post("/auth/oauth/finish", sent);
      } catch (error) {
        if (error.code === "other-device") box.classList.add("elsewhere");
        throw error;
      }
      if (!data.session) {
        waitForCode(data);
        say(t("unconfirmedAny"));
        return;
      }
      signedIn(data);
      if (/^\/qa-review(-[a-z]{2}|-account)?\.html$/.test(String(page)) && page !== location.pathname) location.replace(page);
    });
  }

  async function finishLink(params) {
    const id = params.get("signin");
    const token = params.get("key");
    params.delete("signin");
    params.delete("key");
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
    await run(async () => {
      say(t("checkingLink"));
      try {
        signedIn(await post("/auth/email/finish", { id, token }));
      } catch (error) {
        if (error.code === "other-device") box.classList.add("elsewhere");
        throw error;
      }
    });
  }

  async function confirmSaved() {
    const saved = current();
    if (!saved) return;
    try {
      await post("/auth/session", { session: saved.session });
    } catch (error) {
      if (error.message && !/fetch/i.test(error.message)) expire(error.message);
    }
  }

  function expire(message) {
    write(SESSION_KEY, null);
    paint();
    if (message) say(message, true);
  }

  // The review page asks for its terms before the first sign-in; the account and payment pages have none.
  const afterTerms = (then) => (window.ReviewTerms ? ReviewTerms.ensure(then) : then());

  box.setAttribute("data-opened", String(Date.now()));
  el("sign-in-send").addEventListener("click", () => afterTerms(sendCode));
  el("sign-in-check").addEventListener("click", checkCode);
  el("sign-in-email").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); afterTerms(sendCode); } });
  el("sign-in-code").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); checkCode(); } });
  el("sign-in-restart").addEventListener("click", () => { factor = null; write(PENDING_KEY, null); say(""); paint(); });
  el("sign-in-providers").addEventListener("click", (event) => {
    const button = event.target.closest("[data-provider]");
    if (!button) return;
    const id = button.getAttribute("data-provider");
    afterTerms(() => (button.hasAttribute("data-oauth") ? withOAuth : withProvider)(id));
  });
  el("sign-out").addEventListener("click", () => {
    const saved = current();
    expire("");
    if (saved) post("/auth/signout", { session: saved.session }).catch(() => { /* the local copy is already gone */ });
  });

  window.ReviewAuth = {
    signedIn: () => !!current(),
    proof: () => ({ session: (current() || {}).session || "", deviceKey: deviceKey() }),
    onChange: (fn) => { listeners.push(fn); fn(!!current()); },
    expire,
    focus: () => { box.scrollIntoView({ block: "center", behavior: "smooth" }); (el("sign-in-email").offsetParent ? el("sign-in-email") : el("sign-in-code")).focus(); }
  };

  paint();
  fetch(endpoint() + "/auth/providers").then((res) => res.json()).then((data) => paintProviders(data.providers || [])).catch(() => paintProviders([]));
  const params = new URLSearchParams(location.search);
  if (params.get("signin") && params.get("key")) finishLink(params);
  else if (params.get("state") && (params.get("code") || params.get("error"))) finishOAuth(params);
  else confirmSaved();
})();
