/* Landmark announcement preview (#3832): what a screen reader would say as a user moves through a page's
   landmarks (banner, navigation, main, form, ...), so the hero, nav and form regions of qa-lab.html and
   qa-review.html can be checked without a screen reader running.

   Clean-room and dependency-free. The idea (spoken landmark output) comes from guidepup/virtual-screen-reader
   (MIT, tool-arsenal wave 1); none of its code is used, and it is not a screen reader: it reads the HTML-AAM
   landmark rules for tags, explicit roles and accessible names only. It does not evaluate CSS, so an element
   hidden by a stylesheet is still announced; `hidden` and `aria-hidden="true"` are honoured.

   Opt-in on qa-lab.html / qa-review.html via js/landmark-preview-ui.js (?landmarks=1 or localStorage
   qa-landmarks=1). Or load this file and run in the console:
       LandmarkAnnounce.preview(document)          // array of spoken lines
       LandmarkAnnounce.speak(document)            // reads them aloud (speechSynthesis), returns the lines
   Layers: announce(tree) works on a plain tree { tag, attrs, text, children } (unit-tested without a DOM);
   fromElement(el) builds that tree from a real element. */
(function (root, factory) {
	const api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	if (root) root.LandmarkAnnounce = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
	'use strict';

	const LANDMARK_ROLES = ['banner', 'complementary', 'contentinfo', 'form', 'main', 'navigation', 'region', 'search'];
	// Implicit role by tag. header/footer/form/section are conditional (see roleOf).
	const TAG_ROLE = { header: 'banner', footer: 'contentinfo', nav: 'navigation', main: 'main', aside: 'complementary', form: 'form', section: 'region', search: 'search' };
	// header/footer lose their landmark role inside these sectioning elements.
	const SECTIONING = ['article', 'aside', 'main', 'nav', 'section'];
	const SKIP_TAGS = ['script', 'style', 'template', 'noscript', 'head'];
	// Landmarks that a screen reader announces only when they have an accessible name.
	const NAME_REQUIRED = ['form', 'region'];

	function attr(node, name) {
		const v = node.attrs && node.attrs[name];
		return v === undefined || v === null ? '' : String(v).trim();
	}

	function hidden(node) {
		return !!node.attrs && (node.attrs.hidden !== undefined && node.attrs.hidden !== false || attr(node, 'aria-hidden') === 'true');
	}

	function squash(s) {
		return String(s || '').replace(/\s+/g, ' ').trim();
	}

	// Visible text of a subtree, skipping hidden branches and non-content tags.
	function textOf(node) {
		if (!node || hidden(node) || SKIP_TAGS.includes(node.tag)) return '';
		const parts = [node.text || ''];
		for (const c of node.children || []) parts.push(textOf(c));
		return squash(parts.join(' '));
	}

	function indexIds(node, map) {
		const id = attr(node, 'id');
		if (id && !map[id]) map[id] = node;
		for (const c of node.children || []) indexIds(c, map);
		return map;
	}

	// aria-labelledby, then aria-label, then title.
	function nameOf(node, ids) {
		const by = attr(node, 'aria-labelledby');
		if (by) {
			const text = squash(by.split(/\s+/).map((id) => (ids[id] ? textOf(ids[id]) : '')).join(' '));
			if (text) return text;
		}
		return squash(attr(node, 'aria-label')) || squash(attr(node, 'title'));
	}

	// The landmark role of a node, or '' when it is not a landmark.
	function roleOf(node, ids, insideSectioning) {
		const explicit = attr(node, 'role').split(/\s+/)[0].toLowerCase();
		let role = '';
		if (explicit) {
			if (!LANDMARK_ROLES.includes(explicit)) return '';
			role = explicit;
		} else {
			role = TAG_ROLE[node.tag] || '';
			if ((node.tag === 'header' || node.tag === 'footer') && insideSectioning) return '';
		}
		if (!role) return '';
		if (NAME_REQUIRED.includes(role) && !nameOf(node, ids)) return '';
		return role;
	}

	function headingLevel(node) {
		const m = /^h([1-6])$/.exec(node.tag || '');
		if (m && attr(node, 'role') !== 'presentation' && attr(node, 'role') !== 'none') return +m[1];
		if (attr(node, 'role') === 'heading') return +attr(node, 'aria-level') || 2;
		return 0;
	}

	function isControl(node) {
		if (['select', 'textarea', 'button'].includes(node.tag)) return true;
		return node.tag === 'input' && attr(node, 'type').toLowerCase() !== 'hidden';
	}

	// Counts the content a landmark holds, without crossing into nested landmarks (they are announced themselves).
	function tally(node, ids, counts, sect) {
		for (const c of node.children || []) {
			if (hidden(c) || SKIP_TAGS.includes(c.tag) || roleOf(c, ids, sect)) continue;
			if (headingLevel(c)) counts.headings++;
			else if (c.tag === 'a' && attr(c, 'href')) counts.links++;
			else if (isControl(c)) counts.controls++;
			tally(c, ids, counts, sect || SECTIONING.includes(c.tag));
		}
		return counts;
	}

	function plural(n, one, many) {
		return n + ' ' + (n === 1 ? one : many);
	}

	function summary(counts) {
		const parts = [];
		if (counts.links) parts.push(plural(counts.links, 'link', 'links'));
		if (counts.headings) parts.push(plural(counts.headings, 'heading', 'headings'));
		if (counts.controls) parts.push(plural(counts.controls, 'form control', 'form controls'));
		return parts.join(', ');
	}

	function speech(entry) {
		const name = entry.name ? entry.name + ', ' : '';
		const line = name + entry.role + ' landmark';
		return entry.summary ? line + ', ' + entry.summary : line;
	}

	// Walks a plain tree in document order and returns
	// { landmarks: [{ role, name, depth, summary, speech }], headline, warnings: [{ id, message }], lines: [string] }.
	function announce(tree) {
		const ids = indexIds(tree, {});
		const landmarks = [];
		let headline = '';

		function walk(node, depth, insideSectioning) {
			if (hidden(node) || SKIP_TAGS.includes(node.tag)) return;
			const role = roleOf(node, ids, insideSectioning);
			let childDepth = depth;
			const sect = insideSectioning || SECTIONING.includes(node.tag) || (role && role !== 'banner' && role !== 'contentinfo' && role !== 'form');
			if (role) {
				const counts = tally(node, ids, { links: 0, headings: 0, controls: 0 }, sect);
				const entry = { role, name: nameOf(node, ids), depth, summary: summary(counts) };
				entry.speech = speech(entry);
				landmarks.push(entry);
				childDepth = depth + 1;
			}
			const level = headingLevel(node);
			if (level === 1 && !headline) headline = textOf(node);
			for (const c of node.children || []) walk(c, childDepth, sect);
		}
		walk(tree, 0, false);

		const warnings = [];
		const mains = landmarks.filter((l) => l.role === 'main').length;
		if (!mains) warnings.push({ id: 'no-main', message: 'No main landmark: screen reader users cannot jump to the page content.' });
		if (mains > 1) warnings.push({ id: 'multiple-main', message: mains + ' main landmarks: a page should have one.' });
		if (!headline) warnings.push({ id: 'no-h1', message: 'No level 1 heading: the page has no spoken title.' });
		for (const role of ['navigation', 'complementary', 'search']) {
			const same = landmarks.filter((l) => l.role === role);
			if (same.length > 1 && same.some((l) => !l.name))
				warnings.push({ id: 'unnamed-duplicate-' + role, message: same.length + ' ' + role + ' landmarks and at least one has no name, so they sound the same.' });
		}

		const lines = landmarks.map((l) => l.speech);
		if (headline) lines.push('heading level 1, ' + headline);
		return { landmarks, headline, warnings, lines };
	}

	// Plain tree from a real element (browser or any DOM with tagName, attributes and childNodes).
	function fromElement(el) {
		const attrs = {};
		for (const a of Array.from(el.attributes || [])) attrs[a.name.toLowerCase()] = a.value;
		let text = '';
		const children = [];
		for (const n of Array.from(el.childNodes || [])) {
			if (n.nodeType === 3) text += ' ' + n.nodeValue;
			else if (n.nodeType === 1) children.push(fromElement(n));
		}
		return { tag: String(el.tagName || '').toLowerCase(), attrs, text: squash(text), children };
	}

	function preview(rootEl) {
		const el = rootEl && rootEl.documentElement ? rootEl.documentElement : rootEl;
		return announce(fromElement(el)).lines;
	}

	function speak(rootEl, synth) {
		const lines = preview(rootEl);
		const s = synth || (typeof window !== 'undefined' && window.speechSynthesis);
		if (s && typeof SpeechSynthesisUtterance === 'function') {
			s.cancel();
			for (const line of lines) s.speak(new SpeechSynthesisUtterance(line));
		}
		return lines;
	}

	return { announce, fromElement, preview, speak, roleOf, nameOf };
});
