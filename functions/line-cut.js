'use strict';
// Text before the first `delims` character on the last line of `text`; `text` unchanged when that line has none.
// Same result as replacing /^((?:.*[\n\r\u2028\u2029])*[^DELIMS]*)[DELIMS].*$/ with "$1", as a plain scan
// with no nested quantifier for the ReDoS scan to flag (#3965).
const LINE_BREAKS = new Set(['\n', '\r', '\u2028', '\u2029']);

function beforeLastLineDelim(text, delims) {
	const s = String(text);
	let start = 0;
	for (let i = 0; i < s.length; i += 1) if (LINE_BREAKS.has(s[i])) start = i + 1;
	for (let i = start; i < s.length; i += 1) if (delims.includes(s[i])) return s.slice(0, i);
	return s;
}

module.exports = { beforeLastLineDelim };
