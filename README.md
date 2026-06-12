# Media Scraper

> 通用媒体提取引擎 — 从网页中提取图片、视频、音频和文档。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-115%20passed-brightgreen)](https://github.com/knowlily/media-scraper/actions)

## 功能

输入网址，自动发现并提取页面中所有媒体资源，告别逐张右键另存。

- **图片**：`<img>`、`<picture>`、`og:image`、JSON-LD、懒加载（`data-src`）、CSS 背景图
- **视频**：`<video>`、`<source>`、流媒体（m3u8/mpd）、iframe 嵌入、CDN 直链
- **音频**：`<audio>`、`<source>`、流媒体、Head 元数据
- **文档**：PDF、DOCX、ZIP 等通过链接检测

## 项目结构

```
media-scraper/               # pnpm monorepo
├── packages/
│   ├── core/                # 纯提取引擎（TypeScript，零 UI 依赖）
│   ├── extension/           # Chrome 扩展（Manifest V3 + Vite）
│   ├── cli/                 # Node.js 命令行工具（Playwright）
│   └── mcp/                 # MCP Server + HTTP API
├── AGENTS.md                # AI 代理上下文
└── PRD.md                   # 产品需求文档
```

## 快速开始

```bash
pnpm install
pnpm build
pnpm test   # 115 个测试
```

### 在项目中使用核心引擎

```ts
import { extractImages, extractVideos } from '@media-scraper/core';

const images = extractImages(documentAdapter, 'https://example.com');
const videos = extractVideos(documentAdapter, 'https://example.com');
```

详见 [packages/core/README.md](packages/core/README.md)。

## 设计亮点

- **扩展模式零反爬**：运行在用户真实浏览器中
- **核心同构**：同一份代码在浏览器和 Node.js 中运行
- **懒加载处理**：分段滚动 + networkidle + MutationObserver 兜底
- **CSS 背景图**：走 CSSOM 直接读规则，避免 `getComputedStyle` 全量遍历
- **流媒体检测**：识别 m3u8/mpd，CLI 模式下可下载

## 许可

MIT
