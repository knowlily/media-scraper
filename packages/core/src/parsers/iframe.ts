// ---------------------------------------------------------------------------
// @media-scraper/core — IframeParser
// ---------------------------------------------------------------------------

import type { MediaParser } from './types.js';
import type { DocumentLike, MediaResource } from '../types.js';
import { extractIframeMedia } from '../extractors/iframes.js';

/**
 * Parser for media discovered via <iframe> elements.
 *
 * Phase 3 — examines `<iframe src>` and records known platform
 * embeds as video resources.
 * Delegates entirely to {@link extractIframeMedia}.
 */
export const IframeParser: MediaParser = {
  name: 'iframe',
  mediaType: 'video',
  phase: 3,
  extract(doc: DocumentLike, baseUrl: string): MediaResource[] {
    return extractIframeMedia(doc, baseUrl);
  },
};
