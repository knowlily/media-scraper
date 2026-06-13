// ---------------------------------------------------------------------------
// @media-scraper/core — streaming scrape
// ---------------------------------------------------------------------------

import type { DocumentLike } from '../types.js';
import type { MediaResource, ScrapeError, ScrapeStats } from '../types.js';
import type { MediaParser } from '../parsers/types.js';
import { BUILTIN_PARSERS } from '../parsers/builtin.js';

/**
 * A single phase yield from a streaming scrape.
 */
export interface StreamYield {
  /** Current phase number. */
  phase: number;
  /** Resources extracted in this phase. */
  items: MediaResource[];
  /** All resources collected so far (across all phases). */
  cumulative: MediaResource[];
  /** Progress: 0–1 fraction of phases completed. */
  progress: number;
  /** Errors collected so far. */
  errors: ScrapeError[];
  /** Whether the result is partial (some phases had recoverable failures). */
  partial: boolean;
  /** Statistics collected so far. */
  stats: ScrapeStats;
}

/**
 * Options for {@link scrapeStream}.
 */
export interface ScrapeStreamOptions {
  /** Array of parsers to execute.  Defaults to built-in 7 parsers. */
  parsers?: MediaParser[];
  /** AbortSignal to cancel mid-stream. */
  signal?: AbortSignal;
}

/**
 * Count the total number of DOM nodes (elements) in a DocumentLike.
 *
 * @param doc - The parsed DOM document.
 * @returns Total number of elements found via '*' wildcard selector.
 */
function countDomNodes(doc: DocumentLike): number {
  try {
    return doc.querySelectorAll('*').length;
  } catch {
    return 0;
  }
}

/**
 * Stream-scrape a web page, yielding results after each parser phase.
 *
 * Parsers run in phase order.  After each parser completes, a
 * {@link StreamYield} is emitted with the new items, the cumulative
 * list of all resources so far, progress, errors, and stats.
 *
 * If a parser throws, the error is captured as a {@link ScrapeError},
 * logged to the errors array, and the stream continues to the next
 * parser.  An {@link AbortSignal} can cancel the stream — the current
 * phase's results are still yielded before the generator returns.
 *
 * @param doc - The parsed DOM document.
 * @param baseUrl - The base URL of the page.
 * @param options - Optional configuration.
 *
 * @example
 * ```ts
 * for await (const frame of scrapeStream(doc, url)) {
 *   console.log(`Phase ${frame.phase}: ${frame.items.length} new items`);
 * }
 * ```
 *
 * @public
 */
export async function* scrapeStream(
  doc: DocumentLike,
  baseUrl: string,
  options: ScrapeStreamOptions = {},
): AsyncGenerator<StreamYield, void, unknown> {
  const parsers = options.parsers ?? BUILTIN_PARSERS;
  const totalPhases = parsers.length;
  const errors: ScrapeError[] = [];
  const cumulative: MediaResource[] = [];
  const domNodeCount = countDomNodes(doc);
  const startTime = Date.now();

  for (let i = 0; i < parsers.length; i++) {
    const parser = parsers[i];
    let items: MediaResource[] = [];

    try {
      items = parser.extract(doc, baseUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const scrapeError: ScrapeError = {
        phase: parser.name,
        type: 'parse',
        message,
        recoverable: true,
      };
      errors.push(scrapeError);
      items = [];
    }

    cumulative.push(...items);
    const progress = (i + 1) / totalPhases;
    const durationMs = Date.now() - startTime;

    yield {
      phase: parser.phase,
      items,
      cumulative: [...cumulative],
      progress,
      errors: [...errors],
      partial: errors.length > 0,
      stats: {
        durationMs,
        domNodeCount,
        deduplicatedCount: 0,
        filteredCount: 0,
      },
    };

    // Check for abort signal after yielding
    if (options.signal?.aborted) {
      return;
    }
  }
}
