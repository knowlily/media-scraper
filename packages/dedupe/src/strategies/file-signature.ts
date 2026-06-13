// ---------------------------------------------------------------------------
// @media-scraper/dedupe — FileSignatureStrategy
// ---------------------------------------------------------------------------

import type { DeduplicationStrategy } from '../types.js';
import type { MediaResource } from '@media-scraper/core';

/**
 * Strategy that fingerprints a resource by its file-level identity:
 *
 * ┌─────────────────────────────────────────────┐
 * │  last-two-path-dirs / filename + extension   │
 * └─────────────────────────────────────────────┘
 *
 * The fingerprint is derived from the URL *path only* (protocol, host, query,
 * and hash are ignored).  The last two directory segments are extracted from
 * the path; if only one segment exists it is used alone.  This makes resources
 * that served the same file from different CDNs / mirrors produce the same
 * fingerprint.
 *
 * Examples:
 *   https://cdn1.example.com/images/2024/hero.jpg  →  images/2024/hero.jpg
 *   https://cdn2.example.com/images/2024/hero.jpg  →  images/2024/hero.jpg  (same!)
 *   https://cdn1.example.com/photos/2023/banner.png → photos/2023/banner.png
 */
export class FileSignatureStrategy implements DeduplicationStrategy {
  readonly name = 'file-signature';

  fingerprint(resource: MediaResource): string {
    try {
      const url = new URL(resource.url);
      const pathname = url.pathname;

      // Split into segments, filtering out empty strings
      const segments = pathname.split('/').filter(Boolean);

      if (segments.length === 0) {
        // Root path — use host+root as signature
        return `${url.hostname}/`;
      }

      // Extract filename (last segment, strip query)
      const lastSegment = segments[segments.length - 1] ?? '';

      // Get the last two directory segments (or fewer)
      const dirSegments = segments.slice(
        Math.max(0, segments.length - 3),
        segments.length - 1,
      );

      return [...dirSegments, lastSegment].join('/');
    } catch {
      // Invalid URL — fall back to the raw string
      return resource.url;
    }
  }
}
