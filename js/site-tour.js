(function (global) {
  const STYLE = `
    #site-tour-overlay { display: none; position: fixed; inset: 0; z-index: 80; pointer-events: none; }
    #site-tour-overlay.on { display: block; }
    #site-tour-tooltip {
      position: fixed; z-index: 82; left: 16px; bottom: 16px; max-width: min(420px, calc(100vw - 32px));
      background: rgba(18, 24, 31, 0.92); color: #e8eef2; border-radius: 12px; overflow: hidden;
      box-shadow: 0 12px 32px rgba(0,0,0,.28); pointer-events: auto;
    }
    html.dark-mode #site-tour-tooltip { background: rgba(12, 17, 24, 0.94); }
    #site-tour-progress { height: 5px; background: rgba(255,255,255,.12); }
    #site-tour-progress-fill { height: 100%; width: 0; background: linear-gradient(90deg, #0d6e76, #4db3bb); }
    #site-tour-tooltip-content { padding: 14px 16px 12px; }
    #site-tour-title { margin: 0 0 6px; font-size: 16px; font-family: "Source Serif 4", Georgia, serif; }
    #site-tour-body { margin: 0 0 12px; font-size: 13px; line-height: 1.45; color: #c5d0d8; }
    #site-tour-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    #site-tour-counter { font-size: 12px; color: #9aa5b1; }
    #site-tour-next, #site-tour-close {
      border: 0; border-radius: 6px; padding: 7px 12px; font-weight: 600; cursor: pointer; font-size: 13px;
    }
    #site-tour-next { background: #0d6e76; color: #fff; }
    #site-tour-next:disabled { opacity: .4; cursor: not-allowed; }
    #site-tour-close { background: transparent; color: #c5d0d8; border: 1px solid #2a3440; }
    .site-tour-hit {
      position: relative; z-index: 81; outline: 2px solid #4db3bb; outline-offset: 3px;
      box-shadow: 0 0 0 6px rgba(13,110,118,.28); border-radius: 8px;
    }
  `;

  let cfg = null;
  let index = 0;
  let timer = null;
  let hit = null;

  function $(id) { return document.getElementById(id); }

  function inject() {
    if ($('site-tour-style')) return;
    const style = document.createElement('style');
    style.id = 'site-tour-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
    const wrap = document.createElement('div');
    wrap.id = 'site-tour-overlay';
    wrap.innerHTML = `
      <div id="site-tour-tooltip" role="dialog" aria-modal="true" aria-labelledby="site-tour-title">
        <div id="site-tour-progress"><div id="site-tour-progress-fill"></div></div>
        <div id="site-tour-tooltip-content">
          <h3 id="site-tour-title"></h3>
          <p id="site-tour-body"></p>
          <div id="site-tour-actions">
            <span id="site-tour-counter"></span>
            <span>
              <button type="button" id="site-tour-close">Close</button>
              <button type="button" id="site-tour-next">Next</button>
            </span>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    $('site-tour-next').onclick = () => SiteTour.next();
    $('site-tour-close').onclick = () => SiteTour.stop();
  }

  function clearHit() {
    if (hit) hit.classList.remove('site-tour-hit');
    hit = null;
  }

  function showStep() {
    const step = cfg.steps[index];
    const last = index === cfg.steps.length - 1;
    $('site-tour-title').textContent = step.title;
    $('site-tour-body').textContent = step.body;
    $('site-tour-counter').textContent = (index + 1) + ' / ' + cfg.steps.length;
    $('site-tour-next').textContent = last ? 'Finish' : 'Next';
    $('site-tour-next').disabled = true;
    $('site-tour-progress-fill').style.transition = 'none';
    $('site-tour-progress-fill').style.width = '0';
    clearHit();
    const el = step.selector ? document.querySelector(step.selector) : null;
    if (el) {
      hit = el;
      el.classList.add('site-tour-hit');
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }
    const ms = step.demoMs || 1400;
    requestAnimationFrame(() => {
      $('site-tour-progress-fill').style.transition = 'width ' + ms + 'ms linear';
      $('site-tour-progress-fill').style.width = '100%';
    });
    clearTimeout(timer);
    timer = setTimeout(() => { $('site-tour-next').disabled = false; }, ms);
  }

  const SiteTour = {
    start(options) {
      inject();
      cfg = options;
      index = 0;
      if (cfg.key) sessionStorage.setItem(cfg.key, 'true');
      $('site-tour-overlay').classList.add('on');
      showStep();
      if (global.SiteAnalytics) global.SiteAnalytics.trackEvent('site_tour_start', cfg.name || 'Tour', 'start');
    },
    next() {
      if (!cfg) return;
      if (index >= cfg.steps.length - 1) {
        this.stop();
        return;
      }
      index += 1;
      showStep();
    },
    stop() {
      clearTimeout(timer);
      clearHit();
      const overlay = $('site-tour-overlay');
      if (overlay) overlay.classList.remove('on');
      cfg = null;
    },
    bind(button, options) {
      if (!button) return;
      button.addEventListener('click', () => this.start(options));
    },
    autoStart(options) {
      if (!options || sessionStorage.getItem(options.key)) return;
      if (/autorun=1/.test(location.search)) return;
      setTimeout(() => this.start(options), options.delay || 900);
    }
  };

  global.SiteTour = SiteTour;
})(window);
