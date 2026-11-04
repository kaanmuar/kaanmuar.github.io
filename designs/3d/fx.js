// Tiny WebGL2 runner for the full-screen fragment shaders in shaders.js.
// No third-party code, so a chosen proposal can ship under the site CSP (script-src 'self').
import { SHADERS, COMMON } from './shaders.js';

const VERT = `#version 300 es
in vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const pointer = { x: 0, y: 0, active: 0 };
addEventListener('pointermove', (e) => {
	pointer.x = (e.clientX / innerWidth) * 2 - 1;
	pointer.y = -((e.clientY / innerHeight) * 2 - 1);
	pointer.active = 1;
}, { passive: true });

// Rack Focus pulls focus between three planes; the page's viewfinder readout reads the same value.
export function focusAt(t, my = 0) {
	const stops = [1.6, 0.85, 4.2];
	const seg = 3.2, k = t / seg, i = Math.floor(k), f = k - i;
	const e = f < 0.62 ? 0 : (f - 0.62) / 0.38;
	const s = e * e * (3 - 2 * e);
	const a = stops[((i % 3) + 3) % 3], b = stops[(((i + 1) % 3) + 3) % 3];
	return a + (b - a) * s + my * 0.6;
}

function compile(gl, type, src) {
	const s = gl.createShader(type);
	gl.shaderSource(s, src);
	gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
	return s;
}

function program(gl, name) {
	const p = gl.createProgram();
	gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
	gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, `#version 300 es\nprecision highp float;\n${COMMON}\n${SHADERS[name]}`));
	gl.bindAttribLocation(p, 0, 'a');
	gl.linkProgram(p);
	if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
	return p;
}

function setup(canvas, name, preserve = false) {
	const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: preserve, powerPreference: 'high-performance' });
	if (!gl) return null;
	const prog = program(gl, name);
	const buf = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buf);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
	gl.useProgram(prog);
	const u = {};
	for (const k of ['uRes', 'uTime', 'uMouse', 'uMode', 'uSubject', 'uZoom', 'uFocus']) u[k] = gl.getUniformLocation(prog, k);
	return { gl, u };
}

function draw({ gl, u }, w, h, t, o, mouse) {
	gl.viewport(0, 0, w, h);
	gl.uniform2f(u.uRes, w, h);
	gl.uniform1f(u.uTime, t);
	gl.uniform2f(u.uMouse, mouse.x, mouse.y);
	gl.uniform1f(u.uMode, o.mode);
	gl.uniform2f(u.uSubject, o.subject[0], o.subject[1]);
	gl.uniform1f(u.uZoom, o.zoom);
	gl.uniform1f(u.uFocus, focusAt(t, mouse.y * pointer.active));
	gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// mode: 0 hero, 1 banner, 2 section background. subject: where the centrepiece sits, in height units from the centre.
export function mount(canvas, name, opts = {}) {
	const o = { mode: 0, subject: [0, 0], zoom: 1, maxPixels: 1.6e6, start: 6, onFrame: null, ...opts };
	const ctx = setup(canvas, name);
	if (!ctx) {
		canvas.closest('[data-fx]')?.classList.add('fx-fallback');
		return null;
	}
	let scale = Math.min(devicePixelRatio || 1, 1.5), visible = true, raf = 0, last = 0, slow = 0;
	const mouse = { x: 0, y: 0 };
	const t0 = performance.now() - o.start * 1000;

	function size() {
		const r = canvas.getBoundingClientRect();
		let s = scale;
		if (r.width * r.height * s * s > o.maxPixels) s = Math.sqrt(o.maxPixels / (r.width * r.height));
		canvas.width = Math.max(2, Math.round(r.width * s));
		canvas.height = Math.max(2, Math.round(r.height * s));
	}

	function frame(now) {
		raf = 0;
		const t = reduceMotion.matches ? o.start : (now - t0) / 1000;
		mouse.x += (pointer.x - mouse.x) * 0.05;
		mouse.y += (pointer.y - mouse.y) * 0.05;
		draw(ctx, canvas.width, canvas.height, t, o, mouse);
		o.onFrame?.(t);
		const dt = now - last;
		last = now;
		if (dt > 0 && dt < 200) {
			slow = dt > 26 ? slow + 1 : Math.max(0, slow - 1);
			if (slow > 20 && scale > 0.45) { scale *= 0.85; slow = 0; size(); }
		}
		if (visible && !reduceMotion.matches) raf = requestAnimationFrame(frame);
	}

	const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
	new ResizeObserver(() => { size(); kick(); }).observe(canvas);
	new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(canvas);
	reduceMotion.addEventListener('change', kick);
	size();
	kick();
	return { opts: o, time: () => (reduceMotion.matches ? o.start : (performance.now() - t0) / 1000) };
}

// Renders one frame at the exact pixel size for PNG export.
export function still(name, w, h, opts, t) {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const ctx = setup(c, name, true);
	draw(ctx, w, h, t, { mode: 1, subject: [0, 0], zoom: 1, ...opts }, { x: 0, y: 0 });
	return c;
}
