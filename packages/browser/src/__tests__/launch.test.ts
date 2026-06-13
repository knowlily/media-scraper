// ---------------------------------------------------------------------------
// Tests for launch() parameter validation (T-BROWSER-06)
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { launch } from '../launch.js';

describe('launch() parameter validation', () => {
  it('should throw on empty proxy server', async () => {
    await expect(
      launch({ proxy: { server: '' } }),
    ).rejects.toThrow('proxy.server must be a non‑empty string');
  });

  it('should throw on invalid proxy URL (no scheme)', async () => {
    await expect(
      launch({ proxy: { server: '192.168.1.1:8080' } }),
    ).rejects.toThrow('invalid proxy server');
    await expect(
      launch({ proxy: { server: '192.168.1.1:8080' } }),
    ).rejects.toThrow('must be a URL like http://host:port');
  });

  it('should throw on invalid proxy URL (just a hostname)', async () => {
    await expect(
      launch({ proxy: { server: 'proxy.example.com' } }),
    ).rejects.toThrow('invalid proxy server');
  });

  it('should accept a valid http:// proxy URL', async () => {
    // This test does NOT actually start a browser because we expect
    // Chromium launch to fail (no display / missing browser binary
    // in CI).  The important thing is that the proxy validation
    // passes — we assert that the error is about the browser, not
    // the proxy.
    try {
      await launch({ proxy: { server: 'http://localhost:9999' }, headless: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Must NOT mention "invalid proxy"
      expect(msg).not.toMatch(/invalid proxy/i);
      expect(msg).not.toMatch(/proxy\.server must be/i);
    }
  });
});
