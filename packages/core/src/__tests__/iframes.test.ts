// ---------------------------------------------------------------------------
// @media-scraper/core — iframes.test.ts
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type { DocumentLike, ElementLike, MediaResource } from '../types.js';
import { extractIframeMedia } from '../extractors/iframes.js';

// ---------------------------------------------------------------------------
// Mock DOM (abbreviated — same pattern)
// ---------------------------------------------------------------------------

interface MockNode {
  tagName: string;
  attrs: Record<string, string>;
  children: MockNode[];
  text: string;
}

function flattenTree(root: MockNode): MockNode[] {
  const result: MockNode[] = [root];
  for (const child of root.children) result.push(...flattenTree(child));
  return result;
}

function matchSelector(node: MockNode, selector: string): boolean {
  const tagMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  const rest = tagMatch ? selector.slice(tagMatch[0].length) : selector;
  const tag = tagMatch ? tagMatch[0].toLowerCase() : '';
  if (tag && node.tagName.toLowerCase() !== tag) return false;
  const attrRegex = /\[([a-zA-Z][a-zA-Z0-9_-]*)(?:=["']([^"']*)["'])?\]/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(rest)) !== null) {
    const attrName = m[1];
    const attrValue = m[2];
    const nodeValue = node.attrs[attrName];
    if (attrValue !== undefined) {
      if (nodeValue !== attrValue) return false;
    } else {
      if (nodeValue === undefined || nodeValue === null) return false;
    }
  }
  return true;
}

function queryAll(root: MockNode, selector: string): MockNode[] {
  if (selector === '*') return flattenTree(root).slice(1);
  return flattenTree(root).filter((n) => matchSelector(n, selector));
}

function makeElementLike(node: MockNode): ElementLike {
  return {
    tagName: node.tagName,
    getAttribute(name: string): string | null { return node.attrs[name] ?? null; },
    querySelectorAll(selector: string): ElementLike[] {
      return queryAll(node, selector).map(makeElementLike);
    },
    querySelector(selector: string): ElementLike | null {
      const r = queryAll(node, selector);
      return r.length > 0 ? makeElementLike(r[0]) : null;
    },
    textContent: node.text || null,
  };
}

function makeDoc(bodyChildren: MockNode[] = []): DocumentLike {
  const bodyNode: MockNode = { tagName: 'body', attrs: {}, children: bodyChildren, text: '' };
  return {
    querySelectorAll(selector: string): ElementLike[] {
      return queryAll(bodyNode, selector).map(makeElementLike);
    },
    querySelector(selector: string): ElementLike | null {
      const r = queryAll(bodyNode, selector);
      return r.length > 0 ? makeElementLike(r[0]) : null;
    },
    title: 'Test',
    head: null,
    body: makeElementLike(bodyNode),
  };
}

function n(tag: string, attrs: Record<string, string> = {}, children: MockNode[] = [], text = ''): MockNode {
  return { tagName: tag, attrs, children, text };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractIframeMedia', () => {
  const baseUrl = 'https://example.com/';

  // --- YouTube ---
  it('detects YouTube embed', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.youtube.com/embed/dQw4w9WgXcQ' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('video');
    expect(results[0].source).toBe('iframe');
    expect(results[0].thumbnail).toContain('img.youtube.com');
  });

  it('detects YouTube watch URL', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].thumbnail).toContain('img.youtube.com');
  });

  it('detects youtu.be short link', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://youtu.be/dQw4w9WgXcQ' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].thumbnail).toContain('img.youtube.com');
  });

  // --- Vimeo ---
  it('detects Vimeo player embed', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://player.vimeo.com/video/123456789' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].thumbnail).toContain('vumbnail.com');
  });

  it('detects Vimeo.com URL', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://vimeo.com/123456789' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
  });

  // --- Dailymotion ---
  it('detects Dailymotion embed', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.dailymotion.com/embed/video/x7lni3' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('video');
  });

  // --- Bilibili ---
  it('detects Bilibili player', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('video');
  });

  // --- Douyin ---
  it('detects Douyin video', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.douyin.com/video/1234567890123456789' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBeTruthy();
  });

  // --- TikTok ---
  it('detects TikTok embed', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.tiktok.com/embed/1234567890123456789' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('video');
  });

  // --- Chinese platforms ---
  it('detects Tencent Video (v.qq.com)', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://v.qq.com/txp/iframe/player.html?vid=a12345' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('video');
  });

  it('detects iQiyi', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.iqiyi.com/v_19rr7q8xzc.html' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('video');
  });

  it('detects Youku', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://player.youku.com/embed/XNDU3Njc4NTYwMA==' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
  });

  it('detects Kuaishou', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.kuaishou.com/short-video/3xabc123' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
  });

  it('detects Weibo video', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://weibo.com/tv/show/1234:5678' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
  });

  it('detects Xiaohongshu', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.xiaohongshu.com/discovery/item/abc123' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
  });

  it('detects Zhihu video', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.zhihu.com/video/1234567890' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
  });

  // --- Unrecognized iframe → classified by extension ---
  it('classifies unrecognized iframe as unknown', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://unknown-site.com/embed/123' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('iframe');
  });

  it('classifies unrecognized iframe with mp4 extension', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://example.com/video.mp4' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('video');
  });

  // --- Edge cases ---
  it('returns empty for no iframes', () => {
    const doc = makeDoc([
      n('div', {}, [], 'Hello'),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toEqual([]);
  });

  it('skips iframe with no src', () => {
    const doc = makeDoc([
      n('iframe', {}),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toEqual([]);
  });

  it('deduplicates same iframe', () => {
    const doc = makeDoc([
      n('iframe', { src: 'https://www.youtube.com/embed/dQw4w9WgXcQ' }),
      n('iframe', { src: 'https://www.youtube.com/embed/dQw4w9WgXcQ' }),
    ]);
    const results = extractIframeMedia(doc, baseUrl);
    expect(results).toHaveLength(1);
  });
});
