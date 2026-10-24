/* The social hub feed (qa-review-social*.html): filters, copy, share, download and clips over assets/social/feed.json.
   The page arrives with its first cards prerendered by scripts/build-social-hub.js; this takes over once the feed loads. */
(function () {
  const Card = window.SocialHubCard;
  const copy = JSON.parse(document.getElementById("hub-copy").textContent);
  const lang = copy.lang;
  const STEP = 24;
  const feedEl = document.getElementById("hub-feed");
  const countEl = document.getElementById("hub-count");
  const emptyEl = document.getElementById("hub-empty");
  const moreBtn = document.getElementById("hub-more");
  const langSel = document.getElementById("hub-lang");
  const searchEl = document.getElementById("hub-q");
  const dialog = document.getElementById("hub-dialog");
  const dialogBody = document.getElementById("hub-dialog-body");
  const params = new URLSearchParams(location.search);
  const state = { kind: params.get("k") || "all", lang: params.get("l") || "all", q: params.get("q") || "", shown: STEP };
  let posts = [];
  let captions = null;

  function track(name, label, extra) {
    if (window.SiteAnalytics && SiteAnalytics.trackEvent) SiteAnalytics.trackEvent(name, "Social hub", String(label || "").slice(0, 80), extra);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function matches(post) {
    if (state.kind === "video" ? !post.youtube : state.kind !== "all" && post.kind !== state.kind) return false;
    if (state.lang !== "all" && post.lang !== state.lang) return false;
    if (!state.q) return true;
    const q = state.q.toLowerCase();
    return (post.title + " " + post.text + " " + post.cat).toLowerCase().includes(q);
  }

  function syncUrl() {
    const url = new URL(location.href);
    [["k", state.kind], ["l", state.lang], ["q", state.q]].forEach(([key, value]) => {
      if (value && value !== "all") url.searchParams.set(key, value); else url.searchParams.delete(key);
    });
    history.replaceState(null, "", url);
  }

  function render() {
    const list = posts.filter(matches);
    feedEl.innerHTML = list.slice(0, state.shown).map((post) => Card.cardHtml(post, copy, lang)).join("");
    countEl.textContent = copy.count.replace("{n}", list.length);
    emptyEl.hidden = list.length > 0;
    moreBtn.hidden = list.length <= state.shown;
    document.querySelectorAll(".hub-chip").forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.kind === state.kind)));
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
    if (!captions) captions = await (await fetch("assets/social/captions.json")).json();
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
      track("hub_copy", button.dataset.copyNet, { post_id: post.id });
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
    const links = nets.map(([net, name, href]) => "<a class=\"post-btn\" href=\"" + Card.esc(href(shareUrl(post, net))) + "\" target=\"_blank\" rel=\"noopener\" data-share-net=\"" + net + "\">" + name + "</a>").join("");
    openDialog("<h2 class=\"hub-dialog-title\">" + Card.esc(text) + "</h2><div class=\"hub-share\">" + links
      + "<button class=\"post-btn\" type=\"button\" data-share-net=\"link\">" + Card.esc(copy.copyLink) + "</button></div>", copy.share);
    dialogBody.querySelectorAll("[data-share-net]").forEach((el) => el.addEventListener("click", () => {
      const net = el.dataset.shareNet;
      if (net === "link") copyText(shareUrl(post, "link"), el);
      track("hub_share", net, { post_id: post.id });
    }));
  }

  async function share(post) {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: post.title, url: shareUrl(post, "native") });
        track("hub_share", "native", { post_id: post.id });
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }
    showShare(post);
  }

  function showPost(post) {
    openDialog(Card.cardHtml(post, copy, lang).replace("class=\"post\"", "class=\"post post-full\""), post.title);
    const url = new URL(location.href);
    url.searchParams.set("p", post.id);
    history.replaceState(null, "", url);
    track("hub_open", post.id);
  }

  function play(button, post) {
    const frame = document.createElement("iframe");
    frame.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(button.dataset.video) + "?autoplay=1&rel=0";
    frame.title = post.title;
    frame.allow = "autoplay; encrypted-media; picture-in-picture";
    frame.allowFullscreen = true;
    frame.className = "post-frame";
    button.parentElement.replaceChildren(frame);
    track("hub_play", post.id);
  }

  function onAction(event) {
    const el = event.target.closest("[data-act]");
    if (!el) return;
    const post = byId(el.closest(".post").dataset.id);
    if (!post) return;
    const act = el.dataset.act;
    if (act === "copy") showCopy(post);
    else if (act === "share") share(post);
    else if (act === "play") play(el, post);
    else if (act === "open") { event.preventDefault(); showPost(post); }
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
    document.querySelectorAll(".hub-chip").forEach((chip) => chip.addEventListener("click", () => {
      state.kind = chip.dataset.kind;
      state.shown = STEP;
      syncUrl();
      render();
      track("hub_filter", "kind:" + state.kind);
    }));
    langSel.addEventListener("change", () => {
      state.lang = langSel.value;
      state.shown = STEP;
      syncUrl();
      render();
      track("hub_filter", "lang:" + state.lang);
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

  async function boot() {
    langSel.value = state.lang;
    searchEl.value = state.q;
    bind();
    try {
      const feed = await (await fetch("assets/social/feed.json")).json();
      const now = today();
      posts = feed.posts.filter((post) => post.date <= now);
    } catch (error) {
      return;
    }
    render();
    const wanted = params.get("p") && byId(params.get("p"));
    if (wanted) showPost(wanted);
  }

  boot();
})();
