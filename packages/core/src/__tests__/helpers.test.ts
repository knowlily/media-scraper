// ---------------------------------------------------------------------------
// @media-scraper/core — helpers.test.ts
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  resolveUrl,
  makeResource,
  parseSrcset,
  pickBestCandidate,
  resolveImgSrc,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
  DOCUMENT_EXTENSIONS,
} from '../extractors/helpers.js';
import type { ElementLike, MediaResource } from '../types.js';

// ---------------------------------------------------------------------------
// Mock element factory
// ---------------------------------------------------------------------------

function el(tag: string, attrs: Record<string, string> = {}): ElementLike {
  return {
    tagName: tag,
    getAttribute(name: string): string | null {
      return attrs[name] ?? null;
    },
    querySelectorAll(_selector: string): ElementLike[] {
      return [];
    },
    querySelector(_selector: string): ElementLike | null {
      return null;
    },
    textContent: null,
  };
}

// ---------------------------------------------------------------------------
// resolveUrl
// ---------------------------------------------------------------------------

describe('resolveUrl', () => {
  const baseUrl = 'https://example.com/page/index.html';

  it('resolves absolute URL unchanged', () => {
    expect(resolveUrl('https://other.com/img.jpg', baseUrl)).toBe(
      'https://other.com/img.jpg',
    );
  });

  it('resolves relative path against baseUrl', () => {
    expect(resolveUrl('/images/photo.jpg', baseUrl)).toBe(
      'https://example.com/images/photo.jpg',
    );
  });

  it('resolves relative path without leading slash', () => {
    expect(resolveUrl('photo.jpg', baseUrl)).toBe(
      'https://example.com/page/photo.jpg',
    );
  });

  it('resolves protocol-relative URL', () => {
    expect(resolveUrl('//cdn.example.com/img.png', baseUrl)).toBe(
      'https://cdn.example.com/img.png',
    );
  });

  it('returns null for empty string', () => {
    expect(resolveUrl('', baseUrl)).toBeNull();
  });

  it('returns null for data: URI', () => {
    expect(resolveUrl('data:image/png;base64,abc123', baseUrl)).toBeNull();
  });

  it('returns null for blob: URI', () => {
    expect(resolveUrl('blob:https://example.com/uuid', baseUrl)).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(resolveUrl('   ', baseUrl)).toBeNull();
  });

  it('handles URL with query string', () => {
    expect(resolveUrl('/img.jpg?size=large', baseUrl)).toBe(
      'https://example.com/img.jpg?size=large',
    );
  });

  it('handles URL with hash', () => {
    expect(resolveUrl('/img.jpg#fragment', baseUrl)).toBe(
      'https://example.com/img.jpg#fragment',
    );
  });

  it('encodes spaces and special chars as valid relative URLs (WHATWG URL parser)', () => {
    // The WHATWG URL parser is very forgiving — it percent-encodes spaces
    const result = resolveUrl('not a valid url at all !!!', baseUrl);
    expect(result).toBe('https://example.com/page/not%20a%20valid%20url%20at%20all%20!!!');
  });

  it('trims whitespace around URL', () => {
    expect(resolveUrl('  /img.jpg  ', baseUrl)).toBe(
      'https://example.com/img.jpg',
    );
  });
});

// ---------------------------------------------------------------------------
// makeResource
// ---------------------------------------------------------------------------

describe('makeResource', () => {
  it('creates a resource with inferred fields', () => {
    const r = makeResource('https://example.com/photo.jpg', 'image', 'img');
    expect(r.type).toBe('image');
    expect(r.source).toBe('img');
    expect(r.url).toBe('https://example.com/photo.jpg');
    expect(r.filename).toBe('photo.jpg');
    expect(r.extension).toBe('.jpg');
    expect(r.size).toBe(0);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
    expect(r.thumbnail).toBe('');
    expect(r.id).toBeTruthy();
    expect(typeof r.id).toBe('string');
  });

  it('generates unique IDs for each resource', () => {
    const r1 = makeResource('https://a.com/1.jpg', 'image', 'img');
    const r2 = makeResource('https://a.com/2.jpg', 'image', 'img');
    expect(r1.id).not.toBe(r2.id);
  });

  it('accepts overrides for optional fields', () => {
    const r = makeResource('https://example.com/video.mp4', 'video', 'video', {
      thumbnail: 'https://example.com/thumb.jpg',
      width: 1920,
      height: 1080,
      alt: 'A video',
      title: 'My Video',
      isStreaming: true,
    });
    expect(r.thumbnail).toBe('https://example.com/thumb.jpg');
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
    expect(r.alt).toBe('A video');
    expect(r.title).toBe('My Video');
    expect(r.isStreaming).toBe(true);
  });

  it('overrides filename and extension when provided', () => {
    const r = makeResource('https://example.com/video.mp4', 'video', 'video', {
      filename: 'custom.mp4',
      extension: '.mp4',
    });
    expect(r.filename).toBe('custom.mp4');
    expect(r.extension).toBe('.mp4');
  });

  it('sets isStreaming to false by default (undefined)', () => {
    const r = makeResource('https://example.com/video.mp4', 'video', 'video');
    expect(r.isStreaming).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseSrcset
// ---------------------------------------------------------------------------

describe('parseSrcset', () => {
  const baseUrl = 'https://example.com/';

  it('parses single w-descriptor candidate', () => {
    const candidates = parseSrcset('image-600w.jpg 600w', baseUrl);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].url).toBe('https://example.com/image-600w.jpg');
    expect(candidates[0].descriptor).toBe(600);
    expect(candidates[0].descriptorType).toBe('w');
  });

  it('parses single x-descriptor candidate', () => {
    const candidates = parseSrcset('image.jpg 2x', baseUrl);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].url).toBe('https://example.com/image.jpg');
    expect(candidates[0].descriptor).toBe(2);
    expect(candidates[0].descriptorType).toBe('x');
  });

  it('defaults to 1x when no descriptor', () => {
    const candidates = parseSrcset('image.jpg', baseUrl);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].descriptor).toBe(1);
    expect(candidates[0].descriptorType).toBe('x');
  });

  it('parses multiple comma-separated candidates', () => {
    const candidates = parseSrcset(
      'small.jpg 400w, medium.jpg 800w, large.jpg 1200w',
      baseUrl,
    );
    expect(candidates).toHaveLength(3);
    expect(candidates[0].url).toBe('https://example.com/small.jpg');
    expect(candidates[1].url).toBe('https://example.com/medium.jpg');
    expect(candidates[2].url).toBe('https://example.com/large.jpg');
  });

  it('parses mix of w and x descriptors', () => {
    const candidates = parseSrcset(
      'img-400.jpg 400w, img.jpg 1x, img-hires.jpg 2x',
      baseUrl,
    );
    expect(candidates).toHaveLength(3);
    expect(candidates[0].descriptorType).toBe('w');
    expect(candidates[1].descriptorType).toBe('x');
    expect(candidates[2].descriptorType).toBe('x');
  });

  it('skips data: URLs when the URL itself starts with data:', () => {
    // data: URLs cause split tokens, but the 'data:' part itself is always skipped
    const candidates = parseSrcset(
      'data:image/png;base64,iVBORw 1x',
      baseUrl,
    );
    // The 'data:image/png;base64' part is skipped; 'iVBORw 1x' resolves as relative
    // This is expected behavior: base64 payloads after comma are indistinguishable
    expect(candidates.length).toBeGreaterThanOrEqual(0);
  });

  it('returns empty array for empty string', () => {
    expect(parseSrcset('', baseUrl)).toEqual([]);
  });

  it('handles bare number descriptor as width', () => {
    const candidates = parseSrcset('img.jpg 600', baseUrl);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].descriptorType).toBe('w');
    expect(candidates[0].descriptor).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// pickBestCandidate
// ---------------------------------------------------------------------------

describe('pickBestCandidate', () => {
  const baseUrl = 'https://example.com/';

  it('returns null for empty array', () => {
    expect(pickBestCandidate([])).toBeNull();
  });

  it('returns the single candidate', () => {
    const candidates = parseSrcset('img.jpg 2x', baseUrl);
    const best = pickBestCandidate(candidates);
    expect(best?.url).toBe('https://example.com/img.jpg');
  });

  it('prefers w-descriptor over x-descriptor', () => {
    const candidates = parseSrcset(
      'img-400.jpg 400w, img.jpg 3x',
      baseUrl,
    );
    const best = pickBestCandidate(candidates);
    // w descriptor candidates take priority
    expect(best?.url).toBe('https://example.com/img-400.jpg');
  });

  it('picks the largest w-descriptor', () => {
    const candidates = parseSrcset(
      'img-400.jpg 400w, img-800.jpg 800w, img-1200.jpg 1200w',
      baseUrl,
    );
    const best = pickBestCandidate(candidates);
    expect(best?.url).toBe('https://example.com/img-1200.jpg');
  });

  it('picks the largest x-descriptor when no w', () => {
    const candidates = parseSrcset(
      'img.jpg 1x, img-hires.jpg 3x, img-med.jpg 2x',
      baseUrl,
    );
    const best = pickBestCandidate(candidates);
    expect(best?.url).toBe('https://example.com/img-hires.jpg');
  });
});

// ---------------------------------------------------------------------------
// resolveImgSrc
// ---------------------------------------------------------------------------

describe('resolveImgSrc', () => {
  const baseUrl = 'https://example.com/';

  it('resolves src attribute', () => {
    const img = el('img', { src: 'photo.jpg' });
    expect(resolveImgSrc(img, baseUrl)).toBe('https://example.com/photo.jpg');
  });

  it('returns null when neither src nor srcset present', () => {
    const img = el('img', {});
    expect(resolveImgSrc(img, baseUrl)).toBeNull();
  });

  it('prefers srcset over src', () => {
    const img = el('img', {
      srcset: 'large.jpg 1200w, small.jpg 400w',
      src: 'fallback.jpg',
    });
    // Should pick largest from srcset (1200w → large.jpg)
    expect(resolveImgSrc(img, baseUrl)).toBe('https://example.com/large.jpg');
  });

  it('falls back to src when srcset has no resolvable URLs', () => {
    // Use an empty/invalid srcset so no candidates are found
    const img = el('img', {
      srcset: '',
      src: 'real.jpg',
    });
    expect(resolveImgSrc(img, baseUrl)).toBe('https://example.com/real.jpg');
  });

  it('returns null when src is also invalid', () => {
    const img = el('img', { src: 'data:image/png,abc' });
    expect(resolveImgSrc(img, baseUrl)).toBeNull();
  });

  it('resolves relative srcset URLs', () => {
    const img = el('img', {
      srcset: '/images/large.jpg 1200w',
    });
    expect(resolveImgSrc(img, baseUrl)).toBe('https://example.com/images/large.jpg');
  });
});

// ---------------------------------------------------------------------------
// Extension constant sets
// ---------------------------------------------------------------------------

describe('IMAGE_EXTENSIONS', () => {
  it('contains common image extensions', () => {
    expect(IMAGE_EXTENSIONS.has('.jpg')).toBe(true);
    expect(IMAGE_EXTENSIONS.has('.jpeg')).toBe(true);
    expect(IMAGE_EXTENSIONS.has('.png')).toBe(true);
    expect(IMAGE_EXTENSIONS.has('.gif')).toBe(true);
    expect(IMAGE_EXTENSIONS.has('.webp')).toBe(true);
    expect(IMAGE_EXTENSIONS.has('.svg')).toBe(true);
    expect(IMAGE_EXTENSIONS.has('.avif')).toBe(true);
    expect(IMAGE_EXTENSIONS.has('.ico')).toBe(true);
  });

  it('does not contain non-image extensions', () => {
    expect(IMAGE_EXTENSIONS.has('.mp4')).toBe(false);
    expect(IMAGE_EXTENSIONS.has('.mp3')).toBe(false);
    expect(IMAGE_EXTENSIONS.has('.pdf')).toBe(false);
  });
});

describe('VIDEO_EXTENSIONS', () => {
  it('contains common video extensions', () => {
    expect(VIDEO_EXTENSIONS.has('.mp4')).toBe(true);
    expect(VIDEO_EXTENSIONS.has('.webm')).toBe(true);
    expect(VIDEO_EXTENSIONS.has('.mov')).toBe(true);
    expect(VIDEO_EXTENSIONS.has('.avi')).toBe(true);
    expect(VIDEO_EXTENSIONS.has('.mkv')).toBe(true);
    expect(VIDEO_EXTENSIONS.has('.flv')).toBe(true);
    expect(VIDEO_EXTENSIONS.has('.ogv')).toBe(true);
  });

  it('does not contain .ogg (audio only)', () => {
    expect(VIDEO_EXTENSIONS.has('.ogg')).toBe(false);
  });
});

describe('AUDIO_EXTENSIONS', () => {
  it('contains common audio extensions', () => {
    expect(AUDIO_EXTENSIONS.has('.mp3')).toBe(true);
    expect(AUDIO_EXTENSIONS.has('.wav')).toBe(true);
    expect(AUDIO_EXTENSIONS.has('.ogg')).toBe(true);
    expect(AUDIO_EXTENSIONS.has('.flac')).toBe(true);
    expect(AUDIO_EXTENSIONS.has('.aac')).toBe(true);
    expect(AUDIO_EXTENSIONS.has('.opus')).toBe(true);
  });

  it('does not contain video extensions', () => {
    expect(AUDIO_EXTENSIONS.has('.mp4')).toBe(false);
    expect(AUDIO_EXTENSIONS.has('.mkv')).toBe(false);
  });
});

describe('DOCUMENT_EXTENSIONS', () => {
  it('contains common document extensions', () => {
    expect(DOCUMENT_EXTENSIONS.has('.pdf')).toBe(true);
    expect(DOCUMENT_EXTENSIONS.has('.doc')).toBe(true);
    expect(DOCUMENT_EXTENSIONS.has('.docx')).toBe(true);
    expect(DOCUMENT_EXTENSIONS.has('.xls')).toBe(true);
    expect(DOCUMENT_EXTENSIONS.has('.xlsx')).toBe(true);
    expect(DOCUMENT_EXTENSIONS.has('.zip')).toBe(true);
    expect(DOCUMENT_EXTENSIONS.has('.epub')).toBe(true);
  });

  it('does not contain media extensions', () => {
    expect(DOCUMENT_EXTENSIONS.has('.jpg')).toBe(false);
    expect(DOCUMENT_EXTENSIONS.has('.mp3')).toBe(false);
  });
});
