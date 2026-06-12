/**
 * Command implementations for the media-scraper CLI.
 */

import type { ScrapeResult } from '@media-scraper/core';
import { launch, loadPage, executeExtraction, scrollToTriggerLazy, getPageMetrics, close } from './browser.js';
import { downloadBatch } from './downloader.js';

// ── Shared helpers ──────────────────────────────────────────────────────

interface CliOptions {
  output?: string;
  types?: string;
  minSize?: number;
  maxPages?: number;
  timeout?: number;
  proxy?: string;
  userAgent?: string;
  concurrency?: number;
  json?: boolean;
}

function parseMediaTypes(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

/**
 * Execute a full scrape against `url`, returning a ScrapeResult.
 */
export async function scrapeCommand(
  url: string,
  options: CliOptions,
): Promise<ScrapeResult> {
  const { browser, context } = await launch({
    proxy: options.proxy,
    userAgent: options.userAgent,
    timeout: options.timeout,
  });

  const page = await loadPage(context, url, { timeout: options.timeout });

  // Scroll to trigger lazy-loading images / infinite-scroll content
  if (options.maxPages && options.maxPages > 1) {
    await scrollToTriggerLazy(page, { maxPages: options.maxPages });
  } else {
    await scrollToTriggerLazy(page, { maxPages: 1 });
  }

  const mediaTypes = parseMediaTypes(options.types ?? 'image,video,audio,doc');

  const result = await executeExtraction(page, {
    types: mediaTypes,
    minSize: options.minSize,
  });

  const metrics = await getPageMetrics(page);

  await close(browser);

  return {
    ...result,
    pageTitle: metrics.title,
    pageUrl: url,
    loadTimeMs: metrics.loadTimeMs,
  };
}

/**
 * Scrape + download all discovered media files.
 */
export async function downloadCommand(
  url: string,
  options: CliOptions,
): Promise<ScrapeResult & { downloaded: string[] }> {
  const scrapeResult = await scrapeCommand(url, options);

  const outputDir = options.output ?? './media-scraper-output';

  const downloaded = await downloadBatch(
    scrapeResult.resources,
    outputDir,
    options.concurrency ?? 5,
  );

  return { ...scrapeResult, downloaded };
}

/**
 * Read URLs from a file (one per line), scrape each one.
 */
export async function batchCommand(
  file: string,
  options: CliOptions,
): Promise<ScrapeResult[]> {
  const { readFileSync } = await import('node:fs');

  const raw = readFileSync(file, 'utf-8');
  const urls = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const results: ScrapeResult[] = [];

  const concurrency = options.concurrency ?? 1;

  // Simple bounded-parallel execution
  const queue = [...urls];
  const workers: Promise<void>[] = [];

  for (let i = 0; i < concurrency; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const u = queue.shift()!;
          try {
            const r = await scrapeCommand(u, options);
            results.push(r);
          } catch (err) {
            process.stderr.write(`[ERROR] ${u}: ${String(err)}\n`);
          }
        }
      })(),
    );
  }

  await Promise.all(workers);

  return results;
}
