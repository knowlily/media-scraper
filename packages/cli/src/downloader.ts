/**
 * File downloader with concurrency control, resume support, and progress reporting.
 */

import { createWriteStream, existsSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { WriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createReadStream } from 'node:fs';

// ── Types ───────────────────────────────────────────────────────────────

export interface Resource {
  url: string;
  type: string;
  size: number | null;
  filename: string;
}

export interface DownloadOptions {
  /** Output directory */
  outputDir?: string;
  /** Max concurrent downloads (default 5) */
  concurrency?: number;
  /** Resume partial downloads (default true) */
  resume?: boolean;
  /** Request timeout per file in ms (default 60_000) */
  timeout?: number;
  /** Custom headers */
  headers?: Record<string, string>;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Robots.txt cache: domain → { allowedPaths, crawlDelay, cachedAt } */
const robotsCache = new Map<
  string,
  { allowedPaths: string[]; disallowedPaths: string[]; crawlDelay: number; cachedAt: number }
>();
const ROBOTS_CACHE_TTL = 3_600_000; // 1 hour

/**
 * Fetch and parse robots.txt for a given domain (cached for 1 hour).
 */
async function getRobotsPolicy(domain: string): Promise<{
  allowedPaths: string[];
  disallowedPaths: string[];
  crawlDelay: number;
}> {
  const cached = robotsCache.get(domain);
  if (cached && Date.now() - cached.cachedAt < ROBOTS_CACHE_TTL) {
    return cached;
  }

  const policy = { allowedPaths: ['/'], disallowedPaths: [], crawlDelay: 0 };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(`https://${domain}/robots.txt`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const text = await resp.text();
      let currentAgent = false;
      for (const line of text.split('\n')) {
        const trimmed = line.trim().toLowerCase();
        if (trimmed.startsWith('user-agent:')) {
          const agent = trimmed.slice('user-agent:'.length).trim();
          currentAgent = agent === '*' || agent === 'media-scraper';
        } else if (currentAgent) {
          if (trimmed.startsWith('disallow:')) {
            policy.disallowedPaths.push(trimmed.slice('disallow:'.length).trim());
          } else if (trimmed.startsWith('allow:')) {
            policy.allowedPaths.push(trimmed.slice('allow:'.length).trim());
          } else if (trimmed.startsWith('crawl-delay:')) {
            policy.crawlDelay = parseFloat(trimmed.slice('crawl-delay:'.length).trim()) || 0;
          }
        }
      }
    }
  } catch {
    // If robots.txt fetch fails, allow everything
  }

  robotsCache.set(domain, { ...policy, cachedAt: Date.now() });
  return policy;
}

/**
 * Check whether a URL path is allowed by robots.txt.
 */
async function isAllowedByRobots(url: string): Promise<boolean> {
  try {
    const { hostname, pathname } = new URL(url);
    const policy = await getRobotsPolicy(hostname);
    for (const disallowed of policy.disallowedPaths) {
      if (disallowed && pathname.startsWith(disallowed)) {
        return false;
      }
    }
    return true;
  } catch {
    return true; // Allow if URL parsing fails
  }
}

/**
 * Sanitize a filename: remove dangerous characters, limit length.
 * Mirrors @media-scraper/core's sanitizeFilename.
 */
function sanitizeFilename(name: string): string {
  return name
    // Replace path separators
    .replace(/[/\\]/g, '_')
    // Replace control characters and other unsafe chars
    .replace(/[\x00-\x1f\x7f<>:"|?*]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, '_')
    // Trim dots and whitespace from ends
    .replace(/^[.\s]+|[.\s]+$/g, '')
    // Limit length (leave room for extension)
    .slice(0, 200)
    // Ensure non-empty
    || 'unnamed';
}

/** Format bytes to human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ── Download single file ────────────────────────────────────────────────

/**
 * Download a single file with progress reporting and resume support.
 * Uses `.part` temp file; renames to final name on completion.
 */
export async function downloadFile(
  url: string,
  dest: string,
  options: DownloadOptions = {},
): Promise<{ path: string; size: number }> {
  const timeout = options.timeout ?? 60_000;
  const resume = options.resume ?? true;
  const partPath = dest + '.part';

  // ── Check robots.txt ───────────────────────────────────────────────
  if (!(await isAllowedByRobots(url))) {
    throw new Error(`Blocked by robots.txt: ${url}`);
  }

  // ── Determine if we can resume ─────────────────────────────────────
  let existingBytes = 0;
  if (resume && existsSync(partPath)) {
    existingBytes = statSync(partPath).size;
  }

  // ── Fetch with optional Range header ───────────────────────────────
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {
    'User-Agent': 'media-scraper/0.1',
    ...(options.headers ?? {}),
  };

  if (existingBytes > 0) {
    headers['Range'] = `bytes=${existingBytes}-`;
  }

  let response: Response;
  try {
    response = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok && response.status !== 206) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const contentLength = response.headers.get('content-length');
  const totalSize =
    response.status === 206
      ? existingBytes + (contentLength ? parseInt(contentLength, 10) : 0)
      : contentLength
        ? parseInt(contentLength, 10)
        : null;

  // ── Stream to file ─────────────────────────────────────────────────
  const body = response.body;
  if (!body) {
    throw new Error(`No response body for ${url}`);
  }

  const writeStream: WriteStream = createWriteStream(partPath, {
    flags: existingBytes > 0 ? 'a' : 'w',
  });

  let downloaded = existingBytes;
  const startTime = Date.now();

  // Progress reporting via reader
  const reader = body.getReader();
  const pump = async (): Promise<void> => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.byteLength;
      writeStream.write(Buffer.from(value));

      // Report progress every 500ms
      if (Date.now() - startTime > 500 || done) {
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = downloaded / elapsed;
        const pct = totalSize ? ((downloaded / totalSize) * 100).toFixed(1) : '?';
        process.stderr.write(
          `\r  [download] ${sanitizeFilename(url.split('/').pop() ?? 'file')}  ${pct}%  ${formatBytes(downloaded)}${totalSize ? ` / ${formatBytes(totalSize)}` : ''}  ${formatBytes(speed)}/s    `,
        );
      }
    }
  };

  try {
    await pump();
    writeStream.end();
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // ── Rename .part → final ─────────────────────────────────────────
    const { renameSync } = await import('node:fs');
    renameSync(partPath, dest);

    const finalSize = statSync(dest).size;
    process.stderr.write(`\r  [done] ${dest}  ${formatBytes(finalSize)}\n`);

    return { path: dest, size: finalSize };
  } catch (err) {
    writeStream.destroy();
    // Keep .part file for resume on next run
    throw err;
  }
}

// ── Batch download ──────────────────────────────────────────────────────

/**
 * Download a batch of resources with concurrency control.
 * Large files (>50 MB) are downloaded serially to avoid bandwidth contention.
 */
export async function downloadBatch(
  resources: Resource[],
  outputDir: string,
  concurrency: number = 5,
  options: DownloadOptions = {},
): Promise<string[]> {
  // ── Ensure output directory exists ─────────────────────────────────
  mkdirSync(outputDir, { recursive: true });

  if (resources.length === 0) {
    process.stderr.write('[info] No resources to download\n');
    return [];
  }

  // ── Partition: large files (>50 MB) → serial queue ─────────────────
  const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50 MB
  const smallFiles: Resource[] = [];
  const largeFiles: Resource[] = [];

  for (const r of resources) {
    if (r.size !== null && r.size > LARGE_FILE_THRESHOLD) {
      largeFiles.push(r);
    } else {
      smallFiles.push(r);
    }
  }

  process.stderr.write(
    `[info] Downloading ${resources.length} file(s) → ${outputDir}\n` +
    `       Concurrency: ${concurrency}  |  Large files (>50MB, serial): ${largeFiles.length}\n`,
  );

  const downloaded: string[] = [];

  // ── Worker for concurrent downloads ────────────────────────────────
  const smallQueue = [...smallFiles];

  const worker = async () => {
    while (smallQueue.length > 0) {
      const resource = smallQueue.shift()!;
      const safeName = sanitizeFilename(resource.filename);
      const dest = join(outputDir, safeName);

      try {
        const result = await downloadFile(resource.url, dest, options);
        downloaded.push(result.path);
      } catch (err) {
        process.stderr.write(
          `[ERROR] Failed to download ${resource.url}: ${String(err)}\n`,
        );
      }
    }
  };

  // ── Run workers ────────────────────────────────────────────────────
  const effectiveConcurrency = Math.min(concurrency, smallQueue.length);
  const workers = Array.from({ length: effectiveConcurrency }, () => worker());
  await Promise.all(workers);

  // ── Download large files serially ──────────────────────────────────
  for (const resource of largeFiles) {
    const safeName = sanitizeFilename(resource.filename);
    const dest = join(outputDir, safeName);
    try {
      const result = await downloadFile(resource.url, dest, options);
      downloaded.push(result.path);
    } catch (err) {
      process.stderr.write(
        `[ERROR] Failed to download large file ${resource.url}: ${String(err)}\n`,
      );
    }
  }

  const totalSize = downloaded.reduce((sum, p) => {
    try {
      return sum + statSync(p).size;
    } catch {
      return sum;
    }
  }, 0);

  process.stderr.write(
    `\n[done] Downloaded ${downloaded.length}/${resources.length} file(s) — ${formatBytes(totalSize)}\n`,
  );

  return downloaded;
}
