// How much of the Cursor plan is used, for the pre-flight hook (#1970) and the daily fix's 70% check (#1982).
// The Cursor Quota menu bar app refreshes its cache every minute and counts the team seat, where cursor.com's
// individual summary stays at 0% (#2012). A missing cache, one older than two days, or one from an ended
// billing cycle reads as unknown, never as the last number it held.
const fs = require("fs");
const os = require("os");
const path = require("path");

const QUOTA_CACHE = process.env.CURSOR_QUOTA_CACHE || path.join(os.homedir(), "Library/Application Support/CursorQuota/cache.json");
const MAX_AGE = 2 * 86400000;

function writtenAt(cache) {
  const at = Number(cache && cache.at) || 0;
  return at < 1e12 ? at * 1000 : at;
}

function planPercent(cache, now) {
  const pct = cache && cache.planPct;
  if (typeof pct !== "number" || !(Date.parse(cache.cycleEnd) > now) || writtenAt(cache) < now - MAX_AGE) return null;
  return pct;
}

function readCache() {
  try { return JSON.parse(fs.readFileSync(QUOTA_CACHE, "utf8")); } catch { return null; }
}

function quotaLine(cache, now) {
  const pct = planPercent(cache, now);
  if (pct == null) return "Cursor quota unknown: the Cursor Quota app's cache is missing, more than two days old or from an ended billing cycle.";
  const reset = new Date(cache.cycleEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const mins = Math.round((now - writtenAt(cache)) / 60000);
  const parts = [`Cursor plan ${pct.toFixed(0)}% used`];
  if (cache.odEnabled && cache.odLimit > 0) parts.push(`on-demand $${(cache.odRemaining / 100).toFixed(2)} of $${(cache.odLimit / 100).toFixed(0)} left`);
  parts.push(`resets ${reset}`);
  if (mins > 5) parts.push(`as of ${mins}m ago`);
  return parts.join(" · ");
}

module.exports = { QUOTA_CACHE, planPercent, readCache, quotaLine };
