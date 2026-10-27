// Mounts the Fusion canvas of every [data-fx] host (#1791) once the host is near the viewport and the browser is idle,
// so the shader never competes with the headline for the first paint. The host's CSS gradient stays as the fallback.
//   data-fx-mode   0 hero, 1 banner, 2 dimmed section background
//   data-fx-place  hero: subject right of the copy on wide screens, above it on phones; band: subject at the right edge;
//                  section: right and dimmer; art: centred on the band's [data-fx-art] box
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
let engine;
const load = () => (engine ||= import('./fx.js?v=20261027a'));

const PLACE = {
	hero(r, host) {
		const a = r.width / r.height;
		if (a > 1.15) return { subject: [Math.min(0.5, a * 0.25), -0.02], zoom: a > 2.2 ? 1.05 : 1.15 };
		const copy = host.querySelector('[data-fx-copy]');
		const band = copy ? Math.max(160, copy.getBoundingClientRect().top - r.top) : r.height * 0.4;
		return { subject: [0, 0.5 - band / 2 / r.height], zoom: Math.max(1.4, (r.height / band) * 0.95) };
	},
	band(r) {
		if (r.width / r.height > 1.6) return { subject: [(r.width / 2 - Math.max(150, r.width * 0.1)) / r.height, -0.04], zoom: 1.15 };
		return { subject: [(r.width / 2 - 52) / r.height, (r.height / 2 - 64) / r.height], zoom: Math.max(2.6, r.height / 150) };
	},
	art(r, host) {
		const art = host.closest('.fx-band')?.querySelector('[data-fx-art]')?.getBoundingClientRect();
		if (!art?.width || !art.height) return PLACE.band(r);
		const zoom = Math.max(1, (0.85 * r.height) / Math.min(art.width, art.height));
		const x = (art.left + art.width / 2 - r.left - r.width / 2) / r.height;
		const y = (r.top + r.height / 2 - art.top - art.height / 2) / r.height - 0.18 / zoom;
		return { subject: [x, y], zoom };
	},
	section(r) {
		const a = r.width / r.height;
		return a > 1.4 ? { subject: [Math.min(a * 0.34, 0.95), 0], zoom: 1.25 } : { subject: [0, 0.18], zoom: 1.8 };
	},
};

function start(host) {
	const canvas = host.querySelector('canvas.fx');
	if (!canvas) return;
	load().then(({ mount }) => {
		const run = mount(canvas, 'fusion', { mode: Number(host.dataset.fxMode || 0), maxPixels: host.dataset.fxMode === '2' ? 0.9e6 : 1.6e6, start: 6 });
		if (!run) return;
		canvas.addEventListener('webglcontextlost', () => host.classList.remove('fx-on'));
		const place = PLACE[host.dataset.fxPlace];
		if (place) {
			const fit = () => Object.assign(run.opts, place(canvas.getBoundingClientRect(), host));
			fit();
			const watch = new ResizeObserver(fit);
			watch.observe(canvas);
			const art = host.closest('.fx-band')?.querySelector('[data-fx-art]');
			if (art) watch.observe(art);
		}
		requestAnimationFrame(() => host.classList.add('fx-on'));
	}).catch(() => host.classList.add('fx-fallback'));
}

// A software rasterizer (no GPU, or a headless test browser) would spend whole CPU cores on the ray march.
function hardware() {
	const gl = document.createElement('canvas').getContext('webgl2');
	if (!gl) return false;
	const info = gl.getExtension('WEBGL_debug_renderer_info');
	const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
	gl.getExtension('WEBGL_lose_context')?.loseContext();
	return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
}

const hosts = document.querySelectorAll('[data-fx]');
if (hosts.length && !('WebGL2RenderingContext' in window && hardware())) {
	hosts.forEach((host) => host.classList.add('fx-fallback'));
} else if (hosts.length) {
	const seen = new IntersectionObserver((entries) => {
		for (const e of entries) {
			if (!e.isIntersecting) continue;
			seen.unobserve(e.target);
			idle(() => start(e.target), { timeout: 1500 });
		}
	}, { rootMargin: '200px 0px' });
	hosts.forEach((host) => seen.observe(host));
}
