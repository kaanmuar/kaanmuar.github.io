'use strict';

/* Passive GEO agent-readiness checks (#3829): llms.txt layout, ai-catalog.json, WebMCP
   document.modelContext in static HTML, and Accept: text/markdown on the start page. */

const { say } = require('./url-review-findings-en');

const looksHtmlBody = (text) => /^\s*<(!doctype\s+html|<html[\s>])/i.test(String(text || ''));

// How many times /\[[^\]]+\]\([^)]+\)/g matches text, counting up to max, without rescanning from every "[".
function markdownLinks(text, max = Infinity) {
	let count = 0;
	let from = 0;
	while (count < max) {
		const open = text.indexOf('[', from);
		if (open < 0) break;
		const close = text.indexOf(']', open + 1);
		if (close < 0) break;
		const end = close > open + 1 && text[close + 1] === '(' ? text.indexOf(')', close + 2) : -2;
		if (end === -1) break;
		if (end > close + 2) {
			count += 1;
			from = end + 1;
		} else {
			from = close + 1;
		}
	}
	return count;
}

function parseLlmsTxt(body, meta) {
	const status = (meta && meta.status) || 0;
	const html = !!(meta && meta.html);
	const full = !!(meta && meta.full);
	const report = {
		status,
		ok: false,
		html,
		title: '',
		summary: '',
		sections: 0,
		links: 0,
		bareLinks: 0,
		full,
		gaps: [],
		complete: false,
	};
	if (status !== 200 || html) return report;
	const text = String(body || '');
	// A line start right after another line break in the same blank run is skipped: the first one there gives the same result.
	if (!/^(?<![\n\r\u2028\u2029]\s*?[\n\r\u2028\u2029])\s*#\s+\S/m.test(text)) return report;
	report.ok = true;
	report.title = ((text.match(/^(?<![\n\r\u2028\u2029]\s*?[\n\r\u2028\u2029])\s*#\s+(.+)$/m) || [])[1] || '').slice(
		0,
		120
	);
	report.summary = ((text.match(/^(?<![\n\r\u2028\u2029]\s*?[\n\r\u2028\u2029])\s*>\s*(.+)$/m) || [])[1] || '').slice(
		0,
		240
	);
	report.sections = (text.match(/^##\s+/gm) || []).length;
	report.links = markdownLinks(text);
	report.bareLinks = (text.match(/(^|\s)https?:\/\/\S+/gm) || []).length;
	if (!report.summary) report.gaps.push('summary');
	if (!report.links && !report.bareLinks) report.gaps.push('links');
	else if (!report.links && report.bareLinks) report.gaps.push('markdownLinks');
	if (!report.sections) report.gaps.push('sections');
	report.complete = !report.gaps.length;
	return report;
}

function parseAiCatalog(body, meta) {
	const status = (meta && meta.status) || 0;
	const html = !!(meta && meta.html);
	const report = { status, ok: false, html, parseError: '', kind: '' };
	if (status !== 200 || html) return report;
	const text = String(body || '').trim();
	if (!text) {
		report.parseError = 'empty';
		return report;
	}
	try {
		const value = JSON.parse(text);
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			report.parseError = 'not an object';
			return report;
		}
		report.ok = true;
		if (Array.isArray(value.resources)) report.kind = 'resources';
		else if (Array.isArray(value.services)) report.kind = 'services';
		else if (value.version != null) report.kind = 'version';
		else report.kind = 'object';
		return report;
	} catch (error) {
		report.parseError = String((error && error.message) || 'invalid JSON').slice(0, 80);
		return report;
	}
}

function detectWebMcp(html) {
	const src = String(html || '');
	const found = /\bdocument\.modelContext\b/.test(src);
	const tools = found && /(?:\.registerTool|\.provideContext)\s*\(/.test(src);
	return { found, tools };
}

function classifyAgentMarkdown(res) {
	const status = (res && res.status) || 0;
	const contentType = String((res && res.contentType) || '');
	const body = String((res && res.body) || '');
	const html = !!(res && res.html) || /text\/html/i.test(contentType) || looksHtmlBody(body);
	const markdown =
		status >= 200 &&
		status < 400 &&
		!html &&
		(/text\/markdown/i.test(contentType) ||
			(body.length > 0 &&
				!looksHtmlBody(body) &&
				(/^#{1,6}\s/m.test(body) || /^>\s/m.test(body) || markdownLinks(body, 1) > 0)));
	return { status, contentType, html, markdown, error: res && res.error ? String(res.error) : '' };
}

function draftLlmsTxt({ name, description, pages, origin }) {
	const title = String(name || 'Site')
		.replace(/\s+/g, ' ')
		.trim();
	const summary = String(description || 'Describe in one or two sentences what this site offers and who it is for.')
		.replace(/\s+/g, ' ')
		.trim();
	const lines = ['# ' + title, '', '> ' + summary, '', '## Pages', '']
		.concat(
			(pages || []).map((page) => {
				const label = String(page.title || page.path || '/').replace(/[[\]]/g, '');
				const note = page.description ? ': ' + String(page.description).replace(/\s+/g, ' ').trim() : '';
				return '- [' + label + '](' + page.url + ')' + note;
			})
		)
		.concat(['', '## Contact', '', '- [Home](' + origin + '/)']);
	return lines.join('\n') + '\n';
}

function gapLabels(gaps) {
	return gaps.map((gap) => {
		if (gap === 'summary') return say('geo-llms.gapSummary');
		if (gap === 'links') return say('geo-llms.gapLinks');
		if (gap === 'markdownLinks') return say('geo-llms.gapMarkdown');
		if (gap === 'sections') return say('geo-llms.gapSections');
		return gap;
	});
}

function llmsFindings(llms, llmsFull, add) {
	const report = parseLlmsTxt(llms.body, {
		status: llms.status || 0,
		html: llms.html,
		full: !!(llmsFull && llmsFull.status === 200 && !llmsFull.html),
	});
	if (report.ok) {
		const gaps = gapLabels(report.gaps);
		add(
			'GEO',
			gaps.length ? 'risk' : 'pass',
			'low',
			'geo-llms',
			gaps.length ? say('geo-llms.lacks.title', { gaps: { items: gaps, join: 'and' } }) : say('geo-llms.pass.title'),
			say('geo-llms.evidence', {
				sections: say('geo-llms.sections', { n: report.sections }),
				links: say('geo-llms.links', { n: report.links || report.bareLinks || 0 }),
				full: report.full ? say('geo-llms.full') : '.',
			}),
			gaps.length ? say('geo-llms.lacks.fix') : '',
			{ cases: ['GEO-02'], effort: 'minutes' }
		);
	} else if (llms.status === 200 && llms.html) {
		add(
			'GEO',
			'risk',
			'low',
			'geo-llms',
			say('geo-llms.html.title'),
			say('geo-llms.html.evidence'),
			say('geo-llms.html.fix'),
			{ cases: ['GEO-02'], effort: 'minutes' }
		);
	} else {
		add(
			'GEO',
			'risk',
			'low',
			'geo-llms',
			say('geo-llms.title'),
			say('geo-llms.none.evidence', { status: llms.status || say('nothing') }),
			say('geo-llms.fix'),
			{ cases: ['GEO-02'], effort: 'minutes' }
		);
	}
	return report;
}

function aiCatalogFindings(file, add) {
	const body = file || {};
	const report = parseAiCatalog(body.body, { status: body.status || 0, html: body.html });
	if (report.ok) {
		add(
			'GEO',
			'pass',
			'info',
			'geo-ai-catalog',
			say('geo-ai-catalog.pass.title'),
			say('geo-ai-catalog.pass.evidence', {
				kind: report.kind ? say('geo-ai-catalog.kind.' + report.kind) : say('geo-ai-catalog.kind.object'),
			}),
			'',
			{ cases: ['GEO-07'], effort: 'minutes' }
		);
	} else if (body.status === 200) {
		add(
			'GEO',
			'risk',
			'low',
			'geo-ai-catalog',
			say('geo-ai-catalog.invalid.title'),
			say('geo-ai-catalog.invalid.evidence', {
				detail: report.html ? say('geo-ai-catalog.html') : report.parseError || say('geo-ai-catalog.badJson'),
			}),
			say('geo-ai-catalog.fix'),
			{ cases: ['GEO-07'], effort: 'minutes' }
		);
	} else {
		add(
			'GEO',
			'risk',
			'low',
			'geo-ai-catalog',
			say('geo-ai-catalog.title'),
			say('geo-ai-catalog.none.evidence', { status: body.status || say('nothing') }),
			say('geo-ai-catalog.fix'),
			{ cases: ['GEO-07'], effort: 'minutes' }
		);
	}
	return report;
}

function webMcpFindings(homeHtml, add) {
	const report = detectWebMcp(homeHtml);
	if (report.found) {
		add(
			'GEO',
			'pass',
			'info',
			'geo-webmcp',
			say('geo-webmcp.pass.title'),
			say('geo-webmcp.pass.evidence', { tools: report.tools ? say('geo-webmcp.tools') : say('geo-webmcp.mention') }),
			'',
			{ cases: ['GEO-08'], effort: 'hours' }
		);
	} else {
		add(
			'GEO',
			'pass',
			'info',
			'geo-webmcp',
			say('geo-webmcp.none.title'),
			say('geo-webmcp.none.evidence'),
			say('geo-webmcp.none.fix'),
			{ cases: ['GEO-08'], effort: 'hours' }
		);
	}
	return report;
}

function agentMarkdownFindings(file, add) {
	const report = classifyAgentMarkdown(file || {});
	if (!report.status && report.error) return report;
	if (report.markdown) {
		add(
			'GEO',
			'pass',
			'info',
			'geo-agent-markdown',
			say('geo-agent-markdown.pass.title'),
			say('geo-agent-markdown.pass.evidence', { type: report.contentType || say('geo-agent-markdown.typeUnknown') }),
			'',
			{ cases: ['GEO-09'], effort: 'minutes' }
		);
	} else if (report.status >= 200 && report.status < 400) {
		add(
			'GEO',
			'risk',
			'low',
			'geo-agent-markdown',
			say('geo-agent-markdown.title'),
			say('geo-agent-markdown.html.evidence', { type: report.contentType || 'text/html' }),
			say('geo-agent-markdown.fix'),
			{ cases: ['GEO-09'], effort: 'minutes' }
		);
	} else {
		add(
			'GEO',
			'pass',
			'info',
			'geo-agent-markdown',
			say('geo-agent-markdown.skip.title'),
			say('geo-agent-markdown.skip.evidence', { status: report.status || say('nothing') }),
			'',
			{ cases: ['GEO-09'], effort: 'minutes' }
		);
	}
	return report;
}

function findings(input, add) {
	const extras = input.extras || {};
	const page = (input.pages || [])[0] || {};
	const html = page.html || page.body || '';
	const llmsReport = llmsFindings(extras.llms || {}, extras.llmsFull, add);
	const aiCatalog = aiCatalogFindings(extras.aiCatalog, add);
	const webmcp = webMcpFindings(html, add);
	const agentMarkdown = agentMarkdownFindings(extras.agentMarkdown, add);
	return { llms: llmsReport, aiCatalog, webmcp, agentMarkdown };
}

module.exports = {
	parseLlmsTxt,
	parseAiCatalog,
	detectWebMcp,
	classifyAgentMarkdown,
	draftLlmsTxt,
	llmsFindings,
	findings,
};
