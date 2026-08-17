# Koradio

[![Continuous Integration](https://github.com/komochi007/koradio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/komochi007/koradio/actions/workflows/ci.yml)

> Status: **S1–S6 stage gates complete · S7-01/02/06/08 complete · S7-09 Electron shell migration in progress · UX-11 DJ conversation/curation/radio optimization accepted · UX-12 core experience and visual optimization accepted · DeepSeek planner integration implemented, real API smoke deferred · S7-07 stability trial in progress · external distribution deferred · production defaults to Live mode**
> Audience: AI Coding Agents、开发者、维护者  
> Runtime: 当前仓库已有可安装、可开发启动、可生产构建的 Web/Local Service，以及路由、TanStack Query、短期内存 Session、事件重连、VDA-17 离线只读入口、Profile/Onboarding、可写 Settings、Profile 级持久 DJ 对话与意图分流、单曲与 3～5 首策展推荐卡片、8～12 首节目生成、临时 DJ 点播队列、双声道 Radio 播放、按需 Qwen 朗读、多标签租约、全屏 Detail 歌词/DJ 串讲跟随、七类反馈 UI、Library 搜索/试听/候选池/歌单导入、Taste Blueprint 重塑/反馈学习/人工编辑、Programs 历史/详情/重播/复用/收藏和仅静态 App Shell 的 Service Worker 缓存；Electron 主进程与 Production Server 默认使用真实 Provider，Development、Test、CI 与 `start:mock` 使用确定性 Mock Provider

## 1. 项目入口

Koradio 是一个面向单台设备的私人 AI 音乐电台。

用户描述当前场景后，目标系统将：

```text
对话输入
  → Radio 先路由为闲聊、澄清、单曲、3～5 首推荐或完整节目；“其他/类似/再推荐”始终保持为推荐，只有明确节目需求才生成节目
  → 单曲与推荐以临时 DJ 点播卡片提供立即播放或下一首播放；手动与自然下一首一致优先消费临时点播，空节目时手动下一首也可直接播放，成功排队不插入对话红字，不改写节目历史或持久队列
  → 完整节目将当前 Profile 最多 120 首可播放库内曲目摘要、EffectiveTaste、可选 TasteBlueprint 与近 20 期历史交给活动 Planner（Codex 或 DeepSeek）
  → 活动 Planner 生成有序 library/discovery 选曲意图与 DJ 串讲
  → Library 按意图顺序解析并最多补选两轮，严格满足 8～12 首目标、语言、近期去重与艺人约束
  → Qwen3-TTS 8-bit 通过本机 Python/MLX helper 生成可选 DJ 语音
  → 本地服务原子提交节目与播放时间线；已有节目时持久保存待切换节目，默认在当前曲结束后切换，也可立即切换
  → 浏览器 Audio Engine 以音乐/语音双通道叠播、ducking 并收集反馈
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
- [x] macOS Native launcher + 外部浏览器 PWA 的历史包装已由 S7-01/S7-02 记录；[ADR 0006](docs/adr/0006-electron-desktop-shell.md) 已裁决由 Electron 主进程与现有 Web Renderer 替代，S7-09 正在完成迁移
- [x] Provider 可行性已由 [ADR 0004](docs/adr/0004-provider-feasibility.md) 关闭；其中 Apple TTS 仅为 S7-06 历史验收事实，已由 [ADR 0005](docs/adr/0005-qwen3-local-tts.md) 与 UX-10 的 bundled Qwen3-TTS helper 取代。DeepSeek 可切换规划 Provider 的边界由 [ADR 0007](docs/adr/0007-deepseek-planner-provider.md) 固定；Production Server 与 Electron 主进程默认 Live
- [x] pnpm TypeScript monorepo 的四个目标边界、运行版本、单一锁文件和最小源码入口已创建
- [x] React/Vite App Shell 已实现：五个一级 route、TanStack Query、短期内存 Session、事件重连、错误边界、VDA-17 离线异常页、只读 Settings 和仅静态壳的 PWA 缓存已验证；Profile/Onboarding、可写 Settings、Profile 级 DJ transcript、闲聊/澄清/单曲/3～5 首推荐/节目分流、单曲与推荐立即/下一首临时点播（含空节目手动下一首与无成功红字）、对话清空、按需朗读、旧节目生成中继续播放、双声道 overlay/ducking、多标签租约、全屏 Detail 平滑歌词/DJ 串讲跟随、七类反馈 UI、Settings/Library/Taste 的可关闭短时操作反馈、Library 搜索/试听/候选池/歌单导入、Taste Blueprint 显式重塑/学习基线后的自动投影/人工规则/有效结果查看与编辑，以及 Programs 分页历史/详情/串讲重播/场景复用/收藏已接入
- [x] Fastify Local Service health/session/events、Profiles、Library、Feedback、Taste、Programs、Playback、Radio conversation/speech、异步节目生成、DeviceSettings、ProfilePreferences 与数据目录迁移路由已实现；节目与朗读命令使用持久 Job 和 REST Snapshot 恢复
- [x] 完整 v1 公共 Contracts 已用 Zod 固化：REST DTO/command、显式 `profileId`、`Idempotency-Key`、异步 job、WebSocket event 与安全 error envelope 均有正反向和兼容性测试
- [x] SQLite/Drizzle 底座已实现：首次启动选择 OS 应用数据目录，版本化 migration、WAL、foreign keys、严格文件权限和失败回滚测试已验证；Profile、TasteBlueprint、TasteProjection、TasteOverrides、FeedbackEvent、DeviceSettings、ProfilePreferences、MusicTrack、PlaylistSource、LibraryItem、异步导入 job、Program、ProgramGenerationJob、RadioMessage/Turn/SpeechGeneration、DjCitation、ProgramTrack、DjScriptSegment、PlaybackTimelineItem 与 PlaybackCheckpoint owner 表已落地
- [x] Secret Store、File Store 与脱敏日志平台边界已实现：macOS Keychain 往返、headless 稳定错误、受控引用、扩展名/MIME/大小/重定向限制和敏感信息清除已验证；DeepSeek API key 只通过 Keychain 读写，TTS Adapter 只向受控 File Store 写入校验后的音频
- [x] 本地 HTTP 安全边界已完成：每次 bootstrap 签发短期进程内 token，REST 与 WebSocket 共享校验，Web 只在内存持有 token，并支持 401 后重新 bootstrap 的重连基础
- [x] DeviceSettings 与 ProfilePreferences owner 已实现：设备配置和 Profile 偏好分表、分路由持久化；活动 Planner、DeepSeek 模型、隐私确认和密钥配置状态在设备级管理，Health 不返回命令路径、凭据或 Provider 私有字段
- [x] Profiles 领域闭环已实现：幂等创建、列表/读取/更新、当前 Profile context、默认 TasteOverrides/ProfilePreferences、单文件 multipart 头像上传和切换协调顺序均已验证；v1 不提供 Profile 删除
- [x] Library 后端已实现：Provider 输出严格归一化为稳定 source identity，支持搜索、幂等加入候选池、分页列表、异步歌单导入及快照、歌词和短期播放解析；搜索/歌词/播放缓存均有容量与 TTL，播放直链不持久化
- [x] Feedback 与 Taste 记忆后端已实现：七类固定反馈按 Profile append-only 幂等写入，同事务按稳定 replay order 更新可重建 TasteProjection；人工 TasteOverrides 独立版本化并优先合并为只读 EffectiveTaste
- [x] Programs 与 Playback 领域后端已实现：Program、ordered track refs、DJ segments 与判别式 timeline 单事务提交，文字 DJ 不伪造音频项；分页历史和详情按 Profile 隔离，checkpoint 校验 owner、位置、完成边界与 `leaseEpoch`
- [x] 异步节目生成后端已实现：幂等受理、每 Profile 单活、持久阶段/sequence、最多 120 首库内摘要、默认 8 首且可指定 8～12 首、约 70/30 库内/探索建议、最多两轮补选、近 20 期精确曲目去重、默认同艺人一首、显式点名覆盖、中文原始歌词 60% 汉字校验、活动 Planner 快照、超时、迟到结果隔离、来源增强与重启中断收敛均已验证；不足目标时失败并保留旧节目，Program、Job 与待切换状态同事务提交
- [x] Mock Provider 后端闭环已验收：Radio 闲聊不触发节目，歧义追问，单曲卡片、3～5 首推荐卡片和 8～12 首节目分别执行；空库探索、两轮补选、近 10 期去重、同艺人与点名覆盖、中文歌词硬约束、MusicBrainz/Wikimedia 引用、搜索/音频失败、Codex 错误/非法计划、TTS/歌词降级和提交事务回滚均有固定 fixture 与数据库快照断言
- [x] 数据目录迁移底座已实现：幂等异步 job、阶段事件、空且可写目标校验、暂停/checkpoint Port、持久备份、SHA-256 复制校验、原子 bootstrap 指针、进程内重启和失败回滚均已验证；旧目录与备份不自动删除
- [x] Codex、DeepSeek、NetEase 与 TTS Provider adapters：Codex、NetEase、DeepSeek 和 Qwen TTS 的协议边界、Keychain、重试、响应校验与 Mock fixtures 已实现；真实 DeepSeek API smoke 仍需手动凭据，Production Server 与 Electron 主进程默认 Live，Development、Test 和 CI 默认 Mock
- [x] Unit、contract、integration、component、E2E、视觉、无障碍与 coverage 测试入口已建立；S1 skeleton contract、REST/WS integration 和三浏览器连接 E2E 已覆盖
- [x] S5 全量功能阶段门已通过：[S5-04 验收记录](docs/project-management/s5-04-full-function-acceptance.md) 将九项能力、15 个页面、异常恢复及 Profile/设备配置边界追踪到真实产品、contracts 与完整内部 E2E
- [x] S6-01 跨层失败矩阵已通过：[S6-01 验收记录](docs/project-management/s6-01-failure-matrix-acceptance.md) 覆盖生成、播放、反馈和事件重连故障并保护旧节目
- [x] S6-02 数据生命周期矩阵已通过：[S6-02 验收记录](docs/project-management/s6-02-data-lifecycle-compatibility.md) 覆盖首次目录、v6 生产旧库升级、八阶段迁移回滚、真实 SHA-256 校验和成功/失败恢复
- [x] S6-03 安全、隐私与依赖审计已通过：[S6-03 审计记录](docs/project-management/s6-03-security-privacy-dependency-audit.md) 覆盖 loopback/Origin/session、文件与 Provider 恶意输入、日志/API 脱敏、依赖漏洞、license 与发布风险
- [x] S6-04 性能、缓存、长时播放与无障碍回归已通过：[S6-04 验收记录](docs/project-management/s6-04-performance-accessibility-acceptance.md) 覆盖有界缓存、八小时等价播放、checkpoint 节流、静态 App Shell 白名单、三浏览器 axe/键盘/Focus、Reduce Motion、200% zoom 与代表 viewport
- [x] S6-05 内部全质量门已通过：[S6-05 质量门记录](docs/project-management/s6-05-internal-quality-gate.md) 记录冻结环境下的完整质量流水线、依赖审计、三浏览器 E2E、视觉门、显式跳过复核与 CI 追溯
- [x] S7-01 受控本机 macOS 包装已通过：[S7-01 验收记录](docs/project-management/s7-01-macos-packaging-acceptance.md) 记录原 Native arm64 app/DMG、Node 24.18.0、TTS helper、启动生命周期与 strict codesign 验证
- [x] S7-02 受控本机安装生命周期已通过：[S7-02 验收记录](docs/project-management/s7-02-install-lifecycle-acceptance.md) 记录 arm64 两版本安装、升级、失败回滚、卸载、数据保留与端口残留验证
- [ ] S7-09 Electron 桌面外壳迁移进行中：主进程、服务生命周期、安全导航、启动前更新、Electron arm64 包装与包验证已接入；7 日稳定性试用仍是最终关闭门
- [ ] S7-07 正在把本机入口收敛为唯一 `/Applications/Koradio.app`：每次从 Launchpad 打开先联网确认可信 `origin/main`，必要时本机构建、验证并原位替换；任何更新失败都不打开旧版；Electron 窗口不再依赖浏览器 PWA shim
- [x] S7-09 Electron UI 紧凑窗口基础优化已验收：窗口策略限制为最小 `430 × 652px`；Radio 外层禁止滚动，队列、DJ 对话和 Library 本地音乐列表在卡片内独立滚动且隐藏滚动条；品牌与内容区左对齐并避让 macOS 原生按钮；验收记录见 [S7-09 Electron UI 优化验收](docs/project-management/s7-09-electron-ui-optimization-acceptance.md)
- [x] S7-09-004 歌词、封面与启动体验优化已验收：Detail Sheet 紧凑布局、歌词累计高亮、NetEase 封面 HTTPS 规范化、图片失败占位、启动状态窗口和最小窗口档案卡片对齐均已完成；S7-07 稳定性试用仍按原计划进行
- [x] S7-06 个人本机真实 Provider 闭环已通过：[S7-06 验收记录](docs/project-management/s7-06-real-provider-acceptance.md) 保留当时 Codex/NetEase/Apple TTS 历史证据；Apple TTS 已被 UX-10 的 Qwen3-TTS 实现取代
- [x] Workspace frozen install 与最小 typecheck 已创建并验证
- [x] 最小骨架 `dev`、`build` 与 `start` 已创建并验证
- [x] `pnpm check`、Linux 常规质量门、三浏览器 E2E、axe 与视觉回归已进入 GitHub Actions

### Agent safety note

当前可以在本地和 GitHub Actions 验证运行版本、workspace、锁文件、frozen install、`check`、三浏览器 E2E、axe、视觉基线和完整前后端核心闭环。macOS 15+ arm64 已验证 Electron app 的 Node、Qwen runtime、服务复用/启停、Renderer bootstrap、严格签名与包结构；S7-06 的 Apple TTS 和 Native launcher 只保留为历史证据。上述证据不证明 x64、Developer ID、公证、独立干净 Mac 或公开分发可运行。

视觉资产的权威关系为：产品行为看 PRD，流程看 User Flow，明确 UI 规则看 `design/design.md`，当前视觉实现语义看 `design/assets/prototype/`，正式 PNG 只用于回归，Figma 只用于协作查看。完整追溯见 [handoff map](design/assets/reports/handoff-map.md)。

AI Agent **不得**：

- 把目标目录树描述成现有代码。
- 把目标技术栈描述成已安装依赖。
- 把尚未验证的 x64、包装 CI、Developer ID、公证或产品行为测试覆盖描述成已经可运行的事实。
- 把本地 Session 描述为云账号、Profile 登录或远程访问认证。
- 把 ADR 0003 的已接受架构描述为已经实现，或把本地 ad-hoc 产物描述为已通过 Developer ID 签名公证、可公开分发。
- 把当前受控本机的真实 Provider 验收外推为其他机器、公开分发或长期服务可用性证明。
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
2. 在 Settings 配置本地 Codex，或确认 DeepSeek 隐私提示并保存 Keychain API key，确认内置网易云 Provider 可用；需要语音串讲时首次下载约 1.84 GiB 的 Qwen3-TTS 模型。
3. 在 Radio 页面描述当前场景。
4. 生成节目计划、DJ 开场和歌曲队列。
5. 播放、暂停、切歌、seek 并查看歌词或串讲。
6. 记录喜欢/撤销、不喜欢/撤销、跳过和节目收藏/撤销。
7. 按需应用包含语言比例、版本偏好的 Profile 级 Taste Blueprint；仅学习起点之后的反馈形成自动投影，并与人工规则合并为可读、可编辑的品味档案。
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
       ├─ DeepSeek Adapter
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
| External Providers | Codex、DeepSeek 与网易云；均视为不可信、可失败依赖 |
| Local TTS | bundled Python/MLX helper 调用固定 Qwen3-TTS 8-bit 模型；中文 Serena、英文 Ryan，本机能力仍可失败并必须完整文字降级 |

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
| UI state | React feature-local state、TanStack Query、Audio Engine facade | Implemented |
| Audio | Browser `HTMLAudio` | S4-04 single engine、preload、checkpoint 与多标签 lease verified |
| Backend | Node.js + Fastify 5.10.0 modular monolith | Bootstrap、Profiles、Library、Feedback/Taste、Programs/Playback、生成 Job 与平台模块已实现 |
| API | REST `/api/v1` + WebSocket events | Health/session/events、Profiles、Library、Feedback/Taste、Programs/Playback、生成受理/Snapshot 与配置 API 已验证 |
| Development topology | Vite `127.0.0.1:5173` + Local Service `127.0.0.1:49373` | Implemented and verified |
| Production topology | Same-origin PWA / REST / WebSocket on loopback, preferred port `49373` with bounded fallback `49373-49383` | S1 static serving and strict smoke verified |
| Local session | `POST /api/v1/session/bootstrap`, memory-only short-lived token, exact Origin allowlist, REST Bearer, WebSocket first-message auth | S2 hardening implemented and verified |
| Runtime validation | Zod 4.4.3 | v1 public REST/WS contracts 与 Codex/DeepSeek/NetEase/TTS Provider 边界 schema 已验证 |
| Database | Node 24 `node:sqlite` / SQLite 3.53.2 | 平台、Profiles、Library、Feedback/Taste、Programs/Playback 与生成 Job schema 已实现并验证 |
| ORM / migrations | Drizzle ORM + Drizzle Kit 1.0.0-rc.4 | Runtime migration flow 与七个版本化 schema migrations 已验证 |
| Secrets | macOS Keychain via `/usr/bin/security` interactive stdin | Platform adapter、真实 round-trip 与 DeepSeek API key 业务接入已验证；真实 DeepSeek API smoke 待手动执行 |
| AI orchestration | Local Codex process + DeepSeek Chat Completions | Codex/DeepSeek Adapter、持久化 generation runner、恢复 Snapshot、设备级切换与显式 live composition 已验证；Production 默认 Live，Development/Test/CI 默认 Mock |
| Music provider | Backend TypeScript NetEase `linuxapi` Adapter；no official CLI or .NET runtime | Adapter implemented and controlled smoke verified for Personal Local Preview |
| Voice provider | Qwen3-TTS 8-bit via bundled Python/MLX helper；Serena / Ryan | 固定模型清单、首次下载、持久化 helper、受控同源媒体与 arm64 本机合成已验证；Production 默认 Live，Development/Test/CI 默认 Mock |
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

由 [ADR 0003](docs/adr/0003-macos-packaging.md) 决定，S7-01～S7-02 已实现受控本机 arm64 验收：

- 当前目标为 macOS 15+ Apple Silicon、Electron 主进程 + 现有 Web Renderer + bundled Node Local Service + bundled Python/MLX TTS runtime；Qwen 模型不进入 DMG，由用户首次下载。Native launcher 文件仍保留为 legacy，不进入生产构建。
- Personal Local Preview 目标入口固定为 `/Applications/Koradio.app`：Launchpad 只保留品牌圆角图标，每次正常打开先联网确认可信 `origin/main`，新提交经本机构建和包验证后原位替换，再在 Electron 窗口加载 `http://127.0.0.1:<port>/radio`；失败不启动旧版。
- 当前只允许项目所有者从可信源码在受控本机构建并个人使用，不提供公开下载。
- Developer ID 签名、公证、ticket staple、Gatekeeper 和独立干净环境仍未验证；这些是未来任何外部分发的硬门，不阻塞当前本地开发。

由 [ADR 0004](docs/adr/0004-provider-feasibility.md) 决定；Backend Adapter 与 native helper 已实装，Production 默认 Live，Development、Test 和 CI 默认 Mock：

- v1 使用 Codex CLI、DeepSeek Chat Completions、Backend TypeScript NetEase `linuxapi` Adapter 与 bundled Qwen3-TTS Python/MLX helper。
- NetEase Adapter 不调用官方 `ncm-cli`，不直接依赖 `wwh1004/NeteaseCloudMusicApi` C# 二进制，也不增加 .NET runtime。
- 搜索、歌词、歌单、播放 URL、Range/MIME/CORS 与非法 ID 已完成脱敏 PoC；非官方协议只允许 Personal Local Preview，公开分发必须在 S7 重新验证。

尚未决定：

- 后续公开分发所需的签名、公证与发布平台依赖；当前 SQLite/Drizzle 与 Provider/Qwen3-TTS 的 v1 接入形态已明确并实装。

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
├── design/assets/reports/vda-11-light-management-qa.md
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

> `apps/*` 与 `packages/*` 边界 manifest 已存在，Server 的业务 module、integrations 与 platform 边界均已落地；Web 的 app/shared/audio、profiles、radio、programs、feedback、device-settings、profile-preferences、library 与 taste 已存在，bundled Qwen3-TTS native helper 也已实装。

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

**当前可以安装 workspace、启动开发双进程并构建/启动同源生产应用；Web 已提供路由、内存 Session、事件重连、离线异常页、Profile/Settings、持久 DJ 对话与意图分流、单曲卡片、8～12 首节目、双声道 Radio、Library 搜索/试听/候选池/歌单导入、Taste Blueprint 重塑/反馈学习/人工编辑，以及多标签接管和 checkpoint；Local Service 已提供对应领域与平台后端能力。**

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
pnpm start:mock
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
pnpm audit:dependencies
pnpm check
pnpm package:macos -- --arch arm64
pnpm verify:package:macos <path-to-Koradio.app>
```

运行模式：

- `pnpm dev`、测试和 CI 使用 `mock`。
- `pnpm build && pnpm start` 以 `NODE_ENV=production` 启动并默认使用 `live`。
- `pnpm start:mock` 显式启动同源生产构建的 Demo 模式。
- `KORADIO_PROVIDER_MODE=live|mock` 始终覆盖上述默认值；Electron 主进程未显式覆盖时使用 `live`。

当前骨架边界：

- 已有 OS 数据目录 bootstrap、SQLite connection、Drizzle migration runner、Profile/TasteBlueprint/TasteProjection/TasteOverrides/FeedbackEvent/DeviceSettings/ProfilePreferences/MusicTrack/PlaylistSource/LibraryItem/import job/Program/ProgramTrack/DjScriptSegment/PlaybackTimelineItem/PlaybackCheckpoint owner 表，以及同时保存 active data root 与 current Profile 的原子 bootstrap 指针。
- 已有 macOS Keychain Secret Store、受控 File Store 和结构化脱敏 logger；DeviceSettings 只持久化非敏感配置，TTS Adapter 只向受控 File Store 写入已校验音频。
- 已有 Profiles、Library、Feedback、Taste、Programs 与 Playback application/persistence/public API、持久节目生成 Job、有序事件、Provider orchestration、MusicProvider Port、确定性 Mock、真实 Programs/Library 反馈目标校验和可重建 projection；Mock Provider 后端闭环已通过固定 fixture 验收。
- 已有完整 v1 wire contracts；health/session/events、Profiles、Library、Feedback、Taste、Programs 历史/详情、Playback snapshot/checkpoint、DeviceSettings、ProfilePreferences 和数据目录迁移已有 route/use case。
- 已有 Codex、DeepSeek、NetEase 与 TTS Adapter、Qwen Python/MLX helper 及确定性 Mock；Production composition 默认 `live`，Development、Test 和 CI 默认 `mock`，也可由 `KORADIO_PROVIDER_MODE` 显式覆盖；Qwen 8-bit 本机完整句子合成与受控 TTS 音频已验收，DeepSeek 真实 API smoke 仍需手动执行。
- App Shell 提供五个一级 route、TanStack Query health snapshot、内存 Session、WebSocket 事件重连、完全离线异常页和只读 Settings；在线模式已提供 Profile 创建/编辑/选择、受控头像上传、可写 Settings、主题/DJ 偏好、四服务检测、安全数据目录迁移、Radio 空态/生成态/播放态、节目 generation command、Snapshot/有序事件恢复、原子节目替换、喜欢/不喜欢/跳过/节目收藏反馈、Library 搜索/试听/候选池/分页/缓存与网易云歌单导入、按 Profile 隔离的 Taste 蓝图/学习基线/投影/人工规则/有效结果查看、显式蓝图重塑与只写 overrides 的人工编辑，以及 Programs 分页历史、详情、Provider source identity 恢复、可用串讲重播、文字降级、场景草稿复用和收藏/撤销。
- Session 只保护本地 HTTP 边界，不代表云账号或 Profile 身份；浏览器不会从 LocalStorage、SessionStorage、IndexedDB 或 Cookie 恢复 token。

[ADR 0001](docs/adr/0001-toolchain-and-quality.md) 的完整根 script 名和 CI 安装合同已实装。`pnpm check` 聚合非浏览器合并门；[GitHub Actions CI](https://github.com/komochi007/koradio/actions/workflows/ci.yml) 在 `main` push、Pull Request 和手动触发时执行 frozen install、`check`、三浏览器 E2E、axe 与 Chromium 视觉回归。S7-01 已建立本机 macOS 包装与验收脚本；包装 CI、x64、签名公证和干净环境仍由后续任务验证。

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
- [x] 非敏感环境变量模板、DeviceSettings 持久化与 macOS Keychain Secret Store adapter；当前真实 Provider 组合不需要 NetEase Cookie、业务密钥或新增 Keychain item。
- [x] ADR 0002 的默认绑定地址、端口、精确 Origin allowlist 与最小 session bootstrap。
- [x] Provider Mock development 模式与仅缓存静态 App Shell 的离线 PWA；API、Session、配置和 Secret 不进入 Service Worker cache。
- [x] S1 health 与事件连接、S2 脱敏 Health 和迁移阶段事件、S4-01 离线只读入口、S4-02 可写 Settings 与 Mock/live 运行时诊断、S4-03 Radio 三态与生成恢复、S4-04 Audio Engine 与多标签接管、S4-05 Detail 跟随体验、S4-06 反馈闭环与 P0 阶段门；S7-06 已完成真实 Provider 产品组合与本机播放验收。

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

S1 工程脚手架、S2 平台阶段门、S3 后端阶段门、S4 P0 阶段门、S5 全量功能阶段门和 S6 集成、质量与安全阶段门均已关闭；S7-01、S7-02 与 S7-06 已完成 Native arm64 个人预览包装、安装生命周期和真实 Provider 播放闭环，S7-09 正在迁移 Electron 外壳。当前 Personal Local Preview 路径以 Electron 包为目标，不以 `S7-03` 为当前阻塞：

- 继续使用受控本机的现有 Web Renderer、bundled Local Service、Qwen helper 与 Electron ad-hoc 签名产物；不创建公开下载入口、不开始外部分发。
- 常规开发、自动测试和 CI 继续默认 Mock；Production Server 与 Electron 主进程默认 Live，也可用 `KORADIO_PROVIDER_MODE` 显式覆盖。
- `S7-03` 的 Developer ID 签名、公证、校验和和发布证据流水线只在项目所有者授权公开下载或外部分发后启动；凭据只进入受控 Keychain 或 CI Secret。

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
