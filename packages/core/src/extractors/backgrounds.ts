// ---------------------------------------------------------------------------
// @media-scraper/core — background image extractor
// ---------------------------------------------------------------------------

import type { DocumentLike, ElementLike, MediaResource } from '../types.js';
import { generateId, extractFilename, getExtension } from '../utils.js';

/**
 * Maximum number of elements to scan for inline `style` attributes.
 * Prevents runaway extraction on enormous pages.
 */
const MAX_ELEMENTS = 2000;

/**
 * Regex that matches CSS `url(...)` tokens.
 *
 * Handles:
 * - `url("...")` – double-quoted
 * - `url('...')` – single-quoted
 * - `url(...)`   – unquoted (no whitespace inside parens)
 *
 * Does NOT match `url()` with an empty argument.
 */
const URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g;

/**
 * Tokens that indicate a CSS gradient or other non-image function.
 * When the `url()` is immediately preceded by one of these keywords we
 * treat it as part of a gradient and skip it.
 */
const GRADIENT_KEYWORDS = /(?:linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient|repeating-conic-gradient)\s*\([^)]*$/i;

/**
 * Value prefixes that indicate the entire declaration is a gradient
 * (no `url()` to extract). We skip these declarations wholesale.
 */
const GRADIENT_PREFIX = /^\s*(?:linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient|repeating-conic-gradient)/i;

/**
 * Build a background-image {@link MediaResource} from a resolved URL.
 */
function makeBackgroundResource(url: string): MediaResource {
  return {
    id: generateId(),
    url,
    type: 'image',
    filename: extractFilename(url),
    extension: getExtension(url),
    size: 0,
    width: 0,
    height: 0,
    thumbnail: '',
    source: 'background',
  };
}

/**
 * Walk all elements (breadth-first via wildcard selector, up to
 * {@link MAX_ELEMENTS}) and extract image URLs from inline `style`
 * attributes that contain `background-image` or `background` shorthand.
 *
 * Skipped content:
 * - `data:` URIs
 * - Gradient functions (`linear-gradient`, `radial-gradient`, etc.)
 * - CSS variables (`var(--...)`)
 *
 * @param root - The root element to walk (typically `document.body`).
 * @param baseUrl - Base URL for resolving relative URLs.
 * @param results - Accumulator array (mutated in place).
 * @param seen - Set of already-seen absolute URLs (mutated in place).
 */
function walkElements(
  root: ElementLike,
  baseUrl: string,
  results: MediaResource[],
  seen: Set<string>,
): void {
  // Collect all descendant elements via universal selector.
  const all: ElementLike[] = root.querySelectorAll('*');
  const limit = Math.min(all.length, MAX_ELEMENTS);

  for (let i = 0; i < limit; i++) {
    const el = all[i];
    const style = el.getAttribute('style');
    if (!style) continue;

    // Quick-reject: no `url(` substring at all?
    if (style.indexOf('url(') === -1) continue;

    // Split on semicolons to isolate individual declarations.  A single
    // `style` attribute may set many properties; we only care about
    // `background-image` and `background`.
    const declarations = style.split(';');
    for (const decl of declarations) {
      const trimmed = decl.trim();
      if (!trimmed) continue;

      const lower = trimmed.toLowerCase();

      // Only process background-related properties.
      const isBgImage =
        lower.startsWith('background-image:') ||
        lower.startsWith('background:');

      if (!isBgImage) continue;

      // If the value after the colon is a gradient, skip entirely.
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;
      const value = trimmed.slice(colonIdx + 1);

      if (GRADIENT_PREFIX.test(value)) continue;

      // Extract every url() from this declaration.
      URL_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = URL_RE.exec(value)) !== null) {
        // Each match has captures at index 1 (double-quoted), 2 (single-quoted),
        // or 3 (unquoted).  Exactly one will be defined.
        const raw = match[1] ?? match[2] ?? match[3];
        if (!raw) continue;

        // Skip data: URIs and CSS variables
        const lowerRaw = raw.toLowerCase();
        if (lowerRaw.startsWith('data:')) continue;
        if (lowerRaw.startsWith('var(')) continue;

        // Check that we aren't inside a gradient function.
        // The preceding characters of the value up to `match.index` are
        // the context; if they end with a gradient function name, skip.
        const preceding = value.slice(0, match.index);
        if (GRADIENT_KEYWORDS.test(preceding)) continue;

        try {
          const resolved = new URL(raw, baseUrl).href;
          if (seen.has(resolved)) continue;
          seen.add(resolved);
          results.push(makeBackgroundResource(resolved));
        } catch {
          // skip unparseable URLs
        }
      }
    }
  }
}

/**
 * Extract background images from inline `style` attributes on all elements
 * in the document.
 *
 * Scans up to {@link MAX_ELEMENTS} elements for `background-image` and
 * `background` CSS declarations.  Handles:
 * - Quoted and unquoted `url()` arguments
 * - Multiple comma-separated URLs inside a single `background-image`
 * - Skipping `data:` URIs and gradient functions
 *
 * @param doc  - The document to extract from.
 * @param baseUrl - The base URL of the page (used to resolve relative URLs).
 * @returns An array of discovered background-image {@link MediaResource} objects.
 *
 * @public
 */
export function extractBackgroundImages(
  doc: DocumentLike,
  baseUrl: string,
): MediaResource[] {
  const results: MediaResource[] = [];
  const seen = new Set<string>();

  // Start from the body if available; otherwise fall back to the document root.
  const startEl: ElementLike | null = doc.body ?? doc.querySelector('body');
  if (startEl) {
    walkElements(startEl, baseUrl, results, seen);
  }

  return results;
}
