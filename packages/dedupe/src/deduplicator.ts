// ---------------------------------------------------------------------------
// @media-scraper/dedupe — Deduplicator (orchestrator)
// ---------------------------------------------------------------------------

import type { DeduplicationStrategy } from './types.js';
import type { MediaResource } from '@media-scraper/core';

/**
 * Applies a sequence of deduplication strategies to a list of media
 * resources.  Strategies are applied in order.  Within each strategy,
 * resources with identical fingerprints are considered duplicates and
 * only the first occurrence is kept.
 *
 * Resource fingerprints are cached so each resource is evaluated at
 * most once per strategy.
 */
export class Deduplicator {
  private readonly _strategies: ReadonlyArray<DeduplicationStrategy>;
  private _removed: MediaResource[] = [];

  constructor(strategies: DeduplicationStrategy[]) {
    this._strategies = [...strategies];
  }

  /**
   * Run deduplication on the given resources.
   *
   * @returns The deduplicated list of resources (first occurrences only).
   */
  deduplicate(resources: MediaResource[]): MediaResource[] {
    this._removed = [];

    if (this._strategies.length === 0 || resources.length === 0) {
      return [...resources];
    }

    // We'll work on a copy so we can remove items without mutating the input.
    let working = resources.slice();

    for (const strategy of this._strategies) {
      const seen = new Map<string, MediaResource>();
      const kept: MediaResource[] = [];

      for (const resource of working) {
        const fp = strategy.fingerprint(resource);
        if (seen.has(fp)) {
          this._removed.push(resource);
        } else {
          seen.set(fp, resource);
          kept.push(resource);
        }
      }

      working = kept;
    }

    return working;
  }

  /** Resources removed during the last {@link deduplicate} call. */
  getRemoved(): MediaResource[] {
    return this._removed;
  }
}
