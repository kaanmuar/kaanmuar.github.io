/* Live review arena. Two skins, both driven only by the real review log lines and both drawn by
   js/qa-review-console.js (HTML/SVG, sharp at any size). Lab keeps the Lab Tries board (tick boxes,
   item row, doctor, bays); console keeps the concurrent-work arcade. This file feeds state and loads
   the console on demand. */
(function () {
	'use strict';

	const SKIN_KEY = 'qa-review-arena-skin';
	const BASE = 'assets/review-arena/v3/';
	const VER = '?v=20261118a';
	const CONSOLE_VER = '?v=20261120c';
	const W = 1280;
	const H = 720;
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
	const MONO = '"JetBrains Mono","SF Mono",Menlo,Consolas,monospace';

	// Board entities per skin. id = primary stage; aka = stages that fold into the same item.
	const LAB = [
		{ id: 'dns', aka: ['fields', 'https', 'open'], kind: 'rack' },
		{ id: 'robots', kind: 'doc' },
		{ id: 'crawl', aka: ['pages'], kind: 'glass' },
		{ id: 'browser', kind: 'screen' },
		{ id: 'axe', kind: 'hammer' },
		{ id: 'security', kind: 'shield' },
		{ id: 'a11y', kind: 'bot' },
		{ id: 'malware', kind: 'radar' },
		{ id: 'webrisk', kind: 'target' },
		{ id: 'blocklist', kind: 'list' },
		{ id: 'lookalike', kind: 'mirror' },
		{ id: 'wordpress', kind: 'wp' },
		{ id: 'mail', kind: 'mail' },
		{ id: 'lighthouse', aka: ['psi-ask'], kind: 'tower' },
		{ id: 'cases', kind: 'cases' },
		{ id: 'score', kind: 'chart' },
		{ id: 'sign', kind: 'sign' },
		{ id: 'save', kind: 'send' },
	];
	const CONSOLE = [
		{ id: 'fields', kind: 'form' },
		{ id: 'https', aka: ['open'], kind: 'lock' },
		{ id: 'dns', kind: 'hammer' },
		{ id: 'robots', kind: 'bot' },
		{ id: 'crawl', aka: ['pages'], kind: 'gear' },
		{ id: 'browser', kind: 'globe' },
		{ id: 'axe', aka: ['a11y'], kind: 'hammer' },
		{ id: 'webrisk', aka: ['security', 'malware', 'blocklist'], kind: 'target' },
		{ id: 'lookalike', kind: 'mail' },
		{ id: 'wordpress', kind: 'cube' },
		{ id: 'mail', kind: 'globe' },
		{ id: 'lighthouse', aka: ['psi-ask'], kind: 'spark' },
		{ id: 'cases', kind: 'wp' },
		{ id: 'score', kind: 'rocket' },
		{ id: 'sign', kind: 'pen' },
		{ id: 'save', kind: 'send' },
	];
	const BACKGROUND = { https: 1, dns: 1, robots: 1, webrisk: 1, lookalike: 1, wordpress: 1, mail: 1, lighthouse: 1 };
	const HAZARD_OF = { timeout: 'timeout', stop: 'stop', fail: 'fail', slow: 'slow' };
	const COLOR = { idle: '#3a4a55', wip: '#5ec8d4', done: '#5dff9a', fail: '#ff5a4a', skip: '#8aa0aa', risk: '#f0c85a' };
	const PRIORITY = ['wip', 'fail', 'risk'];

	function facts() {
		return (
			window.ReviewArenaFacts || {
				STAGES: [],
				matchFact: function () {
					return null;
				},
				STATUS_COLOR: COLOR,
			}
		);
	}
	function motionLib() {
		return window.ReviewArenaMotion;
	}

	const state = {
		skin: pickSkin(),
		run: 'idle',
		pose: 'work',
		anomaly: '',
		anomalyAt: 0,
		stages: {},
		activeId: '',
		log: [],
		wrap: null,
		canvas: null,
		ctx: null,
		scale: 1,
		ents: [],
		bays: {},
		parts: [],
		tokens: [],
		events: [],
		assets: null,
		atlas: null,
		t0: performance.now(),
		last: 0,
		frame: 0,
		visible: true,
		lastDone: -1,
		hudPct: 0,
		celebrate: 0,
		host: '',
		seq: 0,
		cons: null,
		buildId: 0,
	};

	function pickSkin() {
		try {
			let skin = sessionStorage.getItem(SKIN_KEY);
			if (skin !== 'lab' && skin !== 'console') {
				skin = Math.random() < 0.5 ? 'lab' : 'console';
				sessionStorage.setItem(SKIN_KEY, skin);
			}
			return skin;
		} catch (e) {
			return Math.random() < 0.5 ? 'lab' : 'console';
		}
	}

	const now = function () {
		return (performance.now() - state.t0) / 1000;
	};
	const clamp = function (v, a, b) {
		return Math.max(a, Math.min(b, v));
	};
	const hash = function (n) {
		const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
		return x - Math.floor(x);
	};

	// ---------------------------------------------------------------- state from facts
	function boardMap() {
		return state.skin === 'console' ? CONSOLE : LAB;
	}

	function mark(id, status) {
		if (!id) return;
		const prev = state.stages[id];
		if (prev === 'fail' && status !== 'fail') return;
		if (status === 'wip' || status === 'active') {
			state.stages[id] = 'wip';
			state.activeId = id;
			return;
		}
		state.stages[id] = status === 'pass' ? 'done' : status;
	}

	function derive(def) {
		const ids = [def.id].concat(def.aka || []);
		const sts = ids.map(function (id) {
			return state.stages[id] || 'idle';
		});
		for (let i = 0; i < PRIORITY.length; i++) if (sts.indexOf(PRIORITY[i]) >= 0) return PRIORITY[i];
		const own = sts[0];
		if (own !== 'idle') return own;
		return sts.some(function (s) {
			return s !== 'idle';
		})
			? 'wip'
			: 'idle';
	}

	function stationOf(stageId) {
		const map = boardMap();
		for (let i = 0; i < map.length; i++) {
			if (map[i].id === stageId || (map[i].aka || []).indexOf(stageId) >= 0) return i;
		}
		return -1;
	}

	function setAnomaly(id) {
		id = id || '';
		if (id === state.anomaly) return;
		state.anomaly = id;
		state.anomalyAt = now();
		if (id && state.ents.length && state.ctx) {
			const from = stationOf(state.activeId);
			if (from >= 0) launchToken(entCenter(state.ents[from]), anomalyTarget(id), BAYC(id));
		}
	}

	function BAYC(id) {
		return (motionLib().BAY_COLOR || {})[id] || '#ff9a4a';
	}

	function setPose(pose) {
		state.pose = pose || 'work';
	}

	function applyFact(fact) {
		if (!fact) return;
		if (fact.pass)
			fact.pass.forEach(function (id) {
				mark(id, 'done');
			});
		if (fact.stages)
			fact.stages.forEach(function (id) {
				mark(id, fact.status || 'wip');
			});
		if (fact.stage) mark(fact.stage, fact.status || 'wip');
		if (fact.anomaly) setAnomaly(fact.anomaly);
		else if ((fact.status === 'done' || fact.status === 'wip') && state.anomaly === 'slow' && fact.pose !== 'slow')
			setAnomaly('');
		setPose(fact.pose || (state.anomaly === 'slow' ? 'slow' : 'work'));
	}

	function pushLog(text, fact) {
		const d = new Date();
		const pad = function (n) {
			return String(n).padStart(2, '0');
		};
		const stage = fact && (fact.stage || (fact.stages && fact.stages[0]));
		const def = (facts().STAGES || []).find(function (s) {
			return s.id === stage;
		});
		const prog = window.ReviewProgress;
		const shown = prog && prog.translate ? prog.translate(text) : text;
		state.log.push({
			n: ++state.seq,
			stage: stage || '',
			anomaly: (fact && fact.anomaly) || '',
			raw: String(text || ''),
			time: pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()),
			tag: def ? def.label.toUpperCase() : fact && fact.anomaly ? fact.anomaly.toUpperCase() : 'LOG',
			text: String(shown || '').replace(/\s+/g, ' '),
			status: (fact && fact.status) || (fact && fact.anomaly ? 'risk' : 'wip'),
			at: now(),
		});
		if (state.log.length > 300) state.log.shift();
	}

	function line(text) {
		if (state.run !== 'running' && state.run !== 'stopping') return;
		const fact = facts().matchFact(text);
		if (/^Stop requested/.test(String(text || ''))) state.run = 'stopping';
		pushLog(text, fact);
		if (fact) applyFact(fact);
		else if (!state.anomaly) setPose('work');
		syncEntities();
		pushConsole();
	}

	function quiet(on) {
		if (state.run !== 'running') return;
		if (on) {
			setAnomaly(state.anomaly || 'slow');
			setPose('slow');
			if (state.activeId) mark(state.activeId, 'wip');
		} else if (state.anomaly === 'slow') {
			setAnomaly('');
			setPose('work');
		}
		syncEntities();
		pushConsole();
	}

	function start(options) {
		state.skin = pickSkin();
		state.run = 'running';
		state.pose = 'work';
		state.anomaly = '';
		state.activeId = '';
		state.stages = {};
		state.log = [];
		state.seq = 0;
		state.host = String((options && options.host) || '').replace(/^https?:\/\//, '').split('/')[0];
		state.lastDone = -1;
		state.parts = [];
		state.tokens = [];
		state.events = [];
		(facts().STAGES || []).forEach(function (s) {
			state.stages[s.id] = 'idle';
		});
		const wrap = ensureMount();
		if (!wrap) return;
		build(wrap);
		wrap.hidden = false;
		wake();
	}

	function finish(status) {
		state.run = status === 'stopped' ? 'stopped' : 'ready';
		if (status === 'stopped') {
			setAnomaly('stop');
			setPose('stop');
			if (state.activeId) mark(state.activeId, 'fail');
		} else {
			(facts().STAGES || []).forEach(function (s) {
				const st = state.stages[s.id];
				if (st === 'wip' || st === 'idle' || st === 'active') state.stages[s.id] = 'done';
			});
			setAnomaly('');
			setPose('cheer');
			state.celebrate = now();
			if (state.ctx) {
				state.ents.forEach(function (e, i) {
					schedule(0.06 * i, function () {
						burst(entCenter(e), '#5dff9a', 10);
						ring(entCenter(e), '#5dff9a', 40);
					});
				});
			}
		}
		syncEntities();
		pushConsole();
		wake();
	}

	function fail() {
		state.run = 'failed';
		if (state.activeId) mark(state.activeId, 'fail');
		setAnomaly('fail');
		setPose('fail');
		syncEntities();
		pushConsole();
		wake();
	}

	function reset() {
		state.run = 'idle';
		state.stages = {};
		state.activeId = '';
		state.anomaly = '';
		cancelAnimationFrame(state.frame);
		state.frame = 0;
		if (state.wrap) {
			state.wrap.hidden = true;
			state.wrap.textContent = '';
		}
		state.canvas = null;
		state.ctx = null;
		state.ents = [];
		state.buildId++;
		dropConsole();
	}

	// ---------------------------------------------------------------- assets
	function loadImage(src) {
		return new Promise(function (resolve) {
			const img = new Image();
			img.onload = function () {
				resolve(img);
			};
			img.onerror = function () {
				resolve(null);
			};
			img.src = src;
		});
	}

	function loadAssets(skin) {
		const dir = BASE + skin + '/';
		const jobs = { clean: loadImage(dir + 'clean.jpg' + VER), items: loadImage(dir + 'items.png' + VER) };
		if (skin === 'lab') {
			['doctor', 'timeout', 'stop', 'retry', 'slow', 'fail'].forEach(function (n) {
				jobs['loop_' + n] = loadImage(dir + 'loop-' + n + '.webp' + VER);
			});
		}
		const keys = Object.keys(jobs);
		return Promise.all(
			keys.map(function (k) {
				return jobs[k];
			})
		).then(function (list) {
			const out = {};
			keys.forEach(function (k, i) {
				out[k] = list[i];
			});
			return out;
		});
	}

	// ---------------------------------------------------------------- mount
	function ensureMount() {
		const rp = document.querySelector('#run-panel .rp');
		if (!rp) return null;
		let wrap = rp.querySelector('.ra');
		if (wrap) return wrap;
		wrap = document.createElement('div');
		wrap.className = 'ra';
		wrap.setAttribute('aria-hidden', 'true');
		wrap.hidden = true;
		const stage = rp.querySelector('.rp-stage');
		if (stage && stage.nextSibling) rp.insertBefore(wrap, stage.nextSibling);
		else rp.appendChild(wrap);
		state.wrap = wrap;
		return wrap;
	}

	// ---------------------------------------------------------------- console skin
	function consoleModel() {
		return {
			run: state.run,
			pose: state.pose,
			anomaly: state.anomaly,
			anomalyAt: state.anomalyAt,
			activeId: state.activeId,
			stages: state.stages,
			log: state.log,
			host: state.host,
			ents: state.ents,
			now: now(),
		};
	}

	function loadConsole() {
		if (window.ReviewConsole) return Promise.resolve(window.ReviewConsole);
		if (state.consoleLoad) return state.consoleLoad;
		state.consoleLoad = new Promise(function (resolve) {
			const css = document.createElement('link');
			css.rel = 'preload';
			css.as = 'style';
			css.href = 'css/qa-review-console.css' + CONSOLE_VER;
			document.head.appendChild(css);
			const js = document.createElement('script');
			js.src = 'js/qa-review-console.js' + CONSOLE_VER;
			js.onload = function () {
				resolve(window.ReviewConsole || null);
			};
			js.onerror = function () {
				state.consoleLoad = null;
				resolve(null);
			};
			document.head.appendChild(js);
		});
		return state.consoleLoad;
	}

	function pushConsole() {
		if (state.cons) state.cons.sync();
	}

	function dropConsole() {
		if (state.cons) state.cons.destroy();
		state.cons = null;
		const panel = document.getElementById('run-panel');
		if (panel) panel.classList.remove('ra-console-on');
	}

	function buildConsole(wrap) {
		const id = state.buildId;
		const skin = state.skin;
		dropConsole();
		wrap.setAttribute('aria-hidden', 'true');
		wrap.removeAttribute('role');
		wrap.removeAttribute('aria-label');
		wrap.textContent = '';
		state.canvas = null;
		state.ctx = null;
		state.ents = buildEntities();
		const panel = document.getElementById('run-panel');
		if (panel) panel.classList.add('ra-console-on');
		loadConsole().then(function (C) {
			if (!C || id !== state.buildId || state.skin !== skin || state.run === 'idle') return;
			state.cons = C.mount(wrap, {
				model: consoleModel,
				hud: readHud,
				stages: facts().STAGES,
				skin: skin,
				css: 'css/qa-review-console.css' + CONSOLE_VER,
			});
			state.cons.sync();
		});
		if (!state.io && typeof IntersectionObserver === 'function') {
			state.io = new IntersectionObserver(function (list) {
				state.visible = list.some(function (x) {
					return x.isIntersecting;
				});
			});
			state.io.observe(wrap);
		}
	}

	function build(wrap) {
		const skin = state.skin;
		state.buildId++;
		state.atlas = (window.ReviewArenaAtlas || {})[skin];
		wrap.className = 'ra ra--' + skin;
		wrap.setAttribute('data-skin', skin);
		// Both skins are native HTML/SVG consoles now. Lab keeps its Lab Tries board; console keeps the arcade.
		buildConsole(wrap);
		state.wrap = wrap;
		if (!state.io && typeof IntersectionObserver === 'function') {
			state.io = new IntersectionObserver(function (list) {
				state.visible = list.some(function (x) {
					return x.isIntersecting;
				});
			});
			state.io.observe(wrap);
		}
	}

	function fit() {
		if (!state.canvas) return;
		const css = state.canvas.getBoundingClientRect().width || W;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const px = clamp(Math.round(css * dpr), 640, 1920);
		if (state.canvas.width !== px) {
			state.canvas.width = px;
			state.canvas.height = Math.round((px * H) / W);
		}
		state.scale = state.canvas.width / W;
		state.big = css < 760; // phones: larger log type, fewer rows
	}

	function buildEntities() {
		const map = boardMap();
		if (state.skin === 'lab') {
			return map.map(function (def, i) {
				return { i: i, lane: 0, def: def, status: 'idle', since: -9 };
			});
		}
		const out = [];
		for (let lane = 0; lane < 3; lane++) {
			map.forEach(function (def, i) {
				out.push({ i: i, lane: lane, def: def, status: 'idle', since: -9 });
			});
		}
		return out;
	}

	function entCenter(e) {
		return { x: e.rect[0] + (e.rect[2] - e.rect[0]) / 2, y: e.rect[1] + (e.rect[3] - e.rect[1]) / 2 };
	}

	function anomalyTarget(id) {
		const A = state.atlas;
		if (!A) return { x: 640, y: 400 };
		if (state.skin === 'lab' && A.bays && A.bays[id]) {
			const b = A.bays[id];
			return { x: (b[0] + b[2]) / 2, y: b[1] + 20 };
		}
		const hz = (A.hazard || []).find(function (h) {
			return h.id === (HAZARD_OF[id] || 'fail');
		});
		return hz ? { x: hz.cx, y: hz.cy } : { x: 640, y: 400 };
	}

	// status each entity shows (per lane on the console)
	function statusOfEntity(e) {
		const base = derive(e.def);
		if (state.skin !== 'console' || e.lane === 0) return base;
		if (e.lane === 1) return BACKGROUND[e.def.id] ? base : 'idle';
		return base === 'fail' || base === 'risk' || base === 'skip' ? base : 'idle';
	}

	function syncEntities() {
		const t = now();
		state.ents.forEach(function (e) {
			const st = statusOfEntity(e);
			if (st === e.status) return;
			const prev = e.status;
			e.status = st;
			e.since = t;
			if (state.cons || !state.ctx) return; // the console reads the statuses and animates them itself
			const c = entCenter(e);
			if (st === 'done') {
				burst(c, '#5dff9a', 9);
				ring(c, '#5dff9a', 36);
				if (e.lane === 0) state.lastDone = e.i;
			} else if (st === 'fail') {
				for (let k = 0; k < 6; k++) smoke(c.x + (hash(k + e.i) - 0.5) * 20, c.y - 10);
				glyph(c.x, c.y - 30, '✕', '#ff5a4a');
			} else if (st === 'risk') {
				glyph(c.x, c.y - 30, '!', '#f0c85a');
			} else if (st === 'wip' && e.lane === 0) {
				if (prev === 'idle' && state.lastDone >= 0 && state.lastDone !== e.i && state.ents[state.lastDone]) {
					launchToken(entCenter(state.ents[state.lastDone]), c, '#5ec8d4');
				}
				ring(c, '#5ec8d4', 30);
			}
		});
	}

	// ---------------------------------------------------------------- particles / tokens
	function burst(c, color, n) {
		for (let k = 0; k < n; k++) {
			const a = (k / n) * Math.PI * 2 + hash(k + c.x) * 0.5;
			const sp = 40 + hash(k * 3 + c.y) * 60;
			state.parts.push({
				k: 'dot',
				x: c.x,
				y: c.y,
				vx: Math.cos(a) * sp,
				vy: Math.sin(a) * sp - 20,
				g: 90,
				life: 0,
				max: 0.6 + hash(k) * 0.3,
				r: 2.2,
				c: color,
			});
		}
	}
	function ring(c, color, r) {
		state.parts.push({ k: 'ring', x: c.x, y: c.y, life: 0, max: 0.7, r: r, c: color });
	}
	function smoke(x, y) {
		state.parts.push({
			k: 'smoke',
			x: x,
			y: y,
			vx: (hash(x) - 0.5) * 12,
			vy: -22 - hash(y) * 14,
			life: 0,
			max: 1.4,
			r: 5,
			c: '#7a8a94',
		});
	}
	function glyph(x, y, ch, color) {
		state.parts.push({ k: 'glyph', x: x, y: y, vy: -18, life: 0, max: 1.4, ch: ch, c: color });
	}
	function spark(x, y, color, vx, vy, max) {
		state.parts.push({ k: 'dot', x: x, y: y, vx: vx, vy: vy, g: 0, life: 0, max: max || 0.8, r: 1.8, c: color });
	}
	function launchToken(a, b, color) {
		state.tokens.push({ a: a, b: b, color: color, t0: now(), dur: 0.55 + Math.hypot(b.x - a.x, b.y - a.y) / 1400 });
	}
	function schedule(delay, fn) {
		state.events.push({ at: now() + delay, fn: fn });
	}

	function stepParticles(dt) {
		const t = now();
		state.events = state.events.filter(function (ev) {
			if (t >= ev.at) {
				ev.fn();
				return false;
			}
			return true;
		});
		state.parts = state.parts.filter(function (p) {
			p.life += dt;
			if (p.k === 'dot' || p.k === 'smoke') {
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				if (p.g) p.vy += p.g * dt;
			} else if (p.k === 'glyph') {
				p.y += p.vy * dt;
			}
			return p.life < p.max;
		});
		state.tokens = state.tokens.filter(function (tk) {
			const u = (t - tk.t0) / tk.dur;
			if (u >= 1) {
				ring(tk.b, tk.color, 22);
				return false;
			}
			const pt = tokenPos(tk, u);
			if (!reduced.matches) spark(pt.x, pt.y, tk.color, (hash(t * 7) - 0.5) * 16, (hash(t * 13) - 0.5) * 16, 0.4);
			return true;
		});
	}

	function tokenPos(tk, u) {
		const e = u * u * (3 - 2 * u);
		const mx = (tk.a.x + tk.b.x) / 2;
		const my = Math.min(tk.a.y, tk.b.y) - 46 - Math.abs(tk.a.x - tk.b.x) * 0.08;
		const x = (1 - e) * (1 - e) * tk.a.x + 2 * (1 - e) * e * mx + e * e * tk.b.x;
		const y = (1 - e) * (1 - e) * tk.a.y + 2 * (1 - e) * e * my + e * e * tk.b.y;
		return { x: x, y: y };
	}

	function drawParticles(ctx) {
		state.parts.forEach(function (p) {
			const u = p.life / p.max;
			ctx.save();
			if (p.k === 'dot') {
				ctx.globalAlpha = 1 - u;
				ctx.fillStyle = p.c;
				ctx.shadowColor = p.c;
				ctx.shadowBlur = 6;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.r * (1 - u * 0.5), 0, 6.283);
				ctx.fill();
			} else if (p.k === 'ring') {
				ctx.globalAlpha = (1 - u) * 0.9;
				ctx.strokeStyle = p.c;
				ctx.lineWidth = 2;
				ctx.shadowColor = p.c;
				ctx.shadowBlur = 8;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.r * (0.3 + u * 0.9), 0, 6.283);
				ctx.stroke();
			} else if (p.k === 'smoke') {
				ctx.globalAlpha = (1 - u) * 0.5;
				ctx.fillStyle = p.c;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.r * (1 + u * 2.2), 0, 6.283);
				ctx.fill();
			} else if (p.k === 'glyph') {
				ctx.globalAlpha = u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8;
				ctx.fillStyle = p.c;
				ctx.shadowColor = p.c;
				ctx.shadowBlur = 8;
				ctx.font = '700 20px ' + MONO;
				ctx.textAlign = 'center';
				ctx.fillText(p.ch, p.x, p.y);
			}
			ctx.restore();
		});
		const t = now();
		state.tokens.forEach(function (tk) {
			const pt = tokenPos(tk, clamp((t - tk.t0) / tk.dur, 0, 1));
			ctx.save();
			ctx.fillStyle = '#fff';
			ctx.shadowColor = tk.color;
			ctx.shadowBlur = 14;
			ctx.beginPath();
			ctx.arc(pt.x, pt.y, 4, 0, 6.283);
			ctx.fill();
			ctx.restore();
		});
	}

	// ---------------------------------------------------------------- drawing helpers
	const scratch = document.createElement('canvas');
	scratch.width = scratch.height = 160;
	const sctx = scratch.getContext('2d');

	function rrect(ctx, x, y, w, h, r) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + w, y, x + w, y + h, r);
		ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r);
		ctx.arcTo(x, y, x + w, y, r);
		ctx.closePath();
	}

	function pivotOf(kind, w, h) {
		const k = (motionLib().KINDS[kind] || {}).pivot;
		if (k === 'center') return [w / 2, h / 2];
		if (k === 'bl') return [w * 0.15, h * 0.9];
		return [w / 2, h];
	}

	// Clipped effects: drawn on the scratch canvas, masked by the item's own alpha, added on top.
	function clippedFx(ctx, e, kind, t, sw, sh) {
		const fx = (motionLib().KINDS[kind] || {}).fx || [];
		const used = fx.filter(function (f) {
			return f === 'scan' || f === 'glint' || f === 'rows' || f === 'leds' || f === 'load';
		});
		if (!used.length) return null;
		sctx.setTransform(1, 0, 0, 1, 0, 0);
		sctx.clearRect(0, 0, 160, 160);
		sctx.globalCompositeOperation = 'source-over';
		const tt = t + e.phase;
		used.forEach(function (f) {
			if (f === 'scan') {
				const y = ((tt * 0.9) % 1) * sh;
				const g = sctx.createLinearGradient(0, y - 7, 0, y + 7);
				g.addColorStop(0, 'rgba(160,255,255,0)');
				g.addColorStop(0.5, 'rgba(190,255,255,.95)');
				g.addColorStop(1, 'rgba(160,255,255,0)');
				sctx.fillStyle = g;
				sctx.fillRect(0, y - 7, sw, 14);
			} else if (f === 'glint') {
				const bx = ((tt * 0.6) % 1.7) * sw * 1.5 - sw * 0.4;
				sctx.fillStyle = 'rgba(255,255,255,.75)';
				sctx.beginPath();
				sctx.moveTo(bx, 0);
				sctx.lineTo(bx + 9, 0);
				sctx.lineTo(bx - 9 + sh * 0.5, sh);
				sctx.lineTo(bx - 18 + sh * 0.5, sh);
				sctx.closePath();
				sctx.fill();
			} else if (f === 'rows') {
				const act = Math.floor(tt * 6) % 5;
				for (let r = 0; r < 5; r++) {
					sctx.fillStyle = r === act ? 'rgba(120,255,200,.9)' : 'rgba(94,200,212,.28)';
					sctx.fillRect(sw * 0.3, sh * (0.2 + r * 0.14), sw * 0.42, 3);
				}
			} else if (f === 'leds') {
				for (let r = 0; r < 6; r++) {
					const on = hash(Math.floor(tt * 7) + r * 3.1 + e.i) > 0.4;
					sctx.fillStyle = on ? (r % 2 ? 'rgba(255,200,90,.95)' : 'rgba(110,255,170,.95)') : 'rgba(50,70,80,.0)';
					sctx.fillRect(sw * 0.22, sh * (0.18 + r * 0.1), 5, 3);
				}
			} else if (f === 'load') {
				const p = (tt * 0.5) % 1;
				sctx.fillStyle = 'rgba(150,255,255,.9)';
				sctx.fillRect(sw * 0.2, sh * 0.78, sw * 0.6 * p, 3);
			}
		});
		sctx.globalCompositeOperation = 'destination-in';
		sctx.drawImage(state.assets.items, e.sprite[0], e.sprite[1], e.sprite[2], e.sprite[3], 0, 0, sw, sh);
		return scratch;
	}

	function tintFx(e, color, alpha, sw, sh) {
		sctx.setTransform(1, 0, 0, 1, 0, 0);
		sctx.clearRect(0, 0, 160, 160);
		sctx.globalCompositeOperation = 'source-over';
		sctx.globalAlpha = alpha;
		sctx.fillStyle = color;
		sctx.fillRect(0, 0, sw, sh);
		sctx.globalAlpha = 1;
		sctx.globalCompositeOperation = 'destination-in';
		sctx.drawImage(state.assets.items, e.sprite[0], e.sprite[1], e.sprite[2], e.sprite[3], 0, 0, sw, sh);
		return scratch;
	}

	function drawEntity(ctx, e, t, opts) {
		const M = motionLib();
		const kind = e.def.kind;
		const sw = e.sprite[2];
		const sh = e.sprite[3];
		const age = Math.max(0, t - e.since);
		const o = M.pose(kind, e.status, reduced.matches ? 0 : t, age, e.phase);
		const piv = pivotOf(kind, sw, sh);
		const x0 = e.rect[0];
		const y0 = e.rect[1];
		let alpha = o.a * (opts && opts.alpha != null ? opts.alpha : 1);
		const glow = M.GLOW[e.status];
		ctx.save();
		ctx.translate(x0 + piv[0] + o.x, y0 + piv[1] + o.y);
		ctx.rotate(o.r);
		ctx.scale(o.sx, o.sy);
		ctx.translate(-piv[0], -piv[1]);
		ctx.globalAlpha = alpha;
		if (glow) {
			const calm = e.status === 'done' ? clamp(1 - age / 2.5, 0.25, 1) : 1;
			ctx.shadowColor = glow;
			ctx.shadowBlur =
				(e.status === 'wip' ? 10 + 4 * Math.sin(t * 6) : e.status === 'fail' ? 9 + 6 * Math.sin(t * 22) : 10) * calm;
		}
		ctx.drawImage(state.assets.items, e.sprite[0], e.sprite[1], sw, sh, 0, 0, sw, sh);
		ctx.shadowBlur = 0;
		ctx.shadowColor = 'transparent';
		if (e.status === 'wip' && !reduced.matches) {
			const cl = clippedFx(ctx, e, kind, t, sw, sh);
			if (cl) {
				ctx.globalCompositeOperation = 'lighter';
				ctx.globalAlpha = 0.9;
				ctx.drawImage(cl, 0, 0);
			}
		} else if (e.status === 'fail') {
			ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 14);
			ctx.drawImage(tintFx(e, '#ff3a2a', 0.7, sw, sh), 0, 0);
		} else if (e.status === 'risk') {
			ctx.globalAlpha = 0.3 + 0.15 * Math.sin(t * 6);
			ctx.drawImage(tintFx(e, '#ffc83a', 0.7, sw, sh), 0, 0);
		} else if (e.status === 'done' && age < 0.35) {
			ctx.globalCompositeOperation = 'lighter';
			ctx.globalAlpha = 0.8 * (1 - age / 0.35);
			ctx.drawImage(tintFx(e, '#ffffff', 0.9, sw, sh), 0, 0);
		}
		ctx.restore();
		if (e.status === 'wip' && !reduced.matches) worldFx(ctx, e, kind, t, age);
	}

	// Effects that live in the world around the item (not masked by its shape).
	function worldFx(ctx, e, kind, t, age) {
		const fx = (motionLib().KINDS[kind] || {}).fx || [];
		const c = entCenter(e);
		const tt = t + e.phase;
		const cycle = Math.floor((tt * 1000) / 900);
		fx.forEach(function (f) {
			if (f === 'rings' && cycle !== e.fx) {
				e.fx = cycle;
				ring(c, '#5ec8d4', 30);
			} else if (f === 'bits' && Math.floor(tt * 3) !== e.fxb) {
				e.fxb = Math.floor(tt * 3);
				spark(c.x, c.y, '#9fe8ff', (hash(e.fxb + e.i) - 0.5) * 60, -30 - hash(e.fxb) * 20, 0.8);
			} else if (f === 'rise' && Math.floor(tt * 8) !== e.fxr) {
				e.fxr = Math.floor(tt * 8);
				spark(c.x + (hash(e.fxr + e.i) - 0.5) * 40, e.rect[3] - 4, '#7affc0', 0, -34, 0.9);
			} else if (f === 'trail' && Math.floor(tt * 10) !== e.fxt) {
				e.fxt = Math.floor(tt * 10);
				spark(c.x - 12, c.y + 14, '#aef0ff', -10, 22, 0.5);
			} else if (f === 'strike') {
				const p = (tt * 2.2) % 1;
				const id = Math.floor(tt * 2.2);
				if (p > 0.66 && id !== e.fxs) {
					e.fxs = id;
					for (let k = 0; k < 6; k++)
						spark(c.x + 8, e.rect[3] - 6, '#ffd36a', (k - 2.5) * 28, -30 - hash(k + id) * 40, 0.5);
				}
			} else if (f === 'dots') {
				ctx.save();
				ctx.fillStyle = '#bff';
				ctx.shadowColor = '#5ec8d4';
				ctx.shadowBlur = 6;
				for (let k = 0; k < 3; k++) {
					ctx.globalAlpha = 0.5 + 0.5 * Math.sin(tt * 7 - k * 0.9);
					ctx.beginPath();
					ctx.arc(c.x - 8 + k * 8, e.rect[1] - 6 - Math.max(0, Math.sin(tt * 7 - k * 0.9)) * 3, 2, 0, 6.283);
					ctx.fill();
				}
				ctx.restore();
			} else if (f === 'sweep') {
				const a = tt * 4;
				ctx.save();
				ctx.translate(c.x, c.y);
				ctx.rotate(a);
				const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
				g.addColorStop(0, 'rgba(120,255,200,.45)');
				g.addColorStop(1, 'rgba(120,255,200,0)');
				ctx.fillStyle = g;
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.arc(0, 0, 40, -0.5, 0.1);
				ctx.closePath();
				ctx.fill();
				ctx.restore();
			} else if (f === 'lock') {
				const k = 1 - ((tt * 1.4) % 1);
				const s = 16 + 14 * k;
				ctx.save();
				ctx.strokeStyle = '#7affc0';
				ctx.shadowColor = '#7affc0';
				ctx.shadowBlur = 6;
				ctx.lineWidth = 2;
				ctx.globalAlpha = 0.9;
				[
					[-1, -1],
					[1, -1],
					[-1, 1],
					[1, 1],
				].forEach(function (q) {
					ctx.beginPath();
					ctx.moveTo(c.x + q[0] * s, c.y + q[1] * (s - 7));
					ctx.lineTo(c.x + q[0] * s, c.y + q[1] * s);
					ctx.lineTo(c.x + q[0] * (s - 7), c.y + q[1] * s);
					ctx.stroke();
				});
				ctx.restore();
			} else if (f === 'beam') {
				const lamp = { x: c.x, y: e.rect[1] + 10 };
				const a = Math.sin(tt * 2) * 0.9;
				ctx.save();
				ctx.translate(lamp.x, lamp.y);
				ctx.rotate(a);
				const g = ctx.createLinearGradient(0, 0, 70, 0);
				g.addColorStop(0, 'rgba(255,246,190,.7)');
				g.addColorStop(1, 'rgba(255,246,190,0)');
				ctx.fillStyle = g;
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.lineTo(70, -12);
				ctx.lineTo(70, 12);
				ctx.closePath();
				ctx.fill();
				ctx.rotate(Math.PI);
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.lineTo(70, -12);
				ctx.lineTo(70, 12);
				ctx.closePath();
				ctx.fill();
				ctx.restore();
			} else if (f === 'sig') {
				const p = clamp(((tt * 0.8) % 1.3) / 1, 0, 1);
				ctx.save();
				ctx.strokeStyle = '#9fe8ff';
				ctx.shadowColor = '#5ec8d4';
				ctx.shadowBlur = 5;
				ctx.lineWidth = 1.6;
				ctx.beginPath();
				const bx = e.rect[0] + 10;
				const by = e.rect[3] + 4;
				const n = Math.floor(p * 30);
				for (let k = 0; k <= n; k++) {
					const u = k / 30;
					const px = bx + u * (e.rect[2] - e.rect[0] - 20);
					const py = by + Math.sin(u * 17) * 4 * (1 - u * 0.4);
					if (k === 0) ctx.moveTo(px, py);
					else ctx.lineTo(px, py);
				}
				ctx.stroke();
				ctx.restore();
			} else if (f === 'flame') {
				ctx.save();
				const fl = 8 + 5 * Math.sin(tt * 30);
				const g = ctx.createLinearGradient(0, e.rect[3], 0, e.rect[3] + fl + 8);
				g.addColorStop(0, 'rgba(255,200,90,.9)');
				g.addColorStop(1, 'rgba(255,90,40,0)');
				ctx.fillStyle = g;
				ctx.beginPath();
				ctx.ellipse(c.x - 2, e.rect[3] + 2 + fl / 2, 4, fl, 0, 0, 6.283);
				ctx.fill();
				ctx.restore();
			}
		});
	}

	// ---------------------------------------------------------------- HUD
	function readHud() {
		const rp = document.querySelector('#run-panel .rp');
		const num = rp && rp.querySelector('.rp-num b');
		const phase = rp && rp.querySelector('.rp-phase');
		const clock = rp && rp.querySelector('.rp-clock');
		const pct = clamp(parseFloat(num && num.textContent) || 0, 0, 100);
		state.hudPct += (pct - state.hudPct) * 0.15;
		return {
			pct: pct,
			shown: state.hudPct,
			phase:
				((phase && phase.textContent) || '').trim() || (state.run === 'running' ? 'RUNNING' : state.run.toUpperCase()),
			clock: ((clock && clock.textContent) || '').trim() || '00:00',
		};
	}

	function runColor() {
		if (state.run === 'failed') return COLOR.fail;
		if (state.run === 'stopped' || state.run === 'stopping') return COLOR.risk;
		if (state.run === 'ready') return COLOR.done;
		return '#5ec8d4';
	}

	function fitText(ctx, text, maxW) {
		if (ctx.measureText(text).width <= maxW) return text;
		let s = text;
		while (s.length > 4 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
		return s + '…';
	}

	function drawLabHud(ctx, A, t) {
		const hud = readHud();
		const col = runColor();
		// pill + timer
		ctx.save();
		ctx.fillStyle = 'rgba(6,14,20,.95)';
		ctx.strokeStyle = 'rgba(94,200,212,.35)';
		ctx.lineWidth = 1.5;
		rrect(ctx, 1012, 18, 262, 36, 8);
		ctx.fill();
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(1148, 22);
		ctx.lineTo(1148, 50);
		ctx.stroke();
		ctx.fillStyle = col;
		ctx.shadowColor = col;
		ctx.shadowBlur = 8;
		ctx.globalAlpha = state.run === 'running' ? 0.6 + 0.4 * Math.sin(t * 5) : 1;
		ctx.beginPath();
		ctx.arc(1032, 36, 4.5, 0, 6.283);
		ctx.fill();
		ctx.globalAlpha = 1;
		ctx.shadowBlur = 0;
		ctx.fillStyle = col;
		ctx.font = '700 12px ' + MONO;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText(fitText(ctx, hud.phase.toUpperCase(), 98), 1046, 37);
		ctx.strokeStyle = '#9fe8ee';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.arc(1170, 36, 8, 0, 6.283);
		ctx.moveTo(1170, 31);
		ctx.lineTo(1170, 36);
		ctx.lineTo(1174, 38);
		ctx.stroke();
		ctx.fillStyle = '#cfe8ec';
		ctx.font = '700 14px ' + MONO;
		ctx.fillText(hud.clock, 1186, 37);
		// % tube
		const bx = 100,
			by = 77,
			bw = 1080,
			bh = 16;
		ctx.fillStyle = 'rgba(4,12,16,.95)';
		ctx.strokeStyle = 'rgba(94,200,212,.4)';
		rrect(ctx, bx, by, bw, bh, 8);
		ctx.fill();
		ctx.stroke();
		const fw = Math.max(0, ((bw - 4) * hud.shown) / 100);
		if (fw > 2) {
			const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
			g.addColorStop(0, '#0f7a86');
			g.addColorStop(1, state.run === 'failed' ? '#ff5a4a' : '#3fe0d0');
			ctx.save();
			rrect(ctx, bx + 2, by + 2, bw - 4, bh - 4, 6);
			ctx.clip();
			ctx.fillStyle = g;
			ctx.fillRect(bx + 2, by + 2, fw, bh - 4);
			if (state.run === 'running') {
				const sh = ((t * 0.5) % 1.2) * fw;
				const sg = ctx.createLinearGradient(sh - 40, 0, sh, 0);
				sg.addColorStop(0, 'rgba(255,255,255,0)');
				sg.addColorStop(1, 'rgba(255,255,255,.4)');
				ctx.fillStyle = sg;
				ctx.fillRect(bx + 2, by + 2, fw, bh - 4);
			}
			ctx.restore();
		}
		ctx.strokeStyle = 'rgba(94,200,212,.4)';
		ctx.fillStyle = 'rgba(4,12,16,.95)';
		rrect(ctx, 1192, 74, 80, 22, 6);
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = '#cfe8ec';
		ctx.textAlign = 'center';
		ctx.font = '700 14px ' + MONO;
		ctx.fillText(Math.round(hud.shown) + '%', 1232, 86);
		ctx.restore();
		drawLabLog(ctx, A, t);
	}

	function logColor(st) {
		return st === 'done'
			? '#7affb0'
			: st === 'fail'
				? '#ff8a7e'
				: st === 'risk'
					? '#f0d070'
					: st === 'skip'
						? '#9fb0b8'
						: '#9fe8ee';
	}

	function drawLabLog(ctx, A, t) {
		ctx.save();
		const big = !!state.big;
		const step = big ? 29 : 17.5;
		ctx.font = '500 ' + (big ? 22 : 14) + 'px ' + MONO;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left';
		const rows = state.log.slice(big ? -7 : -12);
		rows.forEach(function (r, i) {
			const y = 500 + i * step + step / 2;
			const fresh = clamp((t - r.at) / 0.3, 0, 1);
			ctx.globalAlpha = 0.45 + 0.55 * fresh;
			ctx.fillStyle = '#3fe0c0';
			if (big) {
				ctx.fillText(fitText(ctx, '[' + r.tag + ']', 190), 24, y);
				ctx.fillStyle = logColor(r.status);
				ctx.fillText(fitText(ctx, r.text, 1000), 224 - (1 - fresh) * 12, y);
			} else {
				ctx.fillStyle = '#6f8a92';
				ctx.fillText(r.time, 24, y);
				ctx.fillStyle = '#3fe0c0';
				ctx.fillText('[' + r.tag + ']', 108, y);
				ctx.fillStyle = logColor(r.status);
				ctx.fillText(fitText(ctx, r.text, 940), 262 - (1 - fresh) * 12, y);
			}
		});
		if (state.run === 'running' && Math.floor(t * 2) % 2 === 0) {
			ctx.globalAlpha = 1;
			ctx.fillStyle = '#3fe0c0';
			ctx.fillRect(24, 500 + rows.length * step + 3, 8, step * 0.6);
		}
		ctx.restore();
	}

	// ---------------------------------------------------------------- Lab board
	function drawTick(ctx, e, t) {
		const b = e.box;
		const cx = (b[0] + b[2]) / 2;
		const cy = (b[1] + b[3]) / 2;
		const age = Math.max(0, t - e.since);
		const st = e.status;
		ctx.save();
		if (st !== 'idle') {
			ctx.strokeStyle = COLOR[st];
			ctx.shadowColor = COLOR[st];
			ctx.shadowBlur = st === 'wip' ? 6 + 4 * Math.sin(t * 6) : st === 'done' ? 12 * clamp(1 - age / 2.5, 0.3, 1) : 8;
			ctx.lineWidth = 2;
			ctx.globalAlpha = st === 'skip' ? 0.5 : 0.9;
			rrect(ctx, b[0] + 1, b[1] + 1, b[2] - b[0] - 2, b[3] - b[1] - 2, 9);
			ctx.stroke();
		}
		ctx.shadowBlur = 0;
		ctx.translate(cx, b[3] - 16);
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		if (st === 'wip') {
			ctx.strokeStyle = COLOR.wip;
			ctx.lineWidth = 3;
			ctx.shadowColor = COLOR.wip;
			ctx.shadowBlur = 6;
			const a = t * 6;
			ctx.beginPath();
			ctx.arc(0, 0, 9, a, a + 4.2);
			ctx.stroke();
		} else if (st === 'done') {
			const p = clamp(age / 0.28, 0, 1);
			ctx.strokeStyle = COLOR.done;
			ctx.lineWidth = 3.4;
			ctx.shadowColor = COLOR.done;
			ctx.shadowBlur = 12 * clamp(1 - age / 2.5, 0.35, 1);
			ctx.scale(1 + 0.3 * Math.exp(-age * 6) * Math.cos(age * 16), 1 + 0.3 * Math.exp(-age * 6) * Math.cos(age * 16));
			const pts = [
				[-9, 0],
				[-3, 7],
				[10, -8],
			];
			ctx.beginPath();
			ctx.moveTo(pts[0][0], pts[0][1]);
			if (p < 0.5) {
				const q = p / 0.5;
				ctx.lineTo(pts[0][0] + (pts[1][0] - pts[0][0]) * q, pts[0][1] + (pts[1][1] - pts[0][1]) * q);
			} else {
				const q = (p - 0.5) / 0.5;
				ctx.lineTo(pts[1][0], pts[1][1]);
				ctx.lineTo(pts[1][0] + (pts[2][0] - pts[1][0]) * q, pts[1][1] + (pts[2][1] - pts[1][1]) * q);
			}
			ctx.stroke();
		} else if (st === 'fail') {
			ctx.strokeStyle = COLOR.fail;
			ctx.lineWidth = 3.4;
			ctx.shadowColor = COLOR.fail;
			ctx.shadowBlur = 8;
			ctx.translate(Math.sin(age * 60) * 2 * Math.exp(-age * 4), 0);
			ctx.beginPath();
			ctx.moveTo(-8, -8);
			ctx.lineTo(8, 8);
			ctx.moveTo(8, -8);
			ctx.lineTo(-8, 8);
			ctx.stroke();
		} else if (st === 'risk') {
			ctx.fillStyle = COLOR.risk;
			ctx.shadowColor = COLOR.risk;
			ctx.shadowBlur = 8;
			ctx.font = '800 22px ' + MONO;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('!', 0, 1);
		} else if (st === 'skip') {
			ctx.strokeStyle = COLOR.skip;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.moveTo(-8, 0);
			ctx.lineTo(8, 0);
			ctx.stroke();
		}
		ctx.restore();
	}

	function drawConnector(ctx, e, t) {
		const x = e.conn[0];
		const y0 = e.conn[1];
		const y1 = e.conn[2];
		const st = e.status;
		const col = COLOR[st];
		ctx.save();
		ctx.strokeStyle = col;
		ctx.lineWidth = 1.6;
		ctx.globalAlpha = st === 'idle' ? 0.35 : st === 'skip' ? 0.4 : 0.85;
		ctx.setLineDash(st === 'done' ? [] : [3, 4]);
		if (st === 'fail' && Math.floor(t * 8) % 2) ctx.globalAlpha = 0.25;
		if (st === 'wip') ctx.lineDashOffset = -t * 30;
		ctx.beginPath();
		ctx.moveTo(x, y0);
		ctx.lineTo(x, y1);
		ctx.stroke();
		ctx.setLineDash([]);
		if (st === 'wip') {
			// evidence beads travel from the item up to its tick box
			for (let k = 0; k < 3; k++) {
				const u = (t * 1.3 + k / 3 + e.phase) % 1;
				ctx.globalAlpha = Math.sin(u * 3.14);
				ctx.fillStyle = '#bff';
				ctx.shadowColor = col;
				ctx.shadowBlur = 8;
				ctx.beginPath();
				ctx.arc(x, y1 - (y1 - y0) * u, 2.4, 0, 6.283);
				ctx.fill();
			}
		} else if (st === 'done') {
			ctx.shadowColor = col;
			ctx.shadowBlur = 8;
			ctx.globalAlpha = clamp(1 - (t - e.since) / 1.5, 0.45, 1);
			ctx.beginPath();
			ctx.moveTo(x, y0);
			ctx.lineTo(x, y1);
			ctx.stroke();
		}
		ctx.restore();
	}

	function frameOf(loop, frames, fps, tsec, rate) {
		return Math.floor(tsec * fps * rate) % frames;
	}

	function drawDoctor(ctx, A, t) {
		const img = state.assets.loop_doctor;
		if (!img) return;
		const M = motionLib();
		const d = M.DOCTOR[state.pose] || M.DOCTOR.work;
		const w = A.loops.doctor.w;
		const h = A.loops.doctor.h;
		state.docT = (state.docT || 0) + (state.dt || 0) * d.rate;
		const f = reduced.matches ? 0 : frameOf(img, A.loop.frames, A.loop.fps, state.docT, 1);
		const x = A.doctor[0];
		const y = A.doctor[1] + d.y;
		ctx.save();
		if (d.tint) {
			ctx.shadowColor = d.tint;
			ctx.shadowBlur = 12;
		}
		ctx.drawImage(img, f * w, 0, w, h, x, y, w, h);
		ctx.restore();
		if (d.bubble) {
			ctx.save();
			ctx.fillStyle = 'rgba(6,14,20,.92)';
			ctx.strokeStyle = d.tint || '#5ec8d4';
			ctx.lineWidth = 1.5;
			rrect(ctx, x + w - 18, y - 4, 30, 24, 8);
			ctx.fill();
			ctx.stroke();
			ctx.fillStyle = d.tint || '#5ec8d4';
			ctx.font = '700 15px ' + MONO;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(d.bubble, x + w - 3, y + 8);
			ctx.restore();
		}
		// inspection beam: doctor → the item being checked
		const act = stationOf(state.activeId);
		if (act >= 0 && state.run === 'running' && !reduced.matches) {
			const e = state.ents[act];
			const from = { x: x + w - 20, y: y + 24 };
			const to = { x: e.cx, y: 302 };
			ctx.save();
			ctx.strokeStyle = '#5ec8d4';
			ctx.shadowColor = '#5ec8d4';
			ctx.shadowBlur = 6;
			ctx.globalAlpha = 0.55;
			ctx.lineWidth = 1.4;
			ctx.setLineDash([2, 6]);
			ctx.lineDashOffset = -t * 40;
			ctx.beginPath();
			ctx.moveTo(from.x, from.y);
			ctx.quadraticCurveTo((from.x + to.x) / 2, 305, to.x, to.y);
			ctx.stroke();
			ctx.restore();
		}
	}

	function drawBays(ctx, A, t, dt) {
		const M = motionLib();
		Object.keys(A.bays).forEach(function (id) {
			const img = state.assets['loop_' + id];
			if (!img) return;
			const b = A.bays[id];
			const w = A.loops[id].w;
			const h = A.loops[id].h;
			const on = state.anomaly === id;
			let st = state.bays[id];
			if (!st) st = state.bays[id] = { a: 0.4, t: 0 };
			st.a += ((on ? 1 : 0.4) - st.a) * Math.min(1, dt * 7);
			if (on) st.t += dt;
			else st.t = 0;
			const f = on && !reduced.matches ? frameOf(img, A.loop.frames, A.loop.fps, st.t, 1) : 0;
			const age = on ? t - state.anomalyAt : 0;
			const shake = on ? Math.sin(age * 55) * 3 * Math.exp(-age * 4) : 0;
			ctx.save();
			ctx.globalAlpha = st.a;
			if (on) {
				ctx.shadowColor = M.BAY_COLOR[id];
				ctx.shadowBlur = 14 + 6 * Math.sin(t * 6);
			}
			ctx.drawImage(img, f * w, 0, w, h, b[0] + shake, b[1], w, h);
			ctx.restore();
		});
	}

	function drawLab(ctx, t, dt) {
		const A = state.atlas;
		state.ents.forEach(function (e) {
			drawConnector(ctx, e, t);
		});
		state.ents.forEach(function (e) {
			drawEntity(ctx, e, t, null);
		});
		state.ents.forEach(function (e) {
			drawTick(ctx, e, t);
		});
		drawDoctor(ctx, A, t);
		drawBays(ctx, A, t, dt);
		drawLabHud(ctx, A, t);
	}

	// ---------------------------------------------------------------- loop
	function render() {
		state.frame = 0;
		const ctx = state.ctx;
		if (!ctx || !state.assets || !state.assets.clean || !state.assets.items) return;
		const t = now();
		const dt = Math.min(0.1, state.last ? t - state.last : 0.016);
		state.last = t;
		state.dt = dt;
		stepParticles(dt);
		ctx.setTransform(state.scale, 0, 0, state.scale, 0, 0);
		ctx.globalAlpha = 1;
		ctx.clearRect(0, 0, W, H);
		ctx.drawImage(state.assets.clean, 0, 0, W, H);
		drawLab(ctx, t, dt);
		drawParticles(ctx);
		if (!reduced.matches && state.visible && !document.hidden && state.wrap && !state.wrap.hidden) {
			state.frame = requestAnimationFrame(render);
		}
	}

	function wake() {
		if (state.frame) return;
		state.frame = requestAnimationFrame(render);
	}

	document.addEventListener('visibilitychange', function () {
		if (!document.hidden) wake();
	});

	// ---------------------------------------------------------------- hook the real progress
	function hookProgress() {
		const prog = window.ReviewProgress;
		if (!prog || prog.__arenaHooked) return;
		const orig = { start: prog.start, line: prog.line, finish: prog.finish, fail: prog.fail, reset: prog.reset };
		prog.start = function (options) {
			start(options);
			return orig.start(options);
		};
		prog.line = function (text) {
			const out = orig.line(text);
			line(text);
			return out;
		};
		prog.finish = function (status) {
			finish(status);
			return orig.finish(status);
		};
		prog.fail = function () {
			fail();
			return orig.fail();
		};
		prog.reset = function () {
			reset();
			return orig.reset();
		};
		prog.__arenaHooked = true;
		const rp = document.querySelector('#run-panel .rp');
		if (rp && typeof MutationObserver === 'function') {
			new MutationObserver(function () {
				quiet(rp.classList.contains('is-quiet'));
			}).observe(rp, { attributes: true, attributeFilter: ['class'] });
		}
	}

	function boot() {
		hookProgress();
		const warm = function () {
			loadConsole();
		};
		if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 4000 });
		else setTimeout(warm, 1500);
		if (!window.ReviewProgress) {
			document.addEventListener('DOMContentLoaded', hookProgress);
			setTimeout(hookProgress, 0);
		}
	}

	window.ReviewArena = {
		start: start,
		line: line,
		finish: finish,
		fail: fail,
		reset: reset,
		quiet: quiet,
		skin: function () {
			return state.skin;
		},
		stages: function () {
			return boardMap().map(function (d) {
				return d.id;
			});
		},
		snapshot: function () {
			const items = {};
			state.ents
				.filter(function (e) {
					return e.lane === 0;
				})
				.forEach(function (e) {
					items[e.def.id] = e.status;
				});
			return {
				skin: state.skin,
				pose: state.pose,
				anomaly: state.anomaly,
				activeId: state.activeId,
				stages: Object.assign({}, state.stages),
				items: items,
				ready: !!state.cons,
			};
		},
		pickSkin: pickSkin,
		forceSkin: function (skin) {
			if (skin === 'lab' || skin === 'console') {
				try {
					sessionStorage.setItem(SKIN_KEY, skin);
				} catch (e) {
					/* optional */
				}
				state.skin = skin;
			}
		},
	};

	boot();
})();
