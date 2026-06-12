/**
 * Media Scraper — Type-Safe Message Passing
 *
 * Discriminated unions for all postMessage messages exchanged between:
 * - Popup ↔ Background Service Worker
 * - Content Script ↔ Background Service Worker
 * - Panel ↔ Background Service Worker
 */

// ── Base Types ─────────────────────────────────────────────────────

export interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video' | 'audio' | 'document';
  width?: number;
  height?: number;
  size?: number; // file size in bytes
  alt?: string;
  title?: string;
  thumbnail?: string; // data URL from thumbnail cache
  sourceUrl?: string; // original page URL
  filename?: string;
  isStreaming?: boolean; // true if m3u8/mpd — can't download via chrome.downloads
}

export interface ScrapeResult {
  url: string;
  results: MediaItem[];
  timestamp: number;
  duration?: number;
  errors?: string[];
}

// ── Generic Response ───────────────────────────────────────────────

export interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ── Discriminated Union: Messages to Background SW ─────────────────

export interface ScrapeResultsMessage {
  type: 'SCRAPE_RESULTS';
  data: ScrapeResult;
}

export interface GetResultsMessage {
  type: 'GET_RESULTS';
}

export interface FetchThumbnailMessage {
  type: 'FETCH_THUMBNAIL';
  url: string;
}

export interface DownloadMessage {
  type: 'DOWNLOAD';
  urls: string[];
  filenames?: string[];
}

export interface CancelDownloadsMessage {
  type: 'CANCEL_DOWNLOADS';
}

export interface ClearResultsMessage {
  type: 'CLEAR_RESULTS';
}

export type BackgroundMessage =
  | ScrapeResultsMessage
  | GetResultsMessage
  | FetchThumbnailMessage
  | DownloadMessage
  | CancelDownloadsMessage
  | ClearResultsMessage;

// ── Discriminated Union: Messages to Content Script ────────────────

export interface StartScrapeMessage {
  type: 'START_SCRAPE';
  options?: {
    maxScrolls?: number;
    maxTime?: number;
    includeBackgrounds?: boolean;
    minSizePx?: number;
  };
}

export interface StopScrapeMessage {
  type: 'STOP_SCRAPE';
}

export interface PingMessage {
  type: 'PING';
}

export type ContentMessage = StartScrapeMessage | StopScrapeMessage | PingMessage;

export type ContentResponse = MessageResponse;

// ── Discriminated Union: Messages from Popup to Background SW ──────

export interface PopupGrabCurrentMessage {
  type: 'GRAB_CURRENT_PAGE';
}

export interface PopupBatchScrapeMessage {
  type: 'BATCH_SCRAPE';
  urls: string[];
}

export interface PopupStopMessage {
  type: 'STOP_SCRAPE';
}

export interface PopupOpenPanelMessage {
  type: 'OPEN_PANEL';
}

export type PopupMessage =
  | PopupGrabCurrentMessage
  | PopupBatchScrapeMessage
  | PopupStopMessage
  | PopupOpenPanelMessage;

// ── Discriminated Union: Messages from Panel to Background SW ──────

export interface PanelGetResultsMessage {
  type: 'GET_RESULTS';
}

export interface PanelDownloadMessage {
  type: 'DOWNLOAD_SELECTED';
  ids: string[];
}

export interface PanelExportMessage {
  type: 'EXPORT';
  format: 'json' | 'csv';
  ids?: string[]; // undefined = all
}

export type PanelMessage =
  | PanelGetResultsMessage
  | PanelDownloadMessage
  | PanelExportMessage;
