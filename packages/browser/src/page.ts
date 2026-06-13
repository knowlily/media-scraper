// ---------------------------------------------------------------------------
// StealthPage — wrapped Playwright Page with helpers
// ---------------------------------------------------------------------------

import type { Page } from 'playwright';

/** Options accepted by StealthPage.goto(). */
export interface GotoOptions {
  /** Navigation timeout in ms (default 30_000). */
  timeout?: number;
  /** Wait strategy after load: 'load' | 'networkidle' | 'domcontentloaded'. */
  waitUntil?: 'load' | 'networkidle' | 'domcontentloaded';
  /** Extra wait time in ms after the load event (default 1000). */
  extraWaitMs?: number;
}

/** Options accepted by StealthBrowser.newPage(). */
export interface PageOptions {
  /** Override the default viewport. */
  viewport?: { width: number; height: number };
  /** User-agent string for this page. */
  userAgent?: string;
}

/**
 * Thin wrapper around Playwright's `Page` with ergonomic helpers.
 */
export class StealthPage {
  /** The underlying Playwright Page. */
  readonly raw: Page;

  constructor(page: Page) {
    this.raw = page;
  }

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  /**
   * Navigate to `url`, wait for the load event, then wait an extra
   * `extraWaitMs` (default 1 s) for stability.
   */
  async goto(url: string, options: GotoOptions = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    const waitUntil = options.waitUntil ?? 'load';
    const extraWaitMs = options.extraWaitMs ?? 1000;

    try {
      await this.raw.goto(url, { timeout, waitUntil });
    } catch (err) {
      // Wrap with context
      const message =
        err instanceof Error
          ? `goto("${url}") failed: ${err.message}`
          : `goto("${url}") failed: ${String(err)}`;
      const wrapped = new Error(message);
      if (err instanceof Error) {
        wrapped.stack = err.stack;
      }
      throw wrapped;
    }

    // Extra stability wait
    if (extraWaitMs > 0) {
      await this.raw.waitForTimeout(extraWaitMs);
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /** Get the full page HTML. */
  async content(): Promise<string> {
    return this.raw.content();
  }

  /**
   * Scroll down the page in segments to trigger lazy‑loaded content.
   *
   * Scrolls 5 times × 800 px, 300 ms between each step.
   * Silently ignores errors if the page has already been closed.
   */
  async scrollToTriggerLazy(): Promise<void> {
    try {
      for (let i = 0; i < 5; i++) {
        await this.raw.evaluate((scrollBy) => {
          window.scrollBy(0, scrollBy);
        }, 800);
        await this.raw.waitForTimeout(300);
      }
    } catch {
      // Page may have been closed — silently ignore
    }
  }

  /**
   * Wait until there are no pending network requests for `timeoutMs`
   * (default 3000 ms).
   */
  async waitForNetworkIdle(timeoutMs = 3000): Promise<void> {
    try {
      await this.raw.waitForLoadState('networkidle', { timeout: timeoutMs });
    } catch {
      // If networkidle times out it's not fatal — just continue
    }
  }
}
