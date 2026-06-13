// ---------------------------------------------------------------------------
// @media-scraper/core — utilities
// ---------------------------------------------------------------------------

import type { MediaType } from './types.js';

/**
 * Generate a unique identifier string.
 *
 * Uses `crypto.randomUUID()` when available; falls back to a
 * timestamp + random hex implementation for older environments.
 *
 * @returns A unique ID string.
 *
 * @public
 */
export function generateId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  // Fallback: timestamp (36-ms resolution) + random hex
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}`;
}

/**
 * Extract a filename from a URL string.
 *
 * Handles query strings, fragments, and trailing slashes.  Returns the
 * last path segment that looks like a filename, or a generated name if
 * the URL ends in a directory-like segment.
 *
 * @param url - The URL to extract from.
 * @returns The inferred filename.
 *
 * @public
 */
export function extractFilename(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const segments = path.split('/').filter(Boolean);
    const last = segments[segments.length - 1];

    if (last && last.includes('.')) {
      return decodeURIComponent(last);
    }

    // Directory-like URL – derive from the last meaningful segment
    const name = last || segments[segments.length - 2] || 'index';
    const ext = guessExtension(u.pathname) || '';
    return decodeURIComponent(name) + ext;
  } catch {
    return 'unknown';
  }
}

/**
 * Get the file extension from a URL, including the leading dot.
 *
 * Strips query strings and fragments.  Returns an empty string when
 * no extension can be determined.
 *
 * @param url - The URL to inspect.
 * @returns Lowercase extension (e.g. ".jpg") or "".
 *
 * @public
 */
export function getExtension(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const dotIdx = path.lastIndexOf('.');
    if (dotIdx === -1) return '';
    const ext = path.slice(dotIdx).toLowerCase();
    // Heuristic: reject extensions that are too long or contain non-alpha chars
    if (ext.length > 10 || /[^a-z0-9.]/.test(ext.slice(1))) return '';
    return ext;
  } catch {
    return '';
  }
}

/**
 * Guess a media type from a URL by inspecting its extension.
 *
 * @param url - The URL to classify.
 * @returns The {@link MediaType} if recognised, or `null`.
 *
 * @public
 */
export function isMediaUrl(url: string): MediaType | null {
  const ext = getExtension(url);
  switch (ext) {
    // Images
    case '.jpg':
    case '.jpeg':
    case '.png':
    case '.gif':
    case '.webp':
    case '.svg':
    case '.bmp':
    case '.ico':
    case '.avif':
    case '.tiff':
    case '.tif':
      return 'image';

    // Videos
    case '.mp4':
    case '.webm':
    case '.ogv':
    case '.mov':
    case '.avi':
    case '.mkv':
    case '.flv':
    case '.wmv':
    case '.m4v':
    case '.3gp':
      return 'video';

    // Audio
    case '.mp3':
    case '.wav':
    case '.flac':
    case '.aac':
    case '.ogg':
    case '.opus':
    case '.m4a':
    case '.weba':
    case '.wma':
      return 'audio';

    // Documents
    case '.pdf':
    case '.doc':
    case '.docx':
    case '.xls':
    case '.xlsx':
    case '.ppt':
    case '.pptx':
    case '.txt':
    case '.csv':
    case '.zip':
    case '.rar':
    case '.7z':
    case '.tar':
    case '.gz':
      return 'document';

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Guess a file extension by looking for known media patterns in a URL path.
 */
function guessExtension(path: string): string {
  const known = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.mp4',
    '.webm',
    '.mp3',
    '.pdf',
  ]);
  const dotIdx = path.lastIndexOf('.');
  if (dotIdx === -1) return '';
  const ext = path.slice(dotIdx).toLowerCase();
  return known.has(ext) ? ext : '';
}
