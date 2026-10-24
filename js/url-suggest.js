/*
 * Predicts the host on the URL Review "Public page" box and the report's
 * competitor box, and checks it exists.
 *
 * Suggestions come from assets/domains/ (built by scripts/build-domain-index.js):
 * about 100,000 of the most visited sites worldwide, sharded by the first two
 * characters of the host without www. or m. Once the host looks complete, a
 * DNS-over-HTTPS lookup says whether it is online and, when it is not a known
 * site, offers the closest popular host. After an online host and a slash, it
 * lists page paths from that site's sitemap, read once per host by reviewUrl/paths.
 */
(function () {
  "use strict";

  const BASE = "assets/domains/";
  const SHOWN = 6;
  // {host} and {fix} become elements; the rest of the hint is plain text.
  const COPY = {
    en: {
      known: "{host} is online and is one of the most visited sites worldwide.", online: "{host} is online.",
      missing: "{host} does not exist.", spell: "{host} does not exist. Check the spelling.",
      noAddress: "{host} is registered but has no website address.", didYouMean: " Did you mean {fix}?",
      sites: "Suggested sites", pages: "Suggested pages"
    },
    es: {
      known: "{host} está en línea y es uno de los sitios más visitados del mundo.", online: "{host} está en línea.",
      missing: "{host} no existe.", spell: "{host} no existe. Revisa cómo está escrito.",
      noAddress: "{host} está registrado, pero no tiene dirección de sitio web.", didYouMean: " ¿Quisiste decir {fix}?",
      sites: "Sitios sugeridos", pages: "Páginas sugeridas"
    },
    pt: {
      known: "{host} está no ar e é um dos sites mais visitados do mundo.", online: "{host} está no ar.",
      missing: "{host} não existe.", spell: "{host} não existe. Confira a grafia.",
      noAddress: "{host} está registrado, mas não tem endereço de site.", didYouMean: " Você quis dizer {fix}?",
      sites: "Sites sugeridos", pages: "Páginas sugeridas"
    },
    de: {
      known: "{host} ist online und gehört zu den meistbesuchten Websites der Welt.", online: "{host} ist online.",
      missing: "{host} existiert nicht.", spell: "{host} existiert nicht. Bitte prüfen Sie die Schreibweise.",
      noAddress: "{host} ist registriert, hat aber keine Website-Adresse.", didYouMean: " Meinten Sie {fix}?",
      sites: "Vorgeschlagene Websites", pages: "Vorgeschlagene Seiten"
    },
    fr: {
      known: "{host} est en ligne et fait partie des sites les plus visités au monde.", online: "{host} est en ligne.",
      missing: "{host} n’existe pas.", spell: "{host} n’existe pas. Vérifiez l’orthographe.",
      noAddress: "{host} est enregistré mais n’a pas d’adresse de site web.", didYouMean: " Vouliez-vous dire {fix} ?",
      sites: "Sites suggérés", pages: "Pages suggérées"
    },
    it: {
      known: "{host} è online ed è uno dei siti più visitati al mondo.", online: "{host} è online.",
      missing: "{host} non esiste.", spell: "{host} non esiste. Controlla come è scritto.",
      noAddress: "{host} è registrato ma non ha un indirizzo di sito web.", didYouMean: " Volevi dire {fix}?",
      sites: "Siti suggeriti", pages: "Pagine suggerite"
    }
  };
  function words() {
    return COPY[String(document.documentElement.lang || "en").slice(0, 2).toLowerCase()] || COPY.en;
  }

  // Splits a template on its slots and fills each with the matching node, so the host never runs into the text around it.
  function compose(template, nodes) {
    return template.split(/(\{\w+\})/).filter(Boolean).map((part) => {
      const slot = part.match(/^\{(\w+)\}$/);
      return slot && nodes[slot[1]] ? nodes[slot[1]] : part;
    });
  }
  const shards = new Map();
  const answers = new Map();
  const sitePaths = new Map();

  function keyOf(host) {
    return host.replace(/^(www|m)\./, "");
  }

  function hostPart(value) {
    return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0].split(":")[0];
  }

  function load(name) {
    if (!shards.has(name)) {
      shards.set(name, fetch(BASE + name + ".txt")
        .then((res) => (res.ok ? res.text() : ""))
        .then((text) => text.split("\n").filter(Boolean))
        .catch(() => []));
    }
    return shards.get(name);
  }

  function shardFor(key) {
    return load(key.slice(0, 2).replace(/\./g, "_"));
  }

  async function lookup(host, type) {
    try {
      const res = await fetch("https://dns.google/resolve?name=" + encodeURIComponent(host) + "&type=" + type);
      if (!res.ok) return "unknown";
      const data = await res.json();
      if (data.Status === 3) return "missing";
      if (data.Status !== 0) return "unknown";
      return data.Answer && data.Answer.length ? "found" : "empty";
    } catch (error) {
      return "unknown";
    }
  }

  function endpoint() {
    const host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") return "http://127.0.0.1:8768";
    return "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";
  }

  function pathsFor(host) {
    if (!sitePaths.has(host)) {
      sitePaths.set(host, fetch(endpoint() + "/paths?host=" + encodeURIComponent(host))
        .then((res) => (res.ok ? res.json() : {}))
        .then((data) => (Array.isArray(data.paths) ? data.paths.filter((path) => typeof path === "string") : []))
        .catch(() => []));
    }
    return sitePaths.get(host);
  }

  function resolve(host) {
    if (!answers.has(host)) {
      answers.set(host, lookup(host, "A")
        .then((state) => (state === "empty" ? lookup(host, "AAAA") : state))
        .then((state) => (state === "empty" ? "no-address" : state)));
    }
    return answers.get(host);
  }

  // Optimal string alignment distance, giving up once it passes max.
  function distance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = [];
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
      const row = [i];
      let best = i;
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, prev2[j - 2] + 1);
        row.push(value);
        if (value < best) best = value;
      }
      if (best > max) return max + 1;
      prev2 = prev;
      prev = row;
    }
    return prev[b.length];
  }

  async function nearest(host) {
    const key = keyOf(host);
    const max = key.length >= 10 ? 2 : 1;
    const pools = await Promise.all([load("top"), shardFor(key)]);
    let found = "";
    let score = max + 1;
    pools.forEach((pool) => pool.forEach((candidate) => {
      const other = keyOf(candidate);
      if (other === key || score === 1) return;
      const d = distance(key, other, Math.min(max, score - 1));
      if (d < score) { score = d; found = candidate; }
    }));
    return found;
  }

  function looksComplete(host) {
    return /^([a-z0-9-]+\.)+([a-z]{2,}|xn--[a-z0-9-]+)$/.test(host);
  }

  function attach(inputId, fieldId, track) {
    const input = document.getElementById(inputId);
    const field = document.getElementById(fieldId);
    if (!input || !field) return;

    let seq = 0;
    let timer = 0;
    let options = [];
    let mode = "host";
    let active = -1;
    let picking = false;

    const list = document.createElement("ul");
    list.id = inputId + "-suggest";
    list.className = "url-suggest notranslate";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", words().sites);
    list.hidden = true;
    field.after(list);

    const hint = document.createElement("p");
    hint.id = inputId + "-hint";
    hint.className = "url-hint";
    hint.setAttribute("aria-live", "polite");
    (document.getElementById(inputId + "-error") || list).after(hint);

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-describedby", hint.id);

    function render() {
      list.setAttribute("aria-label", mode === "path" ? words().pages : words().sites);
      list.replaceChildren(...options.map((option, index) => {
        const item = document.createElement("li");
        item.id = inputId + "-opt-" + index;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", index === active ? "true" : "false");
        item.textContent = option;
        item.addEventListener("mousedown", (event) => event.preventDefault());
        item.addEventListener("click", () => choose(index));
        return item;
      }));
      list.hidden = !options.length;
      input.setAttribute("aria-expanded", options.length ? "true" : "false");
      if (active >= 0 && options[active]) input.setAttribute("aria-activedescendant", inputId + "-opt-" + active);
      else input.removeAttribute("aria-activedescendant");
    }

    function close() {
      options = [];
      active = -1;
      render();
    }

    function fill(value, how) {
      picking = true;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      picking = false;
      close();
      check();
      input.focus();
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_url_suggest", "URL Review", track + how);
    }

    function pick(host, how) {
      fill(host + input.value.trim().slice(hostPart(input.value).length), how);
    }

    function pickPath(path) {
      fill(input.value.trim().match(/^(https?:\/\/)?[^/?#]*/i)[0] + path, "path");
    }

    function choose(index) {
      if (mode === "path") pickPath(options[index]);
      else pick(options[index], "list");
    }

    function say(state, key, host, fix) {
      hint.className = "url-hint" + (state ? " " + state : "");
      hint.replaceChildren();
      const book = words();
      if (book === COPY.en) {
        hint.removeAttribute("lang");
        hint.removeAttribute("translate");
      } else {
        hint.lang = document.documentElement.lang;
        hint.setAttribute("translate", "no");
      }
      if (!key) return;
      const name = document.createElement("b");
      name.className = "notranslate";
      name.textContent = host;
      hint.append(...compose(book[key], { host: name }));
      if (fix) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "url-fix notranslate";
        button.textContent = fix;
        button.addEventListener("click", () => pick(fix, "did-you-mean"));
        hint.append(...compose(book.didYouMean, { fix: button }));
      }
    }

    async function suggestPaths(mine, host, typed) {
      if (!looksComplete(host)) return close();
      const state = await resolve(host);
      if (mine !== seq) return;
      if (state !== "found") return close();
      const pool = await pathsFor(host);
      if (mine !== seq) return;
      const want = typed.toLowerCase();
      const starts = pool.filter((path) => path !== typed && path.toLowerCase().startsWith(want));
      const within = want.length > 1 ? pool.filter((path) => !path.toLowerCase().startsWith(want) && path.toLowerCase().includes(want)) : [];
      options = starts.concat(within).slice(0, SHOWN);
      mode = "path";
      active = -1;
      render();
    }

    async function suggest() {
      const mine = ++seq;
      const value = input.value;
      const typed = value.trim().replace(/^https?:\/\//i, "");
      const slash = typed.indexOf("/");
      if (slash > 0 && !/[?#]/.test(typed)) return suggestPaths(mine, typed.slice(0, slash).toLowerCase(), typed.slice(slash));
      const host = hostPart(value);
      const key = keyOf(host);
      if (/[/?#]/.test(value) || key.length < 2) return close();
      const pool = await shardFor(key);
      if (mine !== seq) return;
      const matches = [];
      for (const candidate of pool) {
        if (keyOf(candidate).startsWith(key) || candidate.startsWith(host)) matches.push(candidate);
        if (matches.length === SHOWN) break;
      }
      options = matches.length === 1 && matches[0] === host ? [] : matches;
      mode = "host";
      active = -1;
      render();
    }

    async function check() {
      const host = hostPart(input.value);
      if (!looksComplete(host)) return say("", "");
      const [state, pool] = await Promise.all([resolve(host), shardFor(keyOf(host))]);
      if (host !== hostPart(input.value)) return;
      const known = pool.some((candidate) => keyOf(candidate) === keyOf(host));
      if (state === "found" && known) return say("ok", "known", host);
      const fix = await nearest(host);
      if (host !== hostPart(input.value)) return;
      if (state === "found") return say(fix ? "warn" : "ok", "online", host, fix);
      if (state === "missing") return say("bad", fix ? "missing" : "spell", host, fix);
      if (state === "no-address") return say("bad", "noAddress", host, fix);
      say("", "");
    }

    input.addEventListener("input", () => {
      if (picking) return;
      suggest();
      clearTimeout(timer);
      say("", "");
      timer = setTimeout(check, 500);
    });

    input.addEventListener("keydown", (event) => {
      if (list.hidden) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        active = (active + step + options.length + 1) % (options.length + 1);
        if (active === options.length) active = -1;
        render();
      } else if ((event.key === "Enter" || event.key === "Tab") && active >= 0) {
        if (event.key === "Enter") event.preventDefault();
        choose(active);
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    input.addEventListener("blur", close);
    input.addEventListener("focus", suggest);
  }

  attach("url", "url-field", "");
  attach("compare-url", "compare-url-field", "compare-");
})();
