#!/usr/bin/env node
// Prepares the media the feature deck uses (#3931): screenshots to JPG, short clips, the animated faces.
//   node scripts/feature-deck/prep-media.js [shots-dir]     (default: /tmp/deck-shots/live, made by shoot.sh)
// Writes into presentation/: img/*.jpg, media/*.mp4, faces/*.svg, img/mark.svg.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const { slides } = require('./slides.js');

const root = path.resolve(__dirname, '..', '..');
const main = path.dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root }).toString().trim());
const out = path.join(root, 'presentation');
const shots = process.argv[2] || '/tmp/deck-shots/live';
for (const d of ['img', 'media', 'faces']) fs.mkdirSync(path.join(out, d), { recursive: true });

(async () => {
	// 1. screenshots used by shot and bignum slides, plus a few spare
	const names = new Set();
	for (const s of slides) {
		if (s.img) names.add(s.img);
		if (s.shot) names.add(s.shot);
	}
	for (const n of names) {
		const src = path.join(shots, n + '.png');
		if (!fs.existsSync(src)) {
			console.log('missing screenshot', n);
			continue;
		}
		// report screenshots: keep only the report window, so the text stays readable on a slide
		let img = sharp(src);
		if (n.startsWith('sample-')) img = img.extract({ left: 170, top: 0, width: 1100, height: 688 });
		await img.resize({ width: 1440, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(out, 'img', n + '.jpg'));
	}

	// 2. clips, silent and small, except the sample clip which keeps its voice
	// only URL Review clips; old clips from the 71-slide deck are deleted so they never ship by accident
	for (const old of ['qa-lab-running', 'sdlc-studio-running', 'sample-clip']) {
		for (const d of [path.join(out, 'media', old + '.mp4'), path.join(out, 'img', 'clip-' + old + '.jpg')]) fs.rmSync(d, { force: true });
	}
	const demo = (f) => path.join(main, 'media/url-review-demos/pictures', f + '.mp4');
	const clips = {
		'scope-20x2': { src: demo('scope-20x2'), t: [0, 14], w: 960, audio: false },
		'framework-playwright': { src: demo('framework-playwright'), t: [0, 14], w: 960, audio: false },
		'export-excel': { src: demo('export-excel'), t: [0, 14], w: 960, audio: false },
		'share-email': { src: demo('share-email'), t: [0, 14], w: 960, audio: false },
	};
	for (const [n, c] of Object.entries(clips)) {
		if (!fs.existsSync(c.src)) {
			console.log('missing clip', n);
			continue;
		}
		const args = ['-v', 'error', '-y', '-ss', String(c.t[0]), '-t', String(c.t[1] - c.t[0]), '-i', c.src, '-vf', `scale=${c.w}:-2,fps=24`, '-c:v', 'libx264', '-crf', '29', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
		if (c.audio) args.push('-c:a', 'aac', '-b:a', '64k', '-ac', '1');
		else args.push('-an');
		execFileSync('ffmpeg', [...args, path.join(out, 'media', n + '.mp4')]);
		execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.min(4, c.t[1] / 2)), '-i', path.join(out, 'media', n + '.mp4'), '-frames:v', '1', '-q:v', '4', path.join(out, 'img', 'clip-' + n + '.jpg')]);
	}

	// 3. faces and the mark
	const faces = new Set(['seo', 'sec', 'ai', 'a11y', 'perf', 'mail', 'targeted', 'exploit']);
	const scan = (o) => {
		if (!o || typeof o !== 'object') return;
		if (typeof o.face === 'string') faces.add(o.face);
		if (Array.isArray(o.faces)) for (const f of o.faces) faces.add(f[0]);
		for (const v of Object.values(o)) scan(v);
	};
	scan(slides);
	for (const f of faces) {
		const src = path.join(root, 'assets/faces/badge', f + '.svg');
		if (!fs.existsSync(src)) throw new Error('no face ' + f);
		fs.copyFileSync(src, path.join(out, 'faces', f + '.svg'));
	}
	fs.copyFileSync(path.join(root, 'assets/qa-review-mark.svg'), path.join(out, 'img/mark.svg'));
	console.log('media ready:', names.size, 'pictures,', Object.keys(clips).length, 'clips,', faces.size, 'faces');
})();
