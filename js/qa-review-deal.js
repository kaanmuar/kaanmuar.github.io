/**
 * The return price as a 3D ticket: struck list price, the new price counting down, and the code that did it.
 * Prices come from the server quote; this file only shows them and remembers the code from the link.
 */
(function () {
  const KEY = "qa-review-coupon";
  const STYLE = `
.deal { perspective: 1100px; margin: 6px 0 14px; }
.deal-ticket { --rx: 7deg; --ry: -9deg; position: relative; transform-style: preserve-3d; transform: rotateX(var(--rx)) rotateY(var(--ry)); border-radius: 22px; padding: 22px 22px 18px 112px; color: #f8fafc; background: linear-gradient(125deg, #0b1220 0%, #0f3b4a 46%, #0e7490 78%, #14b8a6 100%); box-shadow: 0 1px 0 rgba(255,255,255,.18) inset, 0 30px 60px -18px rgba(8,14,18,.65), 0 12px 24px -12px rgba(14,116,144,.55); -webkit-mask: radial-gradient(circle 13px at 96px 0, transparent 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 13px at 96px 100%, transparent 98%, #000) bottom/100% 51% no-repeat; mask: radial-gradient(circle 13px at 96px 0, transparent 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 13px at 96px 100%, transparent 98%, #000) bottom/100% 51% no-repeat; animation: deal-in 1.1s cubic-bezier(.2,.9,.25,1.15) both, deal-float 6s ease-in-out 1.2s infinite; transition: transform .25s ease-out; }
.deal-ticket::before { content: ""; position: absolute; inset: 0; border-radius: inherit; background: conic-gradient(from 210deg at 70% 30%, rgba(255,0,170,.0), rgba(0,255,214,.28), rgba(255,214,0,.22), rgba(140,82,255,.28), rgba(255,0,170,0)); mix-blend-mode: color-dodge; opacity: .55; background-size: 180% 180%; animation: deal-foil 7s linear infinite; pointer-events: none; }
.deal-ticket::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,.38) 48%, transparent 58%); background-size: 260% 100%; animation: deal-sheen 3.8s ease-in-out 1.1s infinite; pointer-events: none; }
.deal-stub { position: absolute; left: 0; top: 0; bottom: 0; width: 96px; display: grid; place-items: center; border-right: 2px dashed rgba(255,255,255,.28); transform: translateZ(55px); }
.deal-off { font: 800 30px/1 "Source Serif 4", Georgia, serif; letter-spacing: -.03em; writing-mode: vertical-rl; transform: rotate(180deg); text-shadow: 0 0 18px rgba(94,234,212,.75); }
.deal-eyebrow { margin: 0 0 4px; font: 700 11px/1.2 system-ui, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: #5eead4; transform: translateZ(30px); }
.deal-title { margin: 0 0 10px; font: 600 19px/1.25 system-ui, sans-serif; transform: translateZ(35px); }
.deal-prices { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; transform: translateZ(45px); }
.deal-was { position: relative; font: 500 22px/1 "Source Serif 4", Georgia, serif; color: rgba(248,250,252,.62); }
.deal-was::after { content: ""; position: absolute; left: -4px; right: -4px; top: 52%; height: 3px; border-radius: 3px; background: #fb7185; box-shadow: 0 0 10px rgba(251,113,133,.8); transform: rotate(-9deg) scaleX(0); transform-origin: left; animation: deal-strike .45s ease-out .75s forwards; }
.deal-now { font: 800 54px/.95 "Source Serif 4", Georgia, serif; letter-spacing: -.04em; text-shadow: 0 6px 26px rgba(20,184,166,.55); }
.deal-now small { font: 600 14px/1 system-ui, sans-serif; letter-spacing: .08em; margin-left: 6px; color: rgba(248,250,252,.75); }
.deal-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; font: 500 13px/1.3 system-ui, sans-serif; color: rgba(248,250,252,.82); transform: translateZ(25px); }
.deal-code { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; background: rgba(94,234,212,.16); border: 1px solid rgba(94,234,212,.45); font: 700 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .06em; color: #ccfbf1; }
.deal-spark { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #fff; box-shadow: 0 0 12px 3px rgba(94,234,212,.9); opacity: 0; transform: translateZ(80px); animation: deal-twinkle 2.6s ease-in-out infinite; }
.deal-spark:nth-of-type(1) { top: 14px; right: 26px; animation-delay: 1.1s; }
.deal-spark:nth-of-type(2) { bottom: 18px; right: 90px; animation-delay: 1.9s; }
.deal-spark:nth-of-type(3) { top: 46%; right: 14px; animation-delay: 2.6s; }
@keyframes deal-in { from { opacity: 0; transform: rotateY(-100deg) rotateX(20deg) translateZ(-160px) scale(.8); } to { opacity: 1; transform: rotateX(var(--rx)) rotateY(var(--ry)); } }
@keyframes deal-float { 50% { transform: rotateX(calc(var(--rx) - 3deg)) rotateY(calc(var(--ry) + 5deg)) translateY(-4px); } }
@keyframes deal-foil { to { background-position: 180% 180%; } }
@keyframes deal-sheen { 0% { background-position: 130% 0; } 60%, 100% { background-position: -130% 0; } }
@keyframes deal-strike { to { transform: rotate(-9deg) scaleX(1); } }
@keyframes deal-twinkle { 0%, 100% { opacity: 0; transform: translateZ(80px) scale(.4); } 50% { opacity: 1; transform: translateZ(80px) scale(1); } }
.deal-ticket.tilting { animation: none; }
@media (max-width: 420px) { .deal-ticket { padding-left: 92px; } .deal-stub { width: 78px; } .deal-now { font-size: 44px; } }
@media (prefers-reduced-motion: reduce) { .deal-ticket, .deal-ticket::before, .deal-ticket::after, .deal-spark { animation: none !important; } .deal-was::after { animation: none; transform: rotate(-9deg) scaleX(1); } .deal-ticket { transform: none; } }
`;

  const COPY = {
    en: { label: "Return price: {usd} USD instead of {list} USD", eyebrow: "Welcome back", applied: "Your return price is already applied.", earned: "Coming back pays. This price is yours.", keep: "You keep {usd} USD." },
    es: { label: "Precio de regreso: {usd} USD en lugar de {list} USD", eyebrow: "Qué bueno verte de nuevo", applied: "Tu precio de regreso ya está aplicado.", earned: "Volver tiene premio. Este precio es tuyo.", keep: "Te ahorras {usd} USD." },
    pt: { label: "Preço de retorno: {usd} USD em vez de {list} USD", eyebrow: "Que bom ver você de novo", applied: "Seu preço de retorno já está aplicado.", earned: "Voltar vale a pena. Este preço é seu.", keep: "Você economiza {usd} USD." },
    de: { label: "Rückkehrpreis: {usd} USD statt {list} USD", eyebrow: "Willkommen zurück", applied: "Ihr Rückkehrpreis ist bereits angewendet.", earned: "Wiederkommen lohnt sich. Dieser Preis gilt für Sie.", keep: "Sie sparen {usd} USD." },
    fr: { label: "Prix de retour : {usd} USD au lieu de {list} USD", eyebrow: "Bon retour", applied: "Votre prix de retour est déjà appliqué.", earned: "Revenir est récompensé. Ce prix est pour vous.", keep: "Vous économisez {usd} USD." },
    it: { label: "Prezzo di ritorno: {usd} USD invece di {list} USD", eyebrow: "Bentornato", applied: "Il tuo prezzo di ritorno è già applicato.", earned: "Tornare conviene. Questo prezzo è tuo.", keep: "Risparmi {usd} USD." }
  };

  function copy() {
    const lang = String(document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    return COPY[lang] ? { lang, text: COPY[lang] } : { lang: "en", text: COPY.en };
  }

  function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] != null ? vars[name] : match));
  }

  function money(value) {
    const dollars = Math.round(Number(value) * 100) / 100;
    return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
  }

  function addStyle() {
    if (document.getElementById("deal-style")) return;
    const style = document.createElement("style");
    style.id = "deal-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function code() {
    const fromLink = String(new URLSearchParams(location.search).get("coupon") || "").trim().toUpperCase();
    try {
      if (/^[A-Z0-9-]{4,24}$/.test(fromLink)) sessionStorage.setItem(KEY, fromLink);
      return sessionStorage.getItem(KEY) || "";
    } catch (error) {
      return /^[A-Z0-9-]{4,24}$/.test(fromLink) ? fromLink : "";
    }
  }

  function countDown(el, from, to) {
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const unit = "<small>USD</small>";
    if (still) {
      el.innerHTML = money(to) + unit;
      return;
    }
    const start = performance.now() + 700;
    const length = 900;
    el.innerHTML = money(from) + unit;
    function step(now) {
      const t = Math.min(1, Math.max(0, (now - start) / length));
      const eased = 1 - Math.pow(1 - t, 3);
      el.innerHTML = money(from + (to - from) * eased) + unit;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function tilt(ticket) {
    ticket.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      const box = ticket.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      ticket.classList.add("tilting");
      ticket.style.setProperty("--ry", (x * 22).toFixed(1) + "deg");
      ticket.style.setProperty("--rx", (-y * 16).toFixed(1) + "deg");
    });
    ticket.addEventListener("pointerleave", () => {
      ticket.style.setProperty("--ry", "-9deg");
      ticket.style.setProperty("--rx", "7deg");
    });
  }

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function render(host, deal) {
    if (!host) return false;
    host.textContent = "";
    const percent = Math.round(Number(deal && deal.percent) || 0);
    const list = Number(deal && deal.listUsd);
    const usd = Number(deal && (deal.usd != null ? deal.usd : deal.priceUsd));
    if (!percent || !(list > usd)) {
      host.hidden = true;
      return false;
    }
    addStyle();
    const { lang, text } = copy();
    const wrap = node("div", "deal");
    // Hand-translated copy must not be machine-translated again as if it were English.
    if (lang !== "en") wrap.setAttribute("translate", "no");
    const ticket = node("div", "deal-ticket");
    ticket.setAttribute("role", "group");
    ticket.setAttribute("aria-label", fill(text.label, { usd: money(usd), list: money(list) }));
    const stub = node("div", "deal-stub");
    stub.appendChild(node("span", "deal-off", "−" + percent + "%"));
    ticket.appendChild(stub);
    ticket.appendChild(node("p", "deal-eyebrow", text.eyebrow));
    ticket.appendChild(node("p", "deal-title", deal.coupon ? text.applied : text.earned));
    const prices = node("div", "deal-prices");
    const was = node("s", "deal-was", money(list) + " USD");
    const now = node("b", "deal-now");
    prices.appendChild(was);
    prices.appendChild(now);
    ticket.appendChild(prices);
    const foot = node("div", "deal-foot");
    if (deal.coupon) foot.appendChild(node("span", "deal-code notranslate", "✓ " + deal.coupon));
    foot.appendChild(node("span", "", fill(text.keep, { usd: money(list - usd) })));
    ticket.appendChild(foot);
    for (let index = 0; index < 3; index += 1) ticket.appendChild(node("i", "deal-spark"));
    wrap.appendChild(ticket);
    host.appendChild(wrap);
    host.hidden = false;
    countDown(now, list, usd);
    tilt(ticket);
    return true;
  }

  window.ReviewDeal = { code, render, money };
})();
