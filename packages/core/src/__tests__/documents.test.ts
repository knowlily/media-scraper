// ---------------------------------------------------------------------------
// @media-scraper/core — documents.test.ts
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type { DocumentLike, ElementLike, MediaResource } from '../types.js';
import { extractDocuments } from '../extractors/documents.js';

// ---------------------------------------------------------------------------
// Mock DOM
// ---------------------------------------------------------------------------

interface MockNode {
  tagName: string;
  attrs: Record<string, string>;
  children: MockNode[];
  text: string;
}

function flattenTree(root: MockNode): MockNode[] {
  const result: MockNode[] = [root];
  for (const child of root.children) {
    result.push(...flattenTree(child));
  }
  return result;
}

function matchSelector(node: MockNode, selector: string): boolean {
  const tagMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  const rest = tagMatch ? selector.slice(tagMatch[0].length) : selector;
  const tag = tagMatch ? tagMatch[0].toLowerCase() : '';

  if (tag && node.tagName.toLowerCase() !== tag) return false;

  const attrRegex = /\[([a-zA-Z][a-zA-Z0-9_-]*)(?:=["']([^"']*)["'])?\]/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(rest)) !== null) {
    const attrName = match[1];
    const attrValue = match[2];
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
    getAttribute(name: string): string | null {
      return node.attrs[name] ?? null;
    },
    querySelectorAll(selector: string): ElementLike[] {
      return queryAll(node, selector).map(makeElementLike);
    },
    querySelector(selector: string): ElementLike | null {
      const results = queryAll(node, selector);
      return results.length > 0 ? makeElementLike(results[0]) : null;
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
      const results = queryAll(bodyNode, selector);
      return results.length > 0 ? makeElementLike(results[0]) : null;
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

describe('extractDocuments', () => {
  const baseUrl = 'https://example.com/page';

  it('extracts <a href> to .pdf', () => {
    const doc = makeDoc([
      n('a', { href: 'report.pdf' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/report.pdf');
    expect(results[0].type).toBe('document');
    expect(results[0].source).toBe('link');
    expect(results[0].extension).toBe('.pdf');
  });

  it('extracts <a href> to .docx', () => {
    const doc = makeDoc([
      n('a', { href: 'document.docx' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].extension).toBe('.docx');
  });

  it('extracts <a href> to .xlsx', () => {
    const doc = makeDoc([
      n('a', { href: 'spreadsheet.xlsx' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].extension).toBe('.xlsx');
  });

  it('extracts <a href> to .pptx', () => {
    const doc = makeDoc([
      n('a', { href: 'slides.pptx' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(1);
  });

  it('extracts <a href> to .zip', () => {
    const doc = makeDoc([
      n('a', { href: 'archive.zip' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(1);
  });

  it('extracts <a href> to .rar', () => {
    const doc = makeDoc([
      n('a', { href: 'archive.rar' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(1);
  });

  it('extracts <a href> to .epub', () => {
    const doc = makeDoc([
      n('a', { href: 'book.epub' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(1);
  });

  it('extracts multiple document links', () => {
    const doc = makeDoc([
      n('a', { href: 'doc1.pdf' }),
      n('a', { href: 'doc2.docx' }),
      n('a', { href: 'archive.zip' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(3);
  });

  it('skips javascript: pseudo-URLs', () => {
    const doc = makeDoc([
      n('a', { href: 'javascript:download()' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(0);
  });

  it('skips # anchor links', () => {
    const doc = makeDoc([
      n('a', { href: '#section' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(0);
  });

  it('skips non-document files', () => {
    const doc = makeDoc([
      n('a', { href: 'image.jpg' }),
      n('a', { href: 'video.mp4' }),
      n('a', { href: 'page.html' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(0);
  });

  it('resolves relative paths', () => {
    const doc = makeDoc([
      n('a', { href: '/files/report.pdf' }),
      n('a', { href: 'local.docx' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results.some((r) => r.url === 'https://example.com/files/report.pdf')).toBe(true);
    expect(results.some((r) => r.url === 'https://example.com/local.docx')).toBe(true);
  });

  it('deduplicates same URL', () => {
    const doc = makeDoc([
      n('a', { href: 'same.pdf' }),
      n('a', { href: 'same.pdf' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(1);
  });

  it('skips empty href', () => {
    const doc = makeDoc([
      n('a', {}),
      n('a', { href: '' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(0);
  });

  it('returns empty array for document with no links', () => {
    const doc = makeDoc([
      n('p', {}, [], 'Hello'),
      n('div', {}),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toEqual([]);
  });

  it('handles absolute URLs', () => {
    const doc = makeDoc([
      n('a', { href: 'https://cdn.example.com/file.pdf' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://cdn.example.com/file.pdf');
  });

  it('skips URLs without document extension', () => {
    const doc = makeDoc([
      n('a', { href: 'https://example.com/api/download' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    expect(results).toHaveLength(0);
  });

  it('handles .tar.gz (recognizes .gz)', () => {
    const doc = makeDoc([
      n('a', { href: 'archive.tar.gz' }),
    ]);
    const results = extractDocuments(doc, baseUrl);
    // .gz is in DOCUMENT_EXTENSIONS
    expect(results).toHaveLength(1);
    expect(results[0].extension).toBe('.gz');
  });
});
