const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
	encodeCarouselLoop,
	filterComplex,
	durationFor,
	SLIDE_SEC,
	W,
	H,
	FPS,
} = require('../../scripts/tips-studio/carousel-loop');

const FFMPEG = fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
const ROOT = path.resolve(__dirname, '../..');
const SAMPLE = path.join(ROOT, 'media/social-posts/auto-2026-11-16/carousel');
const BED = [
	path.join(ROOT, 'media/url-review-demos/bed.wav'),
	path.join(path.dirname(path.dirname(ROOT)), 'media/url-review-demos/bed.wav'),
].find((f) => fs.existsSync(f));

test('four slides make a ~14s Reels duration (#3498)', () => {
	assert.equal(durationFor(4), 14);
	assert.equal(durationFor(4, SLIDE_SEC), 4 * SLIDE_SEC);
	assert.equal(SLIDE_SEC, 3.5);
});

test('the filter graph pads each still to 9:16 and mixes bed audio', () => {
	const graph = filterComplex(4, 14);
	assert.match(graph, new RegExp('scale=' + W + ':' + H));
	assert.match(graph, /boxblur=40:2/);
	assert.match(graph, /concat=n=4:v=1:a=0\[v]/);
	assert.match(graph, /\[4:a\]aformat/);
	assert.match(graph, /loudnorm/);
	assert.match(graph, new RegExp('fps=' + FPS));
});

test('fewer than two slides skips encoding', () => {
	assert.equal(encodeCarouselLoop([], '/tmp/no.mp4', { bed: BED || '/tmp/missing.wav' }), null);
	assert.equal(encodeCarouselLoop(['/no/such.jpg'], '/tmp/no.mp4', { bed: BED || '/tmp/missing.wav' }), null);
});

test('encode fails without a bed (social clips are never muted)', () => {
	assert.throws(() => encodeCarouselLoop([__filename, __filename], path.join(os.tmpdir(), 'x.mp4'), {}), /bed/);
});

test(
	'smoke: four carousel stills encode to a heard 9:16 loop (#3498)',
	{ skip: !BED || !fs.existsSync(path.join(SAMPLE, '01-u-notino-de-01.jpg')) },
	() => {
		const slides = [1, 2, 3, 4].map((i) => path.join(SAMPLE, '01-u-notino-de-' + String(i).padStart(2, '0') + '.jpg'));
		assert.ok(slides.every((f) => fs.existsSync(f)));
		const out = path.join(os.tmpdir(), 'carousel-loop-' + process.pid + '.mp4');
		try {
			const result = encodeCarouselLoop(slides, out, { bed: BED, ffmpeg: FFMPEG, slideSec: 0.4 });
			assert.equal(result.slides, 4);
			assert.ok(result.peak > -30);
			assert.ok(Math.abs(result.length - 1.6) < 0.01);
			assert.ok(fs.existsSync(out));
			const probe = spawnSync(
				FFMPEG.replace(/ffmpeg$/, 'ffprobe'),
				['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out],
				{ encoding: 'utf8' }
			);
			assert.match(String(probe.stdout), /1080,1920/);
		} finally {
			fs.rmSync(out, { force: true });
		}
	}
);
