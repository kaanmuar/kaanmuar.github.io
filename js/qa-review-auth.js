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
  // This script runs before the report copy book, so the sign-in box carries its own. server holds the server's English
  // sentences (functions/url-review-auth.js, url-review-oauth.js, index.js) so they can be shown in the page language.
  const COPY = {
    en: {
      continueWith: "Continue with {name}", authCode: "Code from your authenticator app", codeSent: "Code sent to {to}",
      failed: "Sign-in failed. Try again in a moment.", enterEmail: "Enter your email.", sending: "Sending a code to {email}…",
      digitsApp: "Type the 6 digits from your authenticator app.", digitsEmail: "Type the 6 digits from the email.",
      appMismatch: "That authenticator code did not match. Try the current one.",
      noSecondStep: "This account asks for a second step this page cannot take. Use email instead.",
      twoStep: "This account has two-step sign-in. Type the code from your authenticator app.",
      finishPopup: "Finish the {name} sign-in in the window that opened.", popupClosed: "The {name} window closed before sign-in finished.",
      popupBlocked: "This browser blocked the {name} window. Allow pop-ups for this site, or use email.",
      otherWay: "This email already signs in another way. Use that option, or email.",
      providerFailed: "{name} sign-in failed ({code}). Try again, or use email.",
      providerUnconfirmed: "{name} did not confirm this address, so we emailed it a code.", opening: "Opening {name}…",
      checking: "Checking the sign-in…", accountUnconfirmed: "That account did not confirm this address, so we emailed it a code.",
      checkingLink: "Checking the sign-in link…",
      server: {
        email: "Enter a valid email.", device: "This browser did not send its device key. Reload the page and try again.",
        tooManyEmails: "Too many sign-in emails in the last hour. Use the last code you got, or try again later.",
        expired: "This sign-in has expired. Ask for a new code.", tooManyCodes: "Too many wrong codes. Ask for a new one.",
        otherDevice: "This sign-in was asked for on another device or browser. Finish it there, or ask for a new code here.",
        wrongCode: "That code does not match. Check the latest email.", notOpen: "This sign-in option is not open yet. Use email instead.",
        noEmail: "That account did not share an email address. Use email instead.", cannotReceive: "This address cannot receive email. Check it for typos.",
        mailDown: "Sign-in email is not available right now. Try again later.", person: "This review is for a person using a browser.",
        wait: "Wait a moment on the form, then start the review.", rejected: "That sign-in was not accepted. Try again.",
        oauthExpired: "This sign-in has expired. Start it again.", cancelled: "The {name} sign-in was cancelled. Try again, or use email.",
        unconfirmed: "{name} did not confirm the sign-in. Try again, or use email."
      }
    },
    es: {
      continueWith: "Continuar con {name}", authCode: "Código de tu app de autenticación", codeSent: "Código enviado a {to}",
      failed: "No se pudo iniciar sesión. Inténtalo de nuevo en un momento.", enterEmail: "Escribe tu correo.", sending: "Enviando un código a {email}…",
      digitsApp: "Escribe los 6 dígitos de tu app de autenticación.", digitsEmail: "Escribe los 6 dígitos del correo.",
      appMismatch: "Ese código de autenticación no coincide. Prueba con el actual.",
      noSecondStep: "Esta cuenta pide un segundo paso que esta página no puede hacer. Usa tu correo.",
      twoStep: "Esta cuenta tiene verificación en dos pasos. Escribe el código de tu app de autenticación.",
      finishPopup: "Termina el inicio de sesión con {name} en la ventana que se abrió.", popupClosed: "La ventana de {name} se cerró antes de terminar el inicio de sesión.",
      popupBlocked: "Este navegador bloqueó la ventana de {name}. Permite las ventanas emergentes en este sitio o usa tu correo.",
      otherWay: "Este correo ya inicia sesión de otra forma. Usa esa opción o tu correo.",
      providerFailed: "Falló el inicio de sesión con {name} ({code}). Inténtalo de nuevo o usa tu correo.",
      providerUnconfirmed: "{name} no confirmó esta dirección, así que te enviamos un código a ese correo.", opening: "Abriendo {name}…",
      checking: "Comprobando el inicio de sesión…", accountUnconfirmed: "Esa cuenta no confirmó esta dirección, así que te enviamos un código a ese correo.",
      checkingLink: "Comprobando el enlace de inicio de sesión…",
      server: {
        email: "Escribe un correo válido.", device: "Este navegador no envió su clave de dispositivo. Recarga la página e inténtalo de nuevo.",
        tooManyEmails: "Demasiados correos de inicio de sesión en la última hora. Usa el último código que recibiste o inténtalo más tarde.",
        expired: "Este inicio de sesión venció. Pide un código nuevo.", tooManyCodes: "Demasiados códigos incorrectos. Pide uno nuevo.",
        otherDevice: "Este inicio de sesión se pidió en otro dispositivo o navegador. Termínalo allí o pide un código nuevo aquí.",
        wrongCode: "Ese código no coincide. Revisa el correo más reciente.", notOpen: "Esta opción de inicio de sesión todavía no está disponible. Usa tu correo.",
        noEmail: "Esa cuenta no compartió una dirección de correo. Usa tu correo.", cannotReceive: "Esta dirección no puede recibir correos. Revisa que esté bien escrita.",
        mailDown: "El correo de inicio de sesión no está disponible ahora. Inténtalo más tarde.", person: "Esta revisión es para una persona que usa un navegador.",
        wait: "Espera un momento en el formulario y luego inicia la revisión.", rejected: "No se aceptó ese inicio de sesión. Inténtalo de nuevo.",
        oauthExpired: "Este inicio de sesión venció. Empieza de nuevo.", cancelled: "Se canceló el inicio de sesión con {name}. Inténtalo de nuevo o usa tu correo.",
        unconfirmed: "{name} no confirmó el inicio de sesión. Inténtalo de nuevo o usa tu correo."
      }
    },
    pt: {
      continueWith: "Continuar com {name}", authCode: "Código do seu app autenticador", codeSent: "Código enviado para {to}",
      failed: "Não foi possível entrar. Tente de novo em instantes.", enterEmail: "Digite seu e-mail.", sending: "Enviando um código para {email}…",
      digitsApp: "Digite os 6 dígitos do seu app autenticador.", digitsEmail: "Digite os 6 dígitos do e-mail.",
      appMismatch: "Esse código do autenticador não confere. Use o código atual.",
      noSecondStep: "Esta conta pede uma segunda etapa que esta página não consegue fazer. Use o e-mail.",
      twoStep: "Esta conta tem verificação em duas etapas. Digite o código do seu app autenticador.",
      finishPopup: "Conclua o login com {name} na janela que abriu.", popupClosed: "A janela do {name} fechou antes de o login terminar.",
      popupBlocked: "Este navegador bloqueou a janela do {name}. Permita pop-ups para este site ou use o e-mail.",
      otherWay: "Este e-mail já entra de outra forma. Use essa opção ou o e-mail.",
      providerFailed: "O login com {name} falhou ({code}). Tente de novo ou use o e-mail.",
      providerUnconfirmed: "O {name} não confirmou este endereço, então enviamos um código para ele.", opening: "Abrindo {name}…",
      checking: "Verificando o login…", accountUnconfirmed: "Essa conta não confirmou este endereço, então enviamos um código para ele.",
      checkingLink: "Verificando o link de login…",
      server: {
        email: "Digite um e-mail válido.", device: "Este navegador não enviou a chave do dispositivo. Recarregue a página e tente de novo.",
        tooManyEmails: "Muitos e-mails de login na última hora. Use o último código que você recebeu ou tente mais tarde.",
        expired: "Este login expirou. Peça um novo código.", tooManyCodes: "Muitos códigos errados. Peça um novo.",
        otherDevice: "Este login foi pedido em outro dispositivo ou navegador. Conclua por lá ou peça um novo código aqui.",
        wrongCode: "Esse código não confere. Veja o e-mail mais recente.", notOpen: "Esta opção de login ainda não está disponível. Use o e-mail.",
        noEmail: "Essa conta não compartilhou um endereço de e-mail. Use o e-mail.", cannotReceive: "Este endereço não pode receber e-mails. Confira se está escrito certo.",
        mailDown: "O e-mail de login não está disponível agora. Tente mais tarde.", person: "Esta revisão é para uma pessoa usando um navegador.",
        wait: "Espere um momento no formulário e depois comece a revisão.", rejected: "Esse login não foi aceito. Tente de novo.",
        oauthExpired: "Este login expirou. Comece de novo.", cancelled: "O login com {name} foi cancelado. Tente de novo ou use o e-mail.",
        unconfirmed: "O {name} não confirmou o login. Tente de novo ou use o e-mail."
      }
    },
    de: {
      continueWith: "Weiter mit {name}", authCode: "Code aus Ihrer Authenticator-App", codeSent: "Code gesendet an {to}",
      failed: "Die Anmeldung ist fehlgeschlagen. Versuchen Sie es gleich noch einmal.", enterEmail: "Geben Sie Ihre E-Mail-Adresse ein.", sending: "Code wird an {email} gesendet…",
      digitsApp: "Geben Sie die 6 Ziffern aus Ihrer Authenticator-App ein.", digitsEmail: "Geben Sie die 6 Ziffern aus der E-Mail ein.",
      appMismatch: "Dieser Authenticator-Code hat nicht gepasst. Nehmen Sie den aktuellen.",
      noSecondStep: "Dieses Konto verlangt einen zweiten Schritt, den diese Seite nicht ausführen kann. Nutzen Sie stattdessen die E-Mail.",
      twoStep: "Dieses Konto hat eine Anmeldung in zwei Schritten. Geben Sie den Code aus Ihrer Authenticator-App ein.",
      finishPopup: "Schließen Sie die Anmeldung mit {name} im geöffneten Fenster ab.", popupClosed: "Das Fenster von {name} wurde geschlossen, bevor die Anmeldung fertig war.",
      popupBlocked: "Dieser Browser hat das Fenster von {name} blockiert. Erlauben Sie Pop-ups für diese Website oder nutzen Sie die E-Mail.",
      otherWay: "Diese E-Mail-Adresse meldet sich schon auf andere Weise an. Nutzen Sie diese Option oder die E-Mail.",
      providerFailed: "Die Anmeldung mit {name} ist fehlgeschlagen ({code}). Versuchen Sie es erneut oder nutzen Sie die E-Mail.",
      providerUnconfirmed: "{name} hat diese Adresse nicht bestätigt, daher haben wir ihr einen Code gesendet.", opening: "{name} wird geöffnet…",
      checking: "Die Anmeldung wird geprüft…", accountUnconfirmed: "Dieses Konto hat diese Adresse nicht bestätigt, daher haben wir ihr einen Code gesendet.",
      checkingLink: "Der Anmeldelink wird geprüft…",
      server: {
        email: "Geben Sie eine gültige E-Mail-Adresse ein.", device: "Dieser Browser hat seinen Geräteschlüssel nicht gesendet. Laden Sie die Seite neu und versuchen Sie es erneut.",
        tooManyEmails: "Zu viele Anmelde-E-Mails in der letzten Stunde. Nutzen Sie den letzten Code, den Sie erhalten haben, oder versuchen Sie es später.",
        expired: "Diese Anmeldung ist abgelaufen. Fordern Sie einen neuen Code an.", tooManyCodes: "Zu viele falsche Codes. Fordern Sie einen neuen an.",
        otherDevice: "Diese Anmeldung wurde auf einem anderen Gerät oder in einem anderen Browser angefordert. Schließen Sie sie dort ab oder fordern Sie hier einen neuen Code an.",
        wrongCode: "Dieser Code passt nicht. Sehen Sie in der neuesten E-Mail nach.", notOpen: "Diese Anmeldeoption ist noch nicht verfügbar. Nutzen Sie stattdessen die E-Mail.",
        noEmail: "Dieses Konto hat keine E-Mail-Adresse geteilt. Nutzen Sie stattdessen die E-Mail.", cannotReceive: "Diese Adresse kann keine E-Mails empfangen. Prüfen Sie sie auf Tippfehler.",
        mailDown: "Die Anmelde-E-Mail ist gerade nicht verfügbar. Versuchen Sie es später.", person: "Diese Prüfung ist für einen Menschen in einem Browser gedacht.",
        wait: "Warten Sie einen Moment im Formular und starten Sie dann die Prüfung.", rejected: "Diese Anmeldung wurde nicht akzeptiert. Versuchen Sie es erneut.",
        oauthExpired: "Diese Anmeldung ist abgelaufen. Starten Sie sie neu.", cancelled: "Die Anmeldung mit {name} wurde abgebrochen. Versuchen Sie es erneut oder nutzen Sie die E-Mail.",
        unconfirmed: "{name} hat die Anmeldung nicht bestätigt. Versuchen Sie es erneut oder nutzen Sie die E-Mail."
      }
    },
    fr: {
      continueWith: "Continuer avec {name}", authCode: "Code de votre application d’authentification", codeSent: "Code envoyé à {to}",
      failed: "La connexion a échoué. Réessayez dans un instant.", enterEmail: "Saisissez votre e-mail.", sending: "Envoi d’un code à {email}…",
      digitsApp: "Saisissez les 6 chiffres de votre application d’authentification.", digitsEmail: "Saisissez les 6 chiffres de l’e-mail.",
      appMismatch: "Ce code d’authentification ne correspond pas. Essayez le code actuel.",
      noSecondStep: "Ce compte demande une deuxième étape que cette page ne peut pas gérer. Utilisez plutôt l’e-mail.",
      twoStep: "Ce compte utilise la connexion en deux étapes. Saisissez le code de votre application d’authentification.",
      finishPopup: "Terminez la connexion {name} dans la fenêtre qui s’est ouverte.", popupClosed: "La fenêtre {name} s’est fermée avant la fin de la connexion.",
      popupBlocked: "Ce navigateur a bloqué la fenêtre {name}. Autorisez les pop-ups pour ce site, ou utilisez l’e-mail.",
      otherWay: "Cet e-mail se connecte déjà d’une autre façon. Utilisez cette option, ou l’e-mail.",
      providerFailed: "La connexion {name} a échoué ({code}). Réessayez, ou utilisez l’e-mail.",
      providerUnconfirmed: "{name} n’a pas confirmé cette adresse, nous lui avons donc envoyé un code.", opening: "Ouverture de {name}…",
      checking: "Vérification de la connexion…", accountUnconfirmed: "Ce compte n’a pas confirmé cette adresse, nous lui avons donc envoyé un code.",
      checkingLink: "Vérification du lien de connexion…",
      server: {
        email: "Saisissez un e-mail valide.", device: "Ce navigateur n’a pas envoyé sa clé d’appareil. Rechargez la page et réessayez.",
        tooManyEmails: "Trop d’e-mails de connexion dans la dernière heure. Utilisez le dernier code reçu, ou réessayez plus tard.",
        expired: "Cette connexion a expiré. Demandez un nouveau code.", tooManyCodes: "Trop de codes erronés. Demandez-en un nouveau.",
        otherDevice: "Cette connexion a été demandée sur un autre appareil ou navigateur. Terminez-la là-bas, ou demandez un nouveau code ici.",
        wrongCode: "Ce code ne correspond pas. Vérifiez le dernier e-mail.", notOpen: "Cette option de connexion n’est pas encore ouverte. Utilisez plutôt l’e-mail.",
        noEmail: "Ce compte n’a pas partagé d’adresse e-mail. Utilisez plutôt l’e-mail.", cannotReceive: "Cette adresse ne peut pas recevoir d’e-mails. Vérifiez qu’elle est bien écrite.",
        mailDown: "L’e-mail de connexion n’est pas disponible pour le moment. Réessayez plus tard.", person: "Cette analyse est destinée à une personne qui utilise un navigateur.",
        wait: "Patientez un instant sur le formulaire, puis lancez l’analyse.", rejected: "Cette connexion n’a pas été acceptée. Réessayez.",
        oauthExpired: "Cette connexion a expiré. Recommencez.", cancelled: "La connexion {name} a été annulée. Réessayez, ou utilisez l’e-mail.",
        unconfirmed: "{name} n’a pas confirmé la connexion. Réessayez, ou utilisez l’e-mail."
      }
    },
    it: {
      continueWith: "Continua con {name}", authCode: "Codice dalla tua app di autenticazione", codeSent: "Codice inviato a {to}",
      failed: "Accesso non riuscito. Riprova tra un momento.", enterEmail: "Inserisci la tua email.", sending: "Invio di un codice a {email}…",
      digitsApp: "Scrivi le 6 cifre dalla tua app di autenticazione.", digitsEmail: "Scrivi le 6 cifre dell’email.",
      appMismatch: "Quel codice di autenticazione non corrisponde. Prova con quello attuale.",
      noSecondStep: "Questo account chiede un secondo passaggio che questa pagina non può gestire. Usa l’email.",
      twoStep: "Questo account ha l’accesso in due passaggi. Scrivi il codice dalla tua app di autenticazione.",
      finishPopup: "Completa l’accesso con {name} nella finestra che si è aperta.", popupClosed: "La finestra di {name} si è chiusa prima della fine dell’accesso.",
      popupBlocked: "Questo browser ha bloccato la finestra di {name}. Consenti i pop-up per questo sito o usa l’email.",
      otherWay: "Questa email accede già in un altro modo. Usa quell’opzione o l’email.",
      providerFailed: "Accesso con {name} non riuscito ({code}). Riprova o usa l’email.",
      providerUnconfirmed: "{name} non ha confermato questo indirizzo, quindi gli abbiamo inviato un codice.", opening: "Apertura di {name}…",
      checking: "Verifica dell’accesso…", accountUnconfirmed: "Quell’account non ha confermato questo indirizzo, quindi gli abbiamo inviato un codice.",
      checkingLink: "Verifica del link di accesso…",
      server: {
        email: "Inserisci un’email valida.", device: "Questo browser non ha inviato la sua chiave del dispositivo. Ricarica la pagina e riprova.",
        tooManyEmails: "Troppe email di accesso nell’ultima ora. Usa l’ultimo codice ricevuto o riprova più tardi.",
        expired: "Questo accesso è scaduto. Chiedi un nuovo codice.", tooManyCodes: "Troppi codici sbagliati. Chiedine uno nuovo.",
        otherDevice: "Questo accesso è stato chiesto su un altro dispositivo o browser. Completalo lì o chiedi un nuovo codice qui.",
        wrongCode: "Quel codice non corrisponde. Controlla l’email più recente.", notOpen: "Questa opzione di accesso non è ancora disponibile. Usa l’email.",
        noEmail: "Quell’account non ha condiviso un indirizzo email. Usa l’email.", cannotReceive: "Questo indirizzo non può ricevere email. Controlla che sia scritto bene.",
        mailDown: "L’email di accesso non è disponibile ora. Riprova più tardi.", person: "Questa revisione è per una persona che usa un browser.",
        wait: "Aspetta un momento sul modulo, poi avvia la revisione.", rejected: "Quell’accesso non è stato accettato. Riprova.",
        oauthExpired: "Questo accesso è scaduto. Ricomincia.", cancelled: "L’accesso con {name} è stato annullato. Riprova o usa l’email.",
        unconfirmed: "{name} non ha confermato l’accesso. Riprova o usa l’email."
      }
    }
  };
  const book = () => COPY[String(document.documentElement.lang || "en").slice(0, 2).toLowerCase()] || COPY.en;
  const t = (key, vars) => String(book()[key] != null ? book()[key] : COPY.en[key]).replace(/\{(\w+)\}/g, (match, name) => (vars && vars[name] != null ? String(vars[name]) : match));
  // A server sentence the copy knows, in the page language; {name} matches the provider label it carries.
  function fromServer(message) {
    for (const [key, english] of Object.entries(COPY.en.server)) {
      const match = String(message).match(new RegExp("^" + english.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace("{name}", "(.+)") + "$"));
      if (match) return (book().server[key] || english).replace("{name}", match[1] || "");
    }
    return message;
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
      const error = new Error(data.error ? fromServer(data.error) : t("failed"));
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
    if (waiting) el("sign-in-code-label").textContent = factor ? t("authCode") : t("codeSent", { to: pending.sentTo });
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
        say(t(factor ? "digitsApp" : "digitsEmail"), true);
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
      say(t("finishPopup", { name: LABELS[id] }));
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
        if (/popup-closed|cancelled-popup/.test(code)) throw new Error(t("popupClosed", { name: LABELS[id] }));
        if (code === "popup-blocked") throw new Error(t("popupBlocked", { name: LABELS[id] }));
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
      say(t("providerUnconfirmed", { name: LABELS[id] }));
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
        say(t("accountUnconfirmed"));
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
    who: () => ({ name: (current() || {}).name || "", email: (current() || {}).email || "" }),
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
