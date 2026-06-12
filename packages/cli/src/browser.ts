/**
 * Playwright browser wrapper with stealth settings and anti-bot strategies.
 */

import type { Browser, BrowserContext, Page } from 'playwright';

// ── Types ───────────────────────────────────────────────────────────────

export interface LaunchOptions {
  headless?: boolean;
  proxy?: string;
  userAgent?: string;
  timeout?: number;
}

export interface PageLoadOptions {
  timeout?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

export interface ScrollOptions {
  maxPages?: number;
  scrollDelay?: number;
}

export interface ExtractionOptions {
  types: string[];
  minSize?: number;
}

export interface PageMetrics {
  title: string;
  loadTimeMs: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Random delay between `min` and `max` ms to mimic human behaviour. */
function randomDelay(min = 100, max = 500): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((r) => setTimeout(r, ms));
}

// ── Launch ──────────────────────────────────────────────────────────────

let _playwright: typeof import('playwright') | null = null;

async function getPlaywright(): Promise<typeof import('playwright')> {
  if (!_playwright) {
    _playwright = await import('playwright');
  }
  return _playwright;
}

/**
 * Launch a Chromium browser with stealth settings.
 */
export async function launch(
  options: LaunchOptions = {},
): Promise<{ browser: Browser; context: BrowserContext }> {
  const { chromium } = await getPlaywright();

  const launchArgs: string[] = [
    // ── Hide automation traces ───────────────────────────────────────
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-infobars',
    '--disable-dev-shm-usage',
    // ── GPU / rendering ──────────────────────────────────────────────
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
  ];

  if (options.proxy) {
    launchArgs.push(`--proxy-server=${options.proxy}`);
  }

  const browser = await chromium.launch({
    headless: options.headless ?? true,
    args: launchArgs,
  });

  const context = await browser.newContext({
    userAgent:
      options.userAgent ??
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    // Stealth: disable permission prompts, geolocation, notifications
    permissions: [],
    geolocation: undefined,
  });

  // ── Stealth: Override navigator.webdriver ─────────────────────────
  await context.addInitScript(() => {
    // @ts-expect-error – patching navigator
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // Override Chrome runtime for detection evasion
    // @ts-expect-error – patching window.chrome
    window.chrome = { runtime: {} };

    // Override permissions query
    const originalQuery = window.navigator.permissions.query;
    // @ts-expect-error – patching permissions.query
    window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
      parameters.name === 'notifications'
        ? Promise.resolve({
            state: Notification.permission as PermissionState,
          } as PermissionStatus)
        : originalQuery(parameters);
  });

  return { browser, context };
}

// ── Page ────────────────────────────────────────────────────────────────

/**
 * Navigate to `url`, wait for the page to load, handle timeouts gracefully.
 */
export async function loadPage(
  context: BrowserContext,
  url: string,
  options: PageLoadOptions = {},
): Promise<Page> {
  const page = await context.newPage();

  const timeout = options.timeout ?? 30_000;
  const waitUntil = options.waitUntil ?? 'networkidle';

  try {
    await page.goto(url, { timeout, waitUntil });
  } catch {
    // If networkidle times out, try with 'load' as fallback
    process.stderr.write(
      `[WARN] networkidle timed out for ${url}, falling back to 'load'\n`,
    );
    try {
      await page.goto(url, { timeout, waitUntil: 'load' });
    } catch (err) {
      process.stderr.write(
        `[ERROR] Failed to load ${url}: ${String(err)}\n`,
      );
    }
  }

  return page;
}

// ── Scroll ──────────────────────────────────────────────────────────────

/**
 * Scroll the page to trigger lazy-loaded content (images, infinite scroll).
 * Scrolls through `maxPages` viewport-heights worth of content.
 */
export async function scrollToTriggerLazy(
  page: Page,
  options: ScrollOptions = {},
): Promise<void> {
  const maxPages = options.maxPages ?? 3;
  const scrollDelay = options.scrollDelay ?? 800;

  for (let i = 0; i < maxPages; i++) {
    await randomDelay(scrollDelay / 2, scrollDelay);

    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });

    // Wait for any network activity to settle
    await page.waitForLoadState('networkidle').catch(() => {
      /* ignore */
    });

    await randomDelay(300, 600);
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await randomDelay(200, 400);
}

// ── Extraction ──────────────────────────────────────────────────────────

/**
 * Inject and run extraction logic. Delegates to @media-scraper/core.
 * If @media-scraper/core is not yet available, falls back to a basic
 * pass-through that returns the raw page DOM for the core to process.
 */
export async function executeExtraction(
  page: Page,
  options: ExtractionOptions,
): Promise<{
  resources: Array<{
    url: string;
    type: string;
    size: number | null;
    filename: string;
  }>;
}> {
  // ── Try to use @media-scraper/core ─────────────────────────────────
  try {
    const core = await import('@media-scraper/core');
    if (core.extractMedia) {
      // Core extraction: inject the core's extraction script into the page
      const rawData = await page.evaluate(core.extractMedia.toString());
      // Then let core process it
      const result = await core.processExtraction(rawData, {
        types: options.types,
        minSize: options.minSize,
      });
      return { resources: result.resources ?? [] };
    }
  } catch {
    // Fallback: core not installed yet — extract raw media links
    process.stderr.write(
      '[INFO] @media-scraper/core not available, using built-in fallback extraction\n',
    );
  }

  // ── Built-in fallback extraction ───────────────────────────────────
  const resources = await page.evaluate(
    ({ types, minSize }: { types: string[]; minSize?: number }) => {
      const results: Array<{
        url: string;
        type: string;
        size: number | null;
        filename: string;
      }> = [];

      const extractFilename = (u: string): string => {
        try {
          const pathname = new URL(u).pathname;
          return pathname.split('/').pop() ?? 'unknown';
        } catch {
          return 'unknown';
        }
      };

      const guessType = (u: string): string => {
        const ext = u.split('.').pop()?.toLowerCase().split('?')[0] ?? '';
        const img = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
        const vid = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'flv'];
        const aud = ['mp3', 'wav', 'flac', 'aac', 'opus', 'm4a'];
        const doc = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', '7z'];
        if (img.includes(ext)) return 'image';
        if (vid.includes(ext)) return 'video';
        if (aud.includes(ext)) return 'audio';
        if (doc.includes(ext)) return 'doc';
        return 'other';
      };

      const shouldInclude = (type: string) =>
        types.length === 0 || types.includes(type);

      // Images
      if (shouldInclude('image')) {
        document.querySelectorAll('img[src]').forEach((img) => {
          const src = (img as HTMLImageElement).src;
          if (src && src.startsWith('http')) {
            results.push({
              url: src,
              type: 'image',
              size: null,
              filename: extractFilename(src),
            });
          }
        });
      }

      // Videos
      if (shouldInclude('video')) {
        document.querySelectorAll('video source[src], video[src]').forEach((el) => {
          const src =
            el.getAttribute('src') ?? (el as HTMLVideoElement).src;
          if (src && src.startsWith('http')) {
            results.push({
              url: src,
              type: 'video',
              size: null,
              filename: extractFilename(src),
            });
          }
        });
      }

      // Audio
      if (shouldInclude('audio')) {
        document.querySelectorAll('audio source[src], audio[src]').forEach((el) => {
          const src =
            el.getAttribute('src') ?? (el as HTMLAudioElement).src;
          if (src && src.startsWith('http')) {
            results.push({
              url: src,
              type: 'audio',
              size: null,
              filename: extractFilename(src),
            });
          }
        });
      }

      // Links (documents)
      if (shouldInclude('doc')) {
        document.querySelectorAll('a[href]').forEach((a) => {
          const href = (a as HTMLAnchorElement).href;
          const type = guessType(href);
          if (type === 'doc' && href.startsWith('http')) {
            results.push({
              url: href,
              type: 'doc',
              size: null,
              filename: extractFilename(href),
            });
          }
        });
      }

      // Deduplicate by URL
      const seen = new Set<string>();
      return results.filter((r) => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });
    },
    { types: options.types, minSize: options.minSize },
  );

  return { resources };
}

// ── Metrics ─────────────────────────────────────────────────────────────

/**
 * Get basic page metrics: title and approximate load time.
 */
export async function getPageMetrics(page: Page): Promise<PageMetrics> {
  const startTime = Date.now();

  const title = await page.title().catch(() => 'Unknown');

  const loadTimeMs = Date.now() - startTime;

  // Try to get Navigation Timing API data for more accurate load time
  try {
    const navTiming = await page.evaluate(() => {
      const timing = performance.getEntriesByType(
        'navigation',
      )[0] as PerformanceNavigationTiming;
      if (timing) {
        return timing.loadEventEnd - timing.startTime;
      }
      return null;
    });
    if (navTiming && navTiming > 0) {
      return { title, loadTimeMs: navTiming };
    }
  } catch {
    /* fall through to approximate */
  }

  return { title, loadTimeMs };
}

// ── Cleanup ─────────────────────────────────────────────────────────────

/**
 * Gracefully close the browser instance.
 */
export async function close(browser: Browser): Promise<void> {
  await browser.close();
}
