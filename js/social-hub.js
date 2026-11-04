/* The social hub feed (qa-review-social*.html): filters, copy, share, download and clips over assets/social/feed[-<lang>].json: one card per post, in the page's language when it exists.
   The page arrives with its first cards prerendered by scripts/build-social-hub.js; this takes over once the feed loads. */
(function () {
  const Card = window.SocialHubCard;
  const copy = window.SocialHubCopy;
  const lang = copy.lang;
  const sfx = lang === "en" ? "" : "-" + lang;
  const STEP = 24;
  const feedEl = document.getElementById("hub-feed");
  const countEl = document.getElementById("hub-count");
  const emptyEl = document.getElementById("hub-empty");
  const moreBtn = document.getElementById("hub-more");
  const langSel = document.getElementById("hub-lang");
  const topicSel = document.getElementById("hub-topic");
  const searchEl = document.getElementById("hub-q");
  const sortSel = document.getElementById("hub-sort");
  const dirBtn = document.getElementById("hub-dir");
  const mediaSel = document.getElementById("hub-media");
  const netSel = document.getElementById("hub-net");
  const rangeSel = document.getElementById("hub-range");
  const datesEl = document.getElementById("hub-dates");
  const fromEl = document.getElementById("hub-from");
  const toEl = document.getElementById("hub-to");
  const reportEl = document.getElementById("hub-report");
  const dialog = document.getElementById("hub-dialog");
  const dialogBody = document.getElementById("hub-dialog-body");
  const params = new URLSearchParams(location.search);
  const pick = (value, list, fallback) => (list.includes(value) ? value : fallback);
  const isDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : "";
  const sort = pick(params.get("s"), Card.SORTS, "date");
  // Links from before the Media filter (?k=video) open the Videos view.
  const state = {
    kind: params.get("k") === "video" ? "all" : params.get("k") || "all", lang: params.get("l") || "all", topic: params.get("t") || "all", q: params.get("q") || "",
    sort, dir: pick(params.get("d"), ["asc", "desc"], Card.defaultDir(sort)),
    media: params.get("k") === "video" ? "video" : pick(params.get("m"), ["image", "video"], "all"), net: params.get("n") || "all",
    range: pick(params.get("r"), ["7", "30", "90", "custom"], "all"), from: isDay(params.get("from")), to: isDay(params.get("to")),
    report: params.get("rep") === "1", shown: STEP
  };
  const DEFAULTS = { kind: "all", lang: "all", topic: "all", q: "", sort: "date", dir: "desc", media: "all", net: "all", range: "all", from: "", to: "", report: false };
  let posts = [];
  let captions = null;

  function track(name, label, extra) {
    if (window.SiteAnalytics && SiteAnalytics.trackEvent) SiteAnalytics.trackEvent(name, "Social hub", String(label || "").slice(0, 80), extra);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function daysAgo(n) {
    return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  }

  // Last N days runs up to today; a custom range takes either end alone.
  function inRange(date) {
    if (state.range === "all") return true;
    if (state.range === "custom") return (!state.from || date >= state.from) && (!state.to || date <= state.to);
    return date >= daysAgo(Number(state.range)) && date <= today();
  }

  function matches(post) {
    if (state.kind === "trending" ? !post.trend : state.kind !== "all" && post.kind !== state.kind) return false;
    if (state.media === "video" ? !post.youtube : state.media === "image" && post.youtube) return false;
    if (state.net !== "all" && !(post.nets || []).includes(state.net)) return false;
    if (state.report && !post.report) return false;
    if (!inRange(post.date)) return false;
    if (state.lang !== "all" && post.clipLang !== state.lang) return false;
    if (state.topic !== "all" && post.cat !== state.topic) return false;
    if (!state.q) return true;
    const q = state.q.toLowerCase();
    return (post.title + " " + post.text + " " + post.cat + " " + Card.topic(post, copy)).toLowerCase().includes(q);
  }

  function syncUrl() {
    const url = new URL(location.href);
    const custom = state.range === "custom";
    [["k", state.kind], ["l", state.lang], ["t", state.topic], ["q", state.q], ["s", state.sort === "date" ? "" : state.sort],
      ["d", state.dir === Card.defaultDir(state.sort) ? "" : state.dir], ["m", state.media], ["n", state.net], ["r", state.range],
      ["from", custom ? state.from : ""], ["to", custom ? state.to : ""], ["rep", state.report ? "1" : ""]].forEach(([key, value]) => {
      if (value && value !== "all") url.searchParams.set(key, value); else url.searchParams.delete(key);
    });
    history.replaceState(null, "", url);
  }

  function dirLabel() {
    const labels = state.sort === "date" ? copy.dirs.date : state.sort === "title" ? copy.dirs.title : copy.dirs.metric;
    const desc = state.sort === "title" ? state.dir === "asc" : state.dir === "desc";
    return labels[desc ? 0 : 1];
  }

  // Trending keeps its rank order until the reader picks another sort.
  function render() {
    let list = posts.filter(matches);
    if (state.kind === "trending" && state.sort === "date" && state.dir === "desc") list.sort((a, b) => a.trend - b.trend);
    else list = Card.sortPosts(list, state.sort, state.dir, state.net);
    feedEl.innerHTML = list.slice(0, state.shown).map((post) => Card.cardHtml(post, copy, lang, state.net)).join("");
    countEl.textContent = copy.count.replace("{n}", list.length);
    emptyEl.hidden = list.length > 0;
    moreBtn.hidden = list.length <= state.shown;
    controls();
  }

  function controls() {
    document.querySelectorAll(".hub-chip").forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.kind === state.kind)));
    dirBtn.textContent = dirLabel();
    dirBtn.setAttribute("aria-label", copy.sortDir + ": " + dirLabel());
    dirBtn.dataset.dir = state.dir;
    datesEl.hidden = state.range !== "custom";
  }

  function update(changes, label) {
    Object.assign(state, changes, { shown: STEP });
    syncUrl();
    render();
    if (label) track("hub_filter", label);
  }

  function byId(id) {
    return posts.find((post) => post.id === id);
  }

  function shareUrl(post, net) {
    const url = new URL(Card.permalink(post, lang, true));
    url.searchParams.set("utm_source", net);
    url.searchParams.set("utm_medium", "social");
    url.searchParams.set("utm_campaign", "social-hub");
    url.searchParams.set("utm_content", Card.anchor(post));
    return url.toString();
  }

  async function loadCaptions() {
    if (!captions) captions = await (await fetch("assets/social/captions" + sfx + ".json")).json();
    return captions;
  }

  async function copyText(text, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    if (button) {
      const label = button.textContent;
      button.textContent = copy.copied;
      setTimeout(() => { button.textContent = label; }, 1600);
    }
  }

  function openDialog(html, label) {
    dialogBody.innerHTML = html;
    dialog.setAttribute("aria-label", label);
    if (!dialog.open) dialog.showModal();
  }

  async function showCopy(post) {
    const all = (await loadCaptions())[post.id] || {};
    const blocks = copy.captions.filter(([net]) => all[net]).map(([net, name]) =>
      "<div class=\"hub-caption\"><p class=\"hub-caption-head\"><strong>" + Card.esc(name) + "</strong>"
      + "<button class=\"post-btn\" type=\"button\" data-copy-net=\"" + net + "\">" + Card.esc(copy.copy) + "</button></p>"
      + "<textarea readonly rows=\"6\" lang=\"" + Card.esc((net === "tiktok" || net === "youtube") && post.clipLang ? post.clipLang : post.lang) + "\">" + Card.esc(all[net]) + "</textarea></div>").join("");
    openDialog("<h2 class=\"hub-dialog-title\">" + Card.esc(post.title) + "</h2>" + blocks, copy.copy);
    dialogBody.querySelectorAll("[data-copy-net]").forEach((button) => button.addEventListener("click", () => {
      copyText(all[button.dataset.copyNet], button);
      track("hub_copy", button.dataset.copyNet + ":" + post.id, { post_id: post.id });
    }));
  }

  function showShare(post) {
    const text = post.title;
    const nets = [
      ["x", "X", (u) => "https://x.com/intent/post?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(u)],
      ["linkedin", "LinkedIn", (u) => "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(u)],
      ["facebook", "Facebook", (u) => "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(u)],
      ["whatsapp", "WhatsApp", (u) => "https://wa.me/?text=" + encodeURIComponent(text + " " + u)],
      ["telegram", "Telegram", (u) => "https://t.me/share/url?url=" + encodeURIComponent(u) + "&text=" + encodeURIComponent(text)],
      ["reddit", "Reddit", (u) => "https://www.reddit.com/submit?url=" + encodeURIComponent(u) + "&title=" + encodeURIComponent(text)],
      ["email", "Email", (u) => "mailto:?subject=" + encodeURIComponent(text) + "&body=" + encodeURIComponent(u)]
    ];
    const links = nets.map(([net, name, href]) => "<a class=\"hub-net hub-net-" + net + "\" href=\"" + Card.esc(href(shareUrl(post, net))) + "\" target=\"_blank\" rel=\"noopener\" data-share-net=\"" + net + "\"><span class=\"hub-net-dot\" aria-hidden=\"true\"></span>" + name + "</a>").join("");
    openDialog("<div class=\"hub-sheet-head\"><img src=\"" + Card.esc(post.thumb) + "\" width=\"72\" height=\"90\" alt=\"\">"
      + "<div><p class=\"hub-eyebrow\">" + Card.esc(copy.shareTitle) + "</p><h2 class=\"hub-dialog-title\" lang=\"" + Card.esc(post.lang) + "\">" + Card.esc(text) + "</h2></div></div>"
      + "<div class=\"hub-share\">" + links + "</div>"
      + "<div class=\"hub-sheet-actions\">"
      + "<button class=\"post-btn\" type=\"button\" data-share-net=\"link\">" + Card.esc(copy.copyLink) + "</button>"
      + "<button class=\"post-btn\" type=\"button\" data-sheet=\"copy\">" + Card.esc(copy.copy) + "</button>"
      + "<a class=\"post-btn post-btn-primary\" href=\"" + Card.esc(post.image) + "\" download data-sheet=\"download\">" + Card.ICON.download + Card.esc(copy.download) + "</a>"
      + "</div>", copy.share);
    dialogBody.querySelectorAll("[data-share-net]").forEach((el) => el.addEventListener("click", () => {
      const net = el.dataset.shareNet;
      if (net === "link") copyText(shareUrl(post, "link"), el);
      track("hub_share", net + ":" + post.id, { post_id: post.id });
    }));
    dialogBody.querySelector("[data-sheet=copy]").addEventListener("click", () => showCopy(post));
    dialogBody.querySelector("[data-sheet=download]").addEventListener("click", () => track("hub_download", post.id));
  }

  async function share(post) {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: post.title, url: shareUrl(post, "native") });
        track("hub_share", "native:" + post.id, { post_id: post.id });
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }
    showShare(post);
  }

  function play(button, post) {
    const frame = document.createElement("iframe");
    frame.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(button.dataset.video) + "?autoplay=1&rel=0";
    frame.title = post.title;
    frame.allow = "autoplay; encrypted-media; picture-in-picture";
    frame.allowFullscreen = true;
    frame.className = "post-frame";
    button.parentElement.classList.add("post-media-playing");
    button.parentElement.replaceChildren(frame);
    frame.focus();
    track("hub_play", post.id);
  }

  // Prerendered cards take clicks before the feed has loaded, and the first render replaces them.
  async function onAction(event) {
    let el = event.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    const card = el.closest(".post");
    if (act === "open") { track("hub_open", card.dataset.id); return; }
    if (act === "play") event.preventDefault();
    await ready;
    const post = byId(card.dataset.id);
    if (!post) return;
    if (!el.isConnected) el = document.getElementById(card.id) && document.getElementById(card.id).querySelector("[data-act=\"" + act + "\"]");
    if (act === "copy") showCopy(post);
    else if (act === "share") share(post);
    else if (act === "play" && el) play(el, post);
    else if (act === "download") track("hub_download", post.id);
    else if (act === "report") track("hub_report", post.report);
  }

  function bind() {
    feedEl.addEventListener("click", onAction);
    dialogBody.addEventListener("click", (event) => { if (event.target.closest("[data-act]") && event.target.closest(".post")) onAction(event); });
    dialog.addEventListener("close", () => {
      dialogBody.querySelectorAll("iframe").forEach((frame) => frame.remove());
      const url = new URL(location.href);
      if (url.searchParams.has("p")) { url.searchParams.delete("p"); history.replaceState(null, "", url); }
    });
    document.querySelectorAll(".hub-chip").forEach((chip) => chip.addEventListener("click", () => update({ kind: chip.dataset.kind }, "kind:" + chip.dataset.kind)));
    langSel.addEventListener("change", () => update({ lang: langSel.value }, "lang:" + langSel.value));
    topicSel.addEventListener("change", () => update({ topic: topicSel.value }, "topic:" + topicSel.value));
    sortSel.addEventListener("change", () => update({ sort: sortSel.value, dir: Card.defaultDir(sortSel.value) }, "sort:" + sortSel.value));
    dirBtn.addEventListener("click", () => update({ dir: state.dir === "asc" ? "desc" : "asc" }, "dir:" + state.sort + ":" + (state.dir === "asc" ? "desc" : "asc")));
    mediaSel.addEventListener("change", () => update({ media: mediaSel.value }, "media:" + mediaSel.value));
    netSel.addEventListener("change", () => update({ net: netSel.value }, "net:" + netSel.value));
    rangeSel.addEventListener("change", () => update({ range: rangeSel.value }, "range:" + rangeSel.value));
    fromEl.addEventListener("change", () => update({ from: isDay(fromEl.value) }, "range:from"));
    toEl.addEventListener("change", () => update({ to: isDay(toEl.value) }, "range:to"));
    reportEl.addEventListener("change", () => update({ report: reportEl.checked }, "report:" + reportEl.checked));
    document.getElementById("hub-clear").addEventListener("click", () => {
      Object.assign(state, DEFAULTS);
      fill();
      update({}, "clear");
    });
    let timer = null;
    searchEl.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.q = searchEl.value.trim();
        state.shown = STEP;
        syncUrl();
        render();
        if (state.q) track("hub_search", state.q);
      }, 250);
    });
    moreBtn.addEventListener("click", () => {
      state.shown += STEP;
      render();
      track("hub_more", String(state.shown));
    });
  }

  // A value the page has no option for (a topic or network gone from the feed) falls back to all.
  function fill() {
    [[langSel, "lang"], [topicSel, "topic"], [netSel, "net"]].forEach(([el, key]) => {
      el.value = state[key];
      if (el.value !== state[key]) { el.value = "all"; state[key] = "all"; }
    });
    sortSel.value = state.sort;
    mediaSel.value = state.media;
    rangeSel.value = state.range;
    fromEl.value = state.from;
    toEl.value = state.to;
    reportEl.checked = state.report;
    searchEl.value = state.q;
    controls();
  }

  async function boot() {
    fill();
    bind();
    if (!params.get("p")) track("hub_view", lang);
    try {
      const feed = await (await fetch("assets/social/feed" + sfx + ".json")).json();
      posts = Card.arrange(feed.posts, today());
    } catch (error) {
      return;
    }
    render();
    // Links shared before posts had their own pages (?p=<id>) go to the post's page.
    const wanted = params.get("p") && (byId(params.get("p")) || byId(params.get("p") + "-" + lang));
    if (wanted) location.replace(Card.permalink(wanted, lang));
  }

  const ready = boot();
})();
