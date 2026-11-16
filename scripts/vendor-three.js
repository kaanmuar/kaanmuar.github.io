#!/usr/bin/env node
// Copies three.module.js and examples/jsm into vendor/three for CSP-safe self-hosting (#3591).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const nm = path.join(root, "node_modules", "three");
const out = path.join(root, "vendor", "three");

if (!fs.existsSync(path.join(nm, "build", "three.module.js"))) {
  console.error("Run npm install (three is a devDependency) before vendor:three");
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "build"), { recursive: true });
fs.copyFileSync(path.join(nm, "build", "three.module.js"), path.join(out, "build", "three.module.js"));
execFileSync("cp", ["-R", path.join(nm, "examples", "jsm"), path.join(out, "examples")]);
console.log("Vendored three →", out);