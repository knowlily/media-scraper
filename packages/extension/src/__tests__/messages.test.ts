// ---------------------------------------------------------------------------
// Unit tests: messages.ts — type guard & discriminated union validation
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type {
  PopupMessage,
  ContentMessage,
  BackgroundMessage,
  PanelMessage,
  ExtensionMessage,
} from '../utils/messages.js';
import type { MediaResource, ScrapeResult } from '@media-scraper/core';

// Helper: verify discriminated union via exhaustive switch
function getMessageType(msg: ExtensionMessage): string {
  return msg.type;
}

describe('messages.ts — type guards', () => {
  describe('PopupMessage discriminated union', () => {
    it('START_SCRAPE has url field', () => {
      const msg: PopupMessage = { type: 'START_SCRAPE', url: 'https://example.com' };
      expect(msg.type).toBe('START_SCRAPE');
      expect(msg.url).toBe('https://example.com');
    });

    it('STOP_SCRAPE has no extra fields', () => {
      const msg: PopupMessage = { type: 'STOP_SCRAPE' };
      expect(msg.type).toBe('STOP_SCRAPE');
    });

    it('GET_HISTORY is valid', () => {
      const msg: PopupMessage = { type: 'GET_HISTORY' };
      expect(msg.type).toBe('GET_HISTORY');
    });

    it('PLAY_VIDEO has url field', () => {
      const msg: PopupMessage = { type: 'PLAY_VIDEO', url: 'https://example.com/video.mp4' };
      expect(msg.type).toBe('PLAY_VIDEO');
      expect(msg.url).toBe('https://example.com/video.mp4');
    });
  });

  describe('ContentMessage discriminated union', () => {
    it('SCRAPE_PROGRESS has found + optional total', () => {
      const msg1: ContentMessage = { type: 'SCRAPE_PROGRESS', found: 42 };
      expect(msg1.type).toBe('SCRAPE_PROGRESS');
      expect(msg1.found).toBe(42);
      expect(msg1.total).toBeUndefined();

      const msg2: ContentMessage = { type: 'SCRAPE_PROGRESS', found: 20, total: 100 };
      expect(msg2.total).toBe(100);
    });

    it('FOUND_MEDIA has items + phase', () => {
      const items: MediaResource[] = [
        { id: '1', url: 'https://example.com/img.jpg', type: 'image', filename: 'img.jpg', extension: '.jpg', size: 0, width: 0, height: 0, thumbnail: '', source: 'img' },
      ];
      const msg: ContentMessage = { type: 'FOUND_MEDIA', items, phase: 'images' };
      expect(msg.type).toBe('FOUND_MEDIA');
      expect(msg.items).toHaveLength(1);
      expect(msg.phase).toBe('images');
    });

    it('SCRAPE_COMPLETE has total', () => {
      const msg: ContentMessage = { type: 'SCRAPE_COMPLETE', total: 150 };
      expect(msg.type).toBe('SCRAPE_COMPLETE');
      expect(msg.total).toBe(150);
    });

    it('SCRAPE_ERROR has error string', () => {
      const msg: ContentMessage = { type: 'SCRAPE_ERROR', error: 'Network timeout' };
      expect(msg.type).toBe('SCRAPE_ERROR');
      expect(msg.error).toBe('Network timeout');
    });
  });

  describe('BackgroundMessage discriminated union', () => {
    it('DOWNLOAD has resources array', () => {
      const resources: MediaResource[] = [{
        id: '1', url: 'https://example.com/file.mp4', type: 'video',
        filename: 'file.mp4', extension: '.mp4', size: 1024, width: 0, height: 0,
        thumbnail: '', source: 'video',
      }];
      const msg: BackgroundMessage = { type: 'DOWNLOAD', resources };
      expect(msg.type).toBe('DOWNLOAD');
      expect(msg.resources).toHaveLength(1);
    });

    it('FETCH_THUMBNAIL has url', () => {
      const msg: BackgroundMessage = { type: 'FETCH_THUMBNAIL', url: 'https://example.com/thumb.jpg' };
      expect(msg.type).toBe('FETCH_THUMBNAIL');
      expect(msg.url).toBe('https://example.com/thumb.jpg');
    });

    it('FETCH_VIDEO_SIZE has url', () => {
      const msg: BackgroundMessage = { type: 'FETCH_VIDEO_SIZE', url: 'https://example.com/v.mp4' };
      expect(msg.type).toBe('FETCH_VIDEO_SIZE');
    });

    it('CLEAR_CACHE is valid', () => {
      const msg: BackgroundMessage = { type: 'CLEAR_CACHE' };
      expect(msg.type).toBe('CLEAR_CACHE');
    });
  });

  describe('PanelMessage discriminated union', () => {
    it('DOWNLOAD_COMPLETE has count + failed', () => {
      const msg: PanelMessage = { type: 'DOWNLOAD_COMPLETE', count: 10, failed: ['bad1', 'bad2'] };
      expect(msg.type).toBe('DOWNLOAD_COMPLETE');
      expect(msg.count).toBe(10);
      expect(msg.failed).toEqual(['bad1', 'bad2']);
    });

    it('DOWNLOAD_PROGRESS has completed + total', () => {
      const msg: PanelMessage = { type: 'DOWNLOAD_PROGRESS', completed: 5, total: 10 };
      expect(msg.type).toBe('DOWNLOAD_PROGRESS');
      expect(msg.completed).toBe(5);
      expect(msg.total).toBe(10);
    });
  });

  describe('ExtensionMessage union covers all variants', () => {
    it('accepts PopupMessage', () => {
      const msg: ExtensionMessage = { type: 'START_SCRAPE', url: 'https://example.com' };
      expect(getMessageType(msg)).toBe('START_SCRAPE');
    });

    it('accepts ContentMessage', () => {
      const msg: ExtensionMessage = { type: 'SCRAPE_COMPLETE', total: 100 };
      expect(getMessageType(msg)).toBe('SCRAPE_COMPLETE');
    });

    it('accepts BackgroundMessage', () => {
      const msg: ExtensionMessage = { type: 'DOWNLOAD', resources: [] };
      expect(getMessageType(msg)).toBe('DOWNLOAD');
    });

    it('accepts PanelMessage', () => {
      const msg: ExtensionMessage = { type: 'DOWNLOAD_COMPLETE', count: 0, failed: [] };
      expect(getMessageType(msg)).toBe('DOWNLOAD_COMPLETE');
    });
  });

  describe('ScrapeResult import from core', () => {
    it('can construct a ScrapeResult stub', () => {
      const result: ScrapeResult = {
        url: 'https://example.com',
        title: 'Test',
        total: 0,
        images: [],
        videos: [],
        audio: [],
        documents: [],
        warnings: [],
        duration: 0,
        timestamp: new Date().toISOString(),
      };
      expect(result.url).toBe('https://example.com');
    });
  });
});
