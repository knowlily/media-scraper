// ---------------------------------------------------------------------------
// @media-scraper/dedupe — NormalizedURLStrategy
// ---------------------------------------------------------------------------

import type { DeduplicationStrategy } from '../types.js';
import type { MediaResource } from '@media-scraper/core';

/**
 * Tracking / noise query parameters that are stripped during URL
 * normalisation. Case-insensitive matching.
 */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  '_t',
  'token',
  'timestamp',
  '_',
  't',
  'rand',
  'r',
  'ver',
  'v',
]);

/**
 * Remove known tracking/noise parameters from a query string and return
 * the remaining parameters as a sorted, stable string.
 */
function stripTrackingParams(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of Array.from(params.keys())) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      params.delete(key);
    }
  }
  params.sort();
  return params.toString();
}

/**
 * Strategy that normalises a resource's URL by:
 *
 * 1. Upgrading `http://` → `https://`
 * 2. Stripping known tracking / noise query parameters
 * 3. Removing trailing slashes from the path
 *
 * Returns the normalised URL as the fingerprint.
 */
export class NormalizedURLStrategy implements DeduplicationStrategy {
  readonly name = 'normalized-url';

  fingerprint(resource: MediaResource): string {
    try {
      const url = new URL(resource.url);
      // Normalise protocol
      url.protocol = 'https:';
      // Strip tracking params
      url.search = stripTrackingParams(url.search);
      // Remove trailing slash (but keep root '/')
      if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1);
      }
      return url.toString();
    } catch {
      // Invalid URL — fall back to raw string
      return resource.url;
    }
  }
}
