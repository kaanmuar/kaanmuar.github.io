#!/usr/bin/env node
'use strict';
/* Clean-room forced word-level subtitle alignment helpers (#3714).
   Inspired by m-bain/whisperX (BSD-2-Clause) + SYSTRAN/faster-whisper (MIT) — documents calling an
   external CLI when installed; does NOT vendor whisperX or faster-whisper.
   Pure helpers merge word timings into WebVTT / SRT (six-language ready: en, es, pt, de, fr, it).
   Usage:
     node scripts/whisperx-align.js --help
     node scripts/whisperx-align.js merge --words words.json --format vtt [--lang en] [--out out.vtt]
     node scripts/whisperx-align.js align <audio> [--lang en] [--cli whisperx|faster-whisper] [--dry-run]
   Programmatic: const { mergeWordTimings, cuesToVtt, cuesToSrt } = require('./whisperx-align'); */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/** Social / tips-studio language codes (six-language rotation). */
const SUPPORTED_LANGS = Object.freeze(['en', 'es', 'pt', 'de', 'fr', 'it']);

/** Default cue packing for burn-in / karaoke-style word merge. */
const DEFAULT_CHUNK = Object.freeze({
	maxChars: 42,
	maxDuration: 5,
	maxWords: 10,
});

function fail(code, message) {
	const err = new Error(message);
	err.code = code;
	throw err;
}

function normalizeLang(code) {
	const raw = String(code || 'en')
		.trim()
		.toLowerCase();
	const base = raw.split(/[-_]/)[0] || 'en';
	if (!SUPPORTED_LANGS.includes(base)) {
		fail('LANG', 'unsupported lang "' + code + '"; expected one of ' + SUPPORTED_LANGS.join(', '));
	}
	return base;
}

/** Format seconds as WebVTT timestamp (HH:MM:SS.mmm). */
function formatTimestampVtt(seconds) {
	const t = Math.max(0, Number(seconds) || 0);
	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	const s = Math.floor(t % 60);
	const ms = Math.round((t - Math.floor(t)) * 1000);
	return (
		String(h).padStart(2, '0') +
		':' +
		String(m).padStart(2, '0') +
		':' +
		String(s).padStart(2, '0') +
		'.' +
		String(ms).padStart(3, '0')
	);
}

/** Format seconds as SRT timestamp (HH:MM:SS,mmm). */
function formatTimestampSrt(seconds) {
	return formatTimestampVtt(seconds).replace('.', ',');
}

/**
 * Normalize a word timing object from whisperX / faster-whisper style JSON.
 * Accepts { word|text, start, end } or nested segment.words[].
 */
function normalizeWord(entry) {
	if (!entry || typeof entry !== 'object') fail('WORDS', 'word entry must be an object');
	const text = String(entry.word != null ? entry.word : entry.text != null ? entry.text : '')
		.trim();
	if (!text) fail('WORDS', 'word entry missing word/text');
	const start = Number(entry.start);
	const end = Number(entry.end);
	if (!Number.isFinite(start) || !Number.isFinite(end)) fail('WORDS', 'word needs numeric start/end: ' + text);
	if (end < start) fail('WORDS', 'word end before start: ' + text);
	return { word: text, start, end };
}

/** Flatten whisperX-style { segments:[{ words }] } or a bare words[] / { words } document. */
function extractWords(doc) {
	if (Array.isArray(doc)) return doc.map(normalizeWord);
	if (!doc || typeof doc !== 'object') fail('WORDS', 'words document must be an object or array');
	if (Array.isArray(doc.words)) return doc.words.map(normalizeWord);
	if (Array.isArray(doc.segments)) {
		const out = [];
		for (const seg of doc.segments) {
			const list = (seg && seg.words) || [];
			for (const w of list) out.push(normalizeWord(w));
		}
		return out;
	}
	fail('WORDS', 'expected words[] or segments[].words[]');
}

/**
 * Pack word timings into subtitle cues (clean-room; not copied from whisperX).
 * Breaks on punctuation, maxChars, maxDuration, or maxWords.
 */
function wordsToCues(words, options = {}) {
	const list = Array.isArray(words) ? words.map(normalizeWord) : extractWords(words);
	const maxChars = options.maxChars != null ? Number(options.maxChars) : DEFAULT_CHUNK.maxChars;
	const maxDuration = options.maxDuration != null ? Number(options.maxDuration) : DEFAULT_CHUNK.maxDuration;
	const maxWords = options.maxWords != null ? Number(options.maxWords) : DEFAULT_CHUNK.maxWords;

	const cues = [];
	let buf = [];

	function flush() {
		if (!buf.length) return;
		const start = buf[0].start;
		const end = buf[buf.length - 1].end;
		const text = buf.map((w) => w.word).join(' ').replace(/\s+/g, ' ').trim();
		cues.push({ start, end, text, words: buf.slice() });
		buf = [];
	}

	for (const w of list) {
		const nextText = buf.length
			? buf.map((x) => x.word).join(' ') + ' ' + w.word
			: w.word;
		const span = buf.length ? w.end - buf[0].start : w.end - w.start;
		const wouldOverflow =
			buf.length >= maxWords ||
			nextText.length > maxChars ||
			span > maxDuration;
		if (buf.length && wouldOverflow) flush();
		buf.push(w);
		if (/[.!?…]$/.test(w.word) || /[.!?…]["')\]]*$/.test(w.word)) flush();
	}
	flush();
	return cues;
}

function cuesToVtt(cues, options = {}) {
	const lang = options.lang != null ? normalizeLang(options.lang) : null;
	const lines = ['WEBVTT'];
	if (lang) lines.push('Language: ' + lang);
	lines.push('');
	cues.forEach((cue, i) => {
		lines.push(String(i + 1));
		lines.push(formatTimestampVtt(cue.start) + ' --> ' + formatTimestampVtt(cue.end));
		lines.push(cue.text);
		lines.push('');
	});
	return lines.join('\n');
}

function cuesToSrt(cues) {
	const blocks = cues.map((cue, i) => {
		return (
			String(i + 1) +
			'\n' +
			formatTimestampSrt(cue.start) +
			' --> ' +
			formatTimestampSrt(cue.end) +
			'\n' +
			cue.text
		);
	});
	return blocks.join('\n\n') + (blocks.length ? '\n' : '');
}

/**
 * Merge word timings into VTT and/or SRT.
 * @returns {{ lang, words, cues, vtt, srt }}
 */
function mergeWordTimings(input, options = {}) {
	const lang = normalizeLang(options.lang || (input && input.language) || (input && input.lang) || 'en');
	const words = Array.isArray(input) || (input && (input.words || input.segments)) ? extractWords(input) : extractWords({ words: input });
	const cues = wordsToCues(words, options);
	const vtt = cuesToVtt(cues, { lang });
	const srt = cuesToSrt(cues);
	return { lang, words, cues, vtt, srt };
}

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
 * Resolve an external align CLI. Prefer whisperx, then faster-whisper.
 * Returns null when neither is installed (CI-safe; unit tests never need the binary).
 */
function resolveAlignCli(opts = {}) {
	if (opts.cliPath) return { name: opts.cliName || 'custom', path: opts.cliPath };
	const spawn = opts.spawnSync || spawnSync;
	const which = process.platform === 'win32' ? 'where' : 'which';
	const prefer = opts.cli === 'faster-whisper' ? ['faster-whisper', 'whisperx'] : ['whisperx', 'faster-whisper'];
	for (const name of prefer) {
		const done = runSpawn(which, [name], spawn);
		if (done.status !== 0) continue;
		const line = done.stdout
			.trim()
			.split(/\r?\n/)
			.find(Boolean);
		if (line) return { name, path: line };
	}
	return null;
}

/** Documented whisperX CLI shape (external install). Not executed in unit tests. */
function buildWhisperXArgs(audio, options = {}) {
	const lang = normalizeLang(options.lang || 'en');
	const outDir = options.outputDir || '.';
	const args = [audio, '--language', lang, '--output_dir', outDir, '--output_format', 'json'];
	if (options.model) args.push('--model', String(options.model));
	if (options.device) args.push('--device', String(options.device));
	if (options.alignModel) args.push('--align_model', String(options.alignModel));
	return args;
}

/** Documented faster-whisper CLI shape (external install). */
function buildFasterWhisperArgs(audio, options = {}) {
	const lang = normalizeLang(options.lang || 'en');
	const outDir = options.outputDir || '.';
	const args = [audio, '--language', lang, '--output_dir', outDir, '--output_format', 'json', '--word_timestamps', 'true'];
	if (options.model) args.push('--model', String(options.model));
	if (options.device) args.push('--device', String(options.device));
	return args;
}

/**
 * Optional: call external whisperX / faster-whisper when installed, then merge word timings.
 * Without a CLI, fails with ALIGN_CLI_MISSING (CI uses pure merge helpers only).
 */
function align(audio, options = {}) {
	if (!audio) fail('USAGE', 'align(audio) requires an audio/video path');
	if (!options.skipExistsCheck && !fs.existsSync(audio)) fail('ENOENT', 'audio not found: ' + audio);

	const resolved = resolveAlignCli(options);
	if (!resolved) {
		fail(
			'ALIGN_CLI_MISSING',
			'Neither whisperx nor faster-whisper is installed (or on PATH). ' +
				'Install one externally for forced alignment, then re-run; ' +
				'or pass word timings to mergeWordTimings() / `node scripts/whisperx-align.js merge`. ' +
				'Unit tests cover the pure merge helpers and do not need a CLI.'
		);
	}

	const lang = normalizeLang(options.lang || 'en');
	const outputDir = options.outputDir || path.dirname(path.resolve(audio));
	const args =
		resolved.name === 'faster-whisper'
			? buildFasterWhisperArgs(audio, Object.assign({}, options, { lang, outputDir }))
			: buildWhisperXArgs(audio, Object.assign({}, options, { lang, outputDir }));

	if (options.dryRun) {
		return { dryRun: true, cli: resolved, args, lang, audio };
	}

	const spawn = options.spawnSync || spawnSync;
	const run = options.alignResult || runSpawn(resolved.path, args, spawn);
	if (run.status !== 0) {
		fail('ALIGN_FAIL', resolved.name + ' exited ' + run.status + ': ' + run.stderr.slice(0, 500));
	}

	let wordsDoc = options.wordsDoc;
	if (!wordsDoc && options.wordsPath) {
		wordsDoc = JSON.parse(fs.readFileSync(options.wordsPath, 'utf8'));
	}
	if (!wordsDoc) {
		fail(
			'WORDS',
			'alignment CLI finished but no words JSON was provided. Pass options.wordsPath / options.wordsDoc, ' +
				'or use `merge` with the JSON the CLI wrote under --output_dir.'
		);
	}
	const merged = mergeWordTimings(wordsDoc, Object.assign({}, options, { lang }));
	return Object.assign({ cli: resolved, args, audio }, merged);
}

function parseArgs(argv) {
	const args = argv.slice();
	const out = {
		command: null,
		positional: [],
		lang: undefined,
		format: 'vtt',
		out: undefined,
		words: undefined,
		cli: undefined,
		cliPath: undefined,
		outputDir: undefined,
		model: undefined,
		device: undefined,
		dryRun: false,
		help: false,
	};
	while (args.length) {
		const a = args.shift();
		if (a === '--help' || a === '-h') out.help = true;
		else if (a === '--lang' || a === '-l') out.lang = args.shift();
		else if (a === '--format' || a === '-f') out.format = args.shift();
		else if (a === '--out' || a === '-o') out.out = args.shift();
		else if (a === '--words') out.words = args.shift();
		else if (a === '--cli') out.cli = args.shift();
		else if (a === '--cli-path') out.cliPath = args.shift();
		else if (a === '--output-dir') out.outputDir = args.shift();
		else if (a === '--model') out.model = args.shift();
		else if (a === '--device') out.device = args.shift();
		else if (a === '--dry-run') out.dryRun = true;
		else if (a === 'merge' || a === 'align') out.command = a;
		else if (a.startsWith('-')) fail('USAGE', 'unknown flag: ' + a);
		else out.positional.push(a);
	}
	return out;
}

function helpText() {
	return [
		'Usage:',
		'  node scripts/whisperx-align.js merge --words words.json [--format vtt|srt|both] [--lang en] [--out path]',
		'  node scripts/whisperx-align.js align <audio> [--lang en] [--cli whisperx|faster-whisper] [--dry-run]',
		'',
		'Clean-room word-timing → VTT/SRT merge (6-lang: en es pt de fr it).',
		'Inspired by m-bain/whisperX (BSD-2-Clause); does NOT vendor whisperX.',
		'align requires an external whisperx or faster-whisper CLI on PATH (optional for CI).',
		'merge is pure Node and is what unit tests cover.',
	].join('\n');
}

function main(argv) {
	let opts;
	try {
		opts = parseArgs(argv.slice(2));
	} catch (err) {
		console.error(err.message || err);
		return 2;
	}
	if (opts.help || !opts.command) {
		const msg = helpText();
		if (opts.help) {
			console.log(msg);
			return 0;
		}
		console.error(msg);
		return 2;
	}

	try {
		if (opts.command === 'merge') {
			const wordsPath = opts.words || opts.positional[0];
			if (!wordsPath) fail('USAGE', 'merge requires --words <file.json>');
			const doc = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
			const merged = mergeWordTimings(doc, { lang: opts.lang || doc.language || doc.lang || 'en' });
			const format = String(opts.format || 'vtt').toLowerCase();
			let body = merged.vtt;
			if (format === 'srt') body = merged.srt;
			else if (format === 'both' || format === 'json') {
				body = JSON.stringify({ lang: merged.lang, cues: merged.cues, vtt: merged.vtt, srt: merged.srt }, null, 2);
			}
			if (opts.out) fs.writeFileSync(opts.out, body);
			else process.stdout.write(body.endsWith('\n') ? body : body + '\n');
			return 0;
		}

		const audio = opts.positional[0];
		if (!audio) fail('USAGE', 'align requires <audio>');
		const result = align(audio, opts);
		console.log(JSON.stringify(result.dryRun ? result : { ok: true, lang: result.lang, cues: result.cues.length, cli: result.cli }, null, 2));
		return 0;
	} catch (err) {
		console.error(err.message || err);
		if (err.code === 'ALIGN_CLI_MISSING') return 3;
		if (err.code === 'USAGE' || err.code === 'LANG') return 2;
		return 1;
	}
}

if (require.main === module) {
	process.exit(main(process.argv));
}

module.exports = {
	SUPPORTED_LANGS,
	DEFAULT_CHUNK,
	normalizeLang,
	formatTimestampVtt,
	formatTimestampSrt,
	normalizeWord,
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
	main,
};
