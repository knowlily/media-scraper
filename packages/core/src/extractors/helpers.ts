// ---------------------------------------------------------------------------
// @media-scraper/core — extractor helpers (shared utilities)
// ---------------------------------------------------------------------------

import type { ElementLike, MediaResource, MediaSource, MediaType } from '../types.js';
import { generateId, extractFilename, getExtension } from '../utils.js';

// ---------------------------------------------------------------------------
// Extension constant sets
// ---------------------------------------------------------------------------

/** Image file extensions. */
export const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.bmp', '.ico', '.avif', '.tiff', '.tif',
]);

/** Video file extensions. */
export const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.ogv',
  '.mov', '.avi', '.mkv',
  '.flv', '.wmv', '.m4v', '.3gp',
]);

/** Audio file extensions. */
export const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus', '.weba',
]);

/** Document / archive file extensions. */
export const DOCUMENT_EXTENSIONS = new Set([
  '.pdf',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.epub', '.mobi',
]);

// ---------------------------------------------------------------------------
// URL resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a potentially-relative URL against a base URL.
 *
 * Returns `null` when the URL is empty, a `data:` / `blob:` URI,
 * or otherwise unresolvable.
 *
 * @param href - The raw URL (possibly relative).
 * @param baseUrl - The absolute base URL to resolve against.
 * @returns The resolved absolute URL, or `null`.
 *
 * @public
 */
export function resolveUrl(href: string, baseUrl: string): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (
    !trimmed ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return null;
  }
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Resource factory
// ---------------------------------------------------------------------------

/**
 * Build a {@link MediaResource} with sensible defaults.
 *
 * All fields except `id`, `url`, `type`, and `source` are inferred or zeroed.
 * Use the optional `overrides` to populate fields like `thumbnail`, `width`,
 * `height`, `alt`, `title`, or `isStreaming`.
 *
 * @param url - Absolute URL of the media.
 * @param type - The broad media type.
 * @param source - How the resource was discovered.
 * @param overrides - Optional partial {@link MediaResource} to override defaults.
 * @returns A new {@link MediaResource} object.
 *
 * @public
 */
export function makeResource(
  url: string,
  type: MediaType,
  source: MediaSource,
  overrides?: Partial<MediaResource>,
): MediaResource {
  return {
    id: generateId(),
    url,
    type,
    filename: extractFilename(url),
    extension: getExtension(url),
    size: 0,
    width: 0,
    height: 0,
    thumbnail: '',
    source,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// srcset parsing
// ---------------------------------------------------------------------------

/** A single candidate from a srcset attribute. */
export interface SrcsetCandidate {
  url: string;
  descriptor: number;   // width in px (w) or pixel-density multiplier (x)
  descriptorType: 'w' | 'x';
  index: number;        // original position (tiebreaker)
}

/**
 * Parse an HTML `srcset` attribute into an array of candidates.
 *
 * Handles both width descriptors (`600w`) and pixel-ratio descriptors
 * (`1.5x`, `2x`).  Defaults to `1x` when no descriptor is present.
 *
 * @param srcset - The raw `srcset` attribute value.
 * @param baseUrl - Base URL for resolving relative candidate URLs.
 * @returns An array of parsed {@link SrcsetCandidate} objects.
 *
 * @public
 */
export function parseSrcset(srcset: string, baseUrl: string): SrcsetCandidate[] {
  const candidates: SrcsetCandidate[] = [];
  // Split on commas that are NOT inside parens (some URLs contain commas)
  const parts = srcset.split(/,(?![^(]*\))/);
  for (let i = 0; i < parts.length; i++) {
    const trimmed = parts[i].trim();
    if (!trimmed) continue;

    // Split into URL and optional descriptor
    const tokens = trimmed.split(/\s+/);
    const rawUrl = tokens[0];
    const descriptor = tokens.length > 1 ? tokens[tokens.length - 1] : '1x';

    const url = resolveUrl(rawUrl, baseUrl);
    if (!url) continue;

    let descriptorType: 'w' | 'x' = 'x';
    let descriptorValue = 1.0;

    if (descriptor.endsWith('w')) {
      descriptorType = 'w';
      descriptorValue = parseFloat(descriptor) || 0;
    } else if (descriptor.endsWith('x')) {
      descriptorType = 'x';
      descriptorValue = parseFloat(descriptor) || 1.0;
    } else if (/^\d+$/.test(descriptor)) {
      // In some malformed srcsets a bare number means width
      descriptorType = 'w';
      descriptorValue = parseFloat(descriptor) || 0;
    }

    candidates.push({
      url,
      descriptor: descriptorValue,
      descriptorType,
      index: i,
    });
  }
  return candidates;
}

/**
 * Pick the best candidate from a parsed srcset.
 *
 * For `w` descriptors: prefers the largest width.
 * For `x` descriptors: prefers the highest pixel ratio.
 * Falls back to the first candidate.
 *
 * @param candidates - Parsed srcset candidates.
 * @returns The best candidate, or `null` if the array is empty.
 *
 * @public
 */
export function pickBestCandidate(candidates: SrcsetCandidate[]): SrcsetCandidate | null {
  if (candidates.length === 0) return null;

  // Prefer w-descriptor candidates (they usually carry more information)
  const wCands = candidates.filter((c) => c.descriptorType === 'w');
  if (wCands.length > 0) {
    wCands.sort((a, b) => b.descriptor - a.descriptor || a.index - b.index);
    return wCands[0];
  }

  // Fall back to x-descriptor
  const xCands = candidates.filter((c) => c.descriptorType === 'x');
  xCands.sort((a, b) => b.descriptor - a.descriptor || a.index - b.index);
  return xCands.length > 0 ? xCands[0] : candidates[0];
}

/**
 * Resolve the best image URL from an `<img>` element's `srcset` and `src`
 * attributes, using the `sizes` attribute as a hint when available.
 *
 * @param el - The element to inspect.
 * @param baseUrl - Base URL for resolving relative URLs.
 * @returns The best resolved image URL, or `null`.
 *
 * @public
 */
export function resolveImgSrc(
  el: ElementLike,
  baseUrl: string,
): string | null {
  const srcset = el.getAttribute('srcset');
  if (srcset) {
    const candidates = parseSrcset(srcset, baseUrl);
    const best = pickBestCandidate(candidates);
    if (best) return best.url;
  }
  const src = el.getAttribute('src');
  return src ? resolveUrl(src, baseUrl) : null;
}
