/**
 * Browser wrapper — delegates to @media-scraper/browser for stealth-enhanced
 * Chromium launch and page navigation, while keeping CLI-specific helpers
 * (extraction, scrolling, metrics) as thin adapters.
 */

import { launch as stealthLaunch, StealthBrowser, StealthPage, DEFAULT_STEALTH_OPTIONS } from '@media-scraper/browser';

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

// ── Launch ──────────────────────────────────────────────────────────────

/**
 * Launch a stealth-enhanced Chromium browser via @media-scraper/browser.
 */
export async function launch(
  options: LaunchOptions = {},
): Promise<{ browser: StealthBrowser }> {
  const browser = await stealthLaunch({
    headless: options.headless ?? true,
    stealth: { ...DEFAULT_STEALTH_OPTIONS },
    userAgent: options.userAgent,
    proxy: options.proxy ? { server: options.proxy } : undefined,
  });

  return { browser };
}

// ── Page ────────────────────────────────────────────────────────────────

/**
 * Navigate to `url` using StealthPage.goto(), with timeout fallback.
 */
export async function loadPage(
  browser: StealthBrowser,
  url: string,
  options: PageLoadOptions = {},
): Promise<StealthPage> {
  const page = await browser.newPage();

  const timeout = options.timeout ?? 30_000;
  const waitUntil = (options.waitUntil ?? 'networkidle') as 'load' | 'networkidle' | 'domcontentloaded';

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
 */
export async function scrollToTriggerLazy(
  page: StealthPage,
  options: ScrollOptions = {},
): Promise<void> {
  const maxPages = options.maxPages ?? 3;
  const scrollDelay = options.scrollDelay ?? 800;

  for (let i = 0; i < maxPages; i++) {
    await new Promise((r) => setTimeout(r, scrollDelay));

    await page.raw.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });

    await page.raw.waitForLoadState('networkidle').catch(() => {
      /* ignore */
    });

    await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));
  }

  // Scroll back to top
  await page.raw.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 200 + Math.random() * 200));
}

// ── Extraction ──────────────────────────────────────────────────────────

/**
 * Inject and run extraction logic on the page.
 */
export async function executeExtraction(
  page: StealthPage,
  options: ExtractionOptions,
): Promise<{
  resources: Array<{
    url: string;
    type: string;
    size: number | null;
    filename: string;
  }>;
}> {
  const resources = await page.raw.evaluate(
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
export async function getPageMetrics(page: StealthPage): Promise<PageMetrics> {
  const startTime = Date.now();

  const title = await page.raw.title().catch(() => 'Unknown');

  const loadTimeMs = Date.now() - startTime;

  // Try to get Navigation Timing API data for more accurate load time
  try {
    const navTiming = await page.raw.evaluate(() => {
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
export async function close(browser: StealthBrowser): Promise<void> {
  await browser.close();
}
