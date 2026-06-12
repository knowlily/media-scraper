/**
 * Media Scraper — Background Service Worker
 *
 * Manifest V3 service worker. Handles:
 * - Message routing between popup, content script, and panel
 * - Cross-origin thumbnail fetching (with Range: bytes=0-524287 limit)
 * - Download orchestration via chrome.downloads API
 * - LRU thumbnail cache (max 50 items)
 * - Scrape session state management
 */

import type {
  BackgroundMessage,
  MessageResponse,
  MediaItem,
  ScrapeResult,
} from '../utils/messages.js';

// ── State ──────────────────────────────────────────────────────────
let currentResults: ScrapeResult | null = null;
let activeScrapeTabId: number | null = null;

// ── LRU Thumbnail Cache ────────────────────────────────────────────
// Max 50 cached thumbnails to limit memory usage
const MAX_CACHE_SIZE = 50;
const thumbnailCache = new Map<string, { blob: Blob; lastAccess: number }>();

function cacheThumbnail(url: string, blob: Blob): void {
  // Evict oldest entry if at capacity
  if (thumbnailCache.size >= MAX_CACHE_SIZE) {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [key, entry] of thumbnailCache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      thumbnailCache.delete(oldestKey);
      // Revoke old blob URL to free memory
      console.log('[bg] cache evicted:', oldestKey);
    }
  }
  thumbnailCache.set(url, { blob, lastAccess: Date.now() });
}

function getCachedThumbnail(url: string): Blob | null {
  const entry = thumbnailCache.get(url);
  if (entry) {
    entry.lastAccess = Date.now(); // bump LRU
    return entry.blob;
  }
  return null;
}

// ── Message Handler ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: BackgroundMessage, sender, sendResponse) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }
);

async function handleMessage(
  msg: BackgroundMessage,
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  switch (msg.type) {
    case 'SCRAPE_RESULTS':
      // Store results from content script
      currentResults = msg.data;
      activeScrapeTabId = sender.tab?.id ?? null;
      console.log('[bg] received', msg.data.results.length, 'media items');
      return { success: true };

    case 'GET_RESULTS':
      return {
        success: true,
        data: currentResults ?? { url: '', results: [], timestamp: 0 },
      };

    case 'FETCH_THUMBNAIL':
      return fetchThumbnail(msg.url);

    case 'DOWNLOAD':
      return startDownloads(msg.urls, msg.filenames);

    case 'CANCEL_DOWNLOADS':
      // TODO: cancel active downloads
      // chrome.downloads doesn't support true cancellation, but we can stop queueing new ones
      return { success: true };

    case 'CLEAR_RESULTS':
      currentResults = null;
      activeScrapeTabId = null;
      return { success: true };

    default:
      return { success: false, error: `Unknown message type: ${(msg as any).type}` };
  }
}

// ── Thumbnail Fetch (Cross-Origin Proxy) ───────────────────────────

async function fetchThumbnail(url: string): Promise<MessageResponse> {
  // Check cache first
  const cached = getCachedThumbnail(url);
  if (cached) {
    // Return blob as data URL
    const dataUrl = await blobToDataUrl(cached);
    return { success: true, data: dataUrl };
  }

  try {
    // Fetch with Range header to limit response to ~512KB
    // This prevents downloading huge images just for thumbnails
    const response = await fetch(url, {
      headers: {
        Range: 'bytes=0-524287', // 512KB limit
      },
      // SW has no CORS restrictions for fetch()
    });

    if (!response.ok && response.status !== 206) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const blob = await response.blob();
    cacheThumbnail(url, blob);
    const dataUrl = await blobToDataUrl(blob);
    return { success: true, data: dataUrl };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Thumbnail fetch failed' };
  }
}

// ── Download Orchestration ─────────────────────────────────────────

async function startDownloads(
  urls: string[],
  filenames?: string[]
): Promise<MessageResponse> {
  const failed: string[] = [];
  let downloaded = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const filename = filenames?.[i];

    try {
      await downloadSingle(url, filename);
      downloaded++;
    } catch (err: any) {
      console.error('[bg] download failed:', url, err);
      failed.push(url);
    }
  }

  return {
    success: failed.length === 0,
    data: { downloaded, failed },
  };
}

function downloadSingle(url: string, filename?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const downloadOptions: chrome.downloads.DownloadOptions = {
      url,
      filename: filename
        ? sanitizeFilename(filename)
        : undefined,
      conflictAction: 'uniquify',
      saveAs: false,
    };

    chrome.downloads.download(downloadOptions, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (downloadId === undefined) {
        reject(new Error('Download failed to start'));
      } else {
        // TODO: track download progress via chrome.downloads.onChanged
        // For now, resolve immediately (fire-and-forget style)
        resolve();
      }
    });
  });
}

// ── Helpers ────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  // Remove path traversal and Windows-illegal characters
  return name
    .replace(/\.\.\//g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\x00-\x1f]/g, '')
    .substring(0, 255);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
