// Interactive URL Review hero (#3429 / #3591), ported from qa-lab-demos marketing/work/scene.html.
import * as THREE from '../../vendor/three/build/three.module.js';
import { RoomEnvironment } from '../../vendor/three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from '../../vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from '../../vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/three/examples/jsm/postprocessing/OutputPass.js';

export const LOOP_SEC = 10;
export const LAYER_KEYS = ['card', 'shield', 'orbit', 'report'];
export const LANGS = ['en', 'de', 'es', 'fr', 'it', 'pt'];

const C = {
	bg: 0x071116,
	teal: 0x4db3bb,
	deep: 0x0d6e76,
	cyan: 0x7ef6fb,
	gold: 0xe2c48a,
	green: 0x6fe3b1,
	coral: 0xf39a8b,
	violet: 0xb9a8ff,
};
const COPY = {
	en: {
		lists: [
			'Phishing lists',
			'Malware lists',
			'Hacked-site signs',
			'Lookalike domains',
			'Linked hosts',
			'Spam blocklists',
			'SPF · DKIM · DMARC',
		],
		scan: 'Scanning…',
		safe: 'Safe',
		report: 'Your report',
		fixed: 'Fixed',
		mail: 'by email · 48 h',
	},
	de: {
		lists: [
			'Phishing-Listen',
			'Malware-Listen',
			'Hack-Anzeichen',
			'Lookalike-Domains',
			'Verlinkte Hosts',
			'Spam-Blocklisten',
			'SPF · DKIM · DMARC',
		],
		scan: 'Prüfung…',
		safe: 'Sicher',
		report: 'Ihr Bericht',
		fixed: 'Behoben',
		mail: 'per E-Mail · 48 h',
	},
	es: {
		lists: [
			'Listas de phishing',
			'Listas de malware',
			'Señales de hackeo',
			'Dominios parecidos',
			'Hosts enlazados',
			'Listas de spam',
			'SPF · DKIM · DMARC',
		],
		scan: 'Revisando…',
		safe: 'Seguro',
		report: 'Tu informe',
		fixed: 'Corregido',
		mail: 'por correo · 48 h',
	},
	fr: {
		lists: [
			'Listes de phishing',
			'Listes de malware',
			'Signes de piratage',
			'Domaines sosies',
			'Hôtes liés',
			'Listes de spam',
			'SPF · DKIM · DMARC',
		],
		scan: 'Analyse…',
		safe: 'Sûr',
		report: 'Votre rapport',
		fixed: 'Corrigé',
		mail: 'par e-mail · 48 h',
	},
	it: {
		lists: [
			'Liste di phishing',
			'Liste di malware',
			'Segni di violazione',
			'Domini sosia',
			'Host collegati',
			'Blocklist di spam',
			'SPF · DKIM · DMARC',
		],
		scan: 'Controllo…',
		safe: 'Sicuro',
		report: 'Il tuo report',
		fixed: 'Sistemato',
		mail: 'via email · 48 h',
	},
	pt: {
		lists: [
			'Listas de phishing',
			'Listas de malware',
			'Sinais de invasão',
			'Domínios parecidos',
			'Hosts vinculados',
			'Listas de spam',
			'SPF · DKIM · DMARC',
		],
		scan: 'Verificando…',
		safe: 'Seguro',
		report: 'Seu relatório',
		fixed: 'Corrigido',
		mail: 'por e-mail · 48 h',
	},
};
const LIST_COLORS = ['#f39a8b', '#b9a8ff', '#e2c48a', '#7ef6fb', '#6fe3b1', '#f39a8b', '#e2c48a'];

const ease = {
	outBack: (x) => {
		const c1 = 1.70158,
			c3 = c1 + 1;
		return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
	},
	inOut: (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2),
	out: (x) => 1 - (1 - x) ** 3,
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const invInOut = (y) => (y < 0.5 ? Math.sqrt(y / 2) : 1 - Math.sqrt((1 - y) / 2));

function rr(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
}
function tex(canvas) {
	const t = new THREE.CanvasTexture(canvas);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	return t;
}

function cardCanvas(copy, safe) {
	const W = 2048,
		H = 1366,
		c = document.createElement('canvas');
	c.width = W;
	c.height = H;
	const x = c.getContext('2d');
	const g = x.createLinearGradient(0, 0, W, H);
	g.addColorStop(0, '#0c1f26');
	g.addColorStop(1, '#0a171d');
	x.fillStyle = g;
	rr(x, 0, 0, W, H, 70);
	x.fill();
	x.fillStyle = 'rgba(126,246,251,.06)';
	rr(x, 0, 0, W, 132, [70, 70, 0, 0]);
	x.fill();
	[
		['#f39a8b', 80],
		['#e2c48a', 140],
		['#6fe3b1', 200],
	].forEach(([col, cx]) => {
		x.fillStyle = col;
		x.beginPath();
		x.arc(cx, 66, 19, 0, 7);
		x.fill();
	});
	x.fillStyle = 'rgba(7,17,22,.85)';
	rr(x, 290, 30, 1150, 72, 36);
	x.fill();
	x.strokeStyle = 'rgba(126,246,251,.25)';
	x.lineWidth = 3;
	x.stroke();
	x.fillStyle = '#6fe3b1';
	rr(x, 326, 52, 22, 28, 5);
	x.fill();
	x.strokeStyle = '#6fe3b1';
	x.lineWidth = 5;
	x.beginPath();
	x.arc(337, 52, 9, Math.PI, 0);
	x.stroke();
	x.font = "500 40px 'Fira Code'";
	x.fillStyle = '#bfe9ee';
	x.textBaseline = 'middle';
	x.fillText('https://your-site.com', 372, 68);
	const chipCol = safe ? '#6fe3b1' : '#e2c48a';
	x.font = '700 40px Inter';
	const label = copy[safe ? 'safe' : 'scan'];
	const tw = x.measureText(label).width;
	const cw = tw + 110,
		cx0 = W - 70 - cw;
	x.fillStyle = safe ? 'rgba(111,227,177,.16)' : 'rgba(226,196,138,.14)';
	rr(x, cx0, 32, cw, 68, 34);
	x.fill();
	x.strokeStyle = chipCol;
	x.lineWidth = 3;
	x.stroke();
	x.fillStyle = chipCol;
	x.beginPath();
	x.arc(cx0 + 42, 66, 13, 0, 7);
	x.fill();
	x.fillText(label, cx0 + 70, 68);
	const hg = x.createLinearGradient(110, 220, 1000, 700);
	hg.addColorStop(0, '#1d5a62');
	hg.addColorStop(1, '#3a3570');
	x.fillStyle = hg;
	rr(x, 110, 210, 860, 560, 40);
	x.fill();
	x.fillStyle = 'rgba(126,246,251,.35)';
	x.beginPath();
	x.arc(400, 460, 120, 0, 7);
	x.fill();
	x.fillStyle = 'rgba(185,168,255,.35)';
	x.beginPath();
	x.moveTo(520, 700);
	x.lineTo(760, 380);
	x.lineTo(930, 700);
	x.fill();
	x.fillStyle = '#e8f3f4';
	rr(x, 1060, 230, 820, 64, 22);
	x.fill();
	rr(x, 1060, 320, 640, 64, 22);
	x.fill();
	x.fillStyle = 'rgba(159,179,184,.55)';
	[430, 480, 530, 580].forEach((y, i) => {
		rr(x, 1060, y, [860, 800, 840, 560][i], 22, 11);
		x.fill();
	});
	x.fillStyle = '#4db3bb';
	rr(x, 1060, 660, 300, 90, 45);
	x.fill();
	x.strokeStyle = 'rgba(232,243,244,.6)';
	x.lineWidth = 4;
	rr(x, 1390, 660, 300, 90, 45);
	x.stroke();
	[110, 770, 1430].forEach((cx) => {
		x.fillStyle = 'rgba(126,246,251,.07)';
		rr(x, cx, 850, 510, 390, 34);
		x.fill();
		x.strokeStyle = 'rgba(126,246,251,.18)';
		x.lineWidth = 3;
		x.stroke();
		x.fillStyle = 'rgba(226,196,138,.6)';
		rr(x, cx + 40, 900, 90, 90, 24);
		x.fill();
		x.fillStyle = 'rgba(232,243,244,.75)';
		rr(x, cx + 40, 1030, 340, 30, 15);
		x.fill();
		x.fillStyle = 'rgba(159,179,184,.45)';
		rr(x, cx + 40, 1090, 420, 20, 10);
		x.fill();
		rr(x, cx + 40, 1130, 380, 20, 10);
		x.fill();
		rr(x, cx + 40, 1170, 300, 20, 10);
		x.fill();
	});
	x.strokeStyle = 'rgba(126,246,251,.5)';
	x.lineWidth = 5;
	rr(x, 3, 3, W - 6, H - 6, 68);
	x.stroke();
	return c;
}

function pillCanvas(text, dot) {
	const c = document.createElement('canvas'),
		x = c.getContext('2d');
	x.font = '600 62px Inter';
	const w = Math.ceil(x.measureText(text).width) + 150,
		h = 120;
	c.width = w;
	c.height = h;
	x.font = '600 62px Inter';
	x.fillStyle = 'rgba(9,26,32,.78)';
	rr(x, 3, 3, w - 6, h - 6, 57);
	x.fill();
	x.strokeStyle = 'rgba(126,246,251,.55)';
	x.lineWidth = 4;
	x.stroke();
	x.fillStyle = dot;
	x.beginPath();
	x.arc(62, h / 2, 17, 0, 7);
	x.fill();
	x.fillStyle = '#d9ecee';
	x.textBaseline = 'middle';
	x.fillText(text, 100, h / 2 + 3);
	return c;
}

function reportCanvas(copy) {
	const W = 760,
		H = 940,
		c = document.createElement('canvas');
	c.width = W;
	c.height = H;
	const x = c.getContext('2d');
	const g = x.createLinearGradient(0, 0, 0, H);
	g.addColorStop(0, 'rgba(16,44,52,.92)');
	g.addColorStop(1, 'rgba(9,24,30,.92)');
	x.fillStyle = g;
	rr(x, 4, 4, W - 8, H - 8, 56);
	x.fill();
	x.strokeStyle = 'rgba(126,246,251,.7)';
	x.lineWidth = 5;
	x.stroke();
	x.fillStyle = '#e2c48a';
	x.font = '700 30px Inter';
	x.fillText('QA-LAB URL REVIEW', 64, 104);
	x.fillStyle = '#f4fafb';
	x.font = "400 92px 'Instrument Serif'";
	x.fillText(copy.report, 60, 210);
	for (let i = 0; i < 4; i++) {
		const y = 300 + i * 120;
		x.fillStyle = 'rgba(111,227,177,.18)';
		x.beginPath();
		x.arc(100, y, 34, 0, 7);
		x.fill();
		x.strokeStyle = '#6fe3b1';
		x.lineWidth = 9;
		x.lineCap = 'round';
		x.lineJoin = 'round';
		x.beginPath();
		x.moveTo(84, y + 2);
		x.lineTo(96, y + 15);
		x.lineTo(118, y - 12);
		x.stroke();
		x.fillStyle = 'rgba(232,243,244,.8)';
		rr(x, 160, y - 26, [360, 300, 400, 260][i], 22, 11);
		x.fill();
		x.fillStyle = 'rgba(111,227,177,.9)';
		x.font = '600 26px Inter';
		x.fillText(copy.fixed, 160, y + 30);
	}
	x.fillStyle = 'rgba(126,246,251,.12)';
	rr(x, 60, 790, W - 120, 92, 46);
	x.fill();
	x.strokeStyle = 'rgba(126,246,251,.5)';
	x.lineWidth = 3;
	x.stroke();
	x.strokeStyle = '#7ef6fb';
	x.lineWidth = 6;
	rr(x, 100, 812, 70, 48, 8);
	x.stroke();
	x.beginPath();
	x.moveTo(102, 816);
	x.lineTo(135, 842);
	x.lineTo(168, 816);
	x.stroke();
	x.fillStyle = '#cfeff2';
	x.font = '600 38px Inter';
	x.textBaseline = 'middle';
	x.fillText(copy.mail, 200, 838);
	return c;
}

function glowTexture(inner, outer) {
	const c = document.createElement('canvas');
	c.width = c.height = 256;
	const x = c.getContext('2d');
	const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
	g.addColorStop(0, inner);
	g.addColorStop(1, outer);
	x.fillStyle = g;
	x.fillRect(0, 0, 256, 256);
	return tex(c);
}

function shieldShape(s = 1) {
	const p = new THREE.Shape();
	p.moveTo(0, 1.15 * s);
	p.quadraticCurveTo(0.5 * s, 0.98 * s, 0.98 * s, 1.04 * s);
	p.lineTo(0.98 * s, 0.25 * s);
	p.bezierCurveTo(0.98 * s, -0.5 * s, 0.5 * s, -0.95 * s, 0, -1.25 * s);
	p.bezierCurveTo(-0.5 * s, -0.95 * s, -0.98 * s, -0.5 * s, -0.98 * s, 0.25 * s);
	p.lineTo(-0.98 * s, 1.04 * s);
	p.quadraticCurveTo(-0.5 * s, 0.98 * s, 0, 1.15 * s);
	return p;
}

function mulberry(a) {
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export async function createHeroScene(mount, opts = {}) {
	const lang = COPY[opts.lang] ? opts.lang : 'en';
	const copy = COPY[lang];
	const fonts = document.fonts;
	if (fonts?.load) {
		await Promise.race([
			Promise.all([
				fonts.load('600 62px Inter'),
				fonts.load("500 40px 'Fira Code'"),
				fonts.load("400 92px 'Instrument Serif'"),
				fonts.load('700 40px Inter'),
			]),
			new Promise((r) => setTimeout(r, 4000)),
		]);
	}

	const w = opts.w || mount.clientWidth || 800;
	const h = opts.h || mount.clientHeight || 500;
	const dist = opts.dist ?? 11;
	const fov = opts.fov ?? 34;
	const bloomStrength = opts.bloomStrength ?? 0.55;
	const pixelRatio = Math.min(opts.pixelRatio ?? window.devicePixelRatio ?? 1, 2);

	const S = {};
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setPixelRatio(pixelRatio);
	renderer.setSize(w, h);
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	mount.replaceChildren(renderer.domElement);
	renderer.domElement.setAttribute('aria-hidden', 'true');

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(C.bg);
	scene.fog = new THREE.FogExp2(C.bg, 0.045);
	const pm = new THREE.PMREMGenerator(renderer);
	scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
	scene.environmentIntensity = 0.55;

	const camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 200);
	S.dist = dist;

	scene.add(new THREE.AmbientLight(0x406a70, 0.6));
	const key = new THREE.DirectionalLight(0xffffff, 1.6);
	key.position.set(4, 6, 8);
	scene.add(key);
	const rimC = new THREE.PointLight(C.cyan, 40, 30);
	rimC.position.set(-5, 2, 3);
	scene.add(rimC);
	const rimG = new THREE.PointLight(C.gold, 26, 30);
	rimG.position.set(6, -1, 2);
	scene.add(rimG);
	S.flash = new THREE.PointLight(C.green, 0, 12);
	S.flash.position.set(0, 0, 3.2);
	scene.add(S.flash);

	const pts = [];
	for (let i = -40; i <= 40; i++) for (let j = -40; j <= 14; j++) pts.push(i * 0.42, -2.6, j * 0.42);
	const fg = new THREE.BufferGeometry();
	fg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
	scene.add(
		new THREE.Points(
			fg,
			new THREE.PointsMaterial({ color: 0x2f8e96, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.85 })
		)
	);
	const pool = new THREE.Mesh(
		new THREE.PlaneGeometry(9, 9),
		new THREE.MeshBasicMaterial({
			map: glowTexture('rgba(77,179,187,.22)', 'rgba(77,179,187,0)'),
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		})
	);
	pool.rotation.x = -Math.PI / 2;
	pool.position.set(0, -2.58, 0.5);
	scene.add(pool);

	const dust = [];
	const rnd = mulberry(7);
	for (let i = 0; i < 520; i++) dust.push((rnd() - 0.5) * 26, (rnd() - 0.3) * 12, (rnd() - 0.6) * 18);
	const dg = new THREE.BufferGeometry();
	dg.setAttribute('position', new THREE.Float32BufferAttribute(dust, 3));
	S.dust = new THREE.Points(
		dg,
		new THREE.PointsMaterial({ color: 0x9fe9ee, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false })
	);
	scene.add(S.dust);

	S.card = new THREE.Group();
	S.card.position.set(0.35, 0.2, -0.6);
	S.card.rotation.set(-0.04, -0.2, 0);
	scene.add(S.card);
	S.card.add(
		new THREE.Mesh(
			new RoundedBoxGeometry(4.6, 3.07, 0.12, 6, 0.1),
			new THREE.MeshPhysicalMaterial({
				color: 0x0b1c22,
				roughness: 0.3,
				metalness: 0.2,
				clearcoat: 1,
				clearcoatRoughness: 0.2,
			})
		)
	);
	S.cardTex = [tex(cardCanvas(copy, false)), tex(cardCanvas(copy, true))];
	S.face = new THREE.Mesh(
		new THREE.PlaneGeometry(4.5, 3.0),
		new THREE.MeshBasicMaterial({ map: S.cardTex[0], toneMapped: false, transparent: true })
	);
	S.face.position.z = 0.065;
	S.card.add(S.face);
	S.beam = new THREE.Group();
	S.card.add(S.beam);
	const bl = new THREE.Mesh(
		new THREE.PlaneGeometry(4.7, 0.035),
		new THREE.MeshBasicMaterial({
			color: 0xbffcff,
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			toneMapped: false,
		})
	);
	const trailC = document.createElement('canvas');
	trailC.width = 4;
	trailC.height = 256;
	const tx = trailC.getContext('2d');
	const tg = tx.createLinearGradient(0, 0, 0, 256);
	tg.addColorStop(0, 'rgba(126,246,251,0)');
	tg.addColorStop(1, 'rgba(126,246,251,.55)');
	tx.fillStyle = tg;
	tx.fillRect(0, 0, 4, 256);
	const trail = new THREE.Mesh(
		new THREE.PlaneGeometry(4.5, 0.9),
		new THREE.MeshBasicMaterial({
			map: tex(trailC),
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			toneMapped: false,
		})
	);
	S.trail = trail;
	S.beamLine = bl;
	bl.position.z = 0.09;
	trail.position.z = 0.08;
	S.beam.add(trail, bl);
	S.marks = [
		[-1.75, 0.62],
		[1.55, 0.72],
		[1.45, -0.95],
	].map(([mx, my], i) => {
		const m = new THREE.Mesh(
			new THREE.CircleGeometry(0.11, 40),
			new THREE.MeshBasicMaterial({ color: C.coral, toneMapped: false, transparent: true })
		);
		const ring = new THREE.Mesh(
			new THREE.RingGeometry(0.15, 0.19, 48),
			new THREE.MeshBasicMaterial({ color: C.coral, toneMapped: false, transparent: true, depthWrite: false })
		);
		const g = new THREE.Group();
		g.add(m, ring);
		g.position.set(mx, my, 0.1);
		S.card.add(g);
		return { g, m, ring, y: my, i };
	});

	const sg = new THREE.ExtrudeGeometry(shieldShape(), {
		depth: 0.16,
		bevelEnabled: true,
		bevelThickness: 0.14,
		bevelSize: 0.09,
		bevelSegments: 10,
		curveSegments: 64,
	});
	sg.center();
	S.shield = new THREE.Group();
	S.shield.position.set(-0.2, 0.1, 1.9);
	S.shield.scale.setScalar(0.86);
	scene.add(S.shield);
	S.shield.add(
		new THREE.Mesh(
			sg,
			new THREE.MeshPhysicalMaterial({
				color: 0xd8fbff,
				metalness: 0,
				roughness: 0.05,
				transmission: 1,
				thickness: 0.55,
				ior: 1.5,
				iridescence: 0.7,
				iridescenceIOR: 1.35,
				clearcoat: 1,
				clearcoatRoughness: 0.03,
				attenuationColor: new THREE.Color(0x63c9cf),
				attenuationDistance: 3.2,
				specularIntensity: 1,
				envMapIntensity: 1.6,
				sheen: 0.4,
				sheenColor: new THREE.Color(0x7ef6fb),
				dispersion: 0.4,
			})
		)
	);
	const outline = shieldShape(0.86)
		.getSpacedPoints(220)
		.map((p) => new THREE.Vector3(p.x, p.y, 0));
	const rimCurve = new THREE.CatmullRomCurve3(outline, true);
	S.rimMat = new THREE.MeshStandardMaterial({
		color: C.cyan,
		emissive: C.cyan,
		emissiveIntensity: 1.4,
		toneMapped: false,
	});
	S.shield.add(new THREE.Mesh(new THREE.TubeGeometry(rimCurve, 400, 0.018, 10, true), S.rimMat));
	const halo = new THREE.Mesh(
		new THREE.PlaneGeometry(5.2, 5.2),
		new THREE.MeshBasicMaterial({
			map: glowTexture('rgba(126,246,251,.14)', 'rgba(126,246,251,0)'),
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		})
	);
	halo.position.z = -0.4;
	S.shield.add(halo);
	S.halo = halo;

	const path = new THREE.CurvePath();
	const a = new THREE.Vector3(-0.46, 0.02, 0),
		b = new THREE.Vector3(-0.14, -0.32, 0),
		d = new THREE.Vector3(0.5, 0.42, 0);
	path.add(new THREE.LineCurve3(a, b));
	path.add(new THREE.LineCurve3(b, d));
	S.checkMat = new THREE.MeshStandardMaterial({
		color: C.green,
		emissive: C.green,
		emissiveIntensity: 0.9,
		roughness: 0.25,
		toneMapped: false,
	});
	S.check = new THREE.Group();
	S.shield.add(S.check);
	S.check.add(new THREE.Mesh(new THREE.TubeGeometry(path, 120, 0.1, 20, false), S.checkMat));
	[a, b, d].forEach((p) => {
		const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), S.checkMat);
		s.position.copy(p);
		S.check.add(s);
	});
	S.shock = new THREE.Mesh(
		new THREE.RingGeometry(0.9, 1.0, 96),
		new THREE.MeshBasicMaterial({
			color: C.green,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			toneMapped: false,
			side: THREE.DoubleSide,
		})
	);
	S.shock.position.z = 0.3;
	S.shield.add(S.shock);

	S.orbit = new THREE.Group();
	S.orbit.position.set(0, 0.1, 0.9);
	S.orbit.rotation.set(0.32, 0, -0.12);
	scene.add(S.orbit);
	S.pills = copy.lists.map((text, i) => {
		const cv = pillCanvas(text, LIST_COLORS[i]);
		const hgt = 0.36;
		const m = new THREE.Mesh(
			new THREE.PlaneGeometry((hgt * cv.width) / cv.height, hgt),
			new THREE.MeshBasicMaterial({ map: tex(cv), transparent: true, depthWrite: false, toneMapped: false })
		);
		S.orbit.add(m);
		return { m, phase: (i / copy.lists.length) * Math.PI * 2, label: text };
	});
	const ringPts = [];
	for (let i = 0; i <= 256; i++) {
		const t = (i / 256) * Math.PI * 2;
		ringPts.push(new THREE.Vector3(Math.cos(t) * 3.7, 0, Math.sin(t) * 3.7));
	}
	S.orbitRing = new THREE.Line(
		new THREE.BufferGeometry().setFromPoints(ringPts),
		new THREE.LineBasicMaterial({ color: C.teal, transparent: true, opacity: 0.35 })
	);
	S.orbit.add(S.orbitRing);
	const gemCols = [C.coral, C.violet, C.gold, C.cyan, C.green, C.violet, C.coral, C.gold];
	S.gems = gemCols.map((col, i) => {
		const m = new THREE.Mesh(
			new THREE.OctahedronGeometry(0.1 + (i % 3) * 0.035),
			new THREE.MeshPhysicalMaterial({
				color: col,
				emissive: col,
				emissiveIntensity: 0.45,
				roughness: 0.1,
				metalness: 0.1,
				clearcoat: 1,
				transmission: 0.4,
				thickness: 0.3,
			})
		);
		S.orbit.add(m);
		return { m, phase: (i / gemCols.length) * Math.PI * 2 + 0.4, r: 4.5 + (i % 2) * 0.4, yy: ((i % 3) - 1) * 0.35 };
	});

	const rc = reportCanvas(copy);
	S.report = new THREE.Mesh(
		new THREE.PlaneGeometry(1.45, (1.45 * rc.height) / rc.width),
		new THREE.MeshBasicMaterial({ map: tex(rc), transparent: true, depthWrite: false, toneMapped: false })
	);
	S.report.position.set(2.75, -0.2, 0.6);
	S.report.rotation.y = -0.32;
	scene.add(S.report);

	(opts.hide || []).forEach((k) => {
		if (S[k]) {
			S[k].visible = false;
			S[`_hide_${k}`] = true;
		}
	});

	const composer = new EffectComposer(renderer);
	composer.addPass(new RenderPass(scene, camera));
	const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), bloomStrength, 0.45, 0.88);
	composer.addPass(bloom);
	composer.addPass(new OutputPass());

	function frame(t) {
		t = ((t % LOOP_SEC) + LOOP_SEC) % LOOP_SEC;
		const wAng = (2 * Math.PI) / LOOP_SEC;
		camera.position.set(Math.sin(wAng * t) * 1.4, 0.7 + Math.sin(wAng * t * 2) * 0.15, S.dist);
		camera.lookAt(0, 0.05, 0.4);
		const sweep = t < 3 ? t / 3 : t < 6 ? 1 - (t - 3) / 3 : 0;
		const top = 1.45,
			bottom = -1.45;
		const by = top + (bottom - top) * ease.inOut(sweep);
		if (S.beam?.visible !== false) {
			S.beam.position.y = by;
			S.trail.position.y = 0.45;
			const beamA = t < 6 ? 1 - seg(t, 5.7, 6) : seg(t, 9.5, 10);
			S.beamLine.material.opacity = beamA;
			S.trail.material.opacity = beamA * 0.9;
		}
		const land = 6.6;
		S.marks.forEach((k) => {
			const pass = (top - k.y) / (top - bottom);
			const seen = 3 * invInOut(pass);
			const show = seg(t, seen, seen + 0.25) * (1 - seg(t, 9.1, 9.6));
			const fix = seg(t, land, land + 0.5);
			const col = new THREE.Color(C.coral).lerp(new THREE.Color(C.green), fix);
			k.m.material.color.copy(col);
			k.ring.material.color.copy(col);
			const pulse = 1 + 0.25 * Math.sin(t * 6 + k.i);
			k.g.scale.setScalar(Math.max(0.0001, ease.outBack(show)));
			k.ring.scale.setScalar(pulse);
			k.ring.material.opacity = 0.8 * show;
			k.m.material.opacity = show;
		});
		S.face.material.map = t >= land && t < 9.6 ? S.cardTex[1] : S.cardTex[0];
		S.shield.position.y = 0.05 + Math.sin(wAng * t * 2) * 0.08;
		S.shield.rotation.y = Math.sin(wAng * t) * 0.22;
		S.shield.rotation.x = Math.sin(wAng * t * 2 + 1) * 0.05;
		const drop = seg(t, 6.0, land);
		const gone = seg(t, 9.0, 9.6);
		const vis = t >= 6.0 && t < 9.6;
		S.check.visible = vis;
		S.check.position.set(0, (1 - ease.out(drop)) * 3.2 + gone * 0.6, 0.32);
		const sc = vis ? Math.max(0.001, (0.6 + 0.4 * ease.outBack(drop)) * (1 - ease.inOut(gone))) : 0.001;
		S.check.scale.setScalar(sc);
		S.check.rotation.y = (1 - ease.out(drop)) * 1.2;
		const hit = seg(t, land, land + 1.1);
		S.shock.visible = t >= land && t < land + 1.1;
		S.shock.scale.setScalar(0.6 + hit * 2.2);
		S.shock.material.opacity = (1 - hit) * 0.9;
		const glowT = t >= land ? Math.exp(-(t - land) * 2.2) : 0;
		S.flash.intensity = 32 * glowT + (t >= land && t < 9.4 ? 6 : 0);
		S.rimMat.emissiveIntensity = 1.4 + 2.4 * glowT;
		S.rimMat.emissive.set(
			new THREE.Color(C.cyan).lerp(new THREE.Color(C.green), t >= land && t < 9.4 ? 0.55 * (1 - gone) : 0)
		);
		S.halo.material.opacity = 0.85 + 0.6 * glowT;
		const rin = seg(t, 7.0, 7.8),
			rout = seg(t, 9.0, 9.6);
		S.report.material.opacity = ease.out(rin) * (1 - rout);
		S.report.position.set(2.2 + 0.85 * ease.out(rin), -0.25 + Math.sin(wAng * t * 2) * 0.05, 0.4 + 0.5 * ease.out(rin));
		S.report.visible = S.report.material.opacity > 0.01 && !S._hide_report;
		S.pills.forEach((p) => {
			const a = p.phase + wAng * t;
			p.m.position.set(Math.cos(a) * 3.7, 0, Math.sin(a) * 3.7);
			p.m.quaternion.copy(S.orbit.quaternion).invert().multiply(camera.quaternion);
			const front = (Math.sin(a) + 1) / 2;
			p.m.material.opacity = (0.35 + 0.65 * front) * (p.m.visible ? 1 : 0);
		});
		S.gems.forEach((g, i) => {
			const a = g.phase - wAng * t;
			g.m.position.set(Math.cos(a) * g.r, g.yy + Math.sin(a * 2) * 0.1, Math.sin(a) * g.r);
			g.m.rotation.set(wAng * t * 2 + i, wAng * t * 3 + i, 0);
		});
		S.dust.rotation.y = Math.sin(wAng * t) * 0.2;
		S.dust.position.y = Math.sin(wAng * t) * 0.15;
		composer.render();
	}

	function setLayer(key, on) {
		if (!S[key]) return;
		S[key].visible = on;
		if (on) delete S[`_hide_${key}`];
		else S[`_hide_${key}`] = true;
		if (key === 'card') S.beam.visible = on;
	}

	function setPill(index, on) {
		const p = S.pills[index];
		if (!p) return;
		p.m.visible = on;
	}

	function resize(nw, nh) {
		renderer.setSize(nw, nh);
		camera.aspect = nw / nh;
		camera.updateProjectionMatrix();
		composer.setSize(nw, nh);
		bloom.resolution.set(nw, nh);
	}

	function dispose() {
		renderer.dispose();
		pm.dispose();
	}

	return {
		canvas: renderer.domElement,
		frame,
		setLayer,
		setPill,
		resize,
		dispose,
		pillLabels: copy.lists,
		lang,
	};
}
