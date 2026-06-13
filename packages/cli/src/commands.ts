/**
 * Command implementations for the media-scraper CLI.
 */

import { launch, loadPage, executeExtraction, scrollToTriggerLazy, getPageMetrics, close } from './browser.js';
import { downloadBatch } from './downloader.js';
import type { DownloadProgress } from '@media-scraper/downloader';

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

/** CLI-specific scrape result with flat resource list for download. */
export interface CliScrapeResult {
  url: string;
  title: string;
  loadTimeMs: number;
  resources: Array<{
    url: string;
    type: string;
    size: number | null;
    filename: string;
  }>;
  warnings: string[];
  errors: string[];
  stats: {
    totalFound: number;
    byType: Record<string, number>;
  };
}

function parseMediaTypes(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

/**
 * Execute a full scrape against `url`, returning a CliScrapeResult.
 */
export async function scrapeCommand(
  url: string,
  options: CliOptions,
): Promise<CliScrapeResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const { browser } = await launch({
    proxy: options.proxy,
    userAgent: options.userAgent,
    timeout: options.timeout,
  });

  const page = await loadPage(browser, url, { timeout: options.timeout });

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

  // ── Compute stats ──────────────────────────────────────────────────
  const byType: Record<string, number> = {};
  for (const r of result.resources) {
    byType[r.type] = (byType[r.type] || 0) + 1;
  }
  const stats = {
    totalFound: result.resources.length,
    byType,
  };

  // ── Check for partial results ──────────────────────────────────────
  if (result.resources.length === 0 && mediaTypes.length > 0) {
    warnings.push(`No media resources found for URL: ${url}`);
  }

  // Print warnings to stderr
  for (const w of warnings) {
    process.stderr.write(`[WARN] ${w}\n`);
  }
  for (const e of errors) {
    process.stderr.write(`[ERROR] ${e}\n`);
  }

  return {
    url,
    title: metrics.title,
    loadTimeMs: metrics.loadTimeMs,
    resources: result.resources,
    warnings,
    errors,
    stats,
  };
}

/**
 * Scrape + download all discovered media files.
 */
export async function downloadCommand(
  url: string,
  options: CliOptions,
): Promise<CliScrapeResult & { downloaded: string[] }> {
  const scrapeResult = await scrapeCommand(url, options);

  const outputDir = options.output ?? './media-scraper-output';

  // ── Progress callback for DownloadManager ──────────────────────────
  const onProgress = (progress: DownloadProgress): void => {
    const pct =
      progress.total > 0
        ? ((progress.completed / progress.total) * 100).toFixed(1)
        : '0.0';
    process.stderr.write(
      `\r  [download] ${progress.completed}/${progress.total} (${pct}%)  ${progress.currentUrl || ''}    `,
    );
  };

  const downloaded = await downloadBatch(
    scrapeResult.resources,
    outputDir,
    options.concurrency ?? 5,
    { onProgress },
  );

  return { ...scrapeResult, downloaded };
}

/**
 * Read URLs from a file (one per line), scrape each one.
 */
export async function batchCommand(
  file: string,
  options: CliOptions,
): Promise<CliScrapeResult[]> {
  const { readFileSync } = await import('node:fs');

  const raw = readFileSync(file, 'utf-8');
  const urls = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const results: CliScrapeResult[] = [];

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
