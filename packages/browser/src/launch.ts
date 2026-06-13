// ---------------------------------------------------------------------------
// launch() — start a stealth‑enhanced Chromium browser
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';
import type { Browser, BrowserContext } from 'playwright';
import { StealthBrowser } from './browser.js';
import { STEALTH_INJECT_SCRIPT, DEFAULT_STEALTH_OPTIONS } from './stealth.js';
import type { StealthOptions } from './stealth.js';
import { UserAgentPool, DEFAULT_USER_AGENTS } from './ua-pool.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Proxy configuration for the browser. */
export interface ProxyConfig {
  /** Full proxy URL, e.g. http://user:pass@host:port */
  server: string;
  /** Optional comma‑separated list of domains to bypass the proxy. */
  bypass?: string;
  /** Username for proxy authentication. */
  username?: string;
  /** Password for proxy authentication. */
  password?: string;
}

/** Top‑level options for launch(). */
export interface BrowserOptions {
  /** Stealth / anti‑detection settings. */
  stealth?: StealthOptions;
  /**
   * User‑Agent string to use.
   * - A literal string → used directly.
   * - The magic string `'pool'` → pick from {@link DEFAULT_USER_AGENTS} at random.
   * - Undefined → Playwright default.
   */
  userAgent?: string | 'pool';
  /** Proxy configuration. */
  proxy?: ProxyConfig;
  /** Viewport size (default 1920×1080). */
  viewport?: { width: number; height: number };
  /** Browser locale (default 'zh-CN'). */
  locale?: string;
  /** Timezone ID (default 'Asia/Shanghai'). */
  timezoneId?: string;
  /** Run in headless mode? Default true. */
  headless?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UA_POOL = new UserAgentPool(DEFAULT_USER_AGENTS);

/**
 * Resolve the user agent from options.
 * Returns undefined when no override is requested (Playwright default).
 */
function resolveUserAgent(options: BrowserOptions): string | undefined {
  if (options.userAgent === 'pool') {
    return UA_POOL.getRandom();
  }
  if (typeof options.userAgent === 'string') {
    return options.userAgent;
  }
  return undefined;
}

/**
 * Parse and validate a proxy URL string.
 * Returns Playwright‑compatible proxy options, or throws.
 */
function resolveProxy(proxy?: ProxyConfig): { server: string; bypass?: string; username?: string; password?: string } | undefined {
  if (!proxy) return undefined;

  const server = proxy.server.trim();
  if (!server) {
    throw new Error('launch(): proxy.server must be a non‑empty string');
  }

  // Basic smell‑test: must start with http:// or socks5:// etc.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(server)) {
    throw new Error(
      `launch(): invalid proxy server "${server}" — must be a URL like http://host:port`,
    );
  }

  return {
    server,
    bypass: proxy.bypass,
    username: proxy.username,
    password: proxy.password,
  };
}

/**
 * Merge user options with defaults.
 */
function resolveStealth(custom?: StealthOptions): StealthOptions {
  return custom ? { ...DEFAULT_STEALTH_OPTIONS, ...custom } : { ...DEFAULT_STEALTH_OPTIONS };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Launch a stealth‑enhanced Chromium browser.
 *
 * Usage:
 * ```ts
 * const browser = await launch({ userAgent: 'pool', headless: true });
 * const page = await browser.newPage();
 * await page.goto('https://example.com');
 * ```
 */
export async function launch(options: BrowserOptions = {}): Promise<StealthBrowser> {
  const stealth = resolveStealth(options.stealth);

  // Validate proxy early
  const proxySettings = resolveProxy(options.proxy);

  const userAgent = resolveUserAgent(options);

  // Launch browser
  let browser: Browser;
  try {
    browser = await chromium.launch({
      headless: options.headless ?? true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-web-security',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? `launch(): failed to start Chromium — ${err.message}`
        : `launch(): failed to start Chromium — ${String(err)}`;
    throw new Error(message);
  }

  // Create context
  let context: BrowserContext;
  try {
    context = await browser.newContext({
      viewport: options.viewport ?? { width: 1920, height: 1080 },
      locale: options.locale ?? 'zh-CN',
      timezoneId: options.timezoneId ?? 'Asia/Shanghai',
      userAgent,
      proxy: proxySettings,
    });

    // Inject stealth script into every page in this context
    if (stealth.enabled) {
      await context.addInitScript(STEALTH_INJECT_SCRIPT);
    }
  } catch (err) {
    // Clean up browser if context creation fails
    try {
      await browser.close();
    } catch {
      // ignore
    }
    throw err;
  }

  return new StealthBrowser(browser, context, stealth);
}
