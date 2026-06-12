import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ── Types imported from core (skeleton — will be filled in) ─────────────────
import type {
  MediaResource,
  ScrapeResult,
  DownloadResult,
} from "@media-scraper/core";

// ── Re-export for convenience ──────────────────────────────────────────────
export type { MediaResource, ScrapeResult, DownloadResult };

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
  // Report progress via server logging — appears as notifications to the client.
  // Falls back to stderr so the message is at least visible in server logs.
  server
    .sendLoggingMessage(
      { level: "info", data: `[media-scraper] ${message}` },
      extra?.sessionId
    )
    .catch(() => {
      // Best-effort: don't let logging failure crash the handler
      console.error(`[media-scraper] ${message}`);
    });
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

      // ---------- call CLI ----------
      try {
        const { scrapeMedia } = await import("@media-scraper/cli");

        notify(server, `Scraping in progress…`, extra);

        const result: ScrapeResult = await scrapeMedia(url, {
          types,
          minSize,
          maxPages,
          timeout,
        });

        notify(
          server,
          `Scrape complete — found ${result.resources?.length ?? 0} resources`,
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

      // ---------- call CLI ----------
      try {
        const { downloadMedia } = await import("@media-scraper/cli");

        notify(
          server,
          `Download in progress (concurrency: ${concurrency ?? 3})…`,
          extra
        );

        const result: DownloadResult = await downloadMedia(
          resources as MediaResource[],
          outputDir,
          {
            concurrency,
            organizeByType,
            onProgress: (current: number, total: number, file: string) => {
              notify(
                server,
                `[${current}/${total}] Downloaded: ${file}`,
                extra
              );
            },
          }
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
