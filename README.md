# Koradio

> Status: **Documentation-first · Not yet implemented · Not currently runnable**  
> Audience: AI Coding Agents、开发者、维护者  
> Runtime: 当前仓库没有源码、依赖清单、启动脚本或已确认端口

## 1. 项目入口

Koradio 是一个面向单台设备的私人 AI 音乐电台。

用户描述当前场景后，目标系统将：

```text
场景输入
  → Codex 生成结构化节目计划与 DJ 串讲
  → 网易云音乐服务解析歌曲、播放链接与歌词
  → Fish Audio 兼容服务生成可选 DJ 语音
  → 本地服务提交节目与播放队列
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
- [x] 视觉设计系统已定义
- [x] 15 个高保真页面状态已有参考图
- [x] 开发前视觉设计资产任务与裁决机制已定义
- [x] VDA-00 资产盘点与差距审计已完成，A / B / C 级裁决已记录
- [x] AI 工作规范与工程规则已建立
- [x] Git 仓库已初始化并关联 GitHub 远端
- [x] HTML 视觉设计主源骨架已建立（VDA-01 已完成）
- [x] CSS Variables、共享组件、原型 SVG 图标与 Dark / Light 组件目录已建立（VDA-02 已完成）
- [x] 异常与 Profile 01–03 Dark HTML 视觉页面已建立（VDA-03 已完成）
- [x] Radio 三态 04–06 Dark HTML 视觉页面已建立（VDA-04 已完成）
- [x] VDA-02–04 尺度补正已完成自动检查与用户视觉验收；共享组件尺度确认点已关闭
- [x] Detail Sheet 07–08 Dark HTML 视觉页面已建立，并完成波形、专属内容列、卡片尺寸与间距的浏览器反馈视觉校准（VDA-05 已完成）
- [x] 01–08、共享组件尺度与 Detail Sheet 双态已通过核心体验确认门
- [x] Library 09 Dark HTML 视觉页面与结果、导入中、空库、无结果、服务异常五种固定变体已建立，并通过自动检查与用户视觉验收（VDA-06 已完成）
- [ ] 其余 6 个页面的完整 HTML 视觉基线尚未建立
- [ ] Monorepo 尚未创建
- [ ] Frontend 尚未实现
- [ ] Local Service 尚未实现
- [ ] SQLite schema 与 migrations 尚未实现
- [ ] Provider adapters 尚未实现
- [ ] 自动化测试尚未建立
- [ ] 安装、开发、测试和构建命令尚未确定

### Agent safety note

当前所有代码目录、命令、端口、版本和运行行为均不能从仓库验证。

AI Agent **不得**：

- 把目标目录树描述成现有代码。
- 把目标技术栈描述成已安装依赖。
- 猜测包管理器、Node.js 版本、端口或脚本名。
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
2. 配置本地 Codex、网易云 API 与可选 TTS 能力。
3. 在 Radio 页面描述当前场景。
4. 生成节目计划、DJ 开场和歌曲队列。
5. 播放、暂停、切歌、seek 并查看歌词或串讲。
6. 记录喜欢、不喜欢、跳过和收藏。
7. 将反馈投影为可读、可编辑的品味档案。
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
  ├─ Library / Taste / Feedback / Settings
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
| SQLite | Profile、Taste、Program、Queue、Feedback 等结构化事实 |
| Local File Store | 音频缓存、头像、歌词缓存和受控文件引用 |
| External Providers | Codex、网易云与 TTS；均视为不可信、可失败依赖 |

### 关键不变量

- Browser Audio Engine 是实时播放状态的唯一事实源。
- Backend 是持久领域状态和业务规则的唯一事实源。
- Profile 是本地数据分区，不是认证或安全边界。
- MVP 只有一个 active playback session。
- Provider 只能通过 Backend Adapter 访问。
- TTS 失败必须降级为文字 DJ，不得中断可播放节目。
- Feedback 是 append-only 事实；Taste projection 必须可重建。
- 密钥不得进入浏览器、数据库明文、URL、日志或错误报告。

## 5. 目标技术栈

> 下表来自目标架构。`Status` 全部为 **Planned**，不代表依赖已经安装。

| Area | Planned technology | Status |
|---|---|---|
| Language | TypeScript | Planned |
| Repository | TypeScript monorepo | Planned |
| Frontend | React + Vite | Planned |
| App delivery | Web / PWA | Planned |
| Server state | TanStack Query | Planned |
| Cross-component UI state | Zustand | Planned |
| Audio | Browser `HTMLAudio` | Planned |
| Backend | Node.js + Fastify modular monolith | Planned |
| API | REST `/api/v1` + WebSocket events | Planned |
| Runtime validation | Zod | Planned |
| Database | SQLite | Planned |
| ORM / migrations | Drizzle | Planned |
| Secrets | OS Credential Store | Planned |
| AI orchestration | Local Codex process | Planned |
| Music provider | NetEase-compatible API | Planned |
| Voice provider | Fish Audio-compatible TTS | Planned |

尚未决定：

- Package manager。
- Node.js 和依赖版本。
- Workspace 工具。
- Development / production 端口。
- Test runner 与浏览器测试工具。
- Lint、format、typecheck 的具体工具和脚本名。

## 6. 目录结构

### 当前真实目录

```text
Koradio/
├── README.md
├── AGENTS.md
├── AI_RULES.md
├── context.md
├── architecture.md
├── docs/
│   ├── prd.md
│   └── user-flow.md
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
    │   └── reports/
    │       ├── visual-audit.md
    │       ├── visual-decisions.md
    │       └── evidence/
    │           └── vda-00-*.png
    ├── tasks/
    │   └── visual-assets.md
    └── references/
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
│       │   └── settings/
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
        │   └── settings/
        ├── integrations/
        └── platform/
packages/
├── contracts/
└── design-tokens/
```

模块边界、依赖方向和目录责任以 [architecture.md](architecture.md) 为准。

## 7. 开发与启动

### 当前可执行状态

**当前不能安装、启动、测试或构建 Koradio。**

`design/assets/prototype/index.html` 是可直接在浏览器打开的零构建设计预览骨架，不是 Koradio 产品运行入口。

原因：

- 没有 `package.json` 或 workspace manifest。
- 没有源码入口。
- 没有依赖锁文件。
- 没有环境变量模板。
- 没有数据库 schema 或 migration。
- 没有运行脚本。
- 没有测试配置。
- 没有已确认的端口。

本 README 不提供候选命令，防止 AI Agent 将计划误判为仓库事实。

### 脚手架落地后必须补齐

- [ ] Required Node.js 版本。
- [ ] Package manager 与锁文件。
- [ ] 一次性安装命令。
- [ ] Frontend 与 Local Service 开发命令。
- [ ] 同源生产构建与启动命令。
- [ ] Typecheck、lint、format check 命令。
- [ ] Unit、integration、component 与 E2E 测试命令。
- [ ] SQLite migration 与数据备份命令。
- [ ] 必需环境变量和 Secret Store 初始化方式。
- [ ] 默认绑定地址与端口。
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
| 开发前视觉设计资产沉淀 | [design/tasks/visual-assets.md](design/tasks/visual-assets.md) |
| 视觉资产审计与裁决 | [design/assets/reports/visual-audit.md](design/assets/reports/visual-audit.md) + [design/assets/reports/visual-decisions.md](design/assets/reports/visual-decisions.md) |
| 工程实现或代码审查 | [AI_RULES.md](AI_RULES.md) |
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

任何实际脚手架方案都必须先解决当前“尚未决定”项，并与 `architecture.md` 和 `AI_RULES.md` 对齐。

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
