#!/usr/bin/env node
/* Prints an installation token for the qa-lab-agents GitHub App on carlosandmunoz-hq. Its calls count against the
   installation's GraphQL budget (10,000 points an hour inside the QA-lab enterprise), not kaanmuar's.
   Reads ~/.config/qa-lab/app.json and app.pem (mode 600) and caches the token there until 5 minutes before it
   expires (tokens last an hour).

     GH_TOKEN=$(scripts/gh-app-token.js) gh project item-edit ...   */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const DIR = path.join(os.homedir(), ".config", "qa-lab");
const ORG = "carlosandmunoz-hq";
const CACHE = path.join(DIR, "token.json");

function b64url(value) {
  return Buffer.from(
    typeof value === "string" ? value : JSON.stringify(value),
  ).toString("base64url");
}

async function api(url, token, method = "GET") {
  const res = await fetch("https://api.github.com" + url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "User-Agent": "qa-lab-agents",
    },
  });
  if (!res.ok)
    throw new Error(
      method + " " + url + ": " + res.status + " " + (await res.text()),
    );
  return res.json();
}

async function main() {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.parse(cached.expires_at) - Date.now() > 5 * 60 * 1000)
      return cached.token;
  } catch (error) {
    /* no usable cache */
  }

  const app = JSON.parse(fs.readFileSync(path.join(DIR, "app.json"), "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const body =
    b64url({ alg: "RS256", typ: "JWT" }) +
    "." +
    b64url({
      iat: now - 60,
      exp: now + 540,
      iss: String(app.client_id || app.id),
    });
  const jwt =
    body +
    "." +
    crypto
      .sign(
        "RSA-SHA256",
        Buffer.from(body),
        fs.readFileSync(path.join(DIR, "app.pem")),
      )
      .toString("base64url");

  const installation = await api("/orgs/" + ORG + "/installation", jwt);
  const { token, expires_at } = await api(
    "/app/installations/" + installation.id + "/access_tokens",
    jwt,
    "POST",
  );
  fs.writeFileSync(CACHE, JSON.stringify({ token, expires_at }), {
    mode: 0o600,
  });
  return token;
}

main()
  .then((token) => process.stdout.write(token))
  .catch((error) => {
    console.error("gh-app-token: " + error.message);
    process.exit(1);
  });
