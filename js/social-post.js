/* A social hub post page (social/<post id>.html): plays the clip in place, copies captions and the link,
   and reports plays, copies, shares and downloads as "Social post" events. */
(function () {
  const main = document.querySelector(".post-page");
  if (!main) return;
  const id = main.dataset.postId;

  function track(name, label) {
    if (window.SiteAnalytics && SiteAnalytics.trackEvent) SiteAnalytics.trackEvent(name, "Social post", String(label || "").slice(0, 80), { post_id: id });
  }

  function copied(button, text) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      const label = button.textContent;
      button.textContent = main.dataset.copied;
      setTimeout(() => { button.textContent = label; }, 1800);
    });
  }

  function play(button) {
    const frame = document.createElement("iframe");
    frame.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(button.dataset.video) + "?autoplay=1&rel=0";
    frame.title = document.title;
    frame.allow = "autoplay; encrypted-media; picture-in-picture";
    frame.allowFullscreen = true;
    frame.className = "post-frame";
    button.parentElement.classList.add("post-media-playing");
    button.parentElement.replaceChildren(frame);
    frame.focus();
  }

  main.addEventListener("click", (event) => {
    const el = event.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if (act === "play") { event.preventDefault(); play(el); track("post_play", id); }
    else if (act === "copy") { copied(el, document.getElementById(el.dataset.target).textContent); track("post_copy", el.dataset.net); }
    else if (act === "copylink") { copied(el, main.dataset.url); track("post_copy", "link"); }
    else if (act === "share") track("post_share", el.dataset.net);
    else if (act === "download") track("post_download", id);
    else if (act === "report") track("post_report", id);
    else if (act === "related") track("post_related", el.dataset.id);
  });
})();
