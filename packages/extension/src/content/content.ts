/**
 * Media Scraper — Content Script
 *
 * Injected into every webpage (document_idle).
 * Scans the DOM for media elements using @media-scraper/core extractors.
 * Handles lazy-load triggering and communicates results to the
 * background service worker via postMessage.
 */

import type {
  ContentMessage,
  ContentResponse,
  MediaItem,
} from '../utils/messages.js';

// TODO: Import from @media-scraper/core once extractors are built
// import { extractImages, extractVideos, extractAudio, extractDocuments } from '@media-scraper/core';

// ── Constants ──────────────────────────────────────────────────────
const SCROLL_STEP = 400; // px per scroll step
const SCROLL_PAUSE_MS = 800; // wait between scrolls
const MAX_SCROLLS = 50; // max scroll iterations
const MUTATION_DEBOUNCE_MS = 300;

// ── State ──────────────────────────────────────────────────────────
let isScraping = false;
let abortController: AbortController | null = null;
let mutationObserver: MutationObserver | null = null;

// ── Message Listener ───────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ContentMessage, _sender, sendResponse) => {
    switch (message.type) {
      case 'START_SCRAPE':
        startScrape(message.options ?? {}).then(sendResponse);
        return true; // async response

      case 'STOP_SCRAPE':
        stopScrape();
        sendResponse({ success: true });
        break;

      case 'PING':
        sendResponse({ success: true, data: 'pong' });
        break;
    }
  }
);

// ── Main Scrape Logic ──────────────────────────────────────────────

interface ScrapeOptions {
  maxScrolls?: number;
  maxTime?: number;
  includeBackgrounds?: boolean;
  minSizePx?: number;
}

async function startScrape(options: ScrapeOptions = {}): Promise<ContentResponse> {
  if (isScraping) {
    return { success: false, error: 'Already scraping' };
  }

  isScraping = true;
  abortController = new AbortController();
  const signal = abortController.signal;

  try {
    // Phase 1: Initial DOM scan
    const initialResults = scanDOM();

    // Phase 2: Trigger lazy-loaded content
    // - Scroll incrementally to bottom
    // - Monitor DOM mutations for newly injected media
    // - IntersectionObserver simulation for viewport-based lazy load
    await triggerLazyLoad(signal);

    // Phase 3: Final scan (capture any remaining after scroll)
    const finalResults = scanDOM();

    // Merge and deduplicate
    const allResults = deduplicateMedia([...initialResults, ...finalResults]);

    // Send results to background SW
    // TODO: chunk large result sets to avoid message size limits
    chrome.runtime.sendMessage({
      type: 'SCRAPE_RESULTS',
      data: {
        url: window.location.href,
        results: allResults,
        timestamp: Date.now(),
      },
    });

    return { success: true, data: allResults };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Scrape failed' };
  } finally {
    isScraping = false;
    abortController = null;
  }
}

function stopScrape(): void {
  if (abortController) {
    abortController.abort();
  }
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  isScraping = false;
}

// ── DOM Scanning ───────────────────────────────────────────────────

function scanDOM(): MediaItem[] {
  const items: MediaItem[] = [];

  // TODO: Use @media-scraper/core extractors for each media type
  // const images = extractImages(document);
  // const videos = extractVideos(document);
  // const audio = extractAudio(document);
  // const documents = extractDocuments(document);
  // items.push(...images, ...videos, ...audio, ...documents);

  // Placeholder: scan <img> tags
  document.querySelectorAll('img[src]').forEach((img) => {
    const src = (img as HTMLImageElement).src;
    if (src && !src.startsWith('data:')) {
      items.push({
        id: generateId(src),
        url: src,
        type: 'image',
        width: (img as HTMLImageElement).naturalWidth,
        height: (img as HTMLImageElement).naturalHeight,
        alt: (img as HTMLImageElement).alt,
      });
    }
  });

  // TODO: Scan more sources:
  // - <picture> / <source>
  // - <video src> / <video><source>
  // - <audio src> / <audio><source>
  // - <a href="*.pdf|*.docx|*.zip|...">
  // - data-src / data-lazy-src (lazy load attributes)
  // - <meta og:image> / <meta twitter:image>
  // - JSON-LD structured data
  // - CSS background-image (via CSSOM — document.styleSheets)
  // - <iframe> content (same-origin only)

  return items;
}

// ── Lazy Load Triggering ───────────────────────────────────────────

async function triggerLazyLoad(signal: AbortSignal): Promise<void> {
  // Strategy 1: Incremental scroll to bottom
  // Triggers scroll-based lazy load (IntersectionObserver + scroll listeners)
  let lastHeight = 0;
  let scrollCount = 0;

  while (scrollCount < MAX_SCROLLS) {
    if (signal.aborted) return;

    window.scrollBy(0, SCROLL_STEP);
    await sleep(SCROLL_PAUSE_MS);

    const newHeight = document.documentElement.scrollHeight;
    if (newHeight === lastHeight && window.scrollY + window.innerHeight >= newHeight - SCROLL_STEP) {
      break; // reached bottom, no new content
    }
    lastHeight = newHeight;
    scrollCount++;
  }

  // Scroll back to top
  window.scrollTo(0, 0);

  // TODO: Strategy 2 — IntersectionObserver simulation
  // Force lazy images to think they're in viewport:
  //   document.querySelectorAll('img[data-src], img[loading="lazy"]').forEach(el => el.scrollIntoView());

  // TODO: Strategy 3 — Click "load more" buttons
  //   detect and click buttons with text patterns: /load more|加载更多|查看更多|next page/i

  // TODO: Strategy 4 — MutationObserver (continuous DOM monitoring)
  //   const observer = new MutationObserver(mutations => { ... });
  //   observer.observe(document.body, { childList: true, subtree: true });
}

// ── Helpers ────────────────────────────────────────────────────────

function deduplicateMedia(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function generateId(url: string): string {
  // Simple hash for unique ID generation
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `media_${Math.abs(hash).toString(36)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
