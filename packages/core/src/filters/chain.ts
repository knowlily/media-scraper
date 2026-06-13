// ---------------------------------------------------------------------------
// @media-scraper/core — FilterChain
// ---------------------------------------------------------------------------

import type { MediaResource } from '../types.js';

type FilterFn = (resources: MediaResource[]) => MediaResource[];
type SortFn = 'resolution-desc' | 'size-desc' | 'format-priority';

/**
 * Chainable filter pipeline for post-extraction resource processing.
 *
 * Build filters with chainable methods and call `apply()` to execute
 * the pipeline.  Filters are stored as ordered functions and invoked
 * in sequence when `apply()` is called.
 *
 * @example
 * ```ts
 * const result = new FilterChain()
 *   .minResolution(100, 100)
 *   .excludeTracking()
 *   .sort('resolution-desc')
 *   .apply(resources);
 * ```
 */
export class FilterChain {
  private readonly steps: FilterFn[] = [];
  private sortFn: SortFn | null = null;

  /**
   * Keep only resources with resolution at or above the given dimensions.
   *
   * Resources with unknown dimensions (width=0 or height=0) are retained.
   */
  minResolution(width: number, height: number): this {
    this.steps.push((resources) =>
      resources.filter((r) => {
        if (r.width === 0 || r.height === 0) return true;
        return r.width >= width && r.height >= height;
      }),
    );
    return this;
  }

  /**
   * Keep only resources with resolution at or below the given dimensions.
   *
   * Resources with unknown dimensions (width=0 or height=0) are retained.
   */
  maxResolution(width: number, height: number): this {
    this.steps.push((resources) =>
      resources.filter((r) => {
        if (r.width === 0 || r.height === 0) return true;
        return r.width <= width && r.height <= height;
      }),
    );
    return this;
  }

  /**
   * Keep only resources with file size at or above the given byte count.
   *
   * Resources with unknown size (size=0) are retained.
   */
  minFileSize(bytes: number): this {
    this.steps.push((resources) =>
      resources.filter((r) => r.size === 0 || r.size >= bytes),
    );
    return this;
  }

  /**
   * Keep only resources with file size at or below the given byte count.
   *
   * Resources with unknown size (size=0) are retained.
   */
  maxFileSize(bytes: number): this {
    this.steps.push((resources) =>
      resources.filter((r) => r.size === 0 || r.size <= bytes),
    );
    return this;
  }

  /**
   * Exclude resources whose file extension matches any in the given list.
   *
   * Matching is case-insensitive.  Extensions should include the dot
   * (e.g. `".gif"`, `".svg"`).
   */
  excludeExtensions(exts: string[]): this {
    const lower = exts.map((e) => e.toLowerCase());
    this.steps.push((resources) =>
      resources.filter((r) => !lower.includes(r.extension.toLowerCase())),
    );
    return this;
  }

  /**
   * When the same URL exists in multiple formats, keep only the
   * highest-priority format.
   *
   * Formats appearing earlier in the list have higher priority.
   * Resources with unknown or unlisted extensions are kept as-is.
   *
   * Format examples: `["webp", "avif", "png", "jpg"]`
   */
  preferredFormats(formats: string[]): this {
    const rank = new Map<string, number>();
    formats.forEach((fmt, i) => rank.set(fmt.toLowerCase(), i));

    this.steps.push((resources) => {
      // Group by URL stem (URL without its final extension)
      const groups = new Map<string, MediaResource[]>();
      for (const r of resources) {
        const stem = r.extension
          ? r.url.slice(0, r.url.length - r.extension.length)
          : r.url;
        const list = groups.get(stem);
        if (list) {
          list.push(r);
        } else {
          groups.set(stem, [r]);
        }
      }

      const result: MediaResource[] = [];
      for (const [, group] of groups) {
        if (group.length === 1) {
          result.push(group[0]);
          continue;
        }

        // Pick the resource with the highest-ranked extension
        let best = group[0];
        let bestRank = rank.get(group[0].extension.toLowerCase()) ?? Infinity;
        for (const r of group) {
          const extRank = rank.get(r.extension.toLowerCase());
          if (extRank !== undefined && extRank < bestRank) {
            best = r;
            bestRank = extRank;
          }
        }
        result.push(best);
      }
      return result;
    });
    return this;
  }

  /**
   * Exclude 1x1 pixel tracking images.
   *
   * Removes resources whose `width` and `height` are both exactly 1.
   * Resources with unknown dimensions are NOT excluded.
   */
  excludeTracking(): this {
    this.steps.push((resources) =>
      resources.filter((r) => !(r.width === 1 && r.height === 1)),
    );
    return this;
  }

  /**
   * Exclude resources whose URL matches the given pattern.
   *
   * @param pattern - A string (substring match) or RegExp to test against URLs.
   */
  exclude(pattern: RegExp | string): this {
    const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    this.steps.push((resources) =>
      resources.filter((r) => !re.test(r.url)),
    );
    return this;
  }

  /**
   * Sort the result set.
   *
   * - `resolution-desc` — sort by total pixel area descending (width × height)
   * - `size-desc` — sort by file size descending
   * - `format-priority` — sort by extension: webp > avif > png > jpg > gif > svg > other
   */
  sort(by: SortFn): this {
    this.sortFn = by;
    return this;
  }

  /** Remove all configured filters and sorts. */
  reset(): this {
    this.steps.length = 0;
    this.sortFn = null;
    return this;
  }

  /**
   * Apply the filter pipeline to an array of resources.
   *
   * Steps are applied in the order they were configured, then the sort
   * (if any) is applied last.
   *
   * @returns A new (filtered and sorted) array of resources.
   */
  apply(resources: MediaResource[]): MediaResource[] {
    // Apply all filter steps in order
    let result = resources;
    for (const step of this.steps) {
      result = step(result);
    }

    // Apply sort if configured
    if (this.sortFn) {
      result = this.applySort(result);
    }

    return result;
  }

  private applySort(resources: MediaResource[]): MediaResource[] {
    const sorted = [...resources];

    switch (this.sortFn) {
      case 'resolution-desc':
        sorted.sort((a, b) => b.width * b.height - a.width * a.height);
        break;
      case 'size-desc':
        sorted.sort((a, b) => b.size - a.size);
        break;
      case 'format-priority': {
        const formatRank: Record<string, number> = {
          '.webp': 0,
          '.avif': 1,
          '.png': 2,
          '.jpg': 3,
          '.jpeg': 3,
          '.gif': 4,
          '.svg': 5,
        };
        sorted.sort((a, b) => {
          const ra = formatRank[a.extension.toLowerCase()] ?? 99;
          const rb = formatRank[b.extension.toLowerCase()] ?? 99;
          return ra - rb;
        });
        break;
      }
    }

    return sorted;
  }
}
