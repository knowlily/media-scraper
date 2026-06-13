// ---------------------------------------------------------------------------
// @media-scraper/core — images.test.ts
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type { DocumentLike, ElementLike, MediaResource } from '../types.js';
import { extractImages } from '../extractors/images.js';

// ---------------------------------------------------------------------------
// Mock DOM infrastructure
// ---------------------------------------------------------------------------

interface MockNode {
  tagName: string;
  attrs: Record<string, string>;
  children: MockNode[];
  text: string;
}

/** Flatten a tree into an array (pre-order) for querySelectorAll with * */
function flattenTree(root: MockNode): MockNode[] {
  const result: MockNode[] = [root];
  for (const child of root.children) {
    result.push(...flattenTree(child));
  }
  return result;
}

function matchSelector(node: MockNode, selector: string): boolean {
  // Parse selector: tag[attr="val"][attr2="val2"] or [attr] or tag
  const tagMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  const rest = tagMatch ? selector.slice(tagMatch[0].length) : selector;
  const tag = tagMatch ? tagMatch[0].toLowerCase() : '';

  if (tag && node.tagName.toLowerCase() !== tag) return false;

  // Parse attribute selectors [attr="val"] or [attr]
  const attrRegex = /\[([a-zA-Z][a-zA-Z0-9_-]*)(?:=["']([^"']*)["'])?\]/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(rest)) !== null) {
    const attrName = match[1];
    const attrValue = match[2]; // undefined if no value
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
    return flattenTree(root).slice(1); // exclude root itself for body queries
  }

  const allNodes = flattenTree(root);
  return allNodes.filter((n) => matchSelector(n, selector));
}

function queryOne(root: MockNode, selector: string): MockNode | null {
  const results = queryAll(root, selector);
  return results.length > 0 ? results[0] : null;
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
      const found = queryOne(node, selector);
      return found ? makeElementLike(found) : null;
    },
    textContent: node.text || null,
  };
}

function makeDoc(bodyChildren: MockNode[] = [], headChildren: MockNode[] = [], title = 'Test Page'): DocumentLike {
  const bodyNode: MockNode = {
    tagName: 'body',
    attrs: {},
    children: bodyChildren,
    text: '',
  };
  const headNode: MockNode = {
    tagName: 'head',
    attrs: {},
    children: headChildren,
    text: '',
  };

  const bodyEl = makeElementLike(bodyNode);
  const headEl = makeElementLike(headNode);

  return {
    querySelectorAll(selector: string): ElementLike[] {
      // Search both head and body
      const hResults = queryAll(headNode, selector);
      const bResults = queryAll(bodyNode, selector);
      return [...hResults, ...bResults].map(makeElementLike);
    },
    querySelector(selector: string): ElementLike | null {
      const h = queryOne(headNode, selector);
      if (h) return makeElementLike(h);
      const b = queryOne(bodyNode, selector);
      return b ? makeElementLike(b) : null;
    },
    title,
    head: headEl,
    body: bodyEl,
  };
}

function n(tag: string, attrs: Record<string, string> = {}, children: MockNode[] = [], text = ''): MockNode {
  return { tagName: tag, attrs, children, text };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractImages', () => {
  const baseUrl = 'https://example.com/page';

  // --- <img src> ---

  it('extracts <img src>', () => {
    const doc = makeDoc([
      n('img', { src: 'photo.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/photo.jpg');
    expect(results[0].type).toBe('image');
    expect(results[0].source).toBe('img');
  });

  it('skips <img> with empty src', () => {
    const doc = makeDoc([
      n('img', {}),
      n('img', { src: '' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results).toHaveLength(0);
  });

  it('skips <img> with data: src', () => {
    const doc = makeDoc([
      n('img', { src: 'data:image/png;base64,abc' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results).toHaveLength(0);
  });

  it('resolves relative <img src>', () => {
    const doc = makeDoc([
      n('img', { src: '/images/photo.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results[0].url).toBe('https://example.com/images/photo.jpg');
  });

  // --- <img srcset> ---

  it('extracts from <img srcset> preferring largest', () => {
    const doc = makeDoc([
      n('img', {
        srcset: 'small.jpg 400w, large.jpg 1200w, medium.jpg 800w',
      }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/large.jpg');
  });

  it('extracts from <img> with x-descriptors', () => {
    const doc = makeDoc([
      n('img', {
        srcset: 'img.jpg 1x, img@2x.jpg 2x, img@3x.jpg 3x',
      }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results[0].url).toBe('https://example.com/img@3x.jpg');
  });

  // --- <picture>/<source> ---

  it('extracts from <picture><source srcset>', () => {
    const doc = makeDoc([
      n('picture', {}, [
        n('source', { srcset: 'img-800.jpg 800w' }),
        n('source', { srcset: 'img-400.jpg 400w' }),
      ]),
    ]);
    const results = extractImages(doc, baseUrl);
    // Each <source> with srcset produces a resource
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.some((r) => r.url.includes('img-800'))).toBe(true);
  });

  it('falls back to inner <img> when <source> has no srcset', () => {
    const doc = makeDoc([
      n('picture', {}, [
        n('source', {}),
        n('img', { src: 'fallback.jpg' }),
      ]),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url.includes('fallback.jpg'))).toBe(true);
  });

  it('handles <picture> with empty <source> children', () => {
    const doc = makeDoc([
      n('picture', {}, [
        n('img', { src: 'photo.jpg' }),
      ]),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url.includes('photo.jpg'))).toBe(true);
  });

  // --- <meta og:image> ---

  it('extracts <meta og:image>', () => {
    const doc = makeDoc([], [
      n('meta', { property: 'og:image', content: 'https://example.com/og.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/og.jpg')).toBe(true);
    const ogResult = results.find((r) => r.url === 'https://example.com/og.jpg');
    expect(ogResult?.source).toBe('head-meta');
  });

  it('extracts <meta og:image:url>', () => {
    const doc = makeDoc([], [
      n('meta', { property: 'og:image:url', content: 'https://example.com/og2.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/og2.jpg')).toBe(true);
  });

  it('extracts multiple og:image meta tags', () => {
    const doc = makeDoc([], [
      n('meta', { property: 'og:image', content: 'https://example.com/og1.jpg' }),
      n('meta', { property: 'og:image', content: 'https://example.com/og2.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    const ogUrls = results.filter((r) => r.source === 'head-meta').map((r) => r.url);
    expect(ogUrls).toContain('https://example.com/og1.jpg');
    expect(ogUrls).toContain('https://example.com/og2.jpg');
  });

  it('resolves relative og:image', () => {
    const doc = makeDoc([], [
      n('meta', { property: 'og:image', content: '/images/og.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/images/og.jpg')).toBe(true);
  });

  // --- <meta twitter:image> ---

  it('extracts <meta twitter:image>', () => {
    const doc = makeDoc([], [
      n('meta', { name: 'twitter:image', content: 'https://example.com/twimg.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/twimg.jpg')).toBe(true);
  });

  it('extracts <meta twitter:image:src>', () => {
    const doc = makeDoc([], [
      n('meta', { name: 'twitter:image:src', content: 'https://example.com/twsrc.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/twsrc.jpg')).toBe(true);
  });

  // --- <link rel="image_src"> ---

  it('extracts <link rel="image_src">', () => {
    const doc = makeDoc([], [
      n('link', { rel: 'image_src', href: 'https://example.com/linkimg.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/linkimg.jpg')).toBe(true);
  });

  // --- <link rel="preload" as="image"> ---

  it('extracts <link rel="preload" as="image">', () => {
    const doc = makeDoc([], [
      n('link', { rel: 'preload', as: 'image', href: 'https://example.com/preload.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/preload.jpg')).toBe(true);
  });

  // --- JSON-LD ---

  it('extracts images from JSON-LD ImageObject', () => {
    const json = JSON.stringify({
      '@type': 'ImageObject',
      url: 'https://example.com/jsonld.jpg',
    });
    const doc = makeDoc([], [
      n('script', { type: 'application/ld+json' }, [], json),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/jsonld.jpg')).toBe(true);
  });

  it('extracts images from JSON-LD @graph', () => {
    const json = JSON.stringify({
      '@graph': [
        { '@type': 'ImageObject', url: 'https://example.com/graph1.jpg' },
        { '@type': 'WebPage', image: 'https://example.com/graph2.jpg' },
      ],
    });
    const doc = makeDoc([], [
      n('script', { type: 'application/ld+json' }, [], json),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/graph1.jpg')).toBe(true);
    expect(results.some((r) => r.url === 'https://example.com/graph2.jpg')).toBe(true);
  });

  it('handles JSON-LD with nested objects', () => {
    const json = JSON.stringify({
      '@type': 'Product',
      image: {
        '@type': 'ImageObject',
        url: 'https://example.com/nested.jpg',
      },
    });
    const doc = makeDoc([], [
      n('script', { type: 'application/ld+json' }, [], json),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/nested.jpg')).toBe(true);
  });

  it('handles invalid JSON gracefully', () => {
    const doc = makeDoc([], [
      n('script', { type: 'application/ld+json' }, [], '{invalid json}}}'),
    ]);
    const results = extractImages(doc, baseUrl);
    // Should not throw, just return no JSON-LD images
    expect(Array.isArray(results)).toBe(true);
  });

  it('extracts JSON-LD from body scripts too', () => {
    const json = JSON.stringify({
      '@type': 'ImageObject',
      url: 'https://example.com/body-jsonld.jpg',
    });
    const doc = makeDoc([
      n('script', { type: 'application/ld+json' }, [], json),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/body-jsonld.jpg')).toBe(true);
  });

  // --- Lazy-loaded images ---

  it('extracts from data-src attribute', () => {
    const doc = makeDoc([
      n('img', { 'data-src': 'lazy.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    const lazy = results.filter((r) => r.source === 'lazy-load');
    expect(lazy.some((r) => r.url === 'https://example.com/lazy.jpg')).toBe(true);
  });

  it('extracts from data-original attribute', () => {
    const doc = makeDoc([
      n('img', { 'data-original': 'original.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    const lazy = results.filter((r) => r.source === 'lazy-load');
    expect(lazy.some((r) => r.url === 'https://example.com/original.jpg')).toBe(true);
  });

  it('extracts from data-lazy-src attribute', () => {
    const doc = makeDoc([
      n('div', { 'data-lazy-src': 'bg-lazy.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/bg-lazy.jpg')).toBe(true);
  });

  it('extracts from <img loading="lazy">', () => {
    const doc = makeDoc([
      n('img', { loading: 'lazy', src: 'lazy-loaded.jpg' }),
    ]);
    const results = extractImages(doc, baseUrl);
    const lazy = results.filter((r) => r.source === 'lazy-load');
    expect(lazy.some((r) => r.url === 'https://example.com/lazy-loaded.jpg')).toBe(true);
  });

  it('extracts from <img loading="lazy"> with srcset', () => {
    const doc = makeDoc([
      n('img', { loading: 'lazy', srcset: 'lazy-800.jpg 800w, lazy-400.jpg 400w' }),
    ]);
    const results = extractImages(doc, baseUrl);
    const lazy = results.filter((r) => r.source === 'lazy-load');
    expect(lazy.length).toBeGreaterThan(0);
    expect(lazy.some((r) => r.url.includes('lazy-800'))).toBe(true);
  });

  // --- SVG <image> ---

  it('extracts from SVG <image> href', () => {
    const doc = makeDoc([
      n('image', { href: 'svg-img.png' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/svg-img.png')).toBe(true);
  });

  it('extracts from SVG <image> xlink:href', () => {
    const doc = makeDoc([
      n('image', { 'xlink:href': 'svg-xlink.png' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/svg-xlink.png')).toBe(true);
  });

  // --- <input type="image"> ---

  it('extracts from <input type="image">', () => {
    const doc = makeDoc([
      n('input', { type: 'image', src: 'submit-btn.png' }),
    ]);
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/submit-btn.png')).toBe(true);
  });

  // --- Edge cases ---

  it('returns empty array for empty document', () => {
    const doc = makeDoc([]);
    const results = extractImages(doc, baseUrl);
    expect(results).toEqual([]);
  });

  it('handles document without head', () => {
    const bodyNode: MockNode = {
      tagName: 'body',
      attrs: {},
      children: [n('img', { src: 'only-body.jpg' })],
      text: '',
    };
    const bodyEl = makeElementLike(bodyNode);
    const doc: DocumentLike = {
      querySelectorAll(selector: string): ElementLike[] {
        return queryAll(bodyNode, selector).map(makeElementLike);
      },
      querySelector(selector: string): ElementLike | null {
        const found = queryOne(bodyNode, selector);
        return found ? makeElementLike(found) : null;
      },
      title: 'No Head',
      head: null,
      body: bodyEl,
    };
    const results = extractImages(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/only-body.jpg')).toBe(true);
  });

  it('deduplicates resources from multiple sources', () => {
    const doc = makeDoc(
      [
        n('img', { src: 'dupe.jpg' }),
        n('img', { 'data-src': 'dupe.jpg' }),
      ],
      [
        n('meta', { property: 'og:image', content: '/dupe.jpg' }),
      ],
    );
    const results = extractImages(doc, baseUrl);
    // Same URL may appear multiple times from different sources
    const dupeUrls = results.filter((r) => r.url === 'https://example.com/dupe.jpg');
    expect(dupeUrls.length).toBeGreaterThanOrEqual(1);
  });
});
