/**
 * The outreach trial banner (#3136): a link with ?trial=TRY-XXXXXX shows what the trial is, asks a signed-out visitor
 * to sign in, and claims it once they are. The server decides everything (one trial per address, a locked domain);
 * this file only shows the answer, and tells the review page its pass changed.
 */
(function () {
  const KEY = "qa-review-trial";
  const CODE = /^TRY-[A-Z0-9]{6}$/;
  const STYLE = `
.trial-banner { position: relative; z-index: 2; box-sizing: border-box; width: calc(100% - 32px); margin: 12px auto; max-width: 960px; padding: 16px 18px; border-radius: 18px; background: linear-gradient(135deg, #0b1220 0%, #0f3b4a 55%, #0e7490 100%); color: #f8fafc; box-shadow: 0 18px 40px -20px rgba(8,14,18,.6); font: 400 15px/1.45 system-ui, sans-serif; }
.trial-banner p { margin: 0 0 6px; }
.trial-eyebrow { font: 700 11px/1.3 system-ui, sans-serif !important; letter-spacing: .16em; text-transform: uppercase; color: #5eead4; }
.trial-title { font: 600 18px/1.3 system-ui, sans-serif !important; }
.trial-ends { font-weight: 600; color: #ccfbf1; }
.trial-banner button { margin-top: 8px; min-height: 44px; padding: 0 18px; border: 0; border-radius: 999px; background: #f8fafc; color: #0b1220; font: 700 14px/1 system-ui, sans-serif; cursor: pointer; }
.trial-banner button:focus-visible { outline: 3px solid #5eead4; outline-offset: 2px; }
.trial-banner.is-closed { background: #1f2937; }
`;
  const COPY = {
    en: { eyebrow: "Free trial", title: "{days} days of the {plan} pass, free: {runs} full reviews.", signIn: "Sign in to claim it. Your link works until {date}.", lock: "Sign in with an @{domain} address.", go: "Sign in", claiming: "Claiming your trial…", claimed: "Your trial is on: {runs} full reviews until {date}. Start a review below.", gone: "This trial link is not valid.", expired: "This trial link has expired.", used: "This trial link was already claimed.", email: "This address already had a free trial.", domain: "This trial is for @{domain} addresses. Sign in with one to claim it.", "domain-used": "{domain} already claimed its free trial.", pass: "You already have an open pass, so the trial was kept for later.", error: "The trial could not be claimed right now. Reload the page to try again." },
    es: { eyebrow: "Prueba gratis", title: "{days} días del pase {plan}, gratis: {runs} revisiones completas.", signIn: "Inicia sesión para activarla. Tu enlace vale hasta el {date}.", lock: "Inicia sesión con un correo @{domain}.", go: "Iniciar sesión", claiming: "Activando tu prueba…", claimed: "Tu prueba está activa: {runs} revisiones completas hasta el {date}. Empieza una revisión abajo.", gone: "Este enlace de prueba no es válido.", expired: "Este enlace de prueba ya venció.", used: "Este enlace de prueba ya se usó.", email: "Este correo ya tuvo una prueba gratis.", domain: "Esta prueba es para correos @{domain}. Inicia sesión con uno para activarla.", "domain-used": "{domain} ya usó su prueba gratis.", pass: "Ya tienes un pase activo, así que guardamos la prueba para después.", error: "No se pudo activar la prueba ahora. Recarga la página para intentarlo de nuevo." },
    pt: { eyebrow: "Teste grátis", title: "{days} dias do passe {plan}, grátis: {runs} revisões completas.", signIn: "Entre para ativar. Seu link vale até {date}.", lock: "Entre com um e-mail @{domain}.", go: "Entrar", claiming: "Ativando seu teste…", claimed: "Seu teste está ativo: {runs} revisões completas até {date}. Comece uma revisão abaixo.", gone: "Este link de teste não é válido.", expired: "Este link de teste expirou.", used: "Este link de teste já foi usado.", email: "Este e-mail já teve um teste grátis.", domain: "Este teste é para e-mails @{domain}. Entre com um para ativar.", "domain-used": "{domain} já usou seu teste grátis.", pass: "Você já tem um passe ativo, então guardamos o teste para depois.", error: "Não foi possível ativar o teste agora. Recarregue a página para tentar de novo." },
    de: { eyebrow: "Kostenloser Test", title: "{days} Tage {plan}-Pass, kostenlos: {runs} vollständige Prüfungen.", signIn: "Melden Sie sich an, um ihn zu aktivieren. Ihr Link gilt bis {date}.", lock: "Melden Sie sich mit einer @{domain}-Adresse an.", go: "Anmelden", claiming: "Ihr Test wird aktiviert…", claimed: "Ihr Test läuft: {runs} vollständige Prüfungen bis {date}. Starten Sie unten eine Prüfung.", gone: "Dieser Testlink ist ungültig.", expired: "Dieser Testlink ist abgelaufen.", used: "Dieser Testlink wurde bereits eingelöst.", email: "Diese Adresse hatte bereits einen kostenlosen Test.", domain: "Dieser Test gilt für @{domain}-Adressen. Melden Sie sich mit einer an, um ihn zu aktivieren.", "domain-used": "{domain} hat seinen kostenlosen Test bereits eingelöst.", pass: "Sie haben bereits einen aktiven Pass, daher bleibt der Test für später.", error: "Der Test konnte gerade nicht aktiviert werden. Laden Sie die Seite neu, um es erneut zu versuchen." },
    fr: { eyebrow: "Essai gratuit", title: "{days} jours du pass {plan}, gratuits : {runs} audits complets.", signIn: "Connectez-vous pour l'activer. Votre lien est valable jusqu'au {date}.", lock: "Connectez-vous avec une adresse @{domain}.", go: "Se connecter", claiming: "Activation de votre essai…", claimed: "Votre essai est actif : {runs} audits complets jusqu'au {date}. Lancez un audit ci-dessous.", gone: "Ce lien d'essai n'est pas valide.", expired: "Ce lien d'essai a expiré.", used: "Ce lien d'essai a déjà été utilisé.", email: "Cette adresse a déjà eu un essai gratuit.", domain: "Cet essai est réservé aux adresses @{domain}. Connectez-vous avec l'une d'elles pour l'activer.", "domain-used": "{domain} a déjà utilisé son essai gratuit.", pass: "Vous avez déjà un pass actif, l'essai est donc gardé pour plus tard.", error: "L'essai n'a pas pu être activé pour le moment. Rechargez la page pour réessayer." },
    it: { eyebrow: "Prova gratuita", title: "{days} giorni del pass {plan}, gratis: {runs} revisioni complete.", signIn: "Accedi per attivarla. Il tuo link vale fino al {date}.", lock: "Accedi con un indirizzo @{domain}.", go: "Accedi", claiming: "Attivazione della prova…", claimed: "La tua prova è attiva: {runs} revisioni complete fino al {date}. Avvia una revisione qui sotto.", gone: "Questo link di prova non è valido.", expired: "Questo link di prova è scaduto.", used: "Questo link di prova è già stato usato.", email: "Questo indirizzo ha già avuto una prova gratuita.", domain: "Questa prova è per indirizzi @{domain}. Accedi con uno per attivarla.", "domain-used": "{domain} ha già usato la sua prova gratuita.", pass: "Hai già un pass attivo, quindi la prova resta per dopo.", error: "Non è stato possibile attivare la prova ora. Ricarica la pagina per riprovare." }
  };

  function endpoint() {
    const host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") return "http://127.0.0.1:8768";
    return "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";
  }

  function copy() {
    const lang = String(document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    return { lang: COPY[lang] ? lang : "en", text: COPY[lang] || COPY.en };
  }

  const fill = (text, values) => String(text).replace(/\{(\w+)\}/g, (all, key) => (values[key] != null ? values[key] : all));

  function dateOf(iso, lang) {
    const at = new Date(iso);
    if (isNaN(at.getTime())) return "";
    try { return at.toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" }); } catch (error) { return String(iso).slice(0, 10); }
  }

  function code() {
    const fromLink = String(new URLSearchParams(location.search).get("trial") || "").trim().toUpperCase();
    try {
      if (CODE.test(fromLink)) sessionStorage.setItem(KEY, fromLink);
      const kept = sessionStorage.getItem(KEY) || "";
      return CODE.test(kept) ? kept : "";
    } catch (error) {
      return CODE.test(fromLink) ? fromLink : "";
    }
  }

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function banner() {
    let box = document.getElementById("trial-banner");
    if (box) return box;
    if (!document.getElementById("trial-style")) {
      const style = document.createElement("style");
      style.id = "trial-style";
      style.textContent = STYLE;
      document.head.appendChild(style);
    }
    box = node("section", "trial-banner");
    box.id = "trial-banner";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    if (copy().lang !== "en") box.setAttribute("translate", "no");
    const top = document.querySelector("header.topbar");
    if (top) top.after(box);
    else document.body.insertBefore(box, document.body.firstChild);
    return box;
  }

  function paint(lines, closed, action) {
    const box = banner();
    const { text } = copy();
    box.textContent = "";
    box.classList.toggle("is-closed", !!closed);
    box.appendChild(node("p", "trial-eyebrow", text.eyebrow));
    lines.forEach(([cls, line]) => box.appendChild(node("p", cls, line)));
    if (action) {
      const go = node("button", "", action.label);
      go.type = "button";
      go.addEventListener("click", action.run);
      box.appendChild(go);
    }
  }

  let trial = null;
  let claimedFor = "";

  function values(extra) {
    const { lang } = copy();
    return Object.assign({ days: trial.days, runs: trial.runs, plan: trial.planName, domain: trial.domain, date: dateOf(trial.validUntil, lang) }, extra || {});
  }

  function forget() {
    try { sessionStorage.removeItem(KEY); } catch (error) { /* nothing kept */ }
  }

  async function claim(session) {
    const { lang, text } = copy();
    claimedFor = session.session;
    paint([["trial-title", fill(text.title, values())], ["", text.claiming]]);
    const res = await fetch(endpoint() + "/trial", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ op: "trial-redeem", code: trial.code }, session)) }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (body.ok) {
      forget();
      paint([["trial-title", fill(text.claimed, values({ date: dateOf(body.paidUntil, lang) }))]]);
      window.dispatchEvent(new CustomEvent("qa-review-pass-changed"));
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_trial_claimed", "URL Review", trial.code);
      return;
    }
    const why = text[body.why] ? body.why : "error";
    if (why === "sign-in") { claimedFor = ""; return offer(); }
    if (why !== "domain" && why !== "error") forget();
    paint([["", fill(text[why], values())]], why !== "domain");
  }

  function offer() {
    const { text } = copy();
    const lines = [["trial-title", fill(text.title, values())], ["trial-ends", fill(text.signIn, values())]];
    if (trial.domain) lines.push(["", fill(text.lock, values())]);
    paint(lines, false, window.ReviewAuth ? { label: text.go, run: () => ReviewAuth.focus() } : null);
  }

  function changed(signedIn) {
    if (!trial || !trial.open) return;
    const proof = window.ReviewAuth ? ReviewAuth.proof() : {};
    if (signedIn && proof.session) { if (proof.session !== claimedFor) claim(proof); }
    else offer();
  }

  async function arrive() {
    const key = code();
    if (!key) return;
    const res = await fetch(endpoint() + "/trial?code=" + encodeURIComponent(key)).catch(() => null);
    const body = res && res.ok ? await res.json().catch(() => ({})) : {};
    trial = body.trial || { code: key, open: false, why: "gone" };
    if (!trial.open) {
      forget();
      paint([["", copy().text[trial.why] || copy().text.gone]], true);
      return;
    }
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_trial_shown", "URL Review", key);
    if (window.ReviewAuth) ReviewAuth.onChange(changed);
    else offer();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrive);
  else arrive();
})();
