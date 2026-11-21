#!/usr/bin/env node
/**
 * QA-lab MCP stdio server (#3480 / #3626).
 * Tools: preview_url, crawl_url (account API token), get_report.
 * Logs go to stderr so stdout stays JSON-RPC clean.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { previewUrl, crawlUrl, getReport } from "./client.js";

const server = new McpServer({
  name: "qa-lab",
  version: "0.2.0"
});

server.registerTool(
  "preview_url",
  {
    title: "Soft-preview a URL",
    description:
      "Run a QA-lab soft preview (1 page, frosted scores + top finding) via POST /review/preview. Uses the same IP/email soft quota as the web gate (5/day anon, 20/day signed-in). Soft preview does not run attack and exploit source checks (CISA KEV, OSV.dev, FIRST EPSS, Spamhaus DROP, Feodo Tracker, Tor exit list, GDELT 2.0 cyber news, or CertSpotter certificate transparency); those run only on a full review, and CertSpotter plus the site news match only in the paid Deep check.",
    inputSchema: {
      url: z.string().min(1).describe("Public http(s) URL to preview")
    }
  },
  async ({ url }) => previewUrl(url)
);

server.registerTool(
  "crawl_url",
  {
    title: "Full-crawl a URL",
    description:
      "Queue a full QA-lab site audit via POST /review (up to 20 pages by default). Requires QA_LAB_API_TOKEN (account API token from POST /account/api-token). Uses the account's run credits / pass; returns paymentRequired when none are left. Separate from QA_LAB_MCP_KEY (Turnstile skip only).",
    inputSchema: {
      url: z.string().min(1).describe("Public http(s) URL to crawl"),
      frameworks: z
        .array(z.string())
        .optional()
        .describe("Frameworks for proposed cases (default: [\"Playwright\"])"),
      pages: z.number().optional().describe("Page cap: 20, 40, 60, 80, or 100 (default 20)"),
      depth: z.number().optional().describe("Link depth: 2–5 (default 2)")
    }
  },
  async ({ url, frameworks, pages, depth }) => crawlUrl(url, { frameworks, pages, depth })
);

server.registerTool(
  "get_report",
  {
    title: "Read a QA-lab report",
    description:
      "Fetch a report by id via POST /review/open. Without auth returns the frosted/locked preview (sec-kev, sec-osv, sec-drop, sec-feodo, sec-breach-news, sec-cert-anomaly, and the paid \"Was it targeted?\" block are omitted). With QA_LAB_API_TOKEN or QA_LAB_SESSION and ownership returns the full report, including attack and exploit results (levels info, watch, high, critical) unless that run opted out of attack-source checks. A report with the paid Deep check also returns `deep` (certificate-transparency and site-news results, kept apart from `report.targeted`).",
    inputSchema: {
      id: z.string().min(1).describe("Report id (hex) from preview_url, crawl_url, or a share link")
    }
  },
  async ({ id }) => getReport(id)
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("qa-lab-mcp listening on stdio");
