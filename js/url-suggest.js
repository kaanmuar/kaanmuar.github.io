/*
 * Predicts the host on the URL Review "Public page" box, the hero's address box,
 * and the report's five competitor boxes, and checks it exists.
 *
 * Suggestions come from assets/domains/ (built by scripts/build-domain-index.js):
 * about 100,000 of the most visited sites worldwide, sharded by the first two
 * characters of the host without www. or m. Once the host looks complete, a
 * DNS-over-HTTPS lookup says whether it is online and, when it is not a known
 * site, offers the closest popular host. After an online host and a slash, it
 * lists page paths from that site's sitemap, read once per host by reviewUrl/paths.
 */
(function () {
	'use strict';

	const BASE = 'assets/domains/';
	const SHOWN = 6;
	const shards = new Map();
	const answers = new Map();
	const sitePaths = new Map();

	const T = {
		en: {
			sites: 'Suggested sites',
			pages: 'Suggested pages',
			top: '{host} is online and is one of the most visited sites worldwide.',
			online: '{host} is online.',
			missing: '{host} does not exist.',
			spell: '{host} does not exist. Check the spelling.',
			bare: '{host} is registered but has no website address.',
			mean: 'Did you mean {fix}?',
		},
		es: {
			sites: 'Sitios sugeridos',
			pages: 'Páginas sugeridas',
			top: '{host} está en línea y es uno de los sitios más visitados del mundo.',
			online: '{host} está en línea.',
			missing: '{host} no existe.',
			spell: '{host} no existe. Revisa cómo se escribe.',
			bare: '{host} está registrado, pero no tiene dirección de sitio web.',
			mean: '¿Quisiste decir {fix}?',
		},
		pt: {
			sites: 'Sites sugeridos',
			pages: 'Páginas sugeridas',
			top: '{host} está no ar e é um dos sites mais visitados do mundo.',
			online: '{host} está no ar.',
			missing: '{host} não existe.',
			spell: '{host} não existe. Confira a grafia.',
			bare: '{host} está registrado, mas não tem endereço de site.',
			mean: 'Você quis dizer {fix}?',
		},
		de: {
			sites: 'Vorgeschlagene Websites',
			pages: 'Vorgeschlagene Seiten',
			top: '{host} ist online und gehört zu den meistbesuchten Websites der Welt.',
			online: '{host} ist online.',
			missing: '{host} existiert nicht.',
			spell: '{host} existiert nicht. Bitte prüfen Sie die Schreibweise.',
			bare: '{host} ist registriert, hat aber keine Website-Adresse.',
			mean: 'Meinten Sie {fix}?',
		},
		fr: {
			sites: 'Sites suggérés',
			pages: 'Pages suggérées',
			top: '{host} est en ligne et fait partie des sites les plus visités au monde.',
			online: '{host} est en ligne.',
			missing: '{host} n’existe pas.',
			spell: '{host} n’existe pas. Vérifiez l’orthographe.',
			bare: '{host} est enregistré, mais n’a pas d’adresse de site web.',
			mean: 'Vouliez-vous dire {fix} ?',
		},
		it: {
			sites: 'Siti suggeriti',
			pages: 'Pagine suggerite',
			top: '{host} è online ed è uno dei siti più visitati al mondo.',
			online: '{host} è online.',
			missing: '{host} non esiste.',
			spell: '{host} non esiste. Controlla l’ortografia.',
			bare: '{host} è registrato, ma non ha un indirizzo web.',
			mean: 'Forse intendevi {fix}?',
		},
	};
	const code = String(document.documentElement.lang || 'en')
		.slice(0, 2)
		.toLowerCase();
	const book = T[code] || T.en;

	function keyOf(host) {
		return host.replace(/^(www|m)\./, '');
	}

	// Same rule as codePath in functions/url-review-core.js: /1a or /3m/x9 is a code no reader would pick.
	function codePath(path) {
		return path
			.split('/')
			.filter(Boolean)
			.some((part) => !/\p{L}{3}/u.test(part));
	}

	function hostPart(value) {
		return String(value || '')
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, '')
			.split(/[/?#]/)[0]
			.split(':')[0];
	}

	function load(name) {
		if (!shards.has(name)) {
			shards.set(
				name,
				fetch(BASE + name + '.txt')
					.then((res) => (res.ok ? res.text() : ''))
					.then((text) => text.split('\n').filter(Boolean))
					.catch(() => [])
			);
		}
		return shards.get(name);
	}

	function shardFor(key) {
		return load(key.slice(0, 2).replace(/\./g, '_'));
	}

	async function lookup(host, type) {
		try {
			const res = await fetch('https://dns.google/resolve?name=' + encodeURIComponent(host) + '&type=' + type);
			if (!res.ok) return 'unknown';
			const data = await res.json();
			if (data.Status === 3) return 'missing';
			if (data.Status !== 0) return 'unknown';
			return data.Answer && data.Answer.length ? 'found' : 'empty';
		} catch (error) {
			return 'unknown';
		}
	}

	function endpoint() {
		const host = location.hostname;
		if (host === '127.0.0.1' || host === 'localhost') return 'http://127.0.0.1:8768';
		return 'https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl';
	}

	function pathsFor(host) {
		if (!sitePaths.has(host)) {
			sitePaths.set(
				host,
				fetch(endpoint() + '/paths?host=' + encodeURIComponent(host))
					.then((res) => (res.ok ? res.json() : {}))
					.then((data) => (Array.isArray(data.paths) ? data.paths.filter((path) => typeof path === 'string') : []))
					.catch(() => [])
			);
		}
		return sitePaths.get(host);
	}

	function resolve(host) {
		if (!answers.has(host)) {
			answers.set(
				host,
				lookup(host, 'A')
					.then((state) => (state === 'empty' ? lookup(host, 'AAAA') : state))
					.then((state) => (state === 'empty' ? 'no-address' : state))
			);
		}
		return answers.get(host);
	}

	// Optimal string alignment distance, giving up once it passes max.
	function distance(a, b, max) {
		if (Math.abs(a.length - b.length) > max) return max + 1;
		let prev2 = [];
		let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
		for (let i = 1; i <= a.length; i += 1) {
			const row = [i];
			let best = i;
			for (let j = 1; j <= b.length; j += 1) {
				const cost = a[i - 1] === b[j - 1] ? 0 : 1;
				let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
				if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, prev2[j - 2] + 1);
				row.push(value);
				if (value < best) best = value;
			}
			if (best > max) return max + 1;
			prev2 = prev;
			prev = row;
		}
		return prev[b.length];
	}

	async function nearest(host) {
		const key = keyOf(host);
		const max = key.split('.')[0].length >= 10 ? 2 : 1;
		const pools = await Promise.all([load('top'), shardFor(key)]);
		let found = '';
		let score = max + 1;
		pools.forEach((pool) =>
			pool.forEach((candidate) => {
				const other = keyOf(candidate);
				if (other === key || score === 1) return;
				const d = distance(key, other, Math.min(max, score - 1));
				if (d < score) {
					score = d;
					found = candidate;
				}
			})
		);
		return found;
	}

	function looksComplete(host) {
		return /^([a-z0-9-]+\.)+([a-z]{2,}|xn--[a-z0-9-]+)$/.test(host);
	}

	async function verdict(host) {
		if (!looksComplete(host)) return null;
		const [state, pool] = await Promise.all([resolve(host), shardFor(keyOf(host))]);
		const known = pool.some((candidate) => keyOf(candidate) === keyOf(host));
		if (state === 'found' && known) return { state: 'ok', key: 'top', host };
		const fix = await nearest(host);
		if (state === 'found') return { state: fix ? 'warn' : 'ok', key: 'online', host, fix };
		if (state === 'missing') return { state: 'bad', key: fix ? 'missing' : 'spell', host, fix };
		if (state === 'no-address') return { state: 'bad', key: 'bare', host, fix };
		return null;
	}

	function words(template, key, node) {
		const at = template.indexOf('{' + key + '}');
		return [template.slice(0, at), node, template.slice(at + key.length + 2)].filter(Boolean);
	}

	function paint(hint, found, onFix) {
		hint.className = hint.className.replace(/\s*\b(ok|warn|bad)\b/g, '') + (found ? ' ' + found.state : '');
		hint.replaceChildren();
		if (!found) return;
		if (book !== T.en) {
			hint.lang = code;
			hint.setAttribute('translate', 'no');
		}
		const name = document.createElement('b');
		name.className = 'notranslate';
		// A browser translating the page trims the text after the host, so the space stays with the host.
		const spaced = book[found.key].indexOf('{host} ') !== -1;
		name.textContent = found.host + (spaced ? ' ' : '');
		hint.append(...words(spaced ? book[found.key].replace('{host} ', '{host}') : book[found.key], 'host', name));
		if (found.fix) {
			const button = document.createElement(onFix ? 'button' : 'b');
			button.className = (onFix ? 'url-fix' : '') + ' notranslate';
			button.textContent = found.fix;
			if (onFix) {
				button.type = 'button';
				// Keeping focus keeps the box's list open, so the layout does not jump between press and release.
				button.addEventListener('mousedown', (event) => event.preventDefault());
				button.addEventListener('click', () => onFix(found.fix));
			}
			hint.append(' ', ...words(book.mean, 'fix', button));
		}
	}

	// A textarea holds one address per line; predictions and the check follow the line under the caret.
	function lineBox(input) {
		if (input.tagName !== 'TEXTAREA') {
			return {
				get: () => input.value,
				set: (value) => {
					input.value = value;
				},
				at: () => 0,
			};
		}
		const span = () => {
			const value = input.value;
			const caret = input.selectionStart == null ? value.length : input.selectionStart;
			const start = value.lastIndexOf('\n', caret - 1) + 1;
			const end = value.indexOf('\n', caret);
			return { start, end: end === -1 ? value.length : end };
		};
		return {
			get: () => {
				const s = span();
				return input.value.slice(s.start, s.end);
			},
			set: (value) => {
				const s = span();
				input.value = input.value.slice(0, s.start) + value + input.value.slice(s.end);
				input.setSelectionRange(s.start + value.length, s.start + value.length);
			},
			at: () => span().start,
		};
	}

	function attach(inputId, fieldId, track) {
		const input = document.getElementById(inputId);
		const field = document.getElementById(fieldId);
		if (!input || !field) return;
		const box = lineBox(input);

		let seq = 0;
		let timer = 0;
		let options = [];
		let mode = 'host';
		let active = -1;
		let picking = false;

		const list = document.createElement('ul');
		list.id = inputId + '-suggest';
		list.className = 'url-suggest notranslate';
		list.setAttribute('role', 'listbox');
		list.setAttribute('aria-label', book.sites);
		list.hidden = true;
		field.after(list);

		const hint = document.createElement('p');
		hint.id = inputId + '-hint';
		hint.className = 'url-hint';
		hint.setAttribute('aria-live', 'polite');
		if (book !== T.en) {
			hint.lang = code;
			hint.setAttribute('translate', 'no');
		}
		(document.getElementById(inputId + '-error') || list).after(hint);

		input.setAttribute('role', 'combobox');
		input.setAttribute('aria-autocomplete', 'list');
		input.setAttribute('aria-controls', list.id);
		input.setAttribute('aria-expanded', 'false');
		input.setAttribute('aria-describedby', hint.id);

		function render() {
			// A field filled from elsewhere (the hero fills the request's) keeps its list shut until it has focus.
			if (document.activeElement !== input) options = [];
			list.setAttribute('aria-label', mode === 'path' ? book.pages : book.sites);
			list.replaceChildren(
				...options.map((option, index) => {
					const item = document.createElement('li');
					item.id = inputId + '-opt-' + index;
					item.setAttribute('role', 'option');
					item.setAttribute('aria-selected', index === active ? 'true' : 'false');
					item.textContent = option;
					item.addEventListener('mousedown', (event) => event.preventDefault());
					item.addEventListener('click', () => choose(index));
					return item;
				})
			);
			list.hidden = !options.length;
			input.setAttribute('aria-expanded', options.length ? 'true' : 'false');
			if (active >= 0 && options[active]) input.setAttribute('aria-activedescendant', inputId + '-opt-' + active);
			else input.removeAttribute('aria-activedescendant');
		}

		function close() {
			options = [];
			active = -1;
			render();
		}

		function fill(value, how) {
			picking = true;
			box.set(value);
			input.dispatchEvent(new Event('input', { bubbles: true }));
			picking = false;
			close();
			check();
			input.focus();
			if (window.SiteAnalytics) SiteAnalytics.trackEvent('qa_review_url_suggest', 'URL Review', track + how);
		}

		function pick(host, how) {
			fill(host + box.get().trim().slice(hostPart(box.get()).length), how);
		}

		function pickPath(path) {
			fill(box.get().trim().match(/^(https?:\/\/)?[^/?#]*/i)[0] + path, 'path');
		}

		function choose(index) {
			if (mode === 'path') pickPath(options[index]);
			else pick(options[index], 'list');
		}

		async function suggestPaths(mine, host, typed) {
			if (!looksComplete(host)) return close();
			const state = await resolve(host);
			if (mine !== seq) return;
			if (state !== 'found') return close();
			const pool = await pathsFor(host);
			if (mine !== seq) return;
			const want = typed.toLowerCase();
			const starts = pool.filter(
				(path) => path !== typed && path.toLowerCase().startsWith(want) && (want !== '/' || !codePath(path))
			);
			const within =
				want.length > 1
					? pool.filter((path) => !path.toLowerCase().startsWith(want) && path.toLowerCase().includes(want))
					: [];
			options = starts.concat(within).slice(0, SHOWN);
			mode = 'path';
			active = -1;
			render();
		}

		async function suggest() {
			const mine = ++seq;
			const value = box.get();
			const typed = value.trim().replace(/^https?:\/\//i, '');
			const slash = typed.indexOf('/');
			if (slash > 0 && !/[?#]/.test(typed))
				return suggestPaths(mine, typed.slice(0, slash).toLowerCase(), typed.slice(slash));
			const host = hostPart(value);
			const key = keyOf(host);
			if (/[/?#]/.test(value) || key.length < 2) return close();
			const pool = await shardFor(key);
			if (mine !== seq) return;
			const matches = [];
			for (const candidate of pool) {
				if (keyOf(candidate).startsWith(key) || candidate.startsWith(host)) matches.push(candidate);
				if (matches.length === SHOWN) break;
			}
			options = matches.length === 1 && matches[0] === host ? [] : matches;
			mode = 'host';
			active = -1;
			render();
		}

		async function check() {
			const host = hostPart(box.get());
			if (!looksComplete(host)) return paint(hint, null);
			const found = await verdict(host);
			if (host !== hostPart(box.get())) return;
			paint(hint, found, (fix) => pick(fix, 'did-you-mean'));
		}

		input.addEventListener('input', () => {
			if (picking) return;
			suggest();
			clearTimeout(timer);
			paint(hint, null);
			timer = setTimeout(check, 500);
		});

		if (input.tagName === 'TEXTAREA') {
			// Moving to another line (click or arrows) checks that line instead.
			let line = -1;
			const moved = () => {
				if (box.at() === line) return;
				line = box.at();
				close();
				check();
			};
			input.addEventListener('click', moved);
			input.addEventListener('keyup', (event) => {
				if (list.hidden && /^(Arrow|Home|End|Page)/.test(event.key)) moved();
			});
			input.addEventListener('input', () => {
				line = box.at();
			});
		}

		input.addEventListener('keydown', (event) => {
			if (list.hidden) return;
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				const step = event.key === 'ArrowDown' ? 1 : -1;
				active = (active + step + options.length + 1) % (options.length + 1);
				if (active === options.length) active = -1;
				render();
			} else if ((event.key === 'Enter' || event.key === 'Tab') && active >= 0) {
				if (event.key === 'Enter') event.preventDefault();
				choose(active);
			} else if (event.key === 'Escape') {
				event.preventDefault();
				close();
			}
		});

		input.addEventListener('blur', close);
		input.addEventListener('focus', suggest);
	}

	window.UrlSuggest = { verdict, paint, hostPart };

	attach('url', 'url-field', '');
	attach('batch-text', 'batch-text', 'bulk-');
	attach('stage-url', 'stage-url-field', 'hero-');
	attach('compare-url', 'compare-url-field', 'compare-');
	[2, 3, 4, 5].forEach((n) => attach('compare-url-' + n, 'compare-url-' + n + '-field', 'compare-'));
})();
