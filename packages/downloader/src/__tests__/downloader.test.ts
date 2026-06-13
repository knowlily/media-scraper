import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { downloadSingle } from '../downloader.js';
import { resumableDownload } from '../resumable.js';
import { ConcurrencyQueue } from '../concurrency-queue.js';
import { DownloadManager, safeFilename } from '../download-manager.js';
import type { DownloadOptions, DownloadProgress, MediaResource } from '../types.js';

const tmpDir = path.join(os.tmpdir(), 'media-scraper-downloader-test-' + Date.now());

// Helper: create a simple HTTP server on a random available port, return server + port
function createTestServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<{ server: http.Server; port: number; url: (p: string) => string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        resolve({
          server,
          port,
          url: (p: string) => `http://127.0.0.1:${port}${p}`,
        });
      } else {
        reject(new Error('Failed to get server address'));
      }
    });
    server.on('error', reject);
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

beforeAll(() => {
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
});

afterAll(() => {
  // Clean up temp dir
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================
// T-DOWNLOADER-02: Basic downloadSingle tests
// ============================================================
describe('T-DOWNLOADER-02: downloadSingle', () => {
  it('should download a file successfully', async () => {
    const { server, url } = await createTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Hello, World!');
    });

    try {
      const destPath = path.join(tmpDir, 'hello.txt');
      const result = await downloadSingle(url('/hello'), destPath, {
        outputDir: tmpDir,
        timeout: 5000,
      });

      expect(result.succeeded).toEqual([url('/hello')]);
      expect(result.failed).toHaveLength(0);
      expect(result.totalBytes).toBe(13);
      expect(fs.existsSync(destPath)).toBe(true);
      expect(fs.readFileSync(destPath, 'utf-8')).toBe('Hello, World!');
    } finally {
      await closeServer(server);
    }
  });

  it('should auto-create output directory', async () => {
    const subDir = path.join(tmpDir, 'subdir', 'nested');
    const { server, url } = await createTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('test');
    });

    try {
      const destPath = path.join(subDir, 'file.txt');
      const result = await downloadSingle(url('/auto-dir'), destPath, {
        outputDir: subDir,
        timeout: 5000,
      });

      expect(result.succeeded).toHaveLength(1);
      expect(fs.existsSync(destPath)).toBe(true);
    } finally {
      await closeServer(server);
    }
  });

  it('should handle timeout', async () => {
    const { server, url } = await createTestServer((_req, res) => {
      // Never respond
      setTimeout(() => {
        res.writeHead(200);
        res.end('late');
      }, 10000);
    });

    try {
      const destPath = path.join(tmpDir, 'timeout.txt');
      const result = await downloadSingle(url('/timeout'), destPath, {
        outputDir: tmpDir,
        timeout: 500,
      });

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].reason).toContain('Timeout');
    } finally {
      await closeServer(server);
    }
  });

  it('should handle 404 response', async () => {
    const { server, url } = await createTestServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    try {
      const destPath = path.join(tmpDir, 'notfound.txt');
      const result = await downloadSingle(url('/notfound'), destPath, {
        outputDir: tmpDir,
        timeout: 5000,
      });

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].reason).toContain('HTTP 404');
    } finally {
      await closeServer(server);
    }
  });
});

// ============================================================
// T-DOWNLOADER-03: Resumable download tests
// ============================================================
describe('T-DOWNLOADER-03: resumableDownload', () => {
  it('should download a file (full download when no partial)', async () => {
    const { server, url } = await createTestServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Accept-Ranges': 'bytes',
        'Content-Length': '20',
      });
      res.end('A'.repeat(20));
    });

    try {
      const destPath = path.join(tmpDir, 'full.txt');
      const result = await resumableDownload(url('/full'), destPath, {
        outputDir: tmpDir,
        timeout: 5000,
      });

      expect(result.succeeded).toHaveLength(1);
      expect(result.totalBytes).toBe(20);
      expect(fs.existsSync(destPath)).toBe(true);
    } finally {
      await closeServer(server);
    }
  });

  it('should skip if file already complete', async () => {
    const destPath = path.join(tmpDir, 'skip.txt');
    fs.writeFileSync(destPath, 'A'.repeat(100));

    const { server, url } = await createTestServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Accept-Ranges': 'bytes',
        'Content-Length': '100',
      });
      res.end('A'.repeat(100));
    });

    try {
      const result = await resumableDownload(url('/skip'), destPath, {
        outputDir: tmpDir,
        timeout: 5000,
      });

      expect(result.succeeded).toHaveLength(1);
    } finally {
      await closeServer(server);
    }
  });

  it('should resume partial download', async () => {
    const fullContent = 'A'.repeat(1000) + 'B'.repeat(1000);
    const destPath = path.join(tmpDir, 'resume.txt');

    // Pre-create partial file: first 1000 bytes
    fs.writeFileSync(destPath, 'A'.repeat(1000));

    let gotRange = false;
    const { server, url } = await createTestServer((req, res) => {
      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Accept-Ranges': 'bytes',
          'Content-Length': String(fullContent.length),
        });
        res.end();
      } else {
        const rangeHeader = req.headers['range'];
        if (rangeHeader && rangeHeader === 'bytes=1000-') {
          gotRange = true;
          res.writeHead(206, {
            'Content-Type': 'text/plain',
            'Content-Range': `bytes 1000-1999/2000`,
            'Content-Length': '1000',
          });
          res.end('B'.repeat(1000));
        } else {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(fullContent);
        }
      }
    });

    try {
      const result = await resumableDownload(url('/resume'), destPath, {
        outputDir: tmpDir,
        timeout: 5000,
      });

      expect(result.succeeded).toHaveLength(1);
      expect(gotRange).toBe(true);
      expect(fs.existsSync(destPath)).toBe(true);
      expect(fs.readFileSync(destPath, 'utf-8')).toBe(fullContent);
    } finally {
      await closeServer(server);
    }
  });

  it('should fallback to full download when Range not supported', async () => {
    const destPath = path.join(tmpDir, 'no-range.txt');

    const { server, url } = await createTestServer((req, res) => {
      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Length': '50',
        });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('X'.repeat(50));
      }
    });

    try {
      const result = await resumableDownload(url('/no-range'), destPath, {
        outputDir: tmpDir,
        timeout: 5000,
      });

      expect(result.succeeded).toHaveLength(1);
      expect(fs.readFileSync(destPath, 'utf-8')).toBe('X'.repeat(50));
    } finally {
      await closeServer(server);
    }
  });
});

// ============================================================
// T-DOWNLOADER-04: ConcurrencyQueue tests
// ============================================================
describe('T-DOWNLOADER-04: ConcurrencyQueue', () => {
  it('should run at most N tasks concurrently (concurrency=3)', async () => {
    const queue = new ConcurrencyQueue(3);
    let maxConcurrent = 0;
    let running = 0;

    const tasks = Array.from({ length: 5 }, (_, i) =>
      queue.add(async () => {
        running++;
        maxConcurrent = Math.max(maxConcurrent, running);
        await new Promise((r) => setTimeout(r, 50));
        running--;
        return i;
      })
    );

    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('should run strictly serial when concurrency=1', async () => {
    const queue = new ConcurrencyQueue(1);
    let maxConcurrent = 0;
    let running = 0;

    const tasks = Array.from({ length: 5 }, (_, i) =>
      queue.add(async () => {
        running++;
        maxConcurrent = Math.max(maxConcurrent, running);
        await new Promise((r) => setTimeout(r, 30));
        running--;
        return i;
      })
    );

    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(maxConcurrent).toBe(1);
  });

  it('should not fail other tasks when one fails', async () => {
    const queue = new ConcurrencyQueue(2);

    const tasks = [
      queue.add(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return 1;
      }),
      queue.add(async () => {
        await new Promise((r) => setTimeout(r, 10));
        throw new Error('task failed');
      }),
      queue.add(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return 3;
      }),
    ];

    const settled = await Promise.allSettled(tasks);
    expect(settled[0].status).toBe('fulfilled');
    expect(settled[1].status).toBe('rejected');
    expect(settled[2].status).toBe('fulfilled');
  });

  it('should handle empty queue', () => {
    const queue = new ConcurrencyQueue(3);
    expect(queue).toBeDefined();
  });
});

// ============================================================
// T-DOWNLOADER-05: DownloadManager tests
// ============================================================
describe('T-DOWNLOADER-05: DownloadManager', () => {
  let dmServer: http.Server;
  let dmUrl: (p: string) => string;

  beforeAll(async () => {
    const s = await createTestServer((req, res) => {
      const reqUrl = req.url || '/';
      if (reqUrl === '/success1' || reqUrl === '/success2' || reqUrl === '/success3') {
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '10' });
        res.end('A'.repeat(10));
      } else if (reqUrl === '/fail') {
        res.writeHead(500);
        res.end('Error');
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
    dmServer = s.server;
    dmUrl = s.url;
  });

  afterAll(async () => {
    await closeServer(dmServer);
  });

  it('should download 3 resources successfully', async () => {
    const manager = new DownloadManager({
      outputDir: path.join(tmpDir, 'batch1'),
      timeout: 5000,
      retries: 1,
    });

    const resources: MediaResource[] = [
      { url: dmUrl('/success1'), filename: 's1.txt' },
      { url: dmUrl('/success2'), filename: 's2.txt' },
      { url: dmUrl('/success3'), filename: 's3.txt' },
    ];

    const result = await manager.downloadAll(resources);
    expect(result.succeeded).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
    expect(result.totalBytes).toBe(30);

    for (let i = 0; i < resources.length; i++) {
      const fp = path.join(tmpDir, 'batch1', `s${i + 1}.txt`);
      expect(fs.existsSync(fp)).toBe(true);
    }
  });

  it('should continue when one fails, recording the failure', async () => {
    const manager = new DownloadManager({
      outputDir: path.join(tmpDir, 'batch2'),
      timeout: 5000,
      retries: 1,
    });

    const resources: MediaResource[] = [
      { url: dmUrl('/success1'), filename: 's1.txt' },
      { url: dmUrl('/fail'), filename: 'fail.txt' },
      { url: dmUrl('/success2'), filename: 's2.txt' },
    ];

    const result = await manager.downloadAll(resources);
    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].url).toBe(dmUrl('/fail'));
  });

  it('should call onProgress callback', async () => {
    const progressCalls: DownloadProgress[] = [];
    const manager = new DownloadManager({
      outputDir: path.join(tmpDir, 'batch3'),
      timeout: 5000,
      retries: 1,
      onProgress: (p) => progressCalls.push({ ...p }),
    });

    const resources: MediaResource[] = [
      { url: dmUrl('/success1'), filename: 'p1.txt' },
    ];

    const result = await manager.downloadAll(resources);
    expect(result.succeeded).toHaveLength(1);
    expect(progressCalls.length).toBeGreaterThan(0);

    const lastProgress = progressCalls[progressCalls.length - 1];
    expect(lastProgress.completed).toBe(1);
    expect(lastProgress.total).toBe(1);
  });

  it('should return empty result for empty array', async () => {
    const manager = new DownloadManager({
      outputDir: tmpDir,
    });

    const result = await manager.downloadAll([]);
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.totalBytes).toBe(0);
  });
});

// ============================================================
// T-DOWNLOADER-06: Error handling & exports
// ============================================================
describe('T-DOWNLOADER-06: Error handling', () => {
  it('safeFilename should sanitize path separators and illegal chars', () => {
    expect(safeFilename('hello/world.txt')).not.toContain('/');
    expect(safeFilename('hello\\world.txt')).not.toContain('\\');
    expect(safeFilename('file:name.txt')).not.toContain(':');
    expect(safeFilename('file*name?.txt')).not.toContain('*');
    expect(safeFilename('file"name<>.txt')).not.toContain('"');
    expect(safeFilename('.hidden')).not.toMatch(/^\./);
  });

  it('safeFilename should limit length', () => {
    const longName = 'a'.repeat(300) + '.txt';
    const result = safeFilename(longName);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('safeFilename should handle empty result', () => {
    expect(safeFilename('')).toBe('download');
    expect(safeFilename('.')).toBe('download');
    expect(safeFilename('...')).toBe('download');
  });

  it('should retry on failure with exponential backoff', async () => {
    let attempts = 0;
    const { server, url } = await createTestServer((_req, res) => {
      attempts++;
      if (attempts < 3) {
        res.writeHead(500);
        res.end('Error');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '5' });
        res.end('hello');
      }
    });

    try {
      const manager = new DownloadManager({
        outputDir: path.join(tmpDir, 'retry'),
        timeout: 5000,
        retries: 5,
        concurrency: 1,
      });

      const result = await manager.downloadAll([
        { url: url('/retry'), filename: 'retry.txt' },
      ]);

      expect(result.succeeded).toHaveLength(1);
      expect(attempts).toBe(4); // HEAD + GET for first fail, HEAD + GET for success
    } finally {
      await closeServer(server);
    }
  });

  it('should report failure after all retries exhausted', async () => {
    const { server, url } = await createTestServer((_req, res) => {
      res.writeHead(500);
      res.end('Always fail');
    });

    try {
      const manager = new DownloadManager({
        outputDir: path.join(tmpDir, 'fail-retry'),
        timeout: 5000,
        retries: 2,
        concurrency: 1,
      });

      const result = await manager.downloadAll([
        { url: url('/always-fail'), filename: 'fail.txt' },
      ]);

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].reason).toContain('HTTP 500');
    } finally {
      await closeServer(server);
    }
  });
});
