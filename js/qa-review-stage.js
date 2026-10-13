(function () {
  var root = document.querySelector(".reel3d");
  if (!root) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var modes = {
    "dive-nodes": 1,
    "dive-layers": 2,
    "dive-portal": 3,
    "dive-streams": 4,
    "dive-prism": 5,
    "dive-field": 6,
    "dive-path": 0
  };
  var views = [];

  function coverOf(img, w, h) {
    var ia = img.naturalWidth / img.naturalHeight;
    var ca = w / Math.max(1, h);
    if (ia > ca) {
      var sw = ca / ia;
      return [(1 - sw) / 2, 0, sw, 1];
    }
    var sh = ia / ca;
    return [0, (1 - sh) / 2, 1, sh];
  }

  function drawStill(view) {
    var canvas = view.canvas;
    var ctx = canvas.getContext("2d");
    if (!ctx || !view.img.naturalWidth) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(2, Math.round(canvas.clientHeight * dpr));
    canvas.width = w;
    canvas.height = h;
    var cover = coverOf(view.img, w, h);
    ctx.drawImage(view.img, cover[0] * view.img.naturalWidth, cover[1] * view.img.naturalHeight, cover[2] * view.img.naturalWidth, cover[3] * view.img.naturalHeight, 0, 0, w, h);
  }

  root.querySelectorAll("img").forEach(function (img) {
    var mode = modes[img.className.trim()];
    if (mode === undefined) return;
    var clip = document.createElement("span");
    clip.className = "clip " + img.className;
    img.before(clip);
    clip.appendChild(img);
    img.removeAttribute("class");
    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    clip.appendChild(canvas);
    views.push({ img: img, canvas: canvas, clip: clip, mode: mode, gl: null, alive: false });
  });

  var vertSrc = [
    "attribute vec2 aPos;",
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);",
    "  gl_Position = vec4(aPos, 0.0, 1.0);",
    "}"
  ].join("\n");

  var fragHead = [
    "precision mediump float;",
    "uniform sampler2D uTex;",
    "uniform float uTime;",
    "uniform float uMode;",
    "uniform vec4 uCover;",
    "varying vec2 vUv;",
    "float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }",
    "float riverX(float y) { return 0.55 + 0.105 * sin(y * 6.4 + 0.35) + 0.04 * sin(y * 12.2 + 1.7); }",
    "vec2 riverDir(float y) {",
    "  float dx = 0.105 * 6.4 * cos(y * 6.4 + 0.35) + 0.04 * 12.2 * cos(y * 12.2 + 1.7);",
    "  return normalize(vec2(dx, 2.4));",
    "}",
    "vec4 tex(vec2 top) {",
    "  vec2 c = clamp(top, 0.0, 1.0);",
    "  float inside = step(0.0, top.x) * step(top.x, 1.0) * step(0.0, top.y) * step(top.y, 1.0);",
    "  return mix(vec4(0.012, 0.03, 0.045, 1.0), texture2D(uTex, vec2(c.x, 1.0 - c.y)), inside);",
    "}",
    "vec2 zoomAbout(vec2 uv, vec2 focus, float z) { return (uv - focus) / z + focus; }",
    "vec4 flowMix(vec2 uv, vec2 dir, float phase) {",
    "  return mix(tex(uv - dir * phase), tex(uv - dir * (phase - 1.0)), phase);",
    "}",
    "BODY"
  ].join("\n");

  var fragBody = {
    0: [
    "void main() {",
    "  vec2 uv = uCover.xy + vUv * uCover.zw;",
    "  float t = uTime;",
    "  vec3 col = vec3(0.0);",
    "    vec2 focus = vec2(0.63, 0.22);",
    "    float phase = fract(t / 7.0);",
    "    float z = mix(1.0, 1.42, phase);",
    "    float blend = smoothstep(0.8, 1.0, phase);",
    "    float lateral = smoothstep(0.02, 0.22, abs(uv.x - riverX(uv.y)));",
    "    float zA = z * mix(1.0, 1.28, lateral);",
    "    float zB = (z / 1.42) * mix(1.0, 1.28, lateral);",
    "    vec2 cam = mix(zoomAbout(uv, focus, zA), zoomAbout(uv, focus, zB), blend);",
    "    cam.x += sin(t * 0.55) * 0.008;",
    "    cam.y += cos(t * 0.42) * 0.01;",
    "    float fp = fract(t / 2.5);",
    "    vec2 dir = riverDir(cam.y) * 0.09;",
    "    float on = smoothstep(0.22, 0.03, abs(cam.x - riverX(cam.y)));",
    "    vec4 plate = tex(cam);",
    "    vec4 flowed = flowMix(cam, dir, fp);",
    "    float cyan = smoothstep(0.0, 0.5, flowed.g + flowed.b * 0.8 - flowed.r * 1.2);",
    "    col = mix(plate.rgb, flowed.rgb, on * max(cyan, 0.45));",
    "    for (int i = 0; i < 26; i++) {",
    "      float fi = float(i);",
    "      float py = fract(hash(fi) * 0.8 + fp * (0.55 + hash(fi * 2.0) * 0.7));",
    "      float px = riverX(py) + (hash(fi * 5.0) - 0.5) * 0.1;",
    "      vec2 d = cam - vec2(px, py);",
    "      float rad = mix(0.003, 0.02, py);",
    "      float s = smoothstep(rad, 0.0, length(d * vec2(1.05, 0.8)));",
    "      col += vec3(0.35, 0.95, 1.0) * s * (0.4 + 0.6 * hash(fi + 3.0));",
    "    }",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
    ].join("\n"),
    1: [
    "void main() {",
    "  vec2 uv = uCover.xy + vUv * uCover.zw;",
    "  float t = uTime;",
    "  vec3 col = vec3(0.0);",
    "    float fp = fract(t / 3.2);",
    "    vec2 dir = vec2(0.07, sin(uv.x * 9.0 + t * 1.5) * 0.012);",
    "    vec4 plate = tex(uv + vec2(0.0, sin(t * 0.8 + uv.x * 6.0) * 0.008));",
    "    vec4 flowed = flowMix(uv, dir, fp);",
    "    float glow = smoothstep(0.15, 0.7, plate.g + plate.b - plate.r);",
    "    col = mix(plate.rgb, flowed.rgb, glow * 0.85);",
    "    float pulse = 0.5 + 0.5 * sin(t * 2.8 + uv.x * 14.0);",
    "    col += vec3(0.2, 0.7, 0.8) * smoothstep(0.5, 1.0, plate.g) * pulse * 0.45;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
    ].join("\n"),
    2: [
    "void main() {",
    "  vec2 uv = uCover.xy + vUv * uCover.zw;",
    "  float t = uTime;",
    "  vec3 col = vec3(0.0);",
    "    float fp = fract(t / 3.0);",
    "    vec2 wob = vec2(sin(t * 0.6) * 0.01, sin(t * 1.25) * (uv.y - 0.46) * 0.045);",
    "    vec2 dir = vec2(0.085, sin(uv.x * 5.0 + t) * 0.01);",
    "    vec4 plate = tex(uv + wob);",
    "    vec4 flowed = flowMix(uv + wob, dir, fp);",
    "    float ribbon = smoothstep(0.2, 0.75, plate.g);",
    "    col = mix(plate.rgb, flowed.rgb, 0.35 + ribbon * 0.65);",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
    ].join("\n"),
    3: [
    "void main() {",
    "  vec2 uv = uCover.xy + vUv * uCover.zw;",
    "  float t = uTime;",
    "  vec3 col = vec3(0.0);",
    "    float frame = smoothstep(0.18, 0.045, abs(uv.x - 0.5)) * smoothstep(0.44, 0.16, abs(uv.y - 0.48));",
    "    float fp = fract(t / 2.8);",
    "    vec2 dir = vec2(0.09, sin(uv.x * 7.0 + t * 1.3) * 0.016);",
    "    vec4 plate = tex(uv);",
    "    vec4 flowed = flowMix(uv, dir, fp);",
    "    col = mix(flowed.rgb, plate.rgb, frame);",
    "    float spark = smoothstep(0.35, 0.9, flowed.r);",
    "    col += vec3(1.0, 0.78, 0.35) * spark * (1.0 - frame) * 0.18;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
    ].join("\n"),
    4: [
    "void main() {",
    "  vec2 uv = uCover.xy + vUv * uCover.zw;",
    "  float t = uTime;",
    "  vec3 col = vec3(0.0);",
    "    float fp = fract(t / 2.2);",
    "    float wave = sin(uv.x * 8.0 - t * 1.8) * 0.016;",
    "    vec2 dir = vec2(0.12, wave);",
    "    vec4 plate = tex(uv);",
    "    vec4 flowed = flowMix(uv, dir, fp);",
    "    float band = smoothstep(0.18, 0.34, uv.y) * smoothstep(0.86, 0.66, uv.y);",
    "    col = mix(plate.rgb, flowed.rgb, band);",
    "    col += vec3(1.0, 0.9, 0.7) * smoothstep(0.55, 1.0, flowed.r + flowed.g) * band * 0.12;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
    ].join("\n"),
    5: [
    "void main() {",
    "  vec2 uv = uCover.xy + vUv * uCover.zw;",
    "  float t = uTime;",
    "  vec3 col = vec3(0.0);",
    "    float crystal = smoothstep(0.18, 0.04, abs(uv.x - 0.5)) * smoothstep(0.62, 0.1, uv.y) * smoothstep(0.08, 0.2, uv.y);",
    "    float fp = fract(t / 3.4);",
    "    vec2 dir = vec2(0.06, sin(uv.x * 16.0 + t * 1.4) * 0.014);",
    "    vec4 plate = tex(uv);",
    "    vec4 flowed = flowMix(uv, dir, fp);",
    "    col = mix(flowed.rgb, plate.rgb, crystal);",
    "    float sweep = smoothstep(0.07, 0.0, abs(uv.x - mix(0.36, 0.64, fract(t / 4.2))));",
    "    col += vec3(1.0, 0.82, 0.45) * sweep * crystal * 0.4;",
    "    col += vec3(0.3, 0.75, 0.8) * (0.5 + 0.5 * sin(t * 0.9 + uv.x * 20.0)) * (1.0 - crystal) * 0.05;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
    ].join("\n"),
    6: [
    "void main() {",
    "  vec2 uv = uCover.xy + vUv * uCover.zw;",
    "  float t = uTime;",
    "  vec3 col = vec3(0.0);",
    "    vec2 c = vec2(0.5, 0.46);",
    "    float breathe = 1.0 + 0.04 * sin(t * 1.45);",
    "    vec2 p = (uv - c) / breathe + c;",
    "    float ang = sin(t * 0.65) * 0.045;",
    "    float s = sin(ang);",
    "    float co = cos(ang);",
    "    vec2 d = p - c;",
    "    p = vec2(co * d.x - s * d.y, s * d.x + co * d.y) + c;",
    "    vec4 plate = tex(p);",
    "    float fp = fract(t / 3.1);",
    "    vec4 dust = flowMix(p, vec2(0.07, sin(p.x * 10.0 + t) * 0.01), fp);",
    "    float lower = smoothstep(0.55, 0.78, uv.y);",
    "    col = mix(plate.rgb, dust.rgb, lower * 0.85);",
    "    float core = smoothstep(0.16, 0.0, length((uv - c) * vec2(1.0, 1.2)));",
    "    col += vec3(0.25, 0.85, 0.95) * core * (0.25 + 0.2 * sin(t * 2.3));",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
    ].join("\n")
  };

  function fragFor(mode) {
    return fragHead.replace("BODY", fragBody[mode]);
  }

  function compile(gl, type, src) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      window.__stageLog = (type === gl.VERTEX_SHADER ? "vert: " : "frag: ") + gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function mount(view) {
    var gl = view.canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return false;
    var vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
    var fs = compile(gl, gl.FRAGMENT_SHADER, fragFor(view.mode));
    if (!vs || !fs) return false;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(prog));
      return false;
    }
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.useProgram(prog);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, view.img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    view.gl = gl;
    view.prog = prog;
    view.alive = true;
    view.loc = {
      time: gl.getUniformLocation(prog, "uTime"),
      mode: gl.getUniformLocation(prog, "uMode"),
      cover: gl.getUniformLocation(prog, "uCover")
    };
    view.img.style.opacity = "0";
    return true;
  }

  var started = performance.now();
  function frame(now) {
    var time = (now - started) / 1000;
    views.forEach(function (view) {
      if (!view.alive) return;
      var opacity = parseFloat(getComputedStyle(view.clip).opacity);
      var gl = view.gl;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(2, Math.round(view.canvas.clientWidth * dpr));
      var h = Math.max(2, Math.round(view.canvas.clientHeight * dpr));
      if (view.canvas.width !== w || view.canvas.height !== h) {
        view.canvas.width = w;
        view.canvas.height = h;
      }
      if (opacity < 0.03) return;
      gl.viewport(0, 0, view.canvas.width, view.canvas.height);
      gl.useProgram(view.prog);
      gl.uniform1f(view.loc.time, time);
      gl.uniform1f(view.loc.mode, view.mode);
      gl.uniform4fv(view.loc.cover, coverOf(view.img, view.canvas.width, view.canvas.height));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
    requestAnimationFrame(frame);
  }
  views.forEach(function (view) {
    var boot = function () {
      if (reduce) {
        drawStill(view);
        view.img.style.opacity = "0";
        return;
      }
      if (!mount(view)) view.canvas.remove();
    };
    if (view.img.complete && view.img.naturalWidth) boot();
    else view.img.addEventListener("load", boot, { once: true });
  });
  if (!reduce) requestAnimationFrame(frame);
})();
