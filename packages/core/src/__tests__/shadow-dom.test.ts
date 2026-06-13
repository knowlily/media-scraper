// ---------------------------------------------------------------------------
// @media-scraper/core — shadow-dom.test.ts
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type { ElementLike, MediaResource } from '../types.js';
import { extractShadowDomMedia } from '../extractors/shadow-dom.js';

// ---------------------------------------------------------------------------
// Simplified mock for shadow-dom tests
// ---------------------------------------------------------------------------

interface MockNode {
  tagName: string;
  attrs: Record<string, string>;
  children: MockNode[];
  text: string;
}

function flattenTree(root: MockNode): MockNode[] {
  const result: MockNode[] = [root];
  for (const child of root.children) result.push(...flattenTree(child));
  return result;
}

function queryAll(root: MockNode, selector: string): MockNode[] {
  if (selector === '*') return flattenTree(root).slice(1);
  // Simple tag matching
  return flattenTree(root).filter((n) => {
    const tagMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
    if (tagMatch && n.tagName.toLowerCase() !== tagMatch[0].toLowerCase()) return false;
    return true;
  });
}

function makeElementLike(node: MockNode): ElementLike {
  return {
    tagName: node.tagName,
    getAttribute(name: string): string | null { return node.attrs[name] ?? null; },
    querySelectorAll(selector: string): ElementLike[] {
      return queryAll(node, selector).map(makeElementLike);
    },
    querySelector(selector: string): ElementLike | null {
      const r = queryAll(node, selector);
      return r.length > 0 ? makeElementLike(r[0]) : null;
    },
    textContent: node.text || null,
  };
}

function n(tag: string, attrs: Record<string, string> = {}, children: MockNode[] = [], text = ''): MockNode {
  return { tagName: tag, attrs, children, text };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractShadowDomMedia', () => {
  const baseUrl = 'https://example.com/';

  it('extracts images from light DOM without shadow walker', () => {
    const root = n('div', {}, [
      n('img', { src: 'photo.jpg' }),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/photo.jpg');
    expect(results[0].source).toBe('shadow-dom');
  });

  it('extracts video from light DOM', () => {
    const root = n('div', {}, [
      n('video', { src: 'movie.mp4' }),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('video');
    expect(results[0].url).toBe('https://example.com/movie.mp4');
  });

  it('extracts video with poster as image', () => {
    const root = n('div', {}, [
      n('video', { src: 'movie.mp4', poster: 'poster.jpg' }),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.some((r) => r.url === 'https://example.com/movie.mp4')).toBe(true);
    expect(results.some((r) => r.url === 'https://example.com/poster.jpg')).toBe(true);
  });

  it('extracts video source children', () => {
    const root = n('div', {}, [
      n('video', {}, [
        n('source', { src: 'hd.mp4' }),
        n('source', { src: 'sd.webm' }),
      ]),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts audio from light DOM', () => {
    const root = n('div', {}, [
      n('audio', { src: 'song.mp3' }),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('audio');
  });

  it('extracts audio source children', () => {
    const root = n('div', {}, [
      n('audio', {}, [
        n('source', { src: 'song.ogg' }),
        n('source', { src: 'song.mp3' }),
      ]),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts <a href> links', () => {
    const root = n('div', {}, [
      n('a', { href: 'https://example.com/file.pdf' }),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/file.pdf');
  });

  it('skips <a href> with javascript:', () => {
    const root = n('div', {}, [
      n('a', { href: 'javascript:void(0)' }),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl);
    expect(results).toHaveLength(0);
  });

  it('skips <a href> with # anchor', () => {
    const root = n('div', {}, [
      n('a', { href: '#section' }),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl);
    expect(results).toHaveLength(0);
  });

  it('extracts <img data-src> (lazy load)', () => {
    const root = n('div', {}, [
      n('img', { 'data-src': 'lazy.jpg' }),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/lazy.jpg');
  });

  it('extracts standalone <source> elements', () => {
    const root = n('div', {}, [
      n('source', { src: 'media.mp4' }),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('video');
  });

  it('deduplicates same URL', () => {
    const root = n('div', {}, [
      n('img', { src: 'same.jpg' }),
      n('img', { src: 'same.jpg' }),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl);
    expect(results).toHaveLength(1);
  });

  it('returns empty array for element with no media', () => {
    const root = n('div', {}, [
      n('p', {}, [], 'Hello World'),
      n('span', {}),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl);
    expect(results).toEqual([]);
  });

  // --- Shadow DOM walker ---

  it('calls walkShadowFn and extracts from shadow children', () => {
    const shadowChild = n('img', { src: 'shadow-img.jpg' });
    const root = n('div', {}, []);
    const rootEl = makeElementLike(root);

    const walkFn = (el: ElementLike): ElementLike[] => {
      // Only return shadow children for div elements, to avoid infinite recursion
      // (the walkFn is called for every element in the tree, including the
      // shadow children that were previously returned).
      if (el.tagName?.toLowerCase() !== 'div') return [];
      return [makeElementLike(shadowChild)];
    };

    const results = extractShadowDomMedia(rootEl, baseUrl, walkFn);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/shadow-img.jpg');
    expect(results[0].source).toBe('shadow-dom');
  });

  it('handles walkShadowFn returning empty array', () => {
    const root = n('div', {}, []);
    const rootEl = makeElementLike(root);

    const walkFn = (_el: ElementLike): ElementLike[] => [];

    const results = extractShadowDomMedia(rootEl, baseUrl, walkFn);
    expect(results).toEqual([]);
  });

  it('recursively walks nested shadow DOM', () => {
    // Two levels: div has shadow child span, span has shadow child img
    const root = n('div', {}, []);
    const rootEl = makeElementLike(root);

    // Use a map to control which elements have shadow children
    const shadowMap = new Map<string, MockNode[]>();
    shadowMap.set('div', [n('span', {}, [])]);
    shadowMap.set('span', [n('img', { src: 'nested.jpg' })]);

    const walkFn = (el: ElementLike): ElementLike[] => {
      const children = shadowMap.get(el.tagName.toLowerCase());
      return children ? children.map(makeElementLike) : [];
    };

    const results = extractShadowDomMedia(rootEl, baseUrl, walkFn);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/nested.jpg');
  });

  it('handles undefined walkShadowFn gracefully', () => {
    const root = n('div', {}, [
      n('img', { src: 'photo.jpg' }),
    ]);
    const rootEl = makeElementLike(root);
    const results = extractShadowDomMedia(rootEl, baseUrl, undefined);
    expect(results).toHaveLength(1);
  });
});
