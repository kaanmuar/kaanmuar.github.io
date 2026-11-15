/**
 * The domain offer splash (#2615): a company that arrives from a profile campaign message (coupon=HI-...) sees its
 * first-payment offer once a session. The server says what the offer is and starts its window on that first view;
 * it opens at checkout only for an address on the company's domain or a verified domain, which this file only explains.
 * ReviewOffer.note(el, offer) is the pay page's line while the offer waits for that proof.
 */
(function () {
  const KEY = "qa-review-coupon";
  const SHOWN = "qa-review-offer-shown-";
  const CODE = /^HI-[A-Z0-9]{8}$/;
  const STYLE = `
.offer-splash { border: 0; padding: 0; max-width: min(440px, calc(100vw - 32px)); border-radius: 24px; background: transparent; color: #f8fafc; }
.offer-splash::backdrop { background: rgba(8, 14, 18, .62); backdrop-filter: blur(3px); }
.offer-card { position: relative; overflow: hidden; padding: 28px 26px 22px; border-radius: 24px; background: linear-gradient(135deg, #0b1220 0%, #0f3b4a 50%, #0e7490 82%, #14b8a6 100%); box-shadow: 0 30px 70px -20px rgba(8,14,18,.7); animation: offer-in .6s cubic-bezier(.2,.9,.25,1.15) both; }
.offer-card::after { content: ""; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,.28) 50%, transparent 60%); background-size: 260% 100%; animation: offer-sheen 3.6s ease-in-out .6s infinite; pointer-events: none; }
.offer-eyebrow { margin: 0 0 6px; font: 700 11px/1.3 system-ui, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: #5eead4; }
.offer-off { margin: 0; font: 800 64px/.95 "Source Serif 4", Georgia, serif; letter-spacing: -.04em; text-shadow: 0 6px 26px rgba(20,184,166,.55); }
.offer-title { margin: 2px 0 12px; font: 600 19px/1.25 system-ui, sans-serif; }
.offer-body, .offer-lock, .offer-ends { margin: 0 0 10px; font: 400 14.5px/1.45 system-ui, sans-serif; color: rgba(248,250,252,.9); }
.offer-lock { padding: 10px 12px; border-radius: 12px; background: rgba(94,234,212,.12); border: 1px solid rgba(94,234,212,.35); font-size: 13px; }
.offer-ends { font-weight: 600; color: #ccfbf1; }
.offer-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
.offer-actions button { min-height: 44px; padding: 0 18px; border-radius: 999px; font: 700 14px/1 system-ui, sans-serif; cursor: pointer; }
.offer-go { border: 0; background: #f8fafc; color: #0b1220; }
.offer-later { border: 1px solid rgba(248,250,252,.45); background: transparent; color: #f8fafc; }
.offer-actions button:focus-visible { outline: 3px solid #5eead4; outline-offset: 2px; }
.offer-note { margin: 6px 0 14px; padding: 12px 14px; border-radius: 14px; background: #ecfeff; border: 1px solid #67e8f9; color: #0e3a44; font: 500 14px/1.45 system-ui, sans-serif; }
@keyframes offer-in { from { opacity: 0; transform: translateY(18px) scale(.94); } to { opacity: 1; transform: none; } }
@keyframes offer-sheen { 0% { background-position: 130% 0; } 60%, 100% { background-position: -130% 0; } }
@media (prefers-reduced-motion: reduce) { .offer-card, .offer-card::after { animation: none !important; } }
`;
  const COPY = {
    en: { eyebrow: "A welcome offer for {host}", title: "off your first payment", body: "Your live report is up. Order the full review of {host} and save {p}% on your first payment.", lock: "Reserved for {host}: it applies at checkout when you sign in with an @{host} address or verify the domain.", ends: "Ends {date}.", go: "See my report", later: "Later", note: "Your {p}% offer for {host} applies at checkout once you are signed in with an @{host} address or the domain is verified." },
    es: { eyebrow: "Una oferta de bienvenida para {host}", title: "de descuento en tu primer pago", body: "Tu informe en vivo ya está publicado. Pide la revisión completa de {host} y ahorra un {p}% en tu primer pago.", lock: "Reservada para {host}: se aplica al pagar cuando inicias sesión con un correo @{host} o verificas el dominio.", ends: "Vence el {date}.", go: "Ver mi informe", later: "Más tarde", note: "Tu {p}% de descuento para {host} se aplica al pagar cuando inicias sesión con un correo @{host} o verificas el dominio." },
    pt: { eyebrow: "Uma oferta de boas-vindas para {host}", title: "de desconto no seu primeiro pagamento", body: "Seu relatório ao vivo já está no ar. Peça a revisão completa de {host} e economize {p}% no seu primeiro pagamento.", lock: "Reservada para {host}: vale no pagamento quando você entra com um e-mail @{host} ou verifica o domínio.", ends: "Vence em {date}.", go: "Ver meu relatório", later: "Depois", note: "Seus {p}% de desconto para {host} valem no pagamento quando você entra com um e-mail @{host} ou verifica o domínio." },
    de: { eyebrow: "Ein Willkommensangebot für {host}", title: "Rabatt auf Ihre erste Zahlung", body: "Ihr Live-Bericht ist online. Bestellen Sie die vollständige Prüfung von {host} und sparen Sie {p} % bei Ihrer ersten Zahlung.", lock: "Reserviert für {host}: gilt an der Kasse, wenn Sie sich mit einer @{host}-Adresse anmelden oder die Domain bestätigen.", ends: "Gültig bis {date}.", go: "Meinen Bericht ansehen", later: "Später", note: "Ihre {p} % für {host} gelten an der Kasse, sobald Sie mit einer @{host}-Adresse angemeldet sind oder die Domain bestätigt ist." },
    fr: { eyebrow: "Une offre de bienvenue pour {host}", title: "de remise sur votre premier paiement", body: "Votre rapport en direct est en ligne. Commandez l'audit complet de {host} et économisez {p} % sur votre premier paiement.", lock: "Réservée à {host} : elle s'applique au paiement si vous vous connectez avec une adresse @{host} ou vérifiez le domaine.", ends: "Valable jusqu'au {date}.", go: "Voir mon rapport", later: "Plus tard", note: "Vos {p} % pour {host} s'appliquent au paiement dès que vous êtes connecté avec une adresse @{host} ou que le domaine est vérifié." },
    it: { eyebrow: "Un'offerta di benvenuto per {host}", title: "di sconto sul tuo primo pagamento", body: "Il tuo report dal vivo è online. Ordina la revisione completa di {host} e risparmia il {p}% sul tuo primo pagamento.", lock: "Riservata a {host}: si applica al pagamento quando accedi con un indirizzo @{host} o verifichi il dominio.", ends: "Scade il {date}.", go: "Vedi il mio report", later: "Più tardi", note: "Il tuo {p}% per {host} si applica al pagamento quando accedi con un indirizzo @{host} o verifichi il dominio." }
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

  function addStyle() {
    if (document.getElementById("offer-style")) return;
    const style = document.createElement("style");
    style.id = "offer-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function code() {
    const fromLink = String(new URLSearchParams(location.search).get("coupon") || "").trim().toUpperCase();
    if (CODE.test(fromLink)) return fromLink;
    try { const kept = sessionStorage.getItem(KEY) || ""; return CODE.test(kept) ? kept : ""; } catch (error) { return ""; }
  }

  function dateOf(iso, lang) {
    const at = new Date(iso);
    if (isNaN(at.getTime())) return "";
    try { return at.toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" }); } catch (error) { return iso.slice(0, 10); }
  }

  function values(offer) {
    return { host: offer.host, p: Math.round(Number(offer.percent) || 0) };
  }

  function show(offer) {
    if (typeof HTMLDialogElement !== "function") return;
    addStyle();
    const { lang, text } = copy();
    const v = values(offer);
    const dialog = node("dialog", "offer-splash");
    dialog.setAttribute("aria-labelledby", "offer-off");
    if (lang !== "en") dialog.setAttribute("translate", "no");
    const card = node("div", "offer-card");
    card.appendChild(node("p", "offer-eyebrow", fill(text.eyebrow, v)));
    const off = node("p", "offer-off", "−" + v.p + "%");
    off.id = "offer-off";
    card.appendChild(off);
    card.appendChild(node("p", "offer-title", text.title));
    card.appendChild(node("p", "offer-body", fill(text.body, v)));
    card.appendChild(node("p", "offer-lock", fill(text.lock, v)));
    const ends = dateOf(offer.endsAt, lang);
    if (ends) card.appendChild(node("p", "offer-ends", fill(text.ends, { date: ends })));
    const actions = node("div", "offer-actions");
    const go = node("button", "offer-go", text.go);
    const later = node("button", "offer-later", text.later);
    go.type = later.type = "button";
    go.addEventListener("click", () => dialog.close("go"));
    later.addEventListener("click", () => dialog.close("later"));
    actions.appendChild(go);
    actions.appendChild(later);
    card.appendChild(actions);
    dialog.appendChild(card);
    dialog.addEventListener("close", () => {
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_offer_" + (dialog.returnValue || "closed"), "URL Review", offer.host);
      dialog.remove();
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    go.focus();
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_offer_shown", "URL Review", offer.host);
  }

  function note(host, offer) {
    if (!host || !offer || !offer.open || !offer.host) return false;
    addStyle();
    const { lang, text } = copy();
    host.textContent = "";
    const p = node("p", "offer-note", fill(text.note, values(offer)));
    if (lang !== "en") p.setAttribute("translate", "no");
    host.appendChild(p);
    return true;
  }

  async function arrive() {
    const key = code();
    if (!key || /qa-review-pay/.test(location.pathname)) return;
    try {
      sessionStorage.setItem(KEY, key);
      if (sessionStorage.getItem(SHOWN + key)) return;
    } catch (error) { /* private mode: show it anyway */ }
    const res = await fetch(endpoint() + "/offer?seen=1&code=" + encodeURIComponent(key)).catch(() => null);
    if (!res || !res.ok) return;
    const body = await res.json().catch(() => ({}));
    if (!body.offer || !body.offer.open) return;
    try { sessionStorage.setItem(SHOWN + key, "1"); } catch (error) { /* shown once this page */ }
    show(body.offer);
  }

  window.ReviewOffer = { note, show, code };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrive);
  else arrive();
})();
