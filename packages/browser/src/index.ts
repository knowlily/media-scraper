// ---------------------------------------------------------------------------
// @media-scraper/browser — public API
// ---------------------------------------------------------------------------

// Types
export type { StealthOptions } from './stealth.js';
export type { BrowserOptions, ProxyConfig } from './launch.js';
export type { GotoOptions, PageOptions } from './page.js';

// Stealth
export { DEFAULT_STEALTH_OPTIONS, STEALTH_INJECT_SCRIPT } from './stealth.js';

// UA Pool
export { UserAgentPool, DEFAULT_USER_AGENTS } from './ua-pool.js';

// Launch
export { launch } from './launch.js';

// Classes
export { StealthBrowser } from './browser.js';
export { StealthPage } from './page.js';
