// ---------------------------------------------------------------------------
// @media-scraper/core — DocumentParser
// ---------------------------------------------------------------------------

import type { MediaParser } from './types.js';
import type { DocumentLike, MediaResource } from '../types.js';
import { extractDocuments } from '../extractors/documents.js';

/**
 * Parser for document links (<a href> that point to PDF, DOC, etc.).
 *
 * Phase 6 — extracts document file URLs from anchor elements.
 * Delegates entirely to {@link extractDocuments}.
 */
export const DocumentParser: MediaParser = {
  name: 'document',
  mediaType: 'document',
  phase: 6,
  extract(doc: DocumentLike, baseUrl: string): MediaResource[] {
    return extractDocuments(doc, baseUrl);
  },
};
