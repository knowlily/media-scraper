/**
 * Media Scraper — Popup Script
 *
 * Handles popup UI interactions:
 * - URL input for manual scrape target
 * - Grab current page button
 * - Batch scrape from URL list
 * - Stop scraping
 * - Links to history/settings pages
 */

import type { PopupMessage, MessageResponse } from '../utils/messages.js';

// ── State ──────────────────────────────────────────────────────────
let isScraping = false;

// ── DOM refs ───────────────────────────────────────────────────────
const urlInput = document.getElementById('url-input') as HTMLInputElement;
const addUrlBtn = document.getElementById('add-url-btn') as HTMLButtonElement;
const grabCurrentBtn = document.getElementById('grab-current-btn') as HTMLButtonElement;
const batchScrapeBtn = document.getElementById('batch-scrape-btn') as HTMLButtonElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
const historyBtn = document.getElementById('history-btn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;

// ── Event Listeners ────────────────────────────────────────────────

grabCurrentBtn.addEventListener('click', async () => {
  // TODO: Get current tab URL and initiate scrape
  // 1. Query active tab with chrome.tabs.query({ active: true, currentWindow: true })
  // 2. Inject content script if not already injected
  // 3. Open result panel with scraped data
  console.log('[popup] grab current page');
});

batchScrapeBtn.addEventListener('click', async () => {
  // TODO: Read URLs from input (one per line), dispatch batch scrape
  // 1. Parse URLs from urlInput.value
  // 2. For each URL: open tab, wait for page load, inject content script, collect results
  // 3. Aggregate and open result panel
  console.log('[popup] batch scrape');
});

stopBtn.addEventListener('click', () => {
  // TODO: Send stop signal to background service worker
  // 1. Post message to SW to abort current scrape
  // 2. Revert UI state
  console.log('[popup] stop requested');
  setScrapingState(false);
});

historyBtn.addEventListener('click', () => {
  // TODO: Open history page (chrome.runtime.openOptionsPage or custom tab)
  console.log('[popup] open history');
});

settingsBtn.addEventListener('click', () => {
  // TODO: Open settings page
  console.log('[popup] open settings');
});

addUrlBtn.addEventListener('click', () => {
  // TODO: Add another URL input row (for batch mode)
  console.log('[popup] add more URLs');
});

// ── Helpers ────────────────────────────────────────────────────────

function setScrapingState(active: boolean): void {
  isScraping = active;
  stopBtn.classList.toggle('hidden', !active);
  grabCurrentBtn.classList.toggle('hidden', active);
  batchScrapeBtn.classList.toggle('hidden', active);
  urlInput.disabled = active;
}

// ── Message helpers ────────────────────────────────────────────────
// TODO: implement type-safe message passing between popup ↔ SW
// function sendToSW(msg: PopupMessage): Promise<MessageResponse> { ... }
