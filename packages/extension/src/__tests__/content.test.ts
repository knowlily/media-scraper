// ---------------------------------------------------------------------------
// Unit tests: content.ts — wrapElement / createDocumentAdapter
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { wrapElement, createDocumentAdapter } from '../content/content.js';
import type { ElementLike, DocumentLike } from '@media-scraper/core';

describe('content.ts — wrapElement', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('wraps a simple element with tagName', () => {
    const div = document.createElement('div');
    const wrapped = wrapElement(div);
    expect(wrapped.tagName).toBe('DIV');
  });

  it('wraps an element with getAttribute', () => {
    const img = document.createElement('img');
    img.setAttribute('src', 'https://example.com/photo.jpg');
    img.setAttribute('alt', 'A photo');

    const wrapped = wrapElement(img);
    expect(wrapped.getAttribute('src')).toBe('https://example.com/photo.jpg');
    expect(wrapped.getAttribute('alt')).toBe('A photo');
    expect(wrapped.getAttribute('nonexistent')).toBeNull();
  });

  it('wraps an element with textContent', () => {
    const p = document.createElement('p');
    p.textContent = 'Hello world';
    const wrapped = wrapElement(p);
    expect(wrapped.textContent).toBe('Hello world');
  });

  it('wraps nested elements with querySelectorAll', () => {
    const parent = document.createElement('div');
    parent.innerHTML = '<span class="item">A</span><span class="item">B</span><span>C</span>';

    const wrapped = wrapElement(parent);
    const items = wrapped.querySelectorAll('.item');
    expect(items).toHaveLength(2);
    expect(items[0].tagName).toBe('SPAN');
    expect(items[0].textContent).toBe('A');
    expect(items[1].tagName).toBe('SPAN');
    expect(items[1].textContent).toBe('B');
  });

  it('wraps nested elements with querySelector', () => {
    const parent = document.createElement('div');
    parent.innerHTML = '<p class="first">First</p><p class="second">Second</p>';

    const wrapped = wrapElement(parent);
    const found = wrapped.querySelector('.second');
    expect(found).not.toBeNull();
    expect(found!.tagName).toBe('P');
    expect(found!.textContent).toBe('Second');
  });

  it('querySelector returns null when no match', () => {
    const parent = document.createElement('div');
    const wrapped = wrapElement(parent);
    const found = wrapped.querySelector('.nonexistent');
    expect(found).toBeNull();
  });

  it('querySelectorAll returns empty array when no match', () => {
    const parent = document.createElement('div');
    const wrapped = wrapElement(parent);
    const items = wrapped.querySelectorAll('.none');
    expect(items).toHaveLength(0);
  });

  it('nested querySelector returns wrapped element with working methods', () => {
    const parent = document.createElement('div');
    parent.innerHTML = '<section><img src="nested.jpg" alt="nested"></section>';

    const wrapped = wrapElement(parent);
    const section = wrapped.querySelector('section');
    expect(section).not.toBeNull();

    const img = section!.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('nested.jpg');
    expect(img!.getAttribute('alt')).toBe('nested');
  });
});

describe('content.ts — createDocumentAdapter', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('creates an adapter with document title', () => {
    document.title = 'Test Page';
    const doc = createDocumentAdapter();
    expect(doc.title).toBe('Test Page');
  });

  it('creates an adapter with head and body', () => {
    const doc = createDocumentAdapter();
    expect(doc.head).not.toBeNull();
    expect(doc.body).not.toBeNull();
  });

  it('querySelectorAll on document adapter finds body elements', () => {
    document.body.innerHTML = `
      <img src="img1.jpg" />
      <img src="img2.jpg" />
      <video src="vid.mp4"></video>
    `;

    const doc = createDocumentAdapter();
    const imgs = doc.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute('src')).toBe('img1.jpg');
    expect(imgs[1].getAttribute('src')).toBe('img2.jpg');

    const videos = doc.querySelectorAll('video');
    expect(videos).toHaveLength(1);
    expect(videos[0].getAttribute('src')).toBe('vid.mp4');
  });

  it('querySelector on document adapter finds a single element', () => {
    document.body.innerHTML = '<div><p class="target">Found</p></div>';
    const doc = createDocumentAdapter();
    const found = doc.querySelector('.target');
    expect(found).not.toBeNull();
    expect(found!.textContent).toBe('Found');
  });

  it('adapts head elements', () => {
    document.head.innerHTML = '<meta name="description" content="test">';
    const doc = createDocumentAdapter();
    const meta = doc.head!.querySelector('meta');
    expect(meta).not.toBeNull();
    expect(meta!.getAttribute('name')).toBe('description');
  });
});
