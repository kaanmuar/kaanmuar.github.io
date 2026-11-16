#!/usr/bin/env node
/* The URL review launch campaign (#3393): one mail to every past reviewer who did not opt out, with a 50% code for
   their next review. Rules and the send gate live in functions/launch-campaign.js; the mails in functions/launch-mail.js.

   node scripts/launch-campaign.js                              dry run: who would get it, by language (no mail, no code)
   node scripts/launch-campaign.js --test-owner [--option glass] one test copy of each design (or one) to the owner
                                                                address only, with a sample code that opens nothing
   node scripts/launch-campaign.js --approve <glass|night|editorial>
                                                                Carlos only: records his approval and the design, on a
                                                                terminal, signed in to gcloud as the owner
   node scripts/launch-campaign.js --send --confirm launch-2026-12 [--limit 150]
                                                                sends, once LAUNCH_CAMPAIGN_SEND=on is in functions/.env
                                                                and the approval exists; mints each code at its send

   Uses the signed-in gcloud account. Every send is logged in url_review_campaigns/launch-2026-12/sends, and a summary
   goes to the owner. Never run --approve or --send for Carlos. */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const readline = require("readline");
const { execSync } = require("child_process");

const PROJECT = process.env.GCLOUD_PROJECT || "carlosm-interactive-cv";
const FN = path.join(__dirname, "..", "functions");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : ""; };
const REVIEW_FN_URL = "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";
const KEEP_MS = 400 * 24 * 3600000;

const env = {};
fs.readFileSync(path.join(FN, ".env"), "utf8").split("\n").forEach((line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
});
const gcloud = (args) => execSync("gcloud " + args, { encoding: "utf8" }).trim();
const fnRequire = Module.createRequire(path.join(FN, "index.js"));
const campaign = require("../functions/launch-campaign");
const launchMail = require("../functions/launch-mail");

const mask = (email) => String(email).replace(/^(.)[^@]*(@.).*(\..*)$/, "$1***$2***$3");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function db() {
  const { Firestore } = fnRequire("@google-cloud/firestore");
  const { OAuth2Client } = fnRequire("google-auth-library");
  const fresh = () => ({ access_token: gcloud("auth print-access-token"), expiry_date: Date.now() + 45 * 60000 });
  const authClient = new OAuth2Client({ quotaProjectId: PROJECT });
  authClient.refreshHandler = async () => fresh();
  authClient.setCredentials(fresh());
  return new Firestore({ projectId: PROJECT, authClient });
}

function mailer() {
  const sgMail = fnRequire("@sendgrid/mail");
  const key = process.env.SENDGRID_API_KEY || env.SENDGRID_API_KEY || gcloud("secrets versions access latest --secret=SENDGRID_API_KEY --project " + PROJECT);
  const from = env.SENDGRID_FROM;
  if (!key || !from) throw new Error("SendGrid key or SENDGRID_FROM is missing.");
  sgMail.setApiKey(key);
  return { sgMail, from };
}

function message(from, to, mail, stopUrl, category) {
  return {
    to, from, replyTo: "qa@carlosandmunoz.com", subject: mail.subject, text: mail.text, html: mail.html, categories: [category],
    trackingSettings: { clickTracking: { enable: false, enableText: false }, openTracking: { enable: false } },
    headers: { "List-Unsubscribe": "<" + stopUrl + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
  };
}

async function people(store) {
  const [snap, stops, sent] = await Promise.all([
    store.collection("url_reviews").select("email", "status", "source", "lang", "createdAt", "test", "sweep", "report.host").get(),
    campaign.optOuts(store),
    campaign.sentHashes(store)
  ]);
  return { list: campaign.recipients(snap.docs.map((doc) => doc.data()), stops, sent), stops: stops.size, sent: sent.size, rows: snap.size };
}

async function dryRun() {
  const store = db();
  const found = await people(store);
  const byLang = {};
  found.list.forEach((p) => { byLang[p.lang] = (byLang[p.lang] || 0) + 1; });
  console.log("DRY RUN: " + found.rows + " review rows, " + found.list.length + " people would get the launch mail (" + found.stops + " opt-outs honoured, " + found.sent + " already sent).");
  console.log("By language: " + JSON.stringify(byLang));
  console.log("Newest five: " + found.list.slice(0, 5).map((p) => mask(p.email)).join(", "));
  const approval = (await store.collection(campaign.COLLECTION).doc(campaign.CAMPAIGN.id).get()).data();
  console.log("Gate: " + JSON.stringify(campaign.gate({ env, approval, send: true, confirm: campaign.CAMPAIGN.id })));
}

async function testOwner() {
  const { sgMail, from } = mailer();
  const only = value("--option");
  const options = only ? [only] : launchMail.OPTIONS;
  const stopUrl = REVIEW_FN_URL + "/notes/stop?t=test";
  for (const option of options) {
    const mail = launchMail.launchMail(option, value("--lang") || "en", { code: "LAUNCH-SAMPLE00", stopUrl });
    mail.subject = "[TEST " + option + "] " + mail.subject;
    await sgMail.send(message(from, campaign.OWNER, mail, stopUrl, "launch-2026-12-test"));
    console.log("Test copy (" + option + ") sent to " + mask(campaign.OWNER));
  }
}

async function approve() {
  const option = value("--approve");
  if (campaign.CAMPAIGN.options.indexOf(option) === -1) throw new Error("Name the design: --approve glass, night or editorial.");
  const account = gcloud("config get-value account").toLowerCase();
  if (account !== campaign.OWNER) throw new Error("Only the owner's gcloud account can approve the campaign.");
  if (!process.stdin.isTTY) throw new Error("Approve on a terminal: the approval asks for a typed confirmation.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const typed = await new Promise((resolve) => rl.question("Type \"I approve the " + option + " launch mail\" to approve: ", resolve));
  rl.close();
  if (typed.trim() !== "I approve the " + option + " launch mail") throw new Error("Not approved.");
  await db().collection(campaign.COLLECTION).doc(campaign.CAMPAIGN.id).set({ approved: true, approvedBy: account, approvedAt: new Date().toISOString(), option }, { merge: true });
  console.log("Approved: " + option + ". Set LAUNCH_CAMPAIGN_SEND=on in functions/.env, then run --send --confirm " + campaign.CAMPAIGN.id + ".");
}

async function send() {
  const store = db();
  const approval = (await store.collection(campaign.COLLECTION).doc(campaign.CAMPAIGN.id).get()).data();
  const gate = campaign.gate({ env, approval, send: true, confirm: value("--confirm") });
  if (!gate.ok) throw new Error("The launch campaign is held: " + gate.why + ". Nothing was sent and no code was minted.");
  const { sgMail, from } = mailer();
  const found = await people(store);
  const run = campaign.batch(found.list, value("--limit"));
  const tally = { sent: 0, failed: 0 };
  console.log("SEND (" + gate.option + "): " + run.people.length + " of " + found.list.length + " people, one every " + run.pauseMs / 1000 + " s.");
  for (const person of run.people) {
    const ref = store.collection(campaign.COLLECTION).doc(campaign.CAMPAIGN.id).collection("sends").doc(campaign.hashOf(person.email));
    let code = "";
    try {
      code = await campaign.mintFor(store, person, gate, Date.now());
      const token = require("crypto").randomBytes(16).toString("hex");
      await store.collection("url_review_stop_links").doc(token).set({ email: person.email, lang: person.lang, createdAt: new Date().toISOString(), expireAt: new Date(Date.now() + KEEP_MS) });
      const stopUrl = REVIEW_FN_URL + "/notes/stop?t=" + token;
      await sgMail.send(message(from, person.email, launchMail.launchMail(gate.option, person.lang, { code, stopUrl }), stopUrl, campaign.CAMPAIGN.id));
      await ref.set(campaign.sendRow(person, { state: "sent", option: gate.option, code }), { merge: true });
      tally.sent += 1;
    } catch (error) {
      await ref.set(campaign.sendRow(person, { state: "failed", option: gate.option, code, error: error.message }), { merge: true }).catch(() => null);
      tally.failed += 1;
    }
    await sleep(run.pauseMs);
  }
  await sgMail.send({ to: campaign.OWNER, from, subject: "Launch campaign: " + tally.sent + " sent, " + tally.failed + " failed", text: "Design " + gate.option + ". " + JSON.stringify(tally) + ". " + (found.list.length - run.people.length) + " left for the next run. Log: url_review_campaigns/" + campaign.CAMPAIGN.id + "/sends.", categories: ["launch-2026-12-summary"] });
  console.log(JSON.stringify(tally));
}

const job = flag("--approve") ? approve : flag("--send") ? send : flag("--test-owner") ? testOwner : dryRun;
job().then(() => process.exit(0), (error) => { console.error(error.message || error); process.exit(1); });
