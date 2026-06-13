// ---------------------------------------------------------------------------
// @media-scraper/core — backgrounds.test.ts
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type { DocumentLike, ElementLike, MediaResource } from '../types.js';
import { extractBackgroundImages } from '../extractors/backgrounds.js';

// ---------------------------------------------------------------------------
// Mock DOM
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

function makeDoc(bodyChildren: MockNode[] = []): DocumentLike {
  const bodyNode: MockNode = { tagName: 'body', attrs: {}, children: bodyChildren, text: '' };
  const bodyEl = makeElementLike(bodyNode);

  return {
    querySelectorAll(selector: string): ElementLike[] {
      return queryAll(bodyNode, selector).map(makeElementLike);
    },
    querySelector(selector: string): ElementLike | null {
      const results = queryAll(bodyNode, selector);
      return results.length > 0 ? makeElementLike(results[0]) : null;
    },
    title: 'Test',
    head: null,
    body: bodyEl,
  };
}

function n(tag: string, attrs: Record<string, string> = {}, children: MockNode[] = [], text = ''): MockNode {
  return { tagName: tag, attrs, children, text };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractBackgroundImages', () => {
  const baseUrl = 'https://example.com/';

  it('extracts url() from background-image inline style', () => {
    const doc = makeDoc([
      n('div', { style: 'background-image: url(bg.jpg)' }),
    ]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].url).toBe('https://example.com/bg.jpg');
    expect(result.resources[0].type).toBe('image');
    expect(result.resources[0].source).toBe('background');
  });

  it('extracts url() from background shorthand', () => {
    const doc = makeDoc([
      n('div', { style: 'background: url(hero.png) no-repeat center' }),
    ]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].url).toBe('https://example.com/hero.png');
  });

  it('extracts double-quoted url()', () => {
    const doc = makeDoc([
      n('div', { style: 'background-image: url("image.jpg")' }),
    ]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].url).toBe('https://example.com/image.jpg');
  });

  it('extracts single-quoted url()', () => {
    const doc = makeDoc([
      n('div', { style: "background-image: url('photo.png')" }),
    ]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].url).toBe('https://example.com/photo.png');
  });

  it('extracts multiple URLs from comma-separated background', () => {
    const doc = makeDoc([
      n('div', { style: 'background-image: url(bg1.jpg), url(bg2.png)' }),
    ]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toHaveLength(2);
    expect(result.resources[0].url).toBe('https://example.com/bg1.jpg');
    expect(result.resources[1].url).toBe('https://example.com/bg2.png');
  });

  it('skips data: URIs in background', () => {
    const doc = makeDoc([
      n('div', { style: 'background-image: url(data:image/png;base64,abc)' }),
    ]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toHaveLength(0);
  });

  it('skips gradient functions', () => {
    const doc = makeDoc([
      n('div', { style: 'background: linear-gradient(to bottom, red, blue)' }),
    ]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toHaveLength(0);
  });

  it('skips radial-gradient', () => {
    const doc = makeDoc([
      n('div', { style: 'background: radial-gradient(circle, red, blue)' }),
    ]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toHaveLength(0);
  });

  it('ignores non-background style properties', () => {
    const doc = makeDoc([
      n('div', { style: 'color: red; font-size: 16px; width: 100px' }),
    ]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toHaveLength(0);
  });

  it('handles elements with no style attribute', () => {
    const doc = makeDoc([
      n('div', {}),
      n('span', {}),
    ]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toEqual([]);
  });

  it('handles absolute URLs in background', () => {
    const doc = makeDoc([
      n('div', { style: 'background-image: url(https://cdn.example.com/bg.jpg)' }),
    ]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].url).toBe('https://cdn.example.com/bg.jpg');
  });

  it('deduplicates same background URL', () => {
    const doc = makeDoc([
      n('div', { style: 'background-image: url(bg.jpg)' }),
      n('span', { style: 'background-image: url(bg.jpg)' }),
    ]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toHaveLength(1);
  });

  it('returns BackgroundResult with resources and warnings', () => {
    const doc = makeDoc([
      n('div', { style: 'background-image: url(img.jpg)' }),
    ]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result).toHaveProperty('resources');
    expect(result).toHaveProperty('warnings');
    expect(Array.isArray(result.resources)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('handles empty document gracefully', () => {
    const doc = makeDoc([]);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('extracts from elements on page with many elements', () => {
    const children: MockNode[] = [];
    for (let i = 0; i < 10; i++) {
      children.push(n('div', { style: `background-image: url(bg${i}.jpg)` }));
    }
    const doc = makeDoc(children);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.resources).toHaveLength(10);
  });

  it('generates warning when exceeding MAX_ELEMENTS', () => {
    const children: MockNode[] = [];
    // Create > 2000 elements
    for (let i = 0; i < 2100; i++) {
      children.push(n('div', { style: 'background-image: url(bg.jpg)' }));
    }
    const doc = makeDoc(children);
    const result = extractBackgroundImages(doc, baseUrl);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('2000');
  });
});
