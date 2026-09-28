(function (global) {
    const RUNNER = 'http://127.0.0.1:8770/observe';
    const HISTORY_KEY = 'qa-lab-history';
    let timer = 0;
    let lastPulse = 0;
    let stallNoted = '';
    let reloaded = '';
    let modelState = 'unknown';
    let modelSource = '';

    function esc(value) {
        return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function cap(work, ms) {
        return new Promise((resolve) => {
            const timerId = setTimeout(() => resolve(null), ms);
            Promise.resolve(work).then(
                (value) => { clearTimeout(timerId); resolve(value); },
                () => { clearTimeout(timerId); resolve(null); }
            );
        });
    }

    function status(text) {
        const el = document.getElementById('lab-observer-status');
        if (el) el.textContent = text;
    }

    function note(text) {
        const box = document.getElementById('lab-observer-notes');
        if (!box) return;
        const row = document.createElement('p');
        row.textContent = text;
        box.appendChild(row);
        while (box.children.length > 6) box.removeChild(box.firstChild);
        box.scrollTop = box.scrollHeight;
    }

    function say(lab, text) {
        note(text);
        if (lab && lab.log) lab.log('<span class="k">OBSERVER</span> ' + esc(text));
    }

    function pulse() {
        lastPulse = Date.now();
    }

    async function askChrome(prompt) {
        if (!global.LanguageModel || typeof LanguageModel.availability !== 'function') return null;
        const state = await LanguageModel.availability();
        if (!state || state === 'unavailable') return null;
        const session = await LanguageModel.create();
        const text = await session.prompt(prompt);
        if (session.destroy) session.destroy();
        return text ? { text: String(text).trim(), source: 'Chrome' } : null;
    }

    async function askRunner(prompt) {
        const res = await fetch(RUNNER, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt }),
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || !data.ok || !data.text) return null;
        return { text: String(data.text).trim(), source: data.source || 'model' };
    }

    async function ask(prompt) {
        if (modelState === 'absent') return null;
        const answer = await cap((async () => {
            try {
                const chrome = await askChrome(prompt);
                if (chrome) return chrome;
            } catch (err) { /* try the runner */ }
            try {
                return await askRunner(prompt);
            } catch (err) {
                return null;
            }
        })(), 6000);
        if (answer && answer.text) {
            modelState = 'ready';
            modelSource = answer.source;
            status('Watching · ' + answer.source);
            return answer;
        }
        modelState = 'absent';
        status('Watching · no model connected');
        return null;
    }

    function readFailure(item, error) {
        const message = String(error || 'the check failed');
        if (/timed out/i.test(message)) {
            return item.id + ' stopped moving and hit the time limit. That is a freeze, not a wrong answer. Look at the page this case opens.';
        }
        return item.id + ' failed because the check said "' + message + '". It was looking for: ' + item.how;
    }

    function draftFromGaps(lab, ids) {
        const failed = lab.results.filter((row) => ids.includes(row.id) && !row.ok);
        const known = new Set((lab.results || []).map((row) => row.id));
        const drafts = [];
        failed.slice(0, 2).forEach((row) => {
            const item = ((global.QALab && global.QALab.cases) || []).find((entry) => entry.id === row.id);
            const title = item ? item.title : row.id;
            drafts.push({
                title: 'Follow-up for ' + title,
                where: item ? item.where : row.id,
                when: 'After ' + row.id + ' fails.',
                how: 'A separate check covers the same surface without repeating ' + row.id + '.'
            });
        });
        if (!drafts.length && known.size && known.size < 66) {
            drafts.push({
                title: 'Cover a catalog id this pass did not run',
                where: 'The case list',
                when: 'After a partial run.',
                how: 'The unrun id is executed on its own and the report lists it.'
            });
        }
        return drafts;
    }

    function showDrafts(drafts, source) {
        if (!drafts.length) return;
        const lead = source
            ? source + ' drafted ' + drafts.length + ' check' + (drafts.length === 1 ? '' : 's') + '. They are not in the catalog.'
            : 'Coverage note, not a new catalog check:';
        note(lead);
        drafts.forEach((draft) => {
            note(draft.title + ' — where ' + draft.where + '; when ' + draft.when + '; how ' + draft.how);
        });
    }

    function parseDrafts(text) {
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start < 0 || end <= start) return [];
        try {
            const rows = JSON.parse(text.slice(start, end + 1));
            if (!Array.isArray(rows)) return [];
            return rows.slice(0, 2).map((row) => ({
                title: String(row.title || 'New check').slice(0, 120),
                where: String(row.where || 'the page').slice(0, 160),
                when: String(row.when || 'during a run').slice(0, 160),
                how: String(row.how || 'the assertion holds').slice(0, 220)
            })).filter((row) => row.title);
        } catch (err) {
            return [];
        }
    }

    function reloadIfBlank(id) {
        if (reloaded === id) return false;
        const iframe = document.getElementById('sut');
        if (!iframe) return false;
        let blank = false;
        try {
            const doc = iframe.contentDocument;
            blank = !doc || !doc.body || doc.body.childElementCount === 0;
        } catch (err) {
            blank = true;
        }
        if (!blank) return false;
        reloaded = id;
        iframe.src = 'index.html';
        return true;
    }

    function stallMs(lab) {
        const pace = Number(lab && lab.pace) || 1;
        return Math.max(12000, pace * 3000);
    }

    function watch(lab) {
        pulse();
        stallNoted = '';
        reloaded = '';
        status(modelState === 'ready' ? 'Watching · ' + modelSource : 'Watching this run');
        const box = document.getElementById('lab-observer-notes');
        if (box) box.textContent = '';
        if (timer) clearInterval(timer);
        timer = setInterval(() => {
            if (!lab.running || !lab.activeCase) return;
            if (Date.now() - lastPulse < stallMs(lab)) return;
            if (stallNoted === lab.activeCase) return;
            stallNoted = lab.activeCase;
            const didReload = reloadIfBlank(lab.activeCase);
            say(lab, didReload
                ? lab.activeCase + ' had stopped moving and the page under test was blank. I reloaded that page. The check still decides pass or fail.'
                : lab.activeCase + ' has not reported. I left the check running. It fails on its own if it stays quiet for 40 seconds.');
        }, 2000);
        cap(fetch('http://127.0.0.1:8770/health', { signal: AbortSignal.timeout(1200) }), 1500).then((res) => {
            if (!res || !res.ok) say(lab, 'The framework runner is not answering. This browser is still running the catalog.');
        });
    }

    function stop() {
        if (timer) clearInterval(timer);
        timer = 0;
    }

    async function caseEnd(lab, item, result) {
        pulse();
        if (!result || result.ok) return;
        const prompt = [
            'Explain a QA check that already failed. Do not change the result and do not say it passed.',
            'Case ' + item.id + ': ' + item.title,
            'Where: ' + item.where,
            'When: ' + item.when,
            'Expected: ' + item.how,
            'Error: ' + result.error,
            'Reply in two sentences about why it failed and what to look at.'
        ].join('\n');
        const answer = await ask(prompt);
        const text = answer && answer.text ? answer.text.replace(/\s+/g, ' ').slice(0, 420) : readFailure(item, result.error);
        result.explain = text;
        say(lab, (answer ? answer.source + ': ' : '') + text);
    }

    function witnessDashboard(lab) {
        const overlay = document.getElementById('dash-overlay');
        const body = document.getElementById('report-body');
        const open = !!(overlay && overlay.classList.contains('open') && getComputedStyle(overlay).display !== 'none');
        const text = body ? body.textContent : '';
        const listed = !lab.results.length || lab.results.some((row) => text.includes(row.id));
        if (!open) {
            lab.openDashboard();
            say(lab, 'The dashboard was not on screen after the run. I opened it.');
            return;
        }
        if (!listed) {
            lab.renderReport();
            say(lab, 'The report body did not list this run. I rendered it again.');
            return;
        }
        say(lab, 'The dashboard is showing this run (' + lab.results.length + ' cases).');
    }

    function witnessReport(lab) {
        const box = document.getElementById('report-options');
        const frame = document.getElementById('report-preview');
        const shown = !!(box && !box.hidden);
        const doc = frame && frame.getAttribute('srcdoc') || '';
        if (!shown) {
            lab.openReportOptions();
            say(lab, 'The report dialog was closed. I opened it.');
            return;
        }
        if (lab.results.length && !/PASSED|FAILED/.test(doc)) {
            lab.refreshReportPreview();
            say(lab, 'The report preview was empty. I filled it again.');
            return;
        }
        say(lab, lab.results.length ? 'The report preview is on screen.' : 'The report dialog is open. This session has no case results yet.');
    }

    function noteFlakes(lab, ids) {
        let runs = [];
        try { runs = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (err) { runs = []; }
        const previous = runs.length ? runs[runs.length - 1] : null;
        if (!previous || !Array.isArray(previous.cases)) return;
        const flipped = ids.filter((id) => {
            const now = lab.results.find((row) => row.id === id);
            const then = previous.cases.find((row) => row.id === id);
            return now && then && now.ok !== !!then.ok;
        });
        if (flipped.length) say(lab, 'These cases changed since the previous saved run: ' + flipped.join(', ') + '.');
    }

    async function draftCases(lab, ids) {
        const failed = lab.results.filter((row) => ids.includes(row.id) && !row.ok);
        const catalog = (global.QALab && global.QALab.cases) || [];
        const names = catalog.map((item) => item.id + ' ' + item.title).join('; ').slice(0, 2500);
        const prompt = [
            'Suggest up to 2 new QA checks. Do not repeat an existing id. Do not mark anything pass or fail.',
            'Existing checks: ' + names,
            'This pass failed: ' + (failed.map((row) => row.id + ' ' + row.error).join('; ') || 'none'),
            'Reply only as a JSON array of objects with title, where, when, and how.'
        ].join('\n');
        const answer = await ask(prompt);
        const drafted = answer ? parseDrafts(answer.text) : [];
        showDrafts(drafted.length ? drafted : draftFromGaps(lab, ids), answer ? answer.source : '');
        status(modelState === 'ready' ? 'Idle · ' + modelSource : 'Idle · structural checks');
    }

    function runEnd(lab, ids) {
        stop();
        witnessDashboard(lab);
        noteFlakes(lab, ids);
        draftCases(lab, ids);
    }

    function boot() {
        status('Idle · structural checks until a model answers');
        const report = document.getElementById('report-open');
        if (report) {
            report.addEventListener('click', () => {
                setTimeout(() => {
                    if (global.QALab) witnessReport(global.QALab);
                }, 60);
            });
        }
    }

    global.LabObserver = {
        watch: watch,
        stop: stop,
        pulse: pulse,
        caseEnd: caseEnd,
        runEnd: runEnd,
        witnessReport: witnessReport,
        witnessDashboard: witnessDashboard,
        boot: boot
    };
})(window);
