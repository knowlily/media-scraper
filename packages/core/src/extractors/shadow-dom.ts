// ---------------------------------------------------------------------------
// @media-scraper/core — Shadow DOM media extractor
// ---------------------------------------------------------------------------

import type { ElementLike, MediaResource, MediaType } from '../types.js';
import { generateId, extractFilename, getExtension, isMediaUrl } from '../utils.js';

/**
 * Build a {@link MediaResource} for media discovered inside Shadow DOM.
 */
function makeShadowResource(
  resolved: string,
  type: 'image' | 'video' | 'audio' | 'document' | 'unknown',
): MediaResource {
  return {
    id: generateId(),
    url: resolved,
    type,
    filename: extractFilename(resolved),
    extension: getExtension(resolved),
    size: 0,
    width: 0,
    height: 0,
    thumbnail: '',
    source: 'shadow-dom',
  };
}

/**
 * Recursively scan an element tree for media-bearing nodes.
 *
 * Looks at `<img>`, `<video>`, `<audio>`, `<source>`, and `<a>` elements.
 * Only checks the elements that are directly reachable via `querySelectorAll`
 * — actual Shadow DOM children **must** be supplied by the caller through the
 * `walkShadowFn` callback.
 */
function scanTree(
  root: ElementLike,
  baseUrl: string,
  walkShadowFn: ((el: ElementLike) => ElementLike[]) | undefined,
  results: MediaResource[],
  seen: Set<string>,
): void {
  const add = (rawUrl: string, hint?: MediaType): void => {
    if (!rawUrl) return;
    try {
      const resolved = new URL(rawUrl, baseUrl).href;
      if (seen.has(resolved)) return;
      seen.add(resolved);
      const type = hint ?? isMediaUrl(resolved) ?? 'unknown';
      results.push(makeShadowResource(resolved, type));
    } catch {
      // skip unparseable URLs
    }
  };

  // Collect all elements in the current light-DOM subtree.
  const all: ElementLike[] = root.querySelectorAll('*');

  // Always include the root itself (it might not match `*` if it has no tagName).
  const elements = [root, ...all];

  for (const el of elements) {
    const tag = (el.tagName || '').toLowerCase();

    switch (tag) {
      case 'img': {
        const src = el.getAttribute('src');
        if (src) add(src);
        // Also check data-src / data-original for lazy-loaded images
        const dataSrc = el.getAttribute('data-src') ?? el.getAttribute('data-original');
        if (dataSrc) add(dataSrc);
        break;
      }

      case 'video': {
        const src = el.getAttribute('src');
        if (src) add(src, 'video');
        const poster = el.getAttribute('poster');
        if (poster) add(poster, 'image');
        const sources = el.querySelectorAll('source');
        for (const s of sources) {
          const sSrc = s.getAttribute('src');
          if (sSrc) add(sSrc, 'video');
        }
        break;
      }
      case 'audio': {
        const src = el.getAttribute('src');
        if (src) add(src, 'audio');
        const sources = el.querySelectorAll('source');
        for (const s of sources) {
          const sSrc = s.getAttribute('src');
          if (sSrc) add(sSrc, 'audio');
        }
        break;
      }

      case 'source': {
        const src = el.getAttribute('src');
        if (src) add(src, 'video');
        break;
      }

      case 'a': {
        const href = el.getAttribute('href');
        if (href && !href.startsWith('#') && !/^javascript:/i.test(href)) {
          add(href);
        }
        break;
      }

      default:
        break;
    }

    // If the caller supplied a Shadow DOM walker, descend into shadow roots.
    if (walkShadowFn) {
      const shadowChildren = walkShadowFn(el);
      for (const shadowChild of shadowChildren) {
        scanTree(shadowChild, baseUrl, walkShadowFn, results, seen);
      }
    }
  }
}

/**
 * Extract media from Shadow DOM trees reachable from a root element.
 *
 * The core package has no access to `element.shadowRoot` (that is a browser /
 * DOM-implementation concern).  Callers **must** supply a `walkShadowFn`
 * callback that, given an element, returns the children of its Shadow DOM
 * root (or an empty array when there is no shadow root).
 *
 * Without `walkShadowFn` the function only scans the light-DOM subtree of
 * `root` and returns an empty array (because light-DOM media is handled by
 * the other specialised extractors).
 *
 * @param root  - The root element to start scanning from.
 * @param baseUrl - The base URL of the page (used to resolve relative URLs).
 * @param walkShadowFn - Optional callback: `(el) => shadowRootChildren[]`.
 *   When omitted (or `undefined`) Shadow DOM is **not** traversed.
 * @returns An array of discovered Shadow DOM {@link MediaResource} objects.
 *
 * @example
 * ```ts
 * // Browser-based call:
 * const resources = extractShadowDomMedia(document.body, pageUrl, (el) => {
 *   const root = (el as HTMLElement).shadowRoot;
 *   return root ? Array.from(root.children) as any[] : [];
 * });
 * ```
 *
 * @public
 */
export function extractShadowDomMedia(
  root: ElementLike,
  baseUrl: string,
  walkShadowFn?: (el: ElementLike) => ElementLike[],
): MediaResource[] {
  const results: MediaResource[] = [];
  const seen = new Set<string>();

  scanTree(root, baseUrl, walkShadowFn, results, seen);

  return results;
}
