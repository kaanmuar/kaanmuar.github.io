'use strict';
// #3714: clean-room two-pass loudnorm wrapper — mock child_process, never need a real ffmpeg.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
	DEFAULTS,
	parseLoudnormJson,
	loudnormFilter,
	buildMeasureArgs,
	buildApplyArgs,
	resolveTargets,
	resolveFfmpeg,
	normalize,
	parseArgs,
} = require('../../scripts/ffmpeg-normalize.js');

const SAMPLE_JSON = {
	input_i: '-18.45',
	input_tp: '-2.10',
	input_lra: '5.20',
	input_thresh: '-28.90',
	target_offset: '-5.55',
};

const SAMPLE_STDERR =
	'ignored banner\n{\n\t"input_i" : "-18.45",\n\t"input_tp" : "-2.10",\n\t"input_lra" : "5.20",\n\t"input_thresh" : "-28.90",\n\t"target_offset" : "-5.55"\n}\n';

function mockSpawn(handlers) {
	return (cmd, args) => {
		const key = cmd + ' ' + (args || []).join(' ');
		for (const h of handlers) {
			if (h.match(cmd, args || [], key)) return h.result(cmd, args || []);
		}
		return { status: 1, stdout: '', stderr: 'unexpected: ' + key };
	};
}

test('DEFAULTS match ffmpeg loudnorm / EBU R128-style broadcast targets', () => {
	assert.deepEqual(DEFAULTS, { I: -24, TP: -2, LRA: 7 });
});

test('parseLoudnormJson reads the last JSON object from ffmpeg stderr', () => {
	assert.deepEqual(parseLoudnormJson(SAMPLE_STDERR), SAMPLE_JSON);
});

test('parseLoudnormJson fails when JSON or a measured key is missing', () => {
	assert.throws(() => parseLoudnormJson('no json here'), (err) => err.code === 'LOUDNORM_PARSE');
	assert.throws(
		() => parseLoudnormJson('{"input_i":"-1","input_tp":"-1","input_lra":"1","input_thresh":"-2"}'),
		(err) => err.code === 'LOUDNORM_PARSE' && /target_offset/.test(err.message)
	);
});

test('loudnormFilter measure vs apply args', () => {
	const t = resolveTargets({});
	assert.equal(loudnormFilter(t), 'loudnorm=I=-24:TP=-2:LRA=7:print_format=json');
	assert.match(loudnormFilter(t, SAMPLE_JSON), /measured_I=-18\.45/);
	assert.match(loudnormFilter(t, SAMPLE_JSON), /linear=true/);
	assert.doesNotMatch(loudnormFilter(t, SAMPLE_JSON), /print_format/);
});

test('buildMeasureArgs and buildApplyArgs keep video copy + aac audio', () => {
	const t = { I: -14, TP: -1.5, LRA: 11 };
	const measure = buildMeasureArgs('in.mp4', t);
	assert.deepEqual(measure.slice(0, 4), ['-hide_banner', '-nostdin', '-i', 'in.mp4']);
	assert.ok(measure.includes('-af'));
	assert.ok(measure.includes('null'));

	const apply = buildApplyArgs('in.mp4', 'out.mp4', t, SAMPLE_JSON);
	assert.ok(apply.includes('-c:v'));
	assert.equal(apply[apply.indexOf('-c:v') + 1], 'copy');
	assert.ok(apply.includes('-c:a'));
	assert.equal(apply[apply.indexOf('-c:a') + 1], 'aac');
	assert.equal(apply[apply.length - 1], 'out.mp4');
	assert.match(apply[apply.indexOf('-af') + 1], /I=-14/);
});

test('resolveFfmpeg returns null when which/where fails (ffmpeg optional)', () => {
	const spawn = mockSpawn([
		{
			match: (cmd) => cmd === 'which' || cmd === 'where',
			result: () => ({ status: 1, stdout: '', stderr: 'not found' }),
		},
	]);
	assert.equal(resolveFfmpeg({ spawnSync: spawn }), null);
});

test('resolveFfmpeg uses options.ffmpeg when set', () => {
	assert.equal(resolveFfmpeg({ ffmpeg: '/opt/bin/ffmpeg' }), '/opt/bin/ffmpeg');
});

test('normalize runs two ffmpeg passes with mocked spawnSync', () => {
	const calls = [];
	const spawn = mockSpawn([
		{
			match: (cmd) => cmd === 'which' || cmd === 'where',
			result: () => ({ status: 0, stdout: '/usr/local/bin/ffmpeg\n', stderr: '' }),
		},
		{
			match: (cmd, args) => cmd === '/usr/local/bin/ffmpeg' && args.includes('null'),
			result: (cmd, args) => {
				calls.push({ pass: 'measure', cmd, args });
				return { status: 0, stdout: '', stderr: SAMPLE_STDERR };
			},
		},
		{
			match: (cmd, args) => cmd === '/usr/local/bin/ffmpeg' && args.includes('out.mp4'),
			result: (cmd, args) => {
				calls.push({ pass: 'apply', cmd, args });
				return { status: 0, stdout: '', stderr: '' };
			},
		},
	]);

	const result = normalize('in.mp4', 'out.mp4', {
		spawnSync: spawn,
		skipExistsCheck: true,
		I: -14,
		TP: -1.5,
		LRA: 11,
	});

	assert.equal(calls.length, 2);
	assert.equal(calls[0].pass, 'measure');
	assert.equal(calls[1].pass, 'apply');
	assert.deepEqual(result.measured, SAMPLE_JSON);
	assert.deepEqual(result.targets, { I: -14, TP: -1.5, LRA: 11 });
	assert.match(calls[0].args[calls[0].args.indexOf('-af') + 1], /print_format=json/);
	assert.match(calls[1].args[calls[1].args.indexOf('-af') + 1], /measured_I=-18\.45/);
});

test('normalize dryRun measures but does not apply', () => {
	const calls = [];
	const spawn = mockSpawn([
		{
			match: (cmd) => cmd === 'which' || cmd === 'where',
			result: () => ({ status: 0, stdout: '/bin/ffmpeg\n', stderr: '' }),
		},
		{
			match: (cmd) => cmd === '/bin/ffmpeg',
			result: (cmd, args) => {
				calls.push(args);
				return { status: 0, stdout: '', stderr: SAMPLE_STDERR };
			},
		},
	]);
	normalize('in.mp4', 'out.mp4', { spawnSync: spawn, skipExistsCheck: true, dryRun: true });
	assert.equal(calls.length, 1);
	assert.ok(calls[0].includes('null'));
});

test('normalize fails clearly when ffmpeg is missing', () => {
	const spawn = mockSpawn([
		{
			match: () => true,
			result: () => ({ status: 1, stdout: '', stderr: '' }),
		},
	]);
	assert.throws(
		() => normalize('in.mp4', 'out.mp4', { spawnSync: spawn, skipExistsCheck: true }),
		(err) => err.code === 'FFMPEG_MISSING' && /not installed/i.test(err.message) && /mock child_process/i.test(err.message)
	);
});

test('parseArgs reads targets and ffmpeg path', () => {
	const opts = parseArgs(['in.wav', 'out.wav', '--I', '-14', '--TP', '-1.5', '--LRA', '11', '--ffmpeg', '/x/ffmpeg']);
	assert.deepEqual(opts.positional, ['in.wav', 'out.wav']);
	assert.equal(opts.I, '-14');
	assert.equal(opts.TP, '-1.5');
	assert.equal(opts.LRA, '11');
	assert.equal(opts.ffmpeg, '/x/ffmpeg');
});
