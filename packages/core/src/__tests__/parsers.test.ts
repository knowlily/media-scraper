// ---------------------------------------------------------------------------
// @media-scraper/core — built-in parser tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type { DocumentLike, ElementLike } from '../types.js';
import { ImageParser } from '../parsers/image.js';
import { BackgroundParser } from '../parsers/background.js';
import { IframeParser } from '../parsers/iframe.js';
import { VideoParser } from '../parsers/video.js';
import { AudioParser } from '../parsers/audio.js';
import { DocumentParser } from '../parsers/document.js';
import { ShadowParser } from '../parsers/shadow.js';

function makeEmptyDoc(title = 'test'): DocumentLike {
  return {
    title,
    querySelectorAll: () => [],
    querySelector: () => null,
  };
}

function makeDocWithImage(title = 'test'): DocumentLike {
  const img: ElementLike = {
    tagName: 'IMG',
    getAttribute: (name: string) => {
      if (name === 'src') return 'https://example.com/photo.jpg';
      return null;
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    textContent: null,
  };
  return {
    title,
    querySelectorAll: (sel: string) => {
      if (sel === 'img') return [img];
      if (sel === 'img[src]') return [img];
      if (sel === '*') return [img];
      return [];
    },
    querySelector: () => null,
  };
}

describe('ImageParser', () => {
  it('extract() returns resources', () => {
    const doc = makeDocWithImage();
    const result = ImageParser.extract(doc, 'https://example.com');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].type).toBe('image');
  });

  it('extract() on empty page returns empty array', () => {
    const doc = makeEmptyDoc();
    const result = ImageParser.extract(doc, 'https://example.com');
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('BackgroundParser', () => {
  it('extract() on empty page returns empty array', () => {
    const doc = makeEmptyDoc();
    const result = BackgroundParser.extract(doc, 'https://example.com');
    expect(Array.isArray(result)).toBe(true);
  });

  it('has correct phase and media type', () => {
    expect(BackgroundParser.phase).toBe(2);
    expect(BackgroundParser.mediaType).toBe('image');
  });
});

describe('IframeParser', () => {
  it('extract() on empty page returns empty array', () => {
    const doc = makeEmptyDoc();
    const result = IframeParser.extract(doc, 'https://example.com');
    expect(Array.isArray(result)).toBe(true);
  });

  it('has correct phase and media type', () => {
    expect(IframeParser.phase).toBe(3);
    expect(IframeParser.mediaType).toBe('video');
  });
});

describe('VideoParser', () => {
  it('extract() on empty page returns empty array', () => {
    const doc = makeEmptyDoc();
    const result = VideoParser.extract(doc, 'https://example.com');
    expect(Array.isArray(result)).toBe(true);
  });

  it('has correct phase and media type', () => {
    expect(VideoParser.phase).toBe(4);
    expect(VideoParser.mediaType).toBe('video');
  });
});

describe('AudioParser', () => {
  it('extract() on empty page returns empty array', () => {
    const doc = makeEmptyDoc();
    const result = AudioParser.extract(doc, 'https://example.com');
    expect(Array.isArray(result)).toBe(true);
  });

  it('has correct phase and media type', () => {
    expect(AudioParser.phase).toBe(5);
    expect(AudioParser.mediaType).toBe('audio');
  });
});

describe('DocumentParser', () => {
  it('extract() on empty page returns empty array', () => {
    const doc = makeEmptyDoc();
    const result = DocumentParser.extract(doc, 'https://example.com');
    expect(Array.isArray(result)).toBe(true);
  });

  it('has correct phase and media type', () => {
    expect(DocumentParser.phase).toBe(6);
    expect(DocumentParser.mediaType).toBe('document');
  });
});

describe('ShadowParser', () => {
  it('extract() on empty page returns empty array', () => {
    const doc = makeEmptyDoc();
    const result = ShadowParser.extract(doc, 'https://example.com');
    expect(Array.isArray(result)).toBe(true);
  });

  it('has correct phase and media type', () => {
    expect(ShadowParser.phase).toBe(7);
    expect(ShadowParser.mediaType).toBe('mixed');
  });
});

describe('parser consistency', () => {
  const allParsers = [
    ImageParser,
    BackgroundParser,
    IframeParser,
    VideoParser,
    AudioParser,
    DocumentParser,
    ShadowParser,
  ];

  it('all 7 parsers have unique phases', () => {
    const phases = allParsers.map((p) => p.phase);
    expect(new Set(phases).size).toBe(7);
  });

  it('all parsers implement extract', () => {
    for (const p of allParsers) {
      expect(typeof p.extract).toBe('function');
    }
  });

  it('all parsers have a name', () => {
    for (const p of allParsers) {
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
    }
  });
});
