#!/usr/bin/env node
/* Copies the qa-lab-agents app ID and private key from ~/.config/qa-lab (app.json, app.pem) into functions/.env as
   GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY (the PEM, base64 on one line), for functions/github-app.js (#1734).
   Prints the names it set, never the values. Redeploy the functions afterwards.

     node scripts/functions-github-app-env.js [path/to/.env]   */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const DIR = path.join(os.homedir(), ".config", "qa-lab");
const target = path.resolve(process.argv[2] || path.join(__dirname, "..", "functions", ".env"));

const app = JSON.parse(fs.readFileSync(path.join(DIR, "app.json"), "utf8"));
const id = String(app.client_id || app.id || "");
const pem = fs.readFileSync(path.join(DIR, "app.pem"), "utf8");
if (!id) throw new Error("app.json has neither client_id nor id.");
crypto.createPrivateKey(pem);

const values = { GITHUB_APP_ID: id, GITHUB_APP_PRIVATE_KEY: Buffer.from(pem).toString("base64") };
const lines = fs.existsSync(target) ? fs.readFileSync(target, "utf8").split("\n") : [];
for (const [name, value] of Object.entries(values)) {
  const at = lines.findIndex((line) => line.startsWith(name + "="));
  if (at === -1) lines.splice(lines.length && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length, 0, name + "=" + value);
  else lines[at] = name + "=" + value;
}
fs.writeFileSync(target, lines.join("\n"), { mode: 0o600 });
console.log("Set " + Object.keys(values).join(" and ") + " in " + target + ". Redeploy the functions that read GitHub.");
