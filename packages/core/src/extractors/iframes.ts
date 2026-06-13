// ---------------------------------------------------------------------------
// @media-scraper/core — iframe media extractor
// ---------------------------------------------------------------------------

import type { DocumentLike, ElementLike, MediaResource } from '../types.js';
import { isMediaUrl } from '../utils.js';
import { makeResource } from './helpers.js';

// ---------------------------------------------------------------------------
// Known video platform patterns
// ---------------------------------------------------------------------------

interface PlatformMatch {
  /** Human-readable label for the platform. */
  platform: string;
  /** Thumbnail URL builder — receives the video ID and returns an HTTPS URL. */
  thumbnail: (id: string) => string;
}

/**
 * Try to extract a known video platform ID from an iframe `src` URL.
 *
 * Returns the platform metadata + the extracted ID, or `null` when the URL
 * doesn't match any known provider.
 */
function matchPlatform(href: string): (PlatformMatch & { id: string }) | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase();

  // ── YouTube ──────────────────────────────────────────────────────────
  if (
    host === 'www.youtube.com' ||
    host === 'youtube.com' ||
    host === 'm.youtube.com'
  ) {
    // /embed/{id}
    const embedMatch = u.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) {
      return {
        platform: 'youtube',
        id: embedMatch[1],
        thumbnail: (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      };
    }

    // ?v={id}
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
      return {
        platform: 'youtube',
        id: v,
        thumbnail: (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      };
    }
  }

  // youtu.be/{id}
  if (host === 'youtu.be') {
    const idMatch = u.pathname.match(/^\/([a-zA-Z0-9_-]{11})/);
    if (idMatch) {
      return {
        platform: 'youtube',
        id: idMatch[1],
        thumbnail: (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      };
    }
  }

  // ── Vimeo ─────────────────────────────────────────────────────────────
  if (
    host === 'player.vimeo.com' ||
    host === 'vimeo.com' ||
    host === 'www.vimeo.com'
  ) {
    // player.vimeo.com/video/{id}  or  vimeo.com/{id}
    const idMatch = u.pathname.match(/^\/(?:video\/)?(\d+)/);
    if (idMatch) {
      return {
        platform: 'vimeo',
        id: idMatch[1],
        thumbnail: (id) => `https://vumbnail.com/${id}.jpg`,
      };
    }
  }

  // ── Dailymotion ───────────────────────────────────────────────────────
  if (
    host === 'www.dailymotion.com' ||
    host === 'dailymotion.com'
  ) {
    // dailymotion.com/embed/video/{id}
    const idMatch = u.pathname.match(/^\/embed\/video\/([a-zA-Z0-9]+)/);
    if (idMatch) {
      return {
        platform: 'dailymotion',
        id: idMatch[1],
        thumbnail: (id) => `https://www.dailymotion.com/thumbnail/video/${id}`,
      };
    }
  }

  // ── Bilibili ──────────────────────────────────────────────────────────
  if (
    host === 'player.bilibili.com' ||
    host === 'www.bilibili.com' ||
    host === 'bilibili.com'
  ) {
    const bvid = u.searchParams.get('bvid');
    if (bvid) {
      return {
        platform: 'bilibili',
        id: bvid,
        thumbnail: (id) => `https://api.bilibili.com/x/web-interface/view?bvid=${id}`,
      };
    }
  }

  // ── Douyin (抖音) ────────────────────────────────────────────────────
  if (host === 'www.douyin.com' || host === 'douyin.com') {
    const vidMatch = u.pathname.match(/^\/video\/(\d+)/);
    if (vidMatch) {
      return { platform: 'douyin', id: vidMatch[1], thumbnail: () => '' };
    }
    const modalId = u.searchParams.get('modal_id');
    if (modalId && /^\d+$/.test(modalId)) {
      return { platform: 'douyin', id: modalId, thumbnail: () => '' };
    }
  }

  if (host === 'www.iesdouyin.com' || host === 'iesdouyin.com') {
    const vidMatch = u.pathname.match(/\/share\/video\/(\d+)/);
    if (vidMatch) {
      return { platform: 'douyin', id: vidMatch[1], thumbnail: () => '' };
    }
  }

  if (host === 'open.douyin.com') {
    const vid = u.searchParams.get('vid') || u.searchParams.get('video_id');
    if (vid) {
      return { platform: 'douyin', id: vid, thumbnail: () => '' };
    }
  }

  // ── TikTok ────────────────────────────────────────────────────────────
  if (host === 'www.tiktok.com' || host === 'tiktok.com') {
    const vidMatch = u.pathname.match(/\/video\/(\d+)/);
    if (vidMatch) {
      return { platform: 'tiktok', id: vidMatch[1], thumbnail: () => '' };
    }
    const embedMatch = u.pathname.match(/^\/embed\/(\d+)/);
    if (embedMatch) {
      return { platform: 'tiktok', id: embedMatch[1], thumbnail: () => '' };
    }
  }

  // ── Generic video embed detection ───────────────────────────────────
  const path = u.pathname.toLowerCase();
  if (path.includes('/video/') || path.includes('/embed/') || 
      path.includes('/player/') || path.includes('/play/') ||
      path.includes('/tv/') || path.includes('/watch/') ||
      host.includes('player.') || host.includes('video.') || host.includes('tv.')) {
    const id = u.pathname.split('/').filter(Boolean).pop() || 
               u.searchParams.get('id') || u.searchParams.get('vid') || 'unknown';
    return { platform: 'embed', id, thumbnail: () => '' };
  }

  // ── Tencent Video (腾讯视频) ──────────────────────────────────────
  if (host === 'v.qq.com' || host === 'm.v.qq.com') {
    const vid = u.searchParams.get('vid') || u.pathname.split('/').filter(Boolean).pop();
    if (vid) return { platform: 'tencent', id: vid, thumbnail: () => '' };
  }

  // ── iQiyi (爱奇艺) ───────────────────────────────────────────────
  if (host === 'www.iqiyi.com' || host === 'm.iqiyi.com' || host === 'iqiyi.com') {
    const vid = u.pathname.match(/(?:v_|video\/)([a-zA-Z0-9]+)/)?.[1];
    if (vid) return { platform: 'iqiyi', id: vid, thumbnail: () => '' };
  }

  // ── Youku (优酷) ──────────────────────────────────────────────────
  if (host === 'v.youku.com' || host === 'player.youku.com') {
    const vid = u.searchParams.get('vid') || u.pathname.split('/').filter(Boolean).pop();
    if (vid) return { platform: 'youku', id: vid, thumbnail: () => '' };
  }

  // ── Kuaishou (快手) ───────────────────────────────────────────────
  if (host === 'www.kuaishou.com' || host === 'kuaishou.com' || host === 'live.kuaishou.com') {
    const vid = u.pathname.match(/\/short-video\/([a-zA-Z0-9]+)/)?.[1] ||
                u.pathname.match(/\/fw\/video\/([a-zA-Z0-9]+)/)?.[1];
    if (vid) return { platform: 'kuaishou', id: vid, thumbnail: () => '' };
  }

  // ── Weibo (微博) ──────────────────────────────────────────────────
  if (host === 'weibo.com' || host === 'www.weibo.com' || host === 'm.weibo.cn') {
    if (path.includes('/tv/') || path.includes('/show/')) {
      const vid = u.searchParams.get('fid') || u.pathname.split('/').filter(Boolean).pop() || 'video';
      return { platform: 'weibo', id: vid, thumbnail: () => '' };
    }
  }

  // ── Xiaohongshu (小红书) ──────────────────────────────────────────
  if (host === 'www.xiaohongshu.com' || host === 'xhslink.com') {
    if (path.includes('/discovery/item/') || path.includes('/explore/')) {
      const vid = u.pathname.split('/').filter(Boolean).pop() || 'video';
      return { platform: 'xiaohongshu', id: vid, thumbnail: () => '' };
    }
  }

  // ── Zhihu (知乎) ──────────────────────────────────────────────────
  if (host === 'www.zhihu.com' || host === 'zhihu.com') {
    if (path.includes('/video/')) {
      const vid = u.pathname.match(/\/video\/(\d+)/)?.[1];
      if (vid) return { platform: 'zhihu', id: vid, thumbnail: () => '' };
    }
  }

  return null;
}

/**
 * Extract media from `<iframe>` elements in a DOM-like document.
 *
 * Examines every `<iframe src>` attribute.  When the `src` points to a known
 * video platform (YouTube, Vimeo, Dailymotion, Bilibili) the resource is
 * recorded as type `'video'` with a best-effort thumbnail URL.
 *
 * Unrecognised iframe `src` values are classified via {@link isMediaUrl} and
 * recorded with no thumbnail.
 *
 * **Important:** this extractor does *not* recursively enter iframe DOM
 * trees (cross-origin restrictions would prevent that in browser
 * environments). The platform layer is responsible for deep iframe
 * extraction.
 *
 * @param doc  - The document to extract from.
 * @param baseUrl - The base URL of the page (used to resolve relative URLs).
 * @returns An array of discovered iframe {@link MediaResource} objects.
 *
 * @public
 */
export function extractIframeMedia(
  doc: DocumentLike,
  baseUrl: string,
): MediaResource[] {
  const results: MediaResource[] = [];
  const seen = new Set<string>();

  const iframes: ElementLike[] = doc.querySelectorAll('iframe');
  for (const iframe of iframes) {
    const rawSrc = iframe.getAttribute('src');
    if (!rawSrc) continue;

    try {
      const resolved = new URL(rawSrc, baseUrl).href;
      if (seen.has(resolved)) continue;
      seen.add(resolved);

      const platform = matchPlatform(resolved);
      if (platform) {
        // Known video platform — store the iframe src URL as a video resource.
        const thumb = platform.thumbnail(platform.id);
        results.push(makeResource(resolved, 'video', 'iframe',
          thumb ? { thumbnail: thumb } : undefined));
      } else {
        // Unrecognised iframe — classify by extension.
        const detected = isMediaUrl(resolved);
        results.push(makeResource(resolved, detected ?? 'unknown', 'iframe'));
      }
    } catch {
      // skip unparseable URLs
    }
  }

  return results;
}
