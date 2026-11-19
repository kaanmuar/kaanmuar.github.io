import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PALETTE } from './symbols.js';

const S = 0.05; // 64 symbol units -> 3.2 world units
const TAU = Math.PI * 2;
const BG = new THREE.Color(PALETTE.bg);
const loader = new SVGLoader();
const TILE = 'M18 3h28a15 15 0 0 1 15 15v28a15 15 0 0 1-15 15H18A15 15 0 0 1 3 46V18A15 15 0 0 1 18 3z';

const shapes = (d, rule) => {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="#fff"${rule ? ` fill-rule="${rule}"` : ''}/></svg>`;
	return loader.parse(svg).paths.flatMap((p) => SVGLoader.createShapes(p));
};

function extrude(d, depth, bevel, rule) {
	const g = new THREE.ExtrudeGeometry(shapes(d, rule), {
		depth,
		bevelEnabled: bevel > 0,
		bevelThickness: bevel,
		bevelSize: bevel * 0.8,
		bevelSegments: 5,
		curveSegments: 40,
	});
	g.translate(0, 0, -depth / 2);
	return g;
}

// Re-centre a geometry on its own box so pulse and spin turn around the part, not the grid.
function pivot(mesh) {
	mesh.geometry.computeBoundingBox();
	const c = new THREE.Vector3();
	mesh.geometry.boundingBox.getCenter(c);
	c.z = 0;
	mesh.geometry.translate(-c.x, -c.y, 0);
	mesh.position.add(c);
	mesh.userData.home = mesh.position.clone();
	return mesh;
}

const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
const tint = (hex, t) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), t);

let glowTex;
function glow() {
	if (glowTex) return glowTex;
	const c = document.createElement('canvas');
	c.width = c.height = 256;
	const x = c.getContext('2d');
	const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
	g.addColorStop(0, 'rgba(255,255,255,1)');
	g.addColorStop(0.35, 'rgba(255,255,255,.35)');
	g.addColorStop(1, 'rgba(255,255,255,0)');
	x.fillStyle = g;
	x.fillRect(0, 0, 256, 256);
	glowTex = new THREE.CanvasTexture(c);
	glowTex.colorSpace = THREE.SRGBColorSpace;
	return glowTex;
}

const sprite = (color, size, opacity) => {
	const m = new THREE.Mesh(
		new THREE.PlaneGeometry(size, size),
		new THREE.MeshBasicMaterial({ map: glow(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
	);
	return m;
};

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const wave = (t, p) => 0.5 - 0.5 * Math.cos((TAU * t) / p);

function slideK(t, delay) {
	const ph = ((((t - delay) % 4.2) + 4.2) % 4.2) / 4.2;
	if (ph < 0.06) return 0;
	if (ph < 0.24) return ease((ph - 0.06) / 0.18);
	if (ph < 0.94) return 1;
	return 1 - ease((ph - 0.94) / 0.06);
}

function flickerK(t) {
	const ph = (t % 3.6) / 3.6;
	if (ph < 0.26) return 0.25;
	if (ph < 0.34) return 0.25 + 0.75 * ((ph - 0.26) / 0.08);
	if (ph < 0.38) return 0.55;
	if (ph < 0.42) return 1;
	if (ph < 0.7) return 0.9;
	return 0.9 - 0.65 * ((ph - 0.7) / 0.3);
}

// Part motion shared by the three directions; matches the SVG keyframes.
function animatePart(mesh, p, t, setGlow) {
	const h = mesh.userData.home;
	mesh.position.copy(h);
	mesh.scale.setScalar(1);
	mesh.rotation.set(0, 0, 0);
	const d = p.delay || 0;
	switch (p.anim) {
		case 'slide': {
			const k = slideK(t, d);
			mesh.scale.x = Math.max(0.001, k);
			mesh.position.x = h.x - 7 * (1 - k);
			setGlow(0.4 + 0.6 * k);
			break;
		}
		case 'pulse':
			mesh.scale.setScalar(1 + 0.09 * wave(t - d, 2.6));
			setGlow(0.7 + 0.5 * wave(t - d, 2.6));
			break;
		case 'blink':
			setGlow(0.35 + 0.65 * (1 - wave(t - d, 1.8)));
			break;
		case 'float':
			mesh.position.y = h.y - 1.4 * wave(t, 3.4);
			break;
		case 'scan':
			mesh.position.y = h.y + 26 * wave(t, 3.6);
			break;
		case 'flicker':
			setGlow(flickerK(t));
			break;
		case 'spin':
			mesh.rotation.y = (TAU * t) / 5;
			break;
		default:
			break;
	}
}

function baseLoop(d, z) {
	const pts = shapes(d)[0].getSpacedPoints(220).map((p) => new THREE.Vector3(p.x - 32, p.y - 32, z));
	return new THREE.BufferGeometry().setFromPoints(pts);
}

function addDeco(item, flip, accent, look) {
	const out = [];
	if (item.deco === 'rings') {
		for (let i = 0; i < 2; i++) {
			const mat = new THREE.LineBasicMaterial({ color: hdr(accent, 1.6), transparent: true, blending: THREE.AdditiveBlending, toneMapped: false });
			const l = new THREE.LineLoop(baseLoop(item.base, 0), mat);
			l.position.set(32, 32, 0);
			flip.add(l);
			out.push((t) => {
				const ph = ((t + i * 1.3) % 2.6) / 2.6;
				l.scale.setScalar(0.72 + 0.52 * ph);
				mat.opacity = 0.75 * (1 - ph);
			});
		}
	}
	if (item.deco === 'orbit') {
		const tilt = new THREE.Group();
		tilt.position.set(32, 32, 0);
		tilt.rotation.set(1.18, 0, (-20 * Math.PI) / 180);
		flip.add(tilt);
		const ringPts = [];
		for (let i = 0; i <= 128; i++) ringPts.push(new THREE.Vector3(Math.cos((i / 128) * TAU) * 31, Math.sin((i / 128) * TAU) * 31, 0));
		tilt.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.35, toneMapped: false })));
		const dot = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 14), new THREE.MeshBasicMaterial({ color: hdr(0xffffff, 2.4), toneMapped: false }));
		tilt.add(dot);
		const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: accent, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
		halo.scale.setScalar(12);
		dot.add(halo);
		out.push((t) => {
			const a = (TAU * t) / 6;
			dot.position.set(Math.cos(a) * 31, Math.sin(a) * 31, 0);
		});
	}
	if (item.deco === 'halo' || look === 'crystal') {
		const h = sprite(accent, look === 'badge' ? 110 : 96, item.deco === 'halo' ? 0.22 : 0.1);
		h.position.set(32, 32, -14);
		flip.add(h);
		if (item.deco === 'halo') out.push((t) => (h.material.opacity = 0.18 + 0.2 * wave(t, 3.2)));
	}
	return out;
}

function particles(accent, n = 140) {
	const pts = [];
	for (let i = 0; i < n; i++) pts.push((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, -2 - Math.random() * 3);
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
	return new THREE.Points(g, new THREE.PointsMaterial({ color: accent, size: 0.03, transparent: true, opacity: 0.7, depthWrite: false }));
}

function crystal(item, flip, accent) {
	const base = new THREE.Mesh(
		extrude(item.base, 9, 2.6, null),
		new THREE.MeshPhysicalMaterial({
			color: tint(accent, 0.72),
			metalness: 0,
			roughness: 0.04,
			transmission: 1,
			thickness: 12,
			ior: 1.5,
			iridescence: 0.65,
			iridescenceIOR: 1.3,
			clearcoat: 1,
			clearcoatRoughness: 0.04,
			attenuationColor: new THREE.Color(accent),
			attenuationDistance: 1.8,
			specularIntensity: 1,
			envMapIntensity: 1.6,
			sheen: 0.35,
			sheenColor: new THREE.Color(accent),
			dispersion: 0.4,
		})
	);
	flip.add(base);
	const rim = new THREE.LineLoop(baseLoop(item.base, 7.2), new THREE.LineBasicMaterial({ color: hdr(accent, 1.4), transparent: true, opacity: 0.55, toneMapped: false }));
	rim.position.set(32, 32, 0);
	flip.add(rim);
	return item.parts.map((p) => {
		const dim = p.tone === 'dim';
		const ink = p.tone === 'ink';
		const mat = new THREE.MeshStandardMaterial({
			color: ink ? PALETTE.bg : dim ? new THREE.Color(accent).multiplyScalar(0.35) : tint(accent, 0.4),
			emissive: ink ? 0x000000 : new THREE.Color(accent),
			emissiveIntensity: dim ? 0.12 : p.tone === 'beam' ? 1.6 : 0.75,
			roughness: 0.3,
			metalness: 0.1,
			transparent: p.tone === 'beam',
			opacity: p.tone === 'beam' ? 0.9 : 1,
		});
		const m = pivot(new THREE.Mesh(extrude(p.d, 2.6, 0.6, p.rule), mat));
		m.position.z = m.userData.home.z = ink ? 6 : 4.4;
		flip.add(m);
		const k0 = mat.emissiveIntensity;
		return { mesh: m, p, glow: (k) => (mat.emissiveIntensity = k0 * k) };
	});
}

function line(item, flip, accent) {
	const solid = extrude(item.base, 8, 0, null);
	const fill = new THREE.Mesh(solid, new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
	flip.add(fill);
	const edges = new THREE.LineSegments(new THREE.EdgesGeometry(solid, 12), new THREE.LineBasicMaterial({ color: hdr(accent, 1.7), transparent: true, blending: THREE.AdditiveBlending, toneMapped: false }));
	flip.add(edges);
	const total = edges.geometry.getAttribute('position').count;
	const spark = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), new THREE.MeshBasicMaterial({ color: hdr(0xffffff, 3), toneMapped: false }));
	const path = shapes(item.base)[0].getSpacedPoints(300);
	flip.add(spark);
	const spark2 = spark.clone();
	flip.add(spark2);
	const parts = item.parts.map((p) => {
		const g = extrude(p.d, 2.4, 0, p.rule);
		const m = pivot(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: p.tone === 'beam' ? 0.85 : 0.2, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
		const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 12), new THREE.LineBasicMaterial({ color: hdr(accent, 2), transparent: true, blending: THREE.AdditiveBlending, toneMapped: false }));
		m.add(e);
		m.position.z = m.userData.home.z = 1.5;
		flip.add(m);
		return { mesh: m, p, glow: (k) => (e.material.opacity = k) };
	});
	const floor = new THREE.GridHelper(12, 24, accent, accent);
	floor.material.transparent = true;
	floor.material.opacity = 0.12;
	floor.position.y = -2.2;
	const beam = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.025), new THREE.MeshBasicMaterial({ color: hdr(accent, 2.2), transparent: true, opacity: 0.8, toneMapped: false, blending: THREE.AdditiveBlending }));
	const beamGlow = sprite(accent, 1, 0.35);
	beamGlow.scale.set(5, 0.5, 1);
	beam.add(beamGlow);
	return {
		parts,
		extra: [floor, beam],
		tick(t) {
			const ph = (t % 5) / 5;
			edges.geometry.setDrawRange(0, Math.floor(total * ease(ph / 0.35)) || 2);
			edges.material.opacity = ph > 0.85 ? 1 - (ph - 0.85) / 0.15 : 1;
			const a = path[Math.floor(((t / 2.6) % 1) * (path.length - 1))];
			const b = path[Math.floor((((t / 2.6) + 0.5) % 1) * (path.length - 1))];
			spark.position.set(a.x, a.y, 4);
			spark2.position.set(b.x, b.y, -4);
			beam.position.y = 1.7 - 3.4 * wave(t, 4.4);
		},
	};
}

function badge(item, flip, accent) {
	const tile = new THREE.Mesh(
		extrude(TILE, 6, 2.4, null),
		new THREE.MeshPhysicalMaterial({
			color: 0xffffff,
			roughness: 0.58,
			metalness: 0,
			transmission: 1,
			thickness: 8,
			ior: 1.45,
			clearcoat: 1,
			clearcoatRoughness: 0.12,
			attenuationColor: new THREE.Color(accent).lerp(new THREE.Color(0xffffff), 0.4),
			attenuationDistance: 3,
			envMapIntensity: 1.3,
			emissive: new THREE.Color(accent).multiplyScalar(0.5),
			emissiveIntensity: 0.14,
			specularIntensity: 0.9,
		})
	);
	flip.add(tile);
	const blobA = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(0.75) }));
	blobA.position.set(24, 22, -1);
	const blobB = new THREE.Mesh(new THREE.SphereGeometry(7, 32, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.deep), toneMapped: false }));
	blobB.position.set(43, 45, -1);
	flip.add(blobA, blobB);
	const sym = new THREE.Group();
	sym.position.set(32, 32, 7.6);
	sym.scale.set(0.64, 0.64, 0.64);
	flip.add(sym);
	const inner = new THREE.Group();
	inner.position.set(-32, -32, 0);
	sym.add(inner);
	inner.add(
		new THREE.Mesh(
			extrude(item.base, 3, 0.9, null),
			new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.22, metalness: 0.05, clearcoat: 1, emissive: new THREE.Color(accent), emissiveIntensity: 0.08 })
		)
	);
	const parts = item.parts.map((p) => {
		const ink = p.tone === 'ink';
		const mat = new THREE.MeshPhysicalMaterial({
			color: ink ? PALETTE.deep : 0xdfeff1,
			roughness: 0.18,
			clearcoat: 1,
			emissive: new THREE.Color(ink ? 0x000000 : accent),
			emissiveIntensity: ink ? 0 : 0.04,
			transparent: p.tone === 'dim',
			opacity: p.tone === 'dim' ? 0.45 : 1,
		});
		const m = pivot(new THREE.Mesh(extrude(p.d, 3, 0.7, p.rule), mat));
		m.position.z = m.userData.home.z = ink ? 5.2 : 3.6;
		inner.add(m);
		const k0 = mat.emissiveIntensity;
		return { mesh: m, p, glow: (k) => (mat.emissiveIntensity = k0 + 0.25 * k * (ink ? 0 : 1)) };
	});
	return {
		parts,
		tick(t) {
			blobA.position.x = 24 + 5 * Math.sin((TAU * t) / 7);
			blobB.position.y = 45 - 4 * Math.sin((TAU * t) / 9);
		},
	};
}

const LOOKS = { crystal, line, badge };
const BLOOM = { crystal: 0.5, line: 0.85, badge: 0.22 };

function buildTile(item, look, env) {
	const scene = new THREE.Scene();
	scene.background = BG;
	scene.environment = env;
	scene.environmentIntensity = look === 'line' ? 0.2 : look === 'badge' ? 0.4 : 0.6;
	const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
	camera.position.set(0, 0.25, 9.2);
	camera.lookAt(0, 0, 0);
	scene.add(new THREE.AmbientLight(0x406a70, 0.6));
	const key = new THREE.DirectionalLight(0xffffff, 1.6);
	key.position.set(4, 6, 8);
	scene.add(key);
	const rimC = new THREE.PointLight(PALETTE.cyan, 40, 30);
	rimC.position.set(-5, 2, 3);
	scene.add(rimC);
	const rimG = new THREE.PointLight(PALETTE.gold, 26, 30);
	rimG.position.set(6, -1, 2);
	scene.add(rimG);

	const accent = new THREE.Color(item.accent).getHex();
	const root = new THREE.Group();
	scene.add(root);
	const flip = new THREE.Group();
	flip.scale.set(S, -S, S);
	flip.position.set(-32 * S, 32 * S, 0);
	root.add(flip);

	const built = LOOKS[look](item, flip, accent);
	const parts = Array.isArray(built) ? built : built.parts;
	const ticks = addDeco(item, flip, accent, look);
	if (built.extra) scene.add(...built.extra);
	const dust = particles(accent);
	scene.add(dust);

	const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
	return {
		scene,
		camera,
		pointer,
		look,
		update(t) {
			pointer.x += (pointer.tx - pointer.x) * 0.08;
			pointer.y += (pointer.ty - pointer.y) * 0.08;
			const sway = look === 'line' ? 0.55 : 0.32;
			root.rotation.y = sway * Math.sin((TAU * t) / 8) + pointer.x * 0.5;
			root.rotation.x = 0.1 * Math.sin((TAU * t) / 6) - pointer.y * 0.35;
			root.position.y = 0.06 * Math.sin((TAU * t) / 5);
			for (const { mesh, p, glow: g } of parts) animatePart(mesh, p, t, g);
			for (const f of ticks) f(t, camera);
			built.tick?.(t);
			dust.rotation.y = t * 0.02;
		},
	};
}

// One renderer for every tile: browsers cap live WebGL contexts at about 16.
export function createStage({ px = 520 } = {}) {
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
	renderer.setPixelRatio(1);
	renderer.setSize(px, px, false);
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	const pm = new THREE.PMREMGenerator(renderer);
	const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
	const composer = new EffectComposer(renderer);
	const pass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
	composer.addPass(pass);
	const bloom = new UnrealBloomPass(new THREE.Vector2(px, px), 0.7, 0.5, 0.82);
	composer.addPass(bloom);
	composer.addPass(new OutputPass());
	const tiles = [];

	function draw(tile, t) {
		tile.state.update(t);
		pass.scene = tile.state.scene;
		pass.camera = tile.state.camera;
		bloom.strength = BLOOM[tile.state.look];
		composer.render();
		tile.ctx.drawImage(renderer.domElement, 0, 0, tile.canvas.width, tile.canvas.height);
	}

	return {
		add(canvas, item, look) {
			canvas.width = canvas.height = px;
			const tile = { canvas, ctx: canvas.getContext('2d'), state: buildTile(item, look, env), visible: false };
			canvas.addEventListener('pointermove', (e) => {
				const r = canvas.getBoundingClientRect();
				tile.state.pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
				tile.state.pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
			});
			canvas.addEventListener('pointerleave', () => (tile.state.pointer.tx = tile.state.pointer.ty = 0));
			tiles.push(tile);
			return tile;
		},
		tiles,
		draw,
		renderAll(t, onlyVisible = true) {
			for (const tile of tiles) if (!onlyVisible || tile.visible) draw(tile, t);
		},
	};
}
