// ---------------------------------------------------------------------------
// @media-scraper/dedupe — Deduplicator tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { Deduplicator } from '../deduplicator.js';
import { NormalizedURLStrategy } from '../strategies/normalized-url.js';
import { FileSignatureStrategy } from '../strategies/file-signature.js';
import type { DeduplicationStrategy } from '../types.js';
import type { MediaResource } from '@media-scraper/core';

function makeResource(url: string, overrides: Partial<MediaResource> = {}): MediaResource {
  return {
    id: `id-${url.slice(0, 12)}`,
    url,
    type: 'image',
    filename: 'test.jpg',
    extension: '.jpg',
    size: 0,
    width: 0,
    height: 0,
    thumbnail: '',
    source: 'img',
    ...overrides,
  };
}

describe('Deduplicator', () => {
  describe('empty strategies', () => {
    it('returns all resources unchanged when strategies array is empty', () => {
      const deduper = new Deduplicator([]);
      const resources = [
        makeResource('https://a.example.com/1.jpg'),
        makeResource('https://a.example.com/1.jpg'), // duplicate
      ];
      const result = deduper.deduplicate(resources);
      expect(result).toHaveLength(2);
      expect(deduper.getRemoved()).toHaveLength(0);
    });

    it('returns empty when input is empty', () => {
      const deduper = new Deduplicator([new NormalizedURLStrategy()]);
      const result = deduper.deduplicate([]);
      expect(result).toHaveLength(0);
      expect(deduper.getRemoved()).toHaveLength(0);
    });
  });

  describe('single strategy', () => {
    it('removes URL-level duplicates with NormalizedURLStrategy', () => {
      const deduper = new Deduplicator([new NormalizedURLStrategy()]);
      const resources = [
        makeResource('https://cdn.example.com/a.jpg'),
        makeResource('https://cdn.example.com/a.jpg?utm_source=twitter'),
        makeResource('https://cdn.example.com/b.jpg'),
      ];

      const result = deduper.deduplicate(resources);
      expect(result).toHaveLength(2);
      expect(result[0].url).toContain('a.jpg');
      expect(result[1].url).toContain('b.jpg');
      expect(deduper.getRemoved()).toHaveLength(1);
      expect(deduper.getRemoved()[0].url).toContain('utm_source');
    });

    it('removes file-signature duplicates with FileSignatureStrategy', () => {
      const deduper = new Deduplicator([new FileSignatureStrategy()]);
      const resources = [
        makeResource('https://cdn1.example.com/images/hero.jpg'),
        makeResource('https://cdn2.example.com/images/hero.jpg'),
        makeResource('https://cdn1.example.com/images/logo.png'),
      ];

      const result = deduper.deduplicate(resources);
      expect(result).toHaveLength(2);
      expect(deduper.getRemoved()).toHaveLength(1);
    });
  });

  describe('multiple strategies', () => {
    it('applies strategies in order — URL first, then file signature', () => {
      const deduper = new Deduplicator([
        new NormalizedURLStrategy(),
        new FileSignatureStrategy(),
      ]);

      const resources = [
        // A: original
        makeResource('https://cdn1.example.com/images/hero.jpg'),
        // B: same URL + tracking param → removed by URL strategy
        makeResource('https://cdn1.example.com/images/hero.jpg?token=abc'),
        // C: different CDN, same file → removed by file-signature strategy
        makeResource('https://cdn2.example.com/images/hero.jpg'),
        // D: unique
        makeResource('https://cdn1.example.com/images/logo.png'),
      ];

      const result = deduper.deduplicate(resources);
      expect(result).toHaveLength(2);
      const urls = result.map((r) => r.url);
      expect(urls.some((u) => u.includes('logo.png'))).toBe(true);
      // After URL dedupe, A, C, D remain (B removed — same URL).
      // After file-signature, C is removed (same file-signature as A).
      // Final: 2 resources (one hero + logo).
    });
  });

  describe('all unique', () => {
    it('keeps all resources when none are duplicates', () => {
      const deduper = new Deduplicator([
        new NormalizedURLStrategy(),
        new FileSignatureStrategy(),
      ]);

      const resources = [
        makeResource('https://cdn.example.com/a.jpg'),
        makeResource('https://cdn.example.com/images/b.jpg'),
        makeResource('https://cdn.example.com/photos/c.png'),
      ];

      const result = deduper.deduplicate(resources);
      expect(result).toHaveLength(3);
      expect(deduper.getRemoved()).toHaveLength(0);
    });
  });

  describe('three duplicates', () => {
    it('keeps only the first of three identical resources', () => {
      const deduper = new Deduplicator([new NormalizedURLStrategy()]);

      const resources = [
        makeResource('https://cdn.example.com/photo.jpg', { id: 'id-1' }),
        makeResource('https://cdn.example.com/photo.jpg?utm_source=fb', { id: 'id-2' }),
        makeResource('https://cdn.example.com/photo.jpg?token=xyz&utm_source=tw', { id: 'id-3' }),
      ];

      const result = deduper.deduplicate(resources);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('id-1');
      expect(deduper.getRemoved()).toHaveLength(2);
      expect(deduper.getRemoved().map((r) => r.id).sort()).toEqual(['id-2', 'id-3']);
    });
  });

  describe('getRemoved', () => {
    it('resets between calls', () => {
      const deduper = new Deduplicator([new NormalizedURLStrategy()]);

      // First call
      deduper.deduplicate([
        makeResource('https://cdn.example.com/a.jpg'),
        makeResource('https://cdn.example.com/a.jpg?t=1'),
      ]);
      expect(deduper.getRemoved()).toHaveLength(1);

      // Second call with no duplicates
      deduper.deduplicate([
        makeResource('https://cdn.example.com/x.jpg'),
        makeResource('https://cdn.example.com/y.jpg'),
      ]);
      expect(deduper.getRemoved()).toHaveLength(0);
    });
  });

  describe('custom strategy', () => {
    it('works with a user-defined strategy', () => {
      const custom: DeduplicationStrategy = {
        name: 'type-only',
        fingerprint: (r) => r.type,
      };

      const deduper = new Deduplicator([custom]);

      const resources = [
        makeResource('https://a.example.com/1.jpg', { type: 'image' }),
        makeResource('https://a.example.com/2.jpg', { type: 'image' }),
        makeResource('https://a.example.com/v.mp4', { type: 'video' }),
      ];

      const result = deduper.deduplicate(resources);
      // Only first image and the video remain
      expect(result).toHaveLength(2);
      expect(deduper.getRemoved()).toHaveLength(1);
    });
  });
});
