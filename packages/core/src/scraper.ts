// ---------------------------------------------------------------------------
// @media-scraper/core — main scraper orchestrator
// ---------------------------------------------------------------------------

import type {
  DocumentLike,
  DeduplicatorLike,
  MediaResource,
  ScrapeError,
  ScrapeOptions,
  ScrapeResult,
} from './types.js';

import { extractBackgroundImages } from './extractors/backgrounds.js';

import { deduplicate, filterByType } from './filters.js';
import { scrapeStream } from './output/stream.js';
import type { StreamYield } from './output/stream.js';
import { BUILTIN_PARSERS } from './parsers/builtin.js';
import type { MediaParser } from './parsers/types.js';
import type { FilterChain } from './filters/chain.js';

// ---------------------------------------------------------------------------
// Categorization helper
// ---------------------------------------------------------------------------

/**
 * Result of categorizing media resources by type.
 *
 * @public
 */
export interface CategorizedResources {
  /** Resources of type `image` (and `unknown`). */
  images: MediaResource[];
  /** Resources of type `video`. */
  videos: MediaResource[];
  /** Resources of type `audio`. */
  audio: MediaResource[];
  /** Resources of type `document`. */
  documents: MediaResource[];
}

/**
 * Categorize a flat list of media resources into type-specific arrays.
 *
 * Resources with type `unknown` are placed in the `images` array since
 * unknown resources are most likely images.
 *
 * @param resources - The resources to categorize.
 * @returns An object with `images`, `videos`, `audio`, and `documents` arrays.
 *
 * @public
 */
export function categorizeResources(
  resources: MediaResource[],
): CategorizedResources {
  const result: CategorizedResources = {
    images: [],
    videos: [],
    audio: [],
    documents: [],
  };

  for (const r of resources) {
    switch (r.type) {
      case 'image':
      case 'unknown':
        result.images.push(r);
        break;
      case 'video':
        result.videos.push(r);
        break;
      case 'audio':
        result.audio.push(r);
        break;
      case 'document':
        result.documents.push(r);
        break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Run a single extractor safely, returning an empty array on failure.
 *
 * Each extractor is wrapped in its own try/catch so that a failure in one
 * does not prevent the remaining extractors from running.
 *
 * @param name - Human-readable name of the extractor (for error logging).
 * @param fn - The extractor function to call.
 * @param args - Arguments to forward to the extractor.
 * @param errors - Optional array to append ScrapeError entries to.
 * @returns The resources extracted, or an empty array if the extractor threw.
 *
 * @internal
 */
function safeExtract(
  name: string,
  fn: (...args: unknown[]) => MediaResource[],
  errors: ScrapeError[],
  ...args: unknown[]
): MediaResource[] {
  try {
    return fn(...args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[media-scraper] ${name} extractor failed:`, err);
    errors.push({
      phase: name,
      type: 'parse',
      message,
      recoverable: true,
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main scrape function
// ---------------------------------------------------------------------------

/**
 * Scrape a web page document for all discoverable media resources.
 *
 * Orchestrates the full extraction pipeline:
 *
 *  1. Run every extractor against the DOM (in priority order).
 *  2. Merge all discovered resources into a single array.
 *  3. Deduplicate by URL to remove exact duplicates.
 *  4. Apply optional type and size filters from {@link ScrapeOptions}.
 *  5. Categorize into type-specific arrays (images, videos, audio, documents).
 *  6. Return a structured {@link ScrapeResult} with timing metadata.
 *
 * Each extractor runs inside its own try/catch — if one extractor fails,
 * the error is logged to `console.error` and the pipeline continues with
 * the remaining extractors.  If **all** extractors fail the result will
 * contain empty arrays but still include correct metadata (URL, title,
 * timestamp, duration).
 *
 * @param doc - The parsed DOM document to scrape.
 * @param baseUrl - The base URL of the page (for resolving relative URLs).
 * @param options - Optional configuration for filtering and behaviour.
 * @returns A promise that resolves with the {@link ScrapeResult}.
 *
 * @example
 * ```ts
 * const result = await scrape(document, 'https://example.com/gallery');
 * console.log(`Found ${result.total} media resources`);
 * console.log(`Images: ${result.images.length}`);
 * console.log(`Videos: ${result.videos.length}`);
 * ```
 *
 * @public
 */
export async function scrape(
  doc: DocumentLike,
  baseUrl: string,
  options: ScrapeOptions = {} as ScrapeOptions,
): Promise<ScrapeResult> {
  const startTime = Date.now();
  const errors: ScrapeError[] = [];
  const warnings: string[] = [];

  // ------------------------------------------------------------------
  // Phase 1 — Extract background images separately (to capture warnings)
  // ------------------------------------------------------------------

  const bgResources: MediaResource[] = (() => {
    try {
      const bgResult = extractBackgroundImages(doc, baseUrl);
      warnings.push(...bgResult.warnings);
      return bgResult.resources;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[media-scraper] background-images extractor failed:', err);
      errors.push({
        phase: 'background',
        type: 'parse',
        message,
        recoverable: true,
      });
      return [];
    }
  })();

  // ------------------------------------------------------------------
  // Phase 2 — Stream-scrape remaining media via parsers (excluding background)
  // ------------------------------------------------------------------

  const nonBgParsers = BUILTIN_PARSERS.filter((p) => p.name !== 'background');
  const stream = scrapeStream(doc, baseUrl, { parsers: nonBgParsers });

  const streamResources: MediaResource[] = [];
  for await (const frame of stream) {
    streamResources.push(...frame.items);
    // Collect any errors from the stream phases
    for (const e of frame.errors) {
      if (!errors.some((existing) => existing.phase === e.phase && existing.message === e.message)) {
        errors.push(e);
      }
    }
  }

  // ------------------------------------------------------------------
  // Phase 3 — Merge all resources
  // ------------------------------------------------------------------

  const allResources: MediaResource[] = [...bgResources, ...streamResources];

  // ------------------------------------------------------------------
  // Phase 4 — Deduplicate
  // ------------------------------------------------------------------

  const beforeDedup = allResources.length;
  let resources = deduplicate(allResources);
  const deduplicatedCount = beforeDedup - resources.length;

  // ------------------------------------------------------------------
  // Phase 5 — Filter (optional)
  // ------------------------------------------------------------------

  const beforeFilter = resources.length;

  if (options.types && options.types.length > 0) {
    resources = filterByType(resources, options.types);
  }

  if (options.minSize !== undefined && options.minSize > 0) {
    resources = resources.filter(
      (r) => r.size === 0 || r.size >= options.minSize!,
    );
  }

  const filteredCount = beforeFilter - resources.length;

  // ------------------------------------------------------------------
  // Phase 6 — Categorize
  // ------------------------------------------------------------------

  const categorized = categorizeResources(resources);

  // ------------------------------------------------------------------
  // Phase 7 — Build result
  // ------------------------------------------------------------------

  const duration = Date.now() - startTime;

  return {
    url: options.url || baseUrl,
    title: doc.title || '',
    total: resources.length,
    images: categorized.images,
    videos: categorized.videos,
    audio: categorized.audio,
    documents: categorized.documents,
    warnings,
    duration,
    timestamp: new Date().toISOString(),
    errors,
    partial: errors.length > 0,
    stats: {
      durationMs: duration,
      domNodeCount: 0,
      deduplicatedCount,
      filteredCount,
    },
  };
}

// ---------------------------------------------------------------------------
// MediaScraper class (V2)
// ---------------------------------------------------------------------------

/** Options for constructing a {@link MediaScraper}. */
export interface MediaScraperOptions {
  /** Parsers to use (defaults to 7 built-in parsers). */
  parsers?: MediaParser[];
  /** Optional filter chain. */
  filters?: FilterChain;
  /** Optional deduplicator (falls back to `deduplicate()`). */
  deduplicator?: DeduplicatorLike;
  /** Optional output configuration. */
  output?: {
    /** Base output directory for downloads. */
    dir?: string;
  };
}

/**
 * Configurable media scraper that supports custom parsers, filters,
 * and deduplication strategies.
 *
 * @example
 * ```ts
 * const scraper = new MediaScraper({
 *   parsers: [ImageParser, VideoParser],
 *   filters: new FilterChain().minResolution(200, 200),
 * });
 * const result = await scraper.scrape(doc, 'https://example.com');
 * ```
 *
 * @public
 */
export class MediaScraper {
  private readonly parsers: MediaParser[];
  private readonly filters?: FilterChain;
  private readonly deduplicator?: DeduplicatorLike;
  private readonly outputOptions?: { dir?: string };

  constructor(options: MediaScraperOptions = {}) {
    this.parsers = options.parsers ?? BUILTIN_PARSERS;
    this.filters = options.filters;
    this.deduplicator = options.deduplicator;
    this.outputOptions = options.output;
  }

  /**
   * Full batch scrape — runs all parsers and returns a complete
   * {@link ScrapeResult}.
   *
   * @param doc - The parsed DOM document.
   * @param url - The page URL.
   * @returns A promise that resolves with the scrape result.
   */
  async scrape(doc: DocumentLike, url: string): Promise<ScrapeResult> {
    const startTime = Date.now();
    const errors: ScrapeError[] = [];
    const warnings: string[] = [];

    // Separate background parser for warnings
    const bgParser = this.parsers.find((p) => p.name === 'background');
    const nonBgParsers = this.parsers.filter((p) => p.name !== 'background');

    // Extract background resources with warnings
    let bgResources: MediaResource[] = [];
    if (bgParser) {
      try {
        const bgResult = extractBackgroundImages(doc, url);
        warnings.push(...bgResult.warnings);
        bgResources = bgResult.resources;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ phase: 'background', type: 'parse', message, recoverable: true });
      }
    }

    // Stream-scrape remaining parsers
    const stream = scrapeStream(doc, url, { parsers: nonBgParsers });
    const streamResources: MediaResource[] = [];
    for await (const frame of stream) {
      streamResources.push(...frame.items);
      for (const e of frame.errors) {
        if (!errors.some((existing) => existing.phase === e.phase && existing.message === e.message)) {
          errors.push(e);
        }
      }
    }

    // Merge
    let resources: MediaResource[] = [...bgResources, ...streamResources];

    // Deduplicate
    const beforeDedup = resources.length;
    if (this.deduplicator) {
      resources = this.deduplicator.deduplicate(resources);
    } else {
      resources = deduplicate(resources);
    }
    const deduplicatedCount = beforeDedup - resources.length;

    // Filter
    const beforeFilter = resources.length;
    if (this.filters) {
      resources = this.filters.apply(resources);
    }
    const filteredCount = beforeFilter - resources.length;

    // Categorize
    const categorized = categorizeResources(resources);

    const duration = Date.now() - startTime;

    return {
      url,
      title: doc.title || '',
      total: resources.length,
      images: categorized.images,
      videos: categorized.videos,
      audio: categorized.audio,
      documents: categorized.documents,
      warnings,
      duration,
      timestamp: new Date().toISOString(),
      errors,
      partial: errors.length > 0,
      stats: {
        durationMs: duration,
        domNodeCount: 0,
        deduplicatedCount,
        filteredCount,
      },
    };
  }

  /**
   * Streaming scrape — yields results after each parser phase.
   *
   * @param doc - The parsed DOM document.
   * @param url - The page URL.
   * @returns An async generator of {@link StreamYield} frames.
   */
  async *scrapeStream(
    doc: DocumentLike,
    url: string,
  ): AsyncGenerator<StreamYield, void, unknown> {
    const parsers = this.parsers;
    if (parsers.length === 0) return;

    // Handle background parser first for warnings
    const bgParser = parsers.find((p) => p.name === 'background');
    const nonBgParsers = parsers.filter((p) => p.name !== 'background');

    const cumulative: MediaResource[] = [];

    // Background first if present
    if (bgParser) {
      let items: MediaResource[] = [];
      try {
        items = extractBackgroundImages(doc, url).resources;
      } catch {
        items = [];
      }
      cumulative.push(...items);
      yield {
        phase: bgParser.phase,
        items,
        cumulative: [...cumulative],
        progress: 1 / (parsers.length + 1),
        errors: [],
        partial: false,
        stats: {
          durationMs: Date.now() - Date.now(),
          domNodeCount: 0,
          deduplicatedCount: 0,
          filteredCount: 0,
        },
      };
    }

    // Stream remaining parsers
    const stream = scrapeStream(doc, url, { parsers: nonBgParsers });
    for await (const frame of stream) {
      // Forward the frame since it already has errors, partial, stats
      cumulative.push(...frame.items);
      yield {
        phase: frame.phase,
        items: frame.items,
        cumulative: [...cumulative],
        progress: frame.progress,
        errors: [...frame.errors],
        partial: frame.partial,
        stats: { ...frame.stats },
      };
    }
  }
}
