// ---------------------------------------------------------------------------
// @media-scraper/core — ShadowParser
// ---------------------------------------------------------------------------

import type { MediaParser } from './types.js';
import type { DocumentLike, MediaResource } from '../types.js';
import { extractShadowDomMedia } from '../extractors/shadow-dom.js';

/**
 * Parser for media discovered inside Shadow DOM trees.
 *
 * Phase 7 — traverses open shadow roots and extracts media from
 * within them.  May produce resources of multiple types.
 * Delegates entirely to {@link extractShadowDomMedia}.
 */
export const ShadowParser: MediaParser = {
  name: 'shadow-dom',
  mediaType: 'mixed',
  phase: 7,
  extract(doc: DocumentLike, baseUrl: string): MediaResource[] {
    return (extractShadowDomMedia as unknown as (doc: DocumentLike, baseUrl: string) => MediaResource[])(doc, baseUrl);
  },
};
