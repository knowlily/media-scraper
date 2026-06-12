# Media Scraper — 产品需求文档 (PRD)

> 版本: v0.3
> 日期: 2026-06-11
> 状态: 已 Review（第二次迭代 — 加入错误处理矩阵、流媒体、元数据提取、测试策略、CI/CD 等）

---

## 1. 产品概述

### 1.1 一句话描述

输入网址，自动提取页面中所有媒体资源（图片、视频、音频、文档），支持预览与批量下载。

### 1.2 解决的问题

用户在浏览网页时，经常需要保存页面上的图片、视频等媒体文件。传统方式是逐张右键另存为，效率极低。本工具让用户输入一个（或多个）网址，自动完成发现、提取、预览、下载全流程。

### 1.3 核心价值

| 痛点 | 解决方式 |
|------|----------|
| 逐张保存效率低 | 一键提取整页全部媒体 |
| 懒加载图片找不到 | 自动滚动触发，完整采集 |
| 不知道哪些能下载 | 自动分类：图片/视频/音频/文档 |
| 反爬网站没法抓 | 浏览器扩展形态，真实用户环境 |
| 批量处理多个页面 | 支持 URL 列表批量抓取 |

---

## 2. 用户画像

| 角色 | 场景 | 使用方式 |
|------|------|----------|
| 设计师 / 创意工作者 | 收集参考图、素材 | 浏览器扩展，一键提取当前页面所有图片 |
| 普通用户 | 保存网页上的照片、视频 | 浏览器扩展，输入链接自动提取 |
| 开发者 / 技术用户 | 批量处理、脚本化 | CLI 工具 / npm 包 |
| Hermes Agent 用户 | 对话式抓取 | MCP Server，自然语言触发 |

---

## 3. 产品形态

三种入口，一份核心逻辑：

```
packages/
├── core/                  # 核心提取引擎（TypeScript，零依赖 UI）
├── extension/             # Chrome 浏览器扩展（popup + 结果面板）
├── cli/                   # Node.js CLI 工具
└── mcp/                   # MCP Server（挂载到 Hermes）
```

| 形态 | 用户群 | 优势 |
|------|--------|------|
| Chrome 扩展 | 普通用户 | 零反爬、安装简单、体验最佳 |
| CLI 工具 | 开发者 | 脚本化、可管道 |
| MCP Server | Hermes 用户 | 对话式操作 |
| npm 库 | 其他开发者 | 嵌入自己的项目 |

---

## 4. 功能需求

### 4.1 核心功能

#### F1 — URL 输入抓取

```
优先级: P0
描述: 用户输入一个 URL，工具自动加载页面并提取所有媒体资源
```

- 支持 http/https 协议
- 自动跟随重定向
- 显示加载进度
- 处理超时（默认 30s，可调）
- **取消/暂停**：抓取过程中提供停止按钮，已提取的资源保留；暂停功能（CLI/MCP）保留中间状态可恢复

#### F2 — 媒体资源提取

```
优先级: P0
描述: 从页面中提取各类媒体资源
```

| 类型 | 提取源 | 优先级 |
|------|--------|--------|
| 图片 | `<img src>`, `<picture>`, `<source>`, `<image>`, `data-src`(懒加载) | P0 |
| Head 元数据 | `<meta property="og:image">`, `<meta name="twitter:image">`, `<link rel="image_src">`, JSON-LD `image`/`video`/`audio`, `<link rel="preload" as="image">`/`as="video">` 等 | P0 |
| 视频（直链） | `<video src>`, `<video><source>`, 直接链接 `.mp4`/`.webm` 等 | P1 |
| 视频（流媒体） | m3u8 (HLS)、mpd (DASH) — 检测并提示用户；CLI/MCP 模式可用 ffmpeg/yt-dlp 下载 | P1 |
| 音频 | `<audio src>`, `<audio><source>` | P2 |
| 文档 | `<a href="*.pdf">`, `*.docx`, `*.zip`, `*.rar` 等 | P2 |
| CSS 背景图 | `background-image`, `background` 简写（优先走 CSSOM 直接读规则，避免遍历调 `getComputedStyle`） | P1 |
| iframe 内嵌 | `<iframe>` 内文档的媒体（同源递归收集，深度可配；跨域静默跳过） | P1 |
| Shadow DOM | Web Components / `attachShadow()` 内的媒体 | P2 |

> **设计决策① — Head 元数据优先**：`<meta property="og:image">`、JSON-LD 结构化数据等通常指向高质量原图，比页面内缩略 `<img>` 价值更高，应在提取的第一阶段就抓取，纳入 P0。
>
> **设计决策② — 流媒体视频**：现代网站视频绝大多数使用 HLS/DASH 流式传输，`<video src=".mp4">` 极少见。`chrome.downloads.download()` 无法下载 m3u8/mpd。扩展模式下检测到流媒体时标记为「需 CLI 下载」并提示用户；CLI/MCP 模式集成 ffmpeg 或 yt-dlp 处理。
>
> **设计决策③ — CSS 背景图性能**：`getComputedStyle()` 每次调用触发样式重算，遍历 2000 个元素会冻结页面数秒。正确做法：用 CSSOM（`document.styleSheets`）直接读规则，只对匹配当前元素的规则做样式解析，避免全量遍历。

#### F3 — 懒加载处理

```
优先级: P0
描述: 多策略触发懒加载，完整采集延迟加载的媒体
```

- 分段滚动到底部（覆盖 scroll-based 懒加载）
- 每次滚动后等待网络空闲（`networkidle`）
- **MutationObserver 持续监听** DOM 新增节点（覆盖 IntersectionObserver / API 驱动 / 虚拟滚动）
- 模拟元素进入视口（`scrollIntoView`）触发 IntersectionObserver 回调
- 可配置滚动次数 / 最大深度 / 最大等待时间
- 兜底：点击常见的「加载更多」按钮 / 分页器

> **设计决策**：现代懒加载实现多样化（IntersectionObserver、虚拟滚动、API fetch + DOM 注入），单纯的分段滚动不够。MutationObserver 作为兜底方案持续监听 DOM 变化，在滚动期间捕获所有新增的 `<img>` / `<video>` / `<source>` 标签。

#### F4 — 去重与过滤

```
优先级: P0
描述: 自动去重，提供过滤选项
```

- URL 精确去重（同一资源不重复列出）
- 最小尺寸过滤（排除图标、占位符等小图）
- 域名过滤（只看当前站点 / 包含外部 CDN）
- 文件类型过滤

#### F5 — 预览与选择

```
优先级: P0
描述: 结果以网格展示，用户可选择后批量下载
```

- 图片：缩略图网格预览
- **视频/音频**：点击可播放预览（扩展模式新标签页打开直链；若为 m3u8/mpd 流媒体则标记并引导 CLI 下载）
- 显示文件名、大小、类型
- 全选 / 取消全选 / 反选
- 实时显示已选数量和总大小
- **键盘快捷键**：方向键切换选择、空格选中/取消、Enter 下载选中、Ctrl+A 全选、Escape 关闭预览
- **内存管理**：最多缓存 50 张缩略图（LRU 驱逐），超出部分显示占位符，滚动到可视区域时懒加载；大图预览按需加载，关闭后释放

#### F6 — 批量下载

```
优先级: P0
描述: 将选中的媒体文件下载到本地
```

- 下载到用户指定目录（默认：下载文件夹）
- 按类型创建子目录（images / videos / audio / documents）
- 文件名冲突自动重命名（`xxx_1.jpg`）
- **文件名清理**：过滤路径穿越（`../`）、Windows 非法字符（`:\*?<>|"`）、控制字符，统一截断至 255 字节
- 下载进度显示
- 下载完成后打开文件夹
- **断点续传**：仅 CLI/MCP 模式支持（HTTP Range + 临时文件 `.part`）；浏览器扩展受 `chrome.downloads` API 限制，不支持暂停/恢复，中断后需重新下载
- **下载并发**：默认 5 并发，可配置
- **大文件策略**：超过 50MB 自动降为单连接串行下载，避免内存压力

#### F7 — 批量 URL

```
优先级: P1
描述: 支持同时输入多个 URL 批量抓取
```

- 每行一个 URL，或从文本粘贴
- 每个 URL 独立展示结果
- 汇总统计

#### F8 — 自动翻页

```
优先级: P1
描述: 检测并自动跟随分页，支持 URL 分页和 SPA 动态加载
```

- **URL 分页**：检测 `?page=N`、`/page/N/`、`?p=N` 等模式
- **语义链接**：检测「下一页」「Next」「次へ」等 `<a>` 标签
- **SPA / 无限滚动**：MutationObserver 监听列表容器变化，自动滚动触发新数据加载
- **「加载更多」按钮**：检测并自动点击常见文本模式（`Load More`/`加载更多`/`查看更多`）
- 用户设定最大翻页数 / 最大资源数
- 翻页结果汇总（总资源数、总大小）

#### F9 — 智能探索

```
优先级: P2
描述: 提取页面中指向大图/原图的链接并跟进
```

- 检测缩略图 → 大图模式（`_thumb.jpg` → `_full.jpg`）
- 检测 `<a>` 包裹的 `<img>`，跟进 href
- 可配置探索深度

### 4.2 错误处理矩阵

> 每个异常状态必须有明确的降级行为，不允许静默吞错或全丢弃。

| 异常场景 | 降级行为 | 用户感知 |
|----------|----------|----------|
| 页面加载超时 | 返回已提取的部分资源 + 标注「页面未完全加载」 | 警告图标 + 已提取数量 |
| CDN 返回 403/404（图片） | 标记为「不可用」灰显，仍可尝试下载（可能需 Referer） | 灰色占位符 ⊘ |
| Service Worker 被杀 | 已生成的缩略图保留；未完成的自动重试（最多 3 次），幂等设计 | 静默重试，不打扰 |
| `chrome.downloads` 下载失败 | 单文件重试 2 次；仍失败则跳过 + 汇总列出失败清单 | 红色错误计数 + 失败列表 |
| 磁盘空间不足 | 停止批量下载，保留已下载文件 + 提示剩余失败数 | 明确错误提示 |
| 跨域 iframe DOM 无法访问 | 静默跳过该 iframe，不计入错误 | 无提示（预期行为） |
| 超过 CSS 背景图扫描上限 | 跳过后续元素的背景图提取，已提取的保留 | 信息提示「N 个元素未扫描背景图」 |
| m3u8/mpd 流媒体（扩展模式） | 标记为「流媒体 — 需 CLI 下载」，不尝试 chrome.downloads | 特殊标签 🎬 |
| 下载中断（网络断开） | CLI/MCP：`.part` 临时文件保留，下次自动续传；扩展：提示重新下载 | 进度归零 + 重试提示 |

### 4.3 辅助功能

#### F10 — 历史记录

- 保存最近 20 次抓取的 URL 和结果
- 可清除

#### F11 — 导出

- 导出资源列表为 JSON / CSV
- 方便其他工具处理

#### F12 — 设置

- 默认下载目录
- 代理设置（CLI 模式）
- 超时时间
- User-Agent 自定义
- 最小图片尺寸阈值

---

## 5. 界面设计（浏览器扩展）

### 5.1 Popup 面板（精简模式）

```
┌──────────────────────────────┐
│  🎬 Media Scraper           │
├──────────────────────────────┤
│                              │
│  URL 输入区                  │
│  ┌──────────────────────┐    │
│  │ https://example.com  │    │
│  └──────────────────────┘    │
│                              │
│  ┌──────────────────────┐    │
│  │ + 添加更多 URL       │    │
│  └──────────────────────┘    │
│                              │
│  抓当前页面  |  批量抓取      │
│                              │
│  ┌────────────────────────┐  │
│  │     开始抓取            │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │     ■ 停止抓取          │  │  ← 抓取中显示
│  └────────────────────────┘  │
│                              │
│  历史  |  设置               │
└──────────────────────────────┘
```

> **设计备选**：结果面板也可使用 Chrome `sidePanel` API 实现为侧边栏，避免切换标签页。首次发布使用新标签页方式（兼容性更好），后续可选实现侧边栏版本。

### 5.2 结果面板（完整模式 — 新标签页）

```
┌──────────────────────────────────────────────────────┐
│  🎬 Media Scraper                    [设置 ⚙] [导出]  │
├──────────────────────────────────────────────────────┤
│  URL: https://example.com/gallery                    │
│  抓取于 2026-06-11 23:45  ·  耗时 3.2s               │
├──────────────────────────────────────────────────────┤
│                                                      │
│  [📷 图片 23] [🎬 视频 3] [🎵 音频 0] [📄 文档 5]    │
│                                                      │
│  过滤: [全部 ▼]  排序: [大小 ▼]  尺寸 ≥ [100] px     │
│        · 全部                                        │
│        · 图片                                        │
│        · 视频                                        │
│        · 音频                                        │
│        · 文档                                        │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │  │
│  │ │  ✓   │ │  ✓   │ │      │ │      │ │      │  │  │
│  │ │  🖼   │ │  🖼   │ │  🖼   │ │  🖼   │ │  🖼   │  │  │
│  │ │      │ │      │ │      │ │      │ │      │  │  │
│  │ │ 245K │ │ 180K │ │ 512K │ │ 1.2M │ │ 340K │  │  │
│  │ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘  │  │
│  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │  │
│  │ │  🖼   │ │  🖼   │ │  🖼   │ │  🖼   │ │  🖼   │  │  │
│  │ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘  │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ▸ 点击图片查看大图                                   │
│                                                      │
├──────────────────────────────────────────────────────┤
│  已选 2/23  ·  总大小 425K                            │
│  [全选] [取消全选]              [下载选中 ▼]          │
│                                    · 下载选中         │
│                                    · 下载全部         │
│                                    · 复制链接列表      │
└──────────────────────────────────────────────────────┘
```

### 5.3 图片大图预览（点击缩略图）

```
┌────────────────────────────────────────────┐
│                                    [✕ 关闭]│
│                                            │
│         ┌─────────────────────┐            │
│         │                     │            │
│         │    大图预览          │            │
│         │                     │            │
│         │                     │            │
│         └─────────────────────┘            │
│                                            │
│  文件名: sunset_photo.jpg                  │
│  尺寸:   3840 × 2160                       │
│  大小:   2.4 MB                            │
│  来源:   https://cdn.example.com/...       │
│                                            │
│  [下载]  [复制链接]  [在新标签页打开]        │
└────────────────────────────────────────────┘
```

---

## 6. 技术架构

### 6.1 技术选型

| 层级 | 技术 | 理由 |
|------|------|------|
| 浏览器扩展 | TypeScript + Manifest V3 | Chrome 标准，类型安全 |
| 核心引擎 | TypeScript（共享） | 浏览器和 CLI 复用 |
| CLI 工具 | Node.js + Playwright | 无头浏览器能力 |
| MCP Server | Node.js + @modelcontextprotocol/sdk | Hermes 标准协议 |
| UI 框架 | Vanilla / Preact | 扩展体积敏感 |
| 构建 | Vite | 多入口（popup/content/panel） |
| 包管理 | pnpm | monorepo 友好 |

### 6.2 项目结构

```
media-scraper/
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.json
├── packages/
│   ├── core/                          # 核心提取引擎
│   │   ├── src/
│   │   │   ├── index.ts               # 公共 API
│   │   │   ├── scraper.ts             # 主刮取逻辑
│   │   │   ├── extractors/
│   │   │   │   ├── images.ts          # 图片提取
│   │   │   │   ├── videos.ts          # 视频提取
│   │   │   │   ├── audio.ts           # 音频提取
│   │   │   │   ├── documents.ts       # 文档提取
│   │   │   │   ├── backgrounds.ts     # CSS 背景图提取 (P1)
│   │   │   │   ├── iframes.ts         # iframe 内嵌提取 (P1)
│   │   │   │   └── shadow-dom.ts      # Shadow DOM 提取 (P2)
│   │   │   ├── filters.ts             # 去重/过滤
│   │   │   ├── types.ts               # 类型定义
│   │   │   └── utils.ts               # 工具函数
│   │   └── package.json
│   │
│   ├── extension/                     # Chrome 扩展
│   │   ├── src/
│   │   │   ├── popup/                 # 弹出面板
│   │   │   ├── panel/                 # 结果面板（新标签页）
│   │   │   ├── content/               # Content Script（注入页面）
│   │   │   ├── background/            # Service Worker
│   │   │   └── utils/
│   │   ├── manifest.json
│   │   └── package.json
│   │
│   ├── cli/                           # CLI 工具
│   │   ├── src/
│   │   │   ├── index.ts               # CLI 入口
│   │   │   ├── commands.ts            # 命令定义
│   │   │   └── browser.ts             # Playwright 封装
│   │   └── package.json
│   │
│   └── mcp/                           # MCP Server
│       ├── src/
│       │   ├── index.ts               # MCP Server 入口
│       │   └── tools.ts               # 工具定义
│       └── package.json
│
├── README.md
└── PRD.md
```

### 6.3 数据流

```
用户输入 URL
     │
     ▼
┌─────────────┐
│  URL 校验    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  加载页面         │
│  ┌─────────────┐ │
│  │ Content      │ │  ← 浏览器扩展：直接读当前页面 DOM
│  │ Script 注入  │ │  ← CLI：Playwright 打开
│  └──────┬──────┘ │
│         │         │
│         ▼         │
│  ┌─────────────┐ │
│  │ 滚动触发     │ │  ← 懒加载处理
│  │ 懒加载       │ │  · 分段滚动 + networkidle
│  └──────┬──────┘ │  · MutationObserver 兜底
│         │         │  · =============
│         ▼         │
│  ┌─────────────┐ │
│  │ 提取器链      │ │
│  │ · images    │ │
│  │ · videos    │ │
│  │ · audio     │ │
│  │ · documents │ │
│  │ · iframes ▼ │ │  ← 递归提取
│  │ · shadow-dom│ │
│  └──────┬──────┘ │
└─────────┼────────┘
          │
          ▼
┌─────────────────┐
│  去重 + 过滤     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  结果展示        │
│  ┌────────────┐ │
│  │ 网格预览   │ │
│  └─────┬──────┘ │
│        │         │
│        ▼         │
│  ┌────────────┐ │
│  │ 用户选择   │ │
│  └─────┬──────┘ │
│        │         │
│        ▼         │
│  ┌────────────┐ │
│  │ 批量下载   │ │
│  └────────────┘ │
└─────────────────┘
```

### 6.4 浏览器扩展的独特优势：零反爬

```
┌──────────────────────────────────────────┐
│  扩展模式（浏览器内）                      │
│                                          │
│  用户 Chrome ──→ 正常访问网站              │
│       │               │                  │
│       │          网站视角：真人用户         │
│       │          · 有 Cookie/登录态       │
│       │          · 有真实 IP             │
│       │          · 行为轨迹自然           │
│       │          · navigator.webdriver   │
│       │            = false               │
│       │                                  │
│  扩展注入 Content Script                  │
│  └── 只读 DOM，提取媒体                   │
│      对网站完全透明，无法检测               │
└──────────────────────────────────────────┘
```

### 6.5 跨域资源下载策略（架构关键决策）

浏览器扩展中，Content Script 运行在源页面 DOM 内，但媒体资源常托管在第三方 CDN（跨域）。Content Script 无法直接 fetch 跨域资源来获取文件大小或生成缩略图。解决方案：

```
┌─────────────────────────────────────────────────────┐
│  Content Script（页面 A）                            │
│  · 扫描 DOM，收集 URL                                │
│  · 对于小图片（<500KB），postMessage → SW 代理 fetch │
│  · 对于大文件 / 未知大小，只收集 URL + 文件名        │
└───────────────────────┬─────────────────────────────┘
                        │ postMessage
┌───────────────────────▼─────────────────────────────┐
│  Service Worker（后台）                               │
│  · 拥有跨域 fetch 权限                               │
│  · 下载 → 缩略图生成（OffscreenCanvas）              │
│  · 回传 {thumbnail, size, width, height}             │
│  · 内存预算：最多同时处理 10 个请求                   │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│  用户触发下载                                        │
│  · chrome.downloads.download({url})  ← 直接 URL 下载 │
│  · 不需要先 fetch 整个文件                           │
│  · 文件大小等元数据在下载完成后从 chrome.downloads   │
│    API 获取（onChanged 事件）                        │
└─────────────────────────────────────────────────────┘
```

**关键原则**：
- 缩略图：≤500KB 的图片走 SW 拿缩略图；更大的跳过缩略图生成，直接显示类型图标
- 元数据优先：缩略图丢失用占位符，不阻塞提取流程
- 下载阶段无需预取：`chrome.downloads.download()` 直接传 URL，浏览器内核处理下载，不受 CORS 限制
- **SW 安全 fetch**：用 `Range: bytes=0-524287` 限制只取前 512KB，防止超大文件 OOM。`Content-Length` 头不可信时不走大小判断，统一限制 Range

### 6.6 扩展权限策略

| 权限 | 用途 | 审核风险 |
|------|------|----------|
| `activeTab` | 用户点击扩展图标时注入当前标签页 | ✅ 低，仅按需注入 |
| `downloads` | 调用 `chrome.downloads` API | ✅ 低，常见权限 |
| `scripting` | 注入 Content Script（MV3 替代 `content_scripts` 声明） | ✅ 低 |
| `storage` | 保存设置和历史记录（`chrome.storage.local`） | ✅ 低 |
| `<all_urls>`（可选） | 允许用户在任意页面输入 URL 抓取（而非仅当前标签页） | ⚠️ 需额外审核 |

> **策略**：默认使用 `activeTab` + 可选请求 `<all_urls>`（在用户首次使用「输入 URL」功能时通过 `chrome.permissions.request()` 动态请求）。`activeTab` 模式下，「抓当前页面」功能完全可用，「输入 URL 批量抓取」需要 `<all_urls>`。CLI/MCP 模式不受此限制。

---

## 7. 反爬策略（仅 CLI/MCP 模式需要）

浏览器扩展模式天然不受反爬影响（真用户浏览器）。以下策略仅针对 CLI/MCP 的 Playwright 模式：

| 等级 | 策略 | 描述 |
|------|------|------|
| 默认 | Stealth 伪装 | 隐藏 webdriver 标记，模拟真实 UA/插件/语言 |
| 默认 | 随机延迟 | 操作间隔加入随机等待 |
| 默认 | Referer/Origin | 自动补全请求头 |
| 增强 | 代理轮换 | 支持 HTTP/SOCKS5 代理池 |
| 增强 | 行为模拟 | 非线性滚动、人类鼠标轨迹 |
| 增强 | 打码平台 | 对接 2captcha/capsolver |
| 终极 | CDP 连接 | 连到用户真实 Chrome，同扩展模式 |

---

## 8. 非功能需求

| 类别 | 需求 | 指标 |
|------|------|------|
| 性能 | 普通页面提取 < 5s | 200 张图片以内 |
| 性能 | 下载速度 | 并发 5 个请求 |
| 性能 | CSS 背景图扫描上限 | 最多 2000 个元素 |
| 体积 | 扩展包 < 2MB | 不含依赖 |
| 内存 | 缩略图缓存上限 | 50 张 LRU，超出用占位符 |
| 内存 | SW 并发 fetch 上限 | 10 个请求 |
| 内存 | 结果面板常驻 | < 200MB（含缩略图） |
| 兼容 | Chrome 版本 | ≥ 110 |
| 兼容 | 操作系统 | Windows / macOS / Linux |
| 安全 | 不发送用户数据到外部 | 纯本地处理 |
| 安全 | 下载不执行 | 只保存文件，不运行 |
| 安全 | 文件名安全 | 过滤路径穿越 + 非法字符 |
| 隐私 | Content Script 最小权限 | 只读 DOM，不拦截请求 |
| 工程 | 核心引擎同构边界 | `core/` 不依赖 `fs`/`path`/`process` 等 Node API，可在浏览器和 Node.js 双端运行。平台特定能力（文件下载、DOM 访问、网络请求）由各包自行注入 |

---

## 8.5 测试策略

| 层级 | 范围 | 工具 | 覆盖率目标 | 说明 |
|------|------|------|-----------|------|
| 单元测试 | `packages/core` 提取器、去重、过滤、文件名清理 | Vitest | ≥ 90% | 纯逻辑，无 DOM/浏览器依赖 |
| 单元测试 | `packages/core` 类型定义、工具函数 | Vitest | ≥ 80% | 边界用例覆盖 |
| 集成测试 | 跨域下载策略（SW ↔ Content Script 通信） | Vitest + chrome API mock | 核心路径覆盖 | 用 `sinon-chrome` 或手写 mock |
| E2E 测试 | 浏览器扩展（popup + 结果面板） | Playwright + Chrome | 关键用户路径 | 低成本：仅验证 P0 流程，不追求覆盖率 |
| E2E 测试 | CLI 工具 | Vitest + Playwright | 核心命令覆盖 | 真实 HTTP 页面抓取验证 |

> **Mock 策略**：`chrome.*` API 使用 `sinon-chrome` 或自定义 mock 层；扩展测试可在 Node 环境运行（无需浏览器实例）。E2E 仅覆盖「抓取 → 预览 → 下载」主流程。

## 8.6 CI/CD 与版本管理

| 方面 | 方案 |
|------|------|
| Monorepo 版本管理 | [Changesets](https://github.com/changesets/changesets) — 自动生成 changelog + 版本 bump |
| CI 平台 | GitHub Actions |
| CI 流程 | lint → typecheck → unit test → build → (tag 触发) publish |
| 发布目标 | Chrome Web Store（扩展）、npm（core/cli/mcp）、MCP Registry（mcp） |
| 扩展自动发布 | `chrome-webstore-upload-cli` + GitHub Actions，tag 触发 |
| 构建产物 | Vite 多入口（popup/content/panel/background）输出到 `dist/` |

## 8.7 国际化 (i18n)

- Chrome Web Store 上架多语言是加分项
- 一期仅支持中/英文，使用 Chrome `chrome.i18n` API（`_locales/zh_CN/messages.json` + `_locales/en/messages.json`）
- 核心引擎和 CLI 保持英文日志，不涉及 i18n
- 自动翻页的「下一页」/「Next」/「次へ」等多语言检测逻辑独立于 UI i18n

## 8.8 伦理与合规

- CLI/MCP 模式抓取前检查目标站点的 `robots.txt`（缓存在 `~/.media-scraper/robots-cache/`，1 小时过期）
- 遵守 `X-Robots-Tag: noarchive` 等 HTTP 头
- 下载限速：同一域名最多 5 并发，请求间隔 ≥ 200ms（CLI/MCP 可配置）
- 用户协议：仅供个人合法使用，不得用于盗版或侵权行为
- 浏览器扩展模式不受 robots.txt 限制（真用户行为），但仍建议遵守版权法

---

## 9. 开发里程碑

### Phase 1 — 核心引擎（MVP）

- [ ] `packages/core` 提取器实现
- [ ] 图片提取：img / picture / Head 元数据（og:image / JSON-LD / preload 等）/ 懒加载（含 MutationObserver 策略）
- [ ] 视频提取：直链（mp4/webm）+ 流媒体检测（m3u8/mpd 标记）
- [ ] 音频 + 文档提取
- [ ] 去重 + 过滤 + 文件名清理
- [ ] 跨域下载策略实现（SW 代理 fetch + Range 限流 512KB + 缩略图预算）
- [ ] 错误处理矩阵（超时部分返回、403/404 灰显、SW 重试幂等）
- [ ] 单元测试 ≥ 90% 覆盖率

### Phase 2 — 浏览器扩展

- [ ] Manifest V3 骨架 + 权限声明（activeTab + downloads + scripting）
- [ ] Popup UI + 停止按钮
- [ ] 结果面板（新标签页）+ 缩略图缓存（50 张 LRU）
- [ ] 网格预览 + 选择 + 键盘快捷键（方向键/空格/Enter/Ctrl+A/Escape）
- [ ] 视频/音频直链预览（新标签页打开）
- [ ] 下载功能（chrome.downloads API）+ 跨域 SW 中继（Range: bytes=0-524287）
- [ ] 大图预览
- [ ] 历史记录
- [ ] 中/英 i18n（chrome.i18n API）

### Phase 3 — CLI 工具

- [ ] Node.js CLI 入口
- [ ] Playwright 集成
- [ ] 反爬策略实现（Stealth + 代理轮换 + 行为模拟）
- [ ] m3u8/mpd 下载支持（ffmpeg / yt-dlp 集成）
- [ ] 断点续传（HTTP Range + .part 临时文件）
- [ ] robots.txt 检查（缓存 1h）
- [ ] 下载限速（同域 5 并发 / 200ms 间隔）
- [ ] JSON 输出模式
- [ ] 批量下载

### Phase 4 — MCP Server

- [ ] MCP Server 骨架
- [ ] `scrape_media` 工具（含流媒体标记）
- [ ] `download_media` 工具（含 ffmpeg 集成）
- [ ] Hermes 集成测试

### Phase 5 — 增强

- [ ] 批量 URL 支持
- [ ] 自动翻页（URL 分页 + SPA/无限滚动 + 多语言「下一页」检测）
- [ ] 智能探索（缩略图→大图跟进）
- [ ] CSS 背景图提取（P1，CSSOM 直接读规则，避免 getComputedStyle 遍历）
- [ ] iframe 内嵌提取（P1，同源递归 + 跨域静默跳过）
- [ ] Shadow DOM 提取（P2）
- [ ] 导出 JSON/CSV
- [ ] 结果面板侧边栏版本（chrome.sidePanel）
- [ ] CI/CD 流水线（lint → test → build → publish）
- [ ] Changesets 版本管理
- [ ] Chrome Web Store 上架 + npm 发布

### Phase 6 — 运营

- [ ] Chrome 扩展审核通过
- [ ] npm 包发布（core/cli/mcp）
- [ ] 用户文档 + 示例

---

## 10. 竞品参考

| 工具 | 优势 | 劣势 |
|------|------|------|
| Image Downloader (Chrome 扩展) | 简单直接 | 只支持图片，无懒加载 |
| DownThemAll | 功能强大 | 仅 Firefox，体验老旧 |
| 右键另存为 | 无需安装 | 逐张操作，效率极低 |
| wget/curl | 脚本化强 | 无法处理 JS 渲染的页面 |

---

## 11. 附录：关键类型定义

```typescript
// 媒体资源类型
type MediaType = 'image' | 'video' | 'audio' | 'document' | 'unknown';

// 单个资源
interface MediaResource {
  id: string;           // 唯一标识
  url: string;          // 原始 URL
  type: MediaType;      // 类型
  filename: string;     // 文件名
  extension: string;    // 扩展名
  size: number | null;  // 文件大小（字节，可能未知）
  width: number | null; // 图片宽度
  height: number | null;// 图片高度
  thumbnail: string | null; // 缩略图（base64 data URL）
  source: 'img' | 'video' | 'audio' | 'background' | 'link' | 'lazy-load' | 'iframe' | 'shadow-dom' | 'head-meta' | 'm3u8' | 'mpd';
}

// 抓取结果
interface ScrapeResult {
  url: string;                    // 源 URL
  title: string;                  // 页面标题
  total: number;                  // 资源总数
  images: MediaResource[];
  videos: MediaResource[];
  audio: MediaResource[];
  documents: MediaResource[];
  duration: number;               // 耗时（ms）
  timestamp: number;              // 抓取时间
}

// 抓取选项
interface ScrapeOptions {
  url: string | string[];         // 单个或多个 URL
  types?: MediaType[];            // 要提取的类型
  minSize?: number;               // 最小图片尺寸（px）
  maxPages?: number;              // 自动翻页最大页数
  exploreDepth?: number;          // 探索深度
  timeout?: number;               // 超时时间（ms）
  proxy?: string;                 // 代理（CLI 模式）
  userAgent?: string;             // 自定义 UA
}

// 下载选项
interface DownloadOptions {
  resources: MediaResource[];
  outputDir: string;              // 输出目录
  concurrency?: number;           // 并发数
  organizeByType?: boolean;       // 按类型分目录
  onProgress?: (progress: DownloadProgress) => void;
}

interface DownloadProgress {
  completed: number;
  total: number;
  current: string;                // 当前文件名
  speed: number;                  // 字节/秒
}
```

---

> 下一步：Review 本需求文档，确认后进入 Phase 1 开发。
