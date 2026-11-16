// Wires situational controls to the URL Review hero scene (#3591).
import { LOOP_SEC, LANGS, LAYER_KEYS, createHeroScene } from "./scene.js";

const LAYER_LABELS = { card: "Site card & scan", shield: "Glass shield", orbit: "Threat lists orbit", report: "Report tile" };

const PRESETS = {
  full: { hide: [], time: 0, play: true, label: "Full story" },
  scan: { hide: ["shield", "orbit", "report"], time: 2.4, play: false, label: "Site scan" },
  shield: { hide: ["card", "orbit", "report"], time: 7.0, play: false, label: "Glass shield" },
  lists: { hide: ["card", "shield", "report"], time: 4.2, play: false, label: "Threat lists" },
  report: { hide: ["card", "shield", "orbit"], time: 8.0, play: false, label: "Report delivery" },
};

const qs = new URLSearchParams(location.search);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let lang = LANGS.includes(qs.get("lang")) ? qs.get("lang") : "en";

const mountMain = document.getElementById("explorer-stage");
const mountCompare = document.getElementById("explorer-compare-stage");
const timeEl = document.getElementById("explorer-time");
const timeVal = document.getElementById("explorer-time-val");
const playBtn = document.getElementById("explorer-play");
const langSel = document.getElementById("explorer-lang");
const compareChk = document.getElementById("explorer-compare");
const pillsRoot = document.getElementById("explorer-pills");
const layersRoot = document.getElementById("explorer-layers");
const presetsRoot = document.getElementById("explorer-presets");
const statusEl = document.getElementById("explorer-status");

let mainScene;
let compareScene;
let time = reduceMotion ? 7.45 : 0;
let playing = !reduceMotion;
let compareOn = false;
let compareTime = 7.45;
let last = performance.now();
let raf;

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function formatTime(t) {
  return `${t.toFixed(1)} s`;
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  LAYER_KEYS.forEach((k) => mainScene.setLayer(k, !p.hide.includes(k)));
  for (const input of layersRoot.querySelectorAll("input[data-layer]")) input.checked = !p.hide.includes(input.dataset.layer);
  if (typeof p.time === "number") {
    time = p.time;
    timeEl.value = String(Math.round((time / LOOP_SEC) * 1000));
    timeVal.textContent = formatTime(time);
  }
  playing = p.play && !reduceMotion;
  playBtn.textContent = playing ? "Pause" : "Play";
  playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
  setStatus(p.label);
}

function bindLayers() {
  layersRoot.replaceChildren();
  for (const key of LAYER_KEYS) {
    const id = `layer-${key}`;
    const label = document.createElement("label");
    label.className = "x-toggle";
    label.htmlFor = id;
    label.innerHTML = `<input type="checkbox" id="${id}" data-layer="${key}" checked><span>${LAYER_LABELS[key]}</span>`;
    layersRoot.appendChild(label);
    label.querySelector("input").addEventListener("change", (e) => {
      mainScene.setLayer(key, e.target.checked);
      setStatus(e.target.checked ? `Showing ${LAYER_LABELS[key]}` : `Hiding ${LAYER_LABELS[key]}`);
    });
  }
}

function bindPills(labels) {
  pillsRoot.replaceChildren();
  labels.forEach((text, i) => {
    const id = `pill-${i}`;
    const label = document.createElement("label");
    label.className = "x-toggle";
    label.htmlFor = id;
    label.innerHTML = `<input type="checkbox" id="${id}" data-pill="${i}" checked><span>${text}</span>`;
    pillsRoot.appendChild(label);
    label.querySelector("input").addEventListener("change", (e) => {
      mainScene.setPill(Number(e.target.dataset.pill), e.target.checked);
    });
  });
}

function bindPresets() {
  presetsRoot.replaceChildren();
  for (const [key, p] of Object.entries(PRESETS)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "x-preset";
    btn.dataset.preset = key;
    btn.textContent = p.label;
    btn.addEventListener("click", () => applyPreset(key));
    presetsRoot.appendChild(btn);
  }
}

function syncCompare() {
  const panel = document.getElementById("explorer-compare-panel");
  compareOn = compareChk.checked;
  panel.hidden = !compareOn;
  if (compareOn && !compareScene) {
    createHeroScene(mountCompare, { lang, hide: [], w: mountCompare.clientWidth, h: mountCompare.clientHeight, bloomStrength: 0.45 }).then((s) => {
      compareScene = s;
      compareScene.frame(compareTime);
    });
  }
  if (!compareOn && compareScene) {
    compareScene.dispose();
    compareScene = null;
    mountCompare.replaceChildren();
  }
}

function tick(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (playing) {
    time = (time + dt) % LOOP_SEC;
    timeEl.value = String(Math.round((time / LOOP_SEC) * 1000));
    timeVal.textContent = formatTime(time);
  }
  mainScene.frame(time);
  if (compareScene) compareScene.frame(compareTime);
  raf = requestAnimationFrame(tick);
}

async function boot() {
  LANGS.forEach((code) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = code.toUpperCase();
    opt.selected = code === lang;
    langSel.appendChild(opt);
  });

  mainScene = await createHeroScene(mountMain, { lang, w: mountMain.clientWidth, h: mountMain.clientHeight });
  bindLayers();
  bindPills(mainScene.pillLabels);
  bindPresets();

  const ro = new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = mountMain;
    if (w && h) mainScene.resize(w, h);
    if (compareScene && mountCompare.clientWidth) compareScene.resize(mountCompare.clientWidth, mountCompare.clientHeight);
  });
  ro.observe(mountMain);

  timeEl.addEventListener("input", () => {
    playing = false;
    playBtn.textContent = "Play";
    playBtn.setAttribute("aria-pressed", "false");
    time = (Number(timeEl.value) / 1000) * LOOP_SEC;
    timeVal.textContent = formatTime(time);
    mainScene.frame(time);
  });

  playBtn.addEventListener("click", () => {
    if (reduceMotion) return;
    playing = !playing;
    playBtn.textContent = playing ? "Pause" : "Play";
    playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
    last = performance.now();
  });

  compareChk.addEventListener("change", syncCompare);
  document.getElementById("explorer-compare-scan").addEventListener("click", () => { compareTime = 2.4; if (compareScene) compareScene.frame(compareTime); });
  document.getElementById("explorer-compare-safe").addEventListener("click", () => { compareTime = 7.45; if (compareScene) compareScene.frame(compareTime); });

  langSel.addEventListener("change", () => {
    const next = langSel.value;
    const url = new URL(location.href);
    url.searchParams.set("lang", next);
    location.href = url.toString();
  });

  if (reduceMotion) {
    playBtn.disabled = true;
    playBtn.title = "Reduced motion is on";
    time = 7.45;
    timeEl.value = "745";
    timeVal.textContent = formatTime(time);
  }

  mainScene.frame(time);
  setStatus("Drag the timeline or pick a situation");
  raf = requestAnimationFrame(tick);
}

boot().catch((e) => {
  console.error(e);
  setStatus("Could not start the 3D view. Try a newer browser with WebGL.");
  mountMain.innerHTML = `<p class="x-fallback">3D preview unavailable. See the rendered loop at <code>qa-lab-demos/2026-11-10/marketing/visuals/hero/hero-3d-en.webp</code> (local).</p>`;
});