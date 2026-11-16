/*
 * Applies the stylesheets scripts/build-critical-css.js loads without blocking the first paint. Each one is a
 * rel=preload (high priority) plus a media=print stylesheet that reuses it; this switches the stylesheet to all media
 * once it has loaded. It replaces an onload attribute, which a Content-Security-Policy without 'unsafe-inline' refuses.
 */
(function () {
    function apply(link) {
        link.media = 'all';
    }
    document.querySelectorAll('link[data-async-css]').forEach(function (link) {
        if (link.sheet) apply(link);
        else link.addEventListener('load', function () { apply(link); });
    });
})();
