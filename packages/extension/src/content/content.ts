// ---------------------------------------------------------------------------
// Media Scraper Extension — Content Script (Scrape-only, no UI injection)
// ---------------------------------------------------------------------------
// Injected into web pages at document_idle.
// Builds a DocumentLike adapter from the real DOM and calls individual
// extractors in phases, streaming results to the popup via messages.
// ---------------------------------------------------------------------------

import {
  scrapeStream,
} from '@media-scraper/core';
import type {
  DocumentLike,
  ElementLike,
  MediaResource,
} from '@media-scraper/core';
import type { ContentMessage, PopupMessage } from '../utils/messages.js';

// ---- DOM Adapter ----
// Wraps the real browser DOM to match the core's DocumentLike/ElementLike interfaces.

export function wrapElement(el: Element): ElementLike {
  return {
    tagName: el.tagName,
    getAttribute(name: string): string | null {
      return el.getAttribute(name);
    },
    querySelectorAll(selector: string): ElementLike[] {
      const nodes = el.querySelectorAll(selector);
      const result: ElementLike[] = [];
      for (let i = 0; i < nodes.length; i++) {
        result.push(wrapElement(nodes[i]));
      }
      return result;
    },
    querySelector(selector: string): ElementLike | null {
      const node = el.querySelector(selector);
      return node ? wrapElement(node) : null;
    },
    textContent: el.textContent,
  };
}

export function createDocumentAdapter(): DocumentLike {
  return {
    querySelectorAll(selector: string): ElementLike[] {
      const nodes = document.querySelectorAll(selector);
      const result: ElementLike[] = [];
      for (let i = 0; i < nodes.length; i++) {
        result.push(wrapElement(nodes[i]));
      }
      return result;
    },
    querySelector(selector: string): ElementLike | null {
      const node = document.querySelector(selector);
      return node ? wrapElement(node) : null;
    },
    title: document.title,
    head: wrapElement(document.head!),
    body: wrapElement(document.body!),
  };
}

// ---- State ----

let isScraping = false;
let abortController: AbortController | null = null;

// ---- Utility Helpers ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Progress Messaging (to popup) ----

async function triggerLazyLoad(): Promise<void> {
  const scrollStep = window.innerHeight * 0.8;
  const maxScrolls = 20;
  let scrolls = 0;

  const originalY = window.scrollY;

  while (scrolls < maxScrolls && !abortController?.signal.aborted) {
    window.scrollBy(0, scrollStep);
    await sleep(400);
    scrolls++;

    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight) {
      break;
    }
  }

  window.scrollTo(0, originalY);
}

async function waitForNetworkIdle(timeoutMs = 3000): Promise<void> {
  const checkInterval = 300;
  const start = Date.now();
  let lastPendingCount = performance.getEntriesByType('resource').length;

  while (Date.now() - start < timeoutMs) {
    if (abortController?.signal.aborted) return;
    await sleep(checkInterval);
    const currentPending = performance.getEntriesByType('resource').length;
    if (currentPending === lastPendingCount) {
      return;
    }
    lastPendingCount = currentPending;
  }
}

// ---- MutationObserver for Dynamic Content ----

let mutationObserver: MutationObserver | null = null;

function startObservingDynamicContent(
  onNewContent: () => void,
): void {
  if (mutationObserver) return;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  mutationObserver = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!abortController?.signal.aborted) {
        onNewContent();
      }
    }, 500);
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'data-src', 'data-original', 'style'],
  });
}

function stopObservingDynamicContent(): void {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
}

// ---- Progress Messaging (to popup) ----

function sendProgress(percent: number, total?: number): void {
  const message: ContentMessage = {
    type: 'SCRAPE_PROGRESS',
    found: percent,
    total,
  };
  chrome.runtime.sendMessage(message).catch(() => {});
}

// ---- Phase name mapping (StreamYield.phase → human-readable) ----

const PHASE_NAMES: Record<number, string> = {
  1: 'images',
  2: 'backgrounds',
  3: 'iframes',
  4: 'videos',
  5: 'audio',
  6: 'documents',
  7: 'shadow-dom',
};

// ---- FOUND_MEDIA sender ----

function sendFoundMedia(items: MediaResource[], phase: string): void {
  if (items.length === 0) return;
  console.log(`[media-scraper] Sending FOUND_MEDIA: phase="${phase}" count=${items.length} types=${[...new Set(items.map(i=>i.type))]}`);
  const message: ContentMessage = {
    type: 'FOUND_MEDIA',
    items,
    phase,
  };
  chrome.runtime.sendMessage(message).catch(() => {});
}

// ---- SCRAPE_COMPLETE sender ----

function sendScrapeComplete(total: number): void {
  const message: ContentMessage = {
    type: 'SCRAPE_COMPLETE',
    total,
  };
  chrome.runtime.sendMessage(message).catch(() => {});
}

// ---- SCRAPE_ERROR sender ----

function sendScrapeError(error: string): void {
  const message: ContentMessage = {
    type: 'SCRAPE_ERROR',
    error,
  };
  chrome.runtime.sendMessage(message).catch(() => {});
}

// ===========================================================================
// SCRAPE ORCHESTRATION — streaming phases (no UI injection)
// ===========================================================================

async function runScrape(baseUrl: string): Promise<void> {
  if (isScraping) return;
  isScraping = true;
  abortController = new AbortController();

  let totalFound = 0;

  sendProgress(5);

  try {
    await triggerLazyLoad();
    if (abortController.signal.aborted) { cleanupScrape(totalFound); return; }

    sendProgress(10);
    await waitForNetworkIdle(3000);
    if (abortController.signal.aborted) { cleanupScrape(totalFound); return; }

    // Create document adapter once
    const doc = createDocumentAdapter();

    // ---- Main scrape via scrapeStream ----
    // Each StreamYield maps to one parser phase (images → backgrounds → iframes → …)
    for await (const batch of scrapeStream(doc, baseUrl, {
      signal: abortController.signal,
    })) {
      if (abortController.signal.aborted) { cleanupScrape(totalFound); return; }

      const phaseName = PHASE_NAMES[batch.phase] || `phase-${batch.phase}`;

      if (batch.items.length > 0) {
        sendFoundMedia(batch.items, phaseName);
      }

      totalFound = batch.cumulative.length;
      sendProgress(batch.cumulative.length);
    }

    if (abortController.signal.aborted) { cleanupScrape(totalFound); return; }

    // ---- Dynamic content observation (brief post-stream pass) ----
    const dynamicPromise = new Promise<void>((resolve) => {
      let dynamicScrapes = 0;
      const maxDynamicScrapes = 2;

      startObservingDynamicContent(async () => {
        if (dynamicScrapes >= maxDynamicScrapes || abortController?.signal.aborted) return;

        dynamicScrapes++;

        try {
          // Re-scrape with stream for newly appeared content
          for await (const batch of scrapeStream(doc, baseUrl, {
            signal: abortController!.signal,
          })) {
            if (abortController!.signal.aborted) break;

            const phaseName = PHASE_NAMES[batch.phase] || `phase-${batch.phase}`;
            if (batch.items.length > 0) {
              sendFoundMedia(batch.items, phaseName + '-dynamic');
            }
            totalFound = batch.cumulative.length;
          }
        } catch {
          // Ignore dynamic scrape errors
        }

        if (dynamicScrapes >= maxDynamicScrapes) {
          resolve();
        }
      });

      setTimeout(() => {
        stopObservingDynamicContent();
        resolve();
      }, 3000);
    });

    await dynamicPromise;

    // Complete
    stopObservingDynamicContent();
    sendScrapeComplete(totalFound);
  } catch (err) {
    stopObservingDynamicContent();
    sendScrapeError(err instanceof Error ? err.message : String(err));
    sendScrapeComplete(totalFound);
  } finally {
    isScraping = false;
    abortController = null;
  }
}

function cleanupScrape(totalFound: number): void {
  stopObservingDynamicContent();
  sendScrapeComplete(totalFound);
  isScraping = false;
  abortController = null;
}

// ---- Message Listener ----

chrome.runtime.onMessage.addListener(
  (message: PopupMessage, _sender, sendResponse) => {
    switch (message.type) {
      case 'START_SCRAPE':
        console.log('[media-scraper] Received START_SCRAPE for:', message.url);
        if (!isScraping) {
          runScrape(message.url);
        }
        sendResponse({ status: 'started' });
        break;

      case 'STOP_SCRAPE':
        if (abortController) {
          abortController.abort();
        }
        stopObservingDynamicContent();
        isScraping = false;
        sendResponse({ status: 'stopped' });
        break;
    }
    return true;
  }
);

console.log('[media-scraper] Content script loaded (scrape-only, popup-driven UI)');
