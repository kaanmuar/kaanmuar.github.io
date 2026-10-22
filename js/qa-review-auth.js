/* Sign-in for URL reviews. The session and the device key live in this browser only;
   the server refuses a run, or a code or link, that comes from any other device. */
(function () {
  const DEVICE_KEY = "qa-review-device-key";
  const SESSION_KEY = "qa-review-session";
  const PENDING_KEY = "qa-review-sign-in";
  const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
  const FIREBASE = { apiKey: "AIzaSyA2-6WkecV3GoAK4qlsdGtH3jisjk3bK0w", authDomain: "carlosm-interactive-cv.firebaseapp.com", projectId: "carlosm-interactive-cv", appId: "1:976558418058:web:1dc19bcd40915ea233e573" };
  const LABELS = { "google.com": "Google", "microsoft.com": "Microsoft", "apple.com": "Apple", "github.com": "GitHub", "yahoo.com": "Yahoo" };
  const box = document.getElementById("sign-in");
  if (!box) return;
  const el = (id) => document.getElementById(id);
  const listeners = [];
  let firebase = null;
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
      body: JSON.stringify(Object.assign({ deviceKey: deviceKey(), lang: document.documentElement.lang || "en" }, body))
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
    box.classList.toggle("done", !!signed);
    el("sign-in-start").hidden = !!signed || !!pending;
    el("sign-in-code-step").hidden = !!signed || !pending;
    el("sign-in-done").hidden = !signed;
    if (pending && !signed) el("sign-in-sent").textContent = pending.sentTo;
    if (signed) el("sign-in-who").textContent = signed.email;
    const email = el("email");
    if (email) {
      email.value = signed ? signed.email : "";
      email.readOnly = true;
    }
    listeners.forEach((fn) => fn(!!signed));
  }

  function signedIn(data) {
    write(SESSION_KEY, { session: data.session, email: data.email, provider: data.provider });
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
        say("Type the 6 digits from the email.", true);
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
    if (id === "google.com") return new auth.GoogleAuthProvider();
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
        if (error && /popup-closed|cancelled-popup/.test(error.code || "")) throw new Error("The " + LABELS[id] + " window closed before sign-in finished.");
        if (error && /account-exists-with-different-credential/.test(error.code || "")) throw new Error("This email already signs in another way. Use that option, or email.");
        throw new Error(LABELS[id] + " sign-in failed. Try again, or use email.");
      }
      const idToken = await result.user.getIdToken();
      await auth.signOut(instance);
      const data = await post("/auth/provider", { idToken });
      if (data.session) signedIn(data);
      else {
        waitForCode(data);
        say(LABELS[id] + " did not confirm this address, so we emailed it a code.");
      }
    });
  }

  function paintProviders(list) {
    const others = list.filter((item) => item.id !== "email" && LABELS[item.id]);
    el("sign-in-providers").innerHTML = others.map((item) =>
      '<button type="button" class="btn sign-in-provider" data-provider="' + item.id + '"><span class="sign-in-mark sign-in-' + item.id.split(".")[0] + '" aria-hidden="true"></span>Continue with ' + LABELS[item.id] + "</button>"
    ).join("");
    el("sign-in-or").hidden = !others.length;
    if (others.length) loadFirebase().catch(() => { /* the button retries the load */ });
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

  box.setAttribute("data-opened", String(Date.now()));
  el("sign-in-send").addEventListener("click", sendCode);
  el("sign-in-check").addEventListener("click", checkCode);
  el("sign-in-email").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); sendCode(); } });
  el("sign-in-code").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); checkCode(); } });
  el("sign-in-restart").addEventListener("click", () => { write(PENDING_KEY, null); say(""); paint(); });
  el("sign-in-providers").addEventListener("click", (event) => {
    const button = event.target.closest("[data-provider]");
    if (button) withProvider(button.getAttribute("data-provider"));
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
  else confirmSaved();
})();
