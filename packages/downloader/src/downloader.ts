import * as fs from 'node:fs';
import * as path from 'node:path';
import * as stream from 'node:stream';
import { DownloadOptions, DownloadResult, DEFAULT_OPTIONS } from './types.js';

/**
 * Download a single file from url to destPath.
 */
export async function downloadSingle(
  url: string,
  destPath: string,
  options: DownloadOptions
): Promise<DownloadResult> {
  const timeout = options.timeout ?? DEFAULT_OPTIONS.timeout;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Ensure output directory exists
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      return {
        succeeded: [],
        failed: [{ url, reason: `HTTP ${response.status}: ${response.statusText}` }],
        totalBytes: 0,
      };
    }

    const fileStream = fs.createWriteStream(destPath);

    if (!response.body) {
      return {
        succeeded: [],
        failed: [{ url, reason: 'No response body' }],
        totalBytes: 0,
      };
    }

    const reader = response.body.getReader();
    const fileWriter = stream.Writable.toWeb(fileStream).getWriter();
    let totalBytes = 0;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await fileWriter.write(value);
        totalBytes += value.byteLength;
      }
      await fileWriter.close();
    } catch (err: any) {
      // Clean up partial file on error
      fileStream.destroy();
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      throw err;
    }

    clearTimeout(timeoutId);

    return {
      succeeded: [url],
      failed: [],
      totalBytes,
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
