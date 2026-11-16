'use strict';

// Kept in sync with scripts/ci-wait.sh: gh run watch exits at once on queued runs (#1725).
const NOT_STARTED = new Set(['queued', 'waiting', 'pending', 'requested']);

function classifyRun(status) {
  if (status === 'completed') return 'complete';
  if (NOT_STARTED.has(status)) return 'not_started';
  if (status === 'in_progress') return 'active';
  return 'unknown';
}

module.exports = { classifyRun, NOT_STARTED };