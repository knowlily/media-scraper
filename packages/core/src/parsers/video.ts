// ---------------------------------------------------------------------------
// @media-scraper/core — VideoParser
// ---------------------------------------------------------------------------

import type { MediaParser } from './types.js';
import type { DocumentLike, MediaResource } from '../types.js';
import { extractVideos } from '../extractors/videos.js';

/**
 * Parser for <video> elements and their <source> children.
 *
 * Phase 4 — extracts video URLs including HLS (.m3u8) and DASH (.mpd)
 * manifests.
 * Delegates entirely to {@link extractVideos}.
 */
export const VideoParser: MediaParser = {
  name: 'video',
  mediaType: 'video',
  phase: 4,
  extract(doc: DocumentLike, baseUrl: string): MediaResource[] {
    return extractVideos(doc, baseUrl);
  },
};
