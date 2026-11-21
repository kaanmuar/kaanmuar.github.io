/* Motion set for the review arena: how each cut-out item moves.
   Every item kind has a WORK motion (what it does while its check runs).
   Every item also has the shared REACTIONS: idle, done (pop), fail (slump + shake),
   risk (nervous wobble), skip (stand down). Pure functions, no DOM. */
(function (root) {
	'use strict';

	const sin = Math.sin;
	const cos = Math.cos;
	const abs = Math.abs;
	const exp = Math.exp;
	const PI = Math.PI;

	// pivot: where the item turns (bottom = stands on the shelf). fx: effects that ride on the item while it works.
	const KINDS = {
		rack: { pivot: 'bottom', fx: ['leds', 'rings'] },
		doc: { pivot: 'bottom', fx: ['scan', 'bits'] },
		glass: { pivot: 'center', fx: ['glint', 'bits'] },
		screen: { pivot: 'bottom', fx: ['scan', 'load'] },
		hammer: { pivot: 'bl', fx: ['strike'] },
		shield: { pivot: 'center', fx: ['rings', 'glint'] },
		bot: { pivot: 'bottom', fx: ['glint', 'dots'] },
		radar: { pivot: 'bottom', fx: ['sweep'] },
		target: { pivot: 'center', fx: ['lock'] },
		list: { pivot: 'bottom', fx: ['rows'] },
		mirror: { pivot: 'bottom', fx: ['glint'] },
		wp: { pivot: 'center', fx: ['glint'] },
		mail: { pivot: 'bottom', fx: ['bits'] },
		tower: { pivot: 'bottom', fx: ['beam'] },
		cases: { pivot: 'bottom', fx: ['scan', 'dots'] },
		chart: { pivot: 'bottom', fx: ['rise'] },
		sign: { pivot: 'bottom', fx: ['sig'] },
		send: { pivot: 'bottom', fx: ['trail'] },
		form: { pivot: 'bottom', fx: ['scan', 'dots'] },
		lock: { pivot: 'center', fx: ['rings'] },
		gear: { pivot: 'center', fx: ['strike'] },
		globe: { pivot: 'center', fx: ['rings', 'glint'] },
		cube: { pivot: 'center', fx: ['glint'] },
		rocket: { pivot: 'bottom', fx: ['flame'] },
		pen: { pivot: 'bl', fx: ['sig'] },
		spark: { pivot: 'center', fx: ['rings', 'glint'] },
	};

	const GLOW = {
		idle: null,
		wip: '#5ec8d4',
		done: '#5dff9a',
		fail: '#ff5a4a',
		skip: null,
		risk: '#f0c85a',
	};

	function zero() {
		return { x: 0, y: 0, r: 0, sx: 1, sy: 1, a: 1 };
	}

	// WORK motions: t = seconds on the clock, p = phase offset so neighbours do not move in lockstep.
	const WORK = {
		rack: function (t, o) {
			o.x = sin(t * 41) * 0.9;
			o.sy = 1 + sin(t * 7) * 0.012;
		},
		doc: function (t, o) {
			o.y = -3 - sin(t * 5) * 2.2;
			o.r = sin(t * 4) * 0.05;
		},
		glass: function (t, o) {
			o.x = cos(t * 3.2) * 6;
			o.y = sin(t * 3.2) * 4 - 2;
			o.r = sin(t * 3.2) * 0.14;
		},
		screen: function (t, o) {
			o.y = sin(t * 9) * 0.5;
			o.a = sin(t * 23) > 0.85 ? 0.82 : 1;
		},
		hammer: function (t, o) {
			// raise (0–.6), strike (.6–.7), recover (.7–1)
			const p = (t * 2.2) % 1;
			if (p < 0.6) o.r = -0.9 * (p / 0.6);
			else if (p < 0.7) o.r = -0.9 + 1.3 * ((p - 0.6) / 0.1);
			else o.r = 0.4 * (1 - (p - 0.7) / 0.3);
		},
		shield: function (t, o) {
			o.sx = o.sy = 1 + 0.07 * sin(t * 5);
		},
		bot: function (t, o) {
			o.y = -abs(sin(t * 6)) * 6;
			o.r = sin(t * 6) * 0.09;
		},
		radar: function (t, o) {
			o.x = sin(t * 17) * 0.8;
			o.r = sin(t * 3) * 0.05;
		},
		target: function (t, o) {
			o.sx = o.sy = 1 + 0.1 * sin(t * 7);
		},
		list: function (t, o) {
			o.y = sin(t * 10) * 0.8;
		},
		mirror: function (t, o) {
			o.sx = 1 - 0.07 * abs(sin(t * 2.5));
			o.r = sin(t * 2.5) * 0.05;
		},
		wp: function (t, o) {
			const c = cos(t * 3.5);
			o.sx = (c < 0 ? -1 : 1) * Math.max(0.1, abs(c));
		},
		mail: function (t, o) {
			o.y = -3 - 3 * sin(t * 5);
			o.r = sin(t * 5) * 0.08;
		},
		tower: function (t, o) {
			o.sy = 1 + 0.015 * sin(t * 4);
		},
		cases: function (t, o) {
			o.y = sin(t * 8) * 0.7;
			o.r = sin(t * 2) * 0.02;
		},
		chart: function (t, o) {
			o.sy = 1 + 0.07 * sin(t * 6);
		},
		sign: function (t, o) {
			o.r = sin(t * 8) * 0.1 - 0.08;
			o.x = sin(t * 8) * 2;
		},
		send: function (t, o) {
			o.y = -abs(sin(t * 4)) * 7;
			o.x = sin(t * 8) * 1.2;
		},
		form: function (t, o) {
			o.y = -2 - sin(t * 6) * 1.6;
			o.r = sin(t * 3) * 0.03;
		},
		lock: function (t, o) {
			o.r = sin(t * 9) * 0.13;
		},
		gear: function (t, o) {
			o.r = t * 3.2;
		},
		globe: function (t, o) {
			o.r = t * 1.6;
		},
		cube: function (t, o) {
			o.r = sin(t * 2.2) * 0.35;
			o.y = -sin(t * 4) * 2;
		},
		rocket: function (t, o) {
			const p = (t * 1.1) % 1;
			o.y = -p * 12;
			o.a = p > 0.85 ? 1 - ((p - 0.85) / 0.15) * 0.7 : 1;
			o.r = sin(t * 18) * 0.02;
		},
		pen: function (t, o) {
			o.r = sin(t * 8) * 0.1 - 0.1;
			o.x = sin(t * 8) * 2;
		},
		spark: function (t, o) {
			o.sx = o.sy = 1 + 0.12 * sin(t * 6);
			o.r = t * 0.8;
		},
	};

	// pose(kind, status, t, age, phase) → transform deltas for one item.
	function pose(kind, status, t, age, phase) {
		const o = zero();
		const tt = t + (phase || 0);
		if (status === 'wip') {
			(WORK[kind] || WORK.bot)(tt, o);
			// anticipation: the first 0.25 s the item squashes before it starts working
			if (age < 0.25) {
				const k = 1 - age / 0.25;
				o.sy *= 1 - 0.1 * k;
				o.sx *= 1 + 0.06 * k;
			}
		} else if (status === 'done') {
			const pop = exp(-age * 5) * cos(age * 18);
			o.sx = o.sy = 1 + 0.2 * pop;
			o.y = -4 * Math.max(0, exp(-age * 6) * sin(age * 14));
			o.y += sin(tt * 1.4) * 0.5;
		} else if (status === 'fail') {
			const k = exp(-age * 3.5);
			o.x = sin(age * 70) * 4 * k + sin(tt * 30) * 0.5;
			o.r = -0.07 * (1 - exp(-age * 8));
			o.y = 2 * (1 - exp(-age * 6));
			o.a = 0.92;
		} else if (status === 'risk') {
			o.r = sin(tt * 5) * 0.05;
			o.x = sin(tt * 11) * 0.8;
		} else if (status === 'skip') {
			o.sy = 0.96;
			o.a = 0.5;
		} else {
			o.y = sin(tt * 1.3) * 0.5;
			o.a = 0.5;
		}
		return o;
	}

	// Doctor reactions to the whole run: playback rate of his baked loop + extra motion + effects.
	const DOCTOR = {
		work: { rate: 1.15, tint: null, bubble: '', y: 0 },
		cheer: { rate: 2.2, tint: '#5dff9a', bubble: '✓', y: -3 },
		fail: { rate: 0, tint: '#ff5a4a', bubble: '✕', y: 3 },
		stop: { rate: 0, tint: '#f0c85a', bubble: '■', y: 1 },
		timeout: { rate: 0.28, tint: '#ff9a4a', bubble: '⏱', y: 2 },
		retry: { rate: 1.9, tint: '#5ec8d4', bubble: '↻', y: -1 },
		slow: { rate: 0.32, tint: '#8ad0e8', bubble: '…', y: 1 },
	};

	// Which station reacts to which anomaly (the bay the unexpected robot lives in).
	const BAY_COLOR = {
		timeout: '#ff9a4a',
		stop: '#ff5a4a',
		retry: '#f0c85a',
		slow: '#8ad0e8',
		fail: '#ff5a4a',
	};

	const QUALITY = 1.4; // punchier action / reaction without changing the art
	function poseQ(kind, status, t, age, phase) {
		const o = pose(kind, status, t, age, phase);
		if (!o) return o;
		o.x = (o.x || 0) * QUALITY;
		o.y = (o.y || 0) * QUALITY;
		o.r = (o.r || 0) * Math.min(QUALITY, 1.25);
		if (status === 'wip' || status === 'fail' || status === 'risk') {
			o.sx = 1 + ((o.sx || 1) - 1) * QUALITY;
			o.sy = 1 + ((o.sy || 1) - 1) * QUALITY;
		}
		return o;
	}
	root.ReviewArenaMotion = {
		KINDS: KINDS,
		GLOW: GLOW,
		DOCTOR: DOCTOR,
		BAY_COLOR: BAY_COLOR,
		pose: poseQ,
	};
})(typeof window !== 'undefined' ? window : globalThis);
