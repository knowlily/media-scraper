// ---------------------------------------------------------------------------
// @media-scraper/dedupe — FileSignatureStrategy tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { FileSignatureStrategy } from '../strategies/file-signature.js';
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

describe('FileSignatureStrategy', () => {
  const strategy = new FileSignatureStrategy();

  it('has name "file-signature"', () => {
    expect(strategy.name).toBe('file-signature');
  });

  describe('same file, different CDN → same fingerprint', () => {
    it('same path on different hosts', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn1.example.com/images/2024/hero.jpg'),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn2.othercdn.io/images/2024/hero.jpg'),
      );
      expect(a).toBe(b);
    });

    it('same file with different query params', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn1.example.com/photos/banner.png'),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn2.example.com/photos/banner.png?w=800&token=xyz'),
      );
      expect(a).toBe(b);
    });
  });

  describe('different files → different fingerprints', () => {
    it('different filename in same directory', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn.example.com/images/a.jpg'),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn.example.com/images/b.jpg'),
      );
      expect(a).not.toBe(b);
    });

    it('different directory, same filename', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn.example.com/2023/photo.jpg'),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn.example.com/2024/photo.jpg'),
      );
      expect(a).not.toBe(b);
    });

    it('different extension', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn.example.com/img/photo.jpg'),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn.example.com/img/photo.png'),
      );
      expect(a).not.toBe(b);
    });
  });

  describe('path segment extraction', () => {
    it('uses last two directory segments', () => {
      const fp = strategy.fingerprint(
        makeResource('https://cdn.example.com/a/b/c/d/file.jpg'),
      );
      // last two dirs: c/d → c/d/file.jpg
      expect(fp).toBe('c/d/file.jpg');
    });

    it('single directory segment', () => {
      const fp = strategy.fingerprint(
        makeResource('https://cdn.example.com/photos/file.jpg'),
      );
      expect(fp).toBe('photos/file.jpg');
    });

    it('file at root', () => {
      const fp = strategy.fingerprint(
        makeResource('https://cdn.example.com/file.jpg'),
      );
      expect(fp).toBe('file.jpg');
    });
  });

  describe('edge cases', () => {
    it('invalid URL does not throw', () => {
      expect(() => strategy.fingerprint(makeResource('not-a-url'))).not.toThrow();
      expect(typeof strategy.fingerprint(makeResource('not-a-url'))).toBe('string');
    });

    it('root URL returns hostname', () => {
      const fp = strategy.fingerprint(
        makeResource('https://cdn.example.com/'),
      );
      expect(typeof fp).toBe('string');
      expect(fp).toContain('cdn.example.com');
    });

    it('URL with hash fragment (fragment ignored)', () => {
      const fp = strategy.fingerprint(
        makeResource('https://cdn.example.com/images/pic.jpg#fragment'),
      );
      expect(fp).toBe('images/pic.jpg');
    });

    it('URL with no extension', () => {
      const fp = strategy.fingerprint(
        makeResource('https://cdn.example.com/api/v1/download'),
      );
      // segments: ['api','v1','download'] → last two dirs + filename: api/v1/download
      expect(fp).toBe('api/v1/download');
    });

    it('deeply nested path', () => {
      const fp = strategy.fingerprint(
        makeResource('https://cdn.example.com/x/y/z/w/v/u/deep.jpg'),
      );
      // segments: ['x','y','z','w','v','u','deep.jpg'] → last two dirs + filename: v/u/deep.jpg
      expect(fp).toBe('v/u/deep.jpg');
    });
  });
});
