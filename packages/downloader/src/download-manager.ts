import * as path from 'node:path';
import { URL } from 'node:url';
import {
  DownloadOptions,
  DownloadProgress,
  DownloadResult,
  MediaResource,
  DEFAULT_OPTIONS,
} from './types.js';
import { resumableDownload } from './resumable.js';
import { ConcurrencyQueue } from './concurrency-queue.js';

/**
 * Safe filename: remove path separators and illegal characters.
 */
export function safeFilename(name: string): string {
  // Remove path separators
  let safe = name.replace(/[/\\:*?"<>|]/g, '_');
  // Remove leading dots (hidden files)
  safe = safe.replace(/^\.+/, '');
  // Limit length
  if (safe.length > 200) {
    const ext = path.extname(safe);
    const base = safe.substring(0, 200 - ext.length);
    safe = base + ext;
  }
  return safe || 'download';
}

/**
 * DownloadManager orchestrates batch downloads with concurrency control,
 * resume support, retry with exponential backoff, and progress reporting.
 */
export class DownloadManager {
  private options: DownloadOptions;
  private queue: ConcurrencyQueue;

  constructor(options: DownloadOptions) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      outputDir: options.outputDir || '.',
    };
    this.queue = new ConcurrencyQueue(this.options.concurrency ?? DEFAULT_OPTIONS.concurrency, this.options.rateLimit);
  }

  /**
   * Download all resources. Returns a result summarizing successes and failures.
   */
  async downloadAll(resources: MediaResource[]): Promise<DownloadResult> {
    if (resources.length === 0) {
      this.reportProgress({ completed: 0, total: 0, currentUrl: '', bytesDownloaded: 0, bytesTotal: 0, speed: 0, eta: 0 });
      return { succeeded: [], failed: [], totalBytes: 0 };
    }

    const succeeded: string[] = [];
    const failed: { url: string; reason: string }[] = [];
    let totalBytes = 0;
    let completed = 0;
    const total = resources.length;

    const retries = this.options.retries ?? DEFAULT_OPTIONS.retries;

    const tasks = resources.map((resource) =>
      this.queue.add(async () => {
        let filename = resource.filename;
        if (!filename) {
          try {
            const urlObj = new URL(resource.url);
            filename = path.basename(urlObj.pathname) || 'download';
          } catch {
            filename = 'download';
          }
        }
        filename = safeFilename(filename);
        const destPath = path.join(this.options.outputDir, filename);

        // Retry with exponential backoff
        let lastError: string = '';
        for (let attempt = 1; attempt <= retries; attempt++) {
          const startTime = Date.now();
          try {
            this.reportProgress({
              completed,
              total,
              currentUrl: resource.url,
              bytesDownloaded: 0,
              bytesTotal: 0,
              speed: 0,
              eta: 0,
            });

            const fileResult = await resumableDownload(resource.url, destPath, this.options);

            if (fileResult.succeeded.length > 0) {
              succeeded.push(...fileResult.succeeded);
              totalBytes += fileResult.totalBytes;
              completed++;
              this.reportProgress({
                completed,
                total,
                currentUrl: resource.url,
                bytesDownloaded: fileResult.totalBytes,
                bytesTotal: fileResult.totalBytes,
                speed: 0,
                eta: 0,
              });
              return;
            } else if (fileResult.failed.length > 0) {
              lastError = fileResult.failed[0].reason;
              throw new Error(lastError);
            }
            // Partial success (shouldn't normally happen)
            return;
          } catch (err: any) {
            lastError = err.message || String(err);
            if (attempt < retries) {
              // Exponential backoff: delay = retryDelay * attempt ms
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
              await new Promise((r) => setTimeout(r, delay));
            }
          }
        }

        completed++;
        failed.push({ url: resource.url, reason: lastError || 'Unknown error' });
        this.reportProgress({
          completed,
          total,
          currentUrl: resource.url,
          bytesDownloaded: 0,
          bytesTotal: 0,
          speed: 0,
          eta: 0,
        });
      })
    );

    await Promise.allSettled(tasks);

    return { succeeded, failed, totalBytes };
  }

  private reportProgress(progress: DownloadProgress): void {
    if (this.options.onProgress) {
      this.options.onProgress(progress);
    }
  }
}
