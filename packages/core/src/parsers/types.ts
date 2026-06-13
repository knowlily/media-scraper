// ---------------------------------------------------------------------------
// @media-scraper/core — MediaParser interface
// ---------------------------------------------------------------------------

import type { MediaResource, MediaType, DocumentLike } from '../types.js';

/**
 * A pluggable parser that extracts a specific type of media from a DOM.
 *
 * Parsers are ordered by `phase` (ascending) and executed in sequence
 * during a scrape.  Each parser is responsible for a single media type
 * (images, videos, audio, etc.) and delegates to the corresponding
 * extractor function.
 */
export interface MediaParser {
  /** Human-readable parser name (e.g. "image", "video"). */
  name: string;
  /** The media type this parser produces. */
  mediaType: MediaType;
  /** Execution order — lower numbers run first. */
  phase: number;
  /**
   * Extract media resources from the document.
   *
   * @param doc - The parsed DOM document.
   * @param baseUrl - The base URL of the page.
   * @returns An array of discovered media resources.
   */
  extract(doc: DocumentLike, baseUrl: string): MediaResource[];
}
