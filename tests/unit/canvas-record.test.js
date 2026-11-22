'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
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
} = require('../../scripts/tips-studio/canvas-record');

describe('canvas-record pure helpers (#3714)', () => {
	test('MIME_CANDIDATES prefer mp4 before webm', () => {
		assert.ok(MIME_CANDIDATES[0].startsWith('video/mp4'));
		assert.ok(MIME_CANDIDATES.some((m) => m.startsWith('video/webm')));
		const mp4Idx = MIME_CANDIDATES.findIndex((m) => m.startsWith('video/mp4'));
		const webmIdx = MIME_CANDIDATES.findIndex((m) => m.startsWith('video/webm'));
		assert.ok(mp4Idx >= 0 && webmIdx > mp4Idx);
	});

	test('pickMimeType returns preferred when supported', () => {
		const supported = new Set(['video/webm;codecs=vp9', 'video/webm']);
		assert.equal(
			pickMimeType((t) => supported.has(t), 'video/webm;codecs=vp9'),
			'video/webm;codecs=vp9'
		);
	});

	test('pickMimeType walks candidates and returns empty when none match', () => {
		assert.equal(
			pickMimeType((t) => t === 'video/webm'),
			'video/webm'
		);
		assert.equal(pickMimeType(() => false), '');
		assert.equal(pickMimeType(), '');
	});

	test('extensionForMime maps containers', () => {
		assert.equal(extensionForMime('video/mp4;codecs=avc1.42E01E'), 'mp4');
		assert.equal(extensionForMime('video/webm;codecs=vp9'), 'webm');
		assert.equal(extensionForMime('video/x-matroska'), 'mkv');
		assert.equal(extensionForMime(''), 'webm');
	});

	test('normalizeOptions fills defaults and rejects bad numbers', () => {
		assert.deepEqual(normalizeOptions({}), {
			frameRate: DEFAULT_FPS,
			videoBitsPerSecond: DEFAULT_VIDEO_BPS,
			audioBitsPerSecond: undefined,
			bitsPerSecond: undefined,
			mimeType: undefined,
			timeslice: undefined,
		});
		assert.equal(normalizeOptions({ frameRate: 0 }).frameRate, 0);
		assert.equal(normalizeOptions({ mimeType: 'video/mp4' }).mimeType, 'video/mp4');
		assert.throws(() => normalizeOptions({ frameRate: -1 }), /frameRate/);
		assert.throws(() => normalizeOptions({ videoBitsPerSecond: 0 }), /videoBitsPerSecond/);
		assert.throws(() => normalizeOptions({ timeslice: 0 }), /timeslice/);
		assert.throws(() => normalizeOptions({ audioBitsPerSecond: -2 }), /audioBitsPerSecond/);
	});

	test('suggestFileName strips an existing extension then adds the mime one', () => {
		assert.equal(suggestFileName('clip', 'video/mp4'), 'clip.mp4');
		assert.equal(suggestFileName('clip.webm', 'video/mp4'), 'clip.mp4');
		assert.equal(suggestFileName('', 'video/webm'), 'canvas-record.webm');
	});

	test('chunksToBlobType prefers the first chunk type', () => {
		assert.equal(chunksToBlobType([{ type: 'video/mp4' }, { type: 'video/webm' }], 'x'), 'video/mp4');
		assert.equal(chunksToBlobType([{ type: '' }, null], 'video/webm'), 'video/webm');
		assert.equal(chunksToBlobType([]), 'video/webm');
	});

	test('createCanvasRecorder and recordCanvas refuse Node (no MediaRecorder)', () => {
		assert.equal(typeof globalThis.MediaRecorder, 'undefined');
		assert.throws(() => createCanvasRecorder({ captureStream() {} }), /MediaRecorder/);
		assert.rejects(() => recordCanvas({ captureStream() {} }, { durationMs: 10 }), /MediaRecorder/);
	});
});
