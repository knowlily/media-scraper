export interface DownloadOptions {
  /** Maximum concurrent downloads (default: 3) */
  concurrency?: number;
  /** Number of retry attempts on failure (default: 3) */
  retries?: number;
  /** Timeout per download in ms (default: 30000) */
  timeout?: number;
  /** Output directory for downloaded files */
  outputDir: string;
  /** Whether to resume partial downloads (default: true) */
  resumePartial?: boolean;
  /** Rate limit in bytes per second (optional) */
  rateLimit?: number;
  /** Progress callback */
  onProgress?: (progress: DownloadProgress) => void;
  /** Template for filenames (default: "{basename}{ext}") */
  filenameTemplate?: string;
}

export interface DownloadProgress {
  /** Number of downloads completed */
  completed: number;
  /** Total number of downloads */
  total: number;
  /** URL currently being downloaded */
  currentUrl: string;
  /** Bytes downloaded for current file */
  bytesDownloaded: number;
  /** Total bytes for current file (may be 0 if unknown) */
  bytesTotal: number;
  /** Download speed in bytes per second */
  speed: number;
  /** Estimated time remaining in seconds */
  eta: number;
}

export interface FailedDownload {
  url: string;
  reason: string;
}

export interface DownloadResult {
  /** URLs that were successfully downloaded */
  succeeded: string[];
  /** URLs that failed with reasons */
  failed: FailedDownload[];
  /** Total bytes downloaded across all files */
  totalBytes: number;
}

export interface MediaResource {
  url: string;
  filename?: string;
}

export const DEFAULT_OPTIONS: Required<Pick<DownloadOptions, 'concurrency' | 'retries' | 'timeout' | 'resumePartial'>> = {
  concurrency: 3,
  retries: 3,
  timeout: 30000,
  resumePartial: true,
};
