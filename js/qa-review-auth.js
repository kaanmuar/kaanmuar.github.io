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
      const error = new Error(data.error || "Sign-in failed. Try again in a moment.");
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
    if (waiting) el("sign-in-code-label").textContent = factor ? "Code from your authenticator app" : "Code sent to " + pending.sentTo;
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
        say("Enter your email.", true);
        return;
      }
      say("Sending a code to " + email + "…");
      const openedAt = Number(box.getAttribute("data-opened")) || Date.now();
      waitForCode(await post("/auth/email", { email, openedAt, company: (el("hp-note") || { value: "" }).value }));
    });
  }

  function checkCode() {
    return run(async () => {
      const pending = read(PENDING_KEY);
      const code = el("sign-in-code").value.replace(/\D/g, "");
      if (code.length !== 6) {
        say(factor ? "Type the 6 digits from your authenticator app." : "Type the 6 digits from the email.", true);
        return;
      }
      if (factor) {
        const { auth } = await loadFirebase();
        let result;
        try {
          result = await factor.resolver.resolveSignIn(auth.TotpMultiFactorGenerator.assertionForSignIn(factor.hint.uid, code));
        } catch (error) {
          throw new Error("That authenticator code did not match. Try the current one.");
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
      say("Finish the " + LABELS[id] + " sign-in in the window that opened.");
      let result;
      try {
        result = await auth.signInWithPopup(instance, providerFor(auth, id));
      } catch (error) {
        const code = String((error && error.code) || "unknown").replace(/^auth\//, "");
        if (code === "multi-factor-auth-required") {
          const resolver = auth.getMultiFactorResolver(instance, error);
          const hint = resolver.hints.find((item) => item.factorId === auth.TotpMultiFactorGenerator.FACTOR_ID);
          if (!hint) throw new Error("This account asks for a second step this page cannot take. Use email instead.");
          factor = { resolver, hint, id };
          paint();
          say("This account has two-step sign-in. Type the code from your authenticator app.");
          el("sign-in-code").focus();
          return;
        }
        if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_sign_in_failed", "URL Review", id + " " + code);
        if (/popup-closed|cancelled-popup/.test(code)) throw new Error("The " + LABELS[id] + " window closed before sign-in finished.");
        if (code === "popup-blocked") throw new Error("This browser blocked the " + LABELS[id] + " window. Allow pop-ups for this site, or use email.");
        if (code === "account-exists-with-different-credential") throw new Error("This email already signs in another way. Use that option, or email.");
        throw new Error(LABELS[id] + " sign-in failed (" + code + "). Try again, or use email.");
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
      say(LABELS[id] + " did not confirm this address, so we emailed it a code.");
    }
  }

  function withOAuth(id) {
    return run(async () => {
      say("Opening " + LABELS[id] + "…");
      const data = await post("/auth/oauth/" + id + "/start", {});
      write(RETURN_KEY, location.pathname);
      location.assign(data.url);
    });
  }

  function paintProviders(list) {
    const others = list.filter((item) => item.id !== "email" && LABELS[item.id]);
    el("sign-in-providers").innerHTML = others.map((item) =>
      '<button type="button" class="btn sign-in-provider" data-provider="' + item.id + '"' + (item.oauth ? " data-oauth" : "") + '><span class="sign-in-mark sign-in-' + item.id.split(".")[0] + '" aria-hidden="true"></span>Continue with ' + LABELS[item.id] + "</button>"
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
      say("Checking the sign-in…");
      let data;
      try {
        data = await post("/auth/oauth/finish", sent);
      } catch (error) {
        if (error.code === "other-device") box.classList.add("elsewhere");
        throw error;
      }
      if (!data.session) {
        waitForCode(data);
        say("That account did not confirm this address, so we emailed it a code.");
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
      say("Checking the sign-in link…");
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
