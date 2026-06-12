# @media-scraper/core

> 核心媒体提取引擎 — 纯 TypeScript，零 UI 依赖，浏览器和 Node.js 双端运行。

## 安装

```bash
pnpm add @media-scraper/core
```

## 快速开始

```ts
import { scrape } from '@media-scraper/core';

const result = await scrape({
  url: 'https://example.com/gallery',
  types: ['image', 'video'],
  minSize: 100,
});

console.log(result.images.length);  // 图片数量
console.log(result.videos.length);  // 视频数量
```

## API

### `scrape(options)` → `Promise<ScrapeResult>`

主入口，加载页面并提取所有媒体资源。

```ts
interface ScrapeOptions {
  url: string | string[];       // 单个或多个 URL
  types?: MediaType[];           // 过滤类型，默认全部
  minSize?: number;              // 最小图片尺寸（px），默认 0
  maxPages?: number;             // 翻页上限
  exploreDepth?: number;         // 探索深度（缩略图→大图）
  timeout?: number;              // 超时（ms），默认 30000
}
```

### 提取器（独立使用）

每个提取器可独立调用，接收 `DocumentLike` + `baseUrl`：

| 提取器 | 说明 | 提取源 |
|--------|------|--------|
| `extractImages` | 图片 | `<img>` `<picture>` og:image JSON-LD data-src |
| `extractVideos` | 视频 | `<video>` `<source>` `<a>` script(m3u8/mpd) iframe embed 平台CDN |
| `extractAudio` | 音频 | `<audio>` `<source>` `<a>` script(stream) head meta |
| `extractDocuments` | 文档 | `<a>` 指向 PDF/DOCX/ZIP 等 |
| `extractBackgroundImages` | CSS 背景图 | CSSOM 规则 `background-image` |
| `extractIframeMedia` | iframe 内嵌 | 同源 `<iframe>` 递归提取 |
| `extractShadowDomMedia` | Shadow DOM | `shadowRoot` 遍历 |

```ts
import { extractImages } from '@media-scraper/core';
const images = extractImages(documentLike, 'https://example.com');
```

### 过滤器

| 函数 | 说明 |
|------|------|
| `deduplicate(resources)` | URL 精确去重 |
| `filterByType(resources, type)` | 按类型过滤 |
| `filterBySize(resources, minPx)` | 最小尺寸过滤 |
| `filterByDomain(resources, domain)` | 域名过滤 |
| `sanitizeFilename(name)` | 文件名清理（移除非法字符） |

### 工具函数

| 函数 | 说明 |
|------|------|
| `generateId()` | 生成唯一 ID |
| `extractFilename(url)` | 从 URL 提取文件名 |
| `getExtension(url)` | 获取扩展名（含点，如 `.mp4`） |
| `isMediaUrl(url)` | 根据扩展名推断媒体类型 |

## 核心类型

```ts
type MediaType = 'image' | 'video' | 'audio' | 'document' | 'unknown';

interface MediaResource {
  id: string;
  url: string;
  type: MediaType;
  filename: string;
  extension: string;
  size: number;
  width: number | null;
  height: number | null;
  thumbnail: string;
  source: 'img' | 'video' | 'audio' | 'background' | 'link' | 'lazy-load'
        | 'iframe' | 'shadow-dom' | 'head-meta' | 'm3u8' | 'mpd';
}
```

## 同构边界

`packages/core/` 不依赖 `fs`/`path`/`process` 等 Node API，可在浏览器和 Node.js 双端运行。平台特定能力（文件下载、DOM 访问、网络请求）由上层包注入。

## 开发

```bash
pnpm build        # tsc 构建
pnpm test         # vitest 测试
pnpm typecheck    # 类型检查
```

## 嵌入其他项目

### 方式一：pnpm workspace（推荐，同 monorepo）

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - '../media-scraper/packages/*'   # 指向 core 所在目录
```

```json
// package.json
{
  "dependencies": {
    "@media-scraper/core": "workspace:*"
  }
}
```

### 方式二：本地 file 协议

```json
{
  "dependencies": {
    "@media-scraper/core": "file:../media-scraper/packages/core"
  }
}
```

然后 `pnpm install`，直接 import 即可：

```ts
import { extractImages, extractVideos } from '@media-scraper/core';
```

### 方式三：npm 发布

```bash
cd packages/core
pnpm build
npm publish --access public
```

发布后其他项目直接 `pnpm add @media-scraper/core`。

### 使用示例

```ts
// 浏览器扩展 (Content Script)
import { extractImages, extractVideos } from '@media-scraper/core';

function wrapDocument(): DocumentLike {
  return {
    querySelectorAll: (sel: string) => [...document.querySelectorAll(sel)],
    body: document.body as unknown as ElementLike,
    // ...
  };
}

const images = extractImages(wrapDocument(), location.href);
const videos = extractVideos(wrapDocument(), location.href);

// Node.js (Playwright)
import { chromium } from 'playwright';
import { extractImages } from '@media-scraper/core';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://example.com');

const images = await page.evaluate(() => {
  // core 代码在浏览器端执行
  // 直接传入真实 DOM 即可
});
```

> **关键**：core 只是纯逻辑包。调用方需要提供 `DocumentLike` 适配器（浏览器扩展直接用真实 DOM，Node.js 用 Playwright/JSDOM）。

- **Head 元数据优先**：`og:image` / JSON-LD 通常指向高质量原图，P0 阶段即提取
- **懒加载多策略**：分段滚动 + networkidle + MutationObserver 兜底
- **CSS 背景图走 CSSOM**：直接读 `document.styleSheets`，避免 `getComputedStyle` 遍历
- **平台 CDN 提取**：扫描 script 中的 douyinvod/tiktokcdn 等域名，提取真实视频 URL
