/* Native URL Review ↔ packaged Lab Tries arena (#4505 Wave 2). */
(function () {
  'use strict';

  function queryHost() {
    try {
      var q = new URLSearchParams(location.search);
      var raw = (q.get('host') || '').trim();
      if (raw) return raw.replace(/^https?:\/\//, '').split('/')[0];
    } catch (e) {
      /* optional */
    }
    return 'example.com';
  }

  function send(msg) {
    try {
      if (window.UrlReviewAndroid && typeof window.UrlReviewAndroid.postMessage === 'function') {
        window.UrlReviewAndroid.postMessage(JSON.stringify(msg));
        return;
      }
      if (
        window.webkit &&
        window.webkit.messageHandlers &&
        window.webkit.messageHandlers.urlReview &&
        typeof window.webkit.messageHandlers.urlReview.postMessage === 'function'
      ) {
        window.webkit.messageHandlers.urlReview.postMessage(msg);
      }
    } catch (e) {
      /* optional */
    }
  }

  function readPercent() {
    var num = document.querySelector('#run-panel .rp-num b');
    var n = num ? parseFloat(num.textContent) : NaN;
    return isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }

  function hookReviewProgress() {
    var prog = window.ReviewProgress;
    if (!prog || prog.__nativeHooked) return !!prog;
    var orig = {
      start: prog.start,
      line: prog.line,
      finish: prog.finish,
      fail: prog.fail,
      reset: prog.reset,
    };
    var lastPct = -1;
    function maybeProgress() {
      var p = readPercent();
      if (p !== lastPct) {
        lastPct = p;
        send({ type: 'progress', percent: p });
      }
    }
    prog.start = function (options) {
      send({ type: 'run', host: (options && options.host) || queryHost() });
      var out = orig.start.apply(this, arguments);
      maybeProgress();
      return out;
    };
    prog.line = function (text) {
      var out = orig.line.apply(this, arguments);
      maybeProgress();
      return out;
    };
    prog.finish = function (status) {
      var out = orig.finish.apply(this, arguments);
      send({ type: 'finish', status: status || 'ready' });
      return out;
    };
    prog.fail = function () {
      var out = orig.fail.apply(this, arguments);
      send({ type: 'finish', status: 'failed' });
      return out;
    };
    prog.reset = function () {
      lastPct = -1;
      return orig.reset.apply(this, arguments);
    };
    prog.__nativeHooked = true;
    var num = document.querySelector('#run-panel .rp-num b');
    if (num && typeof MutationObserver === 'function') {
      new MutationObserver(maybeProgress).observe(num, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    } else {
      setInterval(maybeProgress, 400);
    }
    return true;
  }

  function demoLines(host) {
    return [
      'Checking robots.txt.',
      '12 same-host links were listed. This review opens at most 5 HTML pages and 2 links deep.',
      'Opening https://' + host + '/ in headless Chrome.',
      'Running axe-core accessibility checks.',
      'Checking security headers (HSTS, CSP).',
      'Scoring the checks.',
      'Signing the report.',
    ];
  }

  function bootRun(opts) {
    if (!window.ReviewProgress || !window.ReviewArena) return false;
    if (!hookReviewProgress()) return false;
    var host = (opts && opts.host) || queryHost();
    var pages = Math.max(1, Number((opts && opts.pages) || 5));
    ReviewArena.forceSkin('lab');
    ReviewProgress.start({ host: host, pages: pages });
    return true;
  }

  function playDemo() {
    if (!bootRun({ host: queryHost(), pages: 5 })) {
      setTimeout(playDemo, 50);
      return;
    }
    var host = queryHost();
    var lines = demoLines(host);
    var i = 0;
    function tick() {
      if (i < lines.length) {
        ReviewProgress.line(lines[i++]);
        setTimeout(tick, 900);
      } else {
        setTimeout(function () {
          ReviewProgress.finish('ready');
        }, 800);
      }
    }
    setTimeout(tick, 500);
  }

  window.UrlReviewNative = {
    cancel: function () {
      if (window.ReviewProgress) ReviewProgress.finish('stopped');
      send({ type: 'cancel' });
    },
    line: function (text) {
      if (window.ReviewProgress) ReviewProgress.line(String(text || ''));
    },
    boot: function (opts) {
      return bootRun(opts || {});
    },
  };

  try {
    sessionStorage.setItem('qa-review-arena-skin', 'lab');
  } catch (e) {
    /* optional */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', playDemo);
  } else {
    playDemo();
  }
})();