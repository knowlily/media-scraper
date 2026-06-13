// ---------------------------------------------------------------------------
// Tests for User-Agent pool
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { UserAgentPool, DEFAULT_USER_AGENTS } from '../ua-pool.js';

describe('DEFAULT_USER_AGENTS', () => {
  it('should have exactly 20 entries', () => {
    expect(DEFAULT_USER_AGENTS.length).toBe(20);
  });

  it('should all be non‑empty strings', () => {
    for (const ua of DEFAULT_USER_AGENTS) {
      expect(typeof ua).toBe('string');
      expect(ua.length).toBeGreaterThan(50);
    }
  });

  it('should contain Chrome, Edge, and Firefox UAs', () => {
    const all = DEFAULT_USER_AGENTS.join('\n');
    expect(all).toMatch(/Chrome/);
    expect(all).toMatch(/Edg\//);
    expect(all).toMatch(/Firefox/);
  });
});

describe('UserAgentPool', () => {
  it('should expose all 20 UAs', () => {
    const pool = new UserAgentPool();
    expect(pool.all.length).toBe(20);
  });

  it('getRandom() should return a non‑empty string from the pool', () => {
    const pool = new UserAgentPool();
    for (let i = 0; i < 50; i++) {
      const ua = pool.getRandom();
      expect(typeof ua).toBe('string');
      expect(ua.length).toBeGreaterThan(50);
      expect(pool.all).toContain(ua);
    }
  });

  it('getNext() should return UAs in round‑robin order', () => {
    const pool = new UserAgentPool();
    const first = pool.getNext();
    const second = pool.getNext();
    const third = pool.getNext();

    expect(first).toBe(pool.all[0]);
    expect(second).toBe(pool.all[1]);
    expect(third).toBe(pool.all[2]);
  });

  it('getNext() should wrap around after exhausting the pool', () => {
    const pool = new UserAgentPool();
    // Consume all 20
    for (let i = 0; i < 20; i++) {
      pool.getNext();
    }
    // 21st call should return index 0 again
    const wrapped = pool.getNext();
    expect(wrapped).toBe(pool.all[0]);
  });

  it('should work with a custom agent list', () => {
    const custom = ['UA-A', 'UA-B', 'UA-C'];
    const pool = new UserAgentPool(custom);
    expect(pool.all).toEqual(custom);
    expect(pool.all.length).toBe(3);

    expect(pool.getNext()).toBe('UA-A');
    expect(pool.getNext()).toBe('UA-B');

    const r = pool.getRandom();
    expect(custom).toContain(r);
  });
});
