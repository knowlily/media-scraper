// ---------------------------------------------------------------------------
// @media-scraper/core — image extractor
// ---------------------------------------------------------------------------

import type { DocumentLike, ElementLike, MediaResource, MediaSource } from '../types.js';
import { generateId, extractFilename, getExtension } from '../utils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a potentially-relative URL against a base URL.
 * Returns `null` when the URL is empty, a data: URI, or otherwise unresolvable.
 */
function resolveUrl(href: string, baseUrl: string): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Build a MediaResource with sensible defaults.
 * Everything except `id`, `url`, `type`, and `source` is inferred / zeroed.
 */
function makeResource(
  url: string,
  type: 'image' | 'video',
  source: MediaSource,
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
  };
}

// ---------------------------------------------------------------------------
// srcset parsing
// ---------------------------------------------------------------------------

/** A single candidate from a srcset attribute. */
interface SrcsetCandidate {
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
 */
function parseSrcset(srcset: string, baseUrl: string): SrcsetCandidate[] {
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
 */
function pickBestCandidate(candidates: SrcsetCandidate[]): SrcsetCandidate | null {
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
 * Resolve the best image URL from srcset and optional sizes, falling back
 * to a plain `src` attribute.
 */
function resolveImgSrc(
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

// ---------------------------------------------------------------------------
// 1. Standard <img> elements
// ---------------------------------------------------------------------------

function extractFromImgElements(
  doc: DocumentLike,
  baseUrl: string,
  results: MediaResource[],
): void {
  const imgs = doc.querySelectorAll('img');
  for (const img of imgs) {
    try {
      const url = resolveImgSrc(img, baseUrl);
      if (!url) continue;
      results.push(makeResource(url, 'image', 'img'));
    } catch {
      // Skip broken resources
    }
  }
}

// ---------------------------------------------------------------------------
// 2. <picture> elements
// ---------------------------------------------------------------------------

function extractFromPictureElements(
  doc: DocumentLike,
  baseUrl: string,
  results: MediaResource[],
): void {
  const pictures = doc.querySelectorAll('picture');
  for (const picture of pictures) {
    try {
      // Try <source> children first
      const sources = picture.querySelectorAll('source');
      let found = false;

      for (const source of sources) {
        const srcset = source.getAttribute('srcset');
        if (!srcset) continue;

        const candidates = parseSrcset(srcset, baseUrl);
        const best = pickBestCandidate(candidates);
        if (best) {
          results.push(makeResource(best.url, 'image', 'img'));
          found = true;
        }
      }

      // Fall back to inner <img> if no <source> matched
      if (!found) {
        const img = picture.querySelector('img');
        if (img) {
          const url = resolveImgSrc(img, baseUrl);
          if (url) {
            results.push(makeResource(url, 'image', 'img'));
          }
        }
      }
    } catch {
      // Skip broken resources
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Head metadata
// ---------------------------------------------------------------------------

/**
 * Check if a string looks like a plausible absolute or protocol-relative
 * image URL (avoid capturing plain placeholder text like "image" or
 * relative paths that might be noise).
 */
function looksLikeImageUrl(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Absolute URL
  if (/^https?:\/\//i.test(t)) return true;
  // Protocol-relative
  if (/^\/\//.test(t)) return true;
  // Relative but clearly a path (starts with / or has extension)
  if (t.startsWith('/')) return true;
  if (/\.[a-z]{3,4}(\?|#|$)/i.test(t)) return true;
  return false;
}

/**
 * Find image URLs inside an arbitrary value — handles single strings,
 * arrays of strings, and nested objects.
 */
function collectImageUrls(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') {
    return looksLikeImageUrl(value) ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectImageUrls);
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const urls: string[] = [];
    // Check common image-key properties
    for (const key of ['image', 'thumbnailUrl', 'logo', 'url', 'contentUrl', 'thumbnail']) {
      const v = obj[key];
      if (v) {
        urls.push(...collectImageUrls(v));
      }
    }
    return urls;
  }
  return [];
}

/**
 * Walk a JSON-LD value recursively collecting image URLs.
 * Supports top-level objects, arrays, and `@graph` arrays.
 */
function extractJSONLDImages(raw: string): string[] {
  try {
    const data = JSON.parse(raw);
    const urls: string[] = [];

    // Handle @graph
    if (data && data['@graph'] && Array.isArray(data['@graph'])) {
      for (const item of data['@graph']) {
        urls.push(...collectImageUrls(item));
      }
    } else {
      urls.push(...collectImageUrls(data));
    }

    return urls;
  } catch {
    return [];
  }
}

/**
 * Extract image URLs from <meta> and <link> head metadata.
 */
function extractFromHeadMetadata(
  doc: DocumentLike,
  baseUrl: string,
  results: MediaResource[],
): void {
  if (!doc.head) return;

  try {
    // ---- <meta> tags ----
    const metaSelectors = [
      'meta[property="og:image"]',
      'meta[property="og:image:url"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
      'meta[property="og:video"]',       // thumbnail for videos
    ];

    for (const selector of metaSelectors) {
      const metas = doc.head.querySelectorAll(selector);
      for (const meta of metas) {
        try {
          const content = meta.getAttribute('content');
          if (content) {
            const url = resolveUrl(content.trim(), baseUrl);
            if (url) {
              results.push(makeResource(url, 'image', 'head-meta'));
            }
          }
        } catch {
          // Skip
        }
      }
    }

    // ---- <link> tags ----
    const linkSelectors: Array<{ selector: string; attr: string }> = [
      { selector: 'link[rel="image_src"]', attr: 'href' },
      { selector: 'link[rel="preload"][as="image"]', attr: 'href' },
      { selector: 'link[rel="icon"]', attr: 'href' },
      { selector: 'link[rel="shortcut icon"]', attr: 'href' },
      { selector: 'link[rel="apple-touch-icon"]', attr: 'href' },
      { selector: 'link[rel="apple-touch-icon-precomposed"]', attr: 'href' },
    ];

    for (const { selector, attr } of linkSelectors) {
      const links = doc.head.querySelectorAll(selector);
      for (const link of links) {
        try {
          const href = link.getAttribute(attr);
          if (href) {
            const url = resolveUrl(href.trim(), baseUrl);
            if (url) {
              results.push(makeResource(url, 'image', 'head-meta'));
            }
          }
        } catch {
          // Skip
        }
      }
    }

    // ---- JSON-LD script tags ----
    const scripts = doc.head.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const text = script.textContent;
        if (text) {
          const urls = extractJSONLDImages(text);
          for (const rawUrl of urls) {
            const url = resolveUrl(rawUrl, baseUrl);
            if (url) {
              results.push(makeResource(url, 'image', 'head-meta'));
            }
          }
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Skip entire head extraction on structural error
  }

  // Also check body for JSON-LD (some sites put it there)
  if (doc.body) {
    try {
      const scripts = doc.body.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const text = script.textContent;
          if (text) {
            const urls = extractJSONLDImages(text);
            for (const rawUrl of urls) {
              const url = resolveUrl(rawUrl, baseUrl);
              if (url) {
                results.push(makeResource(url, 'image', 'head-meta'));
              }
            }
          }
        } catch {
          // Skip
        }
      }
    } catch {
      // Skip
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Lazy-loaded images
// ---------------------------------------------------------------------------

/** Attributes commonly used by lazy-loading libraries. */
const LAZY_ATTRS = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-url',
  'data-img',
];

function extractFromLazyImages(
  doc: DocumentLike,
  baseUrl: string,
  results: MediaResource[],
): void {
  // Single attribute selectors
  for (const attr of LAZY_ATTRS) {
    try {
      const elements = doc.querySelectorAll(`[${attr}]`);
      for (const el of elements) {
        try {
          const val = el.getAttribute(attr);
          if (val) {
            const url = resolveUrl(val, baseUrl);
            if (url) {
              results.push(makeResource(url, 'image', 'lazy-load'));
            }
          }
        } catch {
          // Skip
        }
      }
    } catch {
      // Skip
    }
  }

  // <img loading="lazy"> — check src/srcset even for loading=lazy
  try {
    const lazyImgs = doc.querySelectorAll('img[loading="lazy"]');
    for (const img of lazyImgs) {
      try {
        const url = resolveImgSrc(img, baseUrl);
        if (url) {
          results.push(makeResource(url, 'image', 'lazy-load'));
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Skip
  }
}

// ---------------------------------------------------------------------------
// 5. SVG <image> elements
// ---------------------------------------------------------------------------

function extractFromSVGImages(
  doc: DocumentLike,
  baseUrl: string,
  results: MediaResource[],
): void {
  try {
    const images = doc.querySelectorAll('image');
    for (const img of images) {
      try {
        // SVG <image> uses href (xlink:href as fallback)
        const href =
          img.getAttribute('href') ??
          img.getAttribute('xlink:href') ??
          img.getAttribute('xlinkHref');
        if (href) {
          const url = resolveUrl(href, baseUrl);
          if (url) {
            results.push(makeResource(url, 'image', 'img'));
          }
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Skip
  }
}

// ---------------------------------------------------------------------------
// 6. <input type="image">
// ---------------------------------------------------------------------------

function extractFromInputImages(
  doc: DocumentLike,
  baseUrl: string,
  results: MediaResource[],
): void {
  try {
    const inputs = doc.querySelectorAll('input[type="image"]');
    for (const input of inputs) {
      try {
        const src = input.getAttribute('src');
        if (src) {
          const url = resolveUrl(src, baseUrl);
          if (url) {
            results.push(makeResource(url, 'image', 'img'));
          }
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Skip
  }
}

// ---------------------------------------------------------------------------
// 7. <link rel="icon"> / <link rel="apple-touch-icon">
//
// Already handled inside extractFromHeadMetadata (above), so this section
// is covered.  We leave a note rather than duplicating the logic.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract images from a DOM-like document.
 *
 * Walks `<img>` elements, `<picture>` sources, `<meta>` tags (Open Graph,
 * Twitter Cards, JSON-LD), lazy-load attributes, SVG `<image>` elements,
 * `<input type="image">` elements, favicons, and preload links.
 *
 * Every returned resource has a unique `id`, inferred `filename` and
 * `extension`, and `size`/`width`/`height`/`thumbnail` set to 0 (unknown
 * at extraction time).  Relative URLs are resolved against `baseUrl`.
 *
 * @param doc      - The document to extract from.
 * @param baseUrl  - The absolute URL of the page (used to resolve relative URLs).
 * @returns An array of discovered image {@link MediaResource} objects.
 *
 * @public
 */
export function extractImages(
  doc: DocumentLike,
  baseUrl: string,
): MediaResource[] {
  const results: MediaResource[] = [];

  // Order matters: head-metadata sources often carry the highest-quality
  // originals, so extract them first (they appear first in the array).
  // Then extract standard elements, then alternative / lazy sources.

  // P0: Head metadata — highest priority (og:image, twitter:image, JSON-LD, etc.)
  extractFromHeadMetadata(doc, baseUrl, results);

  // Standard <img> elements
  extractFromImgElements(doc, baseUrl, results);

  // <picture> elements
  extractFromPictureElements(doc, baseUrl, results);

  // Lazy-loaded images
  extractFromLazyImages(doc, baseUrl, results);

  // SVG <image> elements
  extractFromSVGImages(doc, baseUrl, results);

  // <input type="image">
  extractFromInputImages(doc, baseUrl, results);

  return results;
}
