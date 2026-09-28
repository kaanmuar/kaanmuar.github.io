(function (global) {
  const STYLE = `
    #site-tour-overlay {
      display: none; position: fixed; inset: 0; z-index: 1; pointer-events: none;
      background: transparent; -webkit-backdrop-filter: none; backdrop-filter: none;
    }
    #site-tour-overlay.on { display: block; }
    .site-tour-hit {
      animation: site-tour-pulse 1.6s ease-in-out infinite;
      border-radius: inherit;
    }
    @keyframes site-tour-pulse {
      0%, 100% { box-shadow: inset 0 0 0 3px #4db3bb; }
      50% { box-shadow: inset 0 0 0 3px #4db3bb, inset 0 0 14px #4db3bb; }
    }
    @media (prefers-reduced-motion: reduce) {
      .site-tour-hit { animation: none; box-shadow: inset 0 0 0 3px #4db3bb; }
    }
    #site-tour-tooltip {
      display: none; position: fixed; z-index: 4600; left: 12px; bottom: 12px; box-sizing: border-box;
      width: min(420px, calc(100% - 24px)); max-width: calc(100% - 24px);
      background: #1f2937; color: #f8fafc; border-radius: 12px; overflow: hidden;
      box-shadow: 0 12px 32px rgba(0,0,0,.28); pointer-events: auto;
    }
    html.site-tour-on #site-tour-tooltip { display: block; }
    html.dark-mode #site-tour-tooltip { background: rgba(12, 17, 24, 0.94); }
    @media (max-width: 767px) {
      html.site-tour-on body { padding-bottom: 46vh; }
    }
    #site-tour-progress { height: 5px; background: rgba(255,255,255,.12); }
    #site-tour-progress-fill { height: 100%; width: 0; background: linear-gradient(90deg, #0d6e76, #4db3bb); }
    #site-tour-tooltip-content { padding: 14px 16px 12px; }
    #site-tour-title { margin: 0 0 6px; font-size: 16px; font-family: "Source Serif 4", Georgia, serif; }
    #site-tour-clip { margin: 0 0 10px; }
    #site-tour-clip[hidden] { display: none; }
    .tour-clip { height: 86px; border-radius: 8px; overflow: hidden; background: #10161d; border: 1px solid #2a3440; position: relative; }
    .tour-clip-studio .clip-agents { display: flex; gap: 4px; padding: 6px 8px 0; }
    .tour-clip-studio .clip-agents span {
      font-size: 9px; line-height: 1.4; color: #9aa5b1; border: 1px solid #2a3440; border-radius: 99px; padding: 0 6px;
      animation: clipAgent 4s linear 1 both;
    }
    .tour-clip-studio .clip-agents span:nth-child(1) { animation-name: clipA1; }
    .tour-clip-studio .clip-agents span:nth-child(2) { animation-name: clipA2; }
    .tour-clip-studio .clip-agents span:nth-child(3) { animation-name: clipA3; }
    .tour-clip-studio .clip-agents span:nth-child(4) { animation-name: clipA4; }
    .clip-board { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 6px 8px 0; height: 48px; }
    .clip-board b { display: block; font-size: 8px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #9aa5b1; }
    .clip-card, .clip-scan { position: absolute; top: 16px; height: 26px; border-radius: 3px; }
    .clip-card { width: 18%; left: 4%; background: #1a2430; border: 1px solid #4db3bb; animation: clipMove 4s linear 1 both; }
    .clip-scan { width: 10px; background: linear-gradient(90deg, transparent, rgba(77,179,187,.9), transparent); animation: clipScan 4s linear 1 both; }
    .tour-clip-lab { display: grid; grid-template-columns: 1.1fr .9fr; }
    .clip-rows { padding: 8px; display: flex; flex-direction: column; gap: 5px; }
    .clip-row { display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #c5d0d8; font-family: ui-monospace, monospace; }
    .clip-row em { width: 8px; height: 8px; border-radius: 50%; background: #2a3440; animation: clipPass 4s linear 1 both; }
    .clip-row:nth-child(2) em { animation-delay: .9s; }
    .clip-row:nth-child(3) em { animation-delay: 1.8s; }
    .clip-stage { margin: 8px 8px 8px 0; border-radius: 4px; background: #1a2430; position: relative; overflow: hidden; }
    .clip-page { position: absolute; left: 8px; right: 8px; top: 8px; height: 8px; border-radius: 2px; background: #2a3440; box-shadow: 0 14px 0 #2a3440, 0 28px 0 #24303a; }
    .clip-cursor { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: clipCursor 4s linear 1 both; }
    @keyframes clipA1 { 0%, 22% { color: #fff; border-color: #4db3bb; background: rgba(13,110,118,.55); } 30%, 100% { color: #9aa5b1; border-color: #2a3440; background: transparent; } }
    @keyframes clipA2 { 0%, 24% { color: #9aa5b1; border-color: #2a3440; } 28%, 48% { color: #fff; border-color: #c4a574; background: rgba(196,165,116,.4); } 54%, 100% { color: #9aa5b1; border-color: #2a3440; background: transparent; } }
    @keyframes clipA3 { 0%, 48% { color: #9aa5b1; border-color: #2a3440; } 52%, 72% { color: #fff; border-color: #818cf8; background: rgba(129,140,248,.4); } 78%, 100% { color: #9aa5b1; border-color: #2a3440; background: transparent; } }
    @keyframes clipA4 { 0%, 74% { color: #9aa5b1; border-color: #2a3440; } 78%, 100% { color: #fff; border-color: #5fb89a; background: rgba(95,184,154,.45); } }
    @keyframes clipMove { 0%, 18% { left: 4%; border-color: #4db3bb; } 28%, 46% { left: 28%; } 54%, 72% { left: 52%; } 80%, 100% { left: 76%; border-color: #5fb89a; } }
    @keyframes clipScan { 0% { left: 2%; opacity: 0; } 8% { opacity: 1; } 18% { left: 18%; opacity: .2; } 28% { left: 26%; opacity: 1; } 46% { left: 44%; opacity: .2; } 54% { left: 50%; opacity: 1; } 72% { left: 68%; opacity: .2; } 80% { left: 74%; opacity: 1; } 100% { left: 92%; opacity: 0; } }
    @keyframes clipPass { 0%, 12% { background: #2a3440; } 22%, 100% { background: #5fb89a; } }
    @keyframes clipCursor { 0% { top: 10px; left: 12px; } 30% { top: 22px; left: 36px; } 60% { top: 36px; left: 18px; } 100% { top: 14px; left: 48px; } }
    #site-tour-body { margin: 0 0 12px; font-size: 13px; line-height: 1.45; color: #f8fafc; }
    #site-tour-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    #site-tour-counter { font-size: 12px; color: #e5e7eb; }
    .site-tour-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    #site-tour-tooltip :focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    #site-tour-actions > span:last-child { display: flex; align-items: center; gap: 8px; }
    #site-tour-next, #site-tour-close, #site-tour-back {
      border: 0; border-radius: 6px; padding: 7px 12px; font-weight: 600; cursor: pointer; font-size: 13px;
    }
    #site-tour-next { background: #0d6e76; color: #fff; }
    #site-tour-next:disabled { opacity: .4; cursor: not-allowed; }
    #site-tour-close, #site-tour-back { background: transparent; color: #c5d0d8; border: 1px solid #2a3440; }
    #site-tour-back[hidden] { display: none; }
  `;

  let cfg = null;
  let index = 0;
  let timer = null;
    let hit = null;
    let held = false;
    let returnFocus = null;

  function $(id) { return document.getElementById(id); }

  function inject() {
    if ($('site-tour-style')) return;
    const style = document.createElement('style');
    style.id = 'site-tour-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
    const wrap = document.createElement('div');
    wrap.id = 'site-tour-overlay';
    document.body.appendChild(wrap);
    const tip = document.createElement('div');
    tip.id = 'site-tour-tooltip';
    tip.setAttribute('role', 'dialog');
    tip.setAttribute('aria-modal', 'false');
    tip.setAttribute('aria-labelledby', 'site-tour-step-label site-tour-title');
    tip.setAttribute('aria-describedby', 'site-tour-body');
    tip.tabIndex = -1;
    tip.innerHTML = `
        <div id="site-tour-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Step progress"><div id="site-tour-progress-fill"></div></div>
        <div id="site-tour-tooltip-content">
          <span id="site-tour-step-label" class="site-tour-sr"></span>
          <h3 id="site-tour-title"></h3>
          <div id="site-tour-clip" class="tour-clip" hidden aria-hidden="true"></div>
          <p id="site-tour-body"></p>
          <div id="site-tour-actions">
            <span id="site-tour-counter"></span>
            <span>
              <button type="button" id="site-tour-back" hidden>Back</button>
              <button type="button" id="site-tour-close">Close</button>
              <button type="button" id="site-tour-next">Next</button>
            </span>
          </div>
          <span id="site-tour-next-wait" class="site-tour-sr">Available when this step finishes.</span>
        </div>`;
    document.body.appendChild(tip);
    $('site-tour-next').onclick = () => SiteTour.next();
    $('site-tour-back').onclick = () => SiteTour.back();
    $('site-tour-close').onclick = () => SiteTour.stop();
    document.addEventListener('keydown', (e) => {
      if (!cfg) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        SiteTour.stop();
      } else if (e.key === 'ArrowRight' && !$('site-tour-next').disabled) {
        e.preventDefault();
        SiteTour.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        SiteTour.back();
      }
    });
  }

  function studioClip() {
    return '<div class="clip-agents"><span>Steward</span><span>Tests</span><span>Auto</span><span>Release</span></div><div class="clip-board"><div><b>To do</b></div><div><b>Doing</b></div><div><b>QA</b></div><div><b>Done</b></div><i class="clip-card"></i><i class="clip-scan"></i></div>';
  }

  function labClip() {
    return '<div class="clip-rows"><div class="clip-row"><span>CV-04</span><em></em></div><div class="clip-row"><span>STU-02</span><em></em></div><div class="clip-row"><span>SEC-08</span><em></em></div></div><div class="clip-stage"><div class="clip-page"></div><i class="clip-cursor"></i></div>';
  }

  function clearHit() {
    if (hit) hit.classList.remove('site-tour-hit', 'site-tour-hit-wide');
    hit = null;
  }

  function viewportBox() {
    const view = window.visualViewport;
    return {
      left: view ? view.offsetLeft : 0,
      top: view ? view.offsetTop : 0,
      width: view ? view.width : window.innerWidth,
      height: view ? view.height : window.innerHeight
    };
  }

  function pinTip() {
    const tip = $('site-tour-tooltip');
    if (!tip) return;
    if (window.innerWidth >= 768) {
      tip.style.left = '';
      tip.style.right = '';
      tip.style.top = '';
      tip.style.bottom = '';
      tip.style.width = '';
      tip.style.maxWidth = '';
      return;
    }
    const view = viewportBox();
    const width = Math.max(200, Math.round(view.width - 24));
    tip.style.boxSizing = 'border-box';
    tip.style.left = Math.round(view.left + 12) + 'px';
    tip.style.right = 'auto';
    tip.style.width = width + 'px';
    tip.style.maxWidth = width + 'px';
    tip.style.top = 'auto';
    tip.style.bottom = Math.max(12, Math.round(window.innerHeight - (view.top + view.height) + 12)) + 'px';
  }

  function clearOfTip(el) {
    const tip = $('site-tour-tooltip');
    if (!el || !tip || window.innerWidth >= 768) return;
    if (getComputedStyle(el).position === 'fixed') return;
    const rect = el.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const view = viewportBox();
    const pad = 28;
    if (rect.width < 2 || tipRect.height < 2) return;
    const clearTop = view.top + 12;
    const clearBottom = tipRect.top - pad;
    let shift = 0;
    if (rect.bottom > clearBottom) shift = rect.bottom - clearBottom;
    if (rect.top - shift < clearTop) shift = rect.top - clearTop;
    if (Math.abs(shift) > 1) {
      const root = document.scrollingElement || document.documentElement;
      const html = document.documentElement;
      const prev = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      root.scrollTop += shift;
      html.style.scrollBehavior = prev;
    }
  }

  function blurFields() {
    const active = document.activeElement;
    const tip = $('site-tour-tooltip');
    if (!active || (tip && tip.contains(active))) return;
    const tag = active.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable) active.blur();
  }

  function onViewport() {
    if (!cfg) return;
    pinTip();
    if (hit) clearOfTip(hit);
  }

  function showStep() {
    const step = cfg.steps[index];
    const last = index === cfg.steps.length - 1;
    $('site-tour-title').textContent = step.title;
    const clip = $('site-tour-clip');
    if (step.preview) {
      clip.hidden = false;
      clip.className = 'tour-clip tour-clip-' + step.preview;
      clip.innerHTML = step.preview === 'lab' ? labClip() : studioClip();
    } else {
      clip.hidden = true;
      clip.className = 'tour-clip';
      clip.innerHTML = '';
    }
    $('site-tour-body').textContent = step.body;
    $('site-tour-counter').textContent = (index + 1) + ' / ' + cfg.steps.length;
    $('site-tour-step-label').textContent = 'Step ' + (index + 1) + ' of ' + cfg.steps.length + '.';
    $('site-tour-next').textContent = last ? 'Finish' : 'Next';
    $('site-tour-next').disabled = true;
    $('site-tour-next').setAttribute('aria-describedby', 'site-tour-next-wait');
    const bar = $('site-tour-progress');
    if (bar) bar.setAttribute('aria-valuenow', '0');
    $('site-tour-back').hidden = index === 0;
    $('site-tour-progress-fill').style.transition = 'none';
    $('site-tour-progress-fill').style.width = '0';
    clearHit();
    if (typeof step.prepare === 'function') step.prepare();
    const el = step.selector ? document.querySelector(step.selector) : null;
    blurFields();
    pinTip();
    if (el) {
      hit = el;
      el.classList.add('site-tour-hit');
      const narrow = window.innerWidth < 768;
      el.scrollIntoView({ block: narrow ? 'start' : 'center', inline: 'nearest', behavior: narrow ? 'auto' : 'smooth' });
      if (narrow) setTimeout(() => clearOfTip(el), 420);
    }
    const ms = step.demoMs || 1400;
    requestAnimationFrame(() => {
      $('site-tour-progress-fill').style.transition = 'width ' + ms + 'ms linear';
      $('site-tour-progress-fill').style.width = '100%';
    });
    clearTimeout(timer);
    const tip = $('site-tour-tooltip');
    if (tip) tip.focus({ preventScroll: true });
    timer = setTimeout(() => {
      const next = $('site-tour-next');
      if (!next) return;
      next.disabled = false;
      next.removeAttribute('aria-describedby');
      const progress = $('site-tour-progress');
      if (progress) progress.setAttribute('aria-valuenow', '100');
    }, ms);
  }

  function tourSeen(key) {
    if (!key) return false;
    try {
      return sessionStorage.getItem(key) === 'true' || localStorage.getItem(key) === 'true';
    } catch (err) {
      return false;
    }
  }

  function markTourSeen(key) {
    if (!key) return;
    try { sessionStorage.setItem(key, 'true'); } catch (err) { /* ignore */ }
    try { localStorage.setItem(key, 'true'); } catch (err) { /* ignore */ }
  }

  const SiteTour = {
    start(options) {
      inject();
      cfg = options;
      index = 0;
      markTourSeen(cfg.key);
      returnFocus = document.activeElement;
      document.documentElement.classList.add('site-tour-on');
      $('site-tour-overlay').classList.add('on');
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onViewport);
        window.visualViewport.addEventListener('scroll', onViewport);
      }
      window.addEventListener('resize', onViewport);
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
    back() {
      if (!cfg || index <= 0) return;
      index -= 1;
      showStep();
    },
    stop() {
      clearTimeout(timer);
      clearHit();
      held = false;
      document.documentElement.classList.remove('site-tour-on');
      const overlay = $('site-tour-overlay');
      if (overlay) overlay.classList.remove('on');
      window.removeEventListener('resize', onViewport);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onViewport);
        window.visualViewport.removeEventListener('scroll', onViewport);
      }
      const tip = $('site-tour-tooltip');
      if (tip) {
        tip.style.left = '';
        tip.style.right = '';
        tip.style.top = '';
        tip.style.bottom = '';
        tip.style.width = '';
        tip.style.maxWidth = '';
      }
      cfg = null;
      if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus({ preventScroll: true });
      returnFocus = null;
    },
    hold() {
      if (!cfg) return;
      held = true;
      clearTimeout(timer);
      clearHit();
      document.documentElement.classList.remove('site-tour-on');
      const overlay = $('site-tour-overlay');
      if (overlay) overlay.classList.remove('on');
    },
    release() {
      if (!held || !cfg) {
        held = false;
        return;
      }
      held = false;
      document.documentElement.classList.add('site-tour-on');
      const overlay = $('site-tour-overlay');
      if (overlay) overlay.classList.add('on');
      showStep();
    },
    bind(button, options) {
      if (!button) return;
      button.addEventListener('click', () => this.start(options));
    },
    autoStart(options) {
      if (!options || tourSeen(options.key)) return;
      if (/autorun=1/.test(location.search)) return;
      setTimeout(() => this.start(options), options.delay || 900);
    }
  };

  global.SiteTour = SiteTour;
})(window);
