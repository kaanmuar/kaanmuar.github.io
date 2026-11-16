#!/usr/bin/env node
// Refreshes the retire.js vulnerability list bundled with the URL review: node scripts/retire-update.js
const fs = require("fs");
const path = require("path");

const SOURCE = "https://raw.githubusercontent.com/RetireJS/retire.js/master/repository/jsrepository-v4.json";
const OUT = path.join(__dirname, "..", "functions", "assets", "retire.json");
const SKIP = new Set(["retire-example", "dont check"]);
const KEEP = ["uri", "filename", "filecontent", "func"];
// Report names. Entries that share one (the jQuery UI widgets) are merged.
const NAMES = {
  "@angular/core": "Angular", angularjs: "AngularJS", "backbone.js": "Backbone.js", bootstrap: "Bootstrap", "bootstrap-select": "bootstrap-select",
  "chart.js": "Chart.js", ckeditor: "CKEditor 4", ckeditor5: "CKEditor 5", DOMPurify: "DOMPurify", ember: "Ember", handlebars: "Handlebars",
  highcharts: "Highcharts", highlightjs: "highlight.js", jquery: "jQuery", "jquery-migrate": "jQuery Migrate", "jquery-mobile": "jQuery Mobile",
  "jquery-ui": "jQuery UI", "jquery-ui-dialog": "jQuery UI", "jquery-ui-tooltip": "jQuery UI", "jquery-validation": "jQuery Validation",
  "jquery.datatables": "DataTables", "jquery.prettyPhoto": "prettyPhoto", knockout: "Knockout", lodash: "Lodash", "moment.js": "Moment.js",
  mootools: "MooTools", nextjs: "Next.js", "pdf.js": "PDF.js", plupload: "Plupload", prototypejs: "Prototype", react: "React", "react-dom": "React DOM",
  select2: "Select2", svelte: "Svelte", threejs: "three.js", tinyMCE: "TinyMCE", "underscore.js": "Underscore", "video.js": "Video.js", vue: "Vue", YUI: "YUI"
};

function trim(text, max) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error("retire.js list answered " + res.status);
  const repo = await res.json();
  const libraries = {};
  Object.keys(repo).sort().forEach((key) => {
    if (SKIP.has(key)) return;
    const row = repo[key];
    const extractors = {};
    KEEP.forEach((kind) => {
      const list = ((row.extractors || {})[kind] || []).filter((item) => kind !== "func" || !/require\(/.test(item));
      if (list.length) extractors[kind] = list;
    });
    const flaws = (row.vulnerabilities || []).filter((item) => item.below).map((item) => {
      const ids = item.identifiers || {};
      const out = { below: item.below, severity: item.severity || "medium" };
      if (item.atOrAbove) out.atOrAbove = item.atOrAbove;
      const named = (ids.CVE || []).slice(0, 2).concat(ids.CVE && ids.CVE.length ? [] : [ids.githubID || ""]).filter(Boolean);
      if (named.length) out.ids = named.map(String);
      if (ids.summary) out.summary = trim(ids.summary, 140);
      return out;
    });
    if (!Object.keys(extractors).length || !flaws.length) return;
    const name = NAMES[key] || key;
    const lib = libraries[name] || (libraries[name] = { extractors: {}, flaws: [] });
    Object.keys(extractors).forEach((kind) => {
      lib.extractors[kind] = [...new Set((lib.extractors[kind] || []).concat(extractors[kind]))];
    });
    lib.flaws = lib.flaws.concat(flaws);
  });
  const body = { source: SOURCE, license: "Apache-2.0, RetireJS contributors", fetched: new Date().toISOString().slice(0, 10), libraries };
  fs.writeFileSync(OUT, JSON.stringify(body) + "\n");
  console.log(Object.keys(libraries).length + " libraries, " + Math.round(fs.statSync(OUT).size / 1024) + " KB written to " + path.relative(process.cwd(), OUT));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
