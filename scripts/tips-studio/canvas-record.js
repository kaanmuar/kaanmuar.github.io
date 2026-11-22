'use strict';
/*
 * Thin canvas → MediaRecorder capture for Tips Studio / review-video paths (#3714, #3826).
 *
 * Clean-room pattern inspired by the MediaCapture lane of dmnsgn/canvas-record (MIT) and the
 * in-browser canvas→file goal of Vanilagy/mediabunny (MPL-2.0). No packages pinned or copied:
 * only `canvas.captureStream` + `MediaRecorder`. Prefer `video/mp4` when the browser supports it;
 * otherwise WebM. WebCodecs / mediabunny-style mux and Remotion-like timelines stay Left.
 *
 * Pure helpers (Node-safe, unit-tested): pickMimeType, normalizeOptions, extensionForMime,
 * suggestFileName, chunksToBlobType.
 * Browser: createCanvasRecorder(canvas, opts) → { start, stop, pause, resume, mimeType, … }
 *          recordCanvas(canvas, { durationMs, … }) → Promise<{ blob, mimeType, extension }>
 *
 * Playwright / review-video usage sketch:
 *   const { createCanvasRecorder } = require('./canvas-record');
 *   await page.exposeFunction(…); // or inject this file and call createCanvasRecorder(canvas)
 */

const DEFAULT_FPS = 30;
const DEFAULT_VIDEO_BPS = 2_500_000;

/** Prefer an MP4 container when MediaRecorder supports it; else WebM. */
const MIME_CANDIDATES = [
	'video/mp4;codecs=avc1.42E01E',
	'video/mp4',
	'video/webm;codecs=vp9',
	'video/webm;codecs=vp8',
	'video/webm',
];

/**
 * @param {(mime: string) => boolean} [isTypeSupported]
 * @param {string} [preferred]
 * @returns {string} first supported mime, or '' if none
 */
function pickMimeType(isTypeSupported, preferred) {
	const check = typeof isTypeSupported === 'function' ? isTypeSupported : () => false;
	if (preferred && check(preferred)) return preferred;
	for (const mime of MIME_CANDIDATES) {
		if (check(mime)) return mime;
	}
	return '';
}

/** @param {string} [mime] */
function extensionForMime(mime) {
	const m = String(mime || '').toLowerCase();
	if (m.includes('mp4')) return 'mp4';
	if (m.includes('webm')) return 'webm';
	if (m.includes('matroska') || m.includes('mkv')) return 'mkv';
	return 'webm';
}

/**
 * @param {{
 *   frameRate?: number,
 *   videoBitsPerSecond?: number,
 *   audioBitsPerSecond?: number,
 *   bitsPerSecond?: number,
 *   mimeType?: string,
 *   timeslice?: number,
 * }} [opts]
 */
function normalizeOptions(opts = {}) {
	const frameRate = opts.frameRate == null ? DEFAULT_FPS : Number(opts.frameRate);
	if (!(frameRate >= 0) || Number.isNaN(frameRate)) throw new Error('frameRate must be >= 0');
	const videoBitsPerSecond =
		opts.videoBitsPerSecond == null ? DEFAULT_VIDEO_BPS : Number(opts.videoBitsPerSecond);
	if (!(videoBitsPerSecond > 0) || Number.isNaN(videoBitsPerSecond)) {
		throw new Error('videoBitsPerSecond must be > 0');
	}
	const timeslice = opts.timeslice == null ? undefined : Number(opts.timeslice);
	if (timeslice != null && (!(timeslice > 0) || Number.isNaN(timeslice))) {
		throw new Error('timeslice must be > 0');
	}
	let audioBitsPerSecond;
	if (opts.audioBitsPerSecond != null) {
		audioBitsPerSecond = Number(opts.audioBitsPerSecond);
		if (!(audioBitsPerSecond > 0) || Number.isNaN(audioBitsPerSecond)) {
			throw new Error('audioBitsPerSecond must be > 0');
		}
	}
	let bitsPerSecond;
	if (opts.bitsPerSecond != null) {
		bitsPerSecond = Number(opts.bitsPerSecond);
		if (!(bitsPerSecond > 0) || Number.isNaN(bitsPerSecond)) {
			throw new Error('bitsPerSecond must be > 0');
		}
	}
	return {
		frameRate,
		videoBitsPerSecond,
		audioBitsPerSecond,
		bitsPerSecond,
		mimeType: opts.mimeType ? String(opts.mimeType) : undefined,
		timeslice,
	};
}

/** @param {string} [base] @param {string} [mime] */
function suggestFileName(base, mime) {
	const raw = String(base || 'canvas-record').trim() || 'canvas-record';
	const stem = raw.replace(/\.[a-z0-9]+$/i, '') || 'canvas-record';
	return stem + '.' + extensionForMime(mime);
}

/**
 * @param {Array<{ type?: string }|null|undefined>} [chunks]
 * @param {string} [fallbackMime]
 */
function chunksToBlobType(chunks, fallbackMime) {
	for (const chunk of chunks || []) {
		if (chunk && chunk.type) return chunk.type;
	}
	return fallbackMime || 'video/webm';
}

function mediaRecorderCtor() {
	const g = typeof globalThis !== 'undefined' ? globalThis : null;
	if (!g || typeof g.MediaRecorder !== 'function') return null;
	return g.MediaRecorder;
}

/**
 * Browser-only: wrap canvas.captureStream + MediaRecorder.
 * @param {HTMLCanvasElement|{ captureStream: (fps?: number) => MediaStream }} canvas
 * @param {ReturnType<typeof normalizeOptions> & { audioStream?: MediaStream }} [opts]
 */
function createCanvasRecorder(canvas, opts = {}) {
	const MediaRecorder = mediaRecorderCtor();
	if (!MediaRecorder) throw new Error('MediaRecorder is not available (browser-only)');
	if (!canvas || typeof canvas.captureStream !== 'function') {
		throw new Error('canvas must support captureStream()');
	}

	const options = normalizeOptions(opts);
	const mimeType = pickMimeType((t) => {
		try {
			return typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t);
		} catch {
			return false;
		}
	}, options.mimeType);

	const stream = canvas.captureStream(options.frameRate);
	if (opts.audioStream && typeof opts.audioStream.getAudioTracks === 'function') {
		for (const track of opts.audioStream.getAudioTracks()) stream.addTrack(track);
	}

	const recorderOpts = {};
	if (mimeType) recorderOpts.mimeType = mimeType;
	if (options.bitsPerSecond != null) recorderOpts.bitsPerSecond = options.bitsPerSecond;
	else {
		if (options.videoBitsPerSecond != null) recorderOpts.videoBitsPerSecond = options.videoBitsPerSecond;
		if (options.audioBitsPerSecond != null) recorderOpts.audioBitsPerSecond = options.audioBitsPerSecond;
	}

	const recorder = new MediaRecorder(stream, recorderOpts);
	const chunks = [];
	let stopPromise = null;

	recorder.ondataavailable = (ev) => {
		if (ev && ev.data && ev.data.size > 0) chunks.push(ev.data);
	};

	return {
		get mimeType() {
			return recorder.mimeType || mimeType;
		},
		get extension() {
			return extensionForMime(recorder.mimeType || mimeType);
		},
		get state() {
			return recorder.state;
		},
		stream,
		start(timeslice = options.timeslice) {
			chunks.length = 0;
			stopPromise = null;
			if (timeslice != null) recorder.start(timeslice);
			else recorder.start();
		},
		pause() {
			if (recorder.state === 'recording') recorder.pause();
		},
		resume() {
			if (recorder.state === 'paused') recorder.resume();
		},
		stop() {
			if (stopPromise) return stopPromise;
			stopPromise = new Promise((resolve, reject) => {
				recorder.onerror = (ev) => {
					reject((ev && ev.error) || new Error('MediaRecorder error'));
				};
				recorder.onstop = () => {
					const type = chunksToBlobType(chunks, recorder.mimeType || mimeType || 'video/webm');
					const blob =
						typeof Blob === 'function'
							? new Blob(chunks, { type })
							: { type, size: chunks.reduce((n, c) => n + (c.size || 0), 0), chunks: chunks.slice() };
					resolve({
						blob,
						mimeType: type,
						extension: extensionForMime(type),
						chunks: chunks.slice(),
					});
				};
				if (recorder.state === 'inactive') recorder.onstop();
				else recorder.stop();
			});
			return stopPromise;
		},
	};
}

/**
 * Record for a fixed duration (browser-only).
 * @param {HTMLCanvasElement} canvas
 * @param {{ durationMs?: number } & Parameters<typeof createCanvasRecorder>[1]} [opts]
 */
async function recordCanvas(canvas, opts = {}) {
	const durationMs = opts.durationMs == null ? 1000 : Number(opts.durationMs);
	if (!(durationMs > 0) || Number.isNaN(durationMs)) throw new Error('durationMs must be > 0');
	const rec = createCanvasRecorder(canvas, opts);
	rec.start(opts.timeslice);
	await new Promise((resolve) => setTimeout(resolve, durationMs));
	return rec.stop();
}

module.exports = {
	MIME_CANDIDATES,
	DEFAULT_FPS,
	DEFAULT_VIDEO_BPS,
	pickMimeType,
	extensionForMime,
	normalizeOptions,
	suggestFileName,
	chunksToBlobType,
	createCanvasRecorder,
	recordCanvas,
};
