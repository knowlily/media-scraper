# Media Scraper

> 输入网址，自动提取页面中所有媒体资源（图片、视频、音频、文档），支持预览与批量下载。

## 技术栈

- 语言：TypeScript (strict mode, ES2022)
- 运行时：Node.js ≥18 / Chrome ≥110
- 构建：Vite（多入口：popup/content/panel/background）
- 包管理：pnpm (workspace monorepo)
- 测试：Vitest
- CI：GitHub Actions
- 版本管理：Changesets

## 目录结构

```
D:\githubs\mount\                          # 项目根目录
├── package.json                           # monorepo root（private）
├── pnpm-workspace.yaml                    # "packages/*"
├── tsconfig.json                          # 根 tsconfig（base）
├── PRD.md                                 # 产品需求文档（权威参考）
├── AGENTS.md                              # ← 本文件
└── packages/
    ├── core/                              # 核心提取引擎（纯 TypeScript，零 UI 依赖）
    │   ├── src/
    │   │   ├── index.ts                   # 公共 API
    │   │   ├── scraper.ts                 # 主刮取逻辑
    │   │   ├── extractors/                # 提取器
    │   │   │   ├── images.ts              # 图片提取（P0）
    │   │   │   ├── videos.ts              # 视频提取（P1）
    │   │   │   ├── audio.ts               # 音频提取（P2）
    │   │   │   ├── documents.ts           # 文档提取（P2）
    │   │   │   ├── backgrounds.ts         # CSS 背景图提取（P1）
    │   │   │   ├── iframes.ts             # iframe 内嵌提取（P1）
    │   │   │   └── shadow-dom.ts          # Shadow DOM 提取（P2）
    │   │   ├── filters.ts                 # 去重/过滤
    │   │   ├── types.ts                   # 类型定义（MediaResource、ScrapeResult 等）
    │   │   └── utils.ts                   # 工具函数（文件名清理等）
    │   └── package.json
    ├── extension/                         # Chrome 浏览器扩展（Manifest V3）
    │   ├── src/
    │   │   ├── popup/                     # 弹出面板
    │   │   ├── panel/                     # 结果面板（新标签页）
    │   │   ├── content/                   # Content Script（注入页面）
    │   │   ├── background/                # Service Worker
    │   │   └── utils/                     # 共享工具
    │   ├── manifest.json                  # Chrome 扩展清单
    │   └── package.json
    ├── cli/                               # Node.js CLI 工具（Playwright 驱动）
    │   ├── src/
    │   │   ├── index.ts                   # CLI 入口
    │   │   ├── commands.ts                # 命令定义
    │   │   └── browser.ts                 # Playwright 封装
    │   └── package.json
    └── mcp/                               # MCP Server（挂载到 Hermes）
        ├── src/
        │   ├── index.ts                   # MCP Server 入口
        │   └── tools.ts                   # 工具定义（scrape_media / download_media）
        └── package.json
```

## 关键命令

- 安装依赖：`pnpm install`
- 构建全部：`pnpm build`
- 运行测试：`pnpm test`
- 类型检查：`pnpm typecheck`
- 单独构建 core：`pnpm --filter @media-scraper/core build`
- 单独测试 core：`pnpm --filter @media-scraper/core test`

## 代码约定

- 架构：Core 引擎 → 各 package 薄封装（三层架构）
- Core 同构边界：`packages/core/` 不依赖 `fs`/`path`/`process` 等 Node API，可在浏览器和 Node.js 双端运行
- 平台特定能力（文件下载、DOM 访问、网络请求）由各包自行注入
- 命名：TypeScript 标准（PascalCase 类型/接口，camelCase 函数/变量）
- 类型：严格模式，所有公开 API 必须有类型导出
- 测试框架：Vitest，core 覆盖率目标 ≥90%
- CRLF 行尾（Windows 项目）

## 核心设计决策

1. **零反爬**：扩展模式运行在用户真实 Chrome 里，网站视角是真人用户
2. **跨域下载**：Content Script 收集 URL → Service Worker 代理 fetch（Range 限 512KB）→ `chrome.downloads.download()` 直接下载
3. **CSS 背景图**：走 CSSOM（`document.styleSheets`）直接读规则，避免 `getComputedStyle()` 遍历
4. **懒加载**：分段滚动 + networkidle + MutationObserver 兜底
5. **流媒体**：检测 m3u8/mpd 标记；CLI/MCP 用 ffmpeg/yt-dlp 下载；扩展模式标记为「需 CLI 下载」
6. **Head 元数据优先**：`og:image` / JSON-LD 等通常指向高质量原图，P0 优先提取

## 错误处理原则

- 每个异常状态有明确的降级行为，不允许静默吞错
- 超时 → 返回已提取部分 + 标注
- 403/404 → 灰显标记，仍可尝试下载
- SW 被杀 → 自动重试 3 次（幂等设计）
- 跨域 iframe → 静默跳过

## 开发阶段（Phase）

| Phase | 内容 | 优先级 |
|-------|------|--------|
| 1 | `packages/core` 核心引擎 + 单元测试 | P0 |
| 2 | `packages/extension` 浏览器扩展 | P0 |
| 3 | `packages/cli` CLI 工具 | P1 |
| 4 | `packages/mcp` MCP Server | P1 |
| 5 | 增强功能（批量URL/翻页/智能探索/CSS背景图/iframe） | P2 |
| 6 | 运营（商店上架/npm发布/文档） | P2 |

## 注意事项

- PRD.md 是权威需求文档，任何功能分歧以 PRD 为准
- Core 包是纯逻辑包，不得引入浏览器或 Node 特定 API
- 扩展权限策略：默认 `activeTab`，批量 URL 功能需要 `<all_urls>`（动态请求）
- 下载文件大小限制：扩展模式无限制（chrome.downloads），CLI/MCP 大文件自动降串行
- Windows 文件名：过滤 `:/\*?<>|"` 等非法字符
