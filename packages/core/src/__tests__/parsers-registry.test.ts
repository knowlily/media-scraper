// ---------------------------------------------------------------------------
// @media-scraper/core — parser registry tests
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { registerParser, getRegisteredParsers, clearParsers } from '../parsers/registry.js';
import type { MediaParser } from '../parsers/types.js';

function makeParser(name: string, phase: number, mediaType: 'image' | 'video' | 'audio' | 'document' = 'image'): MediaParser {
  return {
    name,
    mediaType,
    phase,
    extract: () => [],
  };
}

describe('parser registry', () => {
  beforeEach(() => {
    clearParsers();
  });

  it('starts empty', () => {
    expect(getRegisteredParsers()).toEqual([]);
  });

  it('registerParser makes the parser visible', () => {
    const parser = makeParser('test-parser', 1);
    registerParser(parser);
    expect(getRegisteredParsers()).toEqual([parser]);
  });

  it('registers multiple parsers sorted by phase', () => {
    const p1 = makeParser('audio-parser', 5, 'audio');
    const p2 = makeParser('image-parser', 1, 'image');
    const p3 = makeParser('video-parser', 3, 'video');

    registerParser(p1);
    registerParser(p2);
    registerParser(p3);

    const result = getRegisteredParsers();
    expect(result.map((p) => p.name)).toEqual(['image-parser', 'video-parser', 'audio-parser']);
    expect(result.map((p) => p.phase)).toEqual([1, 3, 5]);
  });

  it('clearParsers removes all parsers', () => {
    registerParser(makeParser('a', 1));
    registerParser(makeParser('b', 2));
    clearParsers();
    expect(getRegisteredParsers()).toEqual([]);
  });

  it('overwrites parser with same name', () => {
    const p1 = makeParser('dup', 1);
    const p2 = makeParser('dup', 99);
    registerParser(p1);
    registerParser(p2);
    expect(getRegisteredParsers()).toHaveLength(1);
    expect(getRegisteredParsers()[0].phase).toBe(99);
  });
});
