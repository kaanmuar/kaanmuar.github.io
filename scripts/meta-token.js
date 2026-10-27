#!/usr/bin/env node
/* Stores the Meta tokens scripts/open-social-queue.js and scripts/facebook-queue.js post with as repo secrets (#526).
   The token is read from stdin, so it stays out of the shell history, and is never printed.

     pbpaste | node scripts/meta-token.js page      a user token of the "QA-lab Page Publisher" app (Graph API
                                                    Explorer, then "Extend Access Token" in the Access Token Debugger)
                                                    sets FACEBOOK_PAGE_TOKEN to the Page's token, which does not expire,
                                                    and INSTAGRAM_USER_ID to the linked Instagram professional account
     pbpaste | node scripts/meta-token.js threads   a Threads user token (the app's Threads use case, User Token
                                                    Generator) sets THREADS_TOKEN and the THREADS_TOKEN_EXPIRES variable
     node scripts/meta-token.js renew-threads       renews the stored Threads token for another 60 days

   A short-lived token is exchanged when FACEBOOK_APP_SECRET (page) or THREADS_APP_SECRET (threads) is set. The Threads
   token is also kept in ~/.config/qa-lab/threads.json (mode 600), because a GitHub secret cannot be read back to
   renew it. */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = "kaanmuar/kaanmuar.github.io";
const PAGE_ID = process.env.FACEBOOK_PAGE_ID || "1384763784723160";
const GRAPH = "https://graph.facebook.com/" + (process.env.FACEBOOK_GRAPH_VERSION || "v23.0");
const THREADS = "https://graph.threads.net";
const THREADS_FILE = path.join(os.homedir(), ".config/qa-lab/threads.json");
// facebook-queue.js posts to the Page; open-social-queue.js publishes on Instagram.
const PAGE_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish"];

async function get(url, params) {
  const res = await fetch(url + "?" + new URLSearchParams(params));
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(url.replace(/^https:\/\/[^/]+/, "") + " " + res.status + ": " + ((json.error && json.error.message) || JSON.stringify(json)).slice(0, 300));
  return json;
}

function stdin() {
  const text = fs.readFileSync(0, "utf8").trim();
  if (!/^[A-Za-z0-9_|.-]{20,}$/.test(text)) throw new Error("Copy the token, then run: pbpaste | node scripts/meta-token.js <page|threads>");
  return text;
}

function secret(name, value) {
  execFileSync("gh", ["secret", "set", name, "-R", REPO], { input: value, stdio: ["pipe", "ignore", "inherit"] });
  console.log("set secret " + name);
}

function variable(name, value) {
  execFileSync("gh", ["variable", "set", name, "-R", REPO, "--body", value], { stdio: ["ignore", "ignore", "inherit"] });
  console.log("set variable " + name + " = " + value);
}

const day = (ms) => new Date(ms).toISOString().slice(0, 10);

async function page() {
  let user = stdin();
  let info = (await get(GRAPH + "/debug_token", { input_token: user, access_token: user })).data || {};
  const missing = PAGE_SCOPES.filter((s) => !(info.scopes || []).includes(s));
  if (missing.length) throw new Error("The token lacks " + missing.join(", ") + ". Add them in Graph API Explorer and generate it again.");
  if (info.expires_at && info.expires_at * 1000 - Date.now() < 2 * 86400e3) {
    if (!process.env.FACEBOOK_APP_SECRET) throw new Error("That token expires within the hour. Open it in the Access Token Debugger, press \"Extend Access Token\", and pipe the extended one.");
    user = (await get(GRAPH + "/oauth/access_token", { grant_type: "fb_exchange_token", client_id: info.app_id, client_secret: process.env.FACEBOOK_APP_SECRET, fb_exchange_token: user })).access_token;
    info = (await get(GRAPH + "/debug_token", { input_token: user, access_token: user })).data || {};
  }
  const { data } = await get(GRAPH + "/me/accounts", { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100", access_token: user });
  const pg = (data || []).find((p) => p.id === PAGE_ID);
  if (!pg) throw new Error("The token does not manage Page " + PAGE_ID + ". Pick that Page when Graph API Explorer asks which Pages to allow.");
  const pageInfo = (await get(GRAPH + "/debug_token", { input_token: pg.access_token, access_token: pg.access_token })).data || {};
  console.log(pg.name + ": Page token " + (pageInfo.expires_at ? "expires " + day(pageInfo.expires_at * 1000) : "does not expire"));
  const ig = pg.instagram_business_account;
  if (!ig) throw new Error("The Page has no linked Instagram professional account yet (Page settings > Linked accounts > Instagram).");
  const quota = ((await get(GRAPH + "/" + ig.id + "/content_publishing_limit", { fields: "quota_usage,config", access_token: pg.access_token })).data || [])[0] || {};
  console.log("Instagram @" + ig.username + " (" + ig.id + "): " + (quota.quota_usage || 0) + " of " + ((quota.config && quota.config.quota_total) || "?") + " API posts used in the last 24 hours");
  secret("FACEBOOK_PAGE_TOKEN", pg.access_token);
  secret("INSTAGRAM_USER_ID", ig.id);
}

function keepThreads(token, expires) {
  fs.mkdirSync(path.dirname(THREADS_FILE), { recursive: true });
  fs.writeFileSync(THREADS_FILE, JSON.stringify({ token, expires }) + "\n", { mode: 0o600 });
  secret("THREADS_TOKEN", token);
  variable("THREADS_TOKEN_EXPIRES", expires);
}

// Long-lived tokens at least a day old renew for 60 days; a fresh one is kept as it is.
async function renewed(token) {
  try {
    const r = await get(THREADS + "/refresh_access_token", { grant_type: "th_refresh_token", access_token: token });
    return { token: r.access_token, expires: day(Date.now() + r.expires_in * 1000) };
  } catch (error) {
    return null;
  }
}

async function threads() {
  let token = stdin();
  let expires = day(Date.now() + 60 * 86400e3);
  if (process.env.THREADS_APP_SECRET) {
    const r = await get(THREADS + "/access_token", { grant_type: "th_exchange_token", client_secret: process.env.THREADS_APP_SECRET, access_token: token });
    token = r.access_token;
    expires = day(Date.now() + r.expires_in * 1000);
  }
  const me = await get(THREADS + "/v1.0/me", { fields: "id,username", access_token: token });
  console.log("Threads @" + me.username + " (" + me.id + ")");
  const fresh = await renewed(token);
  keepThreads(fresh ? fresh.token : token, fresh ? fresh.expires : expires);
}

async function renewThreads() {
  if (!fs.existsSync(THREADS_FILE)) throw new Error("No stored Threads token. Run: pbpaste | node scripts/meta-token.js threads");
  const fresh = await renewed(JSON.parse(fs.readFileSync(THREADS_FILE, "utf8")).token);
  if (!fresh) throw new Error("Threads did not renew the token. It may be less than a day old or already expired; generate a new one.");
  keepThreads(fresh.token, fresh.expires);
}

const COMMANDS = { page, threads, "renew-threads": renewThreads };
const command = COMMANDS[process.argv[2]];
if (!command) {
  console.error("Usage: pbpaste | node scripts/meta-token.js page|threads, or node scripts/meta-token.js renew-threads");
  process.exit(2);
}
command().catch((error) => { console.error(error.message); process.exit(1); });
