// ---------------------------------------------------------------------------
// @media-scraper/core — document extractor
// ---------------------------------------------------------------------------

import type { DocumentLike, ElementLike, MediaResource } from '../types.js';
import { getExtension } from '../utils.js';
import { makeResource, DOCUMENT_EXTENSIONS } from './helpers.js';

/**
 * Extract document download links from a DOM-like document.
 *
 * Walks every `<a href>` element and keeps those whose extension matches
 * known document or archive formats. Same-page anchors (`#`) and
 * `javascript:` pseudo-URLs are explicitly skipped.
 *
 * @param doc  - The document to extract from.
 * @param baseUrl - The base URL of the page (used to resolve relative URLs).
 * @returns An array of discovered document {@link MediaResource} objects.
 *
 * @public
 */
export function extractDocuments(doc: DocumentLike, baseUrl: string): MediaResource[] {
  const results: MediaResource[] = [];
  const seen = new Set<string>();

  const anchors: ElementLike[] = doc.querySelectorAll('a');
  for (const a of anchors) {
    const href = a.getAttribute('href');
    if (!href) continue;

    const trimmed = href.trim();
    if (!trimmed) continue;

    // Discard same-page anchors
    if (trimmed.startsWith('#')) continue;

    // Discard javascript: pseudo-URLs
    if (/^javascript:/i.test(trimmed)) continue;

    try {
      const resolved = new URL(trimmed, baseUrl).href;
      const ext = getExtension(resolved);
      if (ext && DOCUMENT_EXTENSIONS.has(ext)) {
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        results.push(makeResource(resolved, 'document', 'link'));
      }
    } catch {
      // skip unparseable URLs
    }
  }

  return results;
}
