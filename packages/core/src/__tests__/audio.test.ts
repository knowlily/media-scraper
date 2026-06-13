// ---------------------------------------------------------------------------
// @media-scraper/core — audio.test.ts
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type { DocumentLike, ElementLike, MediaResource } from '../types.js';
import { extractAudio } from '../extractors/audio.js';

// ---------------------------------------------------------------------------
// Mock DOM (same pattern as other test files)
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
  if (selector === '*') return flattenTree(root).slice(1);
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

describe('extractAudio', () => {
  const baseUrl = 'https://example.com/page';

  // --- <audio src> ---

  it('extracts <audio src>', () => {
    const doc = makeDoc([
      n('audio', { src: 'song.mp3' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/song.mp3');
    expect(results[0].type).toBe('audio');
  });

  it('extracts <audio src> with .ogg', () => {
    const doc = makeDoc([
      n('audio', { src: 'music.ogg' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].extension).toBe('.ogg');
  });

  it('extracts <audio src> with .flac', () => {
    const doc = makeDoc([
      n('audio', { src: 'lossless.flac' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].extension).toBe('.flac');
  });

  // --- <audio><source> ---

  it('extracts <audio><source> children', () => {
    const doc = makeDoc([
      n('audio', {}, [
        n('source', { src: 'song.mp3' }),
        n('source', { src: 'song.ogg' }),
      ]),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('handles <audio> with no src and no sources', () => {
    const doc = makeDoc([
      n('audio', {}),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results).toHaveLength(0);
  });

  // --- <a href> audio files ---

  it('extracts <a href> to audio files', () => {
    const doc = makeDoc([
      n('a', { href: 'song.mp3' }),
      n('a', { href: 'podcast.m4a' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((r) => r.type === 'audio')).toBe(true);
  });

  it('skips <a href> to non-audio files', () => {
    const doc = makeDoc([
      n('a', { href: 'page.html' }),
      n('a', { href: 'image.jpg' }),
      n('a', { href: 'video.mp4' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results).toHaveLength(0);
  });

  it('skips <a href> with javascript: pseudo-URL', () => {
    const doc = makeDoc([
      n('a', { href: 'javascript:void(0)' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results).toHaveLength(0);
  });

  it('skips <a href> with # anchor', () => {
    const doc = makeDoc([
      n('a', { href: '#section' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results).toHaveLength(0);
  });

  // --- <meta og:audio> ---

  it('extracts <meta og:audio>', () => {
    const doc = makeDoc([], [
      n('meta', { property: 'og:audio', content: 'https://example.com/podcast.mp3' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/podcast.mp3')).toBe(true);
    const audio = results.find((r) => r.url === 'https://example.com/podcast.mp3');
    expect(audio?.source).toBe('head-meta');
  });

  it('extracts <meta twitter:audio>', () => {
    const doc = makeDoc([], [
      n('meta', { name: 'twitter:audio', content: 'https://example.com/twaudio.mp3' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/twaudio.mp3')).toBe(true);
  });

  // --- JSON-LD audio ---

  it('extracts JSON-LD AudioObject', () => {
    const json = JSON.stringify({
      '@type': 'AudioObject',
      contentUrl: 'https://example.com/audio-ld.mp3',
    });
    const doc = makeDoc([], [
      n('script', { type: 'application/ld+json' }, [], json),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/audio-ld.mp3')).toBe(true);
  });

  it('extracts JSON-LD MusicRecording', () => {
    const json = JSON.stringify({
      '@type': 'MusicRecording',
      url: 'https://example.com/music.mp3',
    });
    const doc = makeDoc([], [
      n('script', { type: 'application/ld+json' }, [], json),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/music.mp3')).toBe(true);
  });

  it('extracts JSON-LD array of items', () => {
    const json = JSON.stringify([
      { '@type': 'AudioObject', contentUrl: 'https://example.com/audio1.mp3' },
      { '@type': 'AudioObject', contentUrl: 'https://example.com/audio2.mp3' },
    ]);
    const doc = makeDoc([], [
      n('script', { type: 'application/ld+json' }, [], json),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/audio1.mp3')).toBe(true);
    expect(results.some((r) => r.url === 'https://example.com/audio2.mp3')).toBe(true);
  });

  it('handles JSON-LD audio property as string', () => {
    const json = JSON.stringify({
      '@type': 'WebPage',
      audio: 'https://example.com/page-audio.mp3',
    });
    const doc = makeDoc([], [
      n('script', { type: 'application/ld+json' }, [], json),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/page-audio.mp3')).toBe(true);
  });

  it('handles invalid JSON-LD gracefully', () => {
    const doc = makeDoc([], [
      n('script', { type: 'application/ld+json' }, [], 'not json {{{'),
    ]);
    expect(() => extractAudio(doc, baseUrl)).not.toThrow();
  });

  // --- Audio streaming ---

  it('detects m3u8 streaming in script text', () => {
    const longScript = 'x'.repeat(100) + '"https://stream.example.com/audio.m3u8"';
    const doc = makeDoc([
      n('script', {}, [], longScript),
    ]);
    const results = extractAudio(doc, baseUrl);
    const streams = results.filter((r) => r.source === 'm3u8');
    expect(streams.length).toBeGreaterThan(0);
  });

  it('detects <audio> with m3u8 stream', () => {
    const doc = makeDoc([
      n('audio', { src: 'https://radio.example.com/live.m3u8' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('m3u8');
  });

  // --- Standalone <source> elements ---

  it('extracts standalone <source> with audio extension', () => {
    const doc = makeDoc([
      n('source', { src: 'standalone.wav' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/standalone.wav')).toBe(true);
  });

  // --- Edge cases ---

  it('returns empty array for empty document', () => {
    const doc = makeDoc([]);
    expect(extractAudio(doc, baseUrl)).toEqual([]);
  });

  it('deduplicates same URL from multiple sources', () => {
    const doc = makeDoc([
      n('audio', { src: 'song.mp3' }),
      n('a', { href: 'song.mp3' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    // Should deduplicate same URL
    const songUrls = results.filter((r) => r.url === 'https://example.com/song.mp3');
    expect(songUrls).toHaveLength(1);
  });

  it('handles wma format', () => {
    const doc = makeDoc([
      n('a', { href: 'legacy.wma' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].extension).toBe('.wma');
  });

  it('handles opus format', () => {
    const doc = makeDoc([
      n('a', { href: 'speech.opus' }),
    ]);
    const results = extractAudio(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].extension).toBe('.opus');
  });
});
