// The ring in Reddit's expanded view. Reddit's web view only opens links through navigateTo; js/live-host.js sends them here.
import { navigateTo } from "@devvit/web/client";

window.LIVE_HOST_OPEN = (url) => navigateTo(url);
