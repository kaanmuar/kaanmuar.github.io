/* Account page: owner DMARC / TLS-RPT report consent (#3777). Privacy notice, on/off, withdraw, and DNS setup steps.
   Wire /account/dmarc-consent and /account/dmarc-consent-set. EN is the source; other langs reuse EN until #3952. */
(function () {
  const COPY = {
    en: {
      title: "Read my DMARC and TLS-RPT reports",
      intro: "After you verify a site, you can let QA-lab read the aggregate reports receivers send for that domain. Turn this on only when you are ready to point those report addresses at QA-lab.",
      host: "Verified site host",
      load: "Show status",
      needProof: "Verify this site first on the section above, then come back here.",
      needProofLink: "Verify a site",
      accept: "I have read the notice and I want QA-lab to read the reports for this domain.",
      turnOn: "Turn reading on",
      turnOff: "Turn reading off",
      withdrawing: "Turning off and deleting stored counts…",
      saving: "Saving…",
      on: "Reading is on for this site. Keep the DNS records below in place so reports keep arriving.",
      off: "Reading is off. The review only states the public DMARC policy for this site.",
      withdrawn: "Reading is off. Stored report counts for this site were deleted.",
      bad: "Enter a public host name, such as shop.example.com.",
      failed: "That did not work. Try again in a moment.",
      noticeHead: "Privacy notice",
      noticeVersion: "Notice version",
      setup: "Setup steps",
      step1: "Verify you own the site (section above) if it is not already verified for this account.",
      step2: "Read the privacy notice, tick the box, and turn reading on.",
      step3: "Add this address to the rua= list in your DMARC TXT record on _dmarc.<domain> (keep any existing addresses, separated by commas):",
      step4: "Publish a TLS-RPT TXT record on _smtp._tls.<domain> with:",
      step5: "Receivers usually send reports once a day. After counts arrive, a review of this site can say whether tightening the DMARC policy is safe.",
      statusOn: "On",
      statusOff: "Off",
      until: "until"
    }
  };
  const section = document.getElementById("dmarc");
  if (!section || !window.ReviewAuth) return;
  let copy = COPY.en;
  let lang = "en";
  let noticeVersion = "";
  let mailbox = "";
  const $ = (id) => document.getElementById(id);
  const hostEl = $("dmarc-host");
  const statusEl = $("dmarc-status");
  const acceptEl = $("dmarc-accept");
  const onBtn = $("dmarc-on");
  const offBtn = $("dmarc-off");

  function paint() {
    section.lang = lang;
    section.querySelectorAll("[data-copy]").forEach((el) => {
      el.textContent = copy[el.getAttribute("data-copy")] || "";
    });
  }
  function say(message, tone) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("bad", tone === "bad");
    statusEl.classList.toggle("ok", tone === "ok");
  }
  function apexOf(host) {
    const parts = String(host || "")
      .toLowerCase()
      .replace(/\.$/, "")
      .split(".")
      .filter(Boolean);
    if (parts.length < 2) return parts.join(".") || "";
    return parts.slice(-2).join(".");
  }
  function showNotice(notice) {
    const box = $("dmarc-notice");
    box.replaceChildren();
    if (!notice) return;
    noticeVersion = String(notice.version || "");
    const title = document.createElement("h3");
    title.textContent = notice.title || copy.noticeHead;
    box.appendChild(title);
    (notice.lines || []).forEach((line) => {
      const p = document.createElement("p");
      p.textContent = line;
      box.appendChild(p);
    });
    if (noticeVersion) {
      const ver = document.createElement("p");
      ver.className = "muted small";
      ver.textContent = copy.noticeVersion + " " + noticeVersion;
      box.appendChild(ver);
    }
  }
  function showSetup(host) {
    const steps = $("dmarc-steps");
    const domain = apexOf(host) || "example.com";
    const mail = mailbox || "dmarc@carlosandmunoz.com";
    $("dmarc-rua").textContent = "rua=mailto:" + mail;
    $("dmarc-tls").textContent = "v=TLSRPTv1; rua=mailto:" + mail;
    $("dmarc-dmarc-host").textContent = "_dmarc." + domain;
    $("dmarc-tls-host").textContent = "_smtp._tls." + domain;
    steps.hidden = false;
  }
  function paintState(data) {
    if (data.mailbox) mailbox = data.mailbox;
    if (data.notice) showNotice(data.notice);
    const on = !!data.on;
    const proved = !!data.proofKind;
    $("dmarc-state").textContent = on ? copy.statusOn : copy.statusOff;
    $("dmarc-state").classList.toggle("ok", on);
    acceptEl.checked = false;
    acceptEl.disabled = on || !proved;
    onBtn.disabled = on || !proved;
    offBtn.disabled = !on && !(data.consent && data.consent.on);
    $("dmarc-need-proof").hidden = proved;
    if (data.host) showSetup(data.host);
    if (!proved) say(copy.needProof, "bad");
    else if (on) {
      const until = data.consent && data.consent.until;
      say(copy.on + (until ? " (" + copy.until + " " + new Date(until).toLocaleDateString(lang) + ")" : ""), "ok");
    } else say(copy.off);
  }
  async function call(path, extra) {
    if (typeof window.account !== "function") {
      say(copy.failed, "bad");
      return null;
    }
    let response;
    try {
      response = await window.account(path, extra || {});
    } catch (error) {
      say(copy.failed, "bad");
      return null;
    }
    if (window.signedOut(response)) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.notice) showNotice(data.notice);
      if (data.mailbox) mailbox = data.mailbox;
      say(data.error || (response.status === 400 ? copy.bad : copy.failed), "bad");
      return null;
    }
    return data;
  }
  async function load() {
    const host = hostEl.value.trim();
    if (!host) {
      say(copy.bad, "bad");
      hostEl.focus();
      return;
    }
    say("");
    const data = await call("/account/dmarc-consent", { host });
    if (data) paintState(data);
  }
  async function setAccept(accept) {
    const host = hostEl.value.trim();
    if (!host) {
      say(copy.bad, "bad");
      hostEl.focus();
      return;
    }
    if (accept && !acceptEl.checked) {
      say(copy.accept, "bad");
      acceptEl.focus();
      return;
    }
    onBtn.disabled = true;
    offBtn.disabled = true;
    say(accept ? copy.saving : copy.withdrawing);
    try {
      const data = await call("/account/dmarc-consent-set", {
        host,
        accept: !!accept,
        noticeVersion: accept ? noticeVersion : undefined
      });
      if (!data) return;
      paintState({
        notice: data.notice,
        mailbox: data.mailbox,
        host,
        proofKind: data.proofKind,
        consent: data.consent,
        on: !!(data.consent && data.consent.on)
      });
      if (!accept) say(copy.withdrawn, "ok");
      if (window.SiteAnalytics)
        SiteAnalytics.trackEvent("qa_review_account_dmarc_consent", "URL Review", accept ? "on" : "off");
    } finally {
      /* paintState resets disabled flags */
    }
  }
  $("dmarc-load").addEventListener("click", () => {
    load();
  });
  onBtn.addEventListener("click", () => setAccept(true));
  offBtn.addEventListener("click", () => setAccept(false));
  window.ReviewAuth.onChange(async (signed) => {
    section.hidden = !signed;
    if (!signed) return;
    // Prefetch the privacy notice (and mailbox) without a host so the owner can read it first.
    // Quiet: do not write errors into the status line before the owner asks for a host.
    if (typeof window.account === "function") {
      try {
        const response = await window.account("/account/dmarc-consent", {});
        if (!window.signedOut(response) && response.ok) {
          const data = await response.json().catch(() => ({}));
          if (data.notice) showNotice(data.notice);
          if (data.mailbox) mailbox = data.mailbox;
        }
      } catch (error) {
        /* leave the notice empty until the owner loads a host */
      }
    }
    if (location.hash === "#dmarc") section.scrollIntoView();
  });
  paint();
  if (window.SiteI18n)
    SiteI18n.resolve().then((resolved) => {
      const code = String(resolved || "en").slice(0, 2);
      // EN required; other langs reuse EN until native review (#3952).
      lang = COPY[code] ? code : "en";
      copy = COPY[lang] || COPY.en;
      paint();
    });
})();
