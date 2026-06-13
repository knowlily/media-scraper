// ---------------------------------------------------------------------------
// @media-scraper/core — collectFromStream tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { collectFromStream } from '../output/collect.js';
import type { StreamYield } from '../output/stream.js';
import type { ScrapeError } from '../types.js';

async function* makeStream(
  frames: StreamYield[],
): AsyncGenerator<StreamYield, void, unknown> {
  for (const frame of frames) {
    yield frame;
  }
}

describe('collectFromStream', () => {
  it('collects empty stream', async () => {
    const stream = makeStream([]);
    const result = await collectFromStream(
      stream,
      'https://example.com',
      'Test',
      Date.now(),
      [],
      [],
      0,
    );

    expect(result.url).toBe('https://example.com');
    expect(result.title).toBe('Test');
    expect(result.total).toBe(0);
    expect(result.images).toEqual([]);
    expect(result.videos).toEqual([]);
    expect(result.audio).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.partial).toBe(false);
  });

  it('collects stream with items', async () => {
    const resource = {
      id: 'r1',
      url: 'https://example.com/img.jpg',
      type: 'image' as const,
      filename: 'img.jpg',
      extension: '.jpg',
      size: 100,
      width: 100,
      height: 100,
      thumbnail: '',
      source: 'img' as const,
    };

    const frames: StreamYield[] = [
      {
        phase: 1,
        items: [resource],
        cumulative: [resource],
        progress: 1,
        errors: [],
        partial: false,
        stats: { durationMs: 10, domNodeCount: 5, deduplicatedCount: 0, filteredCount: 0 },
      },
    ];

    const stream = makeStream(frames);
    const result = await collectFromStream(
      stream,
      'https://example.com',
      'Test Page',
      Date.now(),
      [],
      [],
      5,
    );

    expect(result.total).toBe(1);
    expect(result.images.length).toBe(1);
    expect(result.images[0].url).toBe('https://example.com/img.jpg');
  });

  it('collects stream with errors', async () => {
    const errors: ScrapeError[] = [
      { phase: 'parser1', type: 'parse', message: 'fail', recoverable: true },
    ];

    const frames: StreamYield[] = [
      {
        phase: 1,
        items: [],
        cumulative: [],
        progress: 1,
        errors,
        partial: true,
        stats: { durationMs: 5, domNodeCount: 0, deduplicatedCount: 0, filteredCount: 0 },
      },
    ];

    const stream = makeStream(frames);
    const result = await collectFromStream(
      stream,
      'https://example.com',
      'Test',
      Date.now(),
      [],
      [],
      0,
    );

    expect(result.errors).toEqual(errors);
    expect(result.partial).toBe(true);
  });

  it('collects stream with warnings', async () => {
    const warnings = ['warning 1', 'warning 2'];
    const frames: StreamYield[] = [
      {
        phase: 1,
        items: [],
        cumulative: [],
        progress: 1,
        errors: [],
        partial: false,
        stats: { durationMs: 5, domNodeCount: 0, deduplicatedCount: 0, filteredCount: 0 },
      },
    ];

    const stream = makeStream(frames);
    const result = await collectFromStream(
      stream,
      'https://example.com',
      'Test',
      Date.now(),
      [],
      warnings,
      0,
    );

    expect(result.warnings).toEqual(warnings);
  });

  it('collects multiple frames with cumulative', async () => {
    const r1 = {
      id: 'r1',
      url: 'https://example.com/a.jpg',
      type: 'image' as const,
      filename: 'a.jpg',
      extension: '.jpg',
      size: 100,
      width: 100,
      height: 100,
      thumbnail: '',
      source: 'img' as const,
    };
    const r2 = {
      id: 'r2',
      url: 'https://example.com/b.mp4',
      type: 'video' as const,
      filename: 'b.mp4',
      extension: '.mp4',
      size: 1000,
      width: 200,
      height: 200,
      thumbnail: '',
      source: 'video' as const,
    };

    const frames: StreamYield[] = [
      {
        phase: 1,
        items: [r1],
        cumulative: [r1],
        progress: 0.5,
        errors: [],
        partial: false,
        stats: { durationMs: 5, domNodeCount: 2, deduplicatedCount: 0, filteredCount: 0 },
      },
      {
        phase: 2,
        items: [r2],
        cumulative: [r1, r2],
        progress: 1,
        errors: [],
        partial: false,
        stats: { durationMs: 10, domNodeCount: 2, deduplicatedCount: 0, filteredCount: 0 },
      },
    ];

    const stream = makeStream(frames);
    const result = await collectFromStream(
      stream,
      'https://example.com',
      'Test',
      Date.now(),
      [],
      [],
      2,
    );

    expect(result.total).toBe(2);
    expect(result.images.length).toBe(1);
    expect(result.videos.length).toBe(1);
  });

  it('collects stream with pre-existing errors merged', async () => {
    const preErrors: ScrapeError[] = [
      { phase: 'background', type: 'parse', message: 'bg fail', recoverable: true },
    ];
    const streamErrors: ScrapeError[] = [
      { phase: 'parser1', type: 'parse', message: 'parser fail', recoverable: true },
    ];

    const frames: StreamYield[] = [
      {
        phase: 1,
        items: [],
        cumulative: [],
        progress: 1,
        errors: streamErrors,
        partial: true,
        stats: { durationMs: 5, domNodeCount: 0, deduplicatedCount: 0, filteredCount: 0 },
      },
    ];

    const stream = makeStream(frames);
    const result = await collectFromStream(
      stream,
      'https://example.com',
      'Test',
      Date.now(),
      preErrors,
      [],
      0,
    );

    // Stream errors override pre-existing ones at the final frame
    expect(result.errors).toEqual(streamErrors);
    expect(result.partial).toBe(true);
  });

  it('populates timestamp as ISO string', async () => {
    const frames: StreamYield[] = [
      {
        phase: 1,
        items: [],
        cumulative: [],
        progress: 1,
        errors: [],
        partial: false,
        stats: { durationMs: 5, domNodeCount: 0, deduplicatedCount: 0, filteredCount: 0 },
      },
    ];

    const stream = makeStream(frames);
    const result = await collectFromStream(
      stream,
      'https://example.com',
      'Test',
      Date.now(),
      [],
      [],
      0,
    );

    expect(() => new Date(result.timestamp)).not.toThrow();
  });

  it('handles mixed type resources', async () => {
    const r1 = {
      id: 'r1',
      url: 'https://example.com/img.jpg',
      type: 'image' as const,
      filename: 'img.jpg',
      extension: '.jpg',
      size: 100,
      width: 100,
      height: 100,
      thumbnail: '',
      source: 'img' as const,
    };
    const r2 = {
      id: 'r2',
      url: 'https://example.com/doc.pdf',
      type: 'document' as const,
      filename: 'doc.pdf',
      extension: '.pdf',
      size: 500,
      width: 0,
      height: 0,
      thumbnail: '',
      source: 'link' as const,
    };
    const r3 = {
      id: 'r3',
      url: 'https://example.com/unknown.bin',
      type: 'unknown' as const,
      filename: 'unknown.bin',
      extension: '.bin',
      size: 0,
      width: 0,
      height: 0,
      thumbnail: '',
      source: 'img' as const,
    };

    const frames: StreamYield[] = [
      {
        phase: 1,
        items: [r1, r2, r3],
        cumulative: [r1, r2, r3],
        progress: 1,
        errors: [],
        partial: false,
        stats: { durationMs: 5, domNodeCount: 3, deduplicatedCount: 0, filteredCount: 0 },
      },
    ];

    const stream = makeStream(frames);
    const result = await collectFromStream(
      stream,
      'https://example.com',
      'Test',
      Date.now(),
      [],
      [],
      3,
    );

    expect(result.images.length).toBe(2); // image + unknown
    expect(result.documents.length).toBe(1);
    expect(result.videos.length).toBe(0);
    expect(result.audio.length).toBe(0);
  });
});
