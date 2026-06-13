#!/usr/bin/env node
/**
 * Media Scraper CLI — extract media from URLs via command line.
 *
 * Commands:
 *   media-scraper scrape <url>     Scrape a single URL, output JSON to stdout
 *   media-scraper download <url>   Scrape + download files to output dir
 *   media-scraper batch <file>     Read URLs from file, scrape each
 */

import { Command } from 'commander';
import { scrapeCommand, downloadCommand, batchCommand } from './commands.js';

const program = new Command();

program
  .name('media-scraper')
  .description('Extract media resources (images, videos, audio, documents) from web pages')
  .version('0.1.0');

// ── Shared options applied to all commands ──────────────────────────────
function sharedOptions(cmd: Command): Command {
  return cmd
    .option('-o, --output <dir>', 'Output directory for downloads / results', './media-scraper-output')
    .option('--types <types>', 'Media types to scrape (comma-separated: image,video,audio,doc)', 'image,video,audio,doc')
    .option('--min-size <bytes>', 'Minimum file size in bytes to include', parseInt)
    .option('--max-pages <n>', 'Maximum pages to crawl (for paginated sites)', parseInt)
    .option('--timeout <ms>', 'Page load timeout in milliseconds', parseInt)
    .option('--proxy <url>', 'Proxy server URL (e.g. http://user:pass@host:port)')
    .option('--user-agent <ua>', 'Custom User-Agent string')
    .option('--concurrency <n>', 'Max concurrent downloads', parseInt)
    .option('--json', 'Output result as JSON to stdout');
}

// ── scrape ──────────────────────────────────────────────────────────────
sharedOptions(
  program
    .command('scrape <url>')
    .description('Scrape a single URL and output results')
)
  .action(async (url: string, options: Record<string, unknown>) => {
    const result = await scrapeCommand(url, options);
    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  });

// ── download ────────────────────────────────────────────────────────────
sharedOptions(
  program
    .command('download <url>')
    .description('Scrape a URL and download all discovered media')
)
  .action(async (url: string, options: Record<string, unknown>) => {
    const result = await downloadCommand(url, options);
    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  });

// ── batch ───────────────────────────────────────────────────────────────
sharedOptions(
  program
    .command('batch <file>')
    .description('Read URLs from a file (one per line) and scrape each')
)
  .action(async (file: string, options: Record<string, unknown>) => {
    const results = await batchCommand(file, options);
    if (options.json) {
      process.stdout.write(JSON.stringify(results, null, 2) + '\n');
    }
  });

// Only parse when executed directly (not when imported for testing)
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('index.ts'));

if (isDirectExecution) {
  program.parse();
}
