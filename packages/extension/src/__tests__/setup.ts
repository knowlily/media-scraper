// ---------------------------------------------------------------------------
// Vitest setup — mock chrome API globals and DOM for extension tests
// ---------------------------------------------------------------------------

// Mock chrome.runtime
if (!globalThis.chrome) {
  (globalThis as any).chrome = {
    runtime: {
      onMessage: {
        addListener: () => {},
        removeListener: () => {},
      },
      sendMessage: () => Promise.resolve(),
      getURL: (path: string) => path,
      openOptionsPage: () => {},
    },
    tabs: {
      query: () => Promise.resolve([{ id: 1, url: 'https://example.com' }]),
      sendMessage: () => Promise.resolve(),
      create: () => Promise.resolve({ id: 2 }),
      onUpdated: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
    storage: {
      session: {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
        remove: () => Promise.resolve(),
      },
      local: {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      },
    },
    scripting: {
      executeScript: () => Promise.resolve(),
    },
    downloads: {
      download: () => {},
      onChanged: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
  };
}

// Set up minimal DOM structure for popup.ts init() to not crash
if (typeof document !== 'undefined') {
  const bodyHTML = `
    <div id="input-mode" class="ms-mode">
      <input id="urlInput" class="url-input" />
      <button id="grabCurrentBtn" class="btn btn-primary"></button>
      <button id="batchScrapeBtn" class="btn btn-secondary"></button>
      <div id="inputStatus" class="status-message" style="display:none;"></div>
      <button id="historyBtn" class="btn btn-link"></button>
      <button id="settingsBtn" class="btn btn-link"></button>
    </div>
    <div id="results-mode" class="ms-mode" style="display:none;">
      <button id="ms-back-btn" class="ms-header-back"></button>
      <button id="ms-rescrape-btn" class="ms-header-rescrape"></button>
      <span class="ms-spinner" id="ms-spinner"></span>
      <span id="ms-status-text"></span>
      <div class="ms-tabs" id="ms-tabs"></div>
      <input class="ms-search-input" id="ms-search-input" type="text" />
      <button class="ms-btn-select-all" id="ms-select-all-btn"></button>
      <div class="ms-list" id="ms-list">
        <div class="ms-items-container" id="ms-items-container"></div>
      </div>
      <div class="ms-selection-bar" id="ms-selection-bar" style="display:none;">
        <span class="ms-selection-info" id="ms-selection-info"></span>
        <button class="ms-btn-copy" id="ms-copy-btn"></button>
        <button class="ms-btn-download" id="ms-download-btn"></button>
      </div>
      <div id="ms-video-player" style="display:none;">
        <video id="ms-video-el"></video>
        <button id="ms-video-close"></button>
      </div>
    </div>
    <div id="ms-preview-overlay" class="ms-image-preview" style="display:none;">
      <div class="ms-preview-backdrop"></div>
      <div class="ms-preview-content">
        <button class="ms-preview-close"></button>
        <img id="ms-preview-img" src="" alt="" />
        <div class="ms-preview-info" id="ms-preview-info"></div>
      </div>
    </div>
    <span class="ms-tab-count" id="ms-count-image">0</span>
    <span class="ms-tab-count" id="ms-count-video">0</span>
    <span class="ms-tab-count" id="ms-count-audio">0</span>
    <span class="ms-tab-count" id="ms-count-document">0</span>
  `;
  document.body.innerHTML = bodyHTML;
}
