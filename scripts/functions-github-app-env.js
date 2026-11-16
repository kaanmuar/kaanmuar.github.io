#!/usr/bin/env node
/* Copies the qa-lab-agents app ID and private key from ~/.config/qa-lab (app.json, app.pem) for functions/github-app.js
   (#1734): GITHUB_APP_ID into functions/.env, and GITHUB_APP_PRIVATE_KEY (the PEM, base64 on one line) into
   functions/.secret.local, since Secret Manager holds it in production. Prints the names it set, never the values.
   Then run the printed secrets:set command and redeploy the functions.

     node scripts/functions-github-app-env.js [functions dir]   */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const DIR = path.join(os.homedir(), ".config", "qa-lab");
const functionsDir = path.resolve(process.argv[2] || path.join(__dirname, "..", "functions"));

const app = JSON.parse(fs.readFileSync(path.join(DIR, "app.json"), "utf8"));
const id = String(app.client_id || app.id || "");
const pem = fs.readFileSync(path.join(DIR, "app.pem"), "utf8");
if (!id) throw new Error("app.json has neither client_id nor id.");
crypto.createPrivateKey(pem);

// Firebase refuses to deploy a name that is both a secret and a functions/.env line.
function write(file, set, drop = []) {
  const lines = (fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n") : []).filter((line) => !drop.some((name) => line.startsWith(name + "=")));
  for (const [name, value] of Object.entries(set)) {
    const at = lines.findIndex((line) => line.startsWith(name + "="));
    if (at === -1) lines.splice(lines.length && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length, 0, name + "=" + value);
    else lines[at] = name + "=" + value;
  }
  fs.writeFileSync(file, lines.join("\n"), { mode: 0o600 });
}

const env = path.join(functionsDir, ".env");
const local = path.join(functionsDir, ".secret.local");
write(env, { GITHUB_APP_ID: id }, ["GITHUB_APP_PRIVATE_KEY"]);
write(local, { GITHUB_APP_PRIVATE_KEY: Buffer.from(pem).toString("base64") });
console.log("Set GITHUB_APP_ID in " + env + " and GITHUB_APP_PRIVATE_KEY in " + local + ".");
console.log("Production: grep '^GITHUB_APP_PRIVATE_KEY=' " + local + " | cut -d= -f2- | tr -d '\\n' | npx firebase-tools functions:secrets:set GITHUB_APP_PRIVATE_KEY --data-file=-, then redeploy the functions that read GitHub.");
