// ---------------------------------------------------------------------------
// @media-scraper/core — filters.test.ts
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  deduplicate,
  filterByType,
  filterBySize,
  filterByDomain,
  sanitizeFilename,
  applyFilters,
} from '../filters.js';
import type { MediaResource, MediaType, FilterOptions } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResource(overrides: Partial<MediaResource> = {}): MediaResource {
  return {
    id: 'id-1',
    url: 'https://example.com/media/photo.jpg',
    type: 'image',
    filename: 'photo.jpg',
    extension: '.jpg',
    size: 0,
    width: 0,
    height: 0,
    thumbnail: '',
    source: 'img',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deduplicate
// ---------------------------------------------------------------------------

describe('deduplicate', () => {
  it('removes exact URL duplicates', () => {
    const resources = [
      makeResource({ id: '1', url: 'https://a.com/1.jpg' }),
      makeResource({ id: '2', url: 'https://a.com/1.jpg' }),
      makeResource({ id: '3', url: 'https://a.com/2.jpg' }),
    ];
    const result = deduplicate(resources);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('keeps first occurrence', () => {
    const resources = [
      makeResource({ id: 'first', url: 'https://a.com/img.png' }),
      makeResource({ id: 'second', url: 'https://a.com/img.png' }),
      makeResource({ id: 'third', url: 'https://a.com/img.png' }),
    ];
    const result = deduplicate(resources);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('first');
  });

  it('handles empty array', () => {
    const result = deduplicate([]);
    expect(result).toEqual([]);
  });

  it('handles array with no duplicates', () => {
    const resources = [
      makeResource({ id: '1', url: 'https://a.com/a.jpg' }),
      makeResource({ id: '2', url: 'https://a.com/b.jpg' }),
      makeResource({ id: '3', url: 'https://a.com/c.jpg' }),
    ];
    const result = deduplicate(resources);
    expect(result).toHaveLength(3);
  });

  it('returns a new array (does not mutate original)', () => {
    const resources = [
      makeResource({ id: '1', url: 'https://a.com/1.jpg' }),
      makeResource({ id: '2', url: 'https://a.com/1.jpg' }),
    ];
    const result = deduplicate(resources);
    expect(result).not.toBe(resources);
    expect(resources).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// filterByType
// ---------------------------------------------------------------------------

describe('filterByType', () => {
  it('keeps only specified types', () => {
    const resources = [
      makeResource({ id: '1', type: 'image' }),
      makeResource({ id: '2', type: 'video' }),
      makeResource({ id: '3', type: 'image' }),
    ];
    const result = filterByType(resources, ['image']);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('handles multiple types in filter', () => {
    const resources = [
      makeResource({ id: '1', type: 'image' }),
      makeResource({ id: '2', type: 'video' }),
      makeResource({ id: '3', type: 'audio' }),
      makeResource({ id: '4', type: 'document' }),
    ];
    const result = filterByType(resources, ['image', 'video']);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('returns empty array when no match', () => {
    const resources = [
      makeResource({ id: '1', type: 'image' }),
      makeResource({ id: '2', type: 'image' }),
    ];
    const result = filterByType(resources, ['video']);
    expect(result).toEqual([]);
  });

  it('handles empty resources array', () => {
    const result = filterByType([], ['image']);
    expect(result).toEqual([]);
  });

  it('handles empty types array', () => {
    const resources = [
      makeResource({ id: '1', type: 'image' }),
      makeResource({ id: '2', type: 'video' }),
    ];
    const result = filterByType(resources, []);
    expect(result).toEqual([]);
  });

  it('returns a new array (does not mutate original)', () => {
    const resources = [makeResource({ type: 'image' })];
    const result = filterByType(resources, ['image']);
    expect(result).not.toBe(resources);
  });
});

// ---------------------------------------------------------------------------
// filterBySize
// ---------------------------------------------------------------------------

describe('filterBySize', () => {
  it('filters by minWidth', () => {
    const resources = [
      makeResource({ id: '1', width: 100 }),
      makeResource({ id: '2', width: 200 }),
      makeResource({ id: '3', width: 300 }),
    ];
    const result = filterBySize(resources, 200);
    expect(result.map((r) => r.id)).toEqual(['2', '3']);
  });

  it('filters by minHeight', () => {
    const resources = [
      makeResource({ id: '1', height: 50 }),
      makeResource({ id: '2', height: 150 }),
      makeResource({ id: '3', height: 250 }),
    ];
    const result = filterBySize(resources, undefined, 150);
    expect(result.map((r) => r.id)).toEqual(['2', '3']);
  });

  it('filters by both minWidth and minHeight', () => {
    const resources = [
      makeResource({ id: '1', width: 100, height: 100 }),
      makeResource({ id: '2', width: 200, height: 50 }),
      makeResource({ id: '3', width: 300, height: 300 }),
    ];
    const result = filterBySize(resources, 200, 200);
    expect(result.map((r) => r.id)).toEqual(['3']);
  });

  it('keeps resources with unknown dimensions (0)', () => {
    const resources = [
      makeResource({ id: '1', width: 0, height: 0 }),
      makeResource({ id: '2', width: 200, height: 200 }),
      makeResource({ id: '3', width: 50, height: 50 }),
    ];
    const result = filterBySize(resources, 100, 100);
    expect(result.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('keeps resources with width=0 when filtering by minWidth', () => {
    const resources = [
      makeResource({ id: '1', width: 0, height: 200 }),
      makeResource({ id: '2', width: 50, height: 200 }),
    ];
    const result = filterBySize(resources, 100);
    expect(result.map((r) => r.id)).toEqual(['1']);
  });

  it('keeps resources with height=0 when filtering by minHeight', () => {
    const resources = [
      makeResource({ id: '1', width: 200, height: 0 }),
      makeResource({ id: '2', width: 200, height: 50 }),
    ];
    const result = filterBySize(resources, undefined, 100);
    expect(result.map((r) => r.id)).toEqual(['1']);
  });

  it('keeps all when no filter specified', () => {
    const resources = [
      makeResource({ id: '1' }),
      makeResource({ id: '2' }),
      makeResource({ id: '3' }),
    ];
    const result = filterBySize(resources);
    expect(result).toHaveLength(3);
  });

  it('returns a new array (does not mutate original)', () => {
    const resources = [makeResource({ width: 200 })];
    const result = filterBySize(resources, 100);
    expect(result).not.toBe(resources);
  });
});

// ---------------------------------------------------------------------------
// filterByDomain
// ---------------------------------------------------------------------------

describe('filterByDomain', () => {
  it('matches exact domain', () => {
    const resources = [
      makeResource({ id: '1', url: 'https://example.com/img.jpg' }),
      makeResource({ id: '2', url: 'https://other.com/img.jpg' }),
    ];
    const result = filterByDomain(resources, 'example.com');
    expect(result.map((r) => r.id)).toEqual(['1']);
  });

  it('matches subdomain', () => {
    const resources = [
      makeResource({ id: '1', url: 'https://cdn.example.com/img.jpg' }),
      makeResource({ id: '2', url: 'https://static.cdn.example.com/img.jpg' }),
      makeResource({ id: '3', url: 'https://other.com/img.jpg' }),
    ];
    const result = filterByDomain(resources, 'example.com');
    expect(result.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('does not match partial domain', () => {
    const resources = [
      makeResource({ id: '1', url: 'https://notexample.com/img.jpg' }),
      makeResource({ id: '2', url: 'https://example.com/img.jpg' }),
    ];
    const result = filterByDomain(resources, 'example.com');
    expect(result.map((r) => r.id)).toEqual(['2']);
  });

  it('matches case-insensitively', () => {
    const resources = [
      makeResource({ id: '1', url: 'https://EXAMPLE.COM/img.jpg' }),
      makeResource({ id: '2', url: 'https://Example.Com/img.jpg' }),
    ];
    const result = filterByDomain(resources, 'example.com');
    expect(result).toHaveLength(2);
  });

  it('returns empty when no match', () => {
    const resources = [
      makeResource({ id: '1', url: 'https://a.com/img.jpg' }),
      makeResource({ id: '2', url: 'https://b.com/img.jpg' }),
    ];
    const result = filterByDomain(resources, 'example.com');
    expect(result).toEqual([]);
  });

  it('filters out resources with invalid URLs', () => {
    const resources = [
      makeResource({ id: '1', url: 'not-a-valid-url' }),
      makeResource({ id: '2', url: 'https://example.com/img.jpg' }),
    ];
    const result = filterByDomain(resources, 'example.com');
    expect(result.map((r) => r.id)).toEqual(['2']);
  });

  it('handles empty resources array', () => {
    const result = filterByDomain([], 'example.com');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sanitizeFilename
// ---------------------------------------------------------------------------

describe('sanitizeFilename', () => {
  it('returns simple filename unchanged', () => {
    expect(sanitizeFilename('photo.jpg')).toBe('photo.jpg');
  });

  it('strips path traversal (../../../etc/passwd)', () => {
    const result = sanitizeFilename('../../../etc/passwd');
    expect(result).toBe('passwd');
  });

  it('strips Windows-style path traversal (..\\..\\file.txt)', () => {
    const result = sanitizeFilename('..\\..\\secret.txt');
    expect(result).toBe('secret.txt');
  });

  it('removes Windows illegal characters <>:"/\\|?*', () => {
    // Note: step 1 strips everything up to last \\ or / first,
    // so any \\ or / in the input acts as a path separator.
    // Use a string without \\ or / to properly test character removal.
    const result = sanitizeFilename('test<>:"|?*.txt');
    expect(result).toBe('test.txt');
  });

  it('removes control characters', () => {
    const result = sanitizeFilename('file\x00\x01\x1fname.jpg');
    expect(result).toBe('filename.jpg');
  });

  it('returns "untitled" for empty result', () => {
    expect(sanitizeFilename('')).toBe('untitled');
  });

  it('returns "untitled" for single dot', () => {
    expect(sanitizeFilename('.')).toBe('untitled');
  });

  it('returns "untitled" when only illegal chars are present', () => {
    expect(sanitizeFilename('<>:"')).toBe('untitled');
  });

  it('trims leading and trailing whitespace', () => {
    const result = sanitizeFilename('  my file.jpg  ');
    expect(result).toBe('my file.jpg');
  });

  it('collapses consecutive dots to a single dot', () => {
    const result = sanitizeFilename('file....jpg');
    expect(result).toBe('file.jpg');
  });

  it('collapses multiple whitespace to single space', () => {
    const result = sanitizeFilename('my   big   file.jpg');
    expect(result).toBe('my big file.jpg');
  });

  it('truncates long filename to 255 bytes (UTF-8)', () => {
    // Create a string of 300 ASCII characters (each = 1 byte)
    const longName = 'a'.repeat(300) + '.jpg';
    const result = sanitizeFilename(longName);
    const encoded = new TextEncoder().encode(result);
    expect(encoded.length).toBeLessThanOrEqual(255);
    expect(encoded.length).toBe(255);
    // Note: truncation is byte-based, so the extension may be cut off
    // Verify it's just a prefix of the original
    expect(longName.startsWith(result)).toBe(true);
  });

  it('handles Chinese characters correctly (multi-byte UTF-8)', () => {
    // Chinese characters are 3 bytes each in UTF-8
    const result = sanitizeFilename('中文文件名.jpg');
    expect(result).toBe('中文文件名.jpg');
  });

  it('truncates multi-byte strings to within 255 bytes', () => {
    // '中' is 3 bytes in UTF-8. 85 chars = 255 bytes exactly.
    // 100 chars = 300 bytes → truncation keeps at most 84-85 chars.
    const chineseChars = '中'.repeat(100);
    const result = sanitizeFilename(chineseChars);
    const encoded = new TextEncoder().encode(result);
    expect(encoded.length).toBeLessThanOrEqual(255);
    expect(result.length).toBeLessThan(chineseChars.length);
    // The result should be predominantly composed of the original character
    expect(result.replace(/[^中]/g, '').length).toBeGreaterThan(0);
  });

  it('preserves as much of the original as possible within 255 bytes', () => {
    // With 300 'x' + '.png' = 304 bytes, only the first 255 bytes survive
    const longName = 'x'.repeat(300) + '.png';
    const result = sanitizeFilename(longName);
    const encoded = new TextEncoder().encode(result);
    expect(encoded.length).toBeLessThanOrEqual(255);
    // Result should be a prefix since 'x' is ASCII
    expect(longName.startsWith(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyFilters
// ---------------------------------------------------------------------------

describe('applyFilters', () => {
  const resources: MediaResource[] = [
    makeResource({
      id: '1',
      url: 'https://example.com/photo.jpg',
      type: 'image',
      extension: '.jpg',
      width: 800,
      height: 600,
      size: 50000,
    }),
    makeResource({
      id: '2',
      url: 'https://other.com/video.mp4',
      type: 'video',
      extension: '.mp4',
      width: 1920,
      height: 1080,
      size: 5000000,
    }),
    makeResource({
      id: '3',
      url: 'https://example.com/thumb.jpg',
      type: 'image',
      extension: '.jpg',
      width: 100,
      height: 100,
      size: 5000,
    }),
    makeResource({
      id: '4',
      url: 'https://example.com/doc.pdf',
      type: 'document',
      extension: '.pdf',
      width: 0,
      height: 0,
      size: 200000,
    }),
    makeResource({
      id: '5',
      url: 'https://example.com/banner.svg',
      type: 'image',
      extension: '.svg',
      width: 1200,
      height: 400,
      size: 30000,
    }),
  ];

  it('returns all resources when no options provided', () => {
    const result = applyFilters(resources, {});
    expect(result).toHaveLength(5);
  });

  it('combines type and size filters', () => {
    const options: FilterOptions = {
      types: ['image'],
      minWidth: 800,
    };
    const result = applyFilters(resources, options);
    expect(result.map((r) => r.id)).toEqual(['1', '5']);
  });

  it('combines type and domain filters', () => {
    const options: FilterOptions = {
      types: ['image'],
      domain: 'example.com',
    };
    const result = applyFilters(resources, options);
    expect(result.map((r) => r.id)).toEqual(['1', '3', '5']);
  });

  it('filters by minSize', () => {
    const options: FilterOptions = {
      minSize: 50000,
    };
    const result = applyFilters(resources, options);
    // id=3 has size=5000 (<50000, filtered), id=5 has size=30000 (<50000, filtered)
    // id=1 (50000), id=2 (0=unknown, kept), id=4 (0=unknown, kept)
    expect(result.map((r) => r.id)).toEqual(['1', '2', '4']);
  });

  it('filters by excludeExtensions', () => {
    const options: FilterOptions = {
      excludeExtensions: ['.svg', '.pdf'],
    };
    const result = applyFilters(resources, options);
    expect(result.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('combines multiple filters together', () => {
    const options: FilterOptions = {
      types: ['image'],
      domain: 'example.com',
      minWidth: 200,
      minHeight: 200,
      minSize: 10000,
      excludeExtensions: ['.svg'],
    };
    const result = applyFilters(resources, options);
    // id=3: width=100 (<200) → filtered by size
    // id=5: .svg → filtered by excludeExtensions
    // id=1: passes all
    expect(result.map((r) => r.id)).toEqual(['1']);
  });

  it('returns empty when no resources match all filters', () => {
    const options: FilterOptions = {
      types: ['audio'],
      domain: 'example.com',
    };
    const result = applyFilters(resources, options);
    expect(result).toEqual([]);
  });

  it('returns a new array (does not mutate original)', () => {
    const original = [...resources];
    const result = applyFilters(resources, { types: ['image'] });
    expect(result).not.toBe(resources);
    expect(resources).toEqual(original);
  });

  it('handles empty types array in options', () => {
    const options: FilterOptions = { types: [] };
    const result = applyFilters(resources, options);
    // Empty types array means no type filter applied (the check is types.length > 0)
    expect(result).toHaveLength(5);
  });

  it('handles empty excludeExtensions array', () => {
    const options: FilterOptions = { excludeExtensions: [] };
    const result = applyFilters(resources, options);
    expect(result).toHaveLength(5);
  });
});
