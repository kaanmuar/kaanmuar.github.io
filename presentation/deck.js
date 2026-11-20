// Navigation for the plain-language feature deck (#3931). No libraries.
(function () {
	'use strict';
	var stage = document.getElementById('stage');
	var slides = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
	var total = slides.length;
	var cur = -1;
	var autoTimer = null;
	var body = document.body;
	var progress = document.querySelector('.progress i');
	var count = document.getElementById('count');
	var sayit = document.getElementById('sayit-text');
	var hudSec = document.getElementById('hud-sec');
	var grid = document.getElementById('grid');
	var capture = /[?&]capture=/.test(location.search);

	// scale the fixed stage to the window; a tall window gets the tall stage
	function fit() {
		var w = window.innerWidth;
		var h = window.innerHeight;
		var portrait = h > w * 1.1;
		var sw = portrait ? 720 : 1280;
		var sh = portrait ? 1280 : 720;
		stage.style.setProperty('--sw', sw + 'px');
		stage.style.setProperty('--sh', sh + 'px');
		stage.style.setProperty('--sc', Math.min(w / sw, h / sh));
		stage.classList.toggle('portrait', portrait);
	}
	window.addEventListener('resize', fit);
	fit();

	function media(slide, on) {
		slide.querySelectorAll('video').forEach(function (v) {
			if (on) {
				var p = v.play();
				if (p && p.catch) p.catch(function () {});
			} else {
				v.pause();
			}
		});
	}

	function go(i, instant) {
		i = Math.max(0, Math.min(total - 1, i));
		if (i === cur) return;
		var dir = i > cur ? 'fwd' : 'back';
		var old = slides[cur];
		var next = slides[i];
		if (old) {
			old.classList.remove('active', 'fwd', 'back');
			old.classList.add('leaving', dir);
			old.setAttribute('aria-hidden', 'true');
			old.inert = true;
			media(old, false);
			setTimeout(
				function () {
					old.classList.remove('leaving', 'fwd', 'back');
				},
				instant ? 0 : 600
			);
		}
		next.classList.remove('leaving');
		next.classList.add('active', dir);
		next.removeAttribute('aria-hidden');
		next.inert = false;
		media(next, true);
		cur = i;
		progress.style.width = (total > 1 ? (i / (total - 1)) * 100 : 100) + '%';
		count.textContent = i + 1 + ' / ' + total;
		sayit.textContent = next.getAttribute('data-notes') || '';
		var sec = next.getAttribute('data-sec');
		hudSec.textContent = sec ? ' · ' + sec : '';
		if (history.replaceState) history.replaceState(null, '', '#' + (i + 1));
		Array.prototype.forEach.call(grid.querySelectorAll('button'), function (b, k) {
			b.classList.toggle('cur', k === i);
		});
	}

	function step(d) {
		go(cur + d);
	}
	function setAuto(on) {
		var b = document.getElementById('b-auto');
		b.setAttribute('aria-pressed', on ? 'true' : 'false');
		b.textContent = on ? '⏸' : '▶';
		b.setAttribute('aria-label', on ? 'Pause auto-play' : 'Auto-play');
		clearInterval(autoTimer);
		if (on) {
			autoTimer = setInterval(function () {
				if (cur >= total - 1) return setAuto(false);
				step(1);
			}, 9000);
		}
	}
	function toggleGrid(on) {
		grid.hidden = on === undefined ? !grid.hidden : !on;
		if (!grid.hidden) {
			var c = grid.querySelector('button.cur');
			if (c) c.focus();
		}
	}
	function toggleNotes() {
		var on = body.classList.toggle('notes-on');
		document.getElementById('b-notes').setAttribute('aria-pressed', on ? 'true' : 'false');
	}
	function fullscreen() {
		if (document.fullscreenElement) document.exitFullscreen();
		else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
	}

	document.getElementById('b-prev').onclick = function () { step(-1); };
	document.getElementById('b-next').onclick = function () { step(1); };
	document.getElementById('b-grid').onclick = function () { toggleGrid(); };
	document.getElementById('b-notes').onclick = toggleNotes;
	document.getElementById('b-full').onclick = fullscreen;
	document.getElementById('b-auto').onclick = function () { setAuto(this.getAttribute('aria-pressed') !== 'true'); };
	Array.prototype.forEach.call(grid.querySelectorAll('button'), function (b, k) {
		b.onclick = function () { toggleGrid(false); go(k); };
	});

	document.addEventListener('keydown', function (e) {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		var k = e.key;
		if (k === 'Escape' && document.querySelector('.win.big')) return;
		if (!grid.hidden) {
			if (k === 'Escape' || k === 'g' || k === 'G') toggleGrid(false);
			return;
		}
		if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') { e.preventDefault(); step(1); }
		else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); step(-1); }
		else if (k === 'Home') go(0);
		else if (k === 'End') go(total - 1);
		else if (k === 'g' || k === 'G' || k === 'Escape') toggleGrid(true);
		else if (k === 'n' || k === 'N') toggleNotes();
		else if (k === 'f' || k === 'F') fullscreen();
		else if (k === 'p' || k === 'P') setAuto(document.getElementById('b-auto').getAttribute('aria-pressed') !== 'true');
	});

	// swipe on touch screens
	var sx = null;
	var sy = null;
	document.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
	document.addEventListener('touchend', function (e) {
		if (sx === null) return;
		var dx = e.changedTouches[0].clientX - sx;
		var dy = e.changedTouches[0].clientY - sy;
		sx = null;
		if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
	});

	// click a picture to see it big
	stage.addEventListener('click', function (e) {
		var w = e.target.closest && e.target.closest('.win');
		if (w && !w.classList.contains('tall')) w.classList.toggle('big');
	});
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape') {
			var big = document.querySelector('.win.big');
			if (big) big.classList.remove('big');
		}
	});

	var start = parseInt((location.hash || '').slice(1), 10);
	go(isNaN(start) ? 0 : start - 1, true);
	if (capture) body.classList.add('capture');
	window.deck = { go: go, total: total };
})();
