# Media Scraper

> Universal media extraction engine — extract images, videos, audio, and documents from web pages.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-115%20passed-brightgreen)](https://github.com/knowlily/media-scraper/actions)

## What it does

Input a URL, automatically discover and extract all media resources from the page — no more right-click "Save As" one by one.

- **Images**: `<img>`, `<picture>`, `og:image`, JSON-LD, lazy-load (`data-src`), CSS backgrounds
- **Videos**: `<video>`, `<source>`, streaming (m3u8/mpd), iframe embeds, CDN URLs
- **Audio**: `<audio>`, `<source>`, streaming, head metadata
- **Documents**: PDF, DOCX, ZIP, and more via link detection

## Project structure

```
media-scraper/               # pnpm monorepo
├── packages/
│   ├── core/                # Pure extraction engine (TypeScript, zero UI deps)
│   ├── extension/           # Chrome extension (Manifest V3 + Vite)
│   ├── cli/                 # Node.js CLI (Playwright)
│   └── mcp/                 # MCP Server + HTTP API
├── AGENTS.md                # AI agent context
└── PRD.md                   # Product requirements
```

## Quick start

```bash
pnpm install
pnpm build
pnpm test   # 115 tests
```

### Use the core in your project

```ts
import { extractImages, extractVideos } from '@media-scraper/core';

const images = extractImages(documentAdapter, 'https://example.com');
const videos = extractVideos(documentAdapter, 'https://example.com');
```

See [packages/core/README.md](packages/core/README.md) for full API docs.

## Design highlights

- **Zero anti-bot issues** in extension mode (runs in user's real browser)
- **Core is isomorphic** — same code runs in browser and Node.js
- **Lazy-load handling** — scroll + network idle + MutationObserver
- **CSS background extraction** via CSSOM (no `getComputedStyle` traversal)
- **Stream detection** — m3u8/mpd identified, downloadable in CLI mode

## License

MIT
