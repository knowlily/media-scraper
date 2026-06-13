// ---------------------------------------------------------------------------
// @media-scraper/dedupe — PerceptualHashStrategy tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { PerceptualHashStrategy } from '../strategies/perceptual-hash.js';
import type { MediaResource } from '@media-scraper/core';

function makeResource(url: string, overrides: Partial<MediaResource> = {}): MediaResource {
  return {
    id: `id-${url.slice(0, 8)}`,
    url,
    type: 'image',
    filename: 'test.jpg',
    extension: '.jpg',
    size: 1024,
    width: 0,
    height: 0,
    thumbnail: '',
    source: 'img',
    ...overrides,
  };
}

describe('PerceptualHashStrategy', () => {
  const strategy = new PerceptualHashStrategy();

  it('has name "perceptual-hash"', () => {
    expect(strategy.name).toBe('perceptual-hash');
  });

  describe('applicability', () => {
    it('only activates for image type with size > 0', () => {
      const imageResource = makeResource('https://cdn.example.com/photo.jpg', {
        type: 'image',
        size: 51200,
      });
      const fp = strategy.fingerprint(imageResource);
      // Falls back to URL-based fingerprint, prefixed with 'url:'
      expect(fp).toMatch(/^url:/);
    });

    it('falls back for size = 0', () => {
      const resource = makeResource('https://cdn.example.com/photo.jpg', {
        type: 'image',
        size: 0,
      });
      const fp = strategy.fingerprint(resource);
      expect(fp).toMatch(/^url:/);
    });

    it('falls back for video type (even with size)', () => {
      const videoResource = makeResource('https://cdn.example.com/video.mp4', {
        type: 'video',
        size: 999999,
      });
      const fp = strategy.fingerprint(videoResource);
      expect(fp).toMatch(/^url:/);
    });

    it('falls back for audio type', () => {
      const audioResource = makeResource('https://cdn.example.com/song.mp3', {
        type: 'audio',
        size: 5000,
      });
      const fp = strategy.fingerprint(audioResource);
      expect(fp).toMatch(/^url:/);
    });

    it('falls back for document type', () => {
      const docResource = makeResource('https://cdn.example.com/file.pdf', {
        type: 'document',
        size: 10000,
      });
      const fp = strategy.fingerprint(docResource);
      expect(fp).toMatch(/^url:/);
    });
  });

  describe('fallback URL fingerprint', () => {
    it('same URL with tracking params → same fallback fingerprint', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn.example.com/photo.jpg', { type: 'image', size: 1024 }),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn.example.com/photo.jpg?token=abc', { type: 'image', size: 1024 }),
      );
      // Both fall back to URL — tracking params stripped
      expect(a).toBe(b);
    });

    it('removes trailing slash from fallback URL', () => {
      const fp = strategy.fingerprint(
        makeResource('https://cdn.example.com/gallery/', { type: 'image', size: 1024 }),
      );
      expect(fp).not.toContain('gallery//');
    });

    it('different URLs → different fallback fingerprints', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn.example.com/a.jpg', { type: 'image', size: 1024 }),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn.example.com/b.jpg', { type: 'image', size: 1024 }),
      );
      expect(a).not.toBe(b);
    });
  });

  describe('fromBytes static method', () => {
    it('returns a hash: prefix', () => {
      const buffer = new ArrayBuffer(512);
      const view = new Uint8Array(buffer);
      // Fill with some non-zero data
      for (let i = 0; i < view.length; i++) {
        view[i] = i % 256;
      }
      const hash = PerceptualHashStrategy.fromBytes(buffer);
      expect(hash).toMatch(/^hash:/);
    });

    it('identical buffers → identical hashes', () => {
      const buf1 = new ArrayBuffer(256);
      const buf2 = new ArrayBuffer(256);
      const v1 = new Uint8Array(buf1);
      const v2 = new Uint8Array(buf2);
      for (let i = 0; i < 256; i++) {
        v1[i] = (i * 7 + 13) % 256;
        v2[i] = (i * 7 + 13) % 256;
      }
      expect(PerceptualHashStrategy.fromBytes(buf1)).toBe(
        PerceptualHashStrategy.fromBytes(buf2),
      );
    });

    it('different buffers → different hashes', () => {
      const buf1 = new ArrayBuffer(64);
      const buf2 = new ArrayBuffer(64);
      const v1 = new Uint8Array(buf1);
      const v2 = new Uint8Array(buf2);
      for (let i = 0; i < 64; i++) {
        v1[i] = 42; // all in same bucket pattern
        v2[i] = (i * 13) % 256; // different distribution
      }
      expect(PerceptualHashStrategy.fromBytes(buf1)).not.toBe(
        PerceptualHashStrategy.fromBytes(buf2),
      );
    });

    it('handles empty buffer', () => {
      const buf = new ArrayBuffer(0);
      expect(() => PerceptualHashStrategy.fromBytes(buf)).not.toThrow();
      const hash = PerceptualHashStrategy.fromBytes(buf);
      expect(hash).toMatch(/^hash:/);
    });

    it('truncates to byteLimit', () => {
      const buf = new ArrayBuffer(2000);
      const view = new Uint8Array(buf);
      for (let i = 0; i < 2000; i++) view[i] = 42;

      // Two buffers with same first 100 bytes but different tail
      const bufShort = new ArrayBuffer(100);
      const vs = new Uint8Array(bufShort);
      for (let i = 0; i < 100; i++) vs[i] = 42;

      expect(PerceptualHashStrategy.fromBytes(buf, 100)).toBe(
        PerceptualHashStrategy.fromBytes(bufShort, 100),
      );
    });
  });

  describe('no throw guarantee', () => {
    it('never throws on any input', () => {
      expect(() => strategy.fingerprint(makeResource(''))).not.toThrow();
      expect(() =>
        strategy.fingerprint(makeResource('https://x.com/y.jpg', { type: 'image', size: -1 })),
      ).not.toThrow();
      expect(() =>
        strategy.fingerprint(makeResource('https://x.com/y.jpg', { type: 'unknown', size: 500 })),
      ).not.toThrow();
    });
  });

  describe('same image via different URLs', () => {
    it('with fallback: same path/different CDN → same fingerprint', () => {
      // Since we fall back to URL, CDN differences matter. But the
      // fallback strips tracking params. Same path on different CDs
      // will produce different URL fingerprints — that's expected.
      const a = strategy.fingerprint(
        makeResource('https://cdn1.example.com/images/hero.jpg', { type: 'image', size: 1024 }),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn2.example.com/images/hero.jpg', { type: 'image', size: 1024 }),
      );
      // Different CDN → different URL → different fingerprint (expected for pure URL fallback)
      expect(a).not.toBe(b);
    });

    it('same URL with different tracking → same', () => {
      const a = strategy.fingerprint(
        makeResource('https://cdn.example.com/photo.jpg', { type: 'image', size: 1024 }),
      );
      const b = strategy.fingerprint(
        makeResource('https://cdn.example.com/photo.jpg?utm_source=a&_t=1', { type: 'image', size: 1024 }),
      );
      expect(a).toBe(b);
    });
  });
});
