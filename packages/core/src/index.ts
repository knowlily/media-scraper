// ---------------------------------------------------------------------------
// @media-scraper/core — public API
// ---------------------------------------------------------------------------

// Types
export type {
  MediaType,
  MediaSource,
  MediaResource,
  ScrapeResult,
  BackgroundResult,
  ScrapeOptions,
  DownloadOptions,
  DownloadProgress,
  FilterOptions,
  DocumentLike,
  ElementLike,
  PlatformExtractor,
  // V2 types
  ScrapeError,
  ScrapeStats,
  DeduplicatorLike,
} from './types.js';

// Scraper
export {
  scrape,
  categorizeResources,
  // V2
  MediaScraper,
} from './scraper.js';
export type {
  CategorizedResources,
  // V2
  MediaScraperOptions,
} from './scraper.js';

// Extractors
export { extractImages } from './extractors/images.js';
export { extractVideos, registerPlatformExtractor } from './extractors/videos.js';
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

// V2: FilterChain
export { FilterChain } from './filters/chain.js';

// V2: Streaming
export { scrapeStream } from './output/stream.js';
export type { StreamYield, ScrapeStreamOptions } from './output/stream.js';
export { collectFromStream } from './output/collect.js';

// V2: Parser system
export type { MediaParser } from './parsers/types.js';
export { registerParser, getRegisteredParsers, clearParsers } from './parsers/registry.js';

// V2: Built-in parsers
export { ImageParser } from './parsers/image.js';
export { BackgroundParser } from './parsers/background.js';
export { IframeParser } from './parsers/iframe.js';
export { VideoParser } from './parsers/video.js';
export { AudioParser } from './parsers/audio.js';
export { DocumentParser } from './parsers/document.js';
export { ShadowParser } from './parsers/shadow.js';
export { BUILTIN_PARSERS } from './parsers/builtin.js';

// Utilities
export {
  generateId,
  extractFilename,
  getExtension,
  isMediaUrl,
} from './utils.js';

// Extractor helpers (shared)
export {
  resolveUrl,
  makeResource,
  parseSrcset,
  pickBestCandidate,
  resolveImgSrc,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
  DOCUMENT_EXTENSIONS,
} from './extractors/helpers.js';
export type { SrcsetCandidate } from './extractors/helpers.js';
