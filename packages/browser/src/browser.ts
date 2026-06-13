// ---------------------------------------------------------------------------
// StealthBrowser — wrapped Playwright Browser
// ---------------------------------------------------------------------------

import type { Browser, BrowserContext } from 'playwright';
import { StealthPage } from './page.js';
import type { PageOptions } from './page.js';
import type { StealthOptions } from './stealth.js';
import { STEALTH_INJECT_SCRIPT } from './stealth.js';

/**
 * High‑level browser abstraction that automatically injects stealth
 * scripts and manages a dedicated {@link BrowserContext} per page.
 */
export class StealthBrowser {
  /** Underlying Playwright browser instance. */
  private browser: Browser;
  /** BrowserContext used for creating pages. */
  private context: BrowserContext;
  /** Stealth configuration used when this browser was launched. */
  private stealth: StealthOptions;

  constructor(browser: Browser, context: BrowserContext, stealth: StealthOptions) {
    this.browser = browser;
    this.context = context;
    this.stealth = stealth;
  }

  /** Create a new page in the current context. */
  async newPage(options: PageOptions = {}): Promise<StealthPage> {
    const page = await this.context.newPage();

    // Apply viewport if specified
    if (options.viewport) {
      await page.setViewportSize(options.viewport);
    }

    // Apply per‑page user agent if specified
    if (options.userAgent) {
      await page.setExtraHTTPHeaders({
        'User-Agent': options.userAgent,
      });
    }

    // Inject stealth script if enabled
    if (this.stealth.enabled) {
      await page.addInitScript(STEALTH_INJECT_SCRIPT);
    }

    return new StealthPage(page);
  }

  /** Close the browser and all pages. */
  async close(): Promise<void> {
    try {
      await this.context.close();
    } catch {
      // Context may already be closed
    }
    try {
      await this.browser.close();
    } catch {
      // Browser may already be closed
    }
  }
}
