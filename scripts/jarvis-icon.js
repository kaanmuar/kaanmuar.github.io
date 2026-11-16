#!/usr/bin/env node
// Jarvis app icon (#2682): a glass orb holding a faceted crystal, crossed by two orbit rings,
// over the Jarvis grid floor. The crystal is a real projected icosahedron, so the launcher
// layers, the themed-icon and status-bar vectors and the spinning clip all share one model.
//
//   node scripts/jarvis-icon.js           designs/jarvis-icon/*.svg and the Android vectors
//   node scripts/jarvis-icon.js --render  also the launcher webp layers and previews/jarvis-icon/
//
// Adaptive icons are 108 dp with only the centre 72 dp shown, so everything that must be seen
// stays inside a 33 dp radius of the centre.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "designs/jarvis-icon");
const PREVIEW = path.join(ROOT, "previews/jarvis-icon");
const RES = ["android/app/src/main/res", "android/wear/src/main/res"];
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const CYAN = "#38E1FF";
const VIOLET = "#8B6BFF";
const AMBER = "#FFB547";
const C = 54;
const ORB = 18.5;
const GEM = 12.4;
const CAM = 5.6;
const POSE = 0.62;
const PITCH = 0.38;
const ROLL = 0.16;
const SPARK = 0.3;
const RINGS = [
  { rx: 29, ry: 8.4, tilt: -18, w: 1.5, color: CYAN, hi: "#D2F8FF" },
  { rx: 25.5, ry: 6.6, tilt: 31, w: 1.1, color: VIOLET, hi: "#DCD0FF" },
];

const PHI = (1 + Math.sqrt(5)) / 2;
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
};
const VERTS = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map(norm);
const FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];
const LIGHT = norm([-0.55, 0.7, 0.75]);
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);

const r2 = (n) => Math.round(n * 100) / 100;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

function rotate([x, y, z], yaw) {
  let c = Math.cos(yaw);
  let s = Math.sin(yaw);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(PITCH);
  s = Math.sin(PITCH);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ROLL);
  s = Math.sin(ROLL);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

function gem(yaw) {
  const v = VERTS.map((p) => rotate(p, yaw));
  const at = v.map(([x, y, z]) => {
    const s = CAM / (CAM - z);
    return [C + x * GEM * s, C - y * GEM * s, z];
  });
  const faces = FACES.map((idx) => {
    const sum = idx.reduce((a, i) => a.map((c, k) => c + v[i][k]), [0, 0, 0]);
    const n = norm(sum);
    const cen = sum.map((c) => c / 3);
    const front = dot(n, [-cen[0], -cen[1], CAM - cen[2]]) > 0;
    return { idx, n, front };
  });
  const edges = new Map();
  for (const face of faces) {
    for (let k = 0; k < 3; k++) {
      const a = face.idx[k];
      const b = face.idx[(k + 1) % 3];
      const key = Math.min(a, b) + "-" + Math.max(a, b);
      const e = edges.get(key) || { a, b, front: false };
      e.front = e.front || face.front;
      edges.set(key, e);
    }
  }
  return { at, faces, edges: [...edges.values()] };
}

function ringPoint(ring, theta) {
  const x = ring.rx * Math.cos(theta);
  const y = ring.ry * Math.sin(theta);
  const t = (ring.tilt * Math.PI) / 180;
  return [C + x * Math.cos(t) - y * Math.sin(t), C + x * Math.sin(t) + y * Math.cos(t)];
}

const pts = (list) => list.map(([x, y], i) => (i ? "L" : "M") + r2(x) + " " + r2(y)).join(" ");

function foreground(t = 0) {
  const g = gem(POSE + 2 * Math.PI * t);
  const theta = 2 * Math.PI * (SPARK + 2 * t);
  const sparkFront = Math.sin(theta) > 0;
  const pulse = 1 + 0.1 * Math.sin(4 * Math.PI * t);

  const ringDefs = RINGS.map((r, i) => `
    <linearGradient id="fg-ring${i}" gradientUnits="userSpaceOnUse" x1="${C - r.rx}" y1="0" x2="${C + r.rx}" y2="0">
      <stop offset="0" stop-color="${r.color}" stop-opacity="0.35"/>
      <stop offset="0.5" stop-color="${r.hi}"/>
      <stop offset="1" stop-color="${r.color}" stop-opacity="0.35"/>
    </linearGradient>`).join("");
  const arc = (r, back) => back
    ? `M${C - r.rx} ${C} A${r.rx} ${r.ry} 0 0 1 ${C + r.rx} ${C}`
    : `M${C + r.rx} ${C} A${r.rx} ${r.ry} 0 0 1 ${C - r.rx} ${C}`;
  const backRings = RINGS.map((r) => `
    <g transform="rotate(${r.tilt} ${C} ${C})" fill="none" stroke-linecap="round">
      <path d="${arc(r, true)}" stroke="${r.color}" stroke-opacity="0.32" stroke-width="${r.w * 0.8}"/>
    </g>`).join("");
  const frontRings = RINGS.map((r, i) => `
    <g transform="rotate(${r.tilt} ${C} ${C})" fill="none" stroke-linecap="round">
      <path d="${arc(r, false)}" stroke="${r.color}" stroke-opacity="0.35" stroke-width="${r.w * 3}" filter="url(#fg-soft)"/>
      <path d="${arc(r, false)}" stroke="url(#fg-ring${i})" stroke-width="${r.w}" filter="url(#fg-glow)"/>
      <path d="${arc(r, false)}" stroke="#FFFFFF" stroke-opacity="0.7" stroke-width="${r.w * 0.35}"/>
    </g>`).join("");

  const trail = [];
  for (let k = 0; k < 10; k++) {
    const a = ringPoint(RINGS[0], theta - 0.06 * (k + 1));
    const b = ringPoint(RINGS[0], theta - 0.06 * k);
    trail.push(`<path d="${pts([a, b])}" stroke="${AMBER}" stroke-opacity="${r2(0.9 * (1 - k / 10))}" stroke-width="${r2(1.5 - k * 0.1)}"/>`);
  }
  const [sx, sy] = ringPoint(RINGS[0], theta);
  const spark = `
    <g opacity="${sparkFront ? 1 : 0.45}" fill="none" stroke-linecap="round">${trail.join("")}
      <circle cx="${r2(sx)}" cy="${r2(sy)}" r="4.2" fill="url(#fg-spark)"/>
      <circle cx="${r2(sx)}" cy="${r2(sy)}" r="1.1" fill="#FFF8E8"/>
    </g>`;

  const faces = g.faces.filter((f) => f.front).map((f) => {
    const lam = Math.max(0, dot(f.n, LIGHT));
    const spec = Math.max(0, dot(f.n, HALF)) ** 14;
    const col = mix(mix(rgb("#2B1F86"), rgb(CYAN), lam), [255, 255, 255], spec * 0.85);
    const alpha = 0.16 + 0.42 * lam + 0.3 * spec;
    return `<path d="${pts(f.idx.map((i) => g.at[i]))} Z" fill="${hex(col)}" fill-opacity="${r2(alpha)}"/>`;
  }).join("");
  const edge = (e) => pts([g.at[e.a], g.at[e.b]]);
  const backEdges = g.edges.filter((e) => !e.front).map(edge).join(" ");
  const frontEdges = g.edges.filter((e) => e.front).map(edge).join(" ");
  const tips = g.at.filter((p) => p[2] > 0.35).map(([x, y]) => `<circle cx="${r2(x)}" cy="${r2(y)}" r="0.6"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <defs>
    <filter id="fg-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="108" height="108">
      <feGaussianBlur stdDeviation="0.8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="fg-soft" filterUnits="userSpaceOnUse" x="0" y="0" width="108" height="108">
      <feGaussianBlur stdDeviation="1.8"/>
    </filter>
    <clipPath id="fg-in"><circle cx="${C}" cy="${C}" r="${ORB}"/></clipPath>
    <radialGradient id="fg-orb" cx="0.4" cy="0.34" r="0.78">
      <stop offset="0" stop-color="#1E7898" stop-opacity="0.75"/>
      <stop offset="0.5" stop-color="#0B3550" stop-opacity="0.86"/>
      <stop offset="1" stop-color="#050F1C" stop-opacity="0.96"/>
    </radialGradient>
    <radialGradient id="fg-fresnel" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.7" stop-color="${CYAN}" stop-opacity="0"/>
      <stop offset="0.93" stop-color="${CYAN}" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#C4F5FF" stop-opacity="0.6"/>
    </radialGradient>
    <linearGradient id="fg-rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#EAFCFF"/>
      <stop offset="0.45" stop-color="${CYAN}"/>
      <stop offset="1" stop-color="${VIOLET}"/>
    </linearGradient>
    <radialGradient id="fg-core">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.25" stop-color="#A6F2FF" stop-opacity="0.85"/>
      <stop offset="0.55" stop-color="${CYAN}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${CYAN}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="fg-spec">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="fg-spark">
      <stop offset="0" stop-color="#FFF6E0"/>
      <stop offset="0.22" stop-color="${AMBER}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${AMBER}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="fg-contact">
      <stop offset="0" stop-color="${CYAN}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${CYAN}" stop-opacity="0"/>
    </radialGradient>${ringDefs}
  </defs>
  <ellipse cx="${C}" cy="80.5" rx="18" ry="3" fill="url(#fg-contact)"/>${backRings}
  ${sparkFront ? "" : spark}
  <circle cx="${C}" cy="${C}" r="${ORB}" fill="url(#fg-orb)"/>
  <g clip-path="url(#fg-in)">
    <circle cx="${C}" cy="${C}" r="${r2(11.5 * pulse)}" fill="url(#fg-core)"/>
    <path d="${backEdges}" fill="none" stroke="${CYAN}" stroke-opacity="0.3" stroke-width="0.45"/>
    ${faces}
    <path d="${frontEdges}" fill="none" stroke="#E8FCFF" stroke-opacity="0.92" stroke-width="0.7" stroke-linejoin="round" filter="url(#fg-glow)"/>
    <g fill="#FFFFFF" filter="url(#fg-glow)">${tips}</g>
    <path d="M${r2(C + 16.8 * Math.cos(0.35))} ${r2(C + 16.8 * Math.sin(0.35))} A16.8 16.8 0 0 1 ${r2(C + 16.8 * Math.cos(1.75))} ${r2(C + 16.8 * Math.sin(1.75))}" fill="none" stroke="${AMBER}" stroke-opacity="0.5" stroke-width="1.6" filter="url(#fg-soft)"/>
  </g>
  <circle cx="${C}" cy="${C}" r="${ORB}" fill="url(#fg-fresnel)"/>
  <circle cx="${C}" cy="${C}" r="${ORB - 0.3}" fill="none" stroke="url(#fg-rim)" stroke-width="0.6"/>
  <ellipse cx="${C - 7}" cy="${C - 8.5}" rx="6.6" ry="3.5" transform="rotate(-38 ${C - 7} ${C - 8.5})" fill="url(#fg-spec)"/>${frontRings}
  ${sparkFront ? spark : ""}
</svg>`;
}

function background() {
  const wall = [];
  for (let x = 0; x <= 108; x += 9) wall.push(`M${x} 0 L${x} 60`);
  for (let y = 6; y < 60; y += 9) wall.push(`M0 ${y} L108 ${y}`);
  const floor = [];
  for (let k = -12; k <= 12; k++) floor.push(`M${C} 60 L${C + k * 14} 108`);
  for (const d of [1.5, 2, 2.7, 3.6, 5, 7, 10, 15]) floor.push(`M0 ${r2(60 + 70 / d)} L108 ${r2(60 + 70 / d)}`);
  const stars = [[30, 22, 0.5], [74, 18, 0.4], [86, 34, 0.35], [24, 46, 0.3], [64, 28, 0.3], [40, 36, 0.25]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#CFF6FF" fill-opacity="0.5"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <defs>
    <radialGradient id="bg-base" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stop-color="#103249"/>
      <stop offset="0.55" stop-color="#071A27"/>
      <stop offset="1" stop-color="#02070C"/>
    </radialGradient>
    <radialGradient id="bg-cyan"><stop offset="0" stop-color="${CYAN}" stop-opacity="0.3"/><stop offset="1" stop-color="${CYAN}" stop-opacity="0"/></radialGradient>
    <radialGradient id="bg-amber"><stop offset="0" stop-color="${AMBER}" stop-opacity="0.2"/><stop offset="1" stop-color="${AMBER}" stop-opacity="0"/></radialGradient>
    <radialGradient id="bg-violet"><stop offset="0" stop-color="${VIOLET}" stop-opacity="0.32"/><stop offset="1" stop-color="${VIOLET}" stop-opacity="0"/></radialGradient>
    <linearGradient id="bg-fade" gradientUnits="userSpaceOnUse" x1="0" y1="60" x2="0" y2="94">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="1" stop-color="#FFFFFF"/>
    </linearGradient>
    <mask id="bg-floor"><rect x="0" y="60" width="108" height="48" fill="url(#bg-fade)"/></mask>
    <linearGradient id="bg-horizon" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0.1" stop-color="${CYAN}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${CYAN}" stop-opacity="0.6"/>
      <stop offset="0.9" stop-color="${CYAN}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="bg-vignette" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.5"/>
    </radialGradient>
  </defs>
  <rect width="108" height="108" fill="url(#bg-base)"/>
  <circle cx="32" cy="30" r="34" fill="url(#bg-cyan)"/>
  <circle cx="86" cy="58" r="28" fill="url(#bg-amber)"/>
  <circle cx="50" cy="98" r="34" fill="url(#bg-violet)"/>
  <path d="${wall.join(" ")}" stroke="${CYAN}" stroke-opacity="0.06" stroke-width="0.25"/>
  <path d="${floor.join(" ")}" stroke="${CYAN}" stroke-opacity="0.4" stroke-width="0.3" mask="url(#bg-floor)"/>
  <rect x="0" y="59.7" width="108" height="0.6" fill="url(#bg-horizon)"/>
  ${stars}
  <rect width="108" height="108" fill="url(#bg-vignette)"/>
</svg>`;
}

function hull(points) {
  const p = points.map(([x, y]) => [x, y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => list.reduce((h, q) => {
    while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
    h.push(q);
    return h;
  }, []);
  const lower = half(p);
  const upper = half([...p].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1), lower[0]];
}

// Strokes for the one-colour versions: the orb, the crystal's near edges, the rings with a gap
// where they pass behind the orb, and the spark. At status-bar size the edges blur together,
// so the simple version keeps only the crystal's outline and the main ring.
function glyph(simple) {
  const g = gem(POSE);
  const lines = { orb: [], gem: [], ring: [] };
  lines.gem = simple ? [hull(g.at)] : g.edges.filter((e) => e.front).map((e) => [g.at[e.a], g.at[e.b]]);
  for (const r of simple ? RINGS.slice(0, 1) : RINGS) {
    let run = [];
    for (let k = 0; k <= 96; k++) {
      const theta = Math.PI + (2 * Math.PI * k) / 96;
      const p = ringPoint(r, theta);
      const behind = Math.sin(theta) < 0 && Math.hypot(p[0] - C, p[1] - C) < ORB + 2.4;
      if (behind) {
        if (run.length > 1) lines.ring.push(run);
        run = [];
      } else run.push(p);
    }
    if (run.length > 1) lines.ring.push(run);
  }
  const theta = 2 * Math.PI * SPARK;
  return { lines, spark: ringPoint(RINGS[0], theta) };
}

function glyphPaths(size, map, widths) {
  const { lines, spark } = glyph(widths.simple);
  const m = (list) => list.map((p) => map(p));
  const circle = (cx, cy, r) => `M${r2(cx - r)} ${r2(cy)} A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx + r)} ${r2(cy)} A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx - r)} ${r2(cy)} Z`;
  const [ox, oy] = map([C, C]);
  const k = map([C + 1, C])[0] - ox;
  const [sx, sy] = map(spark);
  return [
    { d: circle(ox, oy, ORB * k), stroke: widths.orb },
    { d: lines.gem.map((l) => pts(m(l))).join(" "), stroke: widths.gem },
    { d: lines.ring.map((l) => pts(m(l))).join(" "), stroke: widths.ring },
    { d: circle(sx, sy, widths.spark), fill: true },
  ];
}

function vectorXml(comment, size, map, widths) {
  const paths = glyphPaths(size, map, widths).map((p) => p.fill
    ? `    <path\n        android:fillColor="#FFFFFFFF"\n        android:pathData="${p.d}" />`
    : `    <path\n        android:fillColor="#00000000"\n        android:strokeColor="#FFFFFFFF"\n        android:strokeWidth="${p.stroke}"\n        android:strokeLineCap="round"\n        android:strokeLineJoin="round"\n        android:pathData="${p.d}" />`);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- ${comment} Generated by scripts/jarvis-icon.js (#2682). -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${size}dp"
    android:height="${size}dp"
    android:viewportWidth="${size}"
    android:viewportHeight="${size}">
${paths.join("\n")}
</vector>
`;
}

function glyphSvg(size, map, widths, color) {
  const paths = glyphPaths(size, map, widths).map((p) => p.fill
    ? `<path d="${p.d}" fill="${color}"/>`
    : `<path d="${p.d}" fill="none" stroke="${color}" stroke-width="${p.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${paths.join("")}</svg>`;
}

const MONO = { size: 108, map: (p) => p, widths: { orb: 2.2, gem: 1.4, ring: 2, spark: 2 } };
const STAT_K = 11.4 / 31;
const STAT = { size: 24, map: ([x, y]) => [12 + (x - C) * STAT_K, 12 + (y - C) * STAT_K], widths: { orb: 1.4, gem: 1.1, ring: 1.4, spark: 1.3, simple: true } };

const ADAPTIVE = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`;

const composite = (fg, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72">${bg.replace(/^<svg[^>]*>|<\/svg>\s*$/g, "")}${fg.replace(/^<svg[^>]*>|<\/svg>\s*$/g, "")}</svg>`;
const sized = (svg, w, h = w) => svg.replace("<svg ", `<svg width="${w}" height="${h}" `);

function writeSources() {
  fs.mkdirSync(OUT, { recursive: true });
  const fg = foreground();
  const bg = background();
  fs.writeFileSync(path.join(OUT, "foreground.svg"), fg + "\n");
  fs.writeFileSync(path.join(OUT, "background.svg"), bg + "\n");
  fs.writeFileSync(path.join(OUT, "jarvis-icon.svg"), composite(fg, bg) + "\n");
  fs.writeFileSync(path.join(OUT, "monochrome.svg"), glyphSvg(MONO.size, MONO.map, MONO.widths, "#FFFFFF") + "\n");
  for (const res of RES) {
    const dir = path.join(ROOT, res);
    fs.writeFileSync(path.join(dir, "mipmap-anydpi-v26/ic_launcher.xml"), ADAPTIVE);
    fs.writeFileSync(path.join(dir, "drawable/ic_launcher_monochrome.xml"), vectorXml("Themed-icon layer: the orb, crystal and rings in one colour.", MONO.size, MONO.map, MONO.widths));
    fs.writeFileSync(path.join(dir, "drawable/ic_stat_jarvis.xml"), vectorXml("Status-bar icon: the orb, crystal and rings, white on transparent as Android requires.", STAT.size, STAT.map, STAT.widths));
    fs.rmSync(path.join(dir, "drawable/ic_launcher_foreground.xml"), { force: true });
  }
  return { fg, bg };
}

const OLD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72"><rect x="0" y="0" width="108" height="108" fill="#030B12"/><circle cx="54" cy="54" r="26" fill="none" stroke="#38E1FF" stroke-width="3"/><circle cx="54" cy="54" r="19" fill="none" stroke="#38E1FF" stroke-opacity="0.5" stroke-width="2"/><circle cx="54" cy="54" r="10" fill="#38E1FF"/><path fill="#030B12" d="M56.5,47.5h-3v8.2c0,1.5 -0.8,2.3 -2,2.3c-0.8,0 -1.4,-0.3 -1.9,-0.8l-1.4,2.2c0.9,0.8 2.1,1.3 3.6,1.3c2.9,0 4.7,-1.8 4.7,-4.9z"/></svg>`;

function sheet(icon, stat) {
  const masks = [["50%", "Circle"], ["32%", "Squircle"], ["22%", "Rounded"], ["50% 50% 50% 14%", "Teardrop"]];
  const tiles = (size) => masks.map(([r, name]) => `<figure><div class="tile" style="width:${size}px;height:${size}px;border-radius:${r}">${sized(icon, size)}</div><figcaption>${name}</figcaption></figure>`).join("");
  const themed = [["#D3E3FD", "#0B3A72"], ["#2B3A4A", "#BFE9FF"], ["#F3E2C7", "#5A3A00"]]
    .map(([bgc, fgc]) => `<figure><div class="tile" style="width:120px;height:120px;border-radius:50%;background:${bgc}">${sized(glyphSvg(MONO.size, MONO.map, MONO.widths, fgc).replace('viewBox="0 0 108 108"', 'viewBox="18 18 72 72"'), 120)}</div><figcaption>Themed</figcaption></figure>`).join("");
  return `<!doctype html><html><head><style>
    body{margin:0;width:1080px;background:#05080C;color:#CFE9F5;font:500 22px/1.3 system-ui,sans-serif}
    section{padding:34px 48px}
    h2{margin:0 0 20px;font:600 15px/1 ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;color:#38E1FF}
    .row{display:flex;gap:28px;align-items:flex-end;flex-wrap:wrap}
    figure{margin:0;text-align:center}
    figcaption{margin-top:10px;font-size:15px;opacity:.75}
    .tile{overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.45)}
    .tile svg{display:block}
    .hero{display:flex;gap:48px;align-items:center}
    .light{background:linear-gradient(135deg,#F6E7D8,#D9E7F7 60%,#E9DDF8)}
    .light figcaption{color:#1E2A36}
    .bar{display:flex;gap:18px;align-items:center;background:#0E1418;border-radius:18px;padding:16px 22px}
    .bar span{font-size:18px}
  </style></head><body>
  <section class="hero">
    <div class="tile" style="width:420px;height:420px;border-radius:32%">${sized(icon, 420)}</div>
    <div><h2>Jarvis · new icon</h2><p style="max-width:470px;margin:0;font-size:24px">A glass orb holding a lit crystal, crossed by cyan and violet orbit rings with an amber spark, over the Jarvis grid floor.</p></div>
  </section>
  <section><h2>Home screen · dark</h2><div class="row">${tiles(132)}${tiles(56).replace(/<figcaption>[^<]*<\/figcaption>/g, "")}</div></section>
  <section class="light"><h2>Home screen · light</h2><div class="row">${tiles(132)}</div></section>
  <section><h2>Themed icon · notification</h2><div class="row">${themed}
    <div class="bar">${sized(stat, 24)}${sized(stat, 48)}${sized(stat, 72)}<span>Jarvis · 2 alerts</span></div></div></section>
  <section><h2>Before · after</h2><div class="row">
    <figure><div class="tile" style="width:180px;height:180px;border-radius:50%">${sized(OLD, 180)}</div><figcaption>Now</figcaption></figure>
    <figure><div class="tile" style="width:180px;height:180px;border-radius:50%">${sized(icon, 180)}</div><figcaption>New</figcaption></figure>
  </div></section>
  </body></html>`;
}

function clipFrame(t) {
  const fg = foreground(t);
  const bg = background();
  const px = 560 / 72;
  const dx = 2.2 * Math.sin(2 * Math.PI * t) * px;
  const dy = 1.4 * Math.cos(2 * Math.PI * t) * px;
  const layer = (svg, x, y) => `<div style="position:absolute;left:${-18 * px + x}px;top:${-18 * px + y}px">${sized(svg, 108 * px)}</div>`;
  return `<!doctype html><html><body style="margin:0;width:720px;height:720px;background:radial-gradient(circle at 50% 45%,#0B1620,#000 75%);display:grid;place-items:center">
    <div style="position:relative;width:560px;height:560px;border-radius:32%;overflow:hidden;box-shadow:0 30px 80px rgba(56,225,255,.18)">
      ${layer(bg, -dx * 0.4, -dy * 0.4)}${layer(fg, dx, dy)}
    </div></body></html>`;
}

async function render({ fg, bg }) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (html, w, h, file, transparent) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html.startsWith("<!doctype") ? html : `<!doctype html><html><body style="margin:0;background:transparent">${html}</body></html>`);
    await page.screenshot({ path: file, omitBackground: transparent, fullPage: true });
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-icon-"));
  for (const [dpi, d] of Object.entries(DENSITIES)) {
    const px = Math.round(108 * d);
    for (const [name, svg, alpha] of [["foreground", fg, true], ["background", bg, false]]) {
      const png = path.join(tmp, `${name}-${dpi}.png`);
      await shot(sized(svg, px), px, px, png, alpha);
      for (const res of RES) {
        const dir = path.join(ROOT, res, `mipmap-${dpi}`);
        fs.mkdirSync(dir, { recursive: true });
        execFileSync("cwebp", ["-quiet", "-q", "92", "-alpha_q", "100", "-m", "6", png, "-o", path.join(dir, `ic_launcher_${name}.webp`)]);
      }
    }
  }

  fs.mkdirSync(PREVIEW, { recursive: true });
  const icon = composite(fg, bg);
  const stat = glyphSvg(STAT.size, STAT.map, STAT.widths, "#FFFFFF");
  await shot(sized(icon, 512), 512, 512, path.join(PREVIEW, "jarvis-icon-512.png"), false);
  await shot(sheet(icon, stat), 1080, 800, path.join(PREVIEW, "jarvis-icon-sheet.png"), false);

  const frames = path.join(tmp, "frames");
  fs.mkdirSync(frames);
  const N = 150;
  for (let i = 0; i < N; i++) {
    await shot(clipFrame(i / N), 720, 720, path.join(frames, `f${String(i).padStart(3, "0")}.png`), false);
  }
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "30", "-i", path.join(frames, "f%03d.png"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", path.join(PREVIEW, "jarvis-icon-spin.mp4")]);
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(PREVIEW);
}

const sources = writeSources();
if (process.argv.includes("--render")) {
  render(sources).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
