// ---------------------------------------------------------------------------
// @media-scraper/core — video extractor
// ---------------------------------------------------------------------------

import type { DocumentLike, ElementLike, MediaResource, MediaSource } from '../types.js';
import { getExtension, isMediaUrl } from '../utils.js';
import {
  resolveUrl,
  makeResource,
  VIDEO_EXTENSIONS,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Video file extensions (used for <a href> link detection)
// ---------------------------------------------------------------------------

function hasVideoExtension(url: string): boolean {
  const ext = getExtension(url);
  return VIDEO_EXTENSIONS.has(ext);
}

// ---------------------------------------------------------------------------
// Streaming pattern detection
// ---------------------------------------------------------------------------

/** Check if a URL points to an HLS (.m3u8) or MPEG-DASH (.mpd) stream. */
function detectStreamingType(url: string): MediaSource | null {
  // Check path/query for .m3u8 or .mpd
  if (/\.m3u8([?#]|$)/i.test(url)) return 'm3u8';
  if (/\.mpd([?#]|$)/i.test(url)) return 'mpd';
  return null;
}

// ---------------------------------------------------------------------------
// 1. <video> elements
// ---------------------------------------------------------------------------

function extractFromVideoElements(
  doc: DocumentLike,
  baseUrl: string,
  results: MediaResource[],
): void {
  const videos = doc.querySelectorAll('video');
  for (const video of videos) {
    try {
      // Capture poster as thumbnail
      const poster = video.getAttribute('poster');
      let posterUrl = poster ? resolveUrl(poster, baseUrl) : null;

      // Check src attribute on <video> itself
      const src = video.getAttribute('src');
      if (src) {
        const url = resolveUrl(src, baseUrl);
        if (url) {
          const streamSrc = detectStreamingType(url);
          results.push(makeResource(url, 'video', streamSrc ?? 'video',
            posterUrl ? { thumbnail: posterUrl } : undefined));
        }
      }

      // Check <source> children
      const sources = video.querySelectorAll('source');
      for (const source of sources) {
        try {
          const srcAttr = source.getAttribute('src');
          if (srcAttr) {
            const url = resolveUrl(srcAttr, baseUrl);
            if (url) {
              const streamSrc = detectStreamingType(url);
              // Only set poster on the first source (the primary one)
              results.push(makeResource(url, 'video', streamSrc ?? 'video',
                posterUrl ? { thumbnail: posterUrl } : undefined));
              posterUrl = null; // only first source gets poster
            }
          }
        } catch {
          // Skip broken source
        }
      }
    } catch {
      // Skip broken video element
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Direct video links (<a href>)
// ---------------------------------------------------------------------------

function extractFromVideoLinks(
  doc: DocumentLike,
  baseUrl: string,
  results: MediaResource[],
): void {
  const anchors = doc.querySelectorAll('a');
  for (const a of anchors) {
    try {
      const href = a.getAttribute('href');
      if (!href) continue;

      const url = resolveUrl(href, baseUrl);
      if (!url) continue;

      // Check if the URL is a known video platform
      const embed = detectEmbed(url);
      if (embed) {
        const pageUrl = buildCanonicalUrl(embed.provider, embed.id);
        results.push(makeResource(pageUrl, 'video', 'iframe',
          embed.thumbnail ? { thumbnail: embed.thumbnail } : undefined));
        continue;
      }

      // Check if the URL is a video file
      if (hasVideoExtension(url)) {
        results.push(makeResource(url, 'video', 'link'));
        continue;
      }

      // Check for streaming URLs
      const streamSrc = detectStreamingType(url);
      if (streamSrc) {
        results.push(makeResource(url, 'video', streamSrc));
      }
    } catch {
      // Skip
    }
  }
}

function buildCanonicalUrl(provider: string, id: string): string {
  switch (provider) {
    case 'youtube': return `https://www.youtube.com/watch?v=${id}`;
    case 'vimeo': return `https://vimeo.com/${id}`;
    case 'dailymotion': return `https://www.dailymotion.com/video/${id}`;
    case 'bilibili': return `https://www.bilibili.com/video/${id}`;
    case 'douyin': return `https://www.douyin.com/video/${id}`;
    case 'tiktok': return `https://www.tiktok.com/@/video/${id}`;
    default: return id;
  }
}

// ---------------------------------------------------------------------------
// 3. Streaming detection in inline <script> textContent
// ---------------------------------------------------------------------------

/**
 * Scan script text content for .m3u8 and .mpd URLs using regex.
 * Extracts the surrounding URL fragment so we can attempt to resolve it.
 */
function extractStreamUrlsFromScripts(
  doc: DocumentLike,
  baseUrl: string,
  results: MediaResource[],
): void {
  const scripts = doc.querySelectorAll('script');
  // Patterns to find m3u8/mpd URLs inside JavaScript strings
  // Matches: JSON string values, variable assignments, string literals
  const m3u8Pattern = /(?:https?:)?\/\/[^\s"'`<>]*?\.m3u8[^\s"'`<>]*/gi;
  const mpdPattern = /(?:https?:)?\/\/[^\s"'`<>]*?\.mpd[^\s"'`<>]*/gi;

  const seen = new Set<string>();

  for (const script of scripts) {
    try {
      const text = script.textContent;
      if (!text) continue;

      // Search for .m3u8
      let match: RegExpExecArray | null;
      m3u8Pattern.lastIndex = 0;
      while ((match = m3u8Pattern.exec(text)) !== null) {
        const rawUrl = match[0];
        // Skip already-seen raw URLs within the same doc
        if (seen.has(rawUrl)) continue;
        seen.add(rawUrl);

        const url = resolveUrl(rawUrl, baseUrl);
        if (url && detectStreamingType(url) === 'm3u8') {
          results.push(makeResource(url, 'video', 'm3u8'));
        }
      }

      // Search for .mpd
      mpdPattern.lastIndex = 0;
      while ((match = mpdPattern.exec(text)) !== null) {
        const rawUrl = match[0];
        if (seen.has(rawUrl)) continue;
        seen.add(rawUrl);

        const url = resolveUrl(rawUrl, baseUrl);
        if (url && detectStreamingType(url) === 'mpd') {
          results.push(makeResource(url, 'video', 'mpd'));
        }
      }
    } catch {
      // Skip broken script
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Embedded videos (YouTube / Vimeo / Dailymotion / Bilibili)
// ---------------------------------------------------------------------------

interface EmbedInfo {
  /** The embed provider name (e.g. 'youtube'). */
  provider: string;
  /** The extracted video ID. */
  id: string;
  /** A canonical thumbnail URL for the video. */
  thumbnail: string;
}

/**
 * Try to recognise a known video embed host from an iframe `src`.
 * Returns `null` for unrecognised hosts.
 */
function detectEmbed(iframeSrc: string): EmbedInfo | null {
  let url: URL;
  try {
    url = new URL(iframeSrc);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  // YouTube
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const vid = url.searchParams.get('v');
    if (vid) {
      return {
        provider: 'youtube',
        id: vid,
        thumbnail: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
      };
    }
    // /embed/{id} path
    const embedMatch = url.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) {
      return {
        provider: 'youtube',
        id: embedMatch[1],
        thumbnail: `https://img.youtube.com/vi/${embedMatch[1]}/hqdefault.jpg`,
      };
    }
  }

  if (host === 'youtu.be') {
    const vid = url.pathname.replace(/^\//, '').split('/')[0];
    if (vid) {
      return {
        provider: 'youtube',
        id: vid,
        thumbnail: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
      };
    }
  }

  // Vimeo
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const vidMatch = url.pathname.match(/^\/(?:video\/)?(\d+)/);
    if (vidMatch) {
      return {
        provider: 'vimeo',
        id: vidMatch[1],
        thumbnail: `https://vumbnail.com/${vidMatch[1]}.jpg`,
      };
    }
  }

  // Dailymotion
  if (host === 'dailymotion.com' || host === 'www.dailymotion.com') {
    const vidMatch = url.pathname.match(/^\/(?:embed\/)?video\/([a-zA-Z0-9]+)/);
    if (vidMatch) {
      return {
        provider: 'dailymotion',
        id: vidMatch[1],
        thumbnail: `https://www.dailymotion.com/thumbnail/video/${vidMatch[1]}`,
      };
    }
  }

  // Bilibili
  if (host === 'bilibili.com' || host === 'www.bilibili.com') {
    const bvidMatch = url.pathname.match(/^\/video\/(BV[a-zA-Z0-9]+)/);
    if (bvidMatch) {
      return {
        provider: 'bilibili',
        id: bvidMatch[1],
        thumbnail: '',
      };
    }
    const aidMatch = url.searchParams.get('aid');
    const bvidQ = url.searchParams.get('bvid');
    if (bvidQ) {
      return { provider: 'bilibili', id: bvidQ, thumbnail: '' };
    }
    if (aidMatch) {
      return { provider: 'bilibili', id: aidMatch, thumbnail: '' };
    }
  }

  // Douyin (抖音)
  if (host === 'douyin.com' || host === 'www.douyin.com') {
    // /video/{numeric_id}
    const vidMatch = url.pathname.match(/^\/video\/(\d+)/);
    if (vidMatch) {
      return { provider: 'douyin', id: vidMatch[1], thumbnail: '' };
    }
    // ?modal_id={numeric_id}
    const modalId = url.searchParams.get('modal_id');
    if (modalId && /^\d+$/.test(modalId)) {
      return { provider: 'douyin', id: modalId, thumbnail: '' };
    }
  }

  // Douyin CDN / embed host
  if (host === 'www.iesdouyin.com' || host === 'iesdouyin.com') {
    const vidMatch = url.pathname.match(/\/share\/video\/(\d+)/);
    if (vidMatch) {
      return { provider: 'douyin', id: vidMatch[1], thumbnail: '' };
    }
  }

  // Douyin open platform embed
  if (host === 'open.douyin.com') {
    const vid = url.searchParams.get('vid') || url.searchParams.get('video_id');
    if (vid) {
      return { provider: 'douyin', id: vid, thumbnail: '' };
    }
  }

  // TikTok
  if (host === 'tiktok.com' || host === 'www.tiktok.com') {
    // /@user/video/{id}
    const vidMatch = url.pathname.match(/\/video\/(\d+)/);
    if (vidMatch) {
      return {
        provider: 'tiktok',
        id: vidMatch[1],
        thumbnail: '', // TikTok requires oembed API call for thumbnails
      };
    }
    // /embed/{id}
    const embedMatch = url.pathname.match(/^\/embed\/(\d+)/);
    if (embedMatch) {
      return { provider: 'tiktok', id: embedMatch[1], thumbnail: '' };
    }
  }

  return null;
}

function extractFromIframeEmbeds(
  doc: DocumentLike,
  baseUrl: string,
  results: MediaResource[],
): void {
  const iframes = doc.querySelectorAll('iframe');
  for (const iframe of iframes) {
    try {
      const src = iframe.getAttribute('src');
      if (!src) continue;

      const absoluteSrc = resolveUrl(src, baseUrl);
      if (!absoluteSrc) continue;

      const embed = detectEmbed(absoluteSrc);
      if (embed) {
        const pageUrl = buildCanonicalUrl(embed.provider, embed.id);
        results.push(makeResource(pageUrl, 'video', 'iframe',
          embed.thumbnail ? { thumbnail: embed.thumbnail } : undefined));
      }
    } catch {
      // Skip
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Platform-specific video URL extraction from script data
//    (Douyin, TikTok, etc. embed actual video URLs in JSON/page data)
// ---------------------------------------------------------------------------

import type { PlatformExtractor } from '../types.js';

/** Registry of platform-specific CDN video extractors. */
const platformExtractors: PlatformExtractor[] = [];

// Built-in extractors

/** Douyin (抖音) CDN extractor. */
const douyinExtractor: PlatformExtractor = {
  name: 'douyin',
  cdnPatterns: [/douyinvod\.com/i],
  coverPatterns: [/douyinpic/i],
  extract(rawUrl: string, baseUrl: string, _covers: string[]): MediaResource | null {
    const cleanUrl = rawUrl.replace(/\\\//g, '/');
    const url = resolveUrl(cleanUrl, baseUrl);
    if (!url) return null;
    const streamType = detectStreamingType(url);
    return makeResource(url, 'video', streamType ?? 'video');
  },
};

/** TikTok CDN extractor. */
const tiktokExtractor: PlatformExtractor = {
  name: 'tiktok',
  cdnPatterns: [/tiktokcdn\.(com|us|org)/i],
  coverPatterns: [/tiktokcdn.*?(?:thumb|cover)/i],
  extract(rawUrl: string, baseUrl: string, covers: string[]): MediaResource | null {
    const cleanUrl = rawUrl.replace(/\\\//g, '/');
    const url = resolveUrl(cleanUrl, baseUrl);
    if (!url) return null;
    const streamType = detectStreamingType(url);
    const thumb = covers.length > 0 ? covers[0] : '';
    return makeResource(url, 'video', streamType ?? 'video',
      thumb ? { thumbnail: thumb } : undefined);
  },
};

/** Xigua (西瓜视频) CDN extractor. */
const xiguaExtractor: PlatformExtractor = {
  name: 'xigua',
  cdnPatterns: [/ixigua\.com/i],
  extract(rawUrl: string, baseUrl: string, _covers: string[]): MediaResource | null {
    const cleanUrl = rawUrl.replace(/\\\//g, '/');
    const url = resolveUrl(cleanUrl, baseUrl);
    if (!url) return null;
    const streamType = detectStreamingType(url);
    return makeResource(url, 'video', streamType ?? 'video');
  },
};

/** Kuaishou (快手) CDN extractor. */
const kuaishouExtractor: PlatformExtractor = {
  name: 'kuaishou',
  cdnPatterns: [/kwai\w*\.com/i],
  extract(rawUrl: string, baseUrl: string, _covers: string[]): MediaResource | null {
    const cleanUrl = rawUrl.replace(/\\\//g, '/');
    const url = resolveUrl(cleanUrl, baseUrl);
    if (!url) return null;
    const streamType = detectStreamingType(url);
    return makeResource(url, 'video', streamType ?? 'video');
  },
};

// Register built-in extractors
platformExtractors.push(
  douyinExtractor,
  tiktokExtractor,
  xiguaExtractor,
  kuaishouExtractor,
);

/**
 * Register a custom {@link PlatformExtractor} for platform-specific
 * video CDN URL detection.
 *
 * Call this before running `extractVideos()` to add support for
 * additional platforms.
 *
 * @param ext - The extractor to register.
 *
 * @public
 */
export function registerPlatformExtractor(ext: PlatformExtractor): void {
  platformExtractors.push(ext);
}

/**
 * Scan script text for platform-specific CDN video URLs.
 * Iterates over the registered {@link PlatformExtractor} registry.
 */
function extractPlatformVideoUrls(
  doc: DocumentLike,
  baseUrl: string,
  results: MediaResource[],
): void {
  if (platformExtractors.length === 0) return;

  const scripts = doc.querySelectorAll('script');
  const seen = new Set<string>();

  // Collect all cover patterns from registered extractors
  const allCoverPatterns: RegExp[] = [];
  for (const ext of platformExtractors) {
    if (ext.coverPatterns) {
      allCoverPatterns.push(...ext.coverPatterns);
    }
  }

  for (const script of scripts) {
    try {
      const text = script.textContent;
      if (!text || text.length < 200) continue;

      // Collect cover URLs from this script using all registered cover patterns
      const covers: string[] = [];
      for (const coverPat of allCoverPatterns) {
        coverPat.lastIndex = 0;
        let cm: RegExpExecArray | null;
        while ((cm = coverPat.exec(text)) !== null) {
          const u = resolveUrl(cm[0].replace(/\\\//g, '/'), baseUrl);
          if (u && !covers.includes(u)) covers.push(u);
        }
      }

      for (const ext of platformExtractors) {
        // Check if any CDN pattern matches the script text
        const matches = ext.cdnPatterns.some((p) => p.test(text));
        if (!matches) continue;

        // Build a combined regex from the extractor's CDN patterns
        const urlPattern = buildUrlPattern(ext.cdnPatterns);
        urlPattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        let i = 0;
        while ((match = urlPattern.exec(text)) !== null) {
          const rawUrl = match[0];
          if (seen.has(rawUrl)) continue;
          seen.add(rawUrl);

          const thumb = i < covers.length ? covers[i] : '';
          const resource = ext.extract(rawUrl, baseUrl, thumb ? [thumb] : []);
          if (resource) {
            results.push(resource);
            i++;
          }
        }
        break; // Only process the first matching platform per script
      }
    } catch {
      // Skip broken script
    }
  }
}

/**
 * Build a combined URL regex from a set of CDN patterns.
 */
function buildUrlPattern(patterns: RegExp[]): RegExp {
  const hostnames = patterns.map((p) => p.source.replace(/\\\./g, '.'));
  const joined = hostnames.join('|');
  return new RegExp(
    '(https?:\\/\\/[^\\s"\'`<>{}]*?(?:' + joined + ')\\.[^\\s"\'`<>{}]*)',
    'gi',
  );
}

// ---------------------------------------------------------------------------
// 6. Standalone <source> elements
// ---------------------------------------------------------------------------

function extractFromStandaloneSources(
  doc: DocumentLike,
  baseUrl: string,
  results: MediaResource[],
): void {
  // Some pages have <source> outside of <video>/<audio> (invalid but common)
  const sources = doc.querySelectorAll('source');
  for (const source of sources) {
    try {
      // Skip if already inside a video element (handled by extractFromVideoElements)
      const parent = (source as unknown as { parentElement?: ElementLike }).parentElement;
      if (parent) {
        const parentTag = parent.tagName?.toLowerCase?.();
        if (parentTag === 'video' || parentTag === 'audio') continue;
      }

      const src = source.getAttribute('src');
      if (!src) continue;

      const url = resolveUrl(src, baseUrl);
      if (!url) continue;

      const streamSrc = detectStreamingType(url);
      if (streamSrc) {
        results.push(makeResource(url, 'video', streamSrc));
      } else if (hasVideoExtension(url)) {
        results.push(makeResource(url, 'video', 'video'));
      }
    } catch {
      // Skip
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract videos from a DOM-like document.
 *
 * Walks `<video>` elements (including their `<source>` children and
 * `poster` attribute), `<a>` links pointing to video files, inline
 * `<script>` text for streaming URLs (`.m3u8` / `.mpd`), and `<iframe>`
 * embeds from YouTube, Vimeo, Dailymotion, and Bilibili.
 *
 * Every returned resource has a unique `id`, inferred `filename` and
 * `extension`, and `size`/`width`/`height` set to 0 (unknown at
 * extraction time).  `thumbnail` is populated for embed providers
 * (YouTube / Vimeo / Dailymotion) and `<video poster>` attributes.
 * Relative URLs are resolved against `baseUrl`.
 *
 * @param doc      - The document to extract from.
 * @param baseUrl  - The absolute URL of the page (used to resolve relative URLs).
 * @returns An array of discovered video {@link MediaResource} objects.
 *
 * @public
 */
export function extractVideos(
  doc: DocumentLike,
  baseUrl: string,
): MediaResource[] {
  const results: MediaResource[] = [];

  // <video> elements (src, <source> children, poster)
  extractFromVideoElements(doc, baseUrl, results);

  // Direct <a href> video links
  extractFromVideoLinks(doc, baseUrl, results);

  // Streaming URLs in inline scripts
  extractStreamUrlsFromScripts(doc, baseUrl, results);

  // Platform-specific CDN video URLs (Douyin, TikTok, etc.)
  extractPlatformVideoUrls(doc, baseUrl, results);

  // Embedded iframe players
  extractFromIframeEmbeds(doc, baseUrl, results);

  // Standalone <source> elements with streaming URLs
  extractFromStandaloneSources(doc, baseUrl, results);

  return results;
}
