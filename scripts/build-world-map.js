#!/usr/bin/env node
/* The world map Jarvis's Map tab draws (#2976), for the web (assets/jarvis/world.json) and the Android app
   (android/app/src/main/assets/world.json). Run once when the map should change; the output is committed.

   shapes  ISO2 → SVG path of the country in a Natural Earth projection, from Natural Earth 1:110m (world-atlas)
   dots    ISO2 → [x, y] of every country's centroid from 1:50m, so countries too small for 1:110m still get a dot

   The tools are not repo dependencies:
     mkdir /tmp/geo && cd /tmp/geo && npm i world-atlas@2 topojson-client@3 d3-geo@3 i18n-iso-countries@7
     GEO_TOOLS=/tmp/geo/node_modules node scripts/build-world-map.js */

const fs = require("fs");
const path = require("path");

const W = 1000;
const H = 500;
// Natural Earth features with no ISO numeric id.
const BY_NAME = { Kosovo: "XK", "N. Cyprus": "CY", Somaliland: "SO" };

async function main() {
  const tools = process.env.GEO_TOOLS;
  if (!tools) throw new Error("Set GEO_TOOLS to a node_modules folder with world-atlas, topojson-client, d3-geo and i18n-iso-countries.");
  const from = (name) => path.join(tools, name);
  const d3 = await import(from("d3-geo/dist/d3-geo.mjs"));
  const topo = require(from("topojson-client"));
  const iso = require(from("i18n-iso-countries"));
  const load = (scale) => {
    const world = JSON.parse(fs.readFileSync(from("world-atlas/countries-" + scale + ".json"), "utf8"));
    return topo.feature(world, world.objects.countries).features.filter((f) => f.properties.name !== "Antarctica");
  };
  const codeOf = (f) => (f.id ? iso.numericToAlpha2(f.id) : "") || BY_NAME[f.properties.name] || "";

  const coarse = load("110m");
  const projection = d3.geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: "FeatureCollection", features: coarse });
  const draw = d3.geoPath(projection).digits(0);

  const shapes = {};
  coarse.forEach((f) => {
    const cc = codeOf(f);
    if (!cc) return;
    const d = draw(f);
    if (d) shapes[cc] = shapes[cc] ? shapes[cc] + d : d;
  });
  const dots = {};
  load("50m").forEach((f) => {
    const cc = codeOf(f);
    if (!cc || dots[cc]) return;
    const xy = projection(d3.geoCentroid(f));
    if (xy && xy.every(Number.isFinite)) dots[cc] = xy.map((n) => Math.round(n));
  });

  const out = JSON.stringify({ w: W, h: H, shapes, dots });
  const root = path.join(__dirname, "..");
  ["assets/jarvis/world.json", "android/app/src/main/assets/world.json"].forEach((file) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), out + "\n");
  });
  console.log(Object.keys(shapes).length + " shapes, " + Object.keys(dots).length + " dots, " + Math.round(out.length / 1024) + " KB");
}

main().catch((error) => { console.error(error.message || error); process.exit(1); });
