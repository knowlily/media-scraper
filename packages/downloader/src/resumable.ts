import * as fs from 'node:fs';
import * as path from 'node:path';
import * as stream from 'node:stream';
import { DownloadOptions, DownloadResult, DEFAULT_OPTIONS } from './types.js';
import { downloadSingle } from './downloader.js';

/**
 * Download with resume support.
 * Checks if server supports Range requests, and if a partial file exists locally,
 * resumes from where it left off. Otherwise, does a full download.
 */
export async function resumableDownload(
  url: string,
  destPath: string,
  options: DownloadOptions
): Promise<DownloadResult> {
  const resumePartial = options.resumePartial ?? DEFAULT_OPTIONS.resumePartial;
  const timeout = options.timeout ?? DEFAULT_OPTIONS.timeout;

  // If the file already exists and is complete (we can't verify server-side),
  // skip. We'll check via HEAD for content-length if possible.
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let offset = 0;
  let supportsRange = false;
  let contentLength = 0;

  if (resumePartial && fs.existsSync(destPath)) {
    const stat = fs.statSync(destPath);
    offset = stat.size;
  }

  try {
    const headController = new AbortController();
    const headTimeoutId = setTimeout(() => headController.abort(), 10000);
    const headResponse = await fetch(url, {
      method: 'HEAD',
      signal: headController.signal,
    });
    clearTimeout(headTimeoutId);

    if (headResponse.ok) {
      const acceptRanges = headResponse.headers.get('accept-ranges');
      supportsRange = acceptRanges === 'bytes';

      const cl = headResponse.headers.get('content-length');
      if (cl) {
        contentLength = parseInt(cl, 10);
      }

      // If file already complete, skip
      if (contentLength > 0 && offset >= contentLength) {
        return {
          succeeded: [url],
          failed: [],
          totalBytes: offset,
        };
      }
    }
  } catch {
    // HEAD failed, try full download
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const headers: Record<string, string> = {};

    if (supportsRange && offset > 0) {
      headers['Range'] = `bytes=${offset}-`;
    }

    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok && response.status !== 206) {
      // If Range request failed, retry without range
      if (offset > 0) {
        offset = 0;
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        // Recursive call without range
        clearTimeout(timeoutId);
        return downloadSingle(url, destPath, {
          ...options,
          resumePartial: false,
        });
      }
      return {
        succeeded: [],
        failed: [{ url, reason: `HTTP ${response.status}: ${response.statusText}` }],
        totalBytes: 0,
      };
    }

    if (!response.body) {
      return {
        succeeded: [],
        failed: [{ url, reason: 'No response body' }],
        totalBytes: 0,
      };
    }

    const flags = offset > 0 && supportsRange ? 'a' : 'w';
    const fileStream = fs.createWriteStream(destPath, { flags });

    const reader = response.body.getReader();
    const fileWriter = stream.Writable.toWeb(fileStream).getWriter();
    let downloaded = 0;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await fileWriter.write(value);
        downloaded += value.byteLength;
      }
      await fileWriter.close();
    } catch (err: any) {
      fileStream.destroy();
      throw err;
    }

    clearTimeout(timeoutId);

    return {
      succeeded: [url],
      failed: [],
      totalBytes: offset + downloaded,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return {
      succeeded: [],
      failed: [{ url, reason: err.name === 'AbortError' ? 'Timeout' : err.message }],
      totalBytes: 0,
    };
  }
}
