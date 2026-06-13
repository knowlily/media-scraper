// ---------------------------------------------------------------------------
// @media-scraper/dedupe — public API
// ---------------------------------------------------------------------------

// Types
export type { DeduplicationStrategy } from './types.js';

// Strategies
export { NormalizedURLStrategy } from './strategies/normalized-url.js';
export { FileSignatureStrategy } from './strategies/file-signature.js';
export { PerceptualHashStrategy } from './strategies/perceptual-hash.js';

// Deduplicator
export { Deduplicator } from './deduplicator.js';
