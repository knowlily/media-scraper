// ---------------------------------------------------------------------------
// Tests for stealth options and injection script
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STEALTH_OPTIONS,
  STEALTH_INJECT_SCRIPT,
} from '../stealth.js';
import type { StealthOptions } from '../stealth.js';

describe('DEFAULT_STEALTH_OPTIONS', () => {
  it('should have all required keys', () => {
    const keys: (keyof StealthOptions)[] = [
      'enabled',
      'hideWebdriver',
      'spoofPlugins',
      'spoofLanguages',
      'randomizeViewport',
      'evadeDetection',
    ];
    for (const key of keys) {
      expect(key in DEFAULT_STEALTH_OPTIONS).toBe(true);
    }
  });

  it('should have enabled = true', () => {
    expect(DEFAULT_STEALTH_OPTIONS.enabled).toBe(true);
  });

  it('should have all values as booleans', () => {
    for (const val of Object.values(DEFAULT_STEALTH_OPTIONS)) {
      expect(typeof val).toBe('boolean');
    }
  });
});

describe('STEALTH_INJECT_SCRIPT', () => {
  it('should be a non‑empty string', () => {
    expect(typeof STEALTH_INJECT_SCRIPT).toBe('string');
    expect(STEALTH_INJECT_SCRIPT.length).toBeGreaterThan(0);
  });

  it('should contain webdriver override', () => {
    expect(STEALTH_INJECT_SCRIPT).toContain('webdriver');
  });

  it('should contain plugins spoof', () => {
    expect(STEALTH_INJECT_SCRIPT).toContain('plugins');
  });

  it('should contain languages spoof', () => {
    expect(STEALTH_INJECT_SCRIPT).toContain('languages');
  });

  it('should contain window.chrome fake', () => {
    expect(STEALTH_INJECT_SCRIPT).toContain('window.chrome');
  });

  it('should contain hardwareConcurrency override', () => {
    expect(STEALTH_INJECT_SCRIPT).toContain('hardwareConcurrency');
  });

  it('should clean __webdriver_evaluate marker', () => {
    expect(STEALTH_INJECT_SCRIPT).toContain('__webdriver_evaluate');
  });

  it('should clean __selenium_evaluate marker', () => {
    expect(STEALTH_INJECT_SCRIPT).toContain('__selenium_evaluate');
  });
});
