'use strict';
/*
 * The agent's screenshot folder (#3717). Pruning keeps the newest KEEP entries. An entry can be a stale directory
 * (fb2b-logout-m was one), which rmSync without recursive refuses with EISDIR and which then aborted the Facebook task:
 * directories go with recursive, and a prune that fails is logged by the caller, never fatal.
 */
const fs = require('fs');
const path = require('path');

const KEEP = 30;

/** Removes all but the newest `keep` entries of dir (by name; the file names start with the network and end in a timestamp). Returns the names removed. */
function prune(dir, keep) {
	const removed = [];
	const old = fs.readdirSync(dir).sort().reverse().slice(keep == null ? KEEP : keep);
	old.forEach((name) => {
		try {
			fs.rmSync(path.join(dir, name), { recursive: true, force: true });
			removed.push(name);
		} catch (error) {
			// A file Chrome or another run holds: leave it for the next prune.
		}
	});
	return removed;
}

module.exports = { prune, KEEP };
