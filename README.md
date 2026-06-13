# Media Scraper

> 输入网址，自动提取页面中所有媒体资源 — 图片、视频、音频、文档。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-612%20passed-brightgreen)](https://github.com/knowlily/media-scraper/actions)
[![Coverage](https://img.shields.io/badge/coverage-88.9%25%20lines-9cf)](https://github.com/knowlily/media-scraper/actions)
[![Packages](https://img.shields.io/badge/packages-7-blueviolet)]()

## 功能

输入网址，自动发现并提取页面中所有媒体资源，告别逐张右键另存。

| 类型 | 提取源 |
|------|--------|
| **图片** | `<img>`、`<picture>`、`og:image`、JSON-LD、懒加载（`data-src`）、CSS 背景图、SVG `<image>`、`<input type="image">` |
| **视频** | `<video>`、`<source>`、流媒体（m3u8/mpd）、iframe 嵌入（YouTube/Bilibili 等 15+ 平台）、CDN 直链 |
| **音频** | `<audio>`、`<source>`、`og:audio`、流媒体、JSON-LD AudioObject |
| **文档** | PDF、DOCX、ZIP、EPUB 等通过链接检测 |

### V2 新增

| 特性 | 说明 |
|------|------|
| **多级去重** | URL 归一化 + 文件签名 + 感知哈希，自动识别不同 CDN 的同一资源 |
| **隐身浏览器** | StealthBrowser — 20 UA 池 + stealth 注入，反反爬对抗 |
| **流式输出** | `scrapeStream()` AsyncIterator，每阶段实时 yield，首结果 <1s |
| **智能过滤** | FilterChain 管道 — 分辨率/格式/大小/追踪像素 链式筛选排序 |
| **断点续传** | DownloadManager — HEAD 检查 → Range 续传 + 并发控制 + 指数退避重试 |
| **插件化** | MediaParser 注册表，自定义 Parser 可插拔 |
| **SSE 流式 API** | MCP Server 新增 `POST /scrape/stream`，Server-Sent Events 实时推送 |

## 项目结构

```
media-scraper/               # pnpm monorepo
├── packages/
│   ├── core/                # 同构提取引擎（TypeScript，零平台依赖）
│   ├── dedupe/              # [V2] 多级去重引擎
│   ├── browser/             # [V2] Playwright + stealth 封装
│   ├── downloader/          # [V2] 断点续传 + 并发下载管理器
│   ├── extension/           # Chrome MV3 扩展（Popup UI + 实时抓取）
│   ├── cli/                 # Node.js CLI（集成 browser + downloader）
│   └── mcp/                 # MCP Server + HTTP API（集成 browser + downloader + SSE）
├── .github/workflows/       # CI/CD 流水线
├── .changeset/              # 版本管理（Changesets）
├── doc2/                    # [V2] 设计文档 + 任务进度
├── doc/                     # v0.1 文档
└── pnpm-workspace.yaml
```

## 快速开始

```bash
git clone <repo-url> && cd media-scraper
pnpm install
pnpm -r build        # 构建全部 7 个包
pnpm -r test         # 612 个测试
```

## 使用方式

### 方式一：Chrome 扩展

最推荐，零对抗 — 运行在用户真实浏览器中。

1. `cd packages/extension && pnpm build`
2. Chrome → `chrome://extensions` → 开发者模式 → 加载已解压
3. 选择 `packages/extension/dist/` 目录
4. 打开任意网页，点击扩展图标 → 自动抓取 → 勾选 → 下载

### 方式二：核心引擎

```bash
pnpm add @media-scraper/core
```

```ts
import { scrape, scrapeStream, MediaScraper, FilterChain } from '@media-scraper/core';

// V1 API — 全量提取（向后兼容）
const result = await scrape(docAdapter, 'https://example.com');
// result.images / result.videos / result.audio / result.documents

// V2 API — 流式提取（新增）
for await (const batch of scrapeStream(docAdapter, 'https://example.com')) {
  console.log(`[${batch.phase}] +${batch.items.length} (累计 ${batch.cumulative.total})`);
}

// V2 API — MediaScraper 类（新增）
const scraper = new MediaScraper({
  parsers: ['image', 'video', 'audio', 'document', 'background'],
  filter: new FilterChain()
    .minResolution(500, 500)
    .excludeExtensions(['.gif'])
    .sort('resolution-desc'),
});
const result = await scraper.scrape(docAdapter, 'https://example.com');
```

详见 [packages/core/README.md](packages/core/README.md)。

### 方式三：CLI 命令行

```bash
cd packages/cli && pnpm build

# 抓取并输出 JSON（V2：自动隐身浏览器 + 增强错误输出）
node dist/index.js scrape "https://example.com"

# 抓取并下载所有媒体（V2：断点续传 + 并发控制）
node dist/index.js download "https://example.com" -o ./downloads

# 批量处理
node dist/index.js batch urls.txt
```

### 方式四：HTTP API

```bash
cd packages/mcp && pnpm build

# 安装 Playwright 浏览器（首次）
npx playwright install chromium

# 启动服务
node dist/api.js
```

```bash
# 健康检查
curl http://localhost:3456/health
# {"status":"ok","version":"0.1.0"}

# 抓取媒体（非流式）
curl -X POST http://localhost:3456/scrape \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'

# V2 新增：SSE 流式抓取
curl -N -X POST http://localhost:3456/scrape/stream \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'
# data: {"phase":1,"items":[...],"progress":{"current":1,"total":7}}
# data: {"phase":2,"items":[...],"progress":{"current":2,"total":7}}
# ...
# data: {"type":"complete","total":42}
```

### 方式五：MCP Server

挂载到 Hermes Agent 或其他 MCP 客户端，提供 `scrape_media` 和 `download_media` 工具。

```json
{
  "mcpServers": {
    "media-scraper": {
      "command": "node",
      "args": ["dist/api.js"],
      "cwd": "/path/to/packages/mcp"
    }
  }
}
```

## 设计亮点

| 特性 | 说明 |
|------|------|
| **核心同构** | 同一份提取引擎在浏览器 DOM、JSDOM、Playwright 中均可运行 |
| **扩展模式零反爬** | 运行在用户真实 Chrome 中，天然绕过反爬检测 |
| **7 阶段流式提取** | 每个阶段完成后立即发送结果，Popup 实时增量展示 |
| **懒加载处理** | 分段滚动触发 + networkidle 等待 + MutationObserver 3s 兜底 |
| **CSS 背景图** | 走 CSSOM 直接读规则，避免 `getComputedStyle` 全量遍历 |
| **平台插件化** | 注册表模式，`registerPlatformExtractor()` 可追加新平台 |
| **流媒体检测** | 识别 m3u8/mpd，标记为流媒体，CLI 模式下可下载 |
| **隐身浏览器** 🆕 | 20 UA 池 + stealth 注入脚本（webdriver/spoof/反检测），CLI/MCP 共享 |
| **多级去重** 🆕 | URL 归一化 → 文件签名 → 感知哈希，自动合并不同 CDN 的相同资源 |
| **断点续传** 🆕 | HEAD 检查 → Range 续传，并发队列 + 速率限制 + 指数退避重试 |
| **SSE 流式 API** 🆕 | HTTP 流式端点，客户端断开 → AbortSignal 自动中断 |

## 包依赖关系

```
┌──────────┐
│  dedupe  │──── 依赖 core 的 MediaResource 类型
└────┬─────┘
     │
┌────▼─────┐     ┌──────────┐     ┌────────────┐
│   core   │     │ browser  │     │ downloader │
└────┬─────┘     └────┬─────┘     └─────┬──────┘
     │                │                │
     └────────┬───────┴────────────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
┌───▼──┐ ┌───▼──┐ ┌───▼──┐
│ ext  │ │ cli  │ │ mcp  │
└──────┘ └──────┘ └──────┘
```

## 技术栈

| 层 | 技术 |
|----|------|
| 语言 | TypeScript 5.5 |
| 包管理 | pnpm 9 (monorepo workspace) |
| 测试 | Vitest (31 文件, 612 用例) |
| 构建 | tsc (core/cli/mcp/dedupe/browser/downloader) + Vite (extension) |
| 浏览器 | Playwright (CLI + MCP) |
| 扩展 | Chrome Manifest V3 |
| 版本 | Changesets |
| CI/CD | GitHub Actions |

## 当前状态

- **构建**: 7/7 包全部通过
- **测试**: 31 文件 / 612 用例 / 全绿
- **覆盖率**: core lines 88.9% / branches 82.5%
- **需求**: 10/10 条 V2 改进需求已实现
- **任务**: 48/48 完成

| 包 | 测试 | 说明 |
|----|------|------|
| core | 417 | 提取引擎 + MediaScraper + FilterChain + scrapeStream |
| dedupe | 53 | 多级去重（覆盖率 99.3%） |
| browser | 32 | StealthBrowser + UA 池 |
| downloader | 21 | 断点续传 + 并发下载 |
| extension | 79 | Chrome MV3 扩展 |
| cli | 3 | 命令行工具 |
| mcp | 7 | MCP Server + HTTP API + SSE |

详见 [doc2/tasks/progress.md](doc2/tasks/progress.md)。

## 兼容性测试

V2 新增真实网站兼容性测试矩阵，覆盖 22 个目标网站（SPA/电商/新闻/社交/图库/视频/文档）。

```bash
# 单网站调试
npx tsx doc2/compatibility/runner.ts --url https://example.com

# 全量测试
npx tsx doc2/compatibility/runner.ts --all
```

CI 每周一自动运行 + workflow_dispatch 手动触发，详见 `.github/workflows/compatibility.yml`。

## 许可

MIT
