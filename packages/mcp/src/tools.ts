import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ── Types imported from core ──────────────────────────────────────────────
import type {
  MediaResource,
  ScrapeResult,
} from "@media-scraper/core";

// ── V2: Streaming scrape from core ────────────────────────────────────────
import { scrapeStream } from "@media-scraper/core";
import type { StreamYield } from "@media-scraper/core";

// ── V2: StealthBrowser from browser package ───────────────────────────────
import { launch } from "@media-scraper/browser";

// ── V2: DownloadManager from downloader package ───────────────────────────
import { DownloadManager } from "@media-scraper/downloader";
import type { DownloadResult as DMResult, MediaResource as DMResource } from "@media-scraper/downloader";

// ── DOM parser for scrapeStream ───────────────────────────────────────────
import { JSDOM } from "jsdom";
import type { DocumentLike } from "@media-scraper/core";

// ── Re-export for convenience ──────────────────────────────────────────────
export type { MediaResource, ScrapeResult };

// ── Download result type (local) ────────────────────────────────────────────
export interface DownloadResult {
  downloaded: string[];
  failed: string[];
}

// ── Parameter Schemas ──────────────────────────────────────────────────────

const ScrapeMediaSchema = z.object({
  url: z
    .string()
    .url("Invalid URL format")
    .describe("The web page URL to scrape media from"),
  types: z
    .array(z.enum(["image", "video", "audio", "document"]))
    .optional()
    .describe(
      "Filter by media types. If omitted, all types are scraped."
    ),
  minSize: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Minimum file size in bytes. Smaller resources are filtered out."
    ),
  maxPages: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(
      "Maximum number of pages to crawl for multi-page galleries (default: 1)"
    ),
  timeout: z
    .number()
    .int()
    .min(1000)
    .max(120000)
    .optional()
    .describe(
      "Timeout in milliseconds for the scrape operation (default: 30000)"
    ),
});

const DownloadMediaSchema = z.object({
  resources: z
    .array(
      z.object({
        url: z.string().url("Invalid resource URL"),
        type: z
          .enum(["image", "video", "audio", "document"])
          .optional(),
        filename: z.string().optional(),
      })
    )
    .min(1, "At least one resource is required")
    .describe("Array of media resources to download"),
  outputDir: z
    .string()
    .min(1, "outputDir must not be empty")
    .describe("Local directory to save downloaded files"),
  concurrency: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Number of concurrent downloads (default: 3)"),
  organizeByType: z
    .boolean()
    .optional()
    .describe(
      "Organize downloads into subdirectories by media type (default: false)"
    ),
});

// ── Progress helper ────────────────────────────────────────────────────────

function notify(server: McpServer, message: string, extra?: { sessionId?: string }) {
  server
    .sendLoggingMessage(
      { level: "info", data: `[media-scraper] ${message}` },
      extra?.sessionId
    )
    .catch(() => {
      console.error(`[media-scraper] ${message}`);
    });
}

// ── V2: Scrape Engine (StealthBrowser + scrapeStream) ──────────────────────

async function scrapeUrl(url: string, opts?: {
  types?: string[];
  minSize?: number;
  maxPages?: number;
  timeout?: number;
}): Promise<ScrapeResult> {
  const browser = await launch({ headless: true, userAgent: "pool" });
  const startTime = Date.now();

  try {
    const page = await browser.newPage();
    await page.goto(url, {
      timeout: opts?.timeout ?? 30000,
      waitUntil: "domcontentloaded",
    });

    // Lazy-load scroll
    await page.scrollToTriggerLazy();

    // Get page content
    const html = await page.content();
    const title = await page.raw.title();

    // Parse HTML into DocumentLike using jsdom
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document as unknown as DocumentLike;

    // Stream scrape
    const errors: import("@media-scraper/core").ScrapeError[] = [];
    let allResources: MediaResource[] = [];

    let domNodeCount = 0;
    try {
      domNodeCount = doc.querySelectorAll("*").length;
    } catch {
      // ignore
    }

    for await (const frame of scrapeStream(doc, url)) {
      allResources = frame.cumulative;
      errors.push(...frame.errors);
    }

    // Categorize from the final cumulative
    const images: MediaResource[] = [];
    const videos: MediaResource[] = [];
    const audio: MediaResource[] = [];
    const documents: MediaResource[] = [];

    const keep = opts?.types?.length ? new Set(opts.types) : null;

    for (const r of allResources) {
      if (keep && !keep.has(r.type)) continue;
      if (opts?.minSize && r.size > 0 && r.size < opts.minSize) continue;

      switch (r.type) {
        case "image": images.push(r); break;
        case "video": videos.push(r); break;
        case "audio": audio.push(r); break;
        case "document": documents.push(r); break;
        default: images.push(r); break;
      }
    }

    const total = images.length + videos.length + audio.length + documents.length;
    const duration = Date.now() - startTime;

    return {
      url,
      title,
      total,
      images,
      videos,
      audio,
      documents,
      warnings: [],
      duration,
      timestamp: new Date().toISOString(),
      errors,
      partial: errors.length > 0,
      stats: {
        durationMs: duration,
        domNodeCount,
        deduplicatedCount: 0,
        filteredCount: 0,
      },
    };
  } finally {
    await browser.close();
  }
}

// ── V2: Download Engine (DownloadManager) ───────────────────────────────────

async function downloadResources(
  resources: Array<{ url: string; filename?: string }>,
  outputDir: string,
  concurrency = 3,
  onProgress?: (current: number, total: number, file: string) => void,
): Promise<DownloadResult> {
  const dmResources: DMResource[] = resources.map((r) => ({
    url: r.url,
    filename: r.filename,
  }));

  const manager = new DownloadManager({
    outputDir,
    concurrency,
    onProgress: (progress) => {
      onProgress?.(progress.completed, progress.total, progress.currentUrl);
    },
  });

  const result: DMResult = await manager.downloadAll(dmResources);

  return {
    downloaded: result.succeeded,
    failed: result.failed.map((f) => f.url),
  };
}

// ── Tool registration ──────────────────────────────────────────────────────

export function registerTools(server: McpServer): void {
  // ── scrape_media ───────────────────────────────────────────────────────
  server.tool(
    "scrape_media",
    "Extract all media resources (images, videos, audio, documents) from a web page URL",
    ScrapeMediaSchema.shape,
    async (params, extra) => {
      // ---------- input validation ----------
      const parsed = ScrapeMediaSchema.safeParse(params);
      if (!parsed.success) {
        const errors = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Input validation failed: ${errors}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const { url, types, minSize, maxPages, timeout } = parsed.data;

      // ---------- progress ----------
      notify(
        server,
        `Starting media scrape for ${url}${types ? ` (types: ${types.join(",")})` : ""}`,
        extra
      );

      // ---------- scrape via StealthBrowser + scrapeStream ----------
      try {
        notify(server, `Scraping in progress…`, extra);

        const result: ScrapeResult = await scrapeUrl(url, {
          types,
          minSize,
          maxPages,
          timeout,
        });

        notify(
          server,
          `Scrape complete — found ${result.total} resources`,
          extra
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { success: true, data: result },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Scrape failed: ${message}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── download_media ─────────────────────────────────────────────────────
  server.tool(
    "download_media",
    "Download specified media resources to local directory",
    DownloadMediaSchema.shape,
    async (params, extra) => {
      // ---------- input validation ----------
      const parsed = DownloadMediaSchema.safeParse(params);
      if (!parsed.success) {
        const errors = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Input validation failed: ${errors}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const { resources, outputDir, concurrency, organizeByType } =
        parsed.data;

      // ---------- progress ----------
      notify(
        server,
        `Downloading ${resources.length} resource(s) to ${outputDir}`,
        extra
      );

      // ---------- download via DownloadManager ----------
      try {
        notify(
          server,
          `Download in progress (concurrency: ${concurrency ?? 3})…`,
          extra
        );

        const result: DownloadResult = await downloadResources(
          resources,
          outputDir,
          concurrency ?? 3,
          (current: number, total: number, file: string) => {
            notify(
              server,
              `[${current}/${total}] Downloaded: ${file}`,
              extra
            );
          },
        );

        notify(server, `Download complete`, extra);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { success: true, data: result },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Download failed: ${message}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
