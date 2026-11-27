/* Entry soft-gate motion (#4442 / design #4440): 5s phrase fade only.
   3D stays on existing Three.js hero (Gemini option A). Additive — no soft-gate / qa-review.js changes. */
(function (global) {
	'use strict';

	const INTERVAL_MS = 5000;
	const FADE_MS = 900;

	const PHRASES = [
		{
			brand: 'QA-lab URL Review',
			lines: ['Find the leaks,', 'breaks and blocks', 'before customers', 'or regulators do.'],
			em: 1,
			lede: 'QA-lab URL Review tells you whether your site is safe, and looks deeper than most checkers: phishing and malware lists, signs of a hacked site, lookalike domains and every host your pages load or link to. If something needs fixing, we fix it at a fixed price, then re-review it for free.',
		},
		{
			brand: 'Safe · Fast · Clear',
			lines: ['See the cracks', 'before the breach', 'makes the news.'],
			em: 1,
			lede: 'Web Risk, PageSpeed, and host lookalikes on the first public page — soft preview scores and the top finding with no account.',
		},
		{
			brand: 'One address to begin',
			lines: ['Paste a URL.', 'Watch the lab', 'try the page.'],
			em: 2,
			lede: 'Lab Tries runs while you wait. Soft preview gifts real scores and the top finding. Sign in only when you unlock a full site audit.',
		},
		{
			brand: 'Fix · then re-review',
			lines: ['We find it.', 'We can fix it', 'at a fixed price.'],
			em: 0,
			lede: 'Fixed-price remediation, then a free re-review so the report stays honest. If the first run cannot finish, we keep trying and email your report.',
		},
		{
			brand: 'Unlock when ready',
			lines: ['Scores first.', 'Full audit when', 'you need the seal.'],
			em: 0,
			lede: 'Sign in only to unlock print, share, export, and the full site audit — not to start the soft preview.',
		},
	];

	function reduceMotion() {
		return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function linesHtml(p) {
		return p.lines
			.map(function (line, i) {
				const cls = i === p.em ? ' class="display-em"' : '';
				return '<span' + cls + '>' + line + '</span>';
			})
			.join('');
	}

	function boot(root) {
		const doc = root || document;
		const stage = doc.querySelector('section.stage');
		const title = doc.getElementById('studio-title');
		const eyebrow = stage && stage.querySelector('.stage-copy > .eyebrow');
		const lede = stage && stage.querySelector('.stage-copy > .lede');
		if (!stage || !title) return null;

		stage.classList.add('entry-motion');

		let dots = stage.querySelector('.entry-phrase-dots');
		if (!dots) {
			dots = document.createElement('div');
			dots.className = 'entry-phrase-dots';
			dots.setAttribute('role', 'tablist');
			dots.setAttribute('aria-label', 'Hero phrases');
			title.insertAdjacentElement('afterend', dots);
			PHRASES.forEach(function (_, i) {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.setAttribute('role', 'tab');
				btn.setAttribute('aria-label', 'Phrase ' + (i + 1));
				btn.addEventListener('click', function () {
					paint(i, true);
					arm();
				});
				dots.appendChild(btn);
			});
		}

		let idx = 0;
		let timer = null;
		let busy = false;

		function syncDots() {
			Array.prototype.forEach.call(dots.children, function (dot, i) {
				dot.classList.toggle('on', i === idx);
				dot.setAttribute('aria-selected', i === idx ? 'true' : 'false');
			});
		}

		function applyChrome(p) {
			if (eyebrow) eyebrow.textContent = p.brand;
			if (lede) lede.textContent = p.lede;
		}

		function paint(i, animate) {
			if (busy && animate) return;
			const p = PHRASES[i % PHRASES.length];
			idx = i % PHRASES.length;
			syncDots();

			if (!animate || reduceMotion()) {
				title.innerHTML = linesHtml(p);
				title.classList.remove('is-out');
				title.classList.add('is-in');
				if (eyebrow) eyebrow.classList.remove('entry-fade');
				if (lede) lede.classList.remove('entry-fade');
				applyChrome(p);
				return;
			}

			busy = true;
			if (eyebrow) eyebrow.classList.add('entry-fade');
			if (lede) lede.classList.add('entry-fade');
			title.classList.remove('is-in');
			title.classList.add('is-out');

			global.setTimeout(function () {
				title.innerHTML = linesHtml(p);
				applyChrome(p);
				title.classList.remove('is-out');
				void title.offsetWidth;
				title.classList.add('is-in');
				if (eyebrow) eyebrow.classList.remove('entry-fade');
				if (lede) lede.classList.remove('entry-fade');
				busy = false;
			}, FADE_MS);
		}

		function next() {
			paint(idx + 1, true);
		}

		function arm() {
			global.clearInterval(timer);
			if (reduceMotion()) return;
			timer = global.setInterval(next, INTERVAL_MS);
		}

		title.classList.add('entry-phrase');
		paint(0, false);
		arm();

		const api = {
			phrases: PHRASES,
			paint: paint,
			next: next,
			stop: function () {
				global.clearInterval(timer);
			},
			destroy: function () {
				global.clearInterval(timer);
			},
		};
		stage._entryMotion = api;
		return api;
	}

	const api = { PHRASES: PHRASES, INTERVAL_MS: INTERVAL_MS, FADE_MS: FADE_MS, boot: boot };
	global.QAReviewEntryMotion = api;

	function docReady(d) {
		return d && (d.readyState === 'interactive' || d.readyState === 'complete');
	}

	if (docReady(global.document)) boot();
	else
		global.document.addEventListener('DOMContentLoaded', function () {
			boot();
		});

	if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
