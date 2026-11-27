/* Account page: connect Google Search Console read-only and bind one property (#4415). */
(function () {
  const CONNECT_KEY = 'reviewGscConnect';
  const COPY = {
    en: {
      title: 'Search Console',
      intro: 'Connect Google Search Console read-only so your reviews can use real clicks and impressions for sites you own.',
      closed: 'Coming soon on this site. Search Console connect is not enabled on this deployment yet.',
      connectedAs: 'Connected as',
      bound: 'Bound property',
      notBound: 'No property is bound yet. Pick one from your Search Console account.',
      connect: 'Connect Search Console',
      connecting: 'Opening Google…',
      finishing: 'Finishing connect…',
      disconnect: 'Disconnect',
      disconnecting: 'Disconnecting…',
      refreshSites: 'Refresh properties',
      loadingSites: 'Loading properties…',
      pick: 'Search Console property',
      bind: 'Use this property',
      binding: 'Saving…',
      connectedOk: 'Search Console is connected.',
      boundOk: 'This property is bound to your account.',
      disconnectedOk: 'Search Console is disconnected.',
      noSites: 'Google returned no properties for this account.',
      failed: 'That did not work. Try again in a moment.',
      reconnect: 'Search Console access expired. Connect again.',
      cancelled: 'Google did not grant access. Try again when you are ready.',
      otherDevice: 'Finish connect on the same browser that started it.',
    },
    es: {
      title: 'Search Console',
      intro: 'Conecta Google Search Console en solo lectura para que tus revisiones usen clics e impresiones reales de sitios que te pertenecen.',
      closed: 'Próximamente en este sitio. La conexión con Search Console aún no está habilitada en este despliegue.',
      connectedAs: 'Conectado como',
      bound: 'Propiedad vinculada',
      notBound: 'Aún no hay propiedad vinculada. Elige una de tu cuenta de Search Console.',
      connect: 'Conectar Search Console',
      connecting: 'Abriendo Google…',
      finishing: 'Terminando la conexión…',
      disconnect: 'Desconectar',
      disconnecting: 'Desconectando…',
      refreshSites: 'Actualizar propiedades',
      loadingSites: 'Cargando propiedades…',
      pick: 'Propiedad en Search Console',
      bind: 'Usar esta propiedad',
      binding: 'Guardando…',
      connectedOk: 'Search Console está conectado.',
      boundOk: 'Esta propiedad está vinculada a tu cuenta.',
      disconnectedOk: 'Search Console está desconectado.',
      noSites: 'Google no devolvió propiedades para esta cuenta.',
      failed: 'No funcionó. Inténtalo de nuevo en un momento.',
      reconnect: 'El acceso a Search Console caducó. Conéctalo de nuevo.',
      cancelled: 'Google no concedió acceso. Inténtalo cuando quieras.',
      otherDevice: 'Termina la conexión en el mismo navegador que la inició.',
    },
    pt: {
      title: 'Search Console',
      intro: 'Conecte o Google Search Console somente leitura para que suas revisões usem cliques e impressões reais dos sites que você possui.',
      closed: 'Em breve neste site. A conexão com o Search Console ainda não está habilitada nesta implantação.',
      connectedAs: 'Conectado como',
      bound: 'Propriedade vinculada',
      notBound: 'Nenhuma propriedade vinculada ainda. Escolha uma da sua conta do Search Console.',
      connect: 'Conectar Search Console',
      connecting: 'Abrindo o Google…',
      finishing: 'Concluindo a conexão…',
      disconnect: 'Desconectar',
      disconnecting: 'Desconectando…',
      refreshSites: 'Atualizar propriedades',
      loadingSites: 'Carregando propriedades…',
      pick: 'Propriedade no Search Console',
      bind: 'Usar esta propriedade',
      binding: 'Salvando…',
      connectedOk: 'O Search Console está conectado.',
      boundOk: 'Esta propriedade está vinculada à sua conta.',
      disconnectedOk: 'O Search Console está desconectado.',
      noSites: 'O Google não retornou propriedades para esta conta.',
      failed: 'Não funcionou. Tente de novo em instantes.',
      reconnect: 'O acesso ao Search Console expirou. Conecte de novo.',
      cancelled: 'O Google não concedeu acesso. Tente quando estiver pronto.',
      otherDevice: 'Conclua a conexão no mesmo navegador que a iniciou.',
    },
    de: {
      title: 'Search Console',
      intro: 'Verbinden Sie die Google Search Console nur lesend, damit Ihre Prüfungen echte Klicks und Impressionen für Websites nutzen können, die Ihnen gehören.',
      closed: 'Demnächst auf dieser Website. Die Search-Console-Verbindung ist in dieser Bereitstellung noch nicht aktiv.',
      connectedAs: 'Verbunden als',
      bound: 'Gebundene Property',
      notBound: 'Noch keine Property gebunden. Wählen Sie eine aus Ihrem Search-Console-Konto.',
      connect: 'Search Console verbinden',
      connecting: 'Google wird geöffnet…',
      finishing: 'Verbindung wird abgeschlossen…',
      disconnect: 'Trennen',
      disconnecting: 'Trenne…',
      refreshSites: 'Properties aktualisieren',
      loadingSites: 'Properties werden geladen…',
      pick: 'Search-Console-Property',
      bind: 'Diese Property verwenden',
      binding: 'Wird gespeichert…',
      connectedOk: 'Search Console ist verbunden.',
      boundOk: 'Diese Property ist an Ihr Konto gebunden.',
      disconnectedOk: 'Search Console ist getrennt.',
      noSites: 'Google hat keine Properties für dieses Konto zurückgegeben.',
      failed: 'Das hat nicht geklappt. Versuchen Sie es gleich noch einmal.',
      reconnect: 'Der Search-Console-Zugang ist abgelaufen. Bitte erneut verbinden.',
      cancelled: 'Google hat keinen Zugriff gewährt. Versuchen Sie es erneut.',
      otherDevice: 'Schließen Sie die Verbindung im selben Browser ab, in dem Sie sie gestartet haben.',
    },
    fr: {
      title: 'Search Console',
      intro: 'Connectez Google Search Console en lecture seule pour que vos revues utilisent de vrais clics et impressions pour les sites qui vous appartiennent.',
      closed: 'Bientôt sur ce site. La connexion Search Console n’est pas encore activée sur ce déploiement.',
      connectedAs: 'Connecté en tant que',
      bound: 'Propriété liée',
      notBound: 'Aucune propriété n’est liée pour l’instant. Choisissez-en une dans votre compte Search Console.',
      connect: 'Connecter Search Console',
      connecting: 'Ouverture de Google…',
      finishing: 'Finalisation de la connexion…',
      disconnect: 'Déconnecter',
      disconnecting: 'Déconnexion…',
      refreshSites: 'Actualiser les propriétés',
      loadingSites: 'Chargement des propriétés…',
      pick: 'Propriété Search Console',
      bind: 'Utiliser cette propriété',
      binding: 'Enregistrement…',
      connectedOk: 'Search Console est connecté.',
      boundOk: 'Cette propriété est liée à votre compte.',
      disconnectedOk: 'Search Console est déconnecté.',
      noSites: 'Google n’a renvoyé aucune propriété pour ce compte.',
      failed: 'Cela n’a pas fonctionné. Réessayez dans un instant.',
      reconnect: 'L’accès Search Console a expiré. Reconnectez-vous.',
      cancelled: 'Google n’a pas accordé l’accès. Réessayez quand vous voulez.',
      otherDevice: 'Terminez la connexion dans le même navigateur que celui qui l’a démarrée.',
    },
    it: {
      title: 'Search Console',
      intro: 'Collega Google Search Console in sola lettura così le tue revisioni possono usare clic e impressioni reali per i siti di tua proprietà.',
      closed: 'Prossimamente su questo sito. Il collegamento a Search Console non è ancora attivo su questo deployment.',
      connectedAs: 'Connesso come',
      bound: 'Proprietà collegata',
      notBound: 'Nessuna proprietà collegata. Scegline una dal tuo account Search Console.',
      connect: 'Collega Search Console',
      connecting: 'Apertura di Google…',
      finishing: 'Completamento collegamento…',
      disconnect: 'Scollega',
      disconnecting: 'Scollegamento…',
      refreshSites: 'Aggiorna proprietà',
      loadingSites: 'Caricamento proprietà…',
      pick: 'Proprietà Search Console',
      bind: 'Usa questa proprietà',
      binding: 'Salvataggio…',
      connectedOk: 'Search Console è collegato.',
      boundOk: 'Questa proprietà è collegata al tuo account.',
      disconnectedOk: 'Search Console è scollegato.',
      noSites: 'Google non ha restituito proprietà per questo account.',
      failed: 'Non ha funzionato. Riprova tra un momento.',
      reconnect: 'L’accesso a Search Console è scaduto. Collega di nuovo.',
      cancelled: 'Google non ha concesso l’accesso. Riprova quando vuoi.',
      otherDevice: 'Completa il collegamento nello stesso browser in cui l’hai avviato.',
    },
  };

  const section = document.getElementById('gsc');
  if (!section || !window.ReviewAuth) return;
  let copy = COPY.en;
  let lang = 'en';
  let open = false;
  let busy = false;
  const $ = (id) => document.getElementById(id);
  const statusEl = $('gsc-status');
  const closedEl = $('gsc-closed');
  const activeEl = $('gsc-active');
  const connectBtn = $('gsc-connect');
  const disconnectBtn = $('gsc-disconnect');
  const refreshBtn = $('gsc-refresh-sites');
  const bindBtn = $('gsc-bind');
  const siteEl = $('gsc-site');
  const connectedEl = $('gsc-connected');
  const boundEl = $('gsc-bound');

  function paint() {
    section.lang = lang;
    section.querySelectorAll('[data-copy]').forEach((el) => {
      el.textContent = copy[el.getAttribute('data-copy')] || '';
    });
  }
  function say(message, tone) {
    statusEl.textContent = message || '';
    statusEl.classList.toggle('bad', tone === 'bad');
    statusEl.classList.toggle('ok', tone === 'ok');
  }
  function redirectUri() {
    return location.origin + location.pathname;
  }
  function setBusy(on) {
    busy = !!on;
    [connectBtn, disconnectBtn, refreshBtn, bindBtn, siteEl].forEach((el) => {
      if (el) el.disabled = busy;
    });
  }
  async function call(path, extra) {
    if (typeof window.account !== 'function') {
      say(copy.failed, 'bad');
      return null;
    }
    let response;
    try {
      response = await window.account(path, extra || {});
    } catch (error) {
      say(copy.failed, 'bad');
      return null;
    }
    if (window.signedOut(response)) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = data.code || '';
      if (code === 'reconnect') say(copy.reconnect, 'bad');
      else if (code === 'cancelled') say(copy.cancelled, 'bad');
      else if (code === 'other-device') say(copy.otherDevice, 'bad');
      else say(data.error || copy.failed, 'bad');
      return null;
    }
    return data;
  }
  function paintStatus(data) {
    open = !!data.open;
    closedEl.hidden = open;
    activeEl.hidden = !open;
    connectedEl.hidden = !data.connected;
    boundEl.hidden = !data.bound;
    if (data.connectedAs && data.connectedAs.googleEmail) {
      $('gsc-connected-email').textContent = data.connectedAs.googleEmail;
    } else $('gsc-connected-email').textContent = '';
    if (data.bound && data.bound.siteUrl) {
      $('gsc-bound-url').textContent = data.bound.siteUrl;
      $('gsc-not-bound').hidden = true;
    } else {
      $('gsc-bound-url').textContent = '';
      $('gsc-not-bound').hidden = !!data.bound;
    }
    connectBtn.hidden = !!data.connected;
    disconnectBtn.hidden = !data.connected;
    $('gsc-bind-block').hidden = !data.connected;
    refreshBtn.hidden = !data.connected;
    bindBtn.disabled = busy || !siteEl.value;
  }
  function fillSites(sites) {
    const list = sites || [];
    siteEl.replaceChildren();
    list.forEach((row) => {
      const opt = document.createElement('option');
      opt.value = row.siteUrl;
      opt.textContent = row.siteUrl + (row.permissionLevel ? ' · ' + row.permissionLevel : '');
      siteEl.appendChild(opt);
    });
    $('gsc-sites-empty').hidden = !!list.length;
    bindBtn.disabled = busy || !list.length;
  }
  async function refreshStatus(message) {
    if (message) say(message);
    const data = await call('/account/gsc/status', {});
    if (!data) return null;
    paintStatus(data);
    return data;
  }
  async function loadSites() {
    setBusy(true);
    say(copy.loadingSites);
    try {
      const data = await call('/account/gsc/sites', {});
      if (!data) return;
      fillSites(data.sites);
      if (!(data.sites || []).length) say(copy.noSites);
      else say('');
    } finally {
      setBusy(false);
      bindBtn.disabled = busy || !siteEl.value;
    }
  }
  async function startConnect() {
    setBusy(true);
    say(copy.connecting);
    try {
      const data = await call('/account/gsc/connect/start', { redirectUri: redirectUri() });
      if (!data || !data.url) return;
      try {
        sessionStorage.setItem(CONNECT_KEY, '1');
      } catch (error) {
        /* sessionStorage may be blocked */
      }
      if (window.SiteAnalytics) SiteAnalytics.trackEvent('qa_review_account_gsc', 'URL Review', 'connect_start');
      location.assign(data.url);
    } finally {
      setBusy(false);
    }
  }
  async function finishConnect(params) {
    setBusy(true);
    say(copy.finishing);
    try {
      const data = await call('/account/gsc/connect/finish', {
        state: params.get('state'),
        code: params.get('code') || '',
        error: params.get('error') || '',
      });
      try {
        sessionStorage.removeItem(CONNECT_KEY);
      } catch (error) {
        /* ignore */
      }
      ['state', 'code', 'scope', 'error', 'error_description', 'error_uri', 'iss'].forEach((name) => params.delete(name));
      history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
      if (!data) return;
      say(copy.connectedOk, 'ok');
      const status = await refreshStatus('');
      if (status && status.connected) await loadSites();
      if (window.SiteAnalytics) SiteAnalytics.trackEvent('qa_review_account_gsc', 'URL Review', 'connect_finish');
    } finally {
      setBusy(false);
    }
  }
  async function bindSite() {
    const siteUrl = siteEl.value;
    if (!siteUrl) return;
    setBusy(true);
    say(copy.binding);
    try {
      const data = await call('/account/gsc/bind', { siteUrl });
      if (!data) return;
      await refreshStatus(copy.boundOk);
      if (window.SiteAnalytics) SiteAnalytics.trackEvent('qa_review_account_gsc', 'URL Review', 'bind');
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    say(copy.disconnecting);
    try {
      const data = await call('/account/gsc/disconnect', {});
      if (!data) return;
      fillSites([]);
      await refreshStatus(copy.disconnectedOk);
      if (window.SiteAnalytics) SiteAnalytics.trackEvent('qa_review_account_gsc', 'URL Review', 'disconnect');
    } finally {
      setBusy(false);
    }
  }

  if (connectBtn) connectBtn.addEventListener('click', () => startConnect());
  if (disconnectBtn) disconnectBtn.addEventListener('click', () => disconnect());
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadSites());
  if (bindBtn) bindBtn.addEventListener('click', () => bindSite());
  if (siteEl) siteEl.addEventListener('change', () => {
    bindBtn.disabled = busy || !siteEl.value;
  });

  window.ReviewAuth.onChange(async (signed) => {
    section.hidden = !signed;
    if (!signed) {
      say('');
      closedEl.hidden = false;
      activeEl.hidden = true;
      return;
    }
    const status = await refreshStatus('');
    if (status && status.open && status.connected) await loadSites();
    if (location.hash === '#gsc') section.scrollIntoView();
  });

  const params = new URLSearchParams(location.search);
  let pendingGsc = false;
  try {
    pendingGsc = sessionStorage.getItem(CONNECT_KEY) === '1';
  } catch (error) {
    pendingGsc = false;
  }
  if (pendingGsc && params.get('state') && (params.get('code') || params.get('error')) && window.ReviewAuth.signedIn()) {
    finishConnect(params);
  }

  paint();
  if (window.SiteI18n) {
    SiteI18n.resolve().then((resolved) => {
      const code = String(resolved || 'en').slice(0, 2);
      lang = COPY[code] ? code : 'en';
      copy = COPY[lang] || COPY.en;
      paint();
    });
  }
})();