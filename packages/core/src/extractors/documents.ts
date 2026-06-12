// ---------------------------------------------------------------------------
// @media-scraper/core — document extractor
// ---------------------------------------------------------------------------

import type { DocumentLike, ElementLike, MediaResource } from '../types.js';
import { generateId, extractFilename, getExtension } from '../utils.js';

/** Document / archive file extensions to match on `<a href>` links. */
const DOCUMENT_EXTENSIONS = new Set([
  '.pdf',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.epub', '.mobi',
]);

/**
 * Build a document {@link MediaResource} from a resolved URL.
 */
function makeDocumentResource(url: string): MediaResource {
  return {
    id: generateId(),
    url,
    type: 'document',
    filename: extractFilename(url),
    extension: getExtension(url),
    size: 0,
    width: 0,
    height: 0,
    thumbnail: '',
    source: 'link',
  };
}

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
        results.push(makeDocumentResource(resolved));
      }
    } catch {
      // skip unparseable URLs
    }
  }

  return results;
}
