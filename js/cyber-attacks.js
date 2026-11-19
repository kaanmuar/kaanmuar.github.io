(function () {
	'use strict';

	const SVG_NS = 'http://www.w3.org/2000/svg';
	const REFRESH_MS = 5 * 60 * 1000;
	const THEME_LABELS = {
		CYBER_ATTACK: 'Cyber attack',
		RANSOMWARE: 'Ransomware',
		RANSOM: 'Ransomware',
		DATA_BREACH: 'Data breach',
		DDOS: 'DDoS',
		MALWARE: 'Malware',
		PHISH: 'Phishing',
		WB_2463_CYBER_SECURITY: 'Cybersecurity',
		WB_678_DIGITAL_SECURITY: 'Digital security',
	};

	function apiBase() {
		const host = location.hostname;
		if (host === '127.0.0.1' || host === 'localhost') return 'http://127.0.0.1:8768';
		return 'https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl';
	}

	const namesApi = typeof Intl !== 'undefined' && Intl.DisplayNames
		? new Intl.DisplayNames(['en'], { type: 'region' })
		: null;

	function countryName(cc) {
		if (!cc) return 'Unknown';
		try {
			return (namesApi && namesApi.of(cc)) || cc;
		} catch (error) {
			return cc;
		}
	}

	function cleanTheme(raw) {
		const up = String(raw || '').toUpperCase();
		for (const key of Object.keys(THEME_LABELS)) {
			if (up.indexOf(key) !== -1) return THEME_LABELS[key];
		}
		return String(raw || '').replace(/_/g, ' ').toLowerCase();
	}

	function formatTime(iso) {
		if (!iso) return '—';
		const ms = Date.parse(iso);
		if (!Number.isFinite(ms)) return iso;
		return new Date(ms).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function fillColor(count, maxCount) {
		if (!count || !maxCount) return '#16323b';
		const t = Math.sqrt(Math.min(1, count / maxCount));
		if (t < 0.45) {
			const k = t / 0.45;
			return 'rgb(' + Math.round(28 + k * 49) + ',' + Math.round(68 + k * 111) + ',' + Math.round(78 + k * 109) + ')';
		}
		if (t < 0.78) {
			const k = (t - 0.45) / 0.33;
			return 'rgb(' + Math.round(77 + k * 149) + ',' + Math.round(179 + k * 17) + ',' + Math.round(187 - k * 49) + ')';
		}
		const k = (t - 0.78) / 0.22;
		return 'rgb(' + Math.round(226 + k * 17) + ',' + Math.round(196 - k * 42) + ',' + Math.round(138 + k * 1) + ')';
	}

	const state = {
		world: null,
		payload: null,
		range: 'live',
		selectedCc: '',
		theme: '',
		q: '',
		loading: false,
	};

	const els = {
		status: document.getElementById('map-status'),
		svgWrap: document.getElementById('map-svg-wrap'),
		tooltip: document.getElementById('map-tooltip'),
		legendMax: document.getElementById('map-legend-max'),
		clearBtn: document.getElementById('map-clear-country'),
		countryTitle: document.getElementById('country-panel-title'),
		countryBody: document.getElementById('country-panel-body'),
		topList: document.getElementById('map-top-countries'),
		eventsList: document.getElementById('map-events'),
		feedSubtitle: document.getElementById('feed-subtitle'),
		feedCount: document.getElementById('feed-count'),
		kpiMentions: document.getElementById('kpi-mentions'),
		kpiCountries: document.getElementById('kpi-countries'),
		kpiKev: document.getElementById('kpi-kev'),
		kpiKevVer: document.getElementById('kpi-kev-ver'),
		kpiDrop: document.getElementById('kpi-drop'),
		attributions: document.getElementById('map-attributions'),
		searchInput: document.getElementById('map-q'),
		autoToggle: document.getElementById('map-auto'),
		refreshBtn: document.getElementById('map-refresh'),
	};

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text != null) node.textContent = String(text);
		return node;
	}

	function countryMap() {
		const map = {};
		const rows = (state.payload && state.payload.countries) || [];
		rows.forEach((row) => {
			map[row.cc] = row;
		});
		return map;
	}

	function filteredEvents() {
		const events = (state.payload && state.payload.events) || [];
		const q = state.q.trim().toLowerCase();
		const cc = state.selectedCc;
		const theme = state.theme.toUpperCase();
		return events.filter((ev) => {
			if (cc && (!Array.isArray(ev.countries) || ev.countries.indexOf(cc) === -1)) return false;
			if (theme && (!Array.isArray(ev.themes) || !ev.themes.some((t) => String(t).toUpperCase().indexOf(theme) !== -1))) {
				return false;
			}
			if (q) {
				const hay = [
					ev.source,
					ev.host,
					ev.url,
					(ev.themes || []).join(' '),
					(ev.countries || []).map((c) => c + ' ' + countryName(c)).join(' '),
				]
					.join(' ')
					.toLowerCase();
				if (hay.indexOf(q) === -1) return false;
			}
			return true;
		});
	}

	function selectCountry(cc) {
		state.selectedCc = state.selectedCc === cc ? '' : cc;
		render();
	}

	function renderSvg() {
		if (!state.world) return;
		const world = state.world;
		const byCc = countryMap();
		const rows = (state.payload && state.payload.countries) || [];
		const maxCount = rows.length ? rows[0].count : 0;
		els.legendMax.textContent = maxCount ? maxCount.toLocaleString('en-US') + ' mentions' : 'High density';

		const svg = document.createElementNS(SVG_NS, 'svg');
		svg.setAttribute('class', 'map-world-svg');
		svg.setAttribute('viewBox', '0 0 ' + world.w + ' ' + world.h);
		svg.setAttribute('role', 'group');
		svg.setAttribute('aria-label', 'World map of reported cyber attacks and data breaches');

		const addShape = (cc, isDot) => {
			const row = byCc[cc];
			const count = row ? row.count : 0;
			const name = countryName(cc);
			const label = name + (count ? ': ' + count + ' mentions' : ': no mentions in window');
			const node = document.createElementNS(SVG_NS, isDot ? 'circle' : 'path');
			if (isDot) {
				const pt = world.dots[cc];
				node.setAttribute('cx', String(pt[0]));
				node.setAttribute('cy', String(pt[1]));
				node.setAttribute('r', '4.2');
			} else {
				node.setAttribute('d', world.shapes[cc]);
			}
			node.setAttribute('class', 'map-cc' + (state.selectedCc === cc ? ' is-selected' : ''));
			node.setAttribute('data-cc', cc);
			node.setAttribute('fill', fillColor(count, maxCount));
			node.setAttribute('tabindex', '0');
			node.setAttribute('role', 'button');
			node.setAttribute('aria-label', label);
			node.setAttribute('aria-pressed', state.selectedCc === cc ? 'true' : 'false');

			const title = document.createElementNS(SVG_NS, 'title');
			title.textContent = label;
			node.appendChild(title);

			node.addEventListener('mouseenter', () => {
				els.tooltip.textContent = label + (row && row.share ? ' (' + row.share + '% of global)' : '');
			});
			node.addEventListener('click', () => selectCountry(cc));
			node.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					selectCountry(cc);
				}
			});
			svg.appendChild(node);
		};

		Object.keys(world.shapes || {})
			.sort((a, b) => (state.selectedCc === a ? 1 : state.selectedCc === b ? -1 : 0))
			.forEach((cc) => addShape(cc, false));

		Object.keys(world.dots || {})
			.filter((cc) => !world.shapes[cc] && byCc[cc])
			.forEach((cc) => addShape(cc, true));

		els.svgWrap.replaceChildren(svg);
	}

	function renderCountryPanel() {
		const byCc = countryMap();
		const cc = state.selectedCc;
		els.clearBtn.hidden = !cc;

		if (!cc) {
			els.countryTitle.textContent = 'Selected country';
			els.countryBody.replaceChildren(
				el('p', 'map-muted', 'Click any country on the map or ranked list to narrow the live cyber-attack feed.')
			);
			return;
		}
		const name = countryName(cc);
		const row = byCc[cc];
		els.countryTitle.textContent = name + ' (' + cc + ')';
		const frag = document.createDocumentFragment();
		const stat = el('div', 'map-country-stat');
		stat.appendChild(el('strong', '', 'Mentions in window'));
		stat.appendChild(el('span', '', row ? row.count.toLocaleString('en-US') + ' (' + row.share + '%)' : '0'));
		frag.appendChild(stat);
		const matching = filteredEvents();
		frag.appendChild(
			el('p', 'map-muted', matching.length + ' recent cyber/breach report(s) referencing ' + name + '.')
		);
		els.countryBody.replaceChildren(frag);
	}

	function renderTopCountries() {
		const q = state.q.trim().toLowerCase();
		const rows = ((state.payload && state.payload.countries) || []).filter((r) => {
			if (!q) return true;
			return r.cc.toLowerCase().indexOf(q) !== -1 || countryName(r.cc).toLowerCase().indexOf(q) !== -1;
		});
		const maxCount = rows.length ? rows[0].count : 1;
		els.topList.replaceChildren();
		rows.slice(0, 12).forEach((row) => {
			const li = document.createElement('li');
			const btn = el('button', 'map-rank-btn');
			btn.type = 'button';
			btn.setAttribute('aria-pressed', state.selectedCc === row.cc ? 'true' : 'false');
			btn.appendChild(el('span', 'map-rank-cc', row.cc));

			const center = document.createElement('span');
			center.appendChild(document.createTextNode(countryName(row.cc)));
			const bar = el('span', 'map-rank-bar');
			const fill = document.createElement('i');
			fill.style.width = Math.max(4, Math.round((row.count / maxCount) * 100)) + '%';
			bar.appendChild(fill);
			center.appendChild(bar);
			btn.appendChild(center);

			btn.appendChild(el('span', 'map-rank-num', row.count.toLocaleString('en-US')));
			btn.addEventListener('click', () => selectCountry(row.cc));
			li.appendChild(btn);
			els.topList.appendChild(li);
		});
		if (!rows.length) {
			els.topList.appendChild(el('li', 'map-muted', 'No cited countries match that filter in this timeframe.'));
		}
	}

	function renderEvents() {
		const events = filteredEvents();
		els.feedCount.textContent = events.length + (events.length === 1 ? ' item' : ' items');
		els.feedSubtitle.textContent = state.selectedCc
			? 'Public cyber-attack and breach reports mentioning ' + countryName(state.selectedCc) + '.'
			: 'Latest public reports matching cyber attack, ransomware, data breach, and DDoS themes.';
		els.eventsList.replaceChildren();
		events.slice(0, 40).forEach((ev) => {
			const li = el('li', 'map-event');
			const meta = el('div', 'map-event-meta');
			meta.appendChild(el('span', 'map-event-source', ev.source || ev.host || 'News'));
			meta.appendChild(el('span', '', formatTime(ev.date)));
			li.appendChild(meta);

			const link = el('a', 'map-event-url', ev.url.replace(/^https?:\/\//i, ''));
			link.href = ev.url;
			link.target = '_blank';
			link.rel = 'noopener noreferrer';
			li.appendChild(link);

			const tags = el('div', 'map-event-tags');
			(ev.themes || []).slice(0, 3).forEach((t) => tags.appendChild(el('span', 'map-tag', cleanTheme(t))));
			(ev.countries || []).slice(0, 5).forEach((cc) => {
				const btn = el('button', 'map-tag map-tag-cc', cc);
				btn.type = 'button';
				btn.title = 'Filter by ' + countryName(cc);
				btn.addEventListener('click', () => selectCountry(cc));
				tags.appendChild(btn);
			});
			li.appendChild(tags);
			els.eventsList.appendChild(li);
		});
		if (!events.length) {
			els.eventsList.appendChild(
				el('li', 'map-muted', 'No recent event headlines match the active filters in this window.')
			);
		}
	}

	function render() {
		const p = state.payload || {};
		const totals = p.totalsByRange || {};
		['live', '7d', '30d', '90d'].forEach((r) => {
			const badge = document.getElementById('count-' + r);
			if (badge) badge.textContent = totals[r] != null ? Number(totals[r]).toLocaleString('en-US') : '—';
		});
		document.querySelectorAll('.map-pill[data-range]').forEach((btn) => {
			btn.setAttribute('aria-pressed', btn.getAttribute('data-range') === state.range ? 'true' : 'false');
		});
		document.querySelectorAll('.map-chip[data-theme]').forEach((btn) => {
			btn.setAttribute('aria-pressed', btn.getAttribute('data-theme') === state.theme ? 'true' : 'false');
		});

		els.kpiMentions.textContent = p.totalMentions != null ? Number(p.totalMentions).toLocaleString('en-US') : '—';
		els.kpiCountries.textContent = p.countryCount != null ? Number(p.countryCount).toLocaleString('en-US') : '—';
		const kev = p.kevSummary || {};
		els.kpiKev.textContent = kev.count ? Number(kev.count).toLocaleString('en-US') : '—';
		els.kpiKevVer.textContent = kev.version ? 'v' + kev.version : '';
		const drop = p.dropSummary || {};
		els.kpiDrop.textContent = drop.v4Ranges ? Number(drop.v4Ranges).toLocaleString('en-US') : '—';

		if (Array.isArray(p.attributions) && p.attributions.length) {
			els.attributions.textContent = 'Sources: ' + p.attributions.join(' · ') + '. Public context only — customer site reviews stay private.';
		}

		renderSvg();
		renderCountryPanel();
		renderTopCountries();
		renderEvents();
	}

	async function loadWorld() {
		if (state.world) return state.world;
		const res = await fetch('assets/jarvis/world.json?v=3819a');
		if (!res.ok) throw new Error('Could not load world projection');
		state.world = await res.json();
		return state.world;
	}

	async function loadGlobal(rangeOverride) {
		if (state.loading) return;
		state.loading = true;
		if (rangeOverride) state.range = rangeOverride;
		els.refreshBtn.disabled = true;
		try {
			const [_, res] = await Promise.all([
				loadWorld(),
				fetch(apiBase() + '/threats/global?range=' + encodeURIComponent(state.range)),
			]);
			if (!res.ok) throw new Error('Global threat feed returned ' + res.status);
			state.payload = await res.json();
			const whenText = state.payload.updatedAt ? formatTime(state.payload.updatedAt) : 'now';
			const sliceInfo = state.payload.slice ? ' · GDELT slice ' + state.payload.slice : '';
			els.status.textContent = 'Updated ' + whenText + sliceInfo + ' · Context only (no customer sites)';
			render();
		} catch (error) {
			els.status.textContent = 'Global feed temporarily unavailable. Showing cached projection only.';
			renderSvg();
		} finally {
			state.loading = false;
			els.refreshBtn.disabled = false;
		}
	}

	document.querySelectorAll('.map-pill[data-range]').forEach((btn) => {
		btn.addEventListener('click', () => loadGlobal(btn.getAttribute('data-range') || 'live'));
	});
	document.querySelectorAll('.map-chip[data-theme]').forEach((btn) => {
		btn.addEventListener('click', () => {
			state.theme = btn.getAttribute('data-theme') || '';
			render();
		});
	});
	els.clearBtn.addEventListener('click', () => {
		state.selectedCc = '';
		render();
	});
	els.searchInput.addEventListener('input', () => {
		state.q = els.searchInput.value;
		renderTopCountries();
		renderEvents();
		renderCountryPanel();
	});
	els.refreshBtn.addEventListener('click', () => loadGlobal());

	let timer = setInterval(() => {
		if (els.autoToggle.checked && !document.hidden) loadGlobal();
	}, REFRESH_MS);
	els.autoToggle.addEventListener('change', () => {
		if (timer) clearInterval(timer);
		if (els.autoToggle.checked) {
			timer = setInterval(() => {
				if (!document.hidden) loadGlobal();
			}, REFRESH_MS);
		}
	});

	loadGlobal('live');
})();
