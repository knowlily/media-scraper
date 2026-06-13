// ---------------------------------------------------------------------------
// @media-scraper/core — ImageParser
// ---------------------------------------------------------------------------

import type { MediaParser } from './types.js';
import type { DocumentLike, MediaResource } from '../types.js';
import { extractImages } from '../extractors/images.js';

/**
 * Parser for standard image elements (<img>, <picture>, SVG <image>, etc.).
 *
 * Phase 1 — runs first as images are the most common media type.
 * Delegates entirely to {@link extractImages}.
 */
export const ImageParser: MediaParser = {
  name: 'image',
  mediaType: 'image',
  phase: 1,
  extract(doc: DocumentLike, baseUrl: string): MediaResource[] {
    return extractImages(doc, baseUrl);
  },
};
