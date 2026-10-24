/* Registrable domains from the Public Suffix List bundled in assets/public_suffix_list.dat
   (publicsuffix.org, MPL-2.0; scripts/psl-update.js refreshes it).

   registrable(host): the domain one party controls, from the whole list (the WHATWG URL "registrable domain"),
   so finanz.gv.at and oesterreich.gv.at, or two github.io sites, are different sites. Every check of whether a
   mailbox, cookie or link is on the reviewed site's domain uses it.
   registryDomain(host): the domain bought from a registry, from the ICANN section only, for RDAP, DNS mail
   records and rank lists.
   Both return the host itself for an IP address, a single label such as localhost, or a host that is a public suffix. */

const fs = require("fs");
const net = require("net");
const path = require("path");
const url = require("url");

const LIST = path.join(__dirname, "assets", "public_suffix_list.dat");

// The public suffix plus one label, or "" when the host is itself a public suffix (gv.at).
// The ICANN section, and the private one (github.io, eu.org) too when withPrivate is set.
function suffixRegistrable(listText, withPrivate) {
  const rules = new Set();
  const read = (name) => {
    const section = String(listText || "").split("===BEGIN " + name + " DOMAINS===")[1] || "";
    section.split("===END " + name + " DOMAINS===")[0].split("\n").forEach((line) => {
      const rule = line.trim().split(/\s/)[0];
      if (!rule || rule.startsWith("//")) return;
      const [, mark, label] = rule.match(/^(!|\*\.)?(.*)$/);
      rules.add((mark || "") + (url.domainToASCII(label) || label));
    });
  };
  read("ICANN");
  if (withPrivate) read("PRIVATE");
  return (hostname) => {
    const labels = String(hostname || "").replace(/\.$/, "").toLowerCase().split(".").filter(Boolean);
    let suffix = 1;
    for (let at = 0; at < labels.length; at += 1) {
      const name = labels.slice(at).join(".");
      if (rules.has("!" + name)) { suffix = labels.length - at - 1; break; }
      if (rules.has(name) || (at + 1 < labels.length && rules.has("*." + labels.slice(at + 1).join(".")))) { suffix = labels.length - at; break; }
    }
    return labels.length > suffix ? labels.slice(-suffix - 1).join(".") : "";
  };
}

function hostOf(hostname) {
  const host = String(hostname || "").trim().toLowerCase().replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "");
  return !host || net.isIP(host) ? host : url.domainToASCII(host) || host;
}

const lookups = {};
function lookup(withPrivate) {
  const key = withPrivate ? "all" : "icann";
  if (!lookups[key]) lookups[key] = suffixRegistrable(fs.readFileSync(LIST, "utf8"), withPrivate);
  return lookups[key];
}

function registrable(hostname) {
  const host = hostOf(hostname);
  return !host || net.isIP(host) ? host : lookup(true)(host) || host;
}

function registryDomain(hostname) {
  const host = hostOf(hostname);
  return !host || net.isIP(host) ? host : lookup(false)(host) || host;
}

module.exports = { suffixRegistrable, registrable, registryDomain };
