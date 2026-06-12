#!/usr/bin/env node

/**
 * Media Scraper MCP Server
 *
 * Provides media scraping and downloading capabilities to MCP-compatible
 * AI agents (Hermes Agent, Claude Desktop, etc.) via stdio transport.
 *
 * Tools:
 *   - scrape_media  : Extract media from URLs
 *   - download_media: Download media to local disk
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

// ── Server ─────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "media-scraper",
  version: "0.1.0",
});

// Register all tools
registerTools(server);

// ── Transport ──────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();

// ── Graceful shutdown ──────────────────────────────────────────────────────

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.error(`[media-scraper] Received ${signal} — shutting down…`);

  try {
    await server.close();
    console.error("[media-scraper] Server closed cleanly.");
  } catch (err) {
    console.error("[media-scraper] Error during shutdown:", err);
  }

  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// On Windows, stdin close is the typical "parent exited" signal
process.on("SIGHUP", () => shutdown("SIGHUP"));

// Handle uncaught errors gracefully
process.on("uncaughtException", (err) => {
  console.error("[media-scraper] Uncaught exception:", err);
  if (!shuttingDown) {
    shuttingDown = true;
    server.close().finally(() => process.exit(1));
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("[media-scraper] Unhandled rejection:", reason);
});

// ── Start ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.error("[media-scraper] MCP Server starting (stdio transport)…");

  try {
    await server.connect(transport);
    console.error("[media-scraper] MCP Server connected and ready.");
  } catch (err) {
    console.error("[media-scraper] Failed to connect transport:", err);
    process.exit(1);
  }
}

main();
