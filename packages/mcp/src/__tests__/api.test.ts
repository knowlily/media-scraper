import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import * as http from 'node:http';

const BASE_PORT = 13456;

// ── Helper: start the API server on a given port ──────────────────────────
function startServer(port: number): ChildProcess {
  const child = spawn('node', ['dist/api.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: 'pipe',
  });
  return child;
}

// ── Helper: wait for server readiness ─────────────────────────────────────
async function waitForServer(port: number, timeoutMs = 15000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not start')), timeoutMs);
    const check = () => {
      const req = http.request({ hostname: 'localhost', port, path: '/health', method: 'GET' }, (res) => {
        if (res.statusCode === 200) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(check, 300);
        }
      });
      req.on('error', () => setTimeout(check, 300));
      req.end();
    };
    setTimeout(check, 500);
  });
}

// ── Helper: send POST and collect SSE lines ───────────────────────────────
async function collectSSE(
  port: number,
  path: string,
  body: unknown,
  timeoutMs = 30000,
): Promise<{ lines: string[]; status: number; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(data)),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') headers[k] = v;
          else if (Array.isArray(v)) headers[k] = v.join(', ');
        }

        const lines: string[] = [];
        let buffer = '';

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          // Split on SSE newline boundaries
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            // Extract "data: ..." lines
            for (const line of part.split('\n')) {
              if (line.startsWith('data: ')) {
                lines.push(line.slice(6)); // Remove "data: " prefix
              }
            }
          }
        });

        res.on('end', () => {
          // Handle remaining buffer
          if (buffer.trim()) {
            for (const line of buffer.split('\n')) {
              if (line.startsWith('data: ')) {
                lines.push(line.slice(6));
              }
            }
          }
          resolve({ lines, status: res.statusCode || 0, headers });
        });

        res.on('error', reject);
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(data);
    req.end();
  });
}

// ── Helper: single POST request ───────────────────────────────────────────
async function postJson(port: number, path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

describe('/health endpoint', () => {
  let child: ChildProcess;
  const port = BASE_PORT;

  beforeAll(async () => {
    child = startServer(port);
    await waitForServer(port);
  }, 20000);

  afterAll(() => {
    if (child) child.kill();
  });

  it('should return 200 with status ok', async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('version');
  });
});

describe('POST /scrape/stream SSE endpoint', () => {
  let child: ChildProcess;
  const port = BASE_PORT + 1;

  beforeAll(async () => {
    child = startServer(port);
    await waitForServer(port);
  }, 20000);

  afterAll(() => {
    if (child) child.kill();
  });

  it('should return Content-Type: text/event-stream', async () => {
    const { headers, lines } = await collectSSE(port, '/scrape/stream', {
      url: 'https://example.com',
    }, 30000);

    expect(headers['content-type']).toContain('text/event-stream');
  });

  it('should receive at least one data: line in the stream', async () => {
    const { lines } = await collectSSE(port, '/scrape/stream', {
      url: 'https://example.com',
    }, 30000);

    expect(lines.length).toBeGreaterThan(0);
    // At least one should be valid JSON
    const parsed = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } });
    expect(parsed.some((p) => p !== null)).toBe(true);
  });

  it('should include "type":"complete" in the final event', async () => {
    const { lines } = await collectSSE(port, '/scrape/stream', {
      url: 'https://example.com',
    }, 30000);

    const parsed = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

    const completeEvent = parsed.find((p: any) => p.type === 'complete');
    expect(completeEvent).toBeDefined();
    expect(completeEvent).toHaveProperty('total');
    expect(completeEvent).toHaveProperty('url');
  });

  it('should not crash when client disconnects early', async () => {
    // Send request and abort immediately
    const data = JSON.stringify({ url: 'https://example.com' });

    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: '/scrape/stream',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(data)),
        },
      },
      (res) => {
        // Immediately destroy to simulate disconnect
        res.destroy();
      },
    );

    req.write(data);
    req.end();

    // Short delay to let the disconnect propagate
    await new Promise((r) => setTimeout(r, 500));

    // Server should still be accepting connections
    const healthRes = await fetch(`http://localhost:${port}/health`);
    expect(healthRes.status).toBe(200);
  });

  it('should return error for missing url', async () => {
    const res = await fetch(`http://localhost:${port}/scrape/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('url');
  });

  it('should preserve existing POST /scrape (non-streaming)', async () => {
    const res = await fetch(`http://localhost:${port}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data).toHaveProperty('url');
    expect(body.data).toHaveProperty('resources');
  }, 30000);
});
