// The three animated heroes of the launch mail (#3393) as CSS 3D scenes. Each page exposes frame(t), t in [0, 1),
// which poses the scene for that moment, so scripts/render-launch-emails.js can step it frame by frame. The heroes
// carry no words, so one GIF serves all six languages; prices are the launch prices from the package table.
const fixOffers = require("../functions/url-review-fix-offers");

const W = 600;
const H = 320;

// Line icons, one per new check: phishing hook, linked hosts, hacked site, lookalike domain, blocklist, mail auth.
const ICONS = [
  "<path d='M15 3v9.5a4.5 4.5 0 0 1-9 0V10'/><path d='M6 10l-2.5 2.5M6 10l2.5 2.5'/><circle cx='15' cy='3' r='1.3'/>",
  "<circle cx='12' cy='12' r='9'/><ellipse cx='12' cy='12' rx='4' ry='9'/><path d='M3 12h18M5 7h14M5 17h14'/>",
  "<path d='M8 10h8v5a4 4 0 0 1-8 0z'/><path d='M12 10V7M9.5 7.5a2.5 2.5 0 0 1 5 0M4 13h4M16 13h4M5 8l3 2.5M19 8l-3 2.5M5 19l3-2M19 19l-3-2'/>",
  "<rect x='3' y='6' width='11' height='11' rx='2'/><rect x='10' y='3' width='11' height='11' rx='2'/>",
  "<circle cx='12' cy='12' r='9'/><path d='M5.6 5.6l12.8 12.8'/>",
  "<rect x='3' y='5' width='18' height='14' rx='2'/><path d='M3 7l9 6 9-6'/><path d='M14.5 16.5l2 2 4-4'/>"
];

function icon(i, color, size) {
  return "<svg viewBox='0 0 24 24' width='" + size + "' height='" + size + "' fill='none' stroke='" + color + "' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'>" + ICONS[i] + "</svg>";
}

function page(css, body, script) {
  return "<!DOCTYPE html><html><head><meta charset='utf-8'><style>*{box-sizing:border-box;margin:0;padding:0}html,body{width:" + W + "px;height:" + H + "px;overflow:hidden}" +
    "body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}" + css + "</style></head><body>" + body +
    "<script>const TAU=Math.PI*2;" + script + "</script></body></html>";
}

// 1. Glass shield: a layered glass shield swings in 3D while the six checks orbit it on a tilted ring.
function glass() {
  const LAYERS = 16;
  const shield = "path('M90 0 L180 34 V112 C180 172 138 208 90 224 C42 208 0 172 0 112 V34 Z')";
  const layers = Array.from({ length: LAYERS }, (_, i) => "<div class='layer' style='transform:translateZ(" + (i * 1.6 - LAYERS * 0.8).toFixed(1) + "px);opacity:" + (i === LAYERS - 1 ? 1 : 0.16 + i * 0.012).toFixed(3) + ";" +
    (i === LAYERS - 1 ? "background:linear-gradient(155deg,rgba(255,255,255,.92) 0%,rgba(160,240,246,.55) 38%,rgba(13,110,118,.55) 100%)" : "background:linear-gradient(155deg,#bff6fa,#0d6e76)") + "'></div>").join("");
  const chips = ICONS.map((_, i) => "<div class='chip' id='c" + i + "'><div class='chipface'>" + icon(i, "#0b6870", 26) + "</div></div>").join("");
  const css = "body{background:linear-gradient(165deg,#f2feff 0%,#d3f0f3 50%,#b7dee6 100%)}" +
    ".stage{position:absolute;inset:0;perspective:900px;perspective-origin:50% 42%}" +
    ".scene{position:absolute;left:50%;top:50%;width:0;height:0;transform-style:preserve-3d}" +
    ".shield{position:absolute;left:-90px;top:-122px;width:180px;height:224px;transform-style:preserve-3d}" +
    ".layer{position:absolute;inset:0;clip-path:" + shield + ";border-radius:2px}" +
    ".front{position:absolute;inset:0;clip-path:" + shield + ";transform:translateZ(" + (LAYERS * 0.8 + 0.6) + "px);display:flex;align-items:center;justify-content:center;overflow:hidden}" +
    ".shine{position:absolute;top:-40%;width:60%;height:180%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.85),rgba(255,255,255,0));transform:rotate(18deg)}" +
    ".rim{position:absolute;inset:0;clip-path:" + shield + ";box-shadow:inset 0 0 0 3px rgba(255,255,255,.9),inset 0 0 26px rgba(126,246,251,.9)}" +
    ".ring{position:absolute;left:0;top:0;transform-style:preserve-3d;transform:rotateX(74deg)}" +
    ".orbit{position:absolute;left:-205px;top:-205px;width:410px;height:410px;border-radius:50%;border:2px solid rgba(13,110,118,.35);box-shadow:0 0 30px rgba(126,246,251,.6)}" +
    ".chip{position:absolute;left:0;top:0;width:0;height:0;transform-style:preserve-3d}" +
    ".chipface{position:absolute;left:-27px;top:-27px;width:54px;height:54px;border-radius:16px;background:linear-gradient(160deg,rgba(255,255,255,.96),rgba(214,246,248,.86));" +
    "border:1.5px solid rgba(255,255,255,.95);box-shadow:0 10px 22px rgba(11,104,112,.28),inset 0 0 0 1px rgba(13,110,118,.18);display:flex;align-items:center;justify-content:center}" +
    ".shadow{position:absolute;left:50%;top:268px;width:250px;height:34px;margin-left:-125px;border-radius:50%;background:radial-gradient(closest-side,rgba(11,74,82,.35),rgba(11,74,82,0))}" +
    ".spark{position:absolute;width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 0 12px 4px rgba(126,246,251,.9)}";
  const body = "<div class='shadow' id='sh'></div><div class='stage'><div class='scene' id='scene'><div class='ring' id='ring'><div class='orbit'></div>" + chips + "</div>" +
    "<div class='shield' id='shield'>" + layers + "<div class='front'><div class='shine' id='shine'></div>" +
    "<svg viewBox='0 0 24 24' width='92' height='92' fill='none' stroke='#ffffff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' style='filter:drop-shadow(0 3px 6px rgba(11,74,82,.55));position:relative'><path d='M5 12.5l4.5 4.5L19 7.5'/></svg>" +
    "</div><div class='rim'></div></div></div></div>" +
    Array.from({ length: 7 }, (_, i) => "<div class='spark' id='s" + i + "'></div>").join("");
  const script = "const R=205,N=6;function frame(t){const a=Math.sin(t*TAU);" +
    "document.getElementById('shield').style.transform='translateY('+(Math.sin(t*TAU*2)*4).toFixed(2)+'px) rotateY('+(a*38).toFixed(2)+'deg) rotateX('+(8+Math.cos(t*TAU)*4).toFixed(2)+'deg)';" +
    "document.getElementById('shine').style.left=(-80+((t*1.0)%1)*240).toFixed(1)+'%';" +
    "document.getElementById('sh').style.transform='scaleX('+(1-Math.abs(a)*0.18).toFixed(3)+')';" +
    "for(let i=0;i<N;i++){const ang=i/N*360+t*360;const el=document.getElementById('c'+i);" +
    "el.style.transform='rotateZ('+ang+'deg) translateX('+R+'px) rotateZ('+(-ang)+'deg) rotateX(-74deg)';}" +
    "for(let i=0;i<7;i++){const s=document.getElementById('s'+i);const k=(t+i/7)%1;s.style.left=(150+((i*97)%300))+'px';s.style.top=(250-k*210)+'px';s.style.opacity=(Math.sin(k*Math.PI)*0.9).toFixed(2);}}frame(0);";
  return page(css, body, script);
}

// 2. Night scan: a radar disc in perspective; the sweep lights each signal as it passes and its pin rises. The
// badges are flat, placed over each pin's tip, so they face the reader from any point on the disc.
function night() {
  const blips = [
    { a: 30, r: 0.62, c: "#f39a8b" }, { a: 95, r: 0.38, c: "#6fe3b1" }, { a: 150, r: 0.8, c: "#e2c48a" },
    { a: 215, r: 0.55, c: "#f39a8b" }, { a: 275, r: 0.78, c: "#6fe3b1" }, { a: 330, r: 0.34, c: "#e2c48a" }
  ];
  const css = "body{background:radial-gradient(circle at 50% 30%,#0b2630 0%,#03080c 70%)}" +
    ".stage{position:absolute;inset:0;perspective:760px;perspective-origin:50% 20%}" +
    ".disc{position:absolute;left:50%;top:60%;width:500px;height:500px;margin:-250px 0 0 -250px;transform-style:preserve-3d;transform:rotateX(60deg)}" +
    ".ringl{position:absolute;border-radius:50%;border:1.5px solid rgba(126,246,251,.32)}" +
    ".cross{position:absolute;left:50%;top:0;width:1.5px;height:100%;background:rgba(126,246,251,.22)}" +
    ".sweep{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,rgba(126,246,251,0) 0deg,rgba(126,246,251,0) 250deg,rgba(126,246,251,.06) 300deg,rgba(126,246,251,.26) 354deg,rgba(255,255,255,.85) 359.5deg,rgba(126,246,251,0) 360deg)}" +
    ".grid{position:absolute;inset:0;border-radius:50%;background-image:radial-gradient(rgba(126,246,251,.25) 1px,transparent 1.4px);background-size:22px 22px;-webkit-mask:radial-gradient(closest-side,#000 96%,transparent 100%)}" +
    ".blip{position:absolute;width:0;height:0;transform-style:preserve-3d}" +
    ".dot{position:absolute;left:-7px;top:-7px;width:14px;height:14px;border-radius:50%}" +
    ".halo{position:absolute;left:-26px;top:-26px;width:52px;height:52px;border-radius:50%;border:2px solid}" +
    ".pin{position:absolute;left:-1.5px;bottom:0;width:3px;transform-origin:50% 100%;transform:rotateX(-90deg)}" +
    ".tip{position:absolute;left:0;top:0;width:1px;height:1px}.badge{position:absolute;width:46px;height:46px;margin:-50px 0 0 -23px;border-radius:12px;background:rgba(3,8,12,.9);border:1.5px solid;display:flex;align-items:center;justify-content:center}" +
    ".core{position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px;border-radius:50%;background:#7ef6fb;box-shadow:0 0 24px 8px rgba(126,246,251,.7)}" +
    ".pulse{position:absolute;left:50%;top:50%;border-radius:50%;border:2px solid rgba(126,246,251,.8)}" +
    ".scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px);pointer-events:none}" +
    ".hud{position:absolute;top:18px;height:2px;background:linear-gradient(90deg,rgba(126,246,251,0),#7ef6fb,rgba(126,246,251,0))}";
  const rings = [1, 0.75, 0.5, 0.25].map((k) => "<div class='ringl' style='left:" + (250 - 250 * k) + "px;top:" + (250 - 250 * k) + "px;width:" + 500 * k + "px;height:" + 500 * k + "px'></div>").join("");
  const crosses = [0, 45, 90, 135].map((a) => "<div class='cross' style='transform:rotate(" + a + "deg)'></div>").join("");
  const items = blips.map((b, i) => {
    const x = 250 + Math.sin(b.a * Math.PI / 180) * 250 * b.r;
    const y = 250 - Math.cos(b.a * Math.PI / 180) * 250 * b.r;
    return "<div class='blip' style='left:" + x.toFixed(1) + "px;top:" + y.toFixed(1) + "px'><div class='halo' id='h" + i + "' style='border-color:" + b.c + "'></div><div class='dot' id='d" + i + "' style='background:" + b.c + ";box-shadow:0 0 18px 6px " + b.c + "'></div>" +
      "<div class='pin' id='p" + i + "' style='background:linear-gradient(0deg," + b.c + ",rgba(255,255,255,.9))'><div class='tip' id='t" + i + "'></div></div></div>";
  }).join("");
  const body = "<div class='stage'><div class='disc'><div class='grid'></div>" + rings + crosses + "<div class='sweep' id='sw'></div>" +
    "<div class='pulse' id='pu'></div><div class='core'></div>" + items + "</div></div><div class='hud' id='hud' style='left:40px;width:120px'></div><div class='hud' id='hud2' style='right:40px;width:120px'></div>" + blips.map((b, i) => "<div class='badge' id='b" + i + "' style='border-color:" + b.c + ";box-shadow:0 0 16px " + b.c + "'>" + icon(i, b.c, 26) + "</div>").join("") + "<div class='scan'></div>";
  const script = "const B=" + JSON.stringify(blips.map((b) => b.a)) + ";function frame(t){const deg=t*360;document.getElementById('sw').style.transform='rotate('+deg+'deg)';" +
    "const k=(t*2)%1;const pu=document.getElementById('pu');const s=20+k*480;pu.style.width=s+'px';pu.style.height=s+'px';pu.style.margin=(-s/2)+'px';pu.style.opacity=(1-k).toFixed(2);" +
    "document.getElementById('hud').style.opacity=document.getElementById('hud2').style.opacity=(0.4+0.6*Math.abs(Math.sin(t*TAU*2))).toFixed(2);" +
    "B.forEach((a,i)=>{const since=((deg-a)%360+360)%360;const glow=Math.max(0,1-since/250);const rise=Math.min(1,since/40);const h=36+(glow>0?rise*64*glow:0);" +
    "document.getElementById('d'+i).style.opacity=(0.35+0.65*glow).toFixed(2);const ha=document.getElementById('h'+i);const hk=Math.min(1,since/90);ha.style.transform='scale('+(0.4+hk*1.4).toFixed(2)+')';ha.style.opacity=(glow*(1-hk)).toFixed(2);" +
    "const p=document.getElementById('p'+i);p.style.height=h.toFixed(1)+'px';const r=document.getElementById('t'+i).getBoundingClientRect();const b=document.getElementById('b'+i);b.style.left=r.left.toFixed(1)+'px';b.style.top=r.top.toFixed(1)+'px';b.style.opacity=(0.62+0.38*glow).toFixed(2);});}frame(0.42);";
  return page(css, body, script);
}

// 3. Editorial stack: the six fix packages as a fanned hand of cards in 3D, each lifting and turning in turn, priced
// at launch. Only the lifted card moves, which keeps the GIF small.
function editorial() {
  const now = Date.parse("2026-11-12T12:00:00Z");
  const cards = fixOffers.PACKAGES.map((pkg, i) => "<div class='card' id='k" + i + "'><div class='price'>$" + fixOffers.usdOf(pkg, now) + "</div><div class='list'>$" + pkg.listUsd + "</div>" +
    "<div class='ic'>" + icon(i, "#7a571c", 24) + "</div><div class='days'>" + Array.from({ length: pkg.days }, () => "<i></i>").join("") + "</div>" +
    "<div class='bars'><b style='width:82%'></b><b style='width:58%'></b><b style='width:70%'></b></div><div class='seal'>" + icon(5, "#fffdf8", 14) + "</div></div>").join("");
  const css = "body{background:radial-gradient(circle at 50% 40%,#fcf9f3 0%,#f3eee5 55%,#e7dece 100%)}" +
    ".stage{position:absolute;inset:0;perspective:1100px;perspective-origin:50% 30%}" +
    ".scene{position:absolute;left:50%;top:47%;width:0;height:0;transform-style:preserve-3d}" +
    ".card{position:absolute;left:-74px;top:-96px;width:148px;height:198px;border-radius:10px;background:linear-gradient(170deg,#fffdf8 0%,#faf3e6 100%);border:1px solid #dccdb0;" +
    "box-shadow:-6px 14px 26px rgba(60,44,20,.20),inset 0 0 0 5px #fffdf8,inset 0 0 0 6px #e7d8bb;padding:16px 14px;transform-origin:50% 210%}" +
    ".price{font-family:'Instrument Serif',Georgia,serif;font-size:40px;line-height:40px;color:#1a1610;letter-spacing:-0.02em}" +
    ".list{margin-top:3px;font-family:Georgia,serif;font-size:14px;color:#8e826f;text-decoration:line-through}" +
    ".ic{position:absolute;right:14px;top:16px}.days{position:absolute;left:14px;bottom:18px}.days i{display:inline-block;width:5px;height:5px;margin-right:3px;border-radius:50%;background:#c9a96b}" +
    ".bars{margin-top:18px}.bars b{display:block;height:5px;margin-top:8px;border-radius:3px;background:#ebe1cf}" +
    ".seal{position:absolute;right:12px;bottom:12px;width:26px;height:26px;border-radius:50%;background:#7a571c;display:flex;align-items:center;justify-content:center}" +
    ".floor{position:absolute;left:50%;top:276px;width:460px;height:40px;margin-left:-230px;border-radius:50%;background:radial-gradient(closest-side,rgba(60,44,20,.20),rgba(60,44,20,0))}" +
    ".rule{position:absolute;left:40px;right:40px;top:22px;height:1px;background:#c9a96b;opacity:.75}.rule.b{top:auto;bottom:18px}";
  const body = "<div class='rule'></div><div class='rule b'></div><div class='floor'></div><div class='stage'><div class='scene' id='scene'>" + cards + "</div></div>";
  const script = "const N=" + fixOffers.PACKAGES.length + ";function frame(t){" +
    "document.getElementById('scene').style.transform='rotateX(16deg) rotateY(-6deg)';" +
    "const slot=t*N,on=Math.floor(slot),k=slot-on;" +
    "for(let i=0;i<N;i++){const c=i-(N-1)/2;const lift=i===on?Math.sin(k*Math.PI):0;const el=document.getElementById('k'+i);" +
    "el.style.transform='rotateZ('+(c*11).toFixed(2)+'deg) translate3d(0,'+(-lift*30).toFixed(1)+'px,'+(i*6+lift*46).toFixed(1)+'px) rotateX('+(-lift*10).toFixed(2)+'deg) rotateY('+(lift*16).toFixed(2)+'deg)';}}frame(0.08);";
  return page(css, body, script);
}

module.exports = { W, H, SCENES: { glass, night, editorial } };
