'use strict';

/* Thin wire: desk HTTP handler for IndexNow after fix-diff (#4397). */

const desk = require('./url-review-indexnow-desk');

async function handleFixDiffIndexNow(req, res, operator, deps) {
	return desk.deskPing(req, res, operator, deps);
}

module.exports = {
	handleFixDiffIndexNow,
	logFor: desk.logFor,
	enabled: desk.enabled,
};