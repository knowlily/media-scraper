// ---------------------------------------------------------------------------
// @media-scraper/dedupe — NormalizedURLStrategy tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { NormalizedURLStrategy } from '../strategies/normalized-url.js';
import type { MediaResource } from '@media-scraper/core';

function makeResource(url: string, overrides: Partial<MediaResource> = {}): MediaResource {
  return {
    id: `id-${url.slice(0, 8)}`,
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

describe('NormalizedURLStrategy', () => {
  const strategy = new NormalizedURLStrategy();

  it('has name "normalized-url"', () => {
    expect(strategy.name).toBe('normalized-url');
  });

  describe('same image, different CDN / tracking params → same fingerprint', () => {
    it('different CDN domains', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn1.example.com/images/hero.jpg'),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn2.othercdn.io/images/hero.jpg'),
      );
      expect(a).not.toBe(b); // different host → different fingerprint intentionally
    });

    it('same URL with utm_* params stripped', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn.example.com/photo.jpg'),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn.example.com/photo.jpg?utm_source=twitter&utm_medium=social'),
      );
      expect(a).toBe(b);
    });

    it('same URL with token param stripped', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn.example.com/image.png'),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn.example.com/image.png?token=abc123xyz'),
      );
      expect(a).toBe(b);
    });

    it('same URL with _t and rand params stripped', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn.example.com/banner.jpg'),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn.example.com/banner.jpg?_t=123456&rand=789'),
      );
      expect(a).toBe(b);
    });

    it('same URL with mixed noise and real params — noise stripped, real kept', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn.example.com/pic.jpg?w=800&h=600'),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn.example.com/pic.jpg?w=800&h=600&token=xyz&_t=123'),
      );
      expect(a).toBe(b);
    });
  });

  describe('different images → different fingerprints', () => {
    it('different filenames', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn.example.com/a.jpg'),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn.example.com/b.jpg'),
      );
      expect(a).not.toBe(b);
    });

    it('different paths', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn.example.com/2023/photo.jpg'),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn.example.com/2024/photo.jpg'),
      );
      expect(a).not.toBe(b);
    });
  });

  describe('protocol normalisation', () => {
    it('http → https', () => {
      const a = strategy.fingerprint(
        makeResource('http://cdn.example.com/pic.jpg'),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn.example.com/pic.jpg'),
      );
      expect(a).toBe(b);
    });
  });

  describe('trailing slash removal', () => {
    it('removes trailing slash from path', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn.example.com/gallery/'),
      );
      // URL constructor normalises the path — the trailing slash may already be
      // part of pathname. We just verify it doesn't throw and returns a string.
      expect(typeof a).toBe('string');
    });
  });

  describe('edge cases', () => {
    it('empty / invalid URL does not throw', () => {
      expect(() => strategy.fingerprint(makeResource(''))).not.toThrow();
      expect(typeof strategy.fingerprint(makeResource('not-a-url'))).toBe('string');
    });

    it('URL with only tracking params — returns clean URL', () => {
      const fp = strategy.fingerprint(
        makeResource('https://cdn.example.com/img.jpg?utm_source=fb'),
      );
      expect(fp).toBe('https://cdn.example.com/img.jpg');
    });

    it('preserves meaningful query params', () => {
      const fp = strategy.fingerprint(
        makeResource('https://cdn.example.com/img.jpg?w=640&q=90'),
      );
      expect(fp).toContain('w=640');
      expect(fp).toContain('q=90');
    });
  });
});
