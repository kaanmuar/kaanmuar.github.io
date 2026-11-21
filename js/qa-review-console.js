/* Review console: the live monitor of a URL review, drawn in HTML and SVG so text, icons and characters stay
   sharp at any size and pixel density. js/qa-review-arena.js loads it and feeds it the state that the real review
   log lines produce; nothing here is invented. Entry point: ReviewConsole.mount(wrap, api).
   api = { model(): run state, hud(): { pct, phase, clock }, stages: facts STAGES }. */
(function () {
	'use strict';

	// ---------------------------------------------------------------- words
	const LANG = String(document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
	const T = {
		en: {
			brand: 'REVIEW MONITOR', brandLab: 'LAB TRIES', region: 'Live review monitor', regionLab: 'Browser pass / Lab tries',
			labTitle: 'BROWSER PASS / LAB TRIES', labLive: 'QA REVIEW LOG · LIVE', labProgress: 'PROGRESS',
			lanesTitleLab: 'LAB TRIES', lanesSubLab: 'One browser pass across every check',
			overview: 'Overview', systems: 'Systems', processes: 'Processes', agents: 'Agents', workflows: 'Workflows',
			infrastructure: 'Infrastructure', logs: 'Logs', alerts: 'Alerts', settings: 'Settings', all: 'All Processes',
			sub_overview: 'The review at a glance.',
			sub_systems: 'Every system this review checks, grouped by what it protects.',
			sub_processes: 'Manage and monitor any concurrent work across this review.',
			sub_all: 'Every process this review runs, with its current state.',
			sub_agents: 'The team doing the work, and how each one is doing.',
			sub_workflows: 'The seven steps from the first request to the signed report.',
			sub_infrastructure: 'The tools and public sources behind the checks.',
			sub_logs: 'Every line the review writes, as it happens.',
			sub_alerts: 'Anything slow, risky or failed.',
			sub_settings: 'How this monitor looks and refreshes. Saved on this device.',
			update: 'Update', allSystems: 'All Systems', autoRefresh: 'Auto-refresh', fullscreen: 'Full screen', exitFull: 'Exit full screen', enlarge: 'Tap to enlarge',
			paused: 'Paused. Press Update to catch up.', updated: 'Updated {t}', systemLabel: 'System filter',
			sysStatus: 'SYSTEM STATUS', target: 'Target', pagesLbl: 'Pages', elapsed: 'Elapsed', phase: 'Phase', state: 'State',
			pageOf: '{n} of {m}', pageN: '{n}',
			run_running: 'RUNNING', run_ready: 'REPORT READY', run_stopped: 'STOPPED', run_stopping: 'STOPPING', run_failed: 'ENDED EARLY', run_idle: 'WAITING',
			s_running: 'RUNNING', s_done: 'DONE', s_queued: 'QUEUED', s_risk: 'RISK', s_error: 'ERROR', s_skipped: 'SKIPPED',
			nominal: 'All systems nominal', attention: '{n} need a look', finished: 'Report ready. All checks finished', stoppedNote: 'Stopped. The pages already saved are kept',
			lanesTitle: 'CONCURRENT WORK ARCADE', lanesSub: 'URL review lanes running in parallel',
			laneReview: 'Review', laneBackground: 'Background', laneWatchdog: 'Watchdog', steps: '{n} steps',
			hzTimeout: 'Timeout', hzStop: 'Stop', hzRetry: 'Retry', hzSlow: 'Slow wait', hzFail: 'Fail',
			procTitle: 'PROCESSES', procSub: 'Active processes and their current state', viewAll: 'View All Processes', back: 'Back to Processes',
			colProcess: 'PROCESS', colType: 'TYPE', colLane: 'LANE / TARGET', colStatus: 'STATUS', colElapsed: 'ELAPSED', colSeen: 'LAST SEEN', colDetail: 'DETAIL',
			noneActive: 'Nothing is running right now.', noneMatch: 'No process matches.', allDone: 'Every process has finished.',
			search: 'Search processes', count: '{n} of {m} processes', ago: '{s} s ago', agoMin: '{m} min ago',
			g_connect: 'Connection', g_crawl: 'Crawl', g_browser: 'Browser pass', g_security: 'Security', g_mail: 'Mail', g_speed: 'Speed', g_report: 'Report',
			gs_connect: 'Address, HTTPS, DNS and certificate.', gs_crawl: 'robots.txt, links and the pages themselves.', gs_browser: 'Real Chrome, accessibility and cookie banner.',
			gs_security: 'Threat lists, hacked-site signs, lookalikes and WordPress.', gs_mail: 'SPF, DMARC and the sender records.', gs_speed: 'PageSpeed and real-user Chrome data.',
			gs_report: 'Cases, score, signature and delivery.',
			ov_progress: 'Progress', ov_checks: 'Checks done', ov_pages: 'Pages analyzed', ov_alerts: 'Alerts', ov_now: 'Right now', ov_lane: 'The review lane', ov_recent: 'Latest activity',
			ov_waiting: 'Waiting for the first line.', ov_none: 'None. All clear.', ov_open: 'Open alerts',
			agentWorking: 'Working on', agentIdle: 'Waiting for work', agentDone: 'All done', agentChecks: 'checks', agentRisks: 'risks', agentErrors: 'errors',
			mood_idle: 'Ready', mood_work: 'Working', mood_happy: 'Done and happy', mood_content: 'Going well', mood_worry: 'Worried', mood_dizzy: 'Something broke', mood_sleepy: 'Waiting on the site', mood_stop: 'Stopped',
			a_scout: 'Scout', a_sentry: 'Sentry', a_axel: 'Axel', a_pace: 'Pace', a_scribe: 'Scribe',
			ar_scout: 'Finds the address and reads the pages', ar_sentry: 'Guards the site: certificate, threats, mail', ar_axel: 'Drives a real browser for accessibility', ar_pace: 'Times the page on a phone', ar_scribe: 'Writes the cases, scores and signs the report',
			wfCurrent: 'Current step', wf_1: 'Connecting', wf_2: 'Analyzing pages', wf_3: 'Browser pass', wf_4: 'Writing cases', wf_5: 'Threat check', wf_6: 'Speed checks', wf_7: 'Scoring and signing',
			toolsLive: 'Tool', toolsSeen: 'Last seen',
			t_chrome: 'Headless Chrome', t_axe: 'axe-core', t_psi: 'PageSpeed Insights', t_crux: 'Chrome UX Report', t_dns: 'DNS and TLS', t_attack: 'Public attack lists',
			t_safe: 'Safe Browsing', t_spam: 'Spam blocklists', t_look: 'Lookalike scan', t_wp: 'WordPress reader', t_mail: 'Mail records', t_sign: 'Report signature', t_send: 'Report delivery',
			td_chrome: 'Opens the pages like a visitor, on phone and tablet sizes.', td_axe: 'Accessibility rules run on the rendered page.', td_psi: 'Lighthouse timing of the page on a phone.',
			td_crux: 'What real visitors measured on this site.', td_dns: 'Records, certificate chain and registration.', td_attack: 'CISA KEV, OSV, Feodo and Spamhaus DROP. Public sources only.',
			td_safe: 'Google lists of phishing and malware.', td_spam: 'Whether the domain is on spam lists.', td_look: 'Look-alike domains that could mislead visitors.', td_wp: 'Plugins and themes seen, with versions.',
			td_mail: 'SPF, DKIM, DMARC, MTA-STS and BIMI.', td_sign: 'Seals the report so it can be checked later.', td_send: 'Saves the report and emails a copy.',
			logAll: 'All', logInfo: 'Progress', logRisk: 'Risk', logError: 'Errors', logFollow: 'Follow', logCopy: 'Copy log', logCopied: 'Copied', logSearch: 'Search the log', logEmpty: 'No lines yet.',
			alertEmpty: 'No alerts. Everything this review checked has gone through cleanly.', alertWarn: 'Warning', alertErr: 'Error',
			setMotion: 'Motion', setMotionAuto: 'Follow my device', setMotionFull: 'Full', setMotionOff: 'Off',
			setDensity: 'Density', setComfort: 'Comfortable', setCompact: 'Compact',
			setRate: 'Refresh rate', setLive: 'Live', setFaces: 'Show characters on the lanes', setReset: 'Reset to defaults',
			setMotionNote: 'Off stops every animation. Following your device respects reduced motion.', setRateNote: 'Slower rates batch the updates. Update always catches up at once.',
			saved: 'Saved on this device only.'
		},
		es: {
			brand: 'MONITOR DE REVISIÓN', brandLab: 'PRUEBAS DE LAB', region: 'Monitor de la revisión en vivo', regionLab: 'Pase del navegador / Pruebas de lab',
			labTitle: 'PASE DEL NAVEGADOR / PRUEBAS DE LAB', labLive: 'REGISTRO DE REVISIÓN · EN VIVO', labProgress: 'PROGRESO',
			lanesTitleLab: 'PRUEBAS DE LAB', lanesSubLab: 'Un pase del navegador por cada comprobación',
			overview: 'Resumen', systems: 'Sistemas', processes: 'Procesos', agents: 'Agentes', workflows: 'Flujos',
			infrastructure: 'Infraestructura', logs: 'Registro', alerts: 'Alertas', settings: 'Ajustes', all: 'Todos los procesos',
			sub_overview: 'La revisión de un vistazo.', sub_systems: 'Cada sistema que revisa esta revisión, agrupado por lo que protege.',
			sub_processes: 'Gestiona y supervisa todo el trabajo simultáneo de esta revisión.', sub_all: 'Todos los procesos de esta revisión, con su estado actual.',
			sub_agents: 'El equipo que hace el trabajo y cómo le va a cada uno.', sub_workflows: 'Los siete pasos desde la solicitud hasta el informe firmado.',
			sub_infrastructure: 'Las herramientas y fuentes públicas detrás de las comprobaciones.', sub_logs: 'Cada línea que escribe la revisión, en el momento.',
			sub_alerts: 'Todo lo lento, arriesgado o fallido.', sub_settings: 'Cómo se ve y se actualiza este monitor. Se guarda en este dispositivo.',
			update: 'Actualizar', allSystems: 'Todos los sistemas', autoRefresh: 'Actualización automática', fullscreen: 'Pantalla completa', exitFull: 'Salir de pantalla completa', enlarge: 'Toca para ampliar',
			paused: 'En pausa. Pulsa Actualizar para ponerte al día.', updated: 'Actualizado {t}', systemLabel: 'Filtro de sistema',
			sysStatus: 'ESTADO DEL SISTEMA', target: 'Destino', pagesLbl: 'Páginas', elapsed: 'Transcurrido', phase: 'Fase', state: 'Estado',
			pageOf: '{n} de {m}', pageN: '{n}',
			run_running: 'EN CURSO', run_ready: 'INFORME LISTO', run_stopped: 'DETENIDO', run_stopping: 'DETENIENDO', run_failed: 'TERMINÓ ANTES', run_idle: 'EN ESPERA',
			s_running: 'EN CURSO', s_done: 'LISTO', s_queued: 'EN COLA', s_risk: 'RIESGO', s_error: 'ERROR', s_skipped: 'OMITIDO',
			nominal: 'Todos los sistemas en orden', attention: '{n} requieren atención', finished: 'Informe listo. Todas las comprobaciones terminaron', stoppedNote: 'Detenido. Se conservan las páginas ya guardadas',
			lanesTitle: 'ARCADE DE TRABAJO EN PARALELO', lanesSub: 'Carriles de la revisión de URL en paralelo',
			laneReview: 'Revisión', laneBackground: 'Segundo plano', laneWatchdog: 'Vigilancia', steps: '{n} pasos',
			hzTimeout: 'Tiempo agotado', hzStop: 'Detener', hzRetry: 'Reintento', hzSlow: 'Espera lenta', hzFail: 'Fallo',
			procTitle: 'PROCESOS', procSub: 'Procesos activos y su estado actual', viewAll: 'Ver todos los procesos', back: 'Volver a Procesos',
			colProcess: 'PROCESO', colType: 'TIPO', colLane: 'CARRIL / DESTINO', colStatus: 'ESTADO', colElapsed: 'TIEMPO', colSeen: 'ÚLTIMA VEZ', colDetail: 'DETALLE',
			noneActive: 'Nada se está ejecutando ahora.', noneMatch: 'Ningún proceso coincide.', allDone: 'Todos los procesos terminaron.',
			search: 'Buscar procesos', count: '{n} de {m} procesos', ago: 'hace {s} s', agoMin: 'hace {m} min',
			g_connect: 'Conexión', g_crawl: 'Rastreo', g_browser: 'Navegador', g_security: 'Seguridad', g_mail: 'Correo', g_speed: 'Velocidad', g_report: 'Informe',
			gs_connect: 'Dirección, HTTPS, DNS y certificado.', gs_crawl: 'robots.txt, enlaces y las páginas.', gs_browser: 'Chrome real, accesibilidad y aviso de cookies.',
			gs_security: 'Listas de amenazas, señales de sitio hackeado, parecidos y WordPress.', gs_mail: 'SPF, DMARC y los registros del remitente.', gs_speed: 'PageSpeed y datos reales de Chrome.',
			gs_report: 'Casos, puntaje, firma y entrega.',
			ov_progress: 'Progreso', ov_checks: 'Comprobaciones listas', ov_pages: 'Páginas analizadas', ov_alerts: 'Alertas', ov_now: 'Ahora mismo', ov_lane: 'El carril de la revisión', ov_recent: 'Última actividad',
			ov_waiting: 'Esperando la primera línea.', ov_none: 'Ninguna. Todo en orden.', ov_open: 'Ver alertas',
			agentWorking: 'Trabajando en', agentIdle: 'Esperando trabajo', agentDone: 'Todo listo', agentChecks: 'comprobaciones', agentRisks: 'riesgos', agentErrors: 'errores',
			mood_idle: 'Listo', mood_work: 'Trabajando', mood_happy: 'Listo y contento', mood_content: 'Va bien', mood_worry: 'Preocupado', mood_dizzy: 'Algo falló', mood_sleepy: 'Esperando al sitio', mood_stop: 'Detenido',
			ar_scout: 'Encuentra la dirección y lee las páginas', ar_sentry: 'Vigila el sitio: certificado, amenazas, correo', ar_axel: 'Maneja un navegador real para la accesibilidad', ar_pace: 'Mide la página en un móvil', ar_scribe: 'Escribe los casos, puntúa y firma el informe',
			wfCurrent: 'Paso actual', wf_1: 'Conectando', wf_2: 'Analizando páginas', wf_3: 'Pasada del navegador', wf_4: 'Escribiendo casos', wf_5: 'Revisión de amenazas', wf_6: 'Pruebas de velocidad', wf_7: 'Puntuando y firmando',
			toolsLive: 'Herramienta', toolsSeen: 'Última vez',
			t_chrome: 'Chrome sin interfaz', t_dns: 'DNS y TLS', t_attack: 'Listas públicas de ataques', t_safe: 'Navegación segura', t_spam: 'Listas de spam', t_look: 'Dominios parecidos', t_wp: 'Lector de WordPress', t_mail: 'Registros de correo', t_sign: 'Firma del informe', t_send: 'Entrega del informe',
			td_chrome: 'Abre las páginas como un visitante, en tamaños de móvil y tableta.', td_axe: 'Reglas de accesibilidad sobre la página renderizada.', td_psi: 'Medición Lighthouse de la página en un móvil.',
			td_crux: 'Lo que midieron visitantes reales de este sitio.', td_dns: 'Registros, cadena del certificado y registro del dominio.', td_attack: 'CISA KEV, OSV, Feodo y Spamhaus DROP. Solo fuentes públicas.',
			td_safe: 'Listas de Google de phishing y malware.', td_spam: 'Si el dominio está en listas de spam.', td_look: 'Dominios parecidos que podrían engañar a los visitantes.', td_wp: 'Plugins y temas detectados, con versiones.',
			td_mail: 'SPF, DKIM, DMARC, MTA-STS y BIMI.', td_sign: 'Sella el informe para poder comprobarlo después.', td_send: 'Guarda el informe y envía una copia por correo.',
			logAll: 'Todo', logInfo: 'Progreso', logRisk: 'Riesgo', logError: 'Errores', logFollow: 'Seguir', logCopy: 'Copiar registro', logCopied: 'Copiado', logSearch: 'Buscar en el registro', logEmpty: 'Aún no hay líneas.',
			alertEmpty: 'Sin alertas. Todo lo que revisó esta revisión salió limpio.', alertWarn: 'Aviso', alertErr: 'Error',
			setMotion: 'Movimiento', setMotionAuto: 'Según mi dispositivo', setMotionFull: 'Completo', setMotionOff: 'Apagado',
			setDensity: 'Densidad', setComfort: 'Cómoda', setCompact: 'Compacta',
			setRate: 'Frecuencia de actualización', setLive: 'En vivo', setFaces: 'Mostrar personajes en los carriles', setReset: 'Restablecer valores',
			setMotionNote: 'Apagado detiene toda animación. Según tu dispositivo respeta el movimiento reducido.', setRateNote: 'Las frecuencias lentas agrupan las actualizaciones. Actualizar siempre te pone al día.',
			saved: 'Se guarda solo en este dispositivo.'
		}
	};
	const L = Object.assign({}, T.en, T[LANG] || {});
	const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));

	// Names that are the same in every language (tool and character names) and short labels for the stations.
	const STATION = {
		fields: 'Fields', https: 'HTTPS', dns: 'DNS/TLS', robots: 'robots.txt', crawl: 'Crawl', browser: 'Browser', axe: 'Axe', webrisk: 'WebRisk',
		lookalike: 'Lookalikes', wordpress: 'WordPress', mail: 'SPF/DMARC', lighthouse: 'Lighthouse', cases: 'Cases', score: 'Score', sign: 'Sign', save: 'Save/Mail',
		security: 'Security', a11y: 'A11y', malware: 'Malware', blocklist: 'Blocklist', open: 'Open', pages: 'Pages', 'psi-ask': 'PSI ask'
	};
	const STATION_ES = { fields: 'Campos', crawl: 'Rastreo', browser: 'Navegador', lookalike: 'Parecidos', cases: 'Casos', score: 'Puntaje', sign: 'Firma', save: 'Guardar/Correo' };
	const stationName = (id, fallback) => (LANG === 'es' && STATION_ES[id]) || STATION[id] || fallback || id;
	const L2 = (k) => L[k] || k;

	// ---------------------------------------------------------------- structure of the review
	const GROUPS = [
		{ id: 'connect', icon: 'https', stages: ['fields', 'https', 'dns', 'open'] },
		{ id: 'crawl', icon: 'crawl', stages: ['robots', 'crawl', 'pages'] },
		{ id: 'browser', icon: 'browser', stages: ['browser', 'axe', 'a11y'] },
		{ id: 'security', icon: 'webrisk', stages: ['security', 'malware', 'blocklist', 'webrisk', 'lookalike', 'wordpress'] },
		{ id: 'mail', icon: 'mail', stages: ['mail'] },
		{ id: 'speed', icon: 'lighthouse', stages: ['psi-ask', 'lighthouse'] },
		{ id: 'report', icon: 'cases', stages: ['cases', 'score', 'sign', 'save'] }
	];
	const groupOf = {};
	GROUPS.forEach((g) => g.stages.forEach((s) => (groupOf[s] = g.id)));

	const BACKGROUND = { https: 1, dns: 1, robots: 1, webrisk: 1, lookalike: 1, wordpress: 1, mail: 1, lighthouse: 1 };
	const LANES = ['laneReview', 'laneBackground', 'laneWatchdog'];

	const DOCTOR = { id: 'doctor', color: '#5dff9a', acc: 'visor' };
	const AGENTS = [
		{ id: 'scout', color: '#56d4e0', acc: 'antenna', stages: ['fields', 'https', 'open', 'robots', 'crawl', 'pages'] },
		{ id: 'sentry', color: '#7d8cff', acc: 'visor', stages: ['dns', 'security', 'malware', 'blocklist', 'webrisk', 'lookalike', 'wordpress', 'mail'] },
		{ id: 'axel', color: '#c58cff', acc: 'glasses', stages: ['browser', 'axe', 'a11y'] },
		{ id: 'pace', color: '#ffc15c', acc: 'bolt', stages: ['psi-ask', 'lighthouse'] },
		{ id: 'scribe', color: '#ff8fa8', acc: 'pencil', stages: ['cases', 'score', 'sign', 'save'] }
	];
	const agentOf = {};
	AGENTS.forEach((a) => a.stages.forEach((s) => (agentOf[s] = a)));

	const PHASES = [
		['fields', 'https', 'dns', 'open'], ['robots', 'crawl', 'pages'], ['browser', 'axe', 'a11y'], ['cases'],
		['security', 'malware', 'blocklist', 'webrisk', 'lookalike', 'wordpress', 'mail'], ['psi-ask', 'lighthouse'], ['score', 'sign', 'save']
	];

	const TOOLS = [
		{ id: 'chrome', icon: 'browser', stages: ['browser'] }, { id: 'axe', icon: 'axe', stages: ['axe', 'a11y'] },
		{ id: 'psi', icon: 'lighthouse', stages: ['psi-ask', 'lighthouse'] }, { id: 'crux', icon: 'score', stages: ['lighthouse'] },
		{ id: 'dns', icon: 'dns', stages: ['dns', 'https'] }, { id: 'attack', icon: 'malware', stages: ['malware', 'security'] },
		{ id: 'safe', icon: 'webrisk', stages: ['webrisk'] }, { id: 'spam', icon: 'blocklist', stages: ['blocklist'] },
		{ id: 'look', icon: 'lookalike', stages: ['lookalike'] }, { id: 'wp', icon: 'wordpress', stages: ['wordpress'] },
		{ id: 'mail', icon: 'mail', stages: ['mail'] }, { id: 'sign', icon: 'sign', stages: ['sign'] }, { id: 'send', icon: 'save', stages: ['save'] }
	];

	const HAZARDS = [
		{ id: 'timeout', key: 'hzTimeout', color: '#ffb35c', acc: 'clock', mood: 'worry' },
		{ id: 'stop', key: 'hzStop', color: '#ff7a6e', acc: 'hand', mood: 'stop' },
		{ id: 'retry', key: 'hzRetry', color: '#7ef6fb', acc: 'loop', mood: 'work' },
		{ id: 'slow', key: 'hzSlow', color: '#a9b7ff', acc: 'zzz', mood: 'sleepy' },
		{ id: 'fail', key: 'hzFail', color: '#ff5a4a', acc: 'spark', mood: 'dizzy' }
	];

	const STATUS_ORDER = ['running', 'done', 'queued', 'risk', 'error', 'skipped'];

	// ---------------------------------------------------------------- tiny DOM helpers
	function h(tag, props, kids) {
		const el = document.createElement(tag);
		if (props) {
			for (const k in props) {
				const v = props[k];
				if (v == null || v === false) continue;
				if (k === 'class') el.className = v;
				else if (k === 'text') el.textContent = v;
				else if (k === 'html') el.innerHTML = v; // constants from this file only
				else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
				else el.setAttribute(k, v === true ? '' : v);
			}
		}
		(kids || []).forEach((c) => {
			if (c != null && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
		});
		return el;
	}
	const setText = (el, text) => {
		if (el._t !== text) {
			el._t = text;
			el.textContent = text;
		}
	};
	const setAttr = (el, name, value) => {
		const key = '_a' + name;
		if (el[key] !== value) {
			el[key] = value;
			el.setAttribute(name, value);
		}
	};
	const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
	const nowSec = () => performance.now() / 1000;
	const mmss = (s) => {
		s = Math.max(0, Math.floor(s));
		return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
	};
	function ago(t) {
		if (!t) return '—';
		const s = Math.max(0, Math.round(nowSec() - t));
		return s < 90 ? fill(L.ago, { s }) : fill(L.agoMin, { m: Math.round(s / 60) });
	}

	// ---------------------------------------------------------------- icons (24 grid, 1.8 stroke)
	const IC = {
		overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
		systems: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
		processes: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
		agents: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.2c2.8.1 4.5 2 4.5 5"/>',
		workflows: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="12" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M6 8.5v7M8.3 6.8c4 .5 6 2.2 7.2 4.2M8.3 17.2c4-.5 6-2.2 7.2-4.2"/>',
		infrastructure: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01"/>',
		logs: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
		alerts: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
		settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
		refresh: '<path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/>',
		chevron: '<path d="m6 9 6 6 6-6"/>',
		full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
		exitfull: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
		arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
		back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
		search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
		copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
		pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
		check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
		cross: '<path d="M6 6l12 12M18 6 6 18"/>',
		fields: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 18h4"/>',
		https: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
		dns: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/>',
		robots: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
		crawl: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5M8 10.5h5M10.5 8v5"/>',
		browser: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M6.5 6.5h.01M9.5 6.5h.01"/>',
		axe: '<circle cx="12" cy="5" r="2"/><path d="m5 9 7 1.5L19 9M12 10.5V15l-3.5 6M12 15l3.5 6"/>',
		webrisk: '<path d="M12 3 5 6v5.5c0 4.3 3 8 7 9.5 4-1.5 7-5.2 7-9.5V6z"/>',
		lookalike: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
		wordpress: '<circle cx="12" cy="12" r="9"/><path d="M6.5 8.5 10 17l2-5.5 2 5.5 3.5-8.5"/>',
		mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
		lighthouse: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 17 4-5M7 17h.01M17 17h.01"/>',
		cases: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5 2.5-2.5"/>',
		score: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
		sign: '<path d="M4 20h16"/><path d="m14.5 5.5 4 4L8 20H4v-4z"/>',
		save: '<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
		open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
		pages: '<path d="M8 3h9l3 3v13H8z"/><path d="M5 7v14h11"/>',
		security: '<path d="M12 3 5 6v5.5c0 4.3 3 8 7 9.5 4-1.5 7-5.2 7-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
		malware: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 12 18 6"/>',
		blocklist: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>'
	};
	IC['psi-ask'] = IC.lighthouse;
	IC.a11y = IC.axe;
	function icon(name, cls) {
		return h('span', { class: 'rc-i' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (IC[name] || IC.overview) + '</svg>' });
	}

	// ---------------------------------------------------------------- arcade sprites
	// The glossy game pieces on the lanes: drawn as SVG (48 grid) so they stay sharp at any size.
	// Fills point at gradients in the shared <defs> block (SPRITE_DEFS), mounted once in the shadow root.
	const GT = 'url(#sp-t)', GS = 'url(#sp-s)', GA = 'url(#sp-a)', GR = 'url(#sp-r)', GD = '#0a222b', GE = '#7ef6fb';
	const OL = ' stroke="#04141b" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
	const SPRITE_DEFS =
		'<svg class="rc-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
		'<linearGradient id="sp-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6f6fa"/><stop offset=".5" stop-color="#37adbb"/><stop offset="1" stop-color="#15606c"/></linearGradient>' +
		'<linearGradient id="sp-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f8fa"/><stop offset=".5" stop-color="#abbfc7"/><stop offset="1" stop-color="#5b6e78"/></linearGradient>' +
		'<linearGradient id="sp-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe6a3"/><stop offset=".5" stop-color="#f3a63c"/><stop offset="1" stop-color="#af5d1a"/></linearGradient>' +
		'<linearGradient id="sp-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffa597"/><stop offset=".5" stop-color="#ff4e3e"/><stop offset="1" stop-color="#9e170e"/></linearGradient>' +
		'</defs></svg>';
	const SPRITES = {
		form: '<path d="M11 5h19l9 9v29H11z" fill="' + GS + '"' + OL + '/><path d="M30 5v9h9z" fill="' + GT + '"' + OL + '/><path d="M17 22h16M17 28h16M17 34h10" stroke="' + GD + '" stroke-width="2.6" stroke-linecap="round"/>',
		lock: '<path d="M15 22v-6a9 9 0 0 1 18 0v6" fill="none" stroke="#04141b" stroke-width="8" stroke-linecap="round"/><path d="M15 22v-6a9 9 0 0 1 18 0v6" fill="none" stroke="' + GS + '" stroke-width="4.4" stroke-linecap="round"/><rect x="9" y="21" width="30" height="22" rx="5" fill="' + GT + '"' + OL + '/><circle cx="24" cy="30.5" r="3.6" fill="' + GD + '"/><path d="M22.4 32.5h3.2l1.2 6h-5.6z" fill="' + GD + '"/>',
		dns: '<path d="M24 15v8M24 23 12 33M24 23l12 10" stroke="#04141b" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M24 15v8M24 23 12 33M24 23l12 10" stroke="' + GE + '" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="24" cy="10" r="6.5" fill="' + GT + '"' + OL + '/><circle cx="11" cy="36" r="6" fill="' + GS + '"' + OL + '/><circle cx="37" cy="36" r="6" fill="' + GS + '"' + OL + '/>',
		robots: '<path d="M24 14V7" stroke="#04141b" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="6" r="3.2" fill="' + GA + '"' + OL + '/><rect x="5" y="22" width="5" height="10" rx="2" fill="' + GT + '"' + OL + '/><rect x="38" y="22" width="5" height="10" rx="2" fill="' + GT + '"' + OL + '/><rect x="9" y="14" width="30" height="26" rx="8" fill="' + GS + '"' + OL + '/><rect x="13.5" y="21" width="21" height="11" rx="5.5" fill="' + GD + '"/><circle cx="20" cy="26.5" r="2.6" fill="' + GE + '"/><circle cx="28" cy="26.5" r="2.6" fill="' + GE + '"/><path d="M19 36h10" stroke="#04141b" stroke-width="2" stroke-linecap="round"/>',
		gear: '<g fill="' + GT + '"' + OL + '><rect x="20.5" y="3" width="7" height="42" rx="2.5"/><rect x="20.5" y="3" width="7" height="42" rx="2.5" transform="rotate(45 24 24)"/><rect x="20.5" y="3" width="7" height="42" rx="2.5" transform="rotate(90 24 24)"/><rect x="20.5" y="3" width="7" height="42" rx="2.5" transform="rotate(135 24 24)"/></g><circle cx="24" cy="24" r="14.5" fill="' + GT + '"' + OL + '/><circle cx="24" cy="24" r="6.5" fill="' + GD + '"' + OL + '/><circle cx="24" cy="24" r="2.4" fill="' + GE + '"/>',
		globe: '<circle cx="24" cy="24" r="18" fill="' + GT + '"' + OL + '/><ellipse cx="24" cy="24" rx="8" ry="18" fill="none" stroke="#04141b" stroke-width="1.8"/><path d="M6 24h36M9 15h30M9 33h30" stroke="#04141b" stroke-width="1.8" fill="none"/><path d="M13 12c4-4 10-5 15-3" stroke="#fff" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round" fill="none"/>',
		mallet: '<g transform="rotate(-38 24 24)"><rect x="20.5" y="14" width="7" height="31" rx="3.2" fill="' + GA + '"' + OL + '/><rect x="7" y="4" width="34" height="16" rx="5" fill="' + GS + '"' + OL + '/><path d="M13 9h22" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/></g>',
		target: '<circle cx="24" cy="24" r="19" fill="' + GS + '"' + OL + '/><circle cx="24" cy="24" r="13" fill="' + GD + '"' + OL + '/><circle cx="24" cy="24" r="8" fill="' + GT + '"' + OL + '/><circle cx="24" cy="24" r="3.2" fill="' + GA + '"/><path d="M24 1v8M24 39v8M1 24h8M39 24h8" stroke="#04141b" stroke-width="2" stroke-linecap="round"/>',
		mail: '<rect x="5" y="11" width="38" height="26" rx="5" fill="' + GS + '"' + OL + '/><path d="m6.5 14 17.5 13 17.5-13" fill="none" stroke="#04141b" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="38" cy="36" r="8" fill="' + GA + '"' + OL + '/><path d="M35 36h6M38 33v6" stroke="' + GD + '" stroke-width="2" stroke-linecap="round" transform="rotate(45 38 36)"/>',
		wp: '<circle cx="24" cy="24" r="19" fill="' + GS + '"' + OL + '/><circle cx="24" cy="24" r="14.5" fill="none" stroke="' + GT + '" stroke-width="3"/><path d="m13 17 6.5 16 4.5-11.5L28.5 33 35 17" fill="none" stroke="#04141b" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>',
		mailbox: '<path d="M7 22a11 11 0 0 1 11-11h12a11 11 0 0 1 11 11v14H7z" fill="' + GT + '"' + OL + '/><rect x="14" y="21" width="18" height="4" rx="2" fill="' + GD + '"/><path d="M33 11V3h9v6h-9" fill="' + GA + '"' + OL + '/><rect x="21" y="36" width="6" height="9" fill="' + GS + '"' + OL + '/>',
		meter: '<path d="M5 33a19 19 0 0 1 38 0z" fill="' + GS + '"' + OL + '/><path d="M10 33a14 14 0 0 1 28 0z" fill="' + GD + '"/><path d="M24 33 33 18" stroke="#04141b" stroke-width="6" stroke-linecap="round"/><path d="M24 33 33 18" stroke="' + GA + '" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="33" r="4.2" fill="' + GT + '"' + OL + '/><path d="M12 26l2.5 1.5M24 18v3M36 26l-2.5 1.5" stroke="' + GE + '" stroke-width="2" stroke-linecap="round"/>',
		cube: '<path d="M24 5 41 14 24 23 7 14z" fill="' + GS + '"' + OL + '/><path d="M7 14 24 23V43L7 34z" fill="' + GT + '"' + OL + '/><path d="M41 14 24 23V43L41 34z" fill="' + GT + '" fill-opacity=".62"' + OL + '/><path d="M14 11.5 24 17" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/>',
		rocket: '<path d="M17 24 8 33l9 1z" fill="' + GA + '"' + OL + '/><path d="M31 24 40 33l-9 1z" fill="' + GA + '"' + OL + '/><path d="M20 33h8l-4 12z" fill="' + GA + '"' + OL + '/><path d="M24 3c8 5 10 14 9 28H15C14 17 16 8 24 3z" fill="' + GS + '"' + OL + '/><circle cx="24" cy="17" r="5" fill="' + GD + '"' + OL + '/><circle cx="22.5" cy="15.5" r="1.6" fill="' + GE + '"/><path d="M17 27h14" stroke="#04141b" stroke-width="2"/>',
		pen: '<g transform="rotate(42 24 24)"><rect x="18.5" y="3" width="11" height="31" rx="2.5" fill="' + GA + '"' + OL + '/><rect x="18.5" y="3" width="11" height="7" rx="2.5" fill="' + GT + '"' + OL + '/><path d="M18.5 34h11L24 45z" fill="' + GS + '"' + OL + '/><path d="M24 40.5v4" stroke="#04141b" stroke-width="2.4" stroke-linecap="round"/></g>',
		send: '<path d="M44 5 5 21l14 6 6 15z" fill="' + GS + '"' + OL + '/><path d="M19 27 44 5" stroke="#04141b" stroke-width="2" stroke-linecap="round"/><path d="m19 27 3 9 3-3z" fill="' + GT + '"' + OL + '/>',
		clock: '<circle cx="24" cy="24" r="19" fill="' + GS + '"' + OL + '/><circle cx="24" cy="24" r="14" fill="' + GD + '"/><path d="M24 14v10l7 4" fill="none" stroke="' + GA + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
		stop: '<path d="M16 4h16l12 12v16L32 44H16L4 32V16z" fill="' + GR + '"' + OL + '/><path d="M14 24h20" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
		spark: '<path d="m24 2 5.5 13L44 17l-11 9 3.5 15L24 33l-12.5 8L15 26 4 17l14.5-2z" fill="' + GA + '"' + OL + '/><path d="m24 12 2.5 6 6.5.8-5 4.2 1.5 6.5L24 26l-5.5 3.5L20 23l-5-4.2 6.5-.8z" fill="#fff" fill-opacity=".7"/>',
		hourglass: '<path d="M10 4h28M10 44h28" stroke="#04141b" stroke-width="5" stroke-linecap="round"/><path d="M13 4c0 12 9 14 11 20-2 6-11 8-11 20h22c0-12-9-14-11-20 2-6 11-8 11-20z" fill="' + GS + '"' + OL + '/><path d="M17 10h14c-1 6-5 8-7 10-2-2-6-4-7-10z" fill="' + GA + '"/><path d="M24 30c3 3 6 5 6.5 10h-13c.5-5 3.5-7 6.5-10z" fill="' + GA + '"/>',
		bolt: '<path d="M28 2 11 27h11l-4 19 19-27H26z" fill="' + GA + '"' + OL + '/>'
	};
	// which game piece each station and each watchdog pod wears
	const SPRITE_OF = {
		fields: 'form', https: 'lock', dns: 'dns', robots: 'robots', crawl: 'gear', browser: 'globe', axe: 'mallet', webrisk: 'target',
		lookalike: 'mail', wordpress: 'wp', mail: 'mailbox', lighthouse: 'meter', cases: 'cube', score: 'rocket', sign: 'pen', save: 'send',
		timeout: 'clock', stop: 'stop', fail: 'spark', slow: 'hourglass', retry: 'bolt',
		open: 'globe', pages: 'gear', a11y: 'mallet', security: 'target', malware: 'target', blocklist: 'stop', 'psi-ask': 'meter'
	};
	function sprite(id, cls) {
		return h('span', { class: 'sp' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true', html: '<svg viewBox="0 0 48 48">' + (SPRITES[SPRITE_OF[id]] || SPRITES.form) + '</svg>' });
	}

	// ---------------------------------------------------------------- characters
	// One SVG per character. The mood is a data attribute; the stylesheet shows the matching eyes, mouth and extras.
	const ACC = {
		antenna: '<path class="acc-line" d="M40 17V8"/><circle class="acc-ball" cx="40" cy="6.5" r="3.6"/>',
		visor: '<rect class="acc-band" x="14" y="26" width="52" height="7" rx="3.5"/>',
		glasses: '<circle class="acc-ring" cx="31" cy="41" r="8.5"/><circle class="acc-ring" cx="49" cy="41" r="8.5"/><path class="acc-line" d="M39.500 41h1"/>',
		bolt: '<path class="acc-bolt" d="M43 3 33 15h7l-3 9 11-13h-7z"/>',
		pencil: '<g transform="rotate(28 62 14)"><rect class="acc-pencil" x="59" y="2" width="6" height="20" rx="1.5"/><path class="acc-tip" d="M59 22h6l-3 6z"/></g>',
		clock: '<circle class="acc-ring" cx="40" cy="9" r="7"/><path class="acc-line" d="M40 9V5M40 9l3 2"/>',
		hand: '<path class="acc-hex" d="M33 4h14l6 6v8H27v-8z"/><path class="acc-line" d="M36 11h8"/>',
		loop: '<path class="acc-line" d="M33 12a7.500 7.500 0 1 1 3 6"/><path class="acc-fillline" d="m31 8 3 5 5-3"/>',
		zzz: '<path class="acc-line" d="M33 12h6l-6 7h6"/>',
		spark: '<path class="acc-bolt" d="m40 1 3 8 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z"/>'
	};

	function face(character, size) {
		const svg =
			'<svg class="face-svg" viewBox="0 0 80 80" aria-hidden="true">' +
			'<ellipse class="f-shadow" cx="40" cy="75" rx="21" ry="3.6"/>' +
			'<g class="f-bob">' +
			'<g class="f-acc">' + (ACC[character.acc] || '') + '</g>' +
			'<rect class="f-head" x="11" y="14" width="58" height="54" rx="23"/>' +
			'<path class="f-shine" d="M19 28c2-8 9-11 17-11" />' +
			'<rect class="f-screen" x="17" y="24" width="46" height="35" rx="15"/>' +
			'<g class="f-cheeks"><circle cx="24" cy="50" r="3.2"/><circle cx="56" cy="50" r="3.2"/></g>' +
			'<g class="f-eyes">' +
			'<g class="e e-open"><g class="e-look"><circle class="eye" cx="31" cy="41" r="4.6"/><circle class="eye" cx="49" cy="41" r="4.6"/><circle class="glint" cx="32.600" cy="39.300" r="1.4"/><circle class="glint" cx="50.600" cy="39.300" r="1.4"/></g></g>' +
			'<g class="e e-happy"><path d="M26 43q5-9 10 0M44 43q5-9 10 0"/></g>' +
			'<g class="e e-x"><path d="M27 37l8 8M35 37l-8 8M45 37l8 8M53 37l-8 8"/></g>' +
			'<g class="e e-sleep"><path d="M26 42h10M44 42h10"/></g>' +
			'<g class="e e-brows br-worry"><path d="M26 33l9-3M54 33l-9-3"/></g>' +
			'<g class="e e-brows br-stern"><path d="M26 30l9 3M54 30l-9 3"/></g>' +
			'</g>' +
			'<g class="f-mouth">' +
			'<path class="m m-smile" d="M33 50q7 6 14 0"/>' +
			'<path class="m m-big" d="M31 48q9 12 18 0z"/>' +
			'<path class="m m-flat" d="M34 52h12"/>' +
			'<path class="m m-wave" d="M31 52q2.500-4 5 0t5 0 5 0"/>' +
			'<ellipse class="m m-o" cx="40" cy="52" rx="3" ry="3.4"/>' +
			'</g>' +
			'<g class="f-extras">' +
			'<path class="x-sweat" d="M63 24q-4 6 0 9 4-3 0-9z"/>' +
			'<g class="x-zzz"><path d="M58 18h7l-7 8h7"/></g>' +
			'<g class="x-smoke"><circle cx="30" cy="12" r="4"/><circle cx="41" cy="7" r="5"/><circle cx="52" cy="12" r="3.5"/></g>' +
			'<g class="x-spark"><path d="m10 20 2 4 4 2-4 2-2 4-2-4-4-2 4-2zM68 10l1.500 3 3 1.500-3 1.500L68 19l-1.500-3L63.500 14.500l3-1.500z"/></g>' +
			'</g>' +
			'</g>' +
			'</svg>';
		const el = h('span', { class: 'face' + (size ? ' face-' + size : ''), 'data-mood': 'idle', 'data-who': character.id, html: svg });
		el.style.setProperty('--a', character.color);
		return el;
	}

	function moodOf(ids, m) {
		const sts = ids.map((id) => m.stages[id] || 'idle');
		if (m.run === 'stopped' || m.run === 'stopping') return sts.every((s) => s === 'done') ? 'happy' : 'stop';
		if (sts.indexOf('fail') >= 0) return 'dizzy';
		if (sts.indexOf('risk') >= 0) return 'worry';
		if (sts.indexOf('wip') >= 0) return m.anomaly === 'slow' ? 'sleepy' : 'work';
		const done = sts.filter((s) => s === 'done').length;
		if (done && done === sts.length) return 'happy';
		if (done) return 'content';
		return 'idle';
	}
	function setMood(el, mood) {
		if (el._mood !== mood) {
			el._mood = mood;
			el.setAttribute('data-mood', mood);
		}
	}

	// ---------------------------------------------------------------- saved preferences
	const PREF_KEY = 'qa-review-console';
	const DEFAULT_PREFS = { view: 'processes', auto: true, rate: 0, motion: 'auto', density: 'comfortable', faces: true };
	function loadPrefs() {
		try {
			return Object.assign({}, DEFAULT_PREFS, JSON.parse(localStorage.getItem(PREF_KEY) || '{}'));
		} catch (e) {
			return Object.assign({}, DEFAULT_PREFS);
		}
	}
	const prefs = loadPrefs();
	const session = { filter: 'all', procStatus: 'all', procQuery: '', procSort: 'order', procDir: 1, logLevel: 'all', logQuery: '', follow: true };
	function savePrefs() {
		try {
			localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
		} catch (e) {
			/* storage is optional */
		}
	}

	const NAV = ['overview', 'systems', 'processes', 'agents', 'workflows', 'infrastructure', 'logs', 'alerts', 'settings'];
	let live = null;

	function create(wrap, api) {
		const SKIN = api.skin === 'lab' ? 'lab' : 'console';
		const isLab = SKIN === 'lab';
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
		const stages = api.stages;
		const stageIds = stages.map((s) => s.id);
		const stageLabel = {};
		stages.forEach((s) => (stageLabel[s.id] = stationName(s.id, s.label)));
		const rec = {};
		stageIds.forEach((id) => (rec[id] = { raw: 'idle', start: 0, end: 0, last: 0, text: '' }));
		const R = { seen: 0, opened: 0, max: 0, pages: 0, lastRender: 0, paused: false, trailing: 0, tick: 0, destroyed: false, view: NAV.indexOf(prefs.view) >= 0 ? prefs.view : 'processes', sub: '', counts: { hz: {} }, alerts: 0, updatedAt: 0 };
		const upd = []; // per-view updaters, filled below
		const E = {}; // elements

		// ------------------------------------------------ status of a process
		function pstatus(id, m) {
			const raw = m.stages[id] || 'idle';
			if (m.run === 'stopped' || m.run === 'failed') {
				// a run that ended early leaves unfinished work as skipped, not running
				if (raw === 'done' || raw === 'fail' || raw === 'risk') return raw === 'fail' ? 'error' : raw;
				return 'skipped';
			}
			if (raw === 'wip') return 'running';
			if (raw === 'done') return 'done';
			if (raw === 'fail') return 'error';
			if (raw === 'risk') return 'risk';
			if (raw === 'skip') return 'skipped';
			if (m.run === 'running' || m.run === 'stopping') return 'queued';
			return m.run === 'ready' ? 'skipped' : 'queued';
		}

		const nodeStatus = (e, m) => (e.status === 'wip' && (m.run === 'stopped' || m.run === 'failed') ? 'skip' : e.status);

		// ------------------------------------------------ remember when things started, finished and were last heard from
		function track() {
			const m = api.model();
			const t = nowSec();
			stageIds.forEach((id) => {
				const raw = m.stages[id] || 'idle';
				const r = rec[id];
				if (raw === r.raw) return;
				if (raw === 'wip') {
					if (!r.start || r.end) r.start = t;
					r.end = 0;
				} else if (raw !== 'idle') {
					if (!r.start) r.start = t;
					r.end = t;
				}
				r.raw = raw;
				r.last = t;
			});
			for (let i = 0; i < m.log.length; i++) {
				const row = m.log[i];
				if (row.n <= R.seen) continue;
				R.seen = row.n;
				if (row.stage && rec[row.stage]) {
					rec[row.stage].last = t;
					rec[row.stage].text = row.text;
				}
				const cap = /at most (\d+) HTML pages/.exec(row.raw || '');
				if (cap) R.max = Math.max(1, Number(cap[1]));
				if (/^Opening \//.test(row.raw || '')) R.opened += 1;
				if (row.anomaly && R.counts.hz) {
					const key = row.anomaly;
					R.counts.hz[key] = (R.counts.hz[key] || 0) + 1;
				}
			}
			if (m.run === 'running' && !R.began) R.began = t;
		}

		// ------------------------------------------------ shell
		wrap.removeAttribute('aria-hidden');
		wrap.setAttribute('role', 'region');
		wrap.setAttribute('aria-label', isLab ? L.regionLab : L.region);
		wrap.textContent = '';
		const root = h('div', { class: 'rc', 'data-view': R.view, 'data-skin': SKIN });
		E.root = root;

		// sidebar
		const nav = h('nav', { class: 'rc-nav', 'aria-label': L.region });
		E.nav = {};
		NAV.forEach((id) => {
			const b = h('button', { class: 'rc-navbtn', type: 'button', 'data-nav': id, title: L[id] }, [icon(id), h('span', { class: 'rc-navtxt', text: L[id] })]);
			if (id === 'alerts') b.appendChild((E.alertBadge = h('b', { class: 'rc-badge', hidden: true, text: '0' })));
			b.addEventListener('click', () => go(id));
			nav.appendChild(b);
			E.nav[id] = b;
		});
		E.sys = {
			state: h('b', { class: 'rc-state' }),
			target: h('span', { class: 'rc-sysv' }),
			pages: h('span', { class: 'rc-sysv' }),
			elapsed: h('span', { class: 'rc-sysv rc-mono' }),
			phase: h('span', { class: 'rc-sysv' })
		};
		const sysRow = (label, node) => h('div', { class: 'rc-sysrow' }, [h('span', { class: 'rc-sysk', text: label }), node]);
		const side = h('aside', { class: 'rc-side' }, [
			h('div', { class: 'rc-brand' }, [
				h('img', { class: 'rc-mark', src: 'assets/qa-review-mark.svg', alt: '', width: '34', height: '34', decoding: 'async' }),
				h('div', { class: 'rc-brandtxt' }, [h('b', { text: 'QA-lab' }), h('small', { text: isLab ? L.brandLab : L.brand })])
			]),
			nav,
			h('div', { class: 'rc-syscard' }, [
				h('p', { class: 'rc-syshead' }, [h('i', { class: 'rc-sysdot' }), L.sysStatus]),
				E.sys.state,
				sysRow(L.target, E.sys.target), sysRow(L.pagesLbl, E.sys.pages), sysRow(L.elapsed, E.sys.elapsed), sysRow(L.phase, E.sys.phase)
			])
		]);

		// top bar
		E.title = h('h3', { class: 'rc-h' });
		E.sub = h('p', { class: 'rc-sub' });
		E.refresh = h('button', { class: 'rc-btn rc-sq', type: 'button', title: L.update, 'aria-label': L.update }, [icon('refresh')]);
		E.refresh.addEventListener('click', () => {
			E.refresh.classList.remove('is-spin');
			void E.refresh.offsetWidth;
			E.refresh.classList.add('is-spin');
			render(true);
		});
		// system filter dropdown
		E.ddLabel = h('span', { class: 'rc-ddlabel' });
		E.ddBtn = h('button', { class: 'rc-btn rc-dd', type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': L.systemLabel }, [E.ddLabel, icon('chevron')]);
		E.ddMenu = h('ul', { class: 'rc-menu', role: 'listbox', tabindex: '-1', 'aria-label': L.systemLabel, hidden: true });
		const ddItems = [{ id: 'all', label: L.allSystems }].concat(GROUPS.map((g) => ({ id: g.id, label: L['g_' + g.id] })));
		ddItems.forEach((it) => {
			const li = h('li', { class: 'rc-opt', role: 'option', tabindex: '-1', 'data-id': it.id, text: it.label });
			li.addEventListener('click', () => pickSystem(it.id));
			li.addEventListener('keydown', (e) => menuKey(e, li));
			E.ddMenu.appendChild(li);
		});
		E.ddBtn.addEventListener('click', () => (E.ddMenu.hidden ? openMenu() : closeMenu()));
		E.ddBtn.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				openMenu();
			}
		});
		E.ddWrap = h('div', { class: 'rc-ddwrap' }, [E.ddBtn, E.ddMenu]);
		// auto-refresh switch
		E.auto = h('button', { class: 'rc-switch', type: 'button', role: 'switch', 'aria-checked': 'true', 'aria-label': L.autoRefresh, title: L.autoRefresh }, [h('i', { class: 'rc-knob' })]);
		E.auto.addEventListener('click', () => setAuto(!prefs.auto));
		E.autoWrap = h('label', { class: 'rc-autowrap' }, [h('span', { class: 'rc-autotxt', text: L.autoRefresh }), E.auto]);
		E.autoWrap.addEventListener('click', (e) => {
			if (e.target !== E.auto && !E.auto.contains(e.target)) {
				e.preventDefault();
				setAuto(!prefs.auto);
			}
		});
		E.full = h('button', { class: 'rc-btn rc-sq', type: 'button', title: L.fullscreen, 'aria-label': L.fullscreen, 'aria-pressed': 'false' }, [icon('full')]);
		E.full.addEventListener('click', toggleFull);
		E.paused = h('p', { class: 'rc-paused', role: 'status', hidden: true, text: L.paused });
		const top = h('header', { class: 'rc-top' }, [
			h('div', { class: 'rc-titles' }, [E.title, E.sub]),
			h('div', { class: 'rc-tools' }, [E.refresh, E.ddWrap, E.autoWrap, E.full])
		]);

		E.body = h('div', { class: 'rc-body' });
		E.foot = h('footer', { class: 'rc-foot' });
		E.footText = h('span', { class: 'rc-foottext' });
		E.footPulse = icon('pulse', 'rc-footpulse');
		E.legend = h('div', { class: 'rc-legend', role: 'group', 'aria-label': L.colStatus });
		E.legendBtns = {};
		STATUS_ORDER.forEach((s) => {
			const b = h('button', { class: 'rc-lg s-' + s, type: 'button', title: L['s_' + s] }, [h('i', { class: 'rc-dotc' }), h('span', { text: L['s_' + s] }), h('b', { text: '0' })]);
			b.addEventListener('click', () => {
				session.procStatus = s;
				go('all');
			});
			E.legend.appendChild(b);
			E.legendBtns[s] = b;
		});
		E.foot.appendChild(E.legend);
		E.foot.appendChild(h('span', { class: 'rc-footnote' }, [E.footText, E.footPulse]));
		const main = h('div', { class: 'rc-main' }, [top, E.paused, E.body, E.foot]);
		root.appendChild(h('span', { class: 'rc-defswrap', 'aria-hidden': 'true', html: SPRITE_DEFS }));
		E.app = h('div', { class: 'rc-app' }, [side, main]);
		root.appendChild(E.app);
		E.cover = h('button', { class: 'rc-cover', type: 'button', hidden: true, text: L.enlarge });
		E.cover.addEventListener('click', toggleFull);
		root.appendChild(E.cover);
		// The console lives in a shadow root: the page's own styles cannot reach it, and it cannot reach the page.
		const host = h('div', { class: 'rc-host' });
		host.style.display = 'block';
		host.style.visibility = 'hidden';
		const shadow = host.attachShadow({ mode: 'open' });
		const sheet = h('link', { rel: 'stylesheet', href: api.css || 'css/qa-review-console.css' });
		const reveal = () => {
			host.style.visibility = '';
		};
		sheet.addEventListener('load', reveal);
		sheet.addEventListener('error', reveal);
		setTimeout(reveal, 3000);
		shadow.appendChild(sheet);
		shadow.appendChild(root);
		wrap.appendChild(host);

		// ------------------------------------------------ the views
		const views = {};
		function view(id, node, update) {
			node.classList.add('rc-view');
			node.setAttribute('data-v', id);
			node.hidden = true;
			E.body.appendChild(node);
			views[id] = node;
			upd[id] = update;
		}

		// ---- node of a station on a lane
		function stationNode(def, lane) {
			const n = h('div', { class: 'ln s-idle', 'data-id': def.id }, [
				h('span', { class: 'ln-ring' }), sprite(def.id, 'ln-ico'), h('span', { class: 'ln-mark' }), h('span', { class: 'ln-lbl', text: stationName(def.id) })
			]);
			n._st = 'idle';
			n._lane = lane;
			return n;
		}


		// ---- LAB TRIES board (tick boxes + item row + doctor + bays)
		function buildLabProcesses() {
			const board = api.model().ents.filter((e) => e.lane === 0).map((e) => e.def);
			E.nodes = [[]];
			E.labTicks = [];
			E.labItems = [];
			const ticks = h('div', { class: 'lab-ticks', style: '--n:' + board.length });
			const items = h('div', { class: 'lab-items', style: '--n:' + board.length });
			board.forEach((def, i) => {
				const tick = h('div', { class: 'lab-tick s-idle', 'data-id': def.id }, [
					h('span', { class: 'lab-tick-mark' }),
					h('span', { class: 'lab-tick-lbl', text: stationName(def.id) })
				]);
				tick._st = 'idle';
				E.labTicks[i] = tick;
				ticks.appendChild(tick);
				const item = h('div', { class: 'lab-item s-idle', 'data-id': def.id }, [
					h('i', { class: 'lab-conn' }),
					h('span', { class: 'lab-item-ring' }, [sprite(def.id, 'lab-sp')]),
					h('span', { class: 'lab-item-mark' }),
					h('span', { class: 'lab-item-lbl', text: stationName(def.id) })
				]);
				item._st = 'idle';
				E.nodes[0][i] = item;
				E.labItems[i] = item;
				items.appendChild(item);
			});
			E.doctor = h('div', { class: 'lab-doctor' });
			E.doctorFace = face(DOCTOR, 'md');
			E.doctorBubble = h('p', { class: 'lab-bubble' });
			E.doctor.appendChild(E.doctorBubble);
			E.doctor.appendChild(E.doctorFace);
			E.labBeam = h('i', { class: 'lab-beam' });
			E.labPct = h('b', { class: 'lab-pct', text: '0%' });
			E.labClock = h('span', { class: 'lab-clock rc-mono', text: '0:00' });
			E.labFill = h('i', { class: 'lab-bar-fill' });
			E.labPhase = h('span', { class: 'lab-phase', text: L.run_idle });
			const floor = h('div', { class: 'lab-floor' }, [items, E.labBeam, E.doctor]);
			const boardEl = h('div', { class: 'lab-board' }, [ticks, floor]);
			E.pods = {};
			const pods = h('div', { class: 'pods pods-lab' });
			HAZARDS.forEach((hz) => {
				const f = face(hz, 'sm');
				const count = h('b', { class: 'pod-n', text: '0' });
				const pod = h('div', { class: 'pod', 'data-id': hz.id }, [f, h('span', { class: 'pod-lbl', text: L[hz.key] }), sprite(hz.id, 'pod-sp'), count]);
				E.pods[hz.id] = { pod, f, count };
				pods.appendChild(pod);
			});
			const scroll = h('div', { class: 'lanes-scroll lab-scroll' }, [boardEl, pods]);
			E.lanesScroll = scroll;
			scroll.addEventListener('scroll', () => (R.userScrolled = nowSec()), { passive: true });
			const head = h('div', { class: 'lab-head' }, [
				h('div', { class: 'lab-title' }, [
					h('span', { class: 'lab-check', 'aria-hidden': 'true', text: '✓' }),
					h('div', {}, [h('b', { text: L.labTitle }), h('small', { text: L.labLive })])
				]),
				h('div', { class: 'lab-progress' }, [
					h('span', { class: 'lab-progress-k', text: L.labProgress }),
					h('div', { class: 'lab-bar' }, [E.labFill]),
					E.labPct,
					E.labClock,
					E.labPhase
				])
			]);
			const lanesPanel = h('section', { class: 'panel panel-lanes panel-lab' }, [
				h('div', { class: 'panel-head' }, [h('div', {}, [h('h4', { text: L.lanesTitleLab }), h('p', { text: L.lanesSubLab })])]),
				head,
				scroll
			]);
			E.procTable = makeTable({ all: false });
			E.viewAll = h('button', { class: 'rc-btn rc-ghost', type: 'button' }, [h('span', { text: L.viewAll }), icon('arrow')]);
			E.viewAll.addEventListener('click', () => go('all'));
			const procPanel = h('section', { class: 'panel panel-proc' }, [
				h('div', { class: 'panel-head' }, [h('div', {}, [h('h4', { text: L.procTitle }), h('p', { text: L.procSub })]), E.viewAll]),
				E.procTable.el
			]);
			const el = h('div', { class: 'v-processes' }, [lanesPanel, procPanel]);
			view('processes', el, updateLabProcesses);
		}

		function updateLabProcesses(m) {
			const visible = R.view === 'processes';
			let lastIdx = -1;
			let doneCount = 0;
			m.ents.forEach((e) => {
				if (e.lane !== 0) return;
				const item = E.labItems[e.i];
				const tick = E.labTicks[e.i];
				if (!item) return;
				const inGroup = session.filter === 'all' || groupsOfEnt(e.def).indexOf(session.filter) >= 0;
				item.classList.toggle('is-dim', !inGroup);
				tick.classList.toggle('is-dim', !inGroup);
				const est = nodeStatus(e, m);
				if (est !== item._st) {
					const prev = item._st;
					item._st = est;
					tick._st = est;
					item.className = item.className.replace(/\bs-\w+/, 's-' + est);
					tick.className = tick.className.replace(/\bs-\w+/, 's-' + est);
					if (visible && effectsOn()) reaction(item, est, prev);
				}
				if (est !== 'idle') lastIdx = Math.max(lastIdx, e.i);
				if (est === 'done') doneCount++;
			});
			const total = E.labItems.length || 1;
			const hud = (api.hud && api.hud()) || {};
			const pct = Math.max(0, Math.min(100, Number(hud.pct) || Math.round((doneCount / total) * 100)));
			E.labFill.style.setProperty('--p', String(pct));
			setText(E.labPct, pct + '%');
			setText(E.labClock, hud.clock || mmss(m.now || 0));
			setText(E.labPhase, hud.phase || L['run_' + (m.run || 'idle')] || m.run || '');
			const active = m.activeId;
			let idx = -1;
			m.ents.forEach((e) => {
				if (e.lane === 0 && (e.def.id === active || (e.def.aka || []).indexOf(active) >= 0)) idx = e.i;
			});
			if (idx < 0) idx = Math.max(0, lastIdx);
			E.doctor.style.setProperty('--i', String(idx));
			E.doctor.style.setProperty('--n', String(total));
			E.labBeam.style.setProperty('--i', String(idx));
			E.labBeam.style.setProperty('--n', String(total));
			E.doctor.classList.toggle('is-off', !prefs.faces || m.run === 'idle');
			setMood(E.doctorFace, moodOf([active || (m.ents[idx] && m.ents[idx].def.id) || 'dns'], m));
			const lastRow = m.log[m.log.length - 1];
			setText(E.doctorBubble, lastRow ? lastRow.text : '');
			E.doctorBubble.hidden = !lastRow || m.run === 'ready';
			if (visible && nowSec() - (R.userScrolled || 0) > 4 && E.lanesScroll.scrollWidth > E.lanesScroll.clientWidth + 4) {
				const node = E.labItems[idx];
				if (node) {
					const target = node.offsetLeft + node.offsetWidth / 2 - E.lanesScroll.clientWidth / 2;
					E.lanesScroll.scrollTo({ left: Math.max(0, target), behavior: effectsOn() ? 'smooth' : 'auto' });
				}
			}
			HAZARDS.forEach((hz) => {
				const p = E.pods[hz.id];
				const on = m.anomaly === hz.id || (hz.id === 'fail' && m.run === 'failed');
				p.pod.classList.toggle('is-on', on);
				setMood(p.f, on ? hz.mood : 'idle');
				setText(p.count, String(R.counts.hz[hz.id] || 0));
			});
			E.procTable.update(m);
		}

		// ---- PROCESSES
		// ---- PROCESSES
		function buildProcesses() {
			if (isLab) {
				buildLabProcesses();
				return;
			}
			const board = api.model().ents.filter((e) => e.lane === 0).map((e) => e.def);
			const lanesEl = h('div', { class: 'lanes' });
			E.lanes = [];
			E.nodes = [[], [], []];
			for (let lane = 0; lane < 3; lane++) {
				const track = h('div', { class: 'lane-track', style: '--n:' + board.length });
				const fillLine = h('i', { class: 'lane-fill' });
				track.appendChild(h('i', { class: 'lane-line' }));
				track.appendChild(fillLine);
				board.forEach((def, i) => {
					const n = stationNode(def, lane);
					E.nodes[lane][i] = n;
					track.appendChild(n);
				});
				const head = h('div', { class: 'lane-head' }, [h('b', { text: L[LANES[lane]].toUpperCase() }), h('span', { class: 'lane-count' })]);
				const el = h('div', { class: 'lane lane-' + lane }, [head, track]);
				if (lane === 0) {
					E.runner = h('div', { class: 'runner' });
					E.runnerFace = face(AGENTS[0], 'sm');
					E.runnerBubble = h('p', { class: 'runner-bubble' });
					E.runner.appendChild(E.runnerBubble);
					E.runner.appendChild(E.runnerFace);
					track.appendChild(E.runner);
				}
				E.lanes.push({ el, fill: fillLine, count: head.lastChild, track });
				lanesEl.appendChild(el);
			}
			// the watchdog pods
			E.pods = {};
			const pods = h('div', { class: 'pods' });
			HAZARDS.forEach((hz) => {
				const f = face(hz, 'sm');
				const count = h('b', { class: 'pod-n', text: '0' });
				const pod = h('div', { class: 'pod', 'data-id': hz.id }, [f, h('span', { class: 'pod-lbl', text: L[hz.key] }), sprite(hz.id, 'pod-sp'), count]);
				E.pods[hz.id] = { pod, f, count };
				pods.appendChild(pod);
			});
			const scroll = h('div', { class: 'lanes-scroll' }, [lanesEl, pods]);
			E.lanesScroll = scroll;
			scroll.addEventListener('scroll', () => (R.userScrolled = nowSec()), { passive: true });
			const lanesPanel = h('section', { class: 'panel panel-lanes' }, [
				h('div', { class: 'panel-head' }, [h('div', {}, [h('h4', { text: L.lanesTitle }), h('p', { text: L.lanesSub })])]),
				scroll
			]);
			E.procTable = makeTable({ all: false });
			E.viewAll = h('button', { class: 'rc-btn rc-ghost', type: 'button' }, [h('span', { text: L.viewAll }), icon('arrow')]);
			E.viewAll.addEventListener('click', () => go('all'));
			const procPanel = h('section', { class: 'panel panel-proc' }, [
				h('div', { class: 'panel-head' }, [h('div', {}, [h('h4', { text: L.procTitle }), h('p', { text: L.procSub })]), E.viewAll]),
				E.procTable.el
			]);
			const el = h('div', { class: 'v-processes' }, [lanesPanel, procPanel]);
			view('processes', el, updateProcesses);
		}

		function updateProcesses(m) {
			const visible = R.view === 'processes';
			const lastIdx = [-1, -1, -1];
			const doneCount = [0, 0, 0];
			m.ents.forEach((e) => {
				const node = E.nodes[e.lane] && E.nodes[e.lane][e.i];
				if (!node) return;
				const inGroup = session.filter === 'all' || groupsOfEnt(e.def).indexOf(session.filter) >= 0;
				node.classList.toggle('is-dim', !inGroup);
				const est = nodeStatus(e, m);
				if (est !== node._st) {
					const prev = node._st;
					node._st = est;
					node.className = node.className.replace(/\bs-\w+/, 's-' + est);
					if (visible && effectsOn()) reaction(node, est, prev);
				}
				if (est !== 'idle') lastIdx[e.lane] = Math.max(lastIdx[e.lane], e.i);
				if (est === 'done') doneCount[e.lane]++;
			});
			const total = E.nodes[0].length;
			E.lanes.forEach((ln, i) => {
				ln.fill.style.setProperty('--p', lastIdx[i] < 0 ? '0' : String(((lastIdx[i] + 0.5) / total) * 100));
				setText(ln.count, i === 0 ? doneCount[0] + ' / ' + total : i === 1 ? fill(L.steps, { n: total }) : '');
				ln.el.classList.toggle('is-quiet', i === 2 && lastIdx[2] < 0);
			});
			// the runner: the character whose station is working
			const active = m.activeId;
			let idx = -1;
			m.ents.forEach((e) => {
				if (e.lane === 0 && (e.def.id === active || (e.def.aka || []).indexOf(active) >= 0)) idx = e.i;
			});
			if (idx < 0) idx = Math.max(0, lastIdx[0]);
			const who = agentOf[active] || AGENTS[0];
			E.runner.style.setProperty('--i', String(idx));
			E.runner.classList.toggle('is-flip', idx > E.nodes[0].length * 0.55);
			E.runner.classList.toggle('is-off', !prefs.faces || m.run === 'idle');
			E.runnerFace.style.setProperty('--a', who.color);
			E.runnerFace.setAttribute('data-who', who.id);
			setMood(E.runnerFace, moodOf(who.stages, m));
			const lastRow = m.log[m.log.length - 1];
			setText(E.runnerBubble, lastRow ? lastRow.text : '');
			E.runnerBubble.hidden = !lastRow || m.run === 'ready';
			if (visible && nowSec() - (R.userScrolled || 0) > 4 && E.lanesScroll.scrollWidth > E.lanesScroll.clientWidth + 4) {
				const node = E.nodes[0][idx];
				const target = node.offsetLeft + node.offsetWidth / 2 - E.lanesScroll.clientWidth / 2;
				E.lanesScroll.scrollTo({ left: Math.max(0, target), behavior: effectsOn() ? 'smooth' : 'auto' });
			}
			// the watchdog pods
			HAZARDS.forEach((hz) => {
				const p = E.pods[hz.id];
				const on = m.anomaly === hz.id || (hz.id === 'fail' && m.run === 'failed');
				p.pod.classList.toggle('is-on', on);
				setMood(p.f, on ? hz.mood : 'idle');
				setText(p.count, String(R.counts.hz[hz.id] || 0));
			});
			E.procTable.update(m);
		}

		function groupsOfEnt(def) {
			return [def.id].concat(def.aka || []).map((id) => groupOf[id]).filter(Boolean);
		}

		function effectsOn() {
			return root.getAttribute('data-motion') !== 'off';
		}

		function reaction(node, st, prev) {
			if (st === 'done') burst(node, 'ok');
			else if (st === 'fail') burst(node, 'bad');
			else if (st === 'risk') burst(node, 'warn');
			else if (st === 'wip') burst(node, 'go');
		}
		function burst(node, kind) {
			const b = h('i', { class: 'burst b-' + kind });
			const n = kind === 'go' ? 0 : kind === 'ok' ? 9 : 6;
			for (let k = 0; k < n; k++) {
				const a = (k / n) * Math.PI * 2 + Math.random() * 0.5;
				const d = 18 + Math.random() * 16;
				const p = h('s');
				p.style.setProperty('--dx', Math.cos(a) * d + 'px');
				p.style.setProperty('--dy', Math.sin(a) * d - (kind === 'bad' ? 12 : 0) + 'px');
				p.style.animationDelay = Math.random() * 60 + 'ms';
				b.appendChild(p);
			}
			node.appendChild(b);
			setTimeout(() => b.remove(), 1000);
		}

		// ---- the process table, shared by the Processes panel and the full list
		function makeTable(opts) {
			const cols = [['order', 'colProcess'], ['type', 'colType'], ['lane', 'colLane'], ['status', 'colStatus'], ['elapsed', 'colElapsed'], ['seen', 'colSeen'], ['detail', 'colDetail']];
			const head = h('tr', {}, cols.map((c) => {
				const th = h('th', { scope: 'col', class: 'pt-' + c[0] });
				if (opts.all && c[0] !== 'detail' && c[0] !== 'lane') {
					const b = h('button', { type: 'button', class: 'pt-sort', text: L[c[1]] });
					b.addEventListener('click', () => {
						session.procDir = session.procSort === c[0] ? -session.procDir : 1;
						session.procSort = c[0];
						render(true);
					});
					th.appendChild(b);
				} else th.textContent = L[c[1]];
				return th;
			}));
			const tbody = h('tbody');
			const empty = h('div', { class: 'pt-empty', hidden: true });
			const rows = {};
			stages.forEach((s, order) => {
				const tr = h('tr', { class: 'pt-row s-queued', 'data-id': s.id }, [
					h('td', { class: 'pt-order' }, [h('span', { class: 'pt-name' }, [sprite(s.id, 'pt-sp'), h('b', { text: stageLabel[s.id] })])]),
					h('td', { class: 'pt-type', text: L['g_' + groupOf[s.id]] || '' }),
					h('td', { class: 'pt-lane' }),
					h('td', { class: 'pt-status' }, [h('span', { class: 'pill' }, [h('i', { class: 'rc-dotc' }), h('span')])]),
					h('td', { class: 'pt-elapsed rc-mono' }),
					h('td', { class: 'pt-seen' }),
					h('td', { class: 'pt-detail' })
				]);
				rows[s.id] = { tr, order, st: '', cells: { lane: tr.children[2], pill: tr.children[3].firstChild.lastChild, elapsed: tr.children[4], seen: tr.children[5], detail: tr.children[6] } };
				tbody.appendChild(tr);
			});
			const table = h('table', { class: 'pt' + (opts.all ? ' pt-all' : '') }, [h('thead', {}, [head]), tbody]);
			const el = h('div', { class: 'pt-wrap' }, [table, empty]);
			let sig = '';
			function update(m) {
				const t = nowSec();
				const list = [];
				stages.forEach((s, order) => {
					const id = s.id;
					const r = rows[id];
					const st = pstatus(id, m);
					const rc = rec[id];
					const g = groupOf[id];
					let show;
					if (opts.all) {
						const q = session.procQuery.trim().toLowerCase();
						show = (session.procStatus === 'all' || session.procStatus === st) && (session.filter === 'all' || g === session.filter) && (!q || (stageLabel[id] + ' ' + (L['g_' + g] || '') + ' ' + (rc.text || '')).toLowerCase().indexOf(q) >= 0);
					} else show = (st === 'running' || st === 'error' || st === 'risk') && (session.filter === 'all' || g === session.filter);
					if (r.st !== st) {
						r.st = st;
						r.tr.className = 'pt-row s-' + st;
						setText(r.cells.pill, L['s_' + st]);
					}
					setText(r.cells.lane, (BACKGROUND[id] ? L.laneBackground : L.laneReview) + (m.host ? ' · ' + m.host : ''));
					const el0 = rc.start ? (rc.end || t) - rc.start : 0;
					setText(r.cells.elapsed, rc.start ? mmss(el0) : '—');
					setText(r.cells.seen, ago(rc.last));
					setText(r.cells.detail, rc.text || '—');
					if (r.cells.detail.title !== (rc.text || '')) r.cells.detail.title = rc.text || '';
					r.tr.hidden = !show;
					if (show) list.push({ id, order, st, el: el0, seen: rc.last, type: L['g_' + g] || '' });
				});
				if (opts.all) {
					const key = session.procSort;
					const dir = session.procDir;
					list.sort((a, b) => {
						let d = 0;
						if (key === 'status') d = STATUS_ORDER.indexOf(a.st) - STATUS_ORDER.indexOf(b.st);
						else if (key === 'elapsed') d = a.el - b.el;
						else if (key === 'seen') d = a.seen - b.seen;
						else if (key === 'type') d = a.type.localeCompare(b.type);
						return d * dir || a.order - b.order;
					});
					Array.from(table.querySelectorAll('th')).forEach((th, i) => th.setAttribute('aria-sort', cols[i][0] === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'));
				} else {
					const rank = { error: 0, risk: 1, running: 2 };
					list.sort((a, b) => rank[a.st] - rank[b.st] || a.order - b.order);
				}
				const next = list.map((x) => x.id).join();
				if (next !== sig) {
					sig = next;
					list.forEach((x) => tbody.appendChild(rows[x.id].tr));
				}
				const none = list.length === 0;
				empty.hidden = !none;
				table.hidden = none;
				if (none) {
					const finished = m.run === 'ready';
					setText(empty, opts.all ? L.noneMatch : finished ? L.allDone : L.noneActive);
				}
				return list.length;
			}
			return { el, update, rows };
		}

		// ---- ALL PROCESSES
		function buildAll() {
			E.allTable = makeTable({ all: true });
			E.allBack = h('button', { class: 'rc-btn rc-ghost', type: 'button' }, [icon('back'), h('span', { text: L.back })]);
			E.allBack.addEventListener('click', () => go('processes'));
			E.allSearch = h('input', { class: 'rc-input', type: 'search', placeholder: L.search, 'aria-label': L.search, autocomplete: 'off', spellcheck: 'false' });
			E.allSearch.addEventListener('input', () => {
				session.procQuery = E.allSearch.value;
				render(true);
			});
			E.allCount = h('span', { class: 'rc-count' });
			E.allChips = {};
			const chips = h('div', { class: 'chips', role: 'group', 'aria-label': L.colStatus });
			['all'].concat(STATUS_ORDER).forEach((s) => {
				const b = h('button', { class: 'chip s-' + s, type: 'button', 'aria-pressed': 'false' }, [h('i', { class: 'rc-dotc' }), h('span', { text: s === 'all' ? L.logAll : L['s_' + s] }), h('b', { text: '0' })]);
				b.addEventListener('click', () => {
					session.procStatus = s;
					render(true);
				});
				chips.appendChild(b);
				E.allChips[s] = b;
			});
			const el = h('div', { class: 'v-all' }, [
				h('section', { class: 'panel' }, [
					h('div', { class: 'panel-head panel-head-wrap' }, [E.allBack, h('div', { class: 'searchbox' }, [icon('search'), E.allSearch]), E.allCount]),
					chips,
					E.allTable.el
				])
			]);
			view('all', el, (m) => {
				const n = E.allTable.update(m);
				setText(E.allCount, fill(L.count, { n, m: stageIds.length }));
				const c = countsOf(m);
				Object.keys(E.allChips).forEach((k) => {
					setText(E.allChips[k].lastChild, String(k === 'all' ? stageIds.length : c[k]));
					setAttr(E.allChips[k], 'aria-pressed', String(session.procStatus === k));
					E.allChips[k].classList.toggle('is-on', session.procStatus === k);
				});
				if (E.allSearch.value !== session.procQuery) E.allSearch.value = session.procQuery;
			});
		}

		function countsOf(m) {
			const c = { running: 0, done: 0, queued: 0, risk: 0, error: 0, skipped: 0 };
			stageIds.forEach((id) => c[pstatus(id, m)]++);
			return c;
		}

		// ---- OVERVIEW
		function buildOverview() {
			const ring = '<svg viewBox="0 0 80 80" aria-hidden="true"><circle class="rg-bg" cx="40" cy="40" r="33"/><circle class="rg-fg" cx="40" cy="40" r="33" pathLength="100"/></svg>';
			E.ovRing = h('div', { class: 'ring', html: ring });
			E.ovPct = h('b', { class: 'ring-n', text: '0%' });
			E.ovRing.appendChild(E.ovPct);
			E.ovChecks = h('b', { class: 'stat-n' });
			E.ovChecksBar = h('i', { class: 'bar-fill' });
			E.ovPages = h('b', { class: 'stat-n' });
			E.ovPagesSub = h('small', { class: 'stat-s' });
			E.ovAlerts = h('b', { class: 'stat-n' });
			E.ovAlertsSub = h('small', { class: 'stat-s' });
			E.ovElapsed = h('small', { class: 'stat-s rc-mono' });
			E.ovPhase = h('small', { class: 'stat-s' });
			const card = (label, kids, cls) => h('section', { class: 'panel stat ' + (cls || '') }, [h('p', { class: 'stat-k', text: label })].concat(kids));
			E.ovNowFace = face(AGENTS[0], 'lg');
			E.ovNowText = h('p', { class: 'now-text' });
			E.ovNowWho = h('p', { class: 'now-who' });
			E.ovStrip = h('div', { class: 'strip' });
			E.ovStripDots = {};
			const board = api.model().ents.filter((e) => e.lane === 0);
			board.forEach((e) => {
				const d = h('span', { class: 's-idle strip-dot', title: stationName(e.def.id) }, [sprite(e.def.id)]);
				E.ovStripDots[e.i] = d;
				E.ovStrip.appendChild(d);
			});
			E.ovRecent = h('ol', { class: 'recent' });
			E.ovRecentSig = '';
			E.ovOpenAlerts = h('button', { class: 'rc-btn rc-ghost rc-small', type: 'button', hidden: true }, [h('span', { text: L.ov_open }), icon('arrow')]);
			E.ovOpenAlerts.addEventListener('click', () => go('alerts'));
			const el = h('div', { class: 'v-overview' }, [
				h('div', { class: 'stat-grid' }, [
					card(L.ov_progress, [h('div', { class: 'stat-ring' }, [E.ovRing, h('div', { class: 'stat-ringtxt' }, [E.ovPhase, E.ovElapsed])])], 'stat-ringcard'),
					card(L.ov_checks, [E.ovChecks, h('div', { class: 'bar' }, [E.ovChecksBar])]),
					card(L.ov_pages, [E.ovPages, E.ovPagesSub]),
					card(L.ov_alerts, [E.ovAlerts, E.ovAlertsSub, E.ovOpenAlerts])
				]),
				h('div', { class: 'ov-cols' }, [
					h('section', { class: 'panel now' }, [h('p', { class: 'stat-k', text: L.ov_now }), h('div', { class: 'now-row' }, [E.ovNowFace, h('div', { class: 'now-copy' }, [E.ovNowWho, E.ovNowText])])]),
					h('section', { class: 'panel' }, [h('p', { class: 'stat-k', text: L.ov_lane }), E.ovStrip])
				]),
				h('section', { class: 'panel' }, [h('p', { class: 'stat-k', text: L.ov_recent }), E.ovRecent])
			]);
			view('overview', el, (m) => {
				const hud = api.hud();
				E.ovRing.style.setProperty('--p', String(clamp(hud.pct, 0, 100)));
				setText(E.ovPct, Math.round(hud.pct) + '%');
				setText(E.ovElapsed, hud.clock);
				setText(E.ovPhase, hud.phase);
				const lane0 = m.ents.filter((e) => e.lane === 0);
				const done = lane0.filter((e) => nodeStatus(e, m) === 'done').length;
				setText(E.ovChecks, done + ' / ' + lane0.length);
				E.ovChecksBar.style.setProperty('--p', String((done / Math.max(1, lane0.length)) * 100));
				setText(E.ovPages, pagesText());
				setText(E.ovPagesSub, m.host || '—');
				const alerts = alertRows(m);
				setText(E.ovAlerts, String(alerts.length));
				setText(E.ovAlertsSub, alerts.length ? alerts[alerts.length - 1].text : L.ov_none);
				E.ovOpenAlerts.hidden = !alerts.length;
				lane0.forEach((e) => {
					const d = E.ovStripDots[e.i];
					const est = nodeStatus(e, m);
					if (d._st !== est) {
						d._st = est;
						d.className = 'strip-dot s-' + est;
					}
				});
				const who = agentOf[m.activeId] || (m.run === 'ready' ? AGENTS[4] : AGENTS[0]);
				E.ovNowFace.style.setProperty('--a', who.color);
				setMood(E.ovNowFace, moodOf(who.stages, m));
				setText(E.ovNowWho, L['a_' + who.id] + ' · ' + L['mood_' + moodOf(who.stages, m)]);
				const last = m.log[m.log.length - 1];
				setText(E.ovNowText, last ? last.text : L.ov_waiting);
				const rows = m.log.slice(-6).reverse();
				const sig = rows.map((r) => r.n).join();
				if (sig !== E.ovRecentSig) {
					E.ovRecentSig = sig;
					E.ovRecent.textContent = '';
					rows.forEach((r) => E.ovRecent.appendChild(logItem(r)));
				}
			});
		}
		function pagesText() {
			const n = R.opened + (rec.open && rec.open.raw !== 'idle' ? 1 : 0);
			return R.max ? fill(L.pageOf, { n: Math.min(n, R.max), m: R.max }) : fill(L.pageN, { n });
		}

		function logItem(r) {
			const li = h('li', { class: 'lg-row l-' + (r.status || 'wip') }, [
				h('time', { text: r.time }),
				h('span', { class: 'lg-tag', text: r.tag }),
				h('span', { class: 'lg-text', text: r.text })
			]);
			return li;
		}
		function alertRows(m) {
			return m.log.filter((r) => r.status === 'fail' || r.status === 'risk');
		}

		// ---- SYSTEMS
		function buildSystems() {
			E.sysCards = {};
			const grid = h('div', { class: 'sys-grid' });
			GROUPS.forEach((g) => {
				const list = h('ul', { class: 'sys-list' });
				const items = {};
				g.stages.forEach((id) => {
					const li = h('li', { class: 's-queued' }, [h('i', { class: 'rc-dotc' }), h('span', { class: 'sys-name', text: stageLabel[id] }), h('em', { class: 'sys-st' })]);
					items[id] = li;
					list.appendChild(li);
				});
				const pill = h('span', { class: 'pill' }, [h('i', { class: 'rc-dotc' }), h('span')]);
				const bar = h('i', { class: 'bar-fill' });
				const el = h('section', { class: 'panel sys', 'data-g': g.id }, [
					h('div', { class: 'sys-top' }, [sprite(g.icon, 'sys-ico'), h('div', {}, [h('h4', { text: L['g_' + g.id] }), h('p', { text: L['gs_' + g.id] })]), pill]),
					h('div', { class: 'bar' }, [bar]),
					list
				]);
				E.sysCards[g.id] = { el, pill, bar, items, cur: '' };
				grid.appendChild(el);
			});
			view('systems', h('div', { class: 'v-systems' }, [grid]), (m) => {
				GROUPS.forEach((g) => {
					const c = E.sysCards[g.id];
					c.el.hidden = session.filter !== 'all' && session.filter !== g.id;
					const sts = g.stages.map((id) => pstatus(id, m));
					let doneN = 0;
					g.stages.forEach((id, i) => {
						const st = sts[i];
						if (st === 'done') doneN++;
						const li = c.items[id];
						if (li._st !== st) {
							li._st = st;
							li.className = 's-' + st;
							setText(li.lastChild, L['s_' + st]);
						}
					});
					const agg = sts.indexOf('error') >= 0 ? 'error' : sts.indexOf('risk') >= 0 ? 'risk' : sts.indexOf('running') >= 0 ? 'running' : sts.every((s) => s === 'done') ? 'done' : sts.every((s) => s === 'skipped') ? 'skipped' : doneN ? 'running' : 'queued';
					if (c.cur !== agg) {
						c.cur = agg;
						c.pill.className = 'pill s-' + agg;
						setText(c.pill.lastChild, L['s_' + agg]);
					}
					c.bar.style.setProperty('--p', String((doneN / g.stages.length) * 100));
				});
			});
		}

		// ---- AGENTS
		function buildAgents() {
			E.agentCards = {};
			const grid = h('div', { class: 'ag-grid' });
			AGENTS.forEach((a) => {
				const f = face(a, 'xl');
				const poke = h('button', { class: 'ag-face', type: 'button', 'aria-label': L['a_' + a.id] }, [f]);
				poke.addEventListener('click', () => {
					f.classList.remove('is-poked');
					void f.offsetWidth;
					f.classList.add('is-poked');
					setTimeout(() => f.classList.remove('is-poked'), 900);
				});
				const mood = h('span', { class: 'ag-mood' });
				const task = h('p', { class: 'ag-task' });
				const stats = h('p', { class: 'ag-stats' });
				const chips = h('div', { class: 'ag-chips' }, a.stages.map((id) => h('span', { class: 'ag-chip s-idle', 'data-id': id, title: stageLabel[id] }, [sprite(id)])));
				const el = h('section', { class: 'panel ag', 'data-who': a.id }, [
					h('div', { class: 'ag-top' }, [poke, h('div', { class: 'ag-id' }, [h('h4', { text: L['a_' + a.id] }), h('p', { text: L['ar_' + a.id] }), mood])]),
					task, stats, chips
				]);
				E.agentCards[a.id] = { el, f, mood, task, stats, chips };
				grid.appendChild(el);
			});
			view('agents', h('div', { class: 'v-agents' }, [grid]), (m) => {
				AGENTS.forEach((a) => {
					const c = E.agentCards[a.id];
					const mo = moodOf(a.stages, m);
					setMood(c.f, mo);
					setText(c.mood, L['mood_' + mo]);
					c.mood.setAttribute('data-mood', mo);
					const sts = a.stages.map((id) => pstatus(id, m));
					const done = sts.filter((s) => s === 'done').length;
					const risks = sts.filter((s) => s === 'risk').length;
					const errs = sts.filter((s) => s === 'error').length;
					const working = a.stages.find((id) => pstatus(id, m) === 'running');
					let last = '';
					let lastT = 0;
					a.stages.forEach((id) => {
						if (rec[id].last > lastT) {
							lastT = rec[id].last;
							last = rec[id].text;
						}
					});
					setText(c.task, working ? L.agentWorking + ' ' + stageLabel[working] + (rec[working].text ? '. ' + rec[working].text : '') : done === a.stages.length ? L.agentDone : last || L.agentIdle);
					setText(c.stats, done + ' / ' + a.stages.length + ' ' + L.agentChecks + (risks ? ' · ' + risks + ' ' + L.agentRisks : '') + (errs ? ' · ' + errs + ' ' + L.agentErrors : ''));
					c.el.classList.toggle('is-dim', session.filter !== 'all' && !a.stages.some((id) => groupOf[id] === session.filter));
					c.el.classList.toggle('is-working', !!working);
					Array.from(c.chips.children).forEach((chip, i) => {
						const cls = 'ag-chip s-' + sts[i];
						if (chip.className !== cls) chip.className = cls;
					});
				});
			});
		}

		// ---- WORKFLOWS
		function buildWorkflows() {
			E.wfSteps = [];
			const track = h('ol', { class: 'wf' });
			PHASES.forEach((ids, i) => {
				const chips = h('div', { class: 'wf-chips' }, ids.map((id) => h('span', { class: 'wf-chip s-queued', 'data-id': id }, [sprite(id), h('span', { text: stageLabel[id] })])));
				const badge = h('span', { class: 'wf-badge' }, [h('b', { text: String(i + 1) }), icon('check', 'wf-tick')]);
				const pill = h('span', { class: 'pill' }, [h('i', { class: 'rc-dotc' }), h('span')]);
				const li = h('li', { class: 'wf-step s-queued' }, [badge, h('div', { class: 'wf-card' }, [h('h4', { text: L['wf_' + (i + 1)] }), pill, chips])]);
				E.wfSteps.push({ li, pill, chips, cur: '' });
				track.appendChild(li);
			});
			E.wfBar = h('i', { class: 'bar-fill' });
			E.wfNow = h('p', { class: 'wf-now' });
			view('workflows', h('div', { class: 'v-workflows' }, [
				h('section', { class: 'panel' }, [h('div', { class: 'bar bar-lg' }, [E.wfBar]), E.wfNow]), track
			]), (m) => {
				let curStep = -1;
				let doneSteps = 0;
				let frac = 0;
				PHASES.forEach((ids, i) => {
					const c = E.wfSteps[i];
					const sts = ids.map((id) => pstatus(id, m));
					const agg = sts.indexOf('error') >= 0 ? 'error' : sts.indexOf('risk') >= 0 ? 'risk' : sts.indexOf('running') >= 0 ? 'running' : sts.every((s) => s === 'done' || s === 'skipped') && sts.some((s) => s === 'done') ? 'done' : sts.some((s) => s === 'done') ? 'running' : 'queued';
					if (agg === 'done') doneSteps++;
					frac += sts.filter((s) => s === 'done').length / ids.length;
					if (curStep < 0 && (agg === 'running' || agg === 'risk' || agg === 'error')) curStep = i;
					if (c.cur !== agg) {
						c.cur = agg;
						c.li.className = 'wf-step s-' + agg;
						c.pill.className = 'pill s-' + agg;
						setText(c.pill.lastChild, L['s_' + agg]);
					}
					Array.from(c.chips.children).forEach((chip, k) => {
						const cls = 'wf-chip s-' + sts[k];
						if (chip.className !== cls) chip.className = cls;
					});
				});
				E.wfBar.style.setProperty('--p', String((frac / PHASES.length) * 100));
				setText(E.wfNow, L.wfCurrent + ': ' + (curStep >= 0 ? L['wf_' + (curStep + 1)] : m.run === 'ready' ? L.finished : '—'));
			});
		}

		// ---- INFRASTRUCTURE
		function buildInfra() {
			E.toolCards = {};
			const grid = h('div', { class: 'in-grid' });
			TOOLS.forEach((t) => {
				const pill = h('span', { class: 'pill' }, [h('i', { class: 'rc-dotc' }), h('span')]);
				const seen = h('small', { class: 'in-seen' });
				const el = h('section', { class: 'panel in', 'data-id': t.id }, [
					h('div', { class: 'in-top' }, [sprite(t.icon, 'in-ico'), h('h4', { text: L['t_' + t.id] || t.id }), pill]),
					h('p', { class: 'in-desc', text: L['td_' + t.id] || '' }), seen
				]);
				E.toolCards[t.id] = { el, pill, seen, cur: '' };
				grid.appendChild(el);
			});
			view('infrastructure', h('div', { class: 'v-infra' }, [grid]), (m) => {
				TOOLS.forEach((t) => {
					const c = E.toolCards[t.id];
					const sts = t.stages.map((id) => pstatus(id, m));
					const agg = sts.indexOf('error') >= 0 ? 'error' : sts.indexOf('risk') >= 0 ? 'risk' : sts.indexOf('running') >= 0 ? 'running' : sts.some((s) => s === 'done') ? 'done' : sts.every((s) => s === 'skipped') ? 'skipped' : 'queued';
					if (c.cur !== agg) {
						c.cur = agg;
						c.pill.className = 'pill s-' + agg;
						setText(c.pill.lastChild, L['s_' + agg]);
					}
					c.el.hidden = session.filter !== 'all' && !t.stages.some((id) => groupOf[id] === session.filter);
					const last = Math.max.apply(null, t.stages.map((id) => rec[id].last));
					setText(c.seen, L.toolsSeen + ': ' + ago(last));
				});
			});
		}

		// ---- LOGS
		function buildLogs() {
			E.lgList = h('ol', { class: 'lg', tabindex: '0', 'aria-label': L.logs });
			E.lgEmpty = h('p', { class: 'pt-empty', text: L.logEmpty });
			E.lgSearch = h('input', { class: 'rc-input', type: 'search', placeholder: L.logSearch, 'aria-label': L.logSearch, autocomplete: 'off', spellcheck: 'false' });
			E.lgSearch.addEventListener('input', () => {
				session.logQuery = E.lgSearch.value;
				E.lgSig = '';
				render(true);
			});
			E.lgChips = {};
			const chips = h('div', { class: 'chips', role: 'group', 'aria-label': L.logs });
			[['all', 'logAll'], ['info', 'logInfo'], ['risk', 'logRisk'], ['error', 'logError']].forEach(([k, label]) => {
				const b = h('button', { class: 'chip lv-' + k, type: 'button', 'aria-pressed': 'false', text: L[label] });
				b.addEventListener('click', () => {
					session.logLevel = k;
					E.lgSig = '';
					render(true);
				});
				chips.appendChild(b);
				E.lgChips[k] = b;
			});
			E.lgFollow = h('label', { class: 'rc-check' }, [h('input', { type: 'checkbox', checked: true }), h('span', { text: L.logFollow })]);
			E.lgFollow.firstChild.addEventListener('change', () => (session.follow = E.lgFollow.firstChild.checked));
			E.lgCopy = h('button', { class: 'rc-btn rc-ghost rc-small', type: 'button' }, [icon('copy'), h('span', { text: L.logCopy })]);
			E.lgCopy.addEventListener('click', () => {
				const m = api.model();
				const text = m.log.map((r) => r.time + ' ' + r.tag + ' ' + r.text).join('\n');
				const done = () => {
					setText(E.lgCopy.lastChild, L.logCopied);
					setTimeout(() => setText(E.lgCopy.lastChild, L.logCopy), 1400);
				};
				if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => {});
				else done();
			});
			view('logs', h('div', { class: 'v-logs' }, [
				h('section', { class: 'panel panel-logs' }, [
					h('div', { class: 'panel-head panel-head-wrap' }, [chips, h('div', { class: 'searchbox' }, [icon('search'), E.lgSearch]), E.lgFollow, E.lgCopy]),
					E.lgList, E.lgEmpty
				])
			]), (m) => {
				const level = session.logLevel;
				const q = session.logQuery.trim().toLowerCase();
				const rows = m.log.filter((r) => {
					if (level === 'risk' && r.status !== 'risk') return false;
					if (level === 'error' && r.status !== 'fail') return false;
					if (level === 'info' && (r.status === 'risk' || r.status === 'fail')) return false;
					if (session.filter !== 'all' && groupOf[r.stage] !== session.filter) return false;
					return !q || (r.text + ' ' + r.tag).toLowerCase().indexOf(q) >= 0;
				});
				const sig = rows.length + ':' + (rows.length ? rows[rows.length - 1].n : 0) + ':' + level + ':' + q + ':' + session.filter;
				if (sig !== E.lgSig) {
					E.lgSig = sig;
					E.lgList.textContent = '';
					const frag = document.createDocumentFragment();
					rows.forEach((r) => frag.appendChild(logItem(r)));
					E.lgList.appendChild(frag);
					if (session.follow) E.lgList.scrollTop = E.lgList.scrollHeight;
				}
				E.lgEmpty.hidden = rows.length > 0;
				E.lgList.hidden = rows.length === 0;
				Object.keys(E.lgChips).forEach((k) => {
					E.lgChips[k].classList.toggle('is-on', level === k);
					setAttr(E.lgChips[k], 'aria-pressed', String(level === k));
				});
				if (E.lgSearch.value !== session.logQuery) E.lgSearch.value = session.logQuery;
				E.lgFollow.firstChild.checked = session.follow;
			});
		}

		// ---- ALERTS
		function buildAlerts() {
			E.alList = h('ol', { class: 'al' });
			E.alEmptyFace = face(AGENTS[4], 'lg');
			E.alEmpty = h('div', { class: 'al-empty' }, [E.alEmptyFace, h('p', { text: L.alertEmpty })]);
			view('alerts', h('div', { class: 'v-alerts' }, [E.alEmpty, E.alList]), (m) => {
				const rows = alertRows(m).filter((r) => session.filter === 'all' || groupOf[r.stage] === session.filter);
				const sig = rows.map((r) => r.n).join() + session.filter;
				if (sig !== E.alSig) {
					E.alSig = sig;
					E.alList.textContent = '';
					rows.slice().reverse().forEach((r) => {
						const bad = r.status === 'fail';
						const who = agentOf[r.stage] || AGENTS[0];
						const f = face(who, 'sm');
						setMood(f, bad ? 'dizzy' : 'worry');
						E.alList.appendChild(h('li', { class: 'al-row ' + (bad ? 'is-bad' : 'is-warn') }, [
							f,
							h('div', { class: 'al-copy' }, [h('p', { class: 'al-title' }, [h('b', { text: bad ? L.alertErr : L.alertWarn }), h('span', { text: r.tag }), h('time', { text: r.time })]), h('p', { class: 'al-text', text: r.text })])
						]));
					});
				}
				E.alEmpty.hidden = rows.length > 0;
				setMood(E.alEmptyFace, m.run === 'ready' ? 'happy' : 'content');
			});
		}

		// ---- SETTINGS
		function buildSettings() {
			const seg = (key, options, labelKey, note) => {
				const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': L[labelKey] });
				options.forEach(([val, label]) => {
					const b = h('button', { class: 'seg-b', type: 'button', role: 'radio', 'aria-checked': 'false', 'data-val': val, text: L[label] });
					b.addEventListener('click', () => {
						prefs[key] = val;
						savePrefs();
						applyPrefs();
						render(true);
					});
					group.appendChild(b);
				});
				E['seg_' + key] = group;
				return h('div', { class: 'set-row' }, [h('div', { class: 'set-copy' }, [h('b', { text: L[labelKey] }), note ? h('p', { text: L[note] }) : null]), group]);
			};
			E.setFaces = h('button', { class: 'rc-switch', type: 'button', role: 'switch', 'aria-checked': 'true', 'aria-label': L.setFaces }, [h('i', { class: 'rc-knob' })]);
			E.setFaces.addEventListener('click', () => {
				prefs.faces = !prefs.faces;
				savePrefs();
				applyPrefs();
				render(true);
			});
			const reset = h('button', { class: 'rc-btn rc-ghost', type: 'button', text: L.setReset });
			reset.addEventListener('click', () => {
				Object.assign(prefs, DEFAULT_PREFS, { view: 'settings' });
				savePrefs();
				applyPrefs();
				render(true);
			});
			view('settings', h('div', { class: 'v-settings' }, [
				h('section', { class: 'panel' }, [
					seg('motion', [['auto', 'setMotionAuto'], ['full', 'setMotionFull'], ['off', 'setMotionOff']], 'setMotion', 'setMotionNote'),
					seg('density', [['comfortable', 'setComfort'], ['compact', 'setCompact']], 'setDensity'),
					seg('rate', [[0, 'setLive'], [2000, 'r2'], [5000, 'r5']], 'setRate', 'setRateNote'),
					h('div', { class: 'set-row' }, [h('div', { class: 'set-copy' }, [h('b', { text: L.setFaces })]), E.setFaces]),
					h('div', { class: 'set-row' }, [h('p', { class: 'set-saved', text: L.saved }), reset])
				])
			]), () => {
				Array.from(E.seg_motion.children).forEach((b) => b.setAttribute('aria-checked', String(b.getAttribute('data-val') === prefs.motion)));
				Array.from(E.seg_density.children).forEach((b) => b.setAttribute('aria-checked', String(b.getAttribute('data-val') === prefs.density)));
				Array.from(E.seg_rate.children).forEach((b) => b.setAttribute('aria-checked', String(Number(b.getAttribute('data-val')) === Number(prefs.rate))));
				setAttr(E.setFaces, 'aria-checked', String(!!prefs.faces));
			});
		}
		L.r2 = '2 s';
		L.r5 = '5 s';

		buildOverview();
		buildSystems();
		buildProcesses();
		buildAll();
		buildAgents();
		buildWorkflows();
		buildInfra();
		buildLogs();
		buildAlerts();
		buildSettings();

		// ------------------------------------------------ chrome updates
		function updateChrome(m) {
			const hud = api.hud();
			const st = m.run === 'idle' ? 'idle' : m.run;
			setText(E.sys.state, L['run_' + st] || st);
			setAttr(E.sys.state, 'data-run', st);
			setText(E.sys.target, m.host || '—');
			setText(E.sys.pages, pagesText());
			setText(E.sys.elapsed, hud.clock);
			setText(E.sys.phase, hud.phase);
			const alerts = alertRows(m).length;
			E.alertBadge.hidden = alerts === 0;
			setText(E.alertBadge, String(alerts));
			const c = countsOf(m);
			STATUS_ORDER.forEach((s) => setText(E.legendBtns[s].lastChild, String(c[s])));
			const bad = c.error + c.risk;
			let note = L.nominal;
			if (m.run === 'ready') note = L.finished;
			else if (m.run === 'stopped' || m.run === 'stopping') note = L.stoppedNote;
			else if (bad) note = fill(L.attention, { n: bad });
			setText(E.footText, note);
			E.foot.setAttribute('data-tone', bad || m.run === 'failed' ? 'warn' : m.run === 'stopped' || m.run === 'stopping' ? 'stop' : 'ok');
			root.setAttribute('data-run', st);
			setText(E.title, view_title());
			setText(E.sub, viewSub());
			E.ddLabel.textContent = (ddItems.find((x) => x.id === session.filter) || ddItems[0]).label;
			E.ddBtn.classList.toggle('is-filtered', session.filter !== 'all');
			Array.from(E.ddMenu.children).forEach((li) => li.setAttribute('aria-selected', String(li.getAttribute('data-id') === session.filter)));
		}
		const view_title = () => (R.view === 'all' ? L.all : L[R.view]);
		const viewSub = () => (R.view === 'all' ? L.sub_all : L['sub_' + R.view]);

		// ------------------------------------------------ rendering, pacing and the controls
		function render(force) {
			if (R.destroyed) return;
			const m = api.model();
			const t = performance.now();
			if (!force) {
				if (!prefs.auto) {
					if (!R.paused) setPaused(true);
					return;
				}
				if (prefs.rate && t - R.lastRender < prefs.rate) {
					if (!R.trailing) R.trailing = setTimeout(() => ((R.trailing = 0), render(false)), prefs.rate - (t - R.lastRender));
					return;
				}
			}
			if (R.trailing) {
				clearTimeout(R.trailing);
				R.trailing = 0;
			}
			R.lastRender = t;
			R.updatedAt = Date.now();
			if (force) setPaused(!prefs.auto);
			updateChrome(m);
			if (upd[R.view]) upd[R.view](m);
			E.root.classList.toggle('is-frozen', !prefs.auto);
		}
		function setPaused(on) {
			R.paused = on;
			E.paused.hidden = !on;
			if (on) E.paused.textContent = L.paused + ' ' + fill(L.updated, { t: new Date(R.updatedAt || Date.now()).toLocaleTimeString() });
		}
		function setAuto(on) {
			prefs.auto = !!on;
			savePrefs();
			applyPrefs();
			if (on) {
				setPaused(false);
				render(true);
			} else setPaused(true);
		}
		function applyPrefs() {
			const motion = prefs.motion === 'auto' ? (reduced.matches ? 'off' : 'full') : prefs.motion;
			root.setAttribute('data-motion', motion);
			root.setAttribute('data-density', prefs.density);
			root.setAttribute('data-faces', prefs.faces ? 'on' : 'off');
			setAttr(E.auto, 'aria-checked', String(!!prefs.auto));
			E.root.classList.toggle('is-frozen', !prefs.auto);
		}
		function go(id) {
			if (!views[id]) return;
			R.view = id;
			if (id !== 'all') {
				prefs.view = id;
				savePrefs();
			}
			root.setAttribute('data-view', id);
			Object.keys(views).forEach((k) => (views[k].hidden = k !== id));
			NAV.forEach((n) => {
				const on = n === id || (id === 'all' && n === 'processes');
				E.nav[n].classList.toggle('is-on', on);
				if (on) E.nav[n].setAttribute('aria-current', 'page');
				else E.nav[n].removeAttribute('aria-current');
			});
			E.legend.hidden = !(id === 'processes' || id === 'all');
			E.body.scrollTop = 0;
			render(true);
			if (id === 'logs' && E.lgList) E.lgList.scrollTop = E.lgList.scrollHeight;
		}
		function pickSystem(id) {
			session.filter = id;
			closeMenu();
			E.ddBtn.focus();
			E.lgSig = '';
			E.alSig = '';
			render(true);
		}
		function openMenu() {
			E.ddMenu.hidden = false;
			E.ddBtn.setAttribute('aria-expanded', 'true');
			const cur = E.ddMenu.querySelector('[data-id="' + session.filter + '"]') || E.ddMenu.firstChild;
			cur.focus();
		}
		function closeMenu() {
			E.ddMenu.hidden = true;
			E.ddBtn.setAttribute('aria-expanded', 'false');
		}
		function menuKey(e, li) {
			if (e.key === 'Escape') {
				closeMenu();
				E.ddBtn.focus();
			} else if (e.key === 'ArrowDown') {
				e.preventDefault();
				(li.nextSibling || E.ddMenu.firstChild).focus();
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				(li.previousSibling || E.ddMenu.lastChild).focus();
			} else if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				pickSystem(li.getAttribute('data-id'));
			} else if (e.key === 'Tab') closeMenu();
		}
		const onDoc = (e) => {
			if (!E.ddMenu.hidden && e.composedPath().indexOf(E.ddWrap) < 0) closeMenu();
		};
		document.addEventListener('pointerdown', onDoc);

		// full screen: the real API where it exists, a fixed overlay where it does not (iPhone)
		function isFull() {
			return shadow.fullscreenElement === root || root.classList.contains('is-pseudofull');
		}
		function toggleFull() {
			if (isFull()) {
				if (shadow.fullscreenElement === root) document.exitFullscreen();
				root.classList.remove('is-pseudofull');
				document.documentElement.classList.remove('rc-noscroll');
				syncFull();
			} else if (root.requestFullscreen) {
				root.requestFullscreen().catch(pseudoFull);
			} else pseudoFull();
		}
		function pseudoFull() {
			root.classList.add('is-pseudofull');
			document.documentElement.classList.add('rc-noscroll');
			syncFull();
		}
		function syncFull() {
			const on = isFull();
			E.full.setAttribute('aria-pressed', String(on));
			E.full.title = on ? L.exitFull : L.fullscreen;
			E.full.setAttribute('aria-label', on ? L.exitFull : L.fullscreen);
			E.full.firstChild.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (on ? IC.exitfull : IC.full) + '</svg>';
			root.classList.toggle('is-full', on);
			fit();
		}
		const onFull = () => {
			if (shadow.fullscreenElement !== root) {
				root.classList.remove('is-pseudofull');
				document.documentElement.classList.remove('rc-noscroll');
			}
			syncFull();
		};
		document.addEventListener('fullscreenchange', onFull);
		const onKey = (e) => {
			if (e.key === 'Escape' && root.classList.contains('is-pseudofull')) toggleFull();
		};
		document.addEventListener('keydown', onKey);
		const onMotion = () => applyPrefs();
		if (reduced.addEventListener) reduced.addEventListener('change', onMotion);

		// time moves even when no line arrives: elapsed times and "last seen" tick once a second
		R.tick = setInterval(() => {
			if (prefs.auto && !document.hidden) render(false);
		}, 1000);

		// The scene is a fixed 16:9 game screen (1280 x 720 design pixels) scaled to the frame, like the arena always was.
		// Full screen keeps the scale that fits and gives the extra room to the layout.
		const BASE_W = 1280, BASE_H = 720;
		function fit() {
			if (R.destroyed) return;
			const W = root.clientWidth, H = isFull() ? root.clientHeight : (W * BASE_H) / BASE_W;
			if (!W || !H) return;
			const k = isFull() ? Math.min(W / BASE_W, H / BASE_H) : W / BASE_W;
			E.app.style.width = Math.max(BASE_W, W / k) + 'px';
			E.app.style.height = Math.max(BASE_H, H / k) + 'px';
			E.app.style.transform = 'scale(' + k + ')';
			E.cover.hidden = isFull() || k > 0.58;
		}
		const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
		if (ro) ro.observe(root);
		fit();

		applyPrefs();
		go(R.view);
		track();
		render(true);

		return {
			sync() {
				if (R.destroyed) return;
				track();
				render(false);
			},
			destroy() {
				R.destroyed = true;
				if (ro) ro.disconnect();
				clearInterval(R.tick);
				clearTimeout(R.trailing);
				document.removeEventListener('pointerdown', onDoc);
				document.removeEventListener('fullscreenchange', onFull);
				document.removeEventListener('keydown', onKey);
				if (reduced.removeEventListener) reduced.removeEventListener('change', onMotion);
				if (shadow.fullscreenElement === root && document.exitFullscreen) document.exitFullscreen();
				document.documentElement.classList.remove('rc-noscroll');
				live = null;
			},
			snapshot() {
				const m = api.model();
				const statuses = {};
				stageIds.forEach((id) => (statuses[id] = pstatus(id, m)));
				return { view: R.view, filter: session.filter, auto: prefs.auto, paused: R.paused, statuses, counts: countsOf(m), alerts: alertRows(m).length, moods: AGENTS.reduce((o, a) => ((o[a.id] = moodOf(a.stages, m)), o), {}), full: isFull() };
			},
			go: go
		};
	}

	window.ReviewConsole = {
		mount(wrap, api) {
			if (live) live.destroy();
			live = create(wrap, api);
			return live;
		},
		snapshot() {
			return live ? live.snapshot() : null;
		}
	};
})();
