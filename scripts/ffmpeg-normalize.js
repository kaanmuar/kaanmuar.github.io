#!/usr/bin/env node
'use strict';
/* Clean-room two-pass EBU R128-style loudness normalize (#3714).
   Inspired by slhck/ffmpeg-normalize (MIT) — wraps the local ffmpeg CLI only; does NOT vendor upstream.
   Requires ffmpeg on PATH (or options.ffmpeg). Optional for CI: unit tests mock child_process and never call a real binary.
   Usage: node scripts/ffmpeg-normalize.js <input> <output> [--I -24] [--TP -2] [--LRA 7] [--ffmpeg /path/to/ffmpeg]
   Programmatic: const { normalize, parseLoudnormJson } = require('./ffmpeg-normalize'); */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/** EBU R128 / ffmpeg loudnorm defaults (broadcast). Social clips may pass I=-14 or I=-15. */
const DEFAULTS = Object.freeze({
	I: -24,
	TP: -2,
	LRA: 7,
});

const MEASURED_KEYS = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset'];

function fail(code, message) {
	const err = new Error(message);
	err.code = code;
	throw err;
}

/** Pull the loudnorm JSON blob ffmpeg prints on stderr when print_format=json. */
function parseLoudnormJson(stderr) {
	const text = String(stderr || '');
	const start = text.lastIndexOf('{');
	const end = text.lastIndexOf('}');
	if (start < 0 || end <= start) fail('LOUDNORM_PARSE', 'ffmpeg loudnorm JSON not found in stderr');
	let parsed;
	try {
		parsed = JSON.parse(text.slice(start, end + 1));
	} catch (err) {
		fail('LOUDNORM_PARSE', 'ffmpeg loudnorm JSON is not valid: ' + (err.message || err));
	}
	for (const key of MEASURED_KEYS) {
		if (parsed[key] == null || parsed[key] === '') fail('LOUDNORM_PARSE', 'loudnorm JSON missing ' + key);
	}
	return {
		input_i: String(parsed.input_i),
		input_tp: String(parsed.input_tp),
		input_lra: String(parsed.input_lra),
		input_thresh: String(parsed.input_thresh),
		target_offset: String(parsed.target_offset),
	};
}

function loudnormFilter(targets, measured) {
	const parts = ['loudnorm=I=' + targets.I, 'TP=' + targets.TP, 'LRA=' + targets.LRA];
	if (measured) {
		parts.push(
			'measured_I=' + measured.input_i,
			'measured_TP=' + measured.input_tp,
			'measured_LRA=' + measured.input_lra,
			'measured_thresh=' + measured.input_thresh,
			'offset=' + measured.target_offset,
			'linear=true'
		);
	} else {
		parts.push('print_format=json');
	}
	return parts.join(':');
}

function buildMeasureArgs(input, targets) {
	return ['-hide_banner', '-nostdin', '-i', input, '-af', loudnormFilter(targets), '-f', 'null', '-'];
}

function buildApplyArgs(input, output, targets, measured) {
	return [
		'-hide_banner',
		'-nostdin',
		'-y',
		'-i',
		input,
		'-af',
		loudnormFilter(targets, measured),
		'-c:v',
		'copy',
		'-c:a',
		'aac',
		'-b:a',
		'192k',
		'-ar',
		'48000',
		output,
	];
}

function resolveTargets(opts = {}) {
	return {
		I: opts.I != null ? Number(opts.I) : DEFAULTS.I,
		TP: opts.TP != null ? Number(opts.TP) : DEFAULTS.TP,
		LRA: opts.LRA != null ? Number(opts.LRA) : DEFAULTS.LRA,
	};
}

/**
 * Default child runner: spawnSync so stderr is available on status 0 (loudnorm prints JSON there).
 * Inject `options.spawnSync` in tests (same return shape: { status, stdout, stderr, error }).
 */
function runSpawn(bin, args, spawn = spawnSync) {
	const done = spawn(bin, args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 32 * 1024 * 1024,
	});
	if (done && done.error) throw done.error;
	return {
		status: done && typeof done.status === 'number' ? done.status : 1,
		stdout: String((done && done.stdout) || ''),
		stderr: String((done && done.stderr) || ''),
	};
}

/**
 * Resolve an ffmpeg binary. Inject `spawnSync` for tests.
 * Returns null when ffmpeg is not installed (callers may skip).
 */
function resolveFfmpeg(opts = {}) {
	if (opts.ffmpeg) return opts.ffmpeg;
	const spawn = opts.spawnSync || spawnSync;
	const which = process.platform === 'win32' ? 'where' : 'which';
	const done = runSpawn(which, ['ffmpeg'], spawn);
	if (done.status !== 0) return null;
	const line = done.stdout
		.trim()
		.split(/\r?\n/)
		.find(Boolean);
	return line || null;
}

/**
 * Normalize input → output with two-pass loudnorm.
 * @returns {{ measured, targets, ffmpeg, output, measureArgs, applyArgs }}
 */
function normalize(input, output, options = {}) {
	if (!input || !output) fail('USAGE', 'normalize(input, output) requires both paths');
	if (!options.skipExistsCheck && !fs.existsSync(input)) fail('ENOENT', 'input not found: ' + input);

	const targets = resolveTargets(options);
	const ffmpeg = resolveFfmpeg(options);
	if (!ffmpeg) {
		fail(
			'FFMPEG_MISSING',
			'ffmpeg is not installed (or not on PATH). Install ffmpeg locally or in CI to run loudness normalize; unit tests mock child_process and do not need it.'
		);
	}

	const spawn = options.spawnSync || spawnSync;
	const measureArgs = buildMeasureArgs(input, targets);
	const measure = options.measureResult || runSpawn(ffmpeg, measureArgs, spawn);
	if (measure.status !== 0) {
		fail('FFMPEG_FAIL', 'ffmpeg measure exited ' + measure.status + ': ' + measure.stderr.slice(0, 500));
	}
	const measured = options.measured || parseLoudnormJson(measure.stderr || measure.stdout);
	const applyArgs = buildApplyArgs(input, output, targets, measured);
	if (!options.dryRun) {
		const apply = runSpawn(ffmpeg, applyArgs, spawn);
		if (apply.status !== 0) {
			fail('FFMPEG_FAIL', 'ffmpeg apply exited ' + apply.status + ': ' + apply.stderr.slice(0, 500));
		}
	}
	return { measured, targets, ffmpeg, output, measureArgs, applyArgs };
}

function parseArgs(argv) {
	const args = argv.slice();
	const out = { positional: [], I: undefined, TP: undefined, LRA: undefined, ffmpeg: undefined };
	while (args.length) {
		const a = args.shift();
		if (a === '--I' || a === '-I') out.I = args.shift();
		else if (a === '--TP' || a === '-TP') out.TP = args.shift();
		else if (a === '--LRA' || a === '-LRA') out.LRA = args.shift();
		else if (a === '--ffmpeg') out.ffmpeg = args.shift();
		else if (a === '--help' || a === '-h') out.help = true;
		else if (a.startsWith('-')) fail('USAGE', 'unknown flag: ' + a);
		else out.positional.push(a);
	}
	return out;
}

function main(argv) {
	const opts = parseArgs(argv.slice(2));
	if (opts.help || opts.positional.length < 2) {
		const msg =
			'Usage: node scripts/ffmpeg-normalize.js <input> <output> [--I -24] [--TP -2] [--LRA 7] [--ffmpeg PATH]\n' +
			'Requires ffmpeg on PATH (optional for CI; tests mock child_process and do not need it).\n' +
			'Clean-room two-pass EBU R128-style loudnorm; inspired by slhck/ffmpeg-normalize (MIT), not vendored.';
		if (opts.help) {
			console.log(msg);
			return 0;
		}
		console.error(msg);
		return 2;
	}
	const [input, output] = opts.positional;
	try {
		const result = normalize(input, output, opts);
		console.log(
			JSON.stringify(
				{
					ok: true,
					output: path.resolve(result.output),
					targets: result.targets,
					measured: result.measured,
				},
				null,
				2
			)
		);
		return 0;
	} catch (err) {
		console.error(err.message || err);
		return err.code === 'FFMPEG_MISSING' ? 3 : 1;
	}
}

if (require.main === module) {
	process.exit(main(process.argv));
}

module.exports = {
	DEFAULTS,
	MEASURED_KEYS,
	parseLoudnormJson,
	loudnormFilter,
	buildMeasureArgs,
	buildApplyArgs,
	resolveTargets,
	resolveFfmpeg,
	normalize,
	parseArgs,
	main,
};
