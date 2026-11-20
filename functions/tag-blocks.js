'use strict';
// Same result as text.replace(/<(a|b)\b[\s\S]*?<\/\1>/gi, replacement), or with <\/\1[^>]*> as the end tag when
// `endAttrs` is set, as a scan with no lazy body for the ReDoS scan to flag (#3965). `open` is a global regex for the
// start tags with the tag name in group 1, such as /<(script|style)\b/gi. A block ends at the first end tag of its
// name; once a name has no end tag left, its later start tags stay as they are.
function replaceBlocks(text, open, replacement, endAttrs = false) {
	const s = String(text);
	const low = s.replace(/[A-Z]+/g, (c) => c.toLowerCase());
	const unclosed = new Set();
	let out = '';
	let kept = 0;
	let m;
	open.lastIndex = 0;
	while ((m = open.exec(s))) {
		const name = m[1].toLowerCase();
		if (unclosed.has(name)) continue;
		const at = low.indexOf(`</${name}${endAttrs ? '' : '>'}`, open.lastIndex);
		const end = at < 0 ? -1 : endAttrs ? s.indexOf('>', at + name.length + 2) : at + name.length + 2;
		if (end < 0) {
			unclosed.add(name);
			continue;
		}
		out += s.slice(kept, m.index) + replacement;
		kept = end + 1;
		open.lastIndex = kept;
	}
	return out + s.slice(kept);
}

module.exports = { replaceBlocks };
