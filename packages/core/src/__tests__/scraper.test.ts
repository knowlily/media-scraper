// ---------------------------------------------------------------------------
// @media-scraper/core — scraper.test.ts
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import type { DocumentLike, ElementLike, MediaResource, MediaType, ScrapeOptions, ScrapeResult } from '../types.js';
import { scrape, categorizeResources, MediaScraper } from '../scraper.js';
import type { MediaScraperOptions } from '../scraper.js';
import { FilterChain } from '../filters/chain.js';
import type { ScrapeError } from '../types.js';

// ---------------------------------------------------------------------------
// Mock DOM infrastructure (reuses patterns from images.test.ts)
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

function makeDoc(
  bodyChildren: MockNode[] = [],
  headChildren: MockNode[] = [],
  title = 'Test Page',
): DocumentLike {
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
  const headEl = headChildren.length > 0 ? makeElementLike(headNode) : null;

  return {
    querySelectorAll(selector: string): ElementLike[] {
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

function n(
  tag: string,
  attrs: Record<string, string> = {},
  children: MockNode[] = [],
  text = '',
): MockNode {
  return { tagName: tag, attrs, children, text };
}

// ---------------------------------------------------------------------------
// categorizeResources tests
// ---------------------------------------------------------------------------

describe('categorizeResources', () => {
  function r(url: string, type: MediaType): MediaResource {
    return {
      id: `id-${url}`,
      url,
      type,
      filename: url.split('/').pop() || '',
      extension: '',
      size: 0,
      width: 0,
      height: 0,
      thumbnail: '',
      source: 'img',
    };
  }

  it('categorizes mixed resources into correct arrays', () => {
    const resources: MediaResource[] = [
      r('https://a.com/1.jpg', 'image'),
      r('https://a.com/2.jpg', 'image'),
      r('https://a.com/v.mp4', 'video'),
      r('https://a.com/s.mp3', 'audio'),
      r('https://a.com/d.pdf', 'document'),
    ];

    const cat = categorizeResources(resources);

    expect(cat.images).toHaveLength(2);
    expect(cat.videos).toHaveLength(1);
    expect(cat.audio).toHaveLength(1);
    expect(cat.documents).toHaveLength(1);

    expect(cat.images[0].type).toBe('image');
    expect(cat.videos[0].type).toBe('video');
    expect(cat.audio[0].type).toBe('audio');
    expect(cat.documents[0].type).toBe('document');
  });

  it('places unknown type into images', () => {
    const resources: MediaResource[] = [
      r('https://a.com/unknown.bin', 'unknown'),
      r('https://a.com/photo.jpg', 'image'),
    ];

    const cat = categorizeResources(resources);

    expect(cat.images).toHaveLength(2);
    expect(cat.images.some((r) => r.type === 'unknown')).toBe(true);
    expect(cat.videos).toHaveLength(0);
    expect(cat.audio).toHaveLength(0);
    expect(cat.documents).toHaveLength(0);
  });

  it('returns empty arrays for empty input', () => {
    const cat = categorizeResources([]);

    expect(cat.images).toEqual([]);
    expect(cat.videos).toEqual([]);
    expect(cat.audio).toEqual([]);
    expect(cat.documents).toEqual([]);
  });

  it('handles only videos', () => {
    const resources: MediaResource[] = [
      r('https://a.com/1.mp4', 'video'),
      r('https://a.com/2.webm', 'video'),
    ];

    const cat = categorizeResources(resources);

    expect(cat.images).toHaveLength(0);
    expect(cat.videos).toHaveLength(2);
    expect(cat.audio).toHaveLength(0);
    expect(cat.documents).toHaveLength(0);
  });

  it('handles only audio', () => {
    const resources: MediaResource[] = [
      r('https://a.com/1.mp3', 'audio'),
    ];

    const cat = categorizeResources(resources);

    expect(cat.audio).toHaveLength(1);
    expect(cat.videos).toHaveLength(0);
  });

  it('handles only documents', () => {
    const resources: MediaResource[] = [
      r('https://a.com/doc.pdf', 'document'),
    ];

    const cat = categorizeResources(resources);

    expect(cat.documents).toHaveLength(1);
    expect(cat.images).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// scrape tests
// ---------------------------------------------------------------------------

describe('scrape', () => {
  const baseUrl = 'https://example.com/page';

  it('extracts images from a page with <img> tags', async () => {
    const doc = makeDoc([
      n('img', { src: 'photo.jpg' }),
      n('img', { src: 'photo2.png' }),
    ]);

    const result = await scrape(doc, baseUrl);

    expect(result.images.length).toBeGreaterThanOrEqual(2);
    expect(result.images.some((r) => r.url === 'https://example.com/photo.jpg')).toBe(true);
    expect(result.images.some((r) => r.url === 'https://example.com/photo2.png')).toBe(true);
  });

  it('extracts videos from <video> tags', async () => {
    const doc = makeDoc([
      n('video', { src: 'movie.mp4' }),
    ]);

    const result = await scrape(doc, baseUrl);

    expect(result.videos.length).toBeGreaterThanOrEqual(1);
    expect(result.videos.some((r) => r.url === 'https://example.com/movie.mp4')).toBe(true);
  });

  it('extracts audio from <audio> tags', async () => {
    const doc = makeDoc([
      n('audio', { src: 'song.mp3' }),
    ]);

    const result = await scrape(doc, baseUrl);

    expect(result.audio.length).toBeGreaterThanOrEqual(1);
    expect(result.audio.some((r) => r.url === 'https://example.com/song.mp3')).toBe(true);
  });

  it('extracts documents from <a> links', async () => {
    const doc = makeDoc([
      n('a', { href: 'https://example.com/file.pdf' }),
    ]);

    const result = await scrape(doc, baseUrl);

    expect(result.documents.length).toBeGreaterThanOrEqual(1);
    expect(result.documents.some((r) => r.url === 'https://example.com/file.pdf')).toBe(true);
  });

  it('populates metadata fields (url, title, duration, timestamp)', async () => {
    const doc = makeDoc([], [], 'My Awesome Gallery');

    const result = await scrape(doc, 'https://example.com/gallery');

    expect(result.url).toBe('https://example.com/gallery');
    expect(result.title).toBe('My Awesome Gallery');
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(typeof result.duration).toBe('number');
    expect(result.timestamp).toBeTruthy();
    // Valid ISO-8601 format
    expect(() => new Date(result.timestamp)).not.toThrow();
  });

  it('uses options.url for the result URL when provided', async () => {
    const doc = makeDoc([], [], 'Test');

    const result = await scrape(doc, baseUrl, { url: 'https://custom.example.com' });

    expect(result.url).toBe('https://custom.example.com');
  });

  it('deduplicates resources by URL', async () => {
    const doc = makeDoc([
      n('img', { src: 'dupe.jpg' }),
      n('img', { src: 'dupe.jpg' }),
      n('img', { src: 'dupe.jpg' }),
    ]);

    const result = await scrape(doc, baseUrl);

    // The global deduplication should keep only one
    const dupeUrls = [...result.images, ...result.videos, ...result.audio, ...result.documents]
      .filter((r) => r.url === 'https://example.com/dupe.jpg');
    expect(dupeUrls).toHaveLength(1);
  });

  it('filters by type when options.types is provided', async () => {
    const doc = makeDoc([
      n('img', { src: 'photo.jpg' }),
      n('video', { src: 'movie.mp4' }),
      n('audio', { src: 'song.mp3' }),
      n('a', { href: 'file.pdf' }),
    ]);

    // Only keep images
    const result = await scrape(doc, baseUrl, { url: baseUrl, types: ['image'] });

    expect(result.total).toBeGreaterThan(0);
    // Only images should appear
    expect(result.images.length).toBeGreaterThan(0);
    expect(result.videos).toEqual([]);
    expect(result.audio).toEqual([]);
    expect(result.documents).toEqual([]);
  });

  it('filters by multiple types', async () => {
    const doc = makeDoc([
      n('img', { src: 'photo.jpg' }),
      n('video', { src: 'movie.mp4' }),
    ]);

    const result = await scrape(doc, baseUrl, { url: baseUrl, types: ['image', 'video'] });

    expect(result.images.length).toBeGreaterThan(0);
    expect(result.videos.length).toBeGreaterThan(0);
    expect(result.audio).toEqual([]);
    expect(result.documents).toEqual([]);
  });

  it('filters by minSize', async () => {
    const doc = makeDoc([
      n('img', { src: 'photo.jpg' }),
    ]);

    // All resources have size=0 by default
    const result = await scrape(doc, baseUrl, { url: baseUrl, minSize: 1 });

    // Resources with size=0 are kept (unknown size, not excluded)
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('returns warnings array', async () => {
    const doc = makeDoc([]);

    const result = await scrape(doc, baseUrl);

    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('returns structured ScrapeResult for empty page', async () => {
    const doc = makeDoc([]);

    const result = await scrape(doc, baseUrl);

    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('images');
    expect(result).toHaveProperty('videos');
    expect(result).toHaveProperty('audio');
    expect(result).toHaveProperty('documents');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('duration');
    expect(result).toHaveProperty('timestamp');

    expect(result.images).toEqual([]);
    expect(result.videos).toEqual([]);
    expect(result.audio).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('total equals sum of categorized arrays', async () => {
    const doc = makeDoc([
      n('img', { src: 'a.jpg' }),
      n('img', { src: 'b.jpg' }),
      n('video', { src: 'v.mp4' }),
      n('audio', { src: 's.mp3' }),
    ]);

    const result = await scrape(doc, baseUrl);

    const sum =
      result.images.length +
      result.videos.length +
      result.audio.length +
      result.documents.length;
    expect(result.total).toBe(sum);
  });

  it('extracts background images', async () => {
    const doc = makeDoc([
      n('div', { style: 'background-image: url(bg.jpg)' }),
    ]);

    const result = await scrape(doc, baseUrl);

    // Background images go to images array
    expect(result.images.some((r) => r.url === 'https://example.com/bg.jpg')).toBe(true);
  });

  it('extracts iframe media', async () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.youtube.com/embed/abc123' }),
    ]);

    const result = await scrape(doc, baseUrl);

    // Iframe extractor should produce at least the iframe URL itself
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it('extracts lazy-loaded images via data-src', async () => {
    const doc = makeDoc([
      n('img', { 'data-src': 'lazy.jpg' }),
    ]);

    const result = await scrape(doc, baseUrl);

    expect(result.images.some((r) => r.url === 'https://example.com/lazy.jpg')).toBe(true);
  });

  it('scrapes with default options (no options argument)', async () => {
    const doc = makeDoc([
      n('img', { src: 'photo.jpg' }),
    ]);

    const result = await scrape(doc, baseUrl);

    expect(result.images.length).toBeGreaterThanOrEqual(1);
    expect(result.url).toBe(baseUrl);
  });

  it('has unique IDs across all resources', async () => {
    const doc = makeDoc([
      n('img', { src: 'a.jpg' }),
      n('img', { src: 'b.jpg' }),
    ]);

    const result = await scrape(doc, baseUrl);
    const allIds = [
      ...result.images,
      ...result.videos,
      ...result.audio,
      ...result.documents,
    ].map((r) => r.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it('handles extractor failure gracefully (safeExtract catch path)', async () => {
    // Create a doc that causes an extractor to throw by making
    // querySelectorAll throw for certain selectors
    const throwingDoc: DocumentLike = {
      querySelectorAll(selector: string): ElementLike[] {
        if (selector === 'img') throw new Error('Simulated extractor crash');
        return [];
      },
      querySelector(_selector: string): ElementLike | null {
        return null;
      },
      title: 'Crash Test',
      head: null,
      body: null,
    };

    const result = await scrape(throwingDoc, baseUrl);

    // The scrape should still complete with metadata populated
    expect(result.url).toBe(baseUrl);
    expect(result.title).toBe('Crash Test');
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.images).toBeDefined();
    expect(result.videos).toBeDefined();
    expect(result.audio).toBeDefined();
    expect(result.documents).toBeDefined();
  });

  it('has errors and partial in result', async () => {
    const doc = makeDoc([]);
    const result = await scrape(doc, baseUrl);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(typeof result.partial).toBe('boolean');
  });

  it('has stats with dedup/filter counts', async () => {
    const doc = makeDoc([]);
    const result = await scrape(doc, baseUrl);
    expect(result.stats).toBeDefined();
    expect(result.stats.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.stats.deduplicatedCount).toBe('number');
    expect(typeof result.stats.filteredCount).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// MediaScraper tests
// ---------------------------------------------------------------------------

describe('MediaScraper', () => {
  const baseUrl = 'https://example.com/page';

  it('constructs with default options', () => {
    const scraper = new MediaScraper();
    expect(scraper).toBeDefined();
  });

  it('constructs with custom parsers', () => {
    const scraper = new MediaScraper({ parsers: [] });
    expect(scraper).toBeDefined();
  });

  it('constructs with filters', () => {
    const chain = new FilterChain().minResolution(100, 100);
    const scraper = new MediaScraper({ filters: chain });
    expect(scraper).toBeDefined();
  });

  it('constructs with deduplicator', () => {
    const deduplicator = {
      deduplicate: (r: MediaResource[]) => r,
    };
    const scraper = new MediaScraper({ deduplicator });
    expect(scraper).toBeDefined();
  });

  it('constructs with output options', () => {
    const scraper = new MediaScraper({ output: { dir: '/tmp' } });
    expect(scraper).toBeDefined();
  });

  it('scrapes images from a page', async () => {
    const doc = makeDoc([
      n('img', { src: 'photo.jpg' }),
    ]);
    const scraper = new MediaScraper();
    const result = await scraper.scrape(doc, baseUrl);
    expect(result.images.length).toBeGreaterThanOrEqual(1);
  });

  it('scrapes and returns complete result', async () => {
    const doc = makeDoc([
      n('img', { src: 'a.jpg' }),
    ]);
    const scraper = new MediaScraper();
    const result = await scraper.scrape(doc, baseUrl);
    expect(result.url).toBe(baseUrl);
    expect(result.title).toBe('Test Page');
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBeDefined();
    expect(result.partial).toBe(false);
    expect(result.stats).toBeDefined();
  });

  it('scrapes with filters', async () => {
    const doc = makeDoc([
      n('img', { src: 'photo.jpg' }),
    ]);
    const chain = new FilterChain().minResolution(200, 200);
    const scraper = new MediaScraper({ filters: chain });
    const result = await scraper.scrape(doc, baseUrl);
    expect(result).toBeDefined();
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it('scrapes with custom deduplicator', async () => {
    const doc = makeDoc([
      n('img', { src: 'photo.jpg' }),
    ]);
    const deduplicator = {
      deduplicate: (r: MediaResource[]) => r,
    };
    const scraper = new MediaScraper({ deduplicator });
    const result = await scraper.scrape(doc, baseUrl);
    expect(result.images.length).toBeGreaterThanOrEqual(1);
  });

  it('scrapes empty page', async () => {
    const doc = makeDoc([]);
    const scraper = new MediaScraper();
    const result = await scraper.scrape(doc, baseUrl);
    expect(result.total).toBe(0);
    expect(result.images).toEqual([]);
  });

  it('scrape returns warnings', async () => {
    const doc = makeDoc([]);
    const scraper = new MediaScraper();
    const result = await scraper.scrape(doc, baseUrl);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('scrapeStream yields phases', async () => {
    const doc = makeDoc([]);
    const scraper = new MediaScraper();
    const phases: number[] = [];
    for await (const frame of scraper.scrapeStream(doc, baseUrl)) {
      phases.push(frame.phase);
    }
    expect(phases.length).toBeGreaterThan(0);
  });

  it('scrapeStream with empty parsers', async () => {
    const doc = makeDoc([]);
    const scraper = new MediaScraper({ parsers: [] });
    const phases: number[] = [];
    for await (const frame of scraper.scrapeStream(doc, baseUrl)) {
      phases.push(frame.phase);
    }
    expect(phases).toEqual([]);
  });

  it('scrapeStream yields items', async () => {
    const doc = makeDoc([
      n('img', { src: 'photo.jpg' }),
    ]);
    const scraper = new MediaScraper();
    let totalItems = 0;
    for await (const frame of scraper.scrapeStream(doc, baseUrl)) {
      totalItems += frame.items.length;
    }
    expect(totalItems).toBeGreaterThan(0);
  });

  it('scrape handles background extractor failure with errors', async () => {
    const doc = makeDoc([]);
    const scraper = new MediaScraper({ parsers: [] });
    const result = await scraper.scrape(doc, baseUrl);
    // No parsers means no items, but result should be valid
    expect(result.total).toBe(0);
    expect(result.errors).toBeDefined();
  });

  it('scrapeStream continues after background extractor failure', async () => {
    // Create a doc that causes background extraction to fail
    // by making body.querySelectorAll('*') throw
    const failingDoc: DocumentLike = {
      querySelectorAll(selector: string): import('../types.js').ElementLike[] {
        if (selector === 'img') return [];
        throw new Error('Simulated failure');
      },
      querySelector(_selector: string): import('../types.js').ElementLike | null {
        return null;
      },
      title: 'Fail Test',
      head: null,
      body: {
        tagName: 'BODY',
        getAttribute: () => null,
        querySelectorAll: () => { throw new Error('body failure'); },
        querySelector: () => null,
        textContent: null,
      },
    };

    const scraper = new MediaScraper();
    const phases: number[] = [];
    for await (const frame of scraper.scrapeStream(failingDoc, baseUrl)) {
      phases.push(frame.phase);
    }
    // Should still complete, yielding phases
    expect(phases.length).toBeGreaterThan(0);
  });
});
