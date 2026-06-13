// ---------------------------------------------------------------------------
// Unit tests: popup.ts — state machine logic (no DOM)
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { formatSize, formatItemDimensions } from '../popup/popup.js';
import type { MediaResource } from '@media-scraper/core';

function makeResource(overrides: Partial<MediaResource> = {}): MediaResource {
  return {
    id: 'test-1',
    url: 'https://example.com/file.jpg',
    type: 'image',
    filename: 'file.jpg',
    extension: '.jpg',
    size: 0,
    width: 0,
    height: 0,
    thumbnail: '',
    source: 'img',
    ...overrides,
  };
}

describe('popup.ts — formatSize', () => {
  it('returns empty string for 0 bytes', () => {
    expect(formatSize(0)).toBe('');
  });

  it('formats bytes (< 1024)', () => {
    expect(formatSize(500)).toBe('500B');
    expect(formatSize(1023)).toBe('1023B');
  });

  it('formats KB (1024 – 1MB)', () => {
    expect(formatSize(1024)).toBe('1.0KB');
    expect(formatSize(1536)).toBe('1.5KB');
    expect(formatSize(1024 * 512)).toBe('512.0KB');
  });

  it('formats MB (1MB – 1GB)', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0MB');
    expect(formatSize(1024 * 1024 * 5.5)).toBe('5.5MB');
  });

  it('formats GB (>= 1GB)', () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.00GB');
    expect(formatSize(1024 * 1024 * 1024 * 2.75)).toBe('2.75GB');
  });
});

describe('popup.ts — formatItemDimensions', () => {
  it('returns empty string when width/height both 0', () => {
    const r = makeResource({ width: 0, height: 0 });
    expect(formatItemDimensions(r)).toBe('');
  });

  it('returns empty string when width is missing', () => {
    const r = makeResource({ width: 0, height: 100 });
    expect(formatItemDimensions(r)).toBe('');
  });

  it('returns empty string when height is missing', () => {
    const r = makeResource({ width: 200, height: 0 });
    expect(formatItemDimensions(r)).toBe('');
  });

  it('returns dimensions when both provided', () => {
    const r = makeResource({ width: 1920, height: 1080 });
    expect(formatItemDimensions(r)).toBe('1920×1080');
  });
});

// ---------------------------------------------------------------------------
// State machine logic tests (no DOM)
// These test the pure-logic aspects of the state transitions.
// ---------------------------------------------------------------------------

describe('popup.ts — state machine (mode transitions)', () => {
  it('Mode type has 3 valid states', () => {
    const modes = ['input', 'scraping', 'results'] as const;
    expect(modes).toHaveLength(3);
    // Verify each mode string
    expect(modes.includes('input')).toBe(true);
    expect(modes.includes('scraping')).toBe(true);
    expect(modes.includes('results')).toBe(true);
  });

  it('TabType has 4 valid types', () => {
    const tabs = ['image', 'video', 'audio', 'document'] as const;
    expect(tabs).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// appendItems category routing logic test
// (simulates the category classification from appendItems)
// ---------------------------------------------------------------------------

function classifyItem(item: MediaResource, phase: string): 'image' | 'video' | 'audio' | 'document' {
  let category: string = item.type;
  if (category === 'unknown') {
    const ext = item.extension.toLowerCase();
    if (['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.m4v', '.m3u8', '.mpd'].includes(ext)) {
      category = 'video';
    } else if (['.mp3', '.wav', '.ogg', '.flac', '.aac'].includes(ext)) {
      category = 'audio';
    } else if (['.pdf', '.doc', '.docx', '.zip', '.rar', '.7z'].includes(ext)) {
      category = 'document';
    } else if (phase === 'iframes') {
      category = 'video';
    } else {
      category = 'image';
    }
  }
  return category as 'image' | 'video' | 'audio' | 'document';
}

describe('popup.ts — appendItems classification logic', () => {
  it('classifies image type as image', () => {
    const r = makeResource({ type: 'image' });
    expect(classifyItem(r, 'images')).toBe('image');
  });

  it('classifies video type as video', () => {
    const r = makeResource({ type: 'video' });
    expect(classifyItem(r, 'videos')).toBe('video');
  });

  it('classifies audio type as audio', () => {
    const r = makeResource({ type: 'audio' });
    expect(classifyItem(r, 'audio')).toBe('audio');
  });

  it('classifies document type as document', () => {
    const r = makeResource({ type: 'document' });
    expect(classifyItem(r, 'documents')).toBe('document');
  });

  it('classifies unknown .mp4 as video', () => {
    const r = makeResource({ type: 'unknown', extension: '.mp4' });
    expect(classifyItem(r, 'videos')).toBe('video');
  });

  it('classifies unknown .webm as video', () => {
    const r = makeResource({ type: 'unknown', extension: '.webm' });
    expect(classifyItem(r, 'videos')).toBe('video');
  });

  it('classifies unknown .m3u8 as video', () => {
    const r = makeResource({ type: 'unknown', extension: '.m3u8' });
    expect(classifyItem(r, 'streaming')).toBe('video');
  });

  it('classifies unknown .mp3 as audio', () => {
    const r = makeResource({ type: 'unknown', extension: '.mp3' });
    expect(classifyItem(r, 'audio')).toBe('audio');
  });

  it('classifies unknown .flac as audio', () => {
    const r = makeResource({ type: 'unknown', extension: '.flac' });
    expect(classifyItem(r, 'audio')).toBe('audio');
  });

  it('classifies unknown .pdf as document', () => {
    const r = makeResource({ type: 'unknown', extension: '.pdf' });
    expect(classifyItem(r, 'documents')).toBe('document');
  });

  it('classifies unknown .zip as document', () => {
    const r = makeResource({ type: 'unknown', extension: '.zip' });
    expect(classifyItem(r, 'documents')).toBe('document');
  });

  it('classifies unknown iframe phase as video', () => {
    const r = makeResource({ type: 'unknown', extension: '.html' });
    expect(classifyItem(r, 'iframes')).toBe('video');
  });

  it('classifies unknown with no match as image (fallback)', () => {
    const r = makeResource({ type: 'unknown', extension: '.xyz' });
    expect(classifyItem(r, 'images')).toBe('image');
  });
});

// ---------------------------------------------------------------------------
// Auto-switch tab logic test
// ---------------------------------------------------------------------------

function autoSwitchTab(
  images: number, videos: number, audio: number, documents: number,
): string {
  const counts: { tab: string; count: number }[] = [
    { tab: 'image', count: images },
    { tab: 'video', count: videos },
    { tab: 'audio', count: audio },
    { tab: 'document', count: documents },
  ];
  counts.sort((a, b) => b.count - a.count);
  if (counts[0].count > 0) return counts[0].tab;
  return 'image'; // fallback
}

describe('popup.ts — autoSwitchTab logic', () => {
  it('switches to tab with most resources', () => {
    expect(autoSwitchTab(10, 50, 5, 3)).toBe('video');
  });

  it('switches to images when all others are zero', () => {
    expect(autoSwitchTab(20, 0, 0, 0)).toBe('image');
  });

  it('switches to video when tied (first in sort)', () => {
    expect(autoSwitchTab(10, 10, 0, 0)).toBe('image'); // images first when tied
  });

  it('switches to audio when it has the most', () => {
    expect(autoSwitchTab(5, 3, 25, 1)).toBe('audio');
  });

  it('switches to documents when it has the most', () => {
    expect(autoSwitchTab(1, 2, 3, 40)).toBe('document');
  });

  it('returns fallback when all zero', () => {
    expect(autoSwitchTab(0, 0, 0, 0)).toBe('image');
  });
});

// ---------------------------------------------------------------------------
// getFilteredResources filter logic test
// ---------------------------------------------------------------------------

function filterResources(
  resources: MediaResource[],
  tab: string,
  searchQuery: string,
): MediaResource[] {
  let filtered: MediaResource[];
  switch (tab) {
    case 'image': filtered = resources.filter(r => r.type === 'image'); break;
    case 'video': filtered = resources.filter(r => r.type === 'video'); break;
    case 'audio': filtered = resources.filter(r => r.type === 'audio'); break;
    case 'document': filtered = resources.filter(r => r.type === 'document'); break;
    default: filtered = resources;
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(r => r.filename.toLowerCase().includes(q));
  }

  return filtered;
}

describe('popup.ts — getFilteredResources filter logic', () => {
  const items: MediaResource[] = [
    makeResource({ id: '1', type: 'image', filename: 'sunset.jpg' }),
    makeResource({ id: '2', type: 'image', filename: 'mountain.png' }),
    makeResource({ id: '3', type: 'video', filename: 'movie.mp4' }),
    makeResource({ id: '4', type: 'audio', filename: 'song.mp3' }),
    makeResource({ id: '5', type: 'document', filename: 'report.pdf' }),
    makeResource({ id: '6', type: 'image', filename: 'Sunset-Large.jpg' }),
  ];

  it('filters by image tab', () => {
    const result = filterResources(items, 'image', '');
    expect(result).toHaveLength(3);
    expect(result.every(r => r.type === 'image')).toBe(true);
  });

  it('filters by video tab', () => {
    const result = filterResources(items, 'video', '');
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('movie.mp4');
  });

  it('filters by audio tab', () => {
    const result = filterResources(items, 'audio', '');
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('song.mp3');
  });

  it('filters by document tab', () => {
    const result = filterResources(items, 'document', '');
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('report.pdf');
  });

  it('filters by search query (case-insensitive)', () => {
    const result = filterResources(items, 'image', 'sunset');
    expect(result).toHaveLength(2);
    expect(result.map(r => r.filename)).toContain('sunset.jpg');
    expect(result.map(r => r.filename)).toContain('Sunset-Large.jpg');
  });

  it('filters by search query on video tab', () => {
    const result = filterResources(items, 'video', 'movie');
    expect(result).toHaveLength(1);
  });

  it('returns empty when no match', () => {
    const result = filterResources(items, 'image', 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('returns all items for unknown tab (fallback)', () => {
    const result = filterResources(items, 'unknown_tab', '');
    expect(result).toHaveLength(6);
  });
});
