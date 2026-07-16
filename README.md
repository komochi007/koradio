# Koradio

> Status: **Documentation-first · Product not yet implemented · Product not currently runnable**
> Audience: AI Coding Agents、开发者、维护者  
> Runtime: 当前仓库没有产品源码、依赖清单、启动脚本或已实装端口；零构建设计预览不等于产品运行入口

## 1. 项目入口

Koradio 是一个面向单台设备的私人 AI 音乐电台。

用户描述当前场景后，目标系统将：

```text
场景输入
  → Codex 生成结构化节目计划与 DJ 串讲
  → 网易云音乐服务解析歌曲、播放链接与歌词
  → Apple AVSpeechSynthesizer 通过本机原生 helper 生成可选 DJ 语音
  → 本地服务原子提交节目与播放时间线
  → 浏览器 Audio Engine 播放并收集反馈
  → 反馈写入本地品味档案，影响后续节目
```

本 README 是项目入口层，用于快速回答：

- 当前仓库处于什么阶段？
- Koradio 解决什么问题？
- 目标系统如何拆分？
- 哪些技术已确定、哪些尚未落地？
- AI Agent 应该先读取哪些 Context？
- 当前能否安装、启动、测试或构建？

完整需求、架构和视觉细节保留在对应权威文档中，不在此重复展开。

## 2. 当前状态

### Repository reality

- [x] 产品需求已定义
- [x] 用户流程已定义
- [x] 目标系统架构已定义
- [x] AI 工作规范与工程规则已建立
- [x] Git 仓库已初始化并关联 GitHub 远端
- [x] VDA-17 视觉基线已冻结：HTML / CSS / JavaScript 视觉主源、15 页 35 个固定状态、Dark / Light、五类响应式布局与 60 张正式截图基线均已建立
- [x] 视觉差异裁决、自动 QA、Figma 派生镜像与开发交接映射已建立
- [x] 从当前基线到 macOS v1.0 的项目路线图、任务登记和发布门已建立
- [x] 工具链与质量基线已由 [ADR 0001](docs/adr/0001-toolchain-and-quality.md) 冻结；尚未实装
- [x] 运行拓扑、端口、Origin allowlist 与本地会话已由 [ADR 0002](docs/adr/0002-runtime-topology.md) 冻结；尚未实装
- [x] macOS 两种包装形态已完成隔离 PoC；[ADR 0003](docs/adr/0003-macos-packaging.md) 已接受 native launcher + 外部浏览器 PWA，当前仅限受控本机个人使用，尚未实装
- [ ] Provider 可行性尚未关闭；[ADR 0004](docs/adr/0004-provider-feasibility.md) 处于提议状态，Codex、网易云搜索/歌词/歌单和 Apple TTS 已验证，网易云播放 URL 官方端点存在但当前应用未授权
- [ ] Monorepo 尚未创建
- [ ] Frontend 尚未实现
- [ ] Local Service 尚未实现
- [ ] SQLite schema 与 migrations 尚未实现
- [ ] Provider adapters 尚未实现
- [ ] 自动化测试尚未建立
- [ ] 已选定的安装、开发、测试和构建命令尚未创建或验证

### Agent safety note

当前所有产品代码目录、可执行命令、端口和运行行为均不能从仓库验证。工具链的目标版本和命令合同已经写入 ADR 0001，运行拓扑、端口与本地会话已经写入 ADR 0002，包装与交付边界已经写入 ADR 0003；Provider 可行性验证见 ADR 0004，但该 ADR 尚未接受。这些文档都不代表依赖、配置、端口监听、服务、Provider adapter 或安装包已经存在。

视觉资产的权威关系为：产品行为看 PRD，流程看 User Flow，明确 UI 规则看 `design/design.md`，当前视觉实现语义看 `design/assets/prototype/`，正式 PNG 只用于回归，Figma 只用于协作查看。完整追溯见 [handoff map](design/assets/reports/handoff-map.md)。

AI Agent **不得**：

- 把目标目录树描述成现有代码。
- 把目标技术栈描述成已安装依赖。
- 把 ADR 选定的包管理器、Node.js 版本或脚本名描述成已经安装或可运行的事实。
- 把 ADR 0002 选定的端口、进程关系或 session bootstrap 描述为已经实装或可运行。
- 把 ADR 0003 的已接受架构描述为已经实现，或把本地 ad-hoc 产物描述为已通过 Developer ID 签名公证、可公开分发。
- 声称应用、测试、构建或数据库可以运行。
- 从参考图推断尚未写入权威文档的业务规则。

## 3. 产品快照

### 核心目标

让有明确音乐品味的用户通过一句场景描述，获得一段包含节目策划、DJ 串讲、歌曲队列、歌词跟随和反馈记忆的私人电台体验。

### 目标用户

- 有长期听歌习惯和个人歌单。
- 会按工作、写作、通勤、夜晚放松等场景主动找歌。
- 希望获得策展式节目，而不是无解释的算法列表。
- 接受本地优先、单设备、非云账号的 MVP 形态。

### MVP 核心闭环

1. 创建或选择本地电台档案。
2. 配置本地 Codex 与网易云核心能力，并检测可选 Apple 系统 TTS。
3. 在 Radio 页面描述当前场景。
4. 生成节目计划、DJ 开场和歌曲队列。
5. 播放、暂停、切歌、seek 并查看歌词或串讲。
6. 记录喜欢/撤销、不喜欢/撤销、跳过和节目收藏/撤销。
7. 将反馈投影与人工规则合并为可读、可编辑的品味档案。
8. 在后续节目中使用品味、历史和场景上下文。

### 功能优先级

| Priority | Capability |
|---|---|
| P0 | 本地档案创建与选择 |
| P0 | 场景点歌与节目生成 |
| P0 | 播放控制与队列管理 |
| P0 | Radio Detail Sheet 沉浸节目界面 |
| P0 | 反馈与品味沉淀 |
| P0 | 服务配置与健康检查 |
| P1 | 音乐库搜索与歌单导入 |
| P1 | 品味档案查看与编辑 |
| P1 | 节目历史与场景复用 |

### MVP 非目标

- 云账号与跨设备同步。
- 支付、订阅和会员体系。
- 公开社区、歌单广场和多人同步收听。
- 完整 24/7 自动电台与复杂日程编排。
- 多音乐源聚合。
- 分布式微服务。
- 真实频谱预分析。
- 远程公网访问。

## 4. 目标系统概览

```text
Listener
  ↓
React PWA
  ├─ Feature UI
  ├─ TanStack Query
  └─ Browser Audio Engine
       ↓ REST / WebSocket
Fastify Local Service
  ├─ Profiles / Programs / Playback
  ├─ Library / Taste / Feedback
  ├─ DeviceSettings / ProfilePreferences
  ├─ SQLite / Local File Store / Secret Store
  └─ Provider Ports
       ├─ Codex Adapter
       ├─ NetEase Adapter
       └─ TTS Provider Adapter
```

### 系统边界

| Boundary | 目标职责 |
|---|---|
| Browser Client | 页面、交互、查询缓存和实时媒体状态 |
| Audio Engine | 唯一 `HTMLAudio` 实例、时间线、seek、媒体错误和 checkpoint |
| Local Service | 业务规则、任务编排、持久化、外部服务访问和事件发布 |
| SQLite | Profile、Taste、Program、PlaybackTimeline、Feedback 等结构化事实 |
| Local File Store | 音频缓存、头像、歌词缓存和受控文件引用 |
| External Providers | Codex 与网易云；均视为不可信、可失败依赖 |
| Native TTS | bundled macOS helper 调用 Apple `AVSpeechSynthesizer`；本机能力仍可失败并必须文字降级 |

### 关键不变量

- Browser Audio Engine 是实时播放状态的唯一事实源。
- Backend 是持久领域状态和业务规则的唯一事实源。
- Profile 是本地数据分区，不是认证或安全边界。
- MVP 只有一个 active playback session；多标签通过 TTL lease 选出唯一主控。
- Provider 只能通过 Backend Adapter 访问。
- TTS 失败必须降级为文字 DJ，不得中断可播放节目。
- Feedback 是显式 append-only 事实；TasteProjection 可重建且不覆盖 TasteOverrides。
- DeviceSettings 是设备级配置，ProfilePreferences 是档案级偏好；TTS 是可选增强。
- 密钥不得进入浏览器、数据库明文、URL、日志或错误报告。

## 5. 目标技术栈

> 产品技术来自目标架构；工具链精确版本来自 [ADR 0001](docs/adr/0001-toolchain-and-quality.md)。`Selected` 只表示决策已完成，不代表依赖已经安装。

| Area | Planned technology | Status |
|---|---|---|
| Runtime | Node.js 24.18.0 LTS | Selected · not installed |
| Package management | Corepack 0.35.0 + pnpm 11.13.0 | Selected · not installed |
| Language | TypeScript 6.0.3 | Selected · not installed |
| Repository | pnpm native TypeScript workspace | Selected · not created |
| Frontend | React + Vite | Planned |
| Frontend build | Vite 8.1.4 | Selected · not installed |
| App delivery | Web / PWA | Planned |
| Server state | TanStack Query | Planned |
| Cross-component UI state | Zustand | Planned |
| Audio | Browser `HTMLAudio` | Planned |
| Backend | Node.js + Fastify modular monolith | Planned |
| API | REST `/api/v1` + WebSocket events | Planned |
| Development topology | Vite `127.0.0.1:5173` + Local Service `127.0.0.1:49373` | Selected · not implemented |
| Production topology | Same-origin PWA / REST / WebSocket on loopback, preferred port `49373` with bounded fallback `49373-49383` | Selected · not implemented |
| Local session | `POST /api/v1/session/bootstrap`, memory-only token, exact Origin allowlist, WebSocket first-message auth | Selected · not implemented |
| Runtime validation | Zod | Planned |
| Database | SQLite | Planned |
| ORM / migrations | Drizzle | Planned |
| Secrets | OS Credential Store | Planned |
| AI orchestration | Local Codex process | Planned |
| Music provider | NetEase OpenAPI / compatible API | Proposed · blocked on play URL authorization |
| Voice provider | Apple `AVSpeechSynthesizer` via bundled native helper；standard installed voices only | Selected · not implemented |
| Unit / integration test | Vitest 4.1.10 + V8 coverage | Selected · not installed |
| Component test | React Testing Library 16.3.2 + jsdom 29.1.1 | Selected · not installed |
| Browser / visual / a11y test | Playwright 1.61.1 + axe-core | Selected · not installed |
| Lint / format | ESLint 10.7.0 + typescript-eslint 8.64.0 + Prettier 3.9.5 | Selected · not installed |
| CI | GitHub Actions | Selected · not configured |

已由 [ADR 0002](docs/adr/0002-runtime-topology.md) 决定但尚未实装：

- Development / production 拓扑、端口、进程关系、session bootstrap 与 Origin allowlist。
- Development 使用 Vite `127.0.0.1:5173` + Local Service `127.0.0.1:49373`。
- Production 使用同源 Local Service，首选 `49373`，仅允许 `49373-49383` 有界 fallback。
- Token 通过 `POST /api/v1/session/bootstrap` 的 `no-store` JSON 响应进入浏览器内存；WebSocket 不使用 URL token。

由 [ADR 0003](docs/adr/0003-macos-packaging.md) 决定但尚未实装：

- 推荐 macOS 13.5+、arm64/x64 分架构 DMG、原生轻量 launcher + bundled Node Local Service + bundled native TTS helper + 外部浏览器 PWA。
- 当前只允许项目所有者从可信源码在受控本机构建并个人使用，不提供公开下载。
- Developer ID 签名、公证、ticket staple、Gatekeeper 和独立干净环境仍未验证；这些是未来任何外部分发的硬门，不阻塞当前本地开发。

由 [ADR 0004](docs/adr/0004-provider-feasibility.md) 验证但尚未接受：

- 本机 Codex CLI、网易云 `ncm-cli`、网易云搜索/歌词/歌单调用和 Apple 系统 TTS 可用。
- 网易云“获取歌曲播放url”官方端点已定位为 `/openapi/music/basic/song/playurl/get/v2`，但当前开放平台应用未授权该接口。
- `ncm-cli play` 只返回 `orpheus://` 唤端结果，不能作为 Browser Audio Engine 的播放事实源。

尚未决定：

- Provider 的完整可行性裁决、数据库和其他业务依赖的具体包与精确版本；Apple 系统 TTS 的 v1 接入形态已经由项目所有者明确。

## 6. 目录结构

### 当前真实目录

```text
Koradio/
├── README.md
├── AGENTS.md
├── AI_RULES.md
├── context.md
├── architecture.md
├── design-qa.md
├── docs/
│   ├── adr/
│   │   ├── README.md
│   │   ├── template.md
│   │   ├── 0000-development-baseline.md
│   │   ├── 0001-toolchain-and-quality.md
│   │   └── 0002-runtime-topology.md
│   ├── prd.md
│   ├── user-flow.md
│   └── project-management/
│       ├── README.md
│       ├── roadmap.md
│       ├── tasks.md
│       └── release-checklist.md
└── design/
    ├── design.md
    ├── prompt.md
    ├── assets/
    │   ├── fixtures/
    │   │   └── pages.js
    │   ├── icons/
    │   │   ├── koradio-brand-mark.svg
    │   │   ├── koradio-icons-overview.svg
    │   │   ├── tab-radio.svg
    │   │   ├── tab-library.svg
    │   │   ├── tab-taste.svg
    │   │   ├── tab-programs.svg
    │   │   └── tab-settings.svg
    │   ├── prototype/
    │   │   ├── README.md
    │   │   ├── index.html
    │   │   ├── catalog.html
    │   │   ├── catalog.css
    │   │   ├── catalog.js
    │   │   ├── tokens.css
    │   │   ├── components.css
    │   │   ├── styles.css
    │   │   └── app.js
    │   ├── baselines/
    │   │   ├── README.md
    │   │   ├── manifest.json
    │   │   ├── dark/
    │   │   ├── light/
    │   │   └── responsive/
    │   ├── scripts/
    │   │   └── vda-14-baselines.cjs
    │   └── reports/
    │       ├── visual-audit.md
    │       ├── visual-decisions.md
    │       ├── handoff-map.md
    │       └── evidence/
    │           └── vda-00-*.png
    ├── tasks/
    │   └── visual-assets.md
    └── references/
        ├── README.md
        ├── 01-service-offline.png
        ├── 02-profile-select.png
        ├── ...
        ├── 15-settings-diagnostics.png
        └── source/
            ├── AI音乐电台结构图.jpg
            └── AI音乐电台施工图.jpg
```

### 目标代码目录

> 以下结构来自 `architecture.md`，尚不存在。

```text
apps/
├── web/
│   └── src/
│       ├── app/
│       ├── features/
│       │   ├── profiles/
│       │   ├── radio/
│       │   ├── programs/
│       │   ├── library/
│       │   ├── taste/
│       │   ├── feedback/
│       │   ├── device-settings/
│       │   └── profile-preferences/
│       ├── audio/
│       └── shared/
└── server/
    └── src/
        ├── bootstrap/
        ├── modules/
        │   ├── profiles/
        │   ├── programs/
        │   ├── playback/
        │   ├── library/
        │   ├── taste/
        │   ├── feedback/
        │   ├── device-settings/
        │   └── profile-preferences/
        ├── integrations/
        └── platform/
packages/
├── contracts/
└── design-tokens/
```

模块边界、依赖方向和目录责任以 [architecture.md](architecture.md) 为准。

## 7. 开发与启动

### 当前可执行状态

**当前不能安装、启动、测试或构建 Koradio 产品。**

`design/assets/prototype/index.html` 是可直接在浏览器打开的零构建设计预览骨架，不是 Koradio 产品运行入口。

原因：

- 没有 `package.json` 或 workspace manifest。
- 没有源码入口。
- 没有依赖锁文件。
- 没有环境变量模板。
- 没有数据库 schema 或 migration。
- 没有运行脚本。
- 没有测试配置。
- 没有已实装并验证的端口监听。

[ADR 0001](docs/adr/0001-toolchain-and-quality.md) 已固定未来根 script 名和 CI 安装合同，但本 README 在 S1 实装并验证前不提供可复制的运行命令，防止将计划误判为仓库事实。

### 脚手架落地后必须补齐

- [ ] 实装并验证 ADR 0001 选定的 Node.js 版本。
- [ ] 实装并验证 Corepack、pnpm 与单一锁文件。
- [ ] 一次性安装命令。
- [ ] Frontend 与 Local Service 开发命令。
- [ ] 同源生产构建与启动命令。
- [ ] Typecheck、lint、format check 命令。
- [ ] Unit、integration、component 与 E2E 测试命令。
- [ ] SQLite migration 与数据备份命令。
- [ ] 必需环境变量和 Secret Store 初始化方式。
- [ ] ADR 0002 选定的默认绑定地址、端口、Origin allowlist 与 session bootstrap。
- [ ] Provider mock / offline development 模式。
- [ ] 健康检查与故障诊断入口。

## 8. AI Agent Bootstrap

### 每次任务最小读取顺序

1. 阅读本 README，确认当前项目状态。
2. 阅读 [AGENTS.md](AGENTS.md)，遵循执行流程。
3. 阅读 [AI_RULES.md](AI_RULES.md)，加载工程硬约束。
4. 阅读 [context.md](context.md)，建立稳定领域认知。
5. 按任务类型读取对应权威文档。
6. 重新检查真实文件树，不依赖文档推测代码存在。

### 按任务加载 Context

| Task | Required context |
|---|---|
| 产品范围、验收、字段或文案 | [docs/prd.md](docs/prd.md) |
| 用户路径、状态分支或异常流程 | [docs/user-flow.md](docs/user-flow.md) |
| 模块、状态归属、API、数据或安全 | [architecture.md](architecture.md) |
| UI、组件、token、响应式或无障碍 | [design/design.md](design/design.md) |
| 高保真原型生成 | [design/prompt.md](design/prompt.md) + [design/references/](design/references/) |
| 已完成的视觉资产任务历史 | [design/tasks/visual-assets.md](design/tasks/visual-assets.md) |
| 视觉资产审计与裁决 | [design/assets/reports/visual-audit.md](design/assets/reports/visual-audit.md) + [design/assets/reports/visual-decisions.md](design/assets/reports/visual-decisions.md) |
| 前端视觉实现与冻结版本追溯 | [design/assets/reports/handoff-map.md](design/assets/reports/handoff-map.md) |
| 项目进度、任务依赖与发布门 | [docs/project-management/README.md](docs/project-management/README.md) + [任务登记表](docs/project-management/tasks.md) |
| 工程实现或代码审查 | [AI_RULES.md](AI_RULES.md) |
| 工具链、构建、测试、命令或 CI | [docs/adr/0001-toolchain-and-quality.md](docs/adr/0001-toolchain-and-quality.md) + [AI_RULES.md](AI_RULES.md) |
| Agent 执行与协作 | [AGENTS.md](AGENTS.md) |
| 快速恢复项目认知 | [context.md](context.md) |

### 权威关系

| Concern | Source of truth |
|---|---|
| 产品范围与行为 | `docs/prd.md` |
| 用户操作流程 | `docs/user-flow.md` |
| 系统边界、所有权与目标架构 | `architecture.md` |
| UI、动效和无障碍 | `design/design.md` |
| 原型生成约束 | `design/prompt.md` |
| 工程实施规则 | `AI_RULES.md` |
| Agent 工作方式 | `AGENTS.md` |

文档发生冲突时，不得静默择一。先指出冲突及所属 Concern，再修改该 Concern 的权威文档，并同步所有受影响的摘要或规则文件。

## 9. 实现起点

第一个代码里程碑应建立可验证的最小骨架，而不是同时实现完整 MVP：

- 初始化已选定的 TypeScript workspace。
- 创建 `apps/web`、`apps/server` 和 `packages/contracts`。
- 建立健康检查和最小同源通信。
- 建立 Zod contract 与类型检查。
- 建立 SQLite migration 基础设施。
- 建立测试入口和 CI 可执行命令。
- 更新本 README 的开发启动章节。

实际脚手架必须实现 ADR 0001 和 ADR 0002，并与 `architecture.md` 和 `AI_RULES.md` 一起落地。

## 10. 文档维护 Checklist

以下变化发生时，必须在同一变更中更新本 README：

- [ ] 初始化 Git 或 monorepo。
- [ ] 确定包管理器、版本或 workspace 工具。
- [ ] 新增或修改安装、启动、测试、构建脚本。
- [ ] 修改真实目录结构或应用入口。
- [ ] 修改核心技术栈。
- [ ] 修改系统边界、模块 owner 或状态事实源。
- [ ] 修改 MVP 范围或优先级。
- [ ] 新增环境变量、端口或本地服务要求。
- [ ] 修改 Context 文件路径或权威关系。

同时检查：

- [ ] `context.md` 是否仍反映稳定项目事实。
- [ ] `AI_RULES.md` 是否与架构和设计规范一致。
- [ ] `AGENTS.md` 是否仍只描述工作方式。
- [ ] 所有相对链接是否有效。
- [ ] “当前事实”与“目标计划”是否仍被清晰区分。
