#!/usr/bin/env node
// #3714: chaptered playlists from already-rendered explainer chapter clips.
//   node scripts/explainers-studio/playlist.js --src <dir with manifest.json> [--out <dir>] [--mp4 support:en]
// Writes WebVTT chapters for every audience:lang in the manifest and
// (only for the --mp4 keys) one concatenated H.264/AAC MP4 with embedded chapters.
// Local only: nothing is uploaded or published.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const src = path.resolve(opt('src', 'media/url-review-explainers'));
const out = path.resolve(opt('out', 'media/url-review-playlists'));
const mp4Keys = (opt('mp4', '') || '').split(',').filter(Boolean);
const vttDir = path.resolve(opt('vtt', path.join(__dirname, 'playlists')));

const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
// manifest.file is relative to the repo root, so resolve by trailing path after the folder name
const resolveClip = (file) => path.join(src, file.replace(/^media\/url-review-explainers\//, ''));
const probe = (file) =>
  parseFloat(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
      encoding: 'utf8',
    }),
  );
const stamp = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
};

fs.mkdirSync(vttDir, { recursive: true });
fs.mkdirSync(out, { recursive: true });

const groups = {};
for (const e of manifest) (groups[`${e.audience}:${e.lang}`] ||= []).push(e);

const summary = [];
for (const [key, items] of Object.entries(groups)) {
  const [audience, lang] = key.split(':');
  let t = 0;
  const chapters = items.map((e) => {
    const file = resolveClip(e.file);
    const dur = probe(file);
    const c = { id: e.id, title: e.title, start: t, end: t + dur, file };
    t += dur;
    return c;
  });
  const base = `${audience}-${lang}`;
  const vtt = ['WEBVTT', '', ...chapters.flatMap((c) => [c.id, `${stamp(c.start)} --> ${stamp(c.end)}`, c.title, ''])].join('\n');
  fs.writeFileSync(path.join(vttDir, `${base}-chapters.vtt`), vtt);
  const row = { key, vtt: `${base}-chapters.vtt`, chapters: chapters.length, seconds: Math.round(t) };

  if (mp4Keys.includes(key)) {
    const meta = [';FFMETADATA1', `title=URL Review ${audience} explainer (${lang})`].concat(
      chapters.flatMap((c) => ['[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.start * 1000)}`, `END=${Math.round(c.end * 1000)}`, `title=${c.title}`]),
    );
    const metaFile = path.join(out, `${base}.ffmeta`);
    fs.writeFileSync(metaFile, meta.join('\n'));
    const inputs = chapters.flatMap((c) => ['-i', c.file]);
    const n = chapters.length;
    const filt =
      chapters.map((_, i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}];[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`).join(';') +
      ';' + chapters.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${n}:v=1:a=1[v][a]`;
    const mp4 = path.join(out, `${base}-explainer.mp4`);
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-i', metaFile, '-filter_complex', filt, '-map', '[v]', '-map', '[a]', '-map_metadata', `${n}`, '-map_chapters', `${n}`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
    fs.copyFileSync(path.join(vttDir, `${base}-chapters.vtt`), path.join(out, `${base}-chapters.vtt`));
    row.mp4 = `${base}-explainer.mp4`;
  }
  summary.push(row);
}
fs.writeFileSync(path.join(vttDir, 'manifest.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
