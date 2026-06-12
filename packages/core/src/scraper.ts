// ---------------------------------------------------------------------------
// @media-scraper/core — main scraper orchestrator
// ---------------------------------------------------------------------------

import type {
  DocumentLike,
  MediaResource,
  ScrapeOptions,
  ScrapeResult,
} from './types.js';

import { extractImages } from './extractors/images.js';
import { extractVideos } from './extractors/videos.js';
import { extractAudio } from './extractors/audio.js';
import { extractDocuments } from './extractors/documents.js';
import { extractBackgroundImages } from './extractors/backgrounds.js';
import { extractIframeMedia } from './extractors/iframes.js';
import { extractShadowDomMedia } from './extractors/shadow-dom.js';

import { deduplicate, filterByType } from './filters.js';

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
 * @returns The resources extracted, or an empty array if the extractor threw.
 *
 * @internal
 */
function safeExtract(
  name: string,
  fn: (...args: unknown[]) => MediaResource[],
  ...args: unknown[]
): MediaResource[] {
  try {
    return fn(...args);
  } catch (err) {
    console.error(`[media-scraper] ${name} extractor failed:`, err);
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

  // ------------------------------------------------------------------
  // Phase 1 — Extract (P0 → P1 → P2 priority order)
  // ------------------------------------------------------------------

  const allResources: MediaResource[] = [
    // P0 — primary images
    ...safeExtract(
      'images',
      extractImages as (...args: unknown[]) => MediaResource[],
      doc,
      baseUrl,
    ),
    // P1 — high-value secondary sources
    ...safeExtract(
      'videos',
      extractVideos as (...args: unknown[]) => MediaResource[],
      doc,
      baseUrl,
    ),
    ...safeExtract(
      'background-images',
      extractBackgroundImages as (...args: unknown[]) => MediaResource[],
      doc,
      baseUrl,
    ),
    ...safeExtract(
      'iframe-media',
      extractIframeMedia as (...args: unknown[]) => MediaResource[],
      doc,
      baseUrl,
    ),
    // P2 — remaining sources
    ...safeExtract(
      'audio',
      extractAudio as (...args: unknown[]) => MediaResource[],
      doc,
      baseUrl,
    ),
    ...safeExtract(
      'documents',
      extractDocuments as (...args: unknown[]) => MediaResource[],
      doc,
      baseUrl,
    ),
    ...safeExtract(
      'shadow-dom',
      extractShadowDomMedia as (...args: unknown[]) => MediaResource[],
      doc,
      baseUrl,
    ),
  ];

  // ------------------------------------------------------------------
  // Phase 2 — Deduplicate
  // ------------------------------------------------------------------

  let resources = deduplicate(allResources);

  // ------------------------------------------------------------------
  // Phase 3 — Filter (optional)
  // ------------------------------------------------------------------

  if (options.types && options.types.length > 0) {
    resources = filterByType(resources, options.types);
  }

  if (options.minSize !== undefined && options.minSize > 0) {
    resources = resources.filter(
      (r) => r.size === 0 || r.size >= options.minSize!,
    );
  }

  // ------------------------------------------------------------------
  // Phase 4 — Categorize
  // ------------------------------------------------------------------

  const categorized = categorizeResources(resources);

  // ------------------------------------------------------------------
  // Phase 5 — Build result
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
    duration,
    timestamp: new Date().toISOString(),
  };
}
