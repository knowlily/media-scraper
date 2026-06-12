// ---------------------------------------------------------------------------
// @media-scraper/core — public API
// ---------------------------------------------------------------------------

// Types
export type {
  MediaType,
  MediaSource,
  MediaResource,
  ScrapeResult,
  ScrapeOptions,
  DownloadOptions,
  DownloadProgress,
  FilterOptions,
  DocumentLike,
  ElementLike,
} from './types.js';

// Scraper
export { scrape, categorizeResources } from './scraper.js';
export type { CategorizedResources } from './scraper.js';

// Extractors
export { extractImages } from './extractors/images.js';
export { extractVideos } from './extractors/videos.js';
export { extractAudio } from './extractors/audio.js';
export { extractDocuments } from './extractors/documents.js';
export { extractBackgroundImages } from './extractors/backgrounds.js';
export { extractIframeMedia } from './extractors/iframes.js';
export { extractShadowDomMedia } from './extractors/shadow-dom.js';

// Filters
export {
  deduplicate,
  filterByType,
  filterBySize,
  filterByDomain,
  sanitizeFilename,
} from './filters.js';

// Utilities
export {
  generateId,
  extractFilename,
  getExtension,
  isMediaUrl,
} from './utils.js';
