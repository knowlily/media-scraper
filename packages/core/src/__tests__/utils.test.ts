// ---------------------------------------------------------------------------
// @media-scraper/core — utils.test.ts
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateId, extractFilename, getExtension, isMediaUrl } from '../utils.js';

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------

describe('generateId', () => {
  it('returns a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns unique values on multiple calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('matches UUID format when crypto.randomUUID is available', () => {
    // crypto.randomUUID() returns UUID v4 in modern Node/Browser; fallback uses timestmap+random
    const id = generateId();
    // UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    // Fallback: <timestamp36>-<random8>
    const fallbackRegex = /^[0-9a-z]+-[0-9a-z]+$/i;
    const hasUUID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function';
    expect(id).toMatch(hasUUID ? uuidRegex : fallbackRegex);
  });

  it('returns a non-empty string every time', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateId().length).toBeGreaterThan(0);
    }
  });

  it('falls back to timestamp+random when crypto.randomUUID is unavailable', () => {
    // Temporarily remove crypto.randomUUID to trigger the fallback path
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      randomUUID: undefined,
    });
    try {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      // Fallback format is <timestamp36>-<random8>
      expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ---------------------------------------------------------------------------
// extractFilename
// ---------------------------------------------------------------------------

describe('extractFilename', () => {
  it('extracts filename from simple URL', () => {
    expect(extractFilename('https://example.com/path/to/photo.jpg')).toBe('photo.jpg');
  });

  it('handles URL with query string', () => {
    expect(extractFilename('https://example.com/image.png?width=100&height=200')).toBe('image.png');
  });

  it('handles URL with hash fragment', () => {
    expect(extractFilename('https://example.com/video.mp4#t=10')).toBe('video.mp4');
  });

  it('handles URL with both query string and fragment', () => {
    expect(extractFilename('https://example.com/file.pdf?page=1#section')).toBe('file.pdf');
  });

  it('handles URL ending in / (directory-like)', () => {
    const result = extractFilename('https://example.com/gallery/');
    expect(result).toBe('gallery');
  });

  it('handles root URL', () => {
    const result = extractFilename('https://example.com/');
    expect(result).toBe('index');
  });

  it('handles URL with no filename extension in path', () => {
    const result = extractFilename('https://example.com/api/download');
    expect(result).toBe('download');
  });

  it('decodes URI-encoded filenames', () => {
    const result = extractFilename('https://example.com/%E4%B8%AD%E6%96%87.jpg');
    expect(result).toBe('中文.jpg');
  });

  it('returns "unknown" for invalid URL', () => {
    expect(extractFilename('not-a-valid-url')).toBe('unknown');
  });

  it('extracts filename from deeply nested path', () => {
    const result = extractFilename('https://example.com/a/b/c/d/e/final.mp3');
    expect(result).toBe('final.mp3');
  });
});

// ---------------------------------------------------------------------------
// getExtension
// ---------------------------------------------------------------------------

describe('getExtension', () => {
  it('returns ".jpg" for .jpg URL', () => {
    expect(getExtension('https://example.com/photo.jpg')).toBe('.jpg');
  });

  it('returns lowercase for uppercase extension', () => {
    expect(getExtension('https://example.com/photo.PDF')).toBe('.pdf');
  });

  it('returns empty string for URL with no extension', () => {
    expect(getExtension('https://example.com/path/file')).toBe('');
  });

  it('returns last extension for multiple dots', () => {
    expect(getExtension('https://example.com/archive.tar.gz')).toBe('.gz');
  });

  it('handles URL with query string (ignores query params)', () => {
    expect(getExtension('https://example.com/image.png?w=100')).toBe('.png');
  });

  it('handles URL with hash fragment', () => {
    expect(getExtension('https://example.com/video.mp4#t=30')).toBe('.mp4');
  });

  it('returns empty string for invalid URL', () => {
    expect(getExtension('not-a-url')).toBe('');
  });

  it('returns empty string for extension longer than 10 characters', () => {
    expect(getExtension('https://example.com/file.thisistoolong')).toBe('');
  });

  it('returns empty string for extension with non-alphanumeric chars', () => {
    expect(getExtension('https://example.com/file.some+thing')).toBe('');
  });

  it('returns ".jpeg" for .jpeg extension', () => {
    expect(getExtension('https://example.com/photo.jpeg')).toBe('.jpeg');
  });

  it('handles extension containing numbers', () => {
    expect(getExtension('https://example.com/audio.mp3')).toBe('.mp3');
  });
});

// ---------------------------------------------------------------------------
// isMediaUrl
// ---------------------------------------------------------------------------

describe('isMediaUrl', () => {
  // --- Image extensions ---
  it('returns "image" for .jpg', () => {
    expect(isMediaUrl('https://example.com/photo.jpg')).toBe('image');
  });

  it('returns "image" for .jpeg', () => {
    expect(isMediaUrl('https://example.com/photo.jpeg')).toBe('image');
  });

  it('returns "image" for .png', () => {
    expect(isMediaUrl('https://example.com/photo.png')).toBe('image');
  });

  it('returns "image" for .gif', () => {
    expect(isMediaUrl('https://example.com/animation.gif')).toBe('image');
  });

  it('returns "image" for .webp', () => {
    expect(isMediaUrl('https://example.com/photo.webp')).toBe('image');
  });

  it('returns "image" for .svg', () => {
    expect(isMediaUrl('https://example.com/icon.svg')).toBe('image');
  });

  it('returns "image" for .bmp', () => {
    expect(isMediaUrl('https://example.com/image.bmp')).toBe('image');
  });

  it('returns "image" for .ico', () => {
    expect(isMediaUrl('https://example.com/favicon.ico')).toBe('image');
  });

  it('returns "image" for .avif', () => {
    expect(isMediaUrl('https://example.com/photo.avif')).toBe('image');
  });

  // --- Video extensions ---
  it('returns "video" for .mp4', () => {
    expect(isMediaUrl('https://example.com/movie.mp4')).toBe('video');
  });

  it('returns "video" for .webm', () => {
    expect(isMediaUrl('https://example.com/clip.webm')).toBe('video');
  });

  it('returns "video" for .avi', () => {
    expect(isMediaUrl('https://example.com/movie.avi')).toBe('video');
  });

  it('returns "video" for .mov', () => {
    expect(isMediaUrl('https://example.com/movie.mov')).toBe('video');
  });

  it('returns "video" for .mkv', () => {
    expect(isMediaUrl('https://example.com/movie.mkv')).toBe('video');
  });

  it('returns "video" for .flv', () => {
    expect(isMediaUrl('https://example.com/stream.flv')).toBe('video');
  });

  it('returns "video" for .ogv', () => {
    expect(isMediaUrl('https://example.com/video.ogv')).toBe('video');
  });

  // --- Audio extensions ---
  it('returns "audio" for .mp3', () => {
    expect(isMediaUrl('https://example.com/song.mp3')).toBe('audio');
  });

  it('returns "audio" for .wav', () => {
    expect(isMediaUrl('https://example.com/sound.wav')).toBe('audio');
  });

  it('returns "audio" for .ogg', () => {
    expect(isMediaUrl('https://example.com/audio.ogg')).toBe('audio');
  });

  it('returns "audio" for .flac', () => {
    expect(isMediaUrl('https://example.com/music.flac')).toBe('audio');
  });

  it('returns "audio" for .aac', () => {
    expect(isMediaUrl('https://example.com/audio.aac')).toBe('audio');
  });

  it('returns "audio" for .m4a', () => {
    expect(isMediaUrl('https://example.com/podcast.m4a')).toBe('audio');
  });

  it('returns "audio" for .wma', () => {
    expect(isMediaUrl('https://example.com/music.wma')).toBe('audio');
  });

  it('returns "audio" for .opus', () => {
    expect(isMediaUrl('https://example.com/speech.opus')).toBe('audio');
  });

  // --- Document extensions ---
  it('returns "document" for .pdf', () => {
    expect(isMediaUrl('https://example.com/report.pdf')).toBe('document');
  });

  it('returns "document" for .doc', () => {
    expect(isMediaUrl('https://example.com/file.doc')).toBe('document');
  });

  it('returns "document" for .docx', () => {
    expect(isMediaUrl('https://example.com/file.docx')).toBe('document');
  });

  it('returns "document" for .xls', () => {
    expect(isMediaUrl('https://example.com/spreadsheet.xls')).toBe('document');
  });

  it('returns "document" for .xlsx', () => {
    expect(isMediaUrl('https://example.com/spreadsheet.xlsx')).toBe('document');
  });

  it('returns "document" for .ppt', () => {
    expect(isMediaUrl('https://example.com/slides.ppt')).toBe('document');
  });

  it('returns "document" for .pptx', () => {
    expect(isMediaUrl('https://example.com/slides.pptx')).toBe('document');
  });

  it('returns "document" for .zip', () => {
    expect(isMediaUrl('https://example.com/archive.zip')).toBe('document');
  });

  it('returns "document" for .rar', () => {
    expect(isMediaUrl('https://example.com/archive.rar')).toBe('document');
  });

  // --- Non-media extensions ---
  it('returns null for .html', () => {
    expect(isMediaUrl('https://example.com/page.html')).toBeNull();
  });

  it('returns null for .css', () => {
    expect(isMediaUrl('https://example.com/style.css')).toBeNull();
  });

  it('returns null for .js', () => {
    expect(isMediaUrl('https://example.com/script.js')).toBeNull();
  });

  // --- Edge cases ---
  it('returns null for URL with no extension', () => {
    expect(isMediaUrl('https://example.com/path/file')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(isMediaUrl('not-a-url')).toBeNull();
  });

  it('is case-insensitive (uppercase extension)', () => {
    expect(isMediaUrl('https://example.com/PHOTO.JPG')).toBe('image');
    expect(isMediaUrl('https://example.com/MOVIE.MP4')).toBe('video');
    expect(isMediaUrl('https://example.com/SONG.MP3')).toBe('audio');
    expect(isMediaUrl('https://example.com/DOC.PDF')).toBe('document');
  });
});
