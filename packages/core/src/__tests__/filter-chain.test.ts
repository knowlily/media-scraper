// ---------------------------------------------------------------------------
// @media-scraper/core — FilterChain tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { FilterChain } from '../filters/chain.js';
import type { MediaResource } from '../types.js';

function makeRes(overrides: Partial<MediaResource> = {}): MediaResource {
  return {
    id: overrides.id ?? 'r1',
    url: overrides.url ?? 'https://example.com/img.jpg',
    type: overrides.type ?? 'image',
    filename: overrides.filename ?? 'img.jpg',
    extension: overrides.extension ?? '.jpg',
    size: overrides.size ?? 10000,
    width: overrides.width ?? 800,
    height: overrides.height ?? 600,
    thumbnail: overrides.thumbnail ?? '',
    source: overrides.source ?? 'img',
  };
}

describe('FilterChain', () => {
  // --- minResolution ---
  it('minResolution filters out resources below threshold', () => {
    const chain = new FilterChain().minResolution(500, 400);
    const resources = [
      makeRes({ width: 800, height: 600, url: 'a' }),
      makeRes({ width: 200, height: 100, url: 'b' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('a');
  });

  it('minResolution keeps unknowns (width=0)', () => {
    const chain = new FilterChain().minResolution(500, 400);
    const resources = [
      makeRes({ width: 0, height: 0, url: 'unknown' }),
      makeRes({ width: 200, height: 100, url: 'small' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('unknown');
  });

  // --- maxResolution ---
  it('maxResolution filters out resources above threshold', () => {
    const chain = new FilterChain().maxResolution(1000, 800);
    const resources = [
      makeRes({ width: 800, height: 600, url: 'ok' }),
      makeRes({ width: 2000, height: 1500, url: 'big' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('ok');
  });

  it('maxResolution keeps unknowns', () => {
    const chain = new FilterChain().maxResolution(1000, 800);
    const resources = [
      makeRes({ width: 0, height: 0, url: 'unknown' }),
      makeRes({ width: 2000, height: 1500, url: 'big' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('unknown');
  });

  // --- minFileSize ---
  it('minFileSize filters out small files', () => {
    const chain = new FilterChain().minFileSize(5000);
    const resources = [
      makeRes({ size: 10000, url: 'big' }),
      makeRes({ size: 100, url: 'small' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('big');
  });

  it('minFileSize keeps unknowns (size=0)', () => {
    const chain = new FilterChain().minFileSize(5000);
    const resources = [
      makeRes({ size: 0, url: 'unknown' }),
      makeRes({ size: 100, url: 'small' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('unknown');
  });

  // --- maxFileSize ---
  it('maxFileSize filters out large files', () => {
    const chain = new FilterChain().maxFileSize(5000);
    const resources = [
      makeRes({ size: 100, url: 'small' }),
      makeRes({ size: 100000, url: 'big' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('small');
  });

  it('maxFileSize keeps unknowns', () => {
    const chain = new FilterChain().maxFileSize(5000);
    const resources = [
      makeRes({ size: 0, url: 'unknown' }),
      makeRes({ size: 100000, url: 'big' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('unknown');
  });

  // --- excludeExtensions ---
  it('excludeExtensions removes matching extensions', () => {
    const chain = new FilterChain().excludeExtensions(['.gif', '.svg']);
    const resources = [
      makeRes({ extension: '.jpg', url: 'a.jpg' }),
      makeRes({ extension: '.gif', url: 'b.gif' }),
      makeRes({ extension: '.svg', url: 'c.svg' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('a.jpg');
  });

  it('excludeExtensions is case-insensitive', () => {
    const chain = new FilterChain().excludeExtensions(['.GIF']);
    const resources = [
      makeRes({ extension: '.gif', url: 'b.gif' }),
      makeRes({ extension: '.jpg', url: 'a.jpg' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('a.jpg');
  });

  // --- preferredFormats ---
  it('preferredFormats picks highest priority format per URL stem', () => {
    const chain = new FilterChain().preferredFormats(['webp', 'png', 'jpg']);
    const resources = [
      makeRes({ url: 'https://cdn.com/img.webp', extension: '.webp' }),
      makeRes({ url: 'https://cdn.com/img.png', extension: '.png' }),
      makeRes({ url: 'https://cdn.com/img.jpg', extension: '.jpg' }),
      makeRes({ url: 'https://cdn.com/other.jpg', extension: '.jpg' }),
    ];
    const result = chain.apply(resources);
    // Should keep img.webp (highest) and other.jpg (only one)
    expect(result).toHaveLength(2);
    const urls = result.map((r) => r.url);
    expect(urls).toContain('https://cdn.com/img.webp');
    expect(urls).toContain('https://cdn.com/other.jpg');
    expect(urls).not.toContain('https://cdn.com/img.png');
    expect(urls).not.toContain('https://cdn.com/img.jpg');
  });

  it('preferredFormats keeps single-format items unchanged', () => {
    const chain = new FilterChain().preferredFormats(['webp', 'jpg']);
    const resources = [
      makeRes({ url: 'https://cdn.com/single.png', extension: '.png' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
  });

  // --- excludeTracking ---
  it('excludeTracking removes 1x1 pixels', () => {
    const chain = new FilterChain().excludeTracking();
    const resources = [
      makeRes({ width: 1, height: 1, url: 'tracker' }),
      makeRes({ width: 800, height: 600, url: 'photo' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('photo');
  });

  it('excludeTracking keeps non-1x1 unknowns', () => {
    const chain = new FilterChain().excludeTracking();
    const resources = [
      makeRes({ width: 0, height: 0, url: 'unknown' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
  });

  // --- exclude ---
  it('exclude with string pattern removes matching URLs', () => {
    const chain = new FilterChain().exclude('tracker');
    const resources = [
      makeRes({ url: 'https://cdn.com/tracker.gif' }),
      makeRes({ url: 'https://cdn.com/photo.jpg' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://cdn.com/photo.jpg');
  });

  it('exclude with RegExp removes matching URLs', () => {
    const chain = new FilterChain().exclude(/\.gif$/);
    const resources = [
      makeRes({ url: 'https://cdn.com/img.gif' }),
      makeRes({ url: 'https://cdn.com/img.jpg' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://cdn.com/img.jpg');
  });

  // --- sort: resolution-desc ---
  it('sort resolution-desc orders by pixel area', () => {
    const chain = new FilterChain().sort('resolution-desc');
    const resources = [
      makeRes({ width: 100, height: 100, url: 'small' }),
      makeRes({ width: 1000, height: 1000, url: 'large' }),
      makeRes({ width: 500, height: 500, url: 'medium' }),
    ];
    const result = chain.apply(resources);
    expect(result[0].url).toBe('large');
    expect(result[1].url).toBe('medium');
    expect(result[2].url).toBe('small');
  });

  // --- sort: size-desc ---
  it('sort size-desc orders by file size', () => {
    const chain = new FilterChain().sort('size-desc');
    const resources = [
      makeRes({ size: 100, url: 'small-file' }),
      makeRes({ size: 1000000, url: 'large-file' }),
      makeRes({ size: 50000, url: 'medium-file' }),
    ];
    const result = chain.apply(resources);
    expect(result[0].url).toBe('large-file');
    expect(result[1].url).toBe('medium-file');
    expect(result[2].url).toBe('small-file');
  });

  // --- sort: format-priority ---
  it('sort format-priority orders webp > avif > png > jpg > gif > svg', () => {
    const chain = new FilterChain().sort('format-priority');
    const resources = [
      makeRes({ extension: '.svg', url: 'svg' }),
      makeRes({ extension: '.gif', url: 'gif' }),
      makeRes({ extension: '.jpg', url: 'jpg' }),
      makeRes({ extension: '.png', url: 'png' }),
      makeRes({ extension: '.avif', url: 'avif' }),
      makeRes({ extension: '.webp', url: 'webp' }),
    ];
    const result = chain.apply(resources);
    expect(result.map((r) => r.extension)).toEqual([
      '.webp',
      '.avif',
      '.png',
      '.jpg',
      '.gif',
      '.svg',
    ]);
  });

  // --- multi-rule ---
  it('applies multiple rules in order', () => {
    const chain = new FilterChain()
      .minResolution(500, 400)
      .excludeExtensions(['.gif'])
      .sort('size-desc');

    const resources = [
      makeRes({ width: 200, height: 100, size: 50000, url: 'small-res', extension: '.jpg' }),
      makeRes({ width: 800, height: 600, size: 10000, url: 'good', extension: '.jpg' }),
      makeRes({ width: 800, height: 600, size: 50000, url: 'better', extension: '.jpg' }),
      makeRes({ width: 800, height: 600, size: 5000, url: 'gif-file', extension: '.gif' }),
    ];
    const result = chain.apply(resources);
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('better');
    expect(result[1].url).toBe('good');
  });

  // --- empty array ---
  it('apply on empty array returns empty', () => {
    const chain = new FilterChain().minResolution(500, 400);
    expect(chain.apply([])).toEqual([]);
  });

  it('chain with no rules returns input unchanged', () => {
    const chain = new FilterChain();
    const resources = [makeRes({ url: 'a' }), makeRes({ url: 'b' })];
    expect(chain.apply(resources)).toEqual(resources);
  });

  // --- chainable ---
  it('methods are chainable', () => {
    const chain = new FilterChain()
      .minResolution(100, 100)
      .maxResolution(2000, 2000)
      .minFileSize(1000)
      .maxFileSize(100000)
      .excludeExtensions(['.gif'])
      .excludeTracking()
      .exclude(/analytics/i)
      .sort('resolution-desc');

    expect(chain).toBeInstanceOf(FilterChain);
  });

  // --- reset ---
  it('reset clears all rules', () => {
    const chain = new FilterChain()
      .minResolution(500, 400)
      .excludeExtensions(['.gif']);

    chain.reset();
    const resources = [
      makeRes({ width: 200, height: 100, url: 'small', extension: '.jpg' }),
    ];
    expect(chain.apply(resources)).toEqual(resources);
  });
});
