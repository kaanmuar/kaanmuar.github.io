(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && root.document) {
        root.SiteGlossary = api;
        api.boot(root);
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    // "Review" is the product: an automated analysis of a site, never a book or film review.
    // "Read" is what the review does to pages: it analyzes them, it does not read them aloud.
    // Spanish targets Latin America (es-419), Portuguese targets Brazil.
    const W = '(?<![\\p{L}\\p{N}])';
    const E = '(?![\\p{L}\\p{N}])';
    function rule(find, fix, note) {
        return { find: new RegExp(W + find + E, 'gu'), fix, note: note || find };
    }
    function words(pairs) {
        return pairs.map(([find, fix, note]) => rule(find, fix, note));
    }

    const BRANDS = [
        ['Faro(?= \\d| de Google| móvil| para)', 'Lighthouse', 'Lighthouse is a product name'],
        ['Farol(?= \\d| do Google| móvel| para)', 'Lighthouse', 'Lighthouse is a product name'],
        ['Leuchtturm(?= \\d| von Google| mobil| für)', 'Lighthouse', 'Lighthouse is a product name'],
        ['Phare(?= \\d| de Google| mobile| pour)', 'Lighthouse', 'Lighthouse is a product name'],
        ['Navegación [Ss]egura(?= de Google)', 'Safe Browsing', 'Safe Browsing is a product name'],
        ['Navegação [Ss]egura(?= do Google| da Google)', 'Safe Browsing', 'Safe Browsing is a product name'],
        ['Sicheres Surfen(?= von Google)', 'Safe Browsing', 'Safe Browsing is a product name'],
        ['Navigation [Ss]écurisée(?= de Google)', 'Safe Browsing', 'Safe Browsing is a product name'],
        ['(?:retirar|retirer|aposentar|zurückziehen)\\.js', 'retire.js', 'retire.js is a product name']
    ];

    const FIXES = {
        es: words(BRANDS.concat([
            ['reseñas', 'revisiones', 'review is an analysis, not a reseña'],
            ['Reseñas', 'Revisiones', 'review is an analysis, not a reseña'],
            ['reseña', 'revisión', 'review is an analysis, not a reseña'],
            ['Reseña', 'Revisión', 'review is an analysis, not a reseña'],
            ['lectura pública', 'análisis público', 'a read is an analysis'],
            ['Lectura pública', 'Análisis público', 'a read is an analysis'],
            ['lectura automática', 'análisis automático', 'a read is an analysis'],
            ['lectura más amplia', 'análisis más amplio', 'a read is an analysis'],
            ['lectura más profunda', 'análisis más profundo', 'a read is an analysis'],
            ['lectura más extensa o profunda', 'análisis más extenso o profundo', 'a read is an analysis'],
            ['lectura más extensa', 'análisis más extenso', 'a read is an analysis'],
            ['lecturas', 'análisis', 'a read is an analysis'],
            ['Lecturas', 'Análisis', 'a read is an analysis'],
            ['(?<![Ss]olo |[Ss]ólo |de )lectura', 'análisis', 'a read is an analysis'],
            ['Lectura(?! de pantalla)', 'Análisis', 'a read is an analysis'],
            ['una análisis', 'un análisis', 'análisis is masculine'],
            ['Una análisis', 'Un análisis', 'análisis is masculine'],
            ['la análisis', 'el análisis', 'análisis is masculine'],
            ['La análisis', 'El análisis', 'análisis is masculine'],
            ['las análisis', 'los análisis', 'análisis is masculine'],
            ['Las análisis', 'Los análisis', 'análisis is masculine'],
            ['esta análisis', 'este análisis', 'análisis is masculine'],
            ['Esta análisis', 'Este análisis', 'análisis is masculine'],
            ['otra análisis', 'otro análisis', 'análisis is masculine'],
            ['nueva análisis', 'nuevo análisis', 'análisis is masculine'],
            ['primera análisis', 'primer análisis', 'análisis is masculine'],
            ['Leímos', 'Analizamos', 'a site is analyzed'],
            ['Leemos', 'Analizamos', 'a site is analyzed'],
            ['leímos', 'analizamos', 'a site is analyzed'],
            ['páginas leídas', 'páginas analizadas', 'pages are analyzed'],
            ['Páginas leídas', 'Páginas analizadas', 'pages are analyzed'],
            ['Páginas para leer', 'Páginas por analizar', 'pages are analyzed'],
            ['mientras se leen las páginas', 'mientras se analizan las páginas', 'pages are analyzed'],
            ['leídos por', 'analizados por', 'sites are analyzed'],
            ['leídas por', 'analizadas por', 'pages are analyzed'],
            ['Antes de leer una sola dirección', 'Antes de analizar una sola dirección', 'addresses are analyzed'],
            ['en directo', 'en vivo', 'es-419: en vivo'],
            ['En directo', 'En vivo', 'es-419: en vivo'],
            ['ordenadores', 'computadores', 'es-419: computador'],
            ['ordenador', 'computador', 'es-419: computador'],
            ['Ordenador', 'Computador', 'es-419: computador'],
            ['el móvil', 'el celular', 'es-419: celular'],
            ['tu móvil', 'tu celular', 'es-419: celular'],
            ['su móvil', 'su celular', 'es-419: celular'],
            ['un móvil', 'un celular', 'es-419: celular'],
            ['del móvil', 'del celular', 'es-419: celular'],
            ['teléfono móvil', 'celular', 'es-419: celular'],
            ['teléfonos móviles', 'celulares', 'es-419: celular'],
            ['vídeos', 'videos', 'es-419: video'],
            ['vídeo', 'video', 'es-419: video'],
            ['Vídeo', 'Video', 'es-419: video'],
            ['ficheros', 'archivos', 'es-419: archivo'],
            ['fichero', 'archivo', 'es-419: archivo'],
            ['Fichero', 'Archivo', 'es-419: archivo'],
            ['rellenar', 'completar', 'es-419: completar'],
            ['Rellene', 'Completa', 'es-419: completar'],
            ['rellene', 'complete', 'es-419: completar'],
            ['pinchar', 'hacer clic', 'es-419: hacer clic'],
            ['Pinche', 'Haz clic', 'es-419: hacer clic'],
            ['Pulse', 'Presiona', 'es-419: presionar'],
            ['pulsar', 'presionar', 'es-419: presionar'],
            ['pulsa', 'presiona', 'es-419: presionar'],
            ['Pulsa', 'Presiona', 'es-419: presionar'],
            ['vosotros', 'ustedes', 'es-419: ustedes'],
            ['Vosotros', 'Ustedes', 'es-419: ustedes'],
            ['las cabeceras', 'los encabezados', 'HTTP headers are encabezados'],
            ['Las cabeceras', 'Los encabezados', 'HTTP headers are encabezados'],
            ['la cabecera', 'el encabezado', 'HTTP headers are encabezados'],
            ['una cabecera', 'un encabezado', 'HTTP headers are encabezados'],
            ['cabeceras', 'encabezados', 'HTTP headers are encabezados'],
            ['Cabeceras', 'Encabezados', 'HTTP headers are encabezados'],
            ['cabecera', 'encabezado', 'HTTP headers are encabezados'],
            ['Cabecera', 'Encabezado', 'HTTP headers are encabezados'],
            ['puede correr', 'puede ejecutar', 'a review is run (ejecutar)'],
            ['Consulte', 'Consulta', 'tú, not usted'],
            ['Vea', 'Mira', 'tú, not usted'],
            ['Haga clic', 'Haz clic', 'tú, not usted'],
            ['Seleccione', 'Selecciona', 'tú, not usted'],
            ['Elija', 'Elige', 'tú, not usted'],
            ['Introduzca', 'Ingresa', 'tú, not usted'],
            ['introduzca', 'ingresa', 'tú, not usted'],
            ['Ingrese', 'Ingresa', 'tú, not usted'],
            ['Escriba', 'Escribe', 'tú, not usted'],
            ['Abra', 'Abre', 'tú, not usted'],
            ['Revise', 'Revisa', 'tú, not usted'],
            ['Descargue', 'Descarga', 'tú, not usted'],
            ['Comparta', 'Comparte', 'tú, not usted'],
            ['Utilice', 'Usa', 'tú, not usted'],
            ['Use', 'Usa', 'tú, not usted'],
            ['Pruebe', 'Prueba', 'tú, not usted'],
            ['Intente', 'Intenta', 'tú, not usted'],
            ['Vuelva', 'Vuelve', 'tú, not usted'],
            ['Espere', 'Espera', 'tú, not usted'],
            ['Acepte', 'Acepta', 'tú, not usted'],
            ['Copie', 'Copia', 'tú, not usted'],
            ['Pegue', 'Pega', 'tú, not usted'],
            ['Marque', 'Marca', 'tú, not usted'],
            ['Agregue', 'Agrega', 'tú, not usted'],
            ['Añada', 'Agrega', 'tú, not usted'],
            ['añada', 'agrega', 'es-419: agregar'],
            ['añadir', 'agregar', 'es-419: agregar'],
            ['Añadir', 'Agregar', 'es-419: agregar'],
            ['Explore', 'Explora', 'tú, not usted'],
            ['Visite', 'Visita', 'tú, not usted'],
            ['Cierre', 'Cierra', 'tú, not usted'],
            ['Guarde', 'Guarda', 'tú, not usted'],
            ['Envíe', 'Envía', 'tú, not usted'],
            ['Lea', 'Lee', 'tú, not usted'],
            ['Tome', 'Toma', 'tú, not usted'],
            ['Haga', 'Haz', 'tú, not usted'],
            ['hasta que usted acepte', 'hasta que aceptes', 'tú, not usted'],
            ['que usted envía', 'que envías', 'tú, not usted'],
            ['Realice', 'Realiza', 'tú, not usted'],
            ['usted puede', 'puedes', 'tú, not usted'],
            ['Usted puede', 'Puedes', 'tú, not usted']
        ])),
        pt: words(BRANDS.concat([
            ['resenhas', 'revisões', 'review is an analysis, not a resenha'],
            ['resenha', 'revisão', 'review is an analysis, not a resenha'],
            ['Resenha', 'Revisão', 'review is an analysis, not a resenha'],
            ['leituras', 'análises', 'a read is an analysis'],
            ['Leituras', 'Análises', 'a read is an analysis'],
            ['(?<![Ss]ó |[Ss]omente |[Aa]penas |de )leitura', 'análise', 'a read is an analysis'],
            ['Leitura(?! de tela)', 'Análise', 'a read is an analysis'],
            ['páginas lidas', 'páginas analisadas', 'pages are analyzed'],
            ['Páginas lidas', 'Páginas analisadas', 'pages are analyzed'],
            ['lidos pela', 'analisados pela', 'sites are analyzed'],
            ['Lemos', 'Analisamos', 'a site is analyzed'],
            ['no ecrã', 'na tela', 'pt-BR: tela'],
            ['do ecrã', 'da tela', 'pt-BR: tela'],
            ['o ecrã', 'a tela', 'pt-BR: tela'],
            ['ecrã', 'tela', 'pt-BR: tela'],
            ['telemóvel', 'celular', 'pt-BR: celular'],
            ['telemóveis', 'celulares', 'pt-BR: celular'],
            ['ficheiros', 'arquivos', 'pt-BR: arquivo'],
            ['ficheiro', 'arquivo', 'pt-BR: arquivo'],
            ['utilizadores', 'usuários', 'pt-BR: usuário'],
            ['utilizador', 'usuário', 'pt-BR: usuário'],
            ['registo', 'registro', 'pt-BR: registro'],
            ['equipa', 'equipe', 'pt-BR: equipe'],
            ['em direto', 'ao vivo', 'pt-BR: ao vivo']
        ])),
        de: words(BRANDS.concat([
            ['Rezensionen', 'Prüfungen', 'review is an analysis, not a Rezension'],
            ['Rezension', 'Prüfung', 'review is an analysis, not a Rezension'],
            ['Lesungen', 'Analysen', 'a read is an analysis'],
            ['Lesung', 'Analyse', 'a read is an analysis'],
            ['gelesenen Seiten', 'geprüften Seiten', 'pages are analyzed'],
            ['Gelesene Seiten', 'Geprüfte Seiten', 'pages are analyzed'],
            ['(?<=Wir haben \\S+(?: \\S+){0,4} )gelesen', 'geprüft', 'a site is analyzed']
        ])),
        fr: words(BRANDS.concat([
            ['lectures', 'analyses', 'a read is an analysis'],
            ['Lectures', 'Analyses', 'a read is an analysis'],
            ['(?<!d’|d\')lecture(?! seule)', 'analyse', 'a read is an analysis'],
            ['Lecture(?! seule)', 'Analyse', 'a read is an analysis'],
            ['pages lues', 'pages analysées', 'pages are analyzed'],
            ['Pages lues', 'Pages analysées', 'pages are analyzed'],
            ['une critique', 'une analyse', 'review is an analysis, not a critique'],
            ['la critique', 'l’analyse', 'review is an analysis, not a critique'],
            ['un avis', 'une analyse', 'review is an analysis, not an avis'],
            ['Nous avons lu', 'Nous avons analysé', 'a site is analyzed']
        ])),
        it: words([
            ['Faro(?= \\d| di Google| mobile| per)', 'Lighthouse', 'Lighthouse is a product name'],
            ['Navigazione [Ss]icura(?= di Google)', 'Safe Browsing', 'Safe Browsing is a product name'],
            ['(?:ritirare|ritira)\\.js', 'retire.js', 'retire.js is a product name'],
            ['recensioni', 'revisioni', 'review is an analysis, not a recensione'],
            ['Recensioni', 'Revisioni', 'review is an analysis, not a recensione'],
            ['recensione', 'revisione', 'review is an analysis, not a recensione'],
            ['Recensione', 'Revisione', 'review is an analysis, not a recensione'],
            ['una lettura', 'un’analisi', 'a read is an analysis'],
            ['Una lettura', 'Un’analisi', 'a read is an analysis'],
            ['la lettura', 'l’analisi', 'a read is an analysis'],
            ['La lettura', 'L’analisi', 'a read is an analysis'],
            ['della lettura', 'dell’analisi', 'a read is an analysis'],
            ['alla lettura', 'all’analisi', 'a read is an analysis'],
            ['nella lettura', 'nell’analisi', 'a read is an analysis'],
            ['le letture', 'le analisi', 'a read is an analysis'],
            ['letture', 'analisi', 'a read is an analysis'],
            ['Letture', 'Analisi', 'a read is an analysis'],
            ['(?<![Ss]ola |di )lettura', 'analisi', 'a read is an analysis'],
            ['Lettura', 'Analisi', 'a read is an analysis'],
            ['pagine lette', 'pagine analizzate', 'pages are analyzed'],
            ['Pagine lette', 'Pagine analizzate', 'pages are analyzed'],
            ['Abbiamo letto', 'Abbiamo analizzato', 'a site is analyzed']
        ])
    };

    // Whole UI lines a word-level fix cannot repair. Keys are the English source text.
    const LINES = {
        es: {
            'Close': 'Cerrar',
            'Run dashboard': 'Panel de la revisión',
            'What a review is': '¿Qué es una revisión?',
            'Public read and case list': 'Análisis público y lista de casos',
            'Pages to read': 'Páginas por analizar',
            'Pages analyzed': 'Páginas analizadas',
            'Map of the pages analyzed': 'Mapa de las páginas analizadas',
            'See live reports of real sites ↓': 'Ver informes en vivo de sitios reales ↓',
            'See a sample report': 'Ver un informe de ejemplo',
            'Take the five-minute tour': 'Haz el recorrido de cinco minutos',
            'Speed, weight, paint, and layout shift': 'Velocidad, peso, renderizado y cambios de diseño'
        },
        pt: {
            'Close': 'Fechar',
            'Run dashboard': 'Painel da revisão',
            'What a review is': 'O que é uma revisão',
            'Public read and case list': 'Análise pública e lista de casos',
            'Pages to read': 'Páginas a analisar',
            'Pages analyzed': 'Páginas analisadas',
            'Map of the pages analyzed': 'Mapa das páginas analisadas',
            'Speed, weight, paint, and layout shift': 'Velocidade, peso, renderização e mudanças de layout'
        },
        de: {
            'Close': 'Schließen',
            'Run dashboard': 'Prüfungsübersicht',
            'What a review is': 'Was eine Prüfung ist',
            'Public read and case list': 'Öffentliche Analyse und Fallliste',
            'Pages to read': 'Zu prüfende Seiten',
            'Pages analyzed': 'Geprüfte Seiten',
            'Map of the pages analyzed': 'Karte der geprüften Seiten',
            'Speed, weight, paint, and layout shift': 'Tempo, Gewicht, Rendering und Layoutverschiebungen'
        },
        fr: {
            'Close': 'Fermer',
            'Run dashboard': 'Tableau de bord de l’analyse',
            'What a review is': 'Ce qu’est une analyse',
            'Public read and case list': 'Analyse publique et liste de cas',
            'Pages to read': 'Pages à analyser',
            'Pages analyzed': 'Pages analysées',
            'Map of the pages analyzed': 'Carte des pages analysées',
            'Speed, weight, paint, and layout shift': 'Vitesse, poids, rendu et décalages de mise en page'
        },
        it: {
            'Close': 'Chiudi',
            'Run dashboard': 'Pannello della revisione',
            'What a review is': 'Cos’è una revisione',
            'Public read and case list': 'Analisi pubblica ed elenco dei casi',
            'Pages to read': 'Pagine da analizzare',
            'Pages analyzed': 'Pagine analizzate',
            'Map of the pages analyzed': 'Mappa delle pagine analizzate',
            'Speed, weight, paint, and layout shift': 'Velocità, peso, rendering e spostamenti del layout'
        }
    };

    function fix(text, lang) {
        const rules = FIXES[lang];
        if (!rules || !text) return text;
        let out = text;
        rules.forEach((r) => { out = out.replace(r.find, r.fix); });
        return out;
    }

    function check(text, lang) {
        const rules = FIXES[lang] || [];
        const notes = [];
        rules.forEach((r) => {
            r.find.lastIndex = 0;
            if (r.find.test(text) && !notes.includes(r.note)) notes.push(r.note);
        });
        return notes;
    }

    function line(text, lang) {
        const book = LINES[lang];
        if (!book) return null;
        const key = String(text).replace(/\s+/g, ' ').trim();
        return book[key] || (KEEP.has(key) ? key : null);
    }

    /* ---------- browser ---------- */

    // Names machine translation must leave alone when they stand on their own ("QA-lab" became a "quality control lab").
    // Inside a sentence they are fixed afterwards instead: an untranslated island there costs the sentence its spaces and word order.
    const KEEP = new Set(['QA-lab URL Review', 'QA-lab', 'URL Review', 'PageSpeed Insights', 'Lighthouse', 'Core Web Vitals', 'Safe Browsing', 'MTA-STS', 'TLS-RPT', 'BIMI', 'Impressum', 'RDAP', 'retire.js']);
    const LEAF = 'h1, h2, h3, h4, h5, summary, button, a, label, p, li, span, b, strong, em, small, th, td, option, legend, figcaption, dt, dd';
    
    let win = null;
    let active = '';
    let queued = new Set();
    let frame = 0;

    function targetLang() {
        const i18n = win.SiteI18n;
        if (!i18n || win.__glossaryOff) return '';
        const lang = i18n.current();
        if (!lang || lang === 'en' || !FIXES[lang]) return '';
        if (i18n.usesDictionary(lang) || !i18n.translateAllowed()) return '';
        return lang;
    }

    function release(el) {
        el.removeAttribute('data-l10n-src');
        el.removeAttribute('data-l10n-as');
        el.removeAttribute('translate');
        el.classList.remove('notranslate');
    }

    function setLine(el, lang) {
        const src = el.getAttribute('data-l10n-src');
        if (src != null) {
            const as = el.getAttribute('data-l10n-as');
            if (el.textContent !== line(src, as)) {
                release(el);
            } else if (as === lang) {
                return;
            } else if (!line(src, lang)) {
                el.textContent = src;
                release(el);
                return;
            }
        }
        if (!lang || el.childElementCount) return;
        const english = el.getAttribute('data-l10n-src') || el.textContent;
        const local = line(english, lang);
        if (!local) return;
        el.setAttribute('data-l10n-src', english);
        el.setAttribute('data-l10n-as', lang);
        el.setAttribute('translate', 'no');
        el.classList.add('notranslate');
        el.textContent = local;
    }

    function lines(scope, lang) {
        if (scope.matches(LEAF) || scope.hasAttribute('data-l10n-src')) setLine(scope, lang);
        scope.querySelectorAll('[data-l10n-src]').forEach((el) => setLine(el, lang));
        if (lang) scope.querySelectorAll(LEAF).forEach((el) => { if (!el.childElementCount) setLine(el, lang); });
    }

    function machineOn() {
        return /\btranslated-(ltr|rtl)\b/.test(win.document.documentElement.className);
    }

    function polish(scope, lang) {
        if (!lang || !machineOn()) return;
        const walker = win.document.createTreeWalker(scope, 4);
        const edits = [];
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const host = node.parentElement;
            if (!host || !host.closest('font') || host.closest('script, style, pre, code, textarea')) continue;
            const next = fix(node.nodeValue, lang);
            if (next !== node.nodeValue) edits.push([node, next]);
        }
        edits.forEach(([node, next]) => { node.nodeValue = next; });
    }

    function prepare(scope) {
        if (!scope || scope.nodeType !== 1 || !win.document.contains(scope)) return;
        const lang = targetLang();
        lines(scope, lang);
    }

    function run() {
        frame = 0;
        const lang = targetLang();
        const doc = win.document;
        const scopes = lang !== active ? new Set([doc.body]) : queued;
        queued = new Set();
        if (lang !== active) prepare(doc.body);
        active = lang;
        scopes.forEach((scope) => { if (doc.contains(scope)) polish(scope, lang); });
    }

    function schedule(scope) {
        if (scope) queued.add(scope);
        if (!frame) frame = (win.requestAnimationFrame || win.setTimeout)(run, 16);
    }

    function refresh() {
        active = null;
        schedule(win.document.body);
    }

    function boot(root) {
        win = root;
        const start = () => {
            if (!win.document.body) return;
            new win.MutationObserver((records) => {
                records.forEach((r) => {
                    const scope = r.type === 'characterData' ? r.target.parentElement : r.target;
                    if (!scope) return;
                    if (r.type === 'childList') r.addedNodes.forEach((n) => prepare(n.nodeType === 1 ? n : n.parentElement));
                    else prepare(scope);
                    schedule(scope);
                });
            }).observe(win.document.body, { subtree: true, childList: true, characterData: true });
            new win.MutationObserver(refresh).observe(win.document.documentElement, { attributes: true, attributeFilter: ['class'] });
            refresh();
        };
        if (win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', start);
        else start();
        win.addEventListener('site-translate-allowed', refresh);
        win.addEventListener('site-lang-applied', refresh);
        win.addEventListener('storage', (event) => { if (event && event.key === 'cv-preferred-lang') refresh(); });
    }

    return { FIXES, LINES, fix, check, line, refresh, boot };
}));
