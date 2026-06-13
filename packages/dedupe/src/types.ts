// ---------------------------------------------------------------------------
// @media-scraper/dedupe — types
// ---------------------------------------------------------------------------

import type { MediaResource } from '@media-scraper/core';

/**
 * A strategy that computes a fingerprint for a media resource.
 *
 * Strategies with the same name are grouped — within a single strategy,
 * resources with identical fingerprints are considered duplicates, and
 * only the first occurrence is kept.
 */
export interface DeduplicationStrategy {
  /** Human-readable strategy name (e.g. 'normalized-url'). */
  readonly name: string;
  /**
   * Compute a fingerprint string for the given resource.
   *
   * Resources with identical fingerprints (within the same strategy)
   * are considered duplicates; only the first is retained.
   */
  fingerprint(resource: MediaResource): string;
}
