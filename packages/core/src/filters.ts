// ---------------------------------------------------------------------------
// @media-scraper/core — filters
// ---------------------------------------------------------------------------

import type { MediaResource, MediaType, FilterOptions } from './types.js';

/**
 * Remove exact-duplicate resources (matched by URL).
 *
 * @param resources - The list of resources to deduplicate.
 * @returns A new array containing only the first occurrence of each unique URL.
 *
 * @public
 */
export function deduplicate(resources: MediaResource[]): MediaResource[] {
  const seen = new Set<string>();
  return resources.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

/**
 * Keep only resources whose `type` matches one of the given types.
 *
 * @param resources - The resources to filter.
 * @param types - Permitted media types.
 * @returns A new array with resources matching the whitelist.
 *
 * @public
 */
export function filterByType(
  resources: MediaResource[],
  types: MediaType[],
): MediaResource[] {
  const set = new Set(types);
  return resources.filter((r) => set.has(r.type));
}

/**
 * Keep only resources that meet minimum dimension thresholds.
 *
 * Resources with `width` or `height` equal to `0` (unknown) are retained
 * unless a positive minimum is specified for that axis.
 *
 * @param resources - The resources to filter.
 * @param minWidth - Minimum width in pixels (omit to skip check).
 * @param minHeight - Minimum height in pixels (omit to skip check).
 * @returns A new array with resources meeting the size criteria.
 *
 * @public
 */
export function filterBySize(
  resources: MediaResource[],
  minWidth?: number,
  minHeight?: number,
): MediaResource[] {
  return resources.filter((r) => {
    if (minWidth !== undefined && r.width > 0 && r.width < minWidth) {
      return false;
    }
    if (minHeight !== undefined && r.height > 0 && r.height < minHeight) {
      return false;
    }
    return true;
  });
}

/**
 * Keep only resources whose URL hostname matches the given domain.
 *
 * Matching is case-insensitive and includes subdomains (e.g. `example.com`
 * matches both `example.com` and `cdn.example.com`).
 *
 * @param resources - The resources to filter.
 * @param domain - The domain to match (without protocol or path).
 * @returns A new array with resources belonging to the specified domain.
 *
 * @public
 */
export function filterByDomain(
  resources: MediaResource[],
  domain: string,
): MediaResource[] {
  const suffix = domain.toLowerCase();
  return resources.filter((r) => {
    try {
      const host = new URL(r.url).hostname.toLowerCase();
      return host === suffix || host.endsWith(`.${suffix}`);
    } catch {
      return false;
    }
  });
}

/**
 * Apply a complete set of filter options to a resource list.
 *
 * Convenience wrapper that calls each filter in sequence.  All filters are
 * applied regardless of intermediate results (they compose).
 *
 * @param resources - The resources to filter.
 * @param options - Filter criteria.
 * @returns A new array with resources that pass all specified filters.
 *
 * @public
 */
export function applyFilters(
  resources: MediaResource[],
  options: FilterOptions,
): MediaResource[] {
  let result = resources;

  if (options.types && options.types.length > 0) {
    result = filterByType(result, options.types);
  }

  if (options.minWidth !== undefined || options.minHeight !== undefined) {
    result = filterBySize(result, options.minWidth, options.minHeight);
  }

  if (options.minSize !== undefined) {
    result = result.filter((r) => r.size === 0 || r.size >= options.minSize!);
  }

  if (options.domain) {
    result = filterByDomain(result, options.domain);
  }

  if (options.excludeExtensions && options.excludeExtensions.length > 0) {
    const exclude = new Set(
      options.excludeExtensions.map((e) => e.toLowerCase()),
    );
    result = result.filter((r) => !exclude.has(r.extension.toLowerCase()));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Filename sanitisation
// ---------------------------------------------------------------------------

/** Characters that are illegal in Windows file names. */
const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/** Maximum filename length in bytes (conservative, matches common filesystems). */
const MAX_BYTES = 255;

/**
 * Sanitise a string so it can be safely used as a file name.
 *
 * Removes path traversal sequences, strips Windows-illegal characters,
 * collapses whitespace, and truncates to 255 bytes.
 *
 * @param name - The raw filename to sanitise.
 * @returns A safe filename string.
 *
 * @public
 */
export function sanitizeFilename(name: string): string {
  // 1. Strip any directory traversal
  let clean = name.replace(/^.*[\\/]/, '');

  // 2. Remove illegal characters
  clean = clean.replace(ILLEGAL_CHARS, '');

  // 3. Collapse consecutive dots / spaces
  clean = clean.replace(/\.{2,}/g, '.');
  clean = clean.trim().replace(/\s+/g, ' ');

  // 4. Ensure we have a non-empty result
  if (clean.length === 0 || clean === '.') {
    clean = 'untitled';
  }

  // 5. Truncate to 255 bytes (UTF-8)
  const encoder = new TextEncoder();
  let encoded = encoder.encode(clean);
  if (encoded.length > MAX_BYTES) {
    // Decode back, slicing at the byte boundary that keeps valid UTF-8
    const sliced = encoded.slice(0, MAX_BYTES);
    // Walk backwards to avoid splitting a multi-byte sequence
    let end = sliced.length;
    while (end > 0 && (sliced[end - 1] & 0xc0) === 0x80) {
      end--;
    }
    clean = new TextDecoder().decode(sliced.slice(0, end));
  }

  return clean;
}
