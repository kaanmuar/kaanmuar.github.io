// Auto-playing #3429 hero on the URL Review landing (#3591). Fusion stays on other bands; this replaces the stage Fusion canvas.
import { LOOP_SEC, LANGS, createHeroScene } from "./scene.js";

const mount = document.getElementById("review-hero-3d");
const still = document.getElementById("review-hero-still");
const stage = mount?.closest(".stage");
if (!mount || !stage) throw new Error("review-hero-3d mount missing");

function showHeroStill() {
  stage.classList.add("stage-hero-still-on");
  if (still) still.removeAttribute("hidden");
}

function gpuOk() {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return false;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lang = LANGS.includes(document.documentElement.lang?.slice(0, 2)) ? document.documentElement.lang.slice(0, 2) : "en";

const useStill = reduce || !gpuOk();
if (useStill) showHeroStill();

let scene;
let time = 0;
let playing = !reduce;
let last = performance.now();
let raf;

function loop(now) {
  if (playing) {
    const dt = (now - last) / 1000;
    last = now;
    time = (time + dt) % LOOP_SEC;
  }
  scene.frame(time);
  raf = requestAnimationFrame(loop);
}

function fit() {
  const w = mount.clientWidth;
  const h = mount.clientHeight;
  if (w && h && scene) scene.resize(w, h);
}

async function start() {
  if (!gpuOk()) throw new Error("no usable GPU");
  scene = await createHeroScene(mount, {
    lang,
    w: mount.clientWidth || stage.clientWidth,
    h: mount.clientHeight || 420,
    bloomStrength: 0.52,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
  });
  new ResizeObserver(fit).observe(mount);
  fit();
  stage.classList.add("stage-hero-on");
  last = performance.now();
  raf = requestAnimationFrame(loop);
}

if (!useStill) {
  const watch = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      watch.disconnect();
      (window.requestIdleCallback || ((f) => setTimeout(f, 400)))(() => {
        start().catch(() => {
          showHeroStill();
          stage.classList.add("fx-fallback");
        });
      }, { timeout: 2000 });
    },
    { rootMargin: "120px 0px" },
  );
  watch.observe(stage);
}

document.addEventListener("visibilitychange", () => {
  playing = !document.hidden && !reduce;
  if (playing) last = performance.now();
});