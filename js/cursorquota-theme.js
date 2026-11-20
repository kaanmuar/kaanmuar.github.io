/* Mirrors the site theme (js/site-theme.js) into a data-theme attribute on <html> for css/cursorquota.css. */
(function () {
	const root = document.documentElement;
	function mirror(dark) {
		root.setAttribute('data-theme', dark ? 'dark' : 'light');
	}
	document.addEventListener('cv-theme-change', (event) => mirror(!!(event.detail && event.detail.dark)));
	if (window.SiteTheme) window.SiteTheme.boot();
})();
