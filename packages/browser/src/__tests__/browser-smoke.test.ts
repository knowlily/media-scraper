// ---------------------------------------------------------------------------
// Smoke tests for StealthBrowser and StealthPage (requires Playwright)
// ---------------------------------------------------------------------------

import { describe, it, expect, afterAll } from 'vitest';
import { launch } from '../launch.js';
import type { StealthBrowser } from '../browser.js';

// Global browser instance reused across tests to save time
let browser: StealthBrowser | undefined;

afterAll(async () => {
  if (browser) {
    await browser.close();
  }
});

async function getBrowser(): Promise<StealthBrowser> {
  if (!browser) {
    browser = await launch({ headless: true });
  }
  return browser;
}

describe('StealthBrowser', () => {
  it('should launch and create a new page', async () => {
    const b = await getBrowser();
    const page = await b.newPage();
    expect(page).toBeDefined();
    expect(page.raw).toBeDefined();
  });

  it('should close gracefully', async () => {
    const b = await launch({ headless: true });
    await b.close();
    // No error = success
  });
});

describe('StealthPage', () => {
  it('goto("https://example.com") should succeed', async () => {
    const b = await getBrowser();
    const page = await b.newPage();
    await page.goto('https://example.com');
    // No error = success
  }, 15_000);

  it('content() should return non‑empty HTML after navigation', async () => {
    const b = await getBrowser();
    const page = await b.newPage();
    await page.goto('https://example.com');
    const html = await page.content();
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('</html>');
    expect(html).toContain('<head>');
  }, 15_000);

  it('scrollToTriggerLazy() should not throw', async () => {
    const b = await getBrowser();
    const page = await b.newPage();
    await page.goto('https://example.com');
    // scrollToTriggerLazy silently ignores errors — just verify no throw
    await expect(page.scrollToTriggerLazy()).resolves.toBeUndefined();
  }, 15_000);

  it('waitForNetworkIdle() should resolve', async () => {
    const b = await getBrowser();
    const page = await b.newPage();
    await page.goto('https://example.com');
    await expect(
      page.waitForNetworkIdle(5000),
    ).resolves.toBeUndefined();
  }, 20_000);

  it('raw should return the underlying Playwright Page', async () => {
    const b = await getBrowser();
    const page = await b.newPage();
    expect(page.raw).toBeDefined();
    expect(typeof page.raw.goto).toBe('function');
    expect(typeof page.raw.content).toBe('function');
  });

  it('should handle goto timeout with context error', async () => {
    const b = await getBrowser();
    const page = await b.newPage();
    // Use a URL that will definitely timeout (non-routable IP)
    const badUrl = 'https://192.0.2.1/';
    try {
      await page.goto(badUrl, {
        timeout: 2000,
        extraWaitMs: 0,
      });
      // Should not reach here — timeout expected
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      // The wrapper should include the URL and 'failed'
      expect(msg).toContain(`goto("${badUrl}")`);
      expect(msg).toContain('failed');
    }
  }, 15_000);

  it('scrollToTriggerLazy should silently ignore closed page', async () => {
    // Create a fresh browser, navigate, then close context — scroll should not throw
    const b = await launch({ headless: true });
    try {
      const page = await b.newPage();
      await page.goto('https://example.com');
      // Close the raw page directly to simulate unexpected closure
      await page.raw.close();
      // scrollToTriggerLazy should not throw
      await expect(page.scrollToTriggerLazy()).resolves.toBeUndefined();
    } finally {
      await b.close();
    }
  }, 15_000);
});
