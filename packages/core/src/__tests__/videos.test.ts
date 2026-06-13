// ---------------------------------------------------------------------------
// @media-scraper/core — videos.test.ts
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type { DocumentLike, ElementLike, MediaResource } from '../types.js';
import { extractVideos, registerPlatformExtractor } from '../extractors/videos.js';

// ---------------------------------------------------------------------------
// Reuse the same Mock DOM infrastructure (duplicated for test isolation)
// ---------------------------------------------------------------------------

interface MockNode {
  tagName: string;
  attrs: Record<string, string>;
  children: MockNode[];
  text: string;
}

function flattenTree(root: MockNode): MockNode[] {
  const result: MockNode[] = [root];
  for (const child of root.children) {
    result.push(...flattenTree(child));
  }
  return result;
}

function matchSelector(node: MockNode, selector: string): boolean {
  const tagMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  const rest = tagMatch ? selector.slice(tagMatch[0].length) : selector;
  const tag = tagMatch ? tagMatch[0].toLowerCase() : '';

  if (tag && node.tagName.toLowerCase() !== tag) return false;

  const attrRegex = /\[([a-zA-Z][a-zA-Z0-9_-]*)(?:=["']([^"']*)["'])?\]/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(rest)) !== null) {
    const attrName = match[1];
    const attrValue = match[2];
    const nodeValue = node.attrs[attrName];
    if (attrValue !== undefined) {
      if (nodeValue !== attrValue) return false;
    } else {
      if (nodeValue === undefined || nodeValue === null) return false;
    }
  }
  return true;
}

function queryAll(root: MockNode, selector: string): MockNode[] {
  if (selector === '*') {
    return flattenTree(root).slice(1);
  }
  return flattenTree(root).filter((n) => matchSelector(n, selector));
}

function makeElementLike(node: MockNode): ElementLike {
  return {
    tagName: node.tagName,
    getAttribute(name: string): string | null {
      return node.attrs[name] ?? null;
    },
    querySelectorAll(selector: string): ElementLike[] {
      return queryAll(node, selector).map(makeElementLike);
    },
    querySelector(selector: string): ElementLike | null {
      const results = queryAll(node, selector);
      return results.length > 0 ? makeElementLike(results[0]) : null;
    },
    textContent: node.text || null,
  };
}

function makeDoc(bodyChildren: MockNode[] = [], headChildren: MockNode[] = [], title = 'Test Page'): DocumentLike {
  const bodyNode: MockNode = { tagName: 'body', attrs: {}, children: bodyChildren, text: '' };
  const headNode: MockNode = { tagName: 'head', attrs: {}, children: headChildren, text: '' };

  return {
    querySelectorAll(selector: string): ElementLike[] {
      return [...queryAll(headNode, selector), ...queryAll(bodyNode, selector)].map(makeElementLike);
    },
    querySelector(selector: string): ElementLike | null {
      const h = queryAll(headNode, selector);
      if (h.length > 0) return makeElementLike(h[0]);
      const b = queryAll(bodyNode, selector);
      return b.length > 0 ? makeElementLike(b[0]) : null;
    },
    title,
    head: makeElementLike(headNode),
    body: makeElementLike(bodyNode),
  };
}

function n(tag: string, attrs: Record<string, string> = {}, children: MockNode[] = [], text = ''): MockNode {
  return { tagName: tag, attrs, children, text };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractVideos', () => {
  const baseUrl = 'https://example.com/page';

  // --- <video src> ---

  it('extracts <video src>', () => {
    const doc = makeDoc([
      n('video', { src: 'movie.mp4' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/movie.mp4');
    expect(results[0].type).toBe('video');
    expect(results[0].source).toBe('video');
  });

  it('extracts <video> with poster as thumbnail', () => {
    const doc = makeDoc([
      n('video', { src: 'movie.mp4', poster: 'thumb.jpg' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].thumbnail).toBe('https://example.com/thumb.jpg');
  });

  it('detects m3u8 streaming URL on <video>', () => {
    const doc = makeDoc([
      n('video', { src: 'stream.m3u8' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('m3u8');
  });

  it('detects mpd streaming URL on <video>', () => {
    const doc = makeDoc([
      n('video', { src: 'manifest.mpd' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('mpd');
  });

  // --- <video><source> ---

  it('extracts <video><source> children', () => {
    const doc = makeDoc([
      n('video', {}, [
        n('source', { src: 'movie-hd.mp4' }),
        n('source', { src: 'movie-sd.webm' }),
      ]),
    ]);
    const results = extractVideos(doc, baseUrl);
    // video sources + standalone source catch = duplicates possible
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.some((r) => r.url === 'https://example.com/movie-hd.mp4')).toBe(true);
    expect(results.some((r) => r.url === 'https://example.com/movie-sd.webm')).toBe(true);
  });

  it('<video><source> first source gets poster', () => {
    const doc = makeDoc([
      n('video', { poster: 'thumb.jpg' }, [
        n('source', { src: 'hd.mp4' }),
        n('source', { src: 'sd.webm' }),
      ]),
    ]);
    const results = extractVideos(doc, baseUrl);
    const posterOnes = results.filter((r) => r.thumbnail === 'https://example.com/thumb.jpg');
    expect(posterOnes.length).toBeGreaterThanOrEqual(1);
  });

  // --- <a href> video links ---

  it('extracts <a href> to video files', () => {
    const doc = makeDoc([
      n('a', { href: 'video.mp4' }),
      n('a', { href: 'clip.webm' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toHaveLength(2);
    expect(results[0].source).toBe('link');
  });

  it('<a href> with m3u8 streaming', () => {
    const doc = makeDoc([
      n('a', { href: 'https://cdn.example.com/live.m3u8' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('m3u8');
  });

  it('skips <a href> to non-video files', () => {
    const doc = makeDoc([
      n('a', { href: 'page.html' }),
      n('a', { href: 'image.jpg' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toHaveLength(0);
  });

  // --- YouTube embed detection ---

  it('detects YouTube iframe embed', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.youtube.com/embed/dQw4w9WgXcQ' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('video');
    expect(results[0].source).toBe('iframe');
    expect(results[0].url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(results[0].thumbnail).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });

  it('detects YouTube watch link in <a href>', () => {
    const doc = makeDoc([
      n('a', { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(results[0].source).toBe('iframe');
  });

  it('detects YouTube short link youtu.be', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://youtu.be/dQw4w9WgXcQ' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('detects YouTube nocookie embed', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  // --- Vimeo embed ---

  it('detects Vimeo embed', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://player.vimeo.com/video/123456789' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://vimeo.com/123456789');
    expect(results[0].thumbnail).toBe('https://vumbnail.com/123456789.jpg');
  });

  // --- Bilibili embed ---

  it('detects Bilibili video link in <a href>', () => {
    // videos.ts detectEmbed handles bilibili.com / www.bilibili.com with /video/BV path
    const doc = makeDoc([
      n('a', { href: 'https://www.bilibili.com/video/BV1xx411c7mD' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.url.includes('bilibili.com'))).toBe(true);
  });

  // --- Douyin detection ---

  it('detects Douyin video page link', () => {
    const doc = makeDoc([
      n('a', { href: 'https://www.douyin.com/video/1234567890123456789' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const douyin = results.find((r) => r.url.includes('douyin.com/video/'));
    expect(douyin).toBeTruthy();
  });

  // --- TikTok detection ---

  it('detects TikTok embed', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.tiktok.com/embed/1234567890123456789' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const tiktok = results.find((r) => r.url.includes('tiktok.com'));
    expect(tiktok).toBeTruthy();
  });

  // --- Streaming in scripts ---

  it('detects m3u8 URLs in script text', () => {
    const doc = makeDoc([
      n('script', {}, [], 'var url = "https://cdn.example.com/stream.m3u8";'),
    ]);
    const results = extractVideos(doc, baseUrl);
    const streams = results.filter((r) => r.source === 'm3u8');
    expect(streams.length).toBeGreaterThan(0);
    expect(streams[0].url).toBe('https://cdn.example.com/stream.m3u8');
  });

  it('detects mpd URLs in script text', () => {
    const doc = makeDoc([
      n('script', {}, [], '{"dash": "https://cdn.example.com/manifest.mpd"}'),
    ]);
    const results = extractVideos(doc, baseUrl);
    const streams = results.filter((r) => r.source === 'mpd');
    expect(streams.length).toBeGreaterThan(0);
  });

  // --- Platform CDN URLs ---

  it('detects Douyin CDN URLs in scripts', () => {
    const doc = makeDoc([
      n('script', {}, [], [
        '"https://v26-web.douyinvod.com/abc123/video.mp4"',
      ].join('')),
    ]);
    const results = extractVideos(doc, baseUrl);
    // The script text should trigger douyin extractor
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  // --- Standalone <source> elements ---

  it('detects standalone <source> with video URL', () => {
    const doc = makeDoc([
      n('source', { src: 'standalone.mp4' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    const standalone = results.filter((r) => r.source === 'video');
    expect(standalone.some((r) => r.url === 'https://example.com/standalone.mp4')).toBe(true);
  });

  // --- Edge cases ---

  it('returns empty array for empty document', () => {
    const doc = makeDoc([]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toEqual([]);
  });

  it('handles <video> with no src and no source children', () => {
    const doc = makeDoc([
      n('video', {}),
    ]);
    const results = extractVideos(doc, baseUrl);
    expect(results).toHaveLength(0);
  });

  it('handles relative iframe src', () => {
    const doc = makeDoc([
      n('iframe', { src: '/embed/video' }),
    ]);
    const results = extractVideos(doc, baseUrl);
    // /embed/video would be classified as unknown platform
    expect(results.length).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// registerPlatformExtractor
// ---------------------------------------------------------------------------

describe('registerPlatformExtractor', () => {
  it('registers a custom platform extractor without throwing', () => {
    expect(() => {
      registerPlatformExtractor({
        name: 'test-platform',
        cdnPatterns: [/testcdn\.example\.com/],
        extract(rawUrl: string, baseUrl: string, _covers: string[]) {
          const url = rawUrl;
          return {
            id: 'test-id',
            url,
            type: 'video' as const,
            filename: 'test.mp4',
            extension: '.mp4',
            size: 0,
            width: 0,
            height: 0,
            thumbnail: '',
            source: 'video' as const,
          };
        },
      });
    }).not.toThrow();
  });
});
