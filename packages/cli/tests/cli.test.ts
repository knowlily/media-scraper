/**
 * Basic smoke test: verify CLI entry module loads without crashing.
 *
 * Since the CLI depends on Playwright (which requires a browser binary),
 * we load the compiled JS module via dynamic import and confirm the
 * module exports are well-formed.  This catches build-time breakage
 * (missing exports, syntax errors, bad imports) without needing a
 * real browser.
 */
import { describe, it, expect } from 'vitest';

describe('CLI entry (dist/index.js)', () => {
  it('can be loaded without crashing', async () => {
    // Dynamic import – Vitest will resolve the compiled output
    const mod = await import('../dist/index.js');
    expect(mod).toBeDefined();
  });

  it('dist/commands.js exports expected functions', async () => {
    const mod = await import('../dist/commands.js');
    expect(typeof mod.scrapeCommand).toBe('function');
    expect(typeof mod.downloadCommand).toBe('function');
    expect(typeof mod.batchCommand).toBe('function');
  });

  it('dist/downloader.js exports expected functions', async () => {
    const mod = await import('../dist/downloader.js');
    expect(typeof mod.downloadFile).toBe('function');
    expect(typeof mod.downloadBatch).toBe('function');
  });
});
