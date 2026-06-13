// ---------------------------------------------------------------------------
// @media-scraper/core — AudioParser
// ---------------------------------------------------------------------------

import type { MediaParser } from './types.js';
import type { DocumentLike, MediaResource } from '../types.js';
import { extractAudio } from '../extractors/audio.js';

/**
 * Parser for <audio> elements and their <source> children.
 *
 * Phase 5 — extracts audio file URLs.
 * Delegates entirely to {@link extractAudio}.
 */
export const AudioParser: MediaParser = {
  name: 'audio',
  mediaType: 'audio',
  phase: 5,
  extract(doc: DocumentLike, baseUrl: string): MediaResource[] {
    return extractAudio(doc, baseUrl);
  },
};
