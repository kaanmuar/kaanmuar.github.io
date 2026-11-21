#!/usr/bin/env node
'use strict';
/* Skill and MCP scanner gate (#3835). Dependency-free. Run it on any external skill or MCP server config before adopting it
   (.cursor/rules/tool-arsenal.mdc), and on our own skills when they change.

     node scripts/skill-scan.js                 every text file under .cursor/skills plus every mcp.json / .mcp.json in the repo
     node scripts/skill-scan.js <path> [...]    scan these files or folders instead (a candidate skill in /tmp, say)
     npm run skills:scan

   Exit 1 on any finding. Output is `file:line  rule-id  message` and never the matched text: a hit may be a secret.

   Rules
     remote-pipe-shell     curl or wget piped (or process-substituted) into sh, bash, zsh and friends
     encoded-blob          base64 run of 200+ chars or hex run of 128+ chars (hidden payloads, smuggled instructions)
     prompt-override       text that tries to override the system or user prompt ("ignore previous instructions", ...)
     hidden-char           zero-width, bidi-control and other invisible format characters
     unknown-host          a URL whose host is not on HOSTS below
     destructive-command   rm -rf on / ~ $HOME, mkfs, dd to a device, fork bomb, chmod -R 777 /
     curl-post-unknown     curl or wget sending data (-d, --data*, --post-data) to a host not on HOSTS

   A finding that is a false positive goes in ALLOW with the reason; never silence a rule globally. */
const fs = require('node:fs');
const path = require('node:path');

// Hosts a skill or MCP config may name. A host matches itself and any subdomain (mcp.cloudflare.com matches cloudflare.com).
const HOSTS = [
	'github.com',
	'api.github.com',
	'raw.githubusercontent.com',
	'cursor.com',
	'cloudflare.com',
	'developers.cloudflare.com',
	'localhost',
	'127.0.0.1',
];

// Reviewed findings: { file (repo-relative, forward slashes), rule, line (optional), reason }.
const ALLOW = [];

const BLOB_B64 = 200;
const BLOB_HEX = 128;

const SHELLS = '(?:sudo\\s+(?:-\\S+\\s+)*)?(?:ba|z|da|k|c|fi)?sh|python3?|node|perl|ruby';
const RULES = [
	{
		id: 'remote-pipe-shell',
		msg: 'remote code fetched and piped to a shell',
		test: (l) =>
			new RegExp(`\\b(?:curl|wget)\\b[^\\n]*\\|\\s*(?:${SHELLS})\\b`, 'i').test(l) ||
			new RegExp(`\\b(?:${SHELLS})\\s+(?:-\\S+\\s+)*<\\(\\s*(?:curl|wget)\\b`, 'i').test(l) ||
			new RegExp(`\\b(?:${SHELLS})\\s+-c\\s+["']?\\$\\(\\s*(?:curl|wget)\\b`, 'i').test(l),
	},
	{
		id: 'encoded-blob',
		msg: `long base64 (${BLOB_B64}+) or hex (${BLOB_HEX}+) blob`,
		test: (raw) => {
			const l = raw.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '');
			return new RegExp(`[A-Za-z0-9+/]{${BLOB_B64},}={0,2}`).test(l) || new RegExp(`(?<![0-9A-Fa-f])[0-9A-Fa-f]{${BLOB_HEX},}(?![0-9A-Fa-f])`).test(l);
		},
	},
	{
		id: 'prompt-override',
		msg: 'tries to override the system or user prompt',
		test: (l) =>
			[
				/\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all|any|your|the)\b[^.\n]{0,30}\b(?:instructions?|prompts?|rules?|directions?|guidelines?|constraints?)\b/i,
				/\b(?:ignore|disregard)\s+(?:everything|anything)\s+(?:above|before|you\s+(?:were|have been)\s+told)/i,
				/\byou\s+are\s+now\s+(?:in\s+)?(?:DAN|developer\s+mode|jailbreak|unrestricted)/i,
				/\b(?:reveal|print|show|repeat|leak)\b[^.\n]{0,30}\b(?:system|developer|hidden)\s+prompt\b/i,
				/\b(?:do\s+not|don'?t|never)\s+(?:tell|inform|mention|reveal)\b[^.\n]{0,30}\b(?:the\s+)?user\b/i,
				/<\s*\/?\s*(?:system|im_start|im_end)\s*>|\[\s*INST\s*\]|<\|im_(?:start|end)\|>/i,
			].some((re) => re.test(l)),
	},
	{
		id: 'destructive-command',
		msg: 'destructive command',
		test: (l) =>
			/\brm\s+(?:-[A-Za-z]*\s+)*-[A-Za-z]*[rR][A-Za-z]*\s+(?:-[A-Za-z]+\s+)*(?:--no-preserve-root\s+)?["']?(?:\/(?:\*|\s|$|["'])|~\/?(?:\*|\s|$|["'])|\$HOME\/?(?:\*|\s|$|["'])|\$\{HOME\}\/?(?:\*|\s|$|["']))/.test(l) ||
			/\brm\s+(?:-[A-Za-z]+\s+)*--no-preserve-root\b/.test(l) ||
			/\bmkfs(?:\.\w+)?\s+\S*\/dev\//.test(l) ||
			/\bdd\b[^\n]*\bof=\/dev\/(?:sd|nvme|disk|hd|mmcblk)/.test(l) ||
			/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(l) ||
			/\bchmod\s+-R\s+0?777\s+\/(?:\s|$)/.test(l),
	},
];

// Zero-width, bidi controls, word joiner family, BOM mid-file, tag characters, soft hyphen, variation selectors (not U+FE0F, which emoji use).
const HIDDEN = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u3164\uFE00-\uFE0E\uFEFF\uFFA0\u{E0000}-\u{E007F}]/u;

const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/(?:[^\s/@:"'<>`]+(?::[^\s/@"'<>`]*)?@)?(\[[0-9a-f:.]+\]|[A-Za-z0-9._-]+)/gi;

function hostAllowed(host) {
	const h = host.toLowerCase().replace(/\.$/, '');
	return HOSTS.some((a) => h === a || h.endsWith(`.${a}`));
}

function urlHosts(line) {
	const out = [];
	for (const m of line.matchAll(URL_RE)) out.push(m[1]);
	return out;
}

function scanText(text, file) {
	const findings = [];
	const add = (line, rule, msg) => findings.push({ file, line, rule, msg });
	const lines = text.split(/\r?\n/);
	lines.forEach((raw, i) => {
		const n = i + 1;
		const l = i === 0 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
		for (const r of RULES) if (r.test(l)) add(n, r.id, r.msg);
		if (HIDDEN.test(l)) add(n, 'hidden-char', 'invisible or bidi-control character');
		const hosts = urlHosts(l);
		for (const h of hosts) if (!hostAllowed(h)) add(n, 'unknown-host', `host not on the allowlist: ${h}`);
		if (/\b(?:curl|wget)\b/i.test(l) && /(?:\s-d\b|\s-d\S|--data(?:-\w+)*\b|--post-(?:data|file)\b|\s-F\b|--form\b|\s-T\b|--upload-file\b)/.test(l)) {
			if (!hosts.length || hosts.some((h) => !hostAllowed(h))) add(n, 'curl-post-unknown', 'sends data to a host that is not on the allowlist');
		}
	});
	return findings;
}

function isAllowed(f) {
	return ALLOW.some((a) => a.file === f.file && a.rule === f.rule && (a.line === undefined || a.line === f.line));
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees']);
const TEXT_EXT = new Set(['.md', '.mdc', '.txt', '.sh', '.bash', '.zsh', '.js', '.mjs', '.cjs', '.ts', '.py', '.json', '.yml', '.yaml', '.toml', '']);

function walk(dir, accept, out = []) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		if (SKIP_DIRS.has(e.name)) continue;
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, accept, out);
		else if (e.isFile() && accept(p)) out.push(p);
	}
	return out;
}

const isMcpConfig = (p) => ['mcp.json', '.mcp.json'].includes(path.basename(p));

function defaultTargets(root) {
	const skills = walk(path.join(root, '.cursor', 'skills'), (p) => TEXT_EXT.has(path.extname(p).toLowerCase()));
	const mcp = walk(root, isMcpConfig);
	return [...new Set([...skills, ...mcp])].sort();
}

function expand(arg) {
	const st = fs.statSync(arg);
	return st.isDirectory() ? walk(arg, (p) => TEXT_EXT.has(path.extname(p).toLowerCase()) || isMcpConfig(p)).sort() : [arg];
}

function scanFiles(files, root) {
	const all = [];
	for (const f of files) {
		const rel = path.relative(root, f).split(path.sep).join('/');
		const shown = rel.startsWith('..') ? f : rel;
		all.push(...scanText(fs.readFileSync(f, 'utf8'), shown));
	}
	return all.filter((f) => !isAllowed(f));
}

function main(argv) {
	const root = path.resolve(__dirname, '..');
	const files = argv.length ? argv.flatMap(expand) : defaultTargets(root);
	if (!files.length) {
		console.error('skill-scan: nothing to scan');
		return 1;
	}
	const findings = scanFiles(files, root);
	for (const f of findings) console.log(`${f.file}:${f.line}  ${f.rule}  ${f.msg}`);
	console.log(`skill-scan: ${files.length} file(s), ${findings.length} finding(s)`);
	return findings.length ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { scanText, scanFiles, hostAllowed, defaultTargets, HOSTS, ALLOW, BLOB_B64, BLOB_HEX };
