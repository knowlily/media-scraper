// ---------------------------------------------------------------------------
// @media-scraper/core — stream collector
// ---------------------------------------------------------------------------

import type { ScrapeResult } from '../types.js';
import type { StreamYield } from './stream.js';
import { categorizeResources } from '../scraper.js';

/**
 * Collect stream yields into a final {@link ScrapeResult}.
 *
 * Consumes an async iterator of {@link StreamYield} frames produced by
 * {@link scrapeStream} and assembles a complete result.
 *
 * @param stream - An async iterator of stream yields.
 * @param url - The page URL.
 * @param title - The page title.
 * @param startTime - Timestamp when the scrape started (for durationMs).
 * @param errors - Errors captured during streaming.
 * @param warnings - Warnings from background extraction.
 * @param domNodeCount - Total DOM node count.
 * @returns A completed {@link ScrapeResult}.
 *
 * @internal
 */
export async function collectFromStream(
  stream: AsyncGenerator<StreamYield, void, unknown>,
  url: string,
  title: string,
  startTime: number,
  errors: import('../types.js').ScrapeError[],
  warnings: string[],
  domNodeCount: number,
): Promise<ScrapeResult> {
  let allResources: import('../types.js').MediaResource[] = [];
  let streamErrors: import('../types.js').ScrapeError[] = [...errors];

  for await (const frame of stream) {
    allResources = frame.cumulative;
    streamErrors = frame.errors;
  }

  const duration = Date.now() - startTime;
  const categorized = categorizeResources(allResources);

  return {
    url,
    title,
    total: allResources.length,
    images: categorized.images,
    videos: categorized.videos,
    audio: categorized.audio,
    documents: categorized.documents,
    warnings,
    duration,
    timestamp: new Date().toISOString(),
    errors: streamErrors,
    partial: streamErrors.length > 0,
    stats: {
      durationMs: duration,
      domNodeCount,
      deduplicatedCount: 0,
      filteredCount: 0,
    },
  };
}
