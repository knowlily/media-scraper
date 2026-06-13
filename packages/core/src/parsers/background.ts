// ---------------------------------------------------------------------------
// @media-scraper/core — BackgroundParser
// ---------------------------------------------------------------------------

import type { MediaParser } from './types.js';
import type { DocumentLike, MediaResource } from '../types.js';
import { extractBackgroundImages } from '../extractors/backgrounds.js';

/**
 * Parser for CSS background images.
 *
 * Phase 2 — extracts URLs from `background-image` and `background` CSS
 * declarations on inline `style` attributes.
 * Delegates entirely to {@link extractBackgroundImages}.
 */
export const BackgroundParser: MediaParser = {
  name: 'background',
  mediaType: 'image',
  phase: 2,
  extract(doc: DocumentLike, baseUrl: string): MediaResource[] {
    return extractBackgroundImages(doc, baseUrl).resources;
  },
};
