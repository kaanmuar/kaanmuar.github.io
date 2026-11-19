#!/usr/bin/env node
/**
 * QA-lab MCP stdio server (#3480).
 * Tools: preview_url (POST /review/preview), get_report (POST /review/open).
 * Logs go to stderr so stdout stays JSON-RPC clean.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { previewUrl, getReport } from "./client.js";

const server = new McpServer({
  name: "qa-lab",
  version: "0.1.0"
});

server.registerTool(
  "preview_url",
  {
    title: "Soft-preview a URL",
    description:
      "Run a QA-lab soft preview (1 page, frosted scores + top finding) via POST /review/preview. Uses the same IP/email soft quota as the web gate (5/day anon, 20/day signed-in). Soft preview does not run attack and exploit source checks (CISA KEV, OSV.dev, FIRST EPSS, Spamhaus DROP, Feodo Tracker, Tor exit list, GDELT 2.0 cyber news, or CertSpotter certificate transparency); those run only on a full review.",
    inputSchema: {
      url: z.string().min(1).describe("Public http(s) URL to preview")
    }
  },
  async ({ url }) => previewUrl(url)
);

server.registerTool(
  "get_report",
  {
    title: "Read a QA-lab report",
    description:
      "Fetch a report by id via POST /review/open. Without QA_LAB_SESSION returns the frosted/locked preview (sec-kev, sec-osv, sec-drop, sec-feodo, sec-breach-news, sec-cert-anomaly, and the paid \"Was it targeted?\" block are omitted). With QA_LAB_SESSION and ownership returns the full report, including attack and exploit results (levels info, watch, high, critical) unless that run opted out of attack-source checks.",
    inputSchema: {
      id: z.string().min(1).describe("Report id (hex) from preview_url or a share link")
    }
  },
  async ({ id }) => getReport(id)
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("qa-lab-mcp listening on stdio");
