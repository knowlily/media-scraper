// ---------------------------------------------------------------------------
// @media-scraper/core — scrapeStream tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { scrapeStream } from '../output/stream.js';
import type { DocumentLike, ElementLike } from '../types.js';
import type { MediaParser } from '../parsers/types.js';

function makeEmptyDoc(title = 'test'): DocumentLike {
  return {
    title,
    querySelectorAll: () => [],
    querySelector: () => null,
  };
}

function makeImageDoc(): DocumentLike {
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
    title: 'Has Image',
    querySelectorAll: (sel: string) => {
      if (sel === 'img' || sel === 'img[src]' || sel === '*') return [img];
      return [];
    },
    querySelector: () => null,
  };
}

const echoParser: MediaParser = {
  name: 'echo',
  mediaType: 'image',
  phase: 1,
  extract: (_doc: DocumentLike, _baseUrl: string) => [
    {
      id: 'e1',
      url: 'https://example.com/echo.jpg',
      type: 'image',
      filename: 'echo.jpg',
      extension: '.jpg',
      size: 100,
      width: 10,
      height: 10,
      thumbnail: '',
      source: 'img',
    },
  ],
};

const failingParser: MediaParser = {
  name: 'failer',
  mediaType: 'image',
  phase: 2,
  extract: () => {
    throw new Error('Simulated failure');
  },
};

describe('scrapeStream', () => {
  it('yields 7 phases for default parsers', async () => {
    const phases: number[] = [];
    for await (const frame of scrapeStream(makeEmptyDoc(), 'https://example.com')) {
      phases.push(frame.phase);
    }
    expect(phases).toHaveLength(7);
    expect(phases).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('cumulative array grows across phases', async () => {
    let lastLen = -1;
    for await (const frame of scrapeStream(makeImageDoc(), 'https://example.com')) {
      expect(frame.cumulative.length).toBeGreaterThanOrEqual(lastLen);
      lastLen = frame.cumulative.length;
    }
  });

  it('progress increases from 0 to 1', async () => {
    const progresses: number[] = [];
    for await (const frame of scrapeStream(makeEmptyDoc(), 'https://example.com')) {
      progresses.push(frame.progress);
    }
    expect(progresses[0]).toBeGreaterThan(0);
    expect(progresses[progresses.length - 1]).toBe(1);
  });

  it('respects AbortSignal and stops early', async () => {
    const controller = new AbortController();
    const phases: number[] = [];
    let count = 0;

    for await (const frame of scrapeStream(makeEmptyDoc(), 'https://example.com', {
      signal: controller.signal,
    })) {
      phases.push(frame.phase);
      count++;
      if (count === 3) {
        controller.abort();
      }
    }

    // Should have stopped early (phase 3 yielded, then return)
    expect(phases.length).toBeLessThan(7);
  });

  it('continues after a single parser fails', async () => {
    const secondEcho: MediaParser = {
      ...echoParser,
      name: 'echo2',
      phase: 3,
    };
    const parsers: MediaParser[] = [
      echoParser,
      failingParser,
      secondEcho,
    ];

    const phases: number[] = [];
    for await (const frame of scrapeStream(makeEmptyDoc(), 'https://example.com', {
      parsers,
    })) {
      phases.push(frame.phase);
    }

    // All 3 phases should run despite phase 2 failing
    expect(phases).toHaveLength(3);
    expect(phases).toEqual([1, 2, 3]);
  });

  it('custom parsers override defaults', async () => {
    const customParser: MediaParser = {
      name: 'custom',
      mediaType: 'image',
      phase: 1,
      extract: () => [
        {
          id: 'c1',
          url: 'https://example.com/custom.png',
          type: 'image',
          filename: 'custom.png',
          extension: '.png',
          size: 500,
          width: 200,
          height: 200,
          thumbnail: '',
          source: 'img',
        },
      ],
    };

    const parsers: MediaParser[] = [customParser];
    const frames: { items: number }[] = [];
    for await (const frame of scrapeStream(makeEmptyDoc(), 'https://example.com', {
      parsers,
    })) {
      frames.push({ items: frame.items.length });
    }

    expect(frames).toHaveLength(1);
    expect(frames[0].items).toBe(1);
  });

  it('handles empty page gracefully', async () => {
    for await (const frame of scrapeStream(makeEmptyDoc(), 'https://example.com')) {
      expect(frame.items).toEqual([]);
    }
  });
});
