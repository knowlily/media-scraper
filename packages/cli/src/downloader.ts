/**
 * File downloader — delegates to @media-scraper/downloader's DownloadManager
 * for resumable downloads, concurrency control, and progress reporting.
 */

import { DownloadManager } from '@media-scraper/downloader';
import type { DownloadProgress } from '@media-scraper/downloader';
import { existsSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

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
  /** Progress callback */
  onProgress?: (progress: DownloadProgress) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Format bytes to human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ── Download single file ────────────────────────────────────────────────

/**
 * Download a single file using DownloadManager (single-resource batch).
 */
export async function downloadFile(
  url: string,
  dest: string,
  options: DownloadOptions = {},
): Promise<{ path: string; size: number }> {
  const dir = dirname(dest);
  const filename = basename(dest);
  mkdirSync(dir, { recursive: true });

  const mgr = new DownloadManager({
    outputDir: dir,
    concurrency: 1,
    timeout: options.timeout ?? 60_000,
    resumePartial: options.resume ?? true,
    onProgress: options.onProgress,
  });

  const result = await mgr.downloadAll([{ url, filename }]);

  if (result.failed.length > 0) {
    throw new Error(`Failed to download ${url}: ${result.failed[0].reason}`);
  }

  const finalPath = join(dir, filename);
  const size = existsSync(finalPath) ? statSync(finalPath).size : result.totalBytes;

  return { path: finalPath, size };
}

// ── Batch download ──────────────────────────────────────────────────────

/**
 * Download a batch of resources with concurrency control via DownloadManager.
 */
export async function downloadBatch(
  resources: Resource[],
  outputDir: string,
  concurrency: number = 5,
  options: DownloadOptions = {},
): Promise<string[]> {
  mkdirSync(outputDir, { recursive: true });

  if (resources.length === 0) {
    process.stderr.write('[info] No resources to download\n');
    return [];
  }

  process.stderr.write(
    `[info] Downloading ${resources.length} file(s) → ${outputDir}\n` +
    `       Concurrency: ${concurrency}\n`,
  );

  const mgr = new DownloadManager({
    outputDir,
    concurrency,
    timeout: options.timeout ?? 60_000,
    resumePartial: options.resume ?? true,
    onProgress: options.onProgress,
  });

  const result = await mgr.downloadAll(
    resources.map((r) => ({ url: r.url, filename: r.filename })),
  );

  // Report failures
  for (const f of result.failed) {
    process.stderr.write(
      `[ERROR] Failed to download ${f.url}: ${f.reason}\n`,
    );
  }

  process.stderr.write(
    `\n[done] Downloaded ${result.succeeded.length}/${resources.length} file(s) — ${formatBytes(result.totalBytes)}\n`,
  );

  return result.succeeded;
}
