#!/usr/bin/env node

/**
 * Media Scraper HTTP API Server — standalone, no CLI dependency
 *
 * Start:  node dist/api.js [--port 3456]
 *
 * Endpoints:
 *   GET  /health
 *   POST /scrape   {"url":"...", "types":["image","video"]}
 *   POST /download {"resources":[...], "outputDir":"..."}
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const PORT = parseInt(process.env.PORT || '3456', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ── Helpers ─────────────────────────────────────────────────────────────────

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data, null, 2));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

// ── Anti-Detection Utilities ────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1680, height: 1050 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
];

function randomItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randomDelay(min = 200, max = 800): Promise<void> {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

const STEALTH_SCRIPT = `
// Override navigator.webdriver
Object.defineProperty(navigator, 'webdriver', { get: () => false });

// Fake chrome.runtime (sites check this for extension detection)
window.chrome = { runtime: {} };

// Fake plugins
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });

// Override permissions query (some sites check notifications/permissions)
const origQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
  parameters.name === 'notifications' ?
    Promise.resolve({ state: Notification.permission, onchange: null } as PermissionStatus) :
    origQuery(parameters)
);
`;

const EXTRACT_SCRIPT = `(() => {
  const baseUrl = location.href;
  const seen = new Set();
  const images = [];
  const videos = [];
  const audio = [];
  const documents = [];

  function getExt(u) { try { const p = new URL(u).pathname; const d = p.lastIndexOf('.'); return d === -1 ? '' : p.slice(d).toLowerCase(); } catch { return ''; } }
  function getName(u) { try { const n = new URL(u).pathname.split('/').pop() || 'unknown'; return decodeURIComponent(n); } catch { return 'unknown'; } }
  function resolve(href) { if (!href || href.startsWith('data:') || href.startsWith('blob:')) return null; try { return new URL(href, baseUrl).href; } catch { return null; } }

  for (const el of document.querySelectorAll('img')) {
    for (const attr of ['src', 'data-src', 'data-original']) {
      const u = resolve(el.getAttribute(attr) || '');
      if (u && !seen.has(u)) { seen.add(u); images.push({url:u, filename:getName(u), ext:getExt(u), source:'img'}); }
    }
  }
  for (const m of document.querySelectorAll('meta[property="og:image"]')) {
    const u = resolve(m.getAttribute('content') || '');
    if (u && !seen.has(u)) { seen.add(u); images.push({url:u, filename:getName(u), ext:getExt(u), source:'head-meta'}); }
  }
  for (const m of document.querySelectorAll('meta[name="twitter:image"]')) {
    const u = resolve(m.getAttribute('content') || '');
    if (u && !seen.has(u)) { seen.add(u); images.push({url:u, filename:getName(u), ext:getExt(u), source:'head-meta'}); }
  }
  for (const el of document.querySelectorAll('video')) {
    const u = resolve(el.getAttribute('src') || '');
    if (u && !seen.has(u)) { seen.add(u); videos.push({url:u, filename:getName(u), ext:getExt(u), source:'video'}); }
    for (const s of el.querySelectorAll('source')) {
      const su = resolve(s.getAttribute('src') || '');
      if (su && !seen.has(su)) { seen.add(su); videos.push({url:su, filename:getName(su), ext:getExt(su), source:'video'}); }
    }
  }
  for (const el of document.querySelectorAll('audio')) {
    const u = resolve(el.getAttribute('src') || '');
    if (u && !seen.has(u)) { seen.add(u); audio.push({url:u, filename:getName(u), ext:getExt(u), source:'audio'}); }
    for (const s of el.querySelectorAll('source')) {
      const su = resolve(s.getAttribute('src') || '');
      if (su && !seen.has(su)) { seen.add(su); audio.push({url:su, filename:getName(su), ext:getExt(su), source:'audio'}); }
    }
  }
  const DOC = ['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.zip','.rar','.7z','.tar','.gz'];
  const VID = ['.mp4','.webm','.ogg','.ogv','.mov','.avi','.mkv','.flv','.m4v'];
  const AUD = ['.mp3','.wav','.flac','.aac','.m4a','.opus'];
  for (const a of document.querySelectorAll('a')) {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#') || href.startsWith('javascript:')) continue;
    const u = resolve(href); if (!u) continue;
    const ext = getExt(u);
    if (DOC.includes(ext) && !seen.has(u)) { seen.add(u); documents.push({url:u, filename:getName(u), ext, source:'link'}); }
    if (VID.includes(ext) && !seen.has(u)) { seen.add(u); videos.push({url:u, filename:getName(u), ext, source:'link'}); }
    if (AUD.includes(ext) && !seen.has(u)) { seen.add(u); audio.push({url:u, filename:getName(u), ext, source:'link'}); }
  }
  return { url: location.href, title: document.title, images, videos, audio, documents, total: images.length+videos.length+audio.length+documents.length };
})()`;

async function lazyScroll(page: any): Promise<void> {
  await page.evaluate(`(async () => {
    const step = window.innerHeight * 0.7;
    for (let i = 0; i < 5; i++) {
      window.scrollBy(0, step);
      await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
      if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 200) break;
    }
    window.scrollTo(0, 0);
  })()`);
}

async function extractFromPage(page: any): Promise<Record<string, unknown>> {
  return page.evaluate(EXTRACT_SCRIPT) as Promise<Record<string, unknown>>;
}

// ── Scrape Engine (Playwright + Core + Anti-Detection) ─────────────────────

async function scrapeUrl(url: string, opts?: {
  types?: string[];
  timeout?: number;
  proxy?: string;
  referer?: string;
  cdpEndpoint?: string;      // Connect to existing Chrome (zero anti-detection)
  cookies?: string;           // JSON cookie string for injection
}): Promise<unknown> {
  const { chromium } = await import('playwright');

  // ── CDP mode: connect to user's real Chrome (bypasses ALL anti-bot) ──
  if (opts?.cdpEndpoint) {
    const browser = await chromium.connectOverCDP(opts.cdpEndpoint);
    const contexts = browser.contexts();
    const page = contexts[0]?.pages()[0] || await contexts[0]?.newPage();
    if (!page) throw new Error('No page available in CDP browser');

    await page.goto(url, { timeout: opts?.timeout ?? 30000, waitUntil: 'domcontentloaded' });
    await randomDelay(500, 1500);

    const result = await extractFromPage(page);
    await browser.close();
    // Filter
    if (opts?.types?.length) {
      const keep = new Set(opts.types);
      if (!keep.has('image')) (result as any).images = [];
      if (!keep.has('video')) (result as any).videos = [];
      if (!keep.has('audio')) (result as any).audio = [];
      if (!keep.has('document')) (result as any).documents = [];
    }
    return result;
  }

  // ── Headless mode with stealth ──

  const launchOpts: Record<string, unknown> = { headless: true };
  if (opts?.proxy) launchOpts.proxy = { server: opts.proxy };

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({
    userAgent: randomItem(USER_AGENTS),
    viewport: randomItem(VIEWPORTS),
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    geolocation: { latitude: 31.23, longitude: 121.47 },
    permissions: [],
  });

  try {
    const page = await context.newPage();

    // Stealth injection before navigation
    await page.addInitScript(STEALTH_SCRIPT);

    // Extra headers
    const headers: Record<string, string> = {
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
    if (opts?.referer) headers['Referer'] = opts.referer;
    await page.setExtraHTTPHeaders(headers);

    // Navigate
    await page.goto(url, {
      timeout: opts?.timeout ?? 30000,
      waitUntil: 'domcontentloaded',
      referer: opts?.referer,
    });

    // Random delay to mimic human
    await randomDelay(500, 1500);

    // Lazy-load + extract
    await lazyScroll(page);
    await randomDelay(300, 800);
    const result = await extractFromPage(page);

    // Filter by types
    if (opts?.types && opts.types.length > 0) {
      const keep = new Set(opts.types);
      if (!keep.has('image')) (result as any).images = [];
      if (!keep.has('video')) (result as any).videos = [];
      if (!keep.has('audio')) (result as any).audio = [];
      if (!keep.has('document')) (result as any).documents = [];
    }

    return result;
  } finally {
    await context.close();
    await browser.close();
  }
}

// ── Download Engine ─────────────────────────────────────────────────────────

async function downloadResources(
  resources: Array<{ url: string; filename?: string }>,
  outputDir: string,
  concurrency = 3,
): Promise<{ downloaded: string[]; failed: string[] }> {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const downloaded: string[] = [];
  const failed: string[] = [];
  const queue = [...resources];

  const worker = async () => {
    while (queue.length > 0) {
      const r = queue.shift()!;
      try {
        const name = r.filename || r.url.split('/').pop()?.split('?')[0] || 'unknown';
        const safeName = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
        const dest = join(outputDir, safeName);

        const res = await fetch(r.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const file = createWriteStream(dest);
        await pipeline(res.body as any, file);

        downloaded.push(dest);
      } catch {
        failed.push(r.url);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { downloaded, failed };
}

// ── Server ──────────────────────────────────────────────────────────────────

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const url = req.url || '/';

  try {
    // Health
    if (req.method === 'GET' && url === '/health') {
      return json(res, { status: 'ok', version: '0.1.0' });
    }

    // Scrape
    if (req.method === 'POST' && url === '/scrape') {
      const body = JSON.parse(await readBody(req));
      const { url: target, types, timeout, proxy, referer } = body;
      if (!target) return json(res, { success: false, error: 'Missing "url"' }, 400);

      const result = await scrapeUrl(target, { types, timeout, proxy, referer });
      return json(res, { success: true, data: result });
    }

    // Download
    if (req.method === 'POST' && url === '/download') {
      const { resources, outputDir, concurrency } = JSON.parse(await readBody(req));
      if (!resources?.length) return json(res, { success: false, error: 'Missing "resources"' }, 400);
      if (!outputDir) return json(res, { success: false, error: 'Missing "outputDir"' }, 400);

      const result = await downloadResources(resources, outputDir, concurrency);
      return json(res, { success: true, data: result });
    }

    json(res, {
      endpoints: {
        'GET /health': 'Health check',
        'POST /scrape': '{"url":"...", "types":["image","video"], "timeout":30000}',
        'POST /download': '{"resources":[{"url":"..."}], "outputDir":"...", "concurrency":3}',
      },
    }, 404);
  } catch (err) {
    json(res, { success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[media-scraper] HTTP API on http://${HOST}:${PORT}`);
  console.log(`  POST /scrape   - extract media from URL`);
  console.log(`  POST /download  - download resources to disk`);
  console.log(`  GET  /health    - health check`);
});
