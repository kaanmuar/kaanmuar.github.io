#!/usr/bin/env node
/**
 * beforeMCPExecution — allowlist project MCPs (#3552).
 * Fail-open only for parse errors; unknown servers are denied.
 */
'use strict';

const fs = require('node:fs');

/** Servers declared in `.cursor/mcp.json` (plus common aliases). */
const ALLOW = new Set(['cloudflare', 'github', 'user-cloudflare']);

function reply(obj) {
	process.stdout.write(JSON.stringify(obj));
	process.exit(0);
}

function main() {
	let raw = '';
	try {
		raw = fs.readFileSync(0, 'utf8');
	} catch {
		reply({ permission: 'allow' });
	}
	if (!raw.trim()) reply({ permission: 'allow' });

	let payload;
	try {
		payload = JSON.parse(raw);
	} catch {
		reply({ permission: 'allow' });
	}

	const server =
		payload.server_name || payload.serverName || payload.mcp_server || payload.mcpServer || payload.server || '';
	const tool = payload.tool_name || payload.toolName || payload.tool || '';
	const key = String(server).trim().toLowerCase();

	if (!key || ALLOW.has(key)) {
		reply({ permission: 'allow' });
	}

	reply({
		permission: 'deny',
		user_message: `MCP server "${server}" is not on the project allowlist (cloudflare, github).`,
		agent_message: `Denied MCP ${server}/${tool}: add it to .cursor/mcp.json and .cursor/hooks/mcp-allow.js ALLOW if intentional (#3552).`,
	});
}

main();
