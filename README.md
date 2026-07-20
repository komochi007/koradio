# Koradio

[![Continuous Integration](https://github.com/komochi007/koradio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/komochi007/koradio/actions/workflows/ci.yml)

> Status: **S1 engineering scaffold complete · S2 platform foundations complete · S3 backend stage complete · S4 P0 frontend stage complete · runtime defaults to Mock mode**
> Audience: AI Coding Agents、开发者、维护者  
> Runtime: 当前仓库已有可安装、可开发启动、可生产构建的 Web/Local Service，以及路由、TanStack Query、短期内存 Session、事件重连、VDA-17 离线只读入口、Profile/Onboarding、可写 Settings、Radio 三态与节目生成交互、唯一 Browser Audio Engine、多标签租约、全屏 Detail 歌词/DJ 串讲跟随、七类反馈 UI、Library 搜索/试听/候选池/歌单导入、Taste 查看/人工编辑和仅静态 App Shell 的 Service Worker 缓存；后端领域、平台与 Provider adapters 已实现并通过边界测试，产品默认仍使用确定性 Mock Provider，bundled native TTS helper 尚未实现

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
- [x] 工具链与质量基线已由 [ADR 0001](docs/adr/0001-toolchain-and-quality.md) 冻结；运行版本、workspace、strict TypeScript、完整根命令族与 GitHub Actions CI 已实装并由真实 run 验证
- [x] Development 双进程、Production 同源静态托管、loopback 端口、精确 Origin、短期内存 Session、REST Bearer 与 WebSocket 首消息认证已实装；非法 Origin、过期/URL/持久化 token 和未认证连接均有负向验证
- [x] macOS 两种包装形态已完成隔离 PoC；[ADR 0003](docs/adr/0003-macos-packaging.md) 已接受 native launcher + 外部浏览器 PWA，当前仅限受控本机个人使用，尚未实装
- [x] Provider 可行性已由 [ADR 0004](docs/adr/0004-provider-feasibility.md) 关闭：接受 Codex CLI、TypeScript NetEase `linuxapi` Adapter 与 bundled Apple TTS helper，仅限 Personal Local Preview；三个 Backend Adapter 与生成运行时编排已实现，bundled native helper 仍待后续任务
- [x] pnpm TypeScript monorepo 的四个目标边界、运行版本、单一锁文件和最小源码入口已创建
- [x] React/Vite App Shell 已实现：五个一级 route、TanStack Query、短期内存 Session、事件重连、错误边界、VDA-17 离线异常页、只读 Settings 和仅静态壳的 PWA 缓存已验证；Profile/Onboarding、可写 Settings、Radio 三态、节目生成 command/Snapshot/有序事件与失败恢复、唯一 Browser Audio Engine、多标签租约、全屏 Detail 歌词/DJ 串讲跟随、七类反馈 UI、Library 搜索/试听/候选池/歌单导入、Taste 自动投影/人工规则/有效结果查看与编辑，以及 Programs 分页历史/详情/串讲重播/场景复用/收藏已接入
- [x] Fastify Local Service health/session/events、Profiles、Library、Feedback、Taste、Programs、Playback、异步节目生成、DeviceSettings、ProfilePreferences 与数据目录迁移路由已实现；生成命令立即返回 `202 + jobId`，终态可通过 REST Snapshot 恢复
- [x] 完整 v1 公共 Contracts 已用 Zod 固化：REST DTO/command、显式 `profileId`、`Idempotency-Key`、异步 job、WebSocket event 与安全 error envelope 均有正反向和兼容性测试
- [x] SQLite/Drizzle 底座已实现：首次启动选择 OS 应用数据目录，版本化 migration、WAL、foreign keys、严格文件权限和失败回滚测试已验证；Profile、TasteProjection、TasteOverrides、FeedbackEvent、DeviceSettings、ProfilePreferences、MusicTrack、PlaylistSource、LibraryItem、异步导入 job、Program、ProgramGenerationJob、ProgramTrack、DjScriptSegment、PlaybackTimelineItem 与 PlaybackCheckpoint owner 表已落地
- [x] Secret Store、File Store 与脱敏日志平台边界已实现：macOS Keychain 往返、headless 稳定错误、受控引用、扩展名/MIME/大小/重定向限制和敏感信息清除已验证；TTS Adapter 只向受控 File Store 写入校验后的音频，现有 Provider Adapters 不需要业务秘密
- [x] 本地 HTTP 安全边界已完成：每次 bootstrap 签发短期进程内 token，REST 与 WebSocket 共享校验，Web 只在内存持有 token，并支持 401 后重新 bootstrap 的重连基础
- [x] DeviceSettings 与 ProfilePreferences owner 已实现：设备配置和 Profile 偏好分表、分路由持久化，内置网易云与 Apple TTS 状态只读且 Health 不返回命令路径、凭据或 Provider 私有字段
- [x] Profiles 领域闭环已实现：幂等创建、列表/读取/更新、当前 Profile context、默认 TasteOverrides/ProfilePreferences、单文件 multipart 头像上传和切换协调顺序均已验证；v1 不提供 Profile 删除
- [x] Library 后端已实现：Provider 输出严格归一化为稳定 source identity，支持搜索、幂等加入候选池、分页列表、异步歌单导入及快照、歌词和短期播放解析；搜索/歌词/播放缓存均有容量与 TTL，播放直链不持久化
- [x] Feedback 与 Taste 记忆后端已实现：七类固定反馈按 Profile append-only 幂等写入，同事务按稳定 replay order 更新可重建 TasteProjection；人工 TasteOverrides 独立版本化并优先合并为只读 EffectiveTaste
- [x] Programs 与 Playback 领域后端已实现：Program、ordered track refs、DJ segments 与判别式 timeline 单事务提交，文字 DJ 不伪造音频项；分页历史和详情按 Profile 隔离，checkpoint 校验 owner、位置、完成边界与 `leaseEpoch`
- [x] 异步节目生成后端已实现：幂等受理、每 Profile 单活、持久阶段/sequence、超时、内部取消、迟到结果隔离、TTS/歌词/曲目降级和重启中断收敛均已验证；Program 与 Job 成功终态同事务提交
- [x] Mock Provider 后端闭环已验收：合法场景通过 REST 异步受理后可原子提交至少一首可播放曲目、开场文字与判别式 timeline；Codex 错误/非法计划、三次搜歌耗尽、全曲不可用、TTS/歌词/部分曲目降级和提交事务回滚均有固定 fixture 与数据库快照断言
- [x] 数据目录迁移底座已实现：幂等异步 job、阶段事件、空且可写目标校验、暂停/checkpoint Port、持久备份、SHA-256 复制校验、原子 bootstrap 指针、进程内重启和失败回滚均已验证；旧目录与备份不自动删除
- [x] Codex、NetEase 与 TTS Provider adapters 已实现：参数数组启动、stdin-only 敏感正文、运行时 schema、超时/取消、受限子进程环境、媒体 URL/DNS/redirect/Range/MIME 校验、受控音频写入和脱敏错误均有专项测试；生成编排已接入，bundled native helper 保持范围外
- [x] Unit、contract、integration、component、E2E、视觉、无障碍与 coverage 测试入口已建立；S1 skeleton contract、REST/WS integration 和三浏览器连接 E2E 已覆盖
- [x] Workspace frozen install 与最小 typecheck 已创建并验证
- [x] 最小骨架 `dev`、`build` 与 `start` 已创建并验证
- [x] `pnpm check`、Linux 常规质量门、三浏览器 E2E、axe 与视觉回归已进入 GitHub Actions

### Agent safety note

当前可以在本地和 GitHub Actions 验证运行版本、workspace、锁文件、frozen install、`check`、三浏览器 E2E、axe、视觉基线，以及 App Shell 路由、内存 Session、事件重连、服务断线恢复、完全离线静态壳、Profile/Settings、Radio 三态/生成恢复、Browser Audio Engine、多标签接管、Detail 跟随、反馈闭环和 Library/Taste/Programs 三个 P1 页面；后端还可验证 Profiles、Library、Feedback/Taste、Programs/Playback、Mock Provider 生成闭环、Provider adapter 边界、同源托管、SQLite、数据目录迁移、受控文件/秘密、脱敏日志和 Session/Origin 安全矩阵。macOS 登录会话还可验证真实 Keychain 往返；受控本机已验证 NetEase smoke，但这些证据不证明 Codex 与 NetEase 的真实节目生成组合、TTS native helper 或安装包可运行。

视觉资产的权威关系为：产品行为看 PRD，流程看 User Flow，明确 UI 规则看 `design/design.md`，当前视觉实现语义看 `design/assets/prototype/`，正式 PNG 只用于回归，Figma 只用于协作查看。完整追溯见 [handoff map](design/assets/reports/handoff-map.md)。

AI Agent **不得**：

- 把目标目录树描述成现有代码。
- 把目标技术栈描述成已安装依赖。
- 把尚未实装的 macOS 平台/包装 CI 或产品行为测试覆盖描述成已经可运行的事实。
- 把本地 Session 描述为云账号、Profile 登录或远程访问认证。
- 把 ADR 0003 的已接受架构描述为已经实现，或把本地 ad-hoc 产物描述为已通过 Developer ID 签名公证、可公开分发。
- 声称尚未实现的真实 Provider 产品运行组合、TTS native helper 或真实 Provider 媒体播放可以运行。
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
2. 配置本地 Codex，确认内置网易云 Provider 可用，并检测可选 Apple 系统 TTS。
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

> 产品技术来自目标架构；工具链精确版本来自 [ADR 0001](docs/adr/0001-toolchain-and-quality.md)。标记为 `Pinned and verified` 或 `Configured and verified` 的 S1-01～S1-03 基础已经从当前仓库验证。

| Area | Planned technology | Status |
|---|---|---|
| Runtime | Node.js 24.18.0 LTS | Pinned and verified |
| Package management | Corepack 0.35.0 + pnpm 11.13.0 | Pinned and verified |
| Language | TypeScript 6.0.3 | Strict project references verified |
| Repository | pnpm native TypeScript workspace | Created · S1 source skeleton verified |
| Frontend | React 19.2.7 + Vite | S4 P0 Profile/Settings、Radio 生成/播放、Detail 跟随与 Feedback 体验 verified |
| Frontend build | Vite 8.1.4 | Installed and verified |
| App delivery | Web / PWA | Static App Shell cache verified · sensitive/API data bypassed |
| Server state | TanStack Query 5.101.2 | Installed · memory-only health cache and event updates verified |
| Cross-component UI state | Zustand | Planned |
| Audio | Browser `HTMLAudio` | S4-04 single engine、preload、checkpoint 与多标签 lease verified |
| Backend | Node.js + Fastify 5.10.0 modular monolith | Bootstrap、Profiles、Library、Feedback/Taste、Programs/Playback、生成 Job 与平台模块已实现 |
| API | REST `/api/v1` + WebSocket events | Health/session/events、Profiles、Library、Feedback/Taste、Programs/Playback、生成受理/Snapshot 与配置 API 已验证 |
| Development topology | Vite `127.0.0.1:5173` + Local Service `127.0.0.1:49373` | Implemented and verified |
| Production topology | Same-origin PWA / REST / WebSocket on loopback, preferred port `49373` with bounded fallback `49373-49383` | S1 static serving and strict smoke verified |
| Local session | `POST /api/v1/session/bootstrap`, memory-only short-lived token, exact Origin allowlist, REST Bearer, WebSocket first-message auth | S2 hardening implemented and verified |
| Runtime validation | Zod 4.4.3 | v1 public REST/WS contracts 与 Codex/NetEase/TTS Provider 边界 schema 已验证 |
| Database | Node 24 `node:sqlite` / SQLite 3.53.2 | 平台、Profiles、Library、Feedback/Taste、Programs/Playback 与生成 Job schema 已实现并验证 |
| ORM / migrations | Drizzle ORM + Drizzle Kit 1.0.0-rc.4 | Runtime migration flow 与七个版本化 schema migrations 已验证 |
| Secrets | macOS Keychain via `/usr/bin/security` interactive stdin | Platform adapter and real round-trip verified · business use planned |
| AI orchestration | Local Codex process | Adapter、持久化 generation runner 与恢复 Snapshot 已实现；产品默认 Mock |
| Music provider | Backend TypeScript NetEase `linuxapi` Adapter；no official CLI or .NET runtime | Adapter implemented and controlled smoke verified for Personal Local Preview |
| Voice provider | Apple `AVSpeechSynthesizer` via bundled native helper；standard installed voices only | Adapter implemented · bundled native helper planned |
| Unit / integration test | Vitest 4.1.10 + V8 coverage | Configured and verified |
| Component test | React Testing Library 16.3.2 + jsdom 29.1.1 | Configured and verified |
| Browser / visual / a11y test | Playwright 1.61.1 + axe-core | Configured and CI verified |
| Lint / format | ESLint 10.7.0 + typescript-eslint 8.64.0 + Prettier 3.9.5 | Configured and verified |
| CI | GitHub Actions | Linux quality/browser jobs configured and verified |

已由 [ADR 0002](docs/adr/0002-runtime-topology.md) 决定；S2 本地安全边界已实装：

- Development / production 拓扑、端口、进程关系、session bootstrap 与 Origin allowlist。
- Development 使用 Vite `127.0.0.1:5173` + Local Service `127.0.0.1:49373`。
- Production 使用同源 Local Service，首选 `49373`，仅允许 `49373-49383` 有界 fallback。
- Token 通过 `POST /api/v1/session/bootstrap` 的 `no-store` JSON 响应进入浏览器内存；WebSocket 不使用 URL token。
- REST 使用 Bearer token，WebSocket 在握手校验 Origin 后以首条 `session.authenticate` 消息认证；过期或进程重启后的 token 均失效。

由 [ADR 0003](docs/adr/0003-macos-packaging.md) 决定但尚未实装：

- 推荐 macOS 13.5+、arm64/x64 分架构 DMG、原生轻量 launcher + bundled Node Local Service + bundled native TTS helper + 外部浏览器 PWA。
- 当前只允许项目所有者从可信源码在受控本机构建并个人使用，不提供公开下载。
- Developer ID 签名、公证、ticket staple、Gatekeeper 和独立干净环境仍未验证；这些是未来任何外部分发的硬门，不阻塞当前本地开发。

由 [ADR 0004](docs/adr/0004-provider-feasibility.md) 决定；Backend Adapter 已实装，native helper 与运行时编排尚未实装：

- v1 使用 Codex CLI、Backend TypeScript NetEase `linuxapi` Adapter 与 bundled Apple `AVSpeechSynthesizer` helper。
- NetEase Adapter 不调用官方 `ncm-cli`，不直接依赖 `wwh1004/NeteaseCloudMusicApi` C# 二进制，也不增加 .NET runtime。
- 搜索、歌词、歌单、播放 URL、Range/MIME/CORS 与非法 ID 已完成脱敏 PoC；非官方协议只允许 Personal Local Preview，公开分发必须在 S7 重新验证。

尚未决定：

- 数据库和其他业务依赖的具体包与精确版本；Provider 与 Apple 系统 TTS 的 v1 接入形态已经由项目所有者明确。

## 6. 目录结构

### 当前真实目录

```text
Koradio/
├── .github/
│   └── workflows/
│       └── ci.yml
├── .env.example
├── .nvmrc
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── eslint.config.js
├── prettier.config.js
├── playwright.config.ts
├── vitest.config.ts
├── tsconfig.base.json
├── tsconfig.json
├── tsconfig.quality.json
├── README.md
├── AGENTS.md
├── AI_RULES.md
├── context.md
├── architecture.md
├── design-qa.md
├── apps/
│   ├── web/
│   │   ├── public/
│   │   │   ├── manifest.webmanifest
│   │   │   └── service-worker.js
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── features/
│   │   │   │   ├── device-settings/
│   │   │   │   ├── feedback/
│   │   │   │   ├── library/
│   │   │   │   ├── profile-preferences/
│   │   │   │   ├── profiles/
│   │   │   │   ├── programs/
│   │   │   │   ├── radio/
│   │   │   │   └── taste/
│   │   │   ├── shared/
│   │   │   ├── app.tsx
│   │   │   ├── main.tsx
│   │   │   ├── styles.css
│   │   │   └── transport.ts
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── server/
│       ├── src/
│       │   ├── bootstrap/
│       │   ├── integrations/
│       │   ├── modules/
│       │   │   ├── device-settings/
│       │   │   ├── feedback/
│       │   │   ├── profile-preferences/
│       │   │   ├── library/
│       │   │   ├── playback/
│       │   │   ├── profiles/
│       │   │   ├── programs/
│       │   │   └── taste/
│       │   └── platform/
│       │       ├── db/
│       │       ├── events/
│       │       ├── files/
│       │       ├── logging/
│       │       └── secrets/
│       ├── migrations/
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── contracts/
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── design-tokens/
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── tests/
│   ├── fixtures/
│   ├── unit/
│   ├── contract/
│   ├── integration/
│   ├── component/
│   ├── e2e/
│   ├── visual/
│   └── __screenshots__/
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
│       ├── s3-07-mock-backend-acceptance.md
│       ├── s4-06-p0-acceptance.md
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

### 目标源码目录

> `apps/*` 与 `packages/*` 边界 manifest 已存在，Server 的八个业务 module、integrations 与 platform 边界均已落地；Web 的 app/shared/audio、profiles、radio、programs、feedback、device-settings 与 profile-preferences 已存在，library、taste 与 native helper 仍是目标结构。

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

**当前可以安装 workspace、启动开发双进程并构建/启动同源生产应用；Web 已提供路由、内存 Session、事件重连、离线异常页、Profile/Settings、Radio 三态/节目生成交互、Library 搜索/试听/候选池/歌单导入、Taste 查看/人工编辑，以及由单一 facade 驱动的 Browser Audio Engine、多标签接管和 checkpoint；Local Service 已提供领域与平台后端能力。**

`design/assets/prototype/index.html` 是可直接在浏览器打开的零构建设计预览骨架，不是 Koradio 产品运行入口。

当前已验证的基础命令：

```bash
nvm install
nvm use
npm install --global corepack@0.35.0
corepack prepare pnpm@11.13.0 --activate
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm start
pnpm --filter @koradio/server db:generate
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit
pnpm test:contract
pnpm test:integration
pnpm test:component
pnpm test:coverage
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
pnpm test:visual
pnpm check
```

当前骨架边界：

- 已有 OS 数据目录 bootstrap、SQLite connection、Drizzle migration runner、Profile/TasteProjection/TasteOverrides/FeedbackEvent/DeviceSettings/ProfilePreferences/MusicTrack/PlaylistSource/LibraryItem/import job/Program/ProgramTrack/DjScriptSegment/PlaybackTimelineItem/PlaybackCheckpoint owner 表，以及同时保存 active data root 与 current Profile 的原子 bootstrap 指针。
- 已有 macOS Keychain Secret Store、受控 File Store 和结构化脱敏 logger；DeviceSettings 只持久化非敏感配置，TTS Adapter 只向受控 File Store 写入已校验音频。
- 已有 Profiles、Library、Feedback、Taste、Programs 与 Playback application/persistence/public API、持久节目生成 Job、有序事件、Provider orchestration、MusicProvider Port、确定性 Mock、真实 Programs/Library 反馈目标校验和可重建 projection；Mock Provider 后端闭环已通过固定 fixture 验收。
- 已有完整 v1 wire contracts；health/session/events、Profiles、Library、Feedback、Taste、Programs 历史/详情、Playback snapshot/checkpoint、DeviceSettings、ProfilePreferences 和数据目录迁移已有 route/use case。
- 已有 Codex、NetEase 与 TTS Adapter 及确定性 Mock；application composition 仍只使用 `mock`，native TTS helper 尚不存在。
- App Shell 提供五个一级 route、TanStack Query health snapshot、内存 Session、WebSocket 事件重连、完全离线异常页和只读 Settings；在线模式已提供 Profile 创建/编辑/选择、受控头像上传、可写 Settings、主题/DJ 偏好、四服务检测、安全数据目录迁移、Radio 空态/生成态/播放态、节目 generation command、Snapshot/有序事件恢复、原子节目替换、喜欢/不喜欢/跳过/节目收藏反馈、Library 搜索/试听/候选池/分页/缓存与网易云歌单导入、按 Profile 隔离的 Taste 投影/人工规则/有效结果查看、字段约束和只写 overrides 的人工编辑，以及 Programs 分页历史、详情、Provider source identity 恢复、可用串讲重播、文字降级、场景草稿复用和收藏/撤销。
- Session 只保护本地 HTTP 边界，不代表云账号或 Profile 身份；浏览器不会从 LocalStorage、SessionStorage、IndexedDB 或 Cookie 恢复 token。

[ADR 0001](docs/adr/0001-toolchain-and-quality.md) 的完整根 script 名和 CI 安装合同已实装。`pnpm check` 聚合非浏览器合并门；[GitHub Actions CI](https://github.com/komochi007/koradio/actions/workflows/ci.yml) 在 `main` push、Pull Request 和手动触发时执行 frozen install、`check`、三浏览器 E2E、axe 与 Chromium 视觉回归。macOS 平台和包装探针仍由后续对应任务建立。

### 脚手架落地后必须补齐

- [x] 实装并验证 ADR 0001 选定的 Node.js 版本。
- [x] 实装并验证 Corepack、pnpm 与单一锁文件。
- [x] 一次性 frozen install 命令。
- [x] 最小 workspace typecheck 命令。
- [x] Frontend 与 Local Service 开发命令。
- [x] 同源生产构建与启动命令。
- [x] Lint 与 format check 命令。
- [x] Unit、contract、integration、component、E2E、视觉、无障碍与 coverage 测试命令。
- [x] 聚合 `check` 命令与 Linux GitHub Actions 常规质量门。
- [x] SQLite migration 生成与启动时事务化执行命令。
- [ ] 数据备份与恢复命令。
- [x] 非敏感环境变量模板、DeviceSettings 持久化与 macOS Keychain Secret Store adapter；真实 Provider secret 接入待 S3。
- [x] ADR 0002 的默认绑定地址、端口、精确 Origin allowlist 与最小 session bootstrap。
- [x] Provider Mock development 模式与仅缓存静态 App Shell 的离线 PWA；API、Session、配置和 Secret 不进入 Service Worker cache。
- [x] S1 health 与事件连接、S2 脱敏 Health 和迁移阶段事件、S4-01 离线只读入口、S4-02 可写 Settings 与 Mock 运行时诊断、S4-03 Radio 三态与生成恢复、S4-04 Audio Engine 与多标签接管、S4-05 Detail 跟随体验、S4-06 反馈闭环与 P0 阶段门；真实 Provider 产品诊断仍待后续运行组合任务。

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

## 9. 下一实现起点

S1 工程脚手架、S2 平台阶段门、S3 后端阶段门、S4 P0 阶段门，以及 `S5-01` Library、`S5-02` Taste、`S5-03` Programs 三个 P1 页面任务已关闭。下一关键任务是 `S5-04`：

- 对 PRD 九项能力、15 个页面状态、用户流程、contracts 与真实产品测试做双向追溯。
- 验收 P0/P1 正常路径、异常恢复、Profile 隔离与设备配置边界，形成全量功能验收记录。
- 不提前开始外部 Beta、包装或发布；bundled native helper 仍由后续包装任务交付。

任务状态、依赖与验收以 [任务登记表](docs/project-management/tasks.md) 为准。

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
