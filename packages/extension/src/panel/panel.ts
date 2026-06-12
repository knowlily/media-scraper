/**
 * Media Scraper — Result Panel Script
 *
 * Receives extracted media results and renders them as a filterable,
 * selectable grid. Supports keyboard shortcuts for navigation/selection.
 */

import type {
  MediaItem,
  PanelMessage,
  MessageResponse,
  ScrapeResult,
} from '../utils/messages.js';

// ── State ──────────────────────────────────────────────────────────
let results: MediaItem[] = [];
let selectedIds: Set<string> = new Set();
let activeFilter: string = 'all';
let activeSort: string = 'size-desc';
let minSizePx: number = 100;

// ── DOM refs ───────────────────────────────────────────────────────
const grid = document.getElementById('results-grid')!;
const emptyState = document.getElementById('empty-state')!;
const selectionInfo = document.getElementById('selection-info')!;

// ── Initialization ─────────────────────────────────────────────────
// TODO: On load, request scrape results from background SW
// chrome.runtime.sendMessage({ type: 'GET_RESULTS' }, (resp) => { ... });

// ── Rendering ──────────────────────────────────────────────────────

function renderGrid(items: MediaItem[]): void {
  // TODO: Render media items as grid cards with thumbnail
  // - Show thumbnail for images (lazy load, max 50 cached)
  // - Show placeholder for video/audio/document
  // - Show checkbox overlay for selection
  // - Show file size and type badge
  grid.innerHTML = '';
  if (items.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  // TODO: create card DOM elements
  console.log('[panel] render', items.length, 'items');
}

function updateSelectionUI(): void {
  // TODO: Calculate total size of selected items
  // Update selectionInfo text and enable/disable download button
  const total = results.length;
  const selected = selectedIds.size;
  selectionInfo.textContent = `已选 ${selected}/${total} · 总大小 —`;
}

// ── Selection ──────────────────────────────────────────────────────

function toggleSelection(id: string, shiftKey: boolean = false): void {
  // TODO: Implement click selection
  // - Single click: toggle one item
  // - Shift+click: range select from last clicked to this one
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  updateSelectionUI();
}

function selectAll(): void {
  // TODO: Select all visible (filtered) items
  results.forEach(r => selectedIds.add(r.id));
  updateSelectionUI();
}

function deselectAll(): void {
  selectedIds.clear();
  updateSelectionUI();
}

// ── Keyboard Shortcuts ─────────────────────────────────────────────

document.addEventListener('keydown', (e: KeyboardEvent) => {
  // TODO: Implement keyboard navigation
  // - Arrow keys: navigate grid (up/down/left/right)
  // - Space: toggle selection of focused item
  // - Enter: download selected items
  // - Ctrl+A: select all
  // - Escape: close preview overlay if open
  switch (e.key) {
    case 'a':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        selectAll();
      }
      break;
    case 'Escape':
      // TODO: close preview overlay
      break;
    case 'Enter':
      // TODO: download selected
      break;
    case ' ':
      // TODO: toggle focused item selection
      break;
  }
});

// ── Filter & Sort ──────────────────────────────────────────────────

// TODO: Wire up filter/sort dropdowns
// - type-filter: filter results by media type
// - sort-filter: sort by size/name
// - min-size: minimum dimension threshold

// ── Download ───────────────────────────────────────────────────────

function downloadSelected(): void {
  // TODO: Send download request to background SW
  // 1. Collect URLs from selectedIds
  // 2. Post message to SW: { type: 'DOWNLOAD', urls: [...] }
  // 3. SW calls chrome.downloads.download() for each URL
  console.log('[panel] download', selectedIds.size, 'items');
}

// ── Export ─────────────────────────────────────────────────────────

function exportResults(format: 'json' | 'csv'): void {
  // TODO: Generate JSON or CSV export of results
  // Offer download via chrome.downloads or copy to clipboard
  console.log('[panel] export as', format);
}

// ── Preview Overlay ────────────────────────────────────────────────

function showPreview(item: MediaItem): void {
  // TODO: Open large image preview overlay
  // - Load full-size image
  // - Show filename, dimensions, size, source URL
  // - Download / Copy link / Open in new tab buttons
  console.log('[panel] preview', item.url);
}

function closePreview(): void {
  // TODO: Hide preview overlay, release large image blob
}
