// ---------------------------------------------------------------------------
// @media-scraper/core — audio extractor
// ---------------------------------------------------------------------------

import type { DocumentLike, ElementLike, MediaResource, MediaSource } from '../types.js';
import { getExtension } from '../utils.js';
import { resolveUrl, makeResource, AUDIO_EXTENSIONS } from './helpers.js';

/** Known audio streaming extensions. */
const AUDIO_STREAM_EXTENSIONS = new Set(['.m3u8', '.mpd', '.pls', '.m3u']);

/** Check if a URL points to an audio stream (m3u8, mpd, pls, m3u). */
function isAudioStream(url: string): MediaSource | null {
  const ext = getExtension(url);
  if (AUDIO_STREAM_EXTENSIONS.has(ext)) {
    if (ext === '.m3u8') return 'm3u8';
    if (ext === '.mpd') return 'mpd';
    return 'audio';
  }
  // Also check path for stream extensions (e.g. /stream/playlist.m3u8?token=...)
  if (/\.m3u8([?#]|$)/i.test(url)) return 'm3u8';
  return null;
}

/**
 * Extract audio resources from a DOM-like document.
 *
 * Examines:
 * - `<audio src>` elements
 * - `<source>` children of `<audio>` elements
 * - `<a href>` links whose extension matches known audio formats
 * - Head metadata: `<meta property="og:audio">`, JSON-LD audio
 * - Script text content for audio streaming URLs (.m3u8 etc.)
 * - Standalone `<source>` elements (outside `<audio>` / `<video>`) with audio extensions
 *
 * @param doc  - The document to extract from.
 * @param baseUrl - The base URL of the page (used to resolve relative URLs).
 * @returns An array of discovered audio {@link MediaResource} objects.
 *
 * @public
 */
export function extractAudio(doc: DocumentLike, baseUrl: string): MediaResource[] {
  const results: MediaResource[] = [];
  const seen = new Set<string>();

  const add = (rawUrl: string, source?: MediaSource): void => {
    if (!rawUrl) return;
    try {
      const resolved = new URL(rawUrl, baseUrl).href;
      if (seen.has(resolved)) return;
      seen.add(resolved);
      results.push(makeResource(resolved, 'audio', source ?? 'audio'));
    } catch {
      // skip unparseable URLs
    }
  };

  // ---- 1. <audio src> elements ----
  const audioElements = doc.querySelectorAll('audio');
  for (const el of audioElements) {
    const src = el.getAttribute('src');
    if (src) {
      const url = resolveUrl(src, baseUrl);
      if (url) {
        const stream = isAudioStream(url);
        add(url, stream ?? 'audio');
      }
    }

    // <audio><source> children
    const sources = el.querySelectorAll('source');
    for (const source of sources) {
      const sSrc = source.getAttribute('src');
      if (sSrc) {
        const url = resolveUrl(sSrc, baseUrl);
        if (url) {
          const stream = isAudioStream(url);
          add(url, stream ?? 'audio');
        }
      }
    }
  }

  // ---- 2. <a href> pointing to audio files ----
  const anchors: ElementLike[] = doc.querySelectorAll('a');
  for (const a of anchors) {
    const href = a.getAttribute('href');
    if (!href) continue;

    const trimmed = href.trim();
    if (!trimmed || trimmed.startsWith('#') || /^javascript:/i.test(trimmed)) continue;

    try {
      const resolved = new URL(trimmed, baseUrl).href;
      const ext = getExtension(resolved);
      if (ext && (AUDIO_EXTENSIONS.has(ext) || AUDIO_STREAM_EXTENSIONS.has(ext))) {
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        const stream = isAudioStream(resolved);
        results.push(makeResource(resolved, 'audio', stream ?? 'link'));
      }
    } catch {
      // skip
    }
  }

  // ---- 3. Head metadata: og:audio / JSON-LD ----
  // <meta property="og:audio">
  const ogAudios = doc.querySelectorAll('meta[property="og:audio"]');
  for (const meta of ogAudios) {
    const content = meta.getAttribute('content');
    if (content) add(content, 'head-meta');
  }

  // <meta name="twitter:audio">
  const twAudios = doc.querySelectorAll('meta[name="twitter:audio"]');
  for (const meta of twAudios) {
    const content = meta.getAttribute('content');
    if (content) add(content, 'head-meta');
  }

  // JSON-LD audio (structured data)
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const text = script.textContent;
      if (!text) continue;
      const data = JSON.parse(text);

      // Handle both single object and array
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        // AudioObject
        if (item['@type'] === 'AudioObject' && item.contentUrl) {
          add(item.contentUrl, 'head-meta');
        }
        // MusicRecording / MusicAlbum
        if ((item['@type'] === 'MusicRecording' || item['@type'] === 'MusicAlbum') && item.url) {
          add(item.url, 'head-meta');
        }
        // Generic: any audio property in the object
        if (item.audio && typeof item.audio === 'string') {
          add(item.audio, 'head-meta');
        }
        if (item.audio?.contentUrl && typeof item.audio.contentUrl === 'string') {
          add(item.audio.contentUrl, 'head-meta');
        }
      }
    } catch {
      // Invalid JSON
    }
  }

  // ---- 4. Script text for audio streaming URLs ----
  const scripts = doc.querySelectorAll('script');
  const streamPattern = /(https?:\/\/[^\s"'`<>]*?\.(?:m3u8|mpd|pls|m3u)[^\s"'`<>]*)/gi;
  for (const script of scripts) {
    try {
      const text = script.textContent;
      if (!text || text.length < 100) continue;
      let match: RegExpExecArray | null;
      while ((match = streamPattern.exec(text)) !== null) {
        const url = resolveUrl(match[0], baseUrl);
        if (url && !seen.has(url)) {
          seen.add(url);
          const stream = isAudioStream(url);
          results.push(makeResource(url, 'audio', stream ?? 'audio'));
        }
      }
    } catch {
      // skip
    }
  }

  // ---- 5. Standalone <source> elements (outside <audio>/<video>) ----
  const standaloneSources = doc.querySelectorAll('source');
  for (const el of standaloneSources) {
    const parent = (el as unknown as { parentElement?: ElementLike }).parentElement;
    if (parent) {
      const parentTag = parent.tagName?.toLowerCase?.();
      if (parentTag === 'audio' || parentTag === 'video') continue; // already handled
    }
    const src = el.getAttribute('src');
    if (src) {
      const url = resolveUrl(src, baseUrl);
      if (url) {
        const ext = getExtension(url);
        if (ext && (AUDIO_EXTENSIONS.has(ext) || AUDIO_STREAM_EXTENSIONS.has(ext))) {
          const stream = isAudioStream(url);
          add(url, stream ?? 'audio');
        }
      }
    }
  }

  return results;
}
