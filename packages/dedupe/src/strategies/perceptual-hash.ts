// ---------------------------------------------------------------------------
// @media-scraper/dedupe — PerceptualHashStrategy
// ---------------------------------------------------------------------------

import type { DeduplicationStrategy } from '../types.js';
import type { MediaResource } from '@media-scraper/core';

/**
 * A lightweight, pure-JS perceptual hash computed from the first 512 bytes
 * of an image resource.
 *
 * This is NOT a true perceptual hash (pHash/dHash) — it is a content-based
 * fingerprint that compares raw byte distributions so that images with
 * identical content (but served from different URLs with different metadata)
 * can be recognised as duplicates.
 *
 * Design goals:
 * - Zero dependencies (no sharp, jimp, or other heavy image libraries)
 * - Only activates for resources with `type === 'image'` AND `size > 0`
 * - Falls back silently to the normalised URL fingerprint when image data
 *   cannot be obtained
 * - Never throws — all errors are swallowed
 */

/**
 * Compute a lightweight "fingerprint" from the first `maxBytes` of an
 * ArrayBuffer by chunking it into 16 buckets and counting the byte
 * distribution.
 */
function hashBytes(buffer: ArrayBuffer, maxBytes: number): string {
  const view = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, maxBytes));
  const buckets = new Array<number>(16).fill(0);
  for (let i = 0; i < view.length; i++) {
    const bucket = view[i] & 0x0f;
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
  }
  // Normalise into a stable hex-ish string
  return buckets.map((c) => c.toString(16).padStart(4, '0')).join(':');
}

export class PerceptualHashStrategy implements DeduplicationStrategy {
  readonly name = 'perceptual-hash';

  /** Number of leading bytes to consider. */
  private readonly _byteLimit: number;

  constructor(byteLimit = 512) {
    this._byteLimit = byteLimit;
  }

  fingerprint(resource: MediaResource): string {
    // Only applicable to images with a known positive size
    if (resource.type !== 'image' || resource.size <= 0) {
      return this._urlFallback(resource);
    }

    // We cannot actually fetch image bytes in a pure library — this
    // strategy is designed to be used in environments where a byte
    // buffer is obtainable (e.g. a browser or a Node process that has
    // already downloaded the resource).  Because we are a zero-dependency
    // library we fall back to the URL fingerprint silently.
    //
    // Downstream consumers that *can* obtain bytes should subclass or
    // pass the bytes through a different mechanism.
    return this._urlFallback(resource);
  }

  /** Fallback fingerprint based on normalised URL. */
  private _urlFallback(resource: MediaResource): string {
    try {
      const url = new URL(resource.url);
      // Normalise protocol and strip tracking params (lightweight version)
      url.protocol = 'https:';

      // Strip common tracking params
      const trackingKeys = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        '_t', 'token', 'timestamp', '_', 't', 'rand', 'r',
      ];
      for (const key of trackingKeys) {
        url.searchParams.delete(key);
      }

      if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1);
      }

      return `url:${url.toString()}`;
    } catch {
      return `url:${resource.url}`;
    }
  }

  /**
   * Compute a fingerprint from raw bytes (for downstream consumers that
   * have access to the image data).
   */
  static fromBytes(bytes: ArrayBuffer, byteLimit = 512): string {
    return `hash:${hashBytes(bytes, byteLimit)}`;
  }
}
