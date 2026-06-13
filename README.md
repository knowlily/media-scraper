# Media Scraper

> 输入网址，自动提取页面中所有媒体资源 — 图片、视频、音频、文档。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-612%20passed-brightgreen)](https://github.com/knowlily/media-scraper/actions)
[![Coverage](https://img.shields.io/badge/coverage-88.9%25%20lines-9cf)](https://github.com/knowlily/media-scraper/actions)
[![Packages](https://img.shields.io/badge/packages-7-blueviolet)]()

## 它能做什么

输入网址，自动发现并提取页面中所有媒体资源。7 个阶段流水线扫描，首结果 < 1 秒返回。

| 类型 | 提取源 |
|------|--------|
| **图片** | `<img>`、`<picture>`、`og:image`、JSON-LD、懒加载（`data-src`）、CSS 背景图、SVG `<image>`、`<input type="image">` |
| **视频** | `<video>`、`<source>`、流媒体（m3u8/mpd）、iframe 嵌入（YouTube/Bilibili 等 15+ 平台）、CDN 直链 |
| **音频** | `<audio>`、`<source>`、`og:audio`、流媒体、JSON-LD AudioObject |
| **文档** | PDF、DOCX、ZIP、EPUB 等通过链接检测 |

配套能力：自动去重（不同 CDN 的同一图片识别为一份）、隐身浏览器（UA 池 + stealth 注入对抗反爬）、智能过滤（按分辨率/格式/大小筛选排序）、断点续传下载（中断恢复 + 并发控制）。

## 项目结构

```
media-scraper/               # pnpm monorepo
├── packages/
│   ├── core/                # 同构提取引擎（零平台依赖）
│   ├── dedupe/              # 多级去重引擎
│   ├── browser/             # Playwright + stealth 封装
│   ├── downloader/          # 断点续传 + 并发下载管理器
│   ├── extension/           # Chrome MV3 扩展
│   ├── cli/                 # 命令行工具
│   └── mcp/                 # MCP Server + HTTP API
├── .github/workflows/       # CI/CD
└── pnpm-workspace.yaml
```

## 快速开始

```bash
git clone https://github.com/knowlily/media-scraper.git
cd media-scraper
pnpm install
pnpm -r build        # 构建全部 7 个包
pnpm -r test         # 612 个测试
```

## 五种使用方式

### 一、Chrome 扩展

零对抗，运行在真实浏览器中，天然绕过反爬。

```
1. cd packages/extension && pnpm build
2. Chrome → chrome://extensions → 开发者模式 → 加载已解压
3. 选择 packages/extension/dist/
4. 打开网页 → 点击图标 → 自动抓取 → 勾选 → 下载
```

扩展内部使用流式 API，每个阶段发现资源立即推送，Popup 实时增量展示，不用等待全部完成。

### 二、NPM 库

```bash
pnpm add @media-scraper/core        # 提取引擎
pnpm add @media-scraper/dedupe      # 去重（可选）
pnpm add @media-scraper/browser     # 隐身浏览器（可选）
pnpm add @media-scraper/downloader  # 下载管理（可选）
```

**快速上手** — 全量提取：

```ts
import { scrape } from '@media-scraper/core';

const result = await scrape(doc, 'https://example.com');
// result.images / result.videos / result.audio / result.documents
```

**流式提取** — 边提取边处理，首结果 < 1s：

```ts
import { scrapeStream } from '@media-scraper/core';

for await (const batch of scrapeStream(doc, 'https://example.com')) {
  console.log(`[${batch.phase}] 发现 ${batch.items.length} 个 (累计 ${batch.cumulative.total})`);
}
```

**自定义组装** — 组合去重、过滤、自定义解析器：

```ts
import { MediaScraper, FilterChain } from '@media-scraper/core';
import { Deduplicator, NormalizedURLStrategy, FileSignatureStrategy } from '@media-scraper/dedupe';

const scraper = new MediaScraper({
  filter: new FilterChain()
    .minResolution(500, 500)       // 只要 500px 以上
    .excludeExtensions(['.gif'])   // 不要 GIF
    .excludeTracking()             // 自动排除 1×1 追踪像素
    .sort('resolution-desc'),      // 按分辨率降序
  deduplicator: new Deduplicator([
    new NormalizedURLStrategy(),   // 去除 URL 追踪参数
    new FileSignatureStrategy(),   // 按文件名+路径去重
  ]),
});

const result = await scraper.scrape(doc, 'https://example.com');
```

### 三、CLI 命令行

CLI 内置隐身浏览器（自动注入反检测脚本 + 20 条 UA 轮换），无需额外配置。

```bash
cd packages/cli && pnpm build

# 抓取，输出 JSON（含警告、错误、耗时统计）
node dist/index.js scrape "https://example.com"

# 抓取并下载（断点续传 + 并发 3 线程，中断恢复不重下）
node dist/index.js download "https://example.com" -o ./downloads

# 批量处理 urls.txt 中每行一个网址
node dist/index.js batch urls.txt
```

### 四、HTTP API

启动服务：

```bash
cd packages/mcp && pnpm build
npx playwright install chromium   # 首次需要
node dist/api.js                   # 默认 :3456
```

调用：

```bash
# 健康检查
curl http://localhost:3456/health
# → {"status":"ok","version":"0.1.0"}

# 全量抓取（一次返回）
curl -X POST http://localhost:3456/scrape \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'

# 流式抓取（SSE，边提取边推送）
curl -N -X POST http://localhost:3456/scrape/stream \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'
# data: {"type":"batch","phase":1,"items":[...],"cumulative":{"total":12}}
# data: {"type":"batch","phase":2,"items":[...],"cumulative":{"total":47}}
# data: {"type":"complete","total":89}

# 下载资源到本地
curl -X POST http://localhost:3456/download \
  -H 'Content-Type: application/json' \
  -d '{"resources":[{"url":"..."}], "outputDir":"./downloads", "concurrency":3}'
```

### 五、MCP Server

挂载到 Hermes Agent 或其他 MCP 客户端，提供 `scrape_media` 和 `download_media` 工具：

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

## 关键设计

| 特性 | 说明 |
|------|------|
| **核心同构** | 同一引擎在浏览器 DOM / JSDOM / Playwright 中均可运行 |
| **流式提取** | AsyncIterator 逐阶段 yield，首结果 < 1s，支持 AbortSignal 中断 |
| **隐身浏览器** | 20 条 UA 池轮换 + stealth 注入 (webdriver/spoof/反检测标记清理) |
| **多级去重** | URL 归一化 → 文件签名匹配 → 感知哈希，不同 CDN 的同一图片自动合并 |
| **过滤管道** | FilterChain 链式调用：分辨率/格式/大小/追踪像素 筛选 + 排序 |
| **断点续传** | HEAD 检查 Accept-Ranges → Range 续传，并发队列 + 速率限制 + 指数退避 |
| **插件化架构** | MediaParser 注册表，`registerParser()` 可追加自定义解析器 |
| **反爬对抗** | Chrome 扩展零对抗；CLI/MCP 隐身浏览器；代理 + viewport 随机化 |
| **CSS 背景图** | 走 CSSOM 读规则，避免 `getComputedStyle` 全量遍历 |
| **懒加载处理** | 分段滚动触发 + networkidle 等待 + MutationObserver 兜底 |
| **流媒体检测** | 识别 m3u8/mpd，标记为流媒体 |

## 兼容性测试

覆盖 22 个真实网站（SPA/电商/新闻/社交/图库/视频/文档），验证提取能力。

```bash
npx tsx doc2/compatibility/runner.ts --url https://example.com  # 单站调试
npx tsx doc2/compatibility/runner.ts --all                      # 全量跑
```

CI 每周一自动运行，详见 `.github/workflows/compatibility.yml`。

## 当前状态

| 包 | 测试通过 | 职责 |
|----|---------|------|
| core | 417 | 提取引擎、流式输出、过滤管道、解析器注册 |
| dedupe | 53 | 多级去重（覆盖率 99.3%） |
| browser | 32 | 隐身浏览器、UA 池 |
| downloader | 21 | 断点续传、并发下载 |
| extension | 79 | Chrome MV3 扩展 |
| cli | 3 | 命令行工具 |
| mcp | 7 | HTTP API + SSE 流式 + MCP |

- **构建**: 7/7 包全部通过
- **测试**: 612 用例全绿
- **覆盖率**: core lines 88.9%、branches 82.5%

## 技术栈

TypeScript 5.5 · pnpm 9 · Vitest · Playwright · Chrome Manifest V3 · Changesets · GitHub Actions

## 许可

MIT
