/* TikTok Business decision watch (#1889, part of #1888). Carlos applied on 2026-10-27 from
   qa@carlosandmunoz.com, an ImprovMX forward, so tiktokBusinessWatch (functions/index.js) reads the Gmail
   inbox it lands in over IMAP with an app password (QA_MAIL_APP_PASSWORD), All Mail and Spam both, since
   TikTok's mail may be filed anywhere. Rules only, no model:

   decision   TikTok mail about the account or application that says approved or rejected: pushed, mailed
              and noted on #1888 once; later runs stop
   unclear    TikTok mail about the application with neither: pushed once so Carlos reads it, the watch goes on
   anything else from TikTok (ads, newsletters, sign-in codes): ignored */

const SINCE = "2026-10-27";
const MAILBOX = "kaanmuar@gmail.com";
const TICKET = 1888;
const MAX_MAILS = 40;

const TIKTOK_FROM = /@([a-z0-9-]+\.)*(tiktok|tiktokv|tiktokglobalshop|bytedance)\.com$/i;
const TOPIC = /business|empresa|negocio|account|cuenta|application|solicitud|verif|review|revisi[oó]n|ads manager|advertis|anunciante/i;
const APPLICATION = /business (account|center|verification|application)|cuenta (de )?(empresa|negocio|business)|application|solicitud|verification|verificaci[oó]n|under review|en revisi[oó]n/i;
const REJECTED = /not (been )?approved|unable to (approve|verify)|could ?n['o]?t (be )?(approved|verified)|(was|has been|have been|is) (rejected|declined|denied)|\brejected\b|\bdeclined\b|did ?n['o]?t pass|failed (the )?review|unsuccessful|no (ha sido|fue|pudo ser) (aprobad|verificad)|rechazad|denegad|no super[oó]|no pudimos (aprobar|verificar)|no se pudo (aprobar|verificar)/i;
const APPROVED = /\bapproved\b|passed (the )?review|(account|application|verification) (is|was|has been) (now )?(active|verified|complete)|successfully verified|congratulations|aprobad[oa]|verificad[oa] (correctamente|con [ée]xito)|felicidades|enhorabuena/i;
// "Once approved, you can..." and "será aprobada en 3 días" are promises, not decisions.
const PROMISE = /\b(will|would|can|could|may|might|once|until|after|before|when|if|to|get) (be |get |been )?approved\b|\b(ser[aá]|sea|una vez|hasta que|cuando|despu[eé]s de ser) (sea )?aprobad[oa]/gi;

function addressOf(from) {
  const found = String(from || "").match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi);
  return found ? found[found.length - 1].toLowerCase() : "";
}

const isTikTok = (from) => TIKTOK_FROM.test(addressOf(from));

/** "approved", "rejected", "unclear" for mail about the application with neither, or "" for anything else. */
function verdict(mail) {
  const m = mail || {};
  if (!isTikTok(m.from)) return "";
  const words = (String(m.subject || "") + "\n" + String(m.text || "")).replace(PROMISE, " ");
  if (!TOPIC.test(words)) return "";
  if (REJECTED.test(words)) return "rejected";
  if (APPROVED.test(words)) return "approved";
  return APPLICATION.test(words) ? "unclear" : "";
}

/** The newest decision, and the unclear mails not pushed yet. Mails are { id, from, subject, text, date }. */
function sort(mails, seen) {
  const known = new Set(seen || []);
  const rows = (mails || []).filter((m) => m && m.id && Date.parse(m.date || 0) >= Date.parse(SINCE))
    .map((m) => Object.assign({}, m, { verdict: verdict(m) }))
    .sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
  return {
    decided: rows.find((m) => m.verdict === "approved" || m.verdict === "rejected") || null,
    unclear: rows.filter((m) => m.verdict === "unclear" && !known.has(m.id))
  };
}

const clip = (value, max) => {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};

function headline(m) {
  if (m.verdict === "approved") return "TikTok Business: approved";
  if (m.verdict === "rejected") return "TikTok Business: not approved";
  return "TikTok wrote about your Business application";
}

function message(m) {
  return {
    kind: "alerts",
    title: headline(m),
    body: clip(m.subject, 200) || "Open the mail from TikTok.",
    lines: [clip(m.from, 120), clip(m.text, 160)].filter(Boolean),
    tab: "systems",
    tag: "jarvis-tiktok-business-" + (m.verdict === "unclear" ? clip(m.id, 30) : "decision")
  };
}

function mail(m) {
  const next = m.verdict === "approved"
    ? "Next: check that Buffer still posts to TikTok and that TikTok numbers still arrive, then the profile (#" + TICKET + ")."
    : m.verdict === "rejected"
      ? "Next: note TikTok's reason on #" + TICKET + " and decide whether to reapply. Posting through Buffer keeps working on the current account."
      : "Jarvis could not tell whether this says approved or rejected, so it keeps watching. Read the mail below.";
  return {
    subject: headline(m),
    eyebrow: "Jarvis",
    intro: next,
    rows: [
      { label: "From", value: clip(m.from, 120) },
      { label: "Subject", value: clip(m.subject, 160) },
      { label: "Received", value: clip(m.date, 40) }
    ],
    body: clip(m.text, 1500),
    respondUrl: "https://github.com/kaanmuar/kaanmuar.github.io/issues/" + TICKET,
    buttonLabel: "Open #" + TICKET
  };
}

function comment(m) {
  return "**" + headline(m) + "** (found by `tiktokBusinessWatch`, #1889)\n\n"
    + "- From: " + clip(m.from, 120) + "\n- Subject: " + clip(m.subject, 160) + "\n- Received: " + clip(m.date, 40) + "\n\n"
    + "> " + clip(m.text, 600);
}

/** TikTok mail since SINCE from All Mail and Spam, newest last. ImapFlow and simpleParser are passed in. */
async function fetchMails({ user, pass }, ImapFlow, simpleParser) {
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();
  const out = [];
  try {
    const boxes = (await client.list()).filter((b) => b.specialUse === "\\All" || b.specialUse === "\\Junk").map((b) => b.path);
    for (const path of boxes.length ? boxes : ["INBOX"]) {
      const lock = await client.getMailboxLock(path);
      try {
        const uids = await client.search({ since: new Date(SINCE), or: [{ from: "tiktok" }, { from: "bytedance" }] }, { uid: true });
        for await (const msg of client.fetch((uids || []).slice(-MAX_MAILS), { uid: true, source: true }, { uid: true })) {
          const parsed = await simpleParser(msg.source);
          out.push({
            id: parsed.messageId || path + ":" + msg.uid,
            from: parsed.from ? parsed.from.text : "",
            subject: parsed.subject || "",
            text: parsed.text || "",
            date: parsed.date ? parsed.date.toISOString() : ""
          });
        }
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}

module.exports = { SINCE, MAILBOX, TICKET, isTikTok, verdict, sort, message, mail, comment, fetchMails };
