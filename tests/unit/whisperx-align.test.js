'use strict';
// #3714: clean-room word-timing → VTT/SRT merge — fixtures only; never need whisperX installed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
	SUPPORTED_LANGS,
	DEFAULT_CHUNK,
	normalizeLang,
	formatTimestampVtt,
	formatTimestampSrt,
	extractWords,
	wordsToCues,
	cuesToVtt,
	cuesToSrt,
	mergeWordTimings,
	resolveAlignCli,
	buildWhisperXArgs,
	buildFasterWhisperArgs,
	align,
	parseArgs,
} = require('../../scripts/whisperx-align.js');

const FIX = path.join(__dirname, 'fixtures', 'whisperx-align');
const EN = JSON.parse(fs.readFileSync(path.join(FIX, 'words-en.json'), 'utf8'));
const ES = JSON.parse(fs.readFileSync(path.join(FIX, 'words-es-segments.json'), 'utf8'));

function mockSpawn(handlers) {
	return (cmd, args) => {
		const key = cmd + ' ' + (args || []).join(' ');
		for (const h of handlers) {
			if (h.match(cmd, args || [], key)) return h.result(cmd, args || []);
		}
		return { status: 1, stdout: '', stderr: 'unexpected: ' + key };
	};
}

test('SUPPORTED_LANGS are the six tips-studio languages', () => {
	assert.deepEqual(SUPPORTED_LANGS, ['en', 'es', 'pt', 'de', 'fr', 'it']);
});

test('normalizeLang accepts base and BCP-47 style codes', () => {
	assert.equal(normalizeLang('EN'), 'en');
	assert.equal(normalizeLang('es-MX'), 'es');
	assert.equal(normalizeLang('pt_BR'), 'pt');
	assert.throws(() => normalizeLang('zh'), (err) => err.code === 'LANG');
});

test('formatTimestampVtt and formatTimestampSrt', () => {
	assert.equal(formatTimestampVtt(0), '00:00:00.000');
	assert.equal(formatTimestampVtt(65.432), '00:01:05.432');
	assert.equal(formatTimestampSrt(65.432), '00:01:05,432');
	assert.equal(formatTimestampVtt(3661.5), '01:01:01.500');
});

test('extractWords reads bare words and whisperX-style segments', () => {
	const en = extractWords(EN);
	assert.equal(en.length, 8);
	assert.equal(en[0].word, 'Hello');
	assert.equal(en[1].end, 0.85);

	const es = extractWords(ES);
	assert.equal(es.length, 4);
	assert.equal(es[0].word, 'Hola');
	assert.equal(es[3].word, 'lista.');
});

test('wordsToCues packs on punctuation and maxChars', () => {
	const cues = wordsToCues(EN.words, { maxChars: 42, maxDuration: 5, maxWords: 10 });
	assert.equal(cues.length, 2);
	assert.equal(cues[0].text, 'Hello world.');
	assert.equal(cues[0].start, 0);
	assert.equal(cues[0].end, 0.85);
	assert.match(cues[1].text, /word-level subtitle test\./);
	assert.equal(cues[1].words.length, 6);
});

test('mergeWordTimings EN fixture → VTT + SRT', () => {
	const merged = mergeWordTimings(EN);
	assert.equal(merged.lang, 'en');
	assert.equal(merged.cues.length, 2);
	assert.match(merged.vtt, /^WEBVTT\nLanguage: en\n/);
	assert.match(merged.vtt, /00:00:00\.000 --> 00:00:00\.850/);
	assert.match(merged.vtt, /Hello world\./);
	assert.match(merged.srt, /1\n00:00:00,000 --> 00:00:00,850\nHello world\./);
	assert.match(merged.srt, /2\n/);
});

test('mergeWordTimings ES segments fixture is 6-lang ready', () => {
	const merged = mergeWordTimings(ES, { lang: 'es' });
	assert.equal(merged.lang, 'es');
	assert.equal(merged.cues.length, 2);
	assert.match(merged.vtt, /Language: es/);
	assert.match(merged.vtt, /Hola equipo\./);
	assert.match(merged.vtt, /Revisión lista\./);
	assert.match(merged.srt, /Hola equipo\./);
});

test('cuesToVtt / cuesToSrt round-trip cue list', () => {
	const cues = [
		{ start: 0, end: 1.5, text: 'One' },
		{ start: 1.6, end: 3, text: 'Two' },
	];
	const vtt = cuesToVtt(cues, { lang: 'fr' });
	assert.match(vtt, /Language: fr/);
	assert.match(vtt, /00:00:01\.600 --> 00:00:03\.000/);
	const srt = cuesToSrt(cues);
	assert.match(srt, /00:00:01,600 --> 00:00:03,000/);
});

test('DEFAULT_CHUNK matches documented packing defaults', () => {
	assert.deepEqual(DEFAULT_CHUNK, { maxChars: 42, maxDuration: 5, maxWords: 10 });
});

test('buildWhisperXArgs and buildFasterWhisperArgs document external CLIs', () => {
	const wx = buildWhisperXArgs('clip.wav', { lang: 'de', outputDir: '/tmp/out', model: 'large-v2' });
	assert.deepEqual(wx.slice(0, 7), ['clip.wav', '--language', 'de', '--output_dir', '/tmp/out', '--output_format', 'json']);
	assert.ok(wx.includes('--model'));
	const fw = buildFasterWhisperArgs('clip.wav', { lang: 'it', outputDir: '.' });
	assert.ok(fw.includes('--word_timestamps'));
	assert.equal(fw[fw.indexOf('--language') + 1], 'it');
});

test('resolveAlignCli returns null when CLIs missing (optional for CI)', () => {
	const spawn = mockSpawn([
		{
			match: (cmd) => cmd === 'which' || cmd === 'where',
			result: () => ({ status: 1, stdout: '', stderr: 'not found' }),
		},
	]);
	assert.equal(resolveAlignCli({ spawnSync: spawn }), null);
});

test('resolveAlignCli prefers whisperx then faster-whisper', () => {
	const spawn = mockSpawn([
		{
			match: (cmd, args) => (cmd === 'which' || cmd === 'where') && args[0] === 'whisperx',
			result: () => ({ status: 0, stdout: '/opt/bin/whisperx\n', stderr: '' }),
		},
	]);
	assert.deepEqual(resolveAlignCli({ spawnSync: spawn }), { name: 'whisperx', path: '/opt/bin/whisperx' });
});

test('align dryRun returns CLI args without executing merge of missing JSON', () => {
	const spawn = mockSpawn([
		{
			match: (cmd, args) => (cmd === 'which' || cmd === 'where') && args[0] === 'whisperx',
			result: () => ({ status: 0, stdout: '/usr/local/bin/whisperx\n', stderr: '' }),
		},
	]);
	const result = align('clip.wav', {
		spawnSync: spawn,
		skipExistsCheck: true,
		dryRun: true,
		lang: 'en',
		outputDir: '/tmp',
	});
	assert.equal(result.dryRun, true);
	assert.equal(result.cli.path, '/usr/local/bin/whisperx');
	assert.ok(result.args.includes('clip.wav'));
});

test('align fails clearly when CLI missing', () => {
	const spawn = mockSpawn([
		{
			match: () => true,
			result: () => ({ status: 1, stdout: '', stderr: '' }),
		},
	]);
	assert.throws(
		() => align('clip.wav', { spawnSync: spawn, skipExistsCheck: true }),
		(err) => err.code === 'ALIGN_CLI_MISSING' && /mergeWordTimings/i.test(err.message)
	);
});

test('align merges when CLI mocked and wordsDoc provided', () => {
	const spawn = mockSpawn([
		{
			match: (cmd, args) => (cmd === 'which' || cmd === 'where') && args[0] === 'whisperx',
			result: () => ({ status: 0, stdout: '/bin/whisperx\n', stderr: '' }),
		},
		{
			match: (cmd) => cmd === '/bin/whisperx',
			result: () => ({ status: 0, stdout: '', stderr: '' }),
		},
	]);
	const result = align('clip.wav', {
		spawnSync: spawn,
		skipExistsCheck: true,
		wordsDoc: EN,
		lang: 'en',
	});
	assert.equal(result.lang, 'en');
	assert.equal(result.cues.length, 2);
	assert.match(result.vtt, /Hello world\./);
});

test('parseArgs reads merge and align flags', () => {
	const m = parseArgs(['merge', '--words', 'w.json', '--format', 'srt', '--lang', 'pt', '--out', 'o.srt']);
	assert.equal(m.command, 'merge');
	assert.equal(m.words, 'w.json');
	assert.equal(m.format, 'srt');
	assert.equal(m.lang, 'pt');
	assert.equal(m.out, 'o.srt');

	const a = parseArgs(['align', 'a.wav', '--cli', 'faster-whisper', '--dry-run', '--model', 'small']);
	assert.equal(a.command, 'align');
	assert.deepEqual(a.positional, ['a.wav']);
	assert.equal(a.cli, 'faster-whisper');
	assert.equal(a.dryRun, true);
	assert.equal(a.model, 'small');
});
