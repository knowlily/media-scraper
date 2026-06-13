#!/usr/bin/env node

/**
 * Media Scraper HTTP API Server — standalone, no CLI dependency
 *
 * Start:  node dist/api.js [--port 3456]
 *
 * Endpoints:
 *   GET  /health
 *   POST /scrape        {"url":"...", "types":["image","video"]}
 *   POST /scrape/stream {"url":"...", "types":["image","video"]}  (SSE)
 *   POST /download      {"resources":[...], "outputDir":"..."}
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { JSDOM } from 'jsdom';

// ── V2: StealthBrowser + scrapeStream ────────────────────────────────────
import { launch } from '@media-scraper/browser';
import { scrapeStream } from '@media-scraper/core';
import type { StreamYield, ScrapeError } from '@media-scraper/core';
import type { DocumentLike } from '@media-scraper/core';

// ── V2: DownloadManager ──────────────────────────────────────────────────
import { DownloadManager } from '@media-scraper/downloader';
import type { DownloadResult as DMResult, MediaResource as DMResource } from '@media-scraper/downloader';

const PORT = parseInt(process.env.PORT || '3456', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ── Helpers ─────────────────────────────────────────────────────────────────

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data, null, 2));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

function sseHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
}

// ── V2: Scrape Engine (StealthBrowser + scrapeStream) ─────────────────────

async function scrapeUrl(url: string, opts?: {
  types?: string[];
  timeout?: number;
  proxy?: string;
  referer?: string;
  cdpEndpoint?: string;
  cookies?: string;
}): Promise<unknown> {
  // ── CDP mode: connect to user's real Chrome ──
  if (opts?.cdpEndpoint) {
    const { chromium } = await import('playwright');
    const browser = await chromium.connectOverCDP(opts.cdpEndpoint);
    const contexts = browser.contexts();
    const page = contexts[0]?.pages()[0] || await contexts[0]?.newPage();
    if (!page) throw new Error('No page available in CDP browser');

    await page.goto(url, { timeout: opts?.timeout ?? 30000, waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));

    const html = await page.content();
    const title = await page.title();
    await browser.close();

    const dom = new JSDOM(html, { url });
    const doc = dom.window.document as unknown as DocumentLike;

    const allResources: unknown[] = [];
    for await (const frame of scrapeStream(doc, url)) {
      allResources.push(...frame.cumulative);
    }

    if (opts?.types?.length) {
      const keep = new Set(opts.types);
      return { url, title, resources: allResources.filter((r: any) => keep.has(r.type)) };
    }
    return { url, title, resources: allResources };
  }

  // ── StealthBrowser mode ──
  const browser = await launch({
    headless: true,
    userAgent: 'pool',
    proxy: opts?.proxy ? { server: opts.proxy } : undefined,
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, {
      timeout: opts?.timeout ?? 30000,
      waitUntil: 'domcontentloaded',
    });

    await page.scrollToTriggerLazy();

    const html = await page.content();
    const title = await page.raw.title();

    const dom = new JSDOM(html, { url });
    const doc = dom.window.document as unknown as DocumentLike;

    const allResources: unknown[] = [];
    for await (const frame of scrapeStream(doc, url)) {
      allResources.push(...frame.cumulative);
    }

    if (opts?.types && opts.types.length > 0) {
      const keep = new Set(opts.types);
      return { url, title, resources: allResources.filter((r: any) => keep.has(r.type)) };
    }

    return { url, title, resources: allResources };
  } finally {
    await browser.close();
  }
}

// ── SSE Stream Scrape ───────────────────────────────────────────────────────

async function sseScrape(
  res: ServerResponse,
  url: string,
  signal: AbortSignal,
  opts?: { types?: string[]; timeout?: number },
): Promise<void> {
  sseHeaders(res);

  const browser = await launch({ headless: true, userAgent: 'pool' });

  try {
    const page = await browser.newPage();

    // Check abort before navigating
    if (signal.aborted) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Client disconnected before scrape started' })}\n\n`);
      res.end();
      return;
    }

    await page.goto(url, {
      timeout: opts?.timeout ?? 30000,
      waitUntil: 'domcontentloaded',
    });

    if (signal.aborted) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Client disconnected after navigation' })}\n\n`);
      res.end();
      return;
    }

    await page.scrollToTriggerLazy();

    const html = await page.content();
    const title = await page.raw.title();

    const dom = new JSDOM(html, { url });
    const doc = dom.window.document as unknown as DocumentLike;

    let totalItems = 0;

    for await (const frame of scrapeStream(doc, url, { signal })) {
      // Check if client disconnected
      if (signal.aborted) {
        return; // stop streaming
      }

      const batch = {
        type: 'batch',
        phase: frame.phase,
        progress: frame.progress,
        items: frame.items,
        total: frame.cumulative.length,
      };

      res.write(`data: ${JSON.stringify(batch)}\n\n`);
      totalItems = frame.cumulative.length;
    }

    // Final complete event
    if (!signal.aborted) {
      res.write(`data: ${JSON.stringify({ type: 'complete', total: totalItems, url, title })}\n\n`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!signal.aborted) {
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    }
  } finally {
    await browser.close();
    if (!signal.aborted) {
      res.end();
    }
  }
}

// ── Download Engine ─────────────────────────────────────────────────────────

async function downloadResources(
  resources: Array<{ url: string; filename?: string }>,
  outputDir: string,
  concurrency = 3,
): Promise<{ downloaded: string[]; failed: string[] }> {
  const dmResources: DMResource[] = resources.map((r) => ({
    url: r.url,
    filename: r.filename,
  }));

  const manager = new DownloadManager({
    outputDir,
    concurrency,
  });

  const result: DMResult = await manager.downloadAll(dmResources);

  return {
    downloaded: result.succeeded,
    failed: result.failed.map((f) => f.url),
  };
}

// ── Server ──────────────────────────────────────────────────────────────────

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const url = req.url || '/';

  try {
    // Health
    if (req.method === 'GET' && url === '/health') {
      return json(res, { status: 'ok', version: '0.1.0' });
    }

    // SSE Stream Scrape (must be before /scrape to avoid matching the prefix)
    if (req.method === 'POST' && url === '/scrape/stream') {
      const body = JSON.parse(await readBody(req));
      const { url: target, types, timeout } = body;
      if (!target) return json(res, { success: false, error: 'Missing "url"' }, 400);

      // Set up AbortSignal for client disconnect
      const controller = new AbortController();
      req.on('close', () => {
        controller.abort();
      });

      await sseScrape(res, target, controller.signal, { types, timeout });
      return;
    }

    // Scrape (non-streaming)
    if (req.method === 'POST' && url === '/scrape') {
      const body = JSON.parse(await readBody(req));
      const { url: target, types, timeout, proxy, referer } = body;
      if (!target) return json(res, { success: false, error: 'Missing "url"' }, 400);

      const result = await scrapeUrl(target, { types, timeout, proxy, referer });
      return json(res, { success: true, data: result });
    }

    // Download
    if (req.method === 'POST' && url === '/download') {
      const { resources, outputDir, concurrency } = JSON.parse(await readBody(req));
      if (!resources?.length) return json(res, { success: false, error: 'Missing "resources"' }, 400);
      if (!outputDir) return json(res, { success: false, error: 'Missing "outputDir"' }, 400);

      const result = await downloadResources(resources, outputDir, concurrency);
      return json(res, { success: true, data: result });
    }

    json(res, {
      endpoints: {
        'GET /health': 'Health check',
        'POST /scrape': '{"url":"...", "types":["image","video"], "timeout":30000}',
        'POST /scrape/stream': '{"url":"...", "types":["image","video"]} — SSE streaming',
        'POST /download': '{"resources":[{"url":"..."}], "outputDir":"...", "concurrency":3}',
      },
    }, 404);
  } catch (err) {
    json(res, { success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[media-scraper] HTTP API on http://${HOST}:${PORT}`);
  console.log(`  POST /scrape         - extract media from URL`);
  console.log(`  POST /scrape/stream  - extract media from URL (SSE streaming)`);
  console.log(`  POST /download        - download resources to disk`);
  console.log(`  GET  /health          - health check`);
});
