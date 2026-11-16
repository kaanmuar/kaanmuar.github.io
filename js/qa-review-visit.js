/* Signed-in visits (#1976). With a URL Review sign-in in this browser, a review page notes a view, a beat every 30 s
   while the tab is visible, a hide when it leaves sight and a show when it comes back. The server ties them to the
   account and counts the time. Without a sign-in nothing is sent. */
(function (root) {
  const BEAT_MS = 30000;
  if (root.top !== root.self || navigator.webdriver) return;
  let viewed = false;
  let timer = null;
  let stopped = false;

  function endpoint() {
    const host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") return "http://127.0.0.1:8768";
    return "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";
  }

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (error) { return null; }
  }

  function send(kind) {
    const saved = read("qa-review-session");
    const device = read("qa-review-device-key");
    if (stopped || !saved || !saved.session || !/^[a-f0-9]{64}$/.test(String(device))) return false;
    fetch(endpoint() + "/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({
        session: saved.session,
        deviceKey: device,
        kind: kind,
        page: (location.pathname.split("/").pop() || "qa-review.html").slice(0, 80),
        lang: String(document.documentElement.lang || "en").slice(0, 12),
        screen: (root.innerWidth || 0) < 768 ? "phone" : "desktop"
      })
    }).then(function (res) { if (res.status === 401) stop(); }).catch(function () {});
    return true;
  }

  // A sign-in made on this page starts the visit at the next tick.
  function tick() {
    if (document.visibilityState !== "visible") return;
    if (!viewed) viewed = send("view");
    else send("beat");
  }

  function stop() {
    stopped = true;
    clearInterval(timer);
    timer = null;
  }

  function run() {
    if (stopped || timer) return;
    timer = setInterval(tick, BEAT_MS);
  }

  function pause() {
    clearInterval(timer);
    timer = null;
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      if (viewed) send("show");
      else tick();
      run();
    } else {
      if (viewed) send("hide");
      pause();
    }
  });
  root.addEventListener("pagehide", function () { if (viewed && document.visibilityState === "visible") send("hide"); });
  if (document.visibilityState === "visible") tick();
  run();
})(window);
