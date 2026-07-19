# Koradio AI Context

> Purpose: 稳定项目认知地图  
> Audience: AI Coding Agents 与开发者  
> Nature: Bootstrap context，不是动态进度日志、任务清单或完整知识库

## 1. 使用方式

先阅读 [README.md](README.md)、[AGENTS.md](AGENTS.md) 与 [AI_RULES.md](AI_RULES.md)。本文件用于快速恢复项目身份、阶段、系统边界、领域对象、关键数据流与 Context 路由。

本文件不记录当前分支、单次任务进度、临时 TODO、完整 API、精确 UI 尺寸或实现教程。

## 2. 项目身份

Koradio 是运行在单台设备上的私人 AI 音乐电台。目标用户有长期听歌习惯和明确音乐品味，希望用一句场景描述获得一段有开场、有串讲、有歌曲队列、可反馈的策展式节目。

体验关键词：

- **Private**：本地优先、单人陪伴、档案隔离。
- **Restrained**：克制排版、有限操作、避免强装饰。
- **Curated**：节目感、场景解释、结构化队列和 DJ 串讲。

```text
场景 → 规划 → 搜歌 → 可选 TTS → 节目与队列 → 播放 → 反馈 → 品味投影 → 下一次规划
```

## 3. 当前事实与目标状态

### 当前事实

- S1 工程脚手架、S2 平台/数据/安全底座和 S3 核心领域与 Provider 后端阶段门已通过；S4-01～S4-05 App Shell、Onboarding、Profile/Settings、服务检测、安全切换、Radio 三态/节目生成交互、唯一 Audio Engine/多标签租约和 Detail Sheet/歌词与串讲跟随已实现并验证，下一关键任务是 S4-06 反馈 UI 与 P0 阶段门。
- 当前有产品、流程、架构、视觉规范、原型提示词和参考图。
- Git 仓库已初始化并关联 GitHub 远端。
- VDA-17 已冻结并纳入开发基线：`design/assets/prototype/` 是 HTML/CSS/JavaScript 视觉主源，`design/assets/baselines/` 包含 60 张正式基线，`design/assets/reports/handoff-map.md` 是开发交接索引。
- VDA-17 像素基线提交为 `6e97fb74826cdd48e5f75fe57646ac55340aab3c`；当前树只允许在不改变像素外观的前提下校准业务语义与无障碍文案。
- Figma 是 VDA-17 基线的派生镜像，不是视觉事实源；历史 VDA 任务与 QA 报告保留追溯，但不属于默认开发入口。
- 根 manifest、pnpm workspace、单一锁文件、Node 版本文件、四个目标边界源码入口、strict TypeScript project references 与质量配置已创建；frozen install、`check`、Playwright、axe、视觉、`dev` 与 `build` 可运行。
- React/Vite App Shell 与 Fastify Local Service 可在 Mock 模式启动；五个一级 route、短期进程内 session bootstrap、认证 REST/WS、事件断线重连、production 同源静态托管和仅静态 App Shell 的离线缓存已验证；Profile 创建/编辑/选择、受控头像上传、可写 Settings、主题与 DJ 偏好、服务检测、安全数据目录迁移，以及 Radio 空态/生成态/播放态、场景命令、Snapshot/有序事件恢复、失败保留旧节目、原子节目替换、唯一 Browser Audio Engine、预加载、checkpoint、多标签租约和全屏 Detail 歌词/DJ 串讲跟随已实现。
- Node 24 `node:sqlite`、Drizzle ORM/Kit 1.0 RC、OS 默认数据目录、版本化 migration、WAL、foreign keys、严格文件权限和失败迁移事务回滚已验证；Profile、TasteProjection、TasteOverrides、FeedbackEvent、DeviceSettings、ProfilePreferences、MusicTrack、PlaylistSource、LibraryItem、异步导入 job、Program、ProgramGenerationJob、ProgramTrack、DjScriptSegment、PlaybackTimelineItem 与 PlaybackCheckpoint owner 表已实现。
- macOS Keychain adapter 使用 `/usr/bin/security -i` 从 stdin 接收十六进制 secret，不把明文写入 argv；受控 File Store 只生成 data root 内相对引用并限制扩展名、MIME、大小、来源与重定向；日志移除 token、key、敏感正文、凭据 URL 和用户路径。
- `packages/contracts/src/` 已包含完整 v1 REST DTO/command、显式 `profileId`、幂等 request、异步 job、事件与错误 Zod schemas；health/session/events、Profiles、Library、Programs/Playback、生成受理/Snapshot、DeviceSettings、ProfilePreferences 和数据目录迁移已有后端实现。
- Profiles 创建在单事务内建立 Profile、默认 ProfilePreferences 与由 onboarding genres/default scenario 初始化的 TasteOverrides；current Profile ID 与 active data root 共用原子 bootstrap runtime config，切换失败不会更新当前 context。
- Library 通过 MusicProvider Port 接收不可信输出并严格归一化为稳定 source identity；搜索、歌词和短期播放解析使用有界 TTL 缓存，播放直链不进入 SQLite，异步歌单导入只在 Provider I/O 完成后开启短事务写入可用歌曲并记录不可用数量。
- Feedback 以 `(profileId, idempotencyKey)` 去重，在同一短事务内追加事实并按内部 replay order 重建 TasteProjection；skip 不自动推断为不喜欢。TasteOverrides 独立版本化，EffectiveTaste 在读取时保序合并且不单独持久化。
- Programs 通过 Library 公开 API 解析曲目元数据、通过 Playback 公开事务写入 Port 原子提交 Program、ordered track refs、DJ segments 与 timeline；production Feedback composition 使用真实 Programs owner 校验节目目标。
- Programs application 以持久 Job 元数据和内存 executor 编排 Codex、Music 与可选 TTS；重复幂等键返回原 Job，每个 Profile 只允许一个活动 Job，取消/超时/重启都收敛为可恢复终态，迟到结果不得提交 Program 或发布事件。
- S3-07 使用固定 Provider fixtures 验收了从 REST 场景受理到 Program/segments/timeline 原子提交的成功流，以及 Codex 错误/非法计划、三次搜歌耗尽、全曲不可用、TTS/歌词/部分曲目降级和提交事务回滚；常规质量门不调用真实 Provider。
- Playback 每个 Profile 只保存最新 checkpoint；写入校验 Program/timeline ownership、item 时长、完成边界和 `leaseEpoch`，拒绝旧标签页用更低 epoch 覆盖新状态。
- `POST /api/v1/profile-avatars` 使用固定版本 `@fastify/multipart` 接收单文件上传，校验 PNG/JPEG/WebP 文件签名、声明 MIME 与 5 MiB 上限后才写入受控 File Store。
- [ADR 0001](docs/adr/0001-toolchain-and-quality.md) 的运行版本、workspace、锁文件、完整根命令族和 Linux GitHub Actions CI 已实装并由真实 run 验证。[ADR 0002](docs/adr/0002-runtime-topology.md) 的完整 REST/WS session、Origin 与浏览器存储安全矩阵已由 S2-04 实装验证。
- [ADR 0004](docs/adr/0004-provider-feasibility.md) 已接受：v1 Personal Local Preview 使用 Codex CLI、Backend TypeScript NetEase `linuxapi` Adapter 与 bundled Apple TTS helper；三个 Backend Adapter 与可注入的 application composition 已实现，bundled native helper 尚未实现，非官方协议不构成公开分发许可。
- 设计预览可直接打开 `design/assets/prototype/index.html`，但这是零构建设计 fixture，不代表产品可运行。
- `architecture.md` 中超出 S3 Profiles/Library/Feedback/Taste/Programs/Playback/生成 Job/Provider Adapters、平台安全底座与 S4-05 Browser Audio Engine/Detail 的前端产品功能、native helper 和包装运行行为仍是目标设计；当前事实以本节与真实仓库为准。

### 目标运行形态

- React + Vite 本地 Web/PWA。
- Node.js + Fastify TypeScript 模块化单体。
- Node.js 24.18.0 LTS + Corepack 0.35.0 + pnpm 11.13.0 原生 workspace，ESM-only TypeScript 6.0.3。
- Browser Audio Engine 拥有唯一 `HTMLAudio` 实例。
- REST 承载查询与命令，WebSocket 推送任务和领域事件。
- SQLite 保存结构化事实，File Store 保存媒体与缓存。
- Codex、网易云通过 Backend Adapter 接入；NetEase v1 Adapter 在 Backend 内用 TypeScript 实现最小 `linuxapi` 协议，不调用官方 CLI、不引入 .NET；可选 TTS 由 Backend TTS Port 调用 bundled macOS native helper，再使用 Apple `AVSpeechSynthesizer`。
- 服务默认只在 loopback 提供本地访问；目标 Development 为 Vite `127.0.0.1:5173` + Local Service `127.0.0.1:49373`，目标 Production 为同源 Local Service 首选 `49373` 并仅允许 `49373-49383` 有界 fallback。

## 4. 产品范围

| Priority | Capability |
|---|---|
| P0 | 本地档案、场景点歌、节目生成、播放与队列 |
| P0 | Radio Detail Sheet、反馈记忆、服务配置与健康检查 |
| P1 | 音乐库搜索、网易云歌单导入、品味编辑 |
| P1 | 节目历史、串讲重播与场景复用 |

明确排除：云账号、跨设备同步、支付、社区、多人同步收听、完整 24/7 电台、多音乐源、分布式微服务、真实频谱分析和默认公网访问。

## 5. 系统边界与事实源

| State / Concern | Authoritative owner | Persistence |
|---|---|---|
| Profile、Taste、Program、PlaybackTimeline、Feedback | Backend modules | SQLite |
| 播放时间、暂停、seek、buffering、媒体错误 | Browser Audio Engine | 低频 checkpoint |
| 生成任务 | Backend durable metadata + runtime executor | SQLite Job + ordered events + REST Snapshot |
| 服务健康状态 | Backend runtime | Snapshot |
| Sheet、draft、筛选、展开状态 | Frontend feature | In-memory |
| dataRoot、Codex、NetEase、Secret Store 引用 | DeviceSettings | Device durable |
| Theme、DJ language、voice style | ProfilePreferences | Profile durable |

关键边界：Profile 是数据分区而非身份认证；MVP 只有一个 active playback session，标签页通过 `2s` 续约、`5s` 过期的 TTL lease 选出主控；Browser 不直接调用 Provider；Domain 不依赖框架或 Provider SDK；Provider response 不得成为公共 contract；外部输入必须在边界校验。

## 6. 模块认知

| Module | Owns | Does not own |
|---|---|---|
| Profiles | 档案 CRUD、profile context 与受控 avatarRef | 登录身份、播放状态、任意头像 URL/路径 |
| Radio | 场景入口与当前节目组合 | Provider、持久化 |
| Programs | 生成任务、节目、DJ 段和历史 | `HTMLAudio` 状态 |
| Playback | 时间线规则与恢复 checkpoint | 实时播放进度、UI Sheet |
| Library | 搜索、导入与归一化曲目 | 推荐决策、播放控制 |
| Taste | TasteProjection、TasteOverrides 与 EffectiveTaste | Provider response、覆盖人工规则 |
| Feedback | 显式喜欢/撤销、不喜欢/撤销、跳过、节目收藏/撤销事实 | 重写历史事实 |
| DeviceSettings | 设备服务配置、Secret Store 引用与数据目录迁移 | Profile 偏好、明文密钥输出 |
| ProfilePreferences | 主题、DJ 语言与声音风格 | 设备服务配置、密钥 |

## 7. 关键领域对象

| Object | Meaning |
|---|---|
| `Profile` | 本地数据分区根，头像只保存受控 `avatarRef` |
| `TasteProjection` | 可从反馈事实重建的自动投影 |
| `TasteOverrides` | 人工规则，优先且不被重建覆盖 |
| `EffectiveTaste` | 合并后的 Codex 只读上下文 |
| `DeviceSettings` | 设备级 dataRoot、服务配置与 Secret Store 引用 |
| `ProfilePreferences` | Profile 级主题与 DJ 偏好 |
| `MusicTrack` | 归一化曲目与 Provider source identity |
| `Program` | 一次场景生成后的节目快照 |
| `DjScriptSegment` | DJ 文本与可选音频引用 |
| `PlaybackTimelineItem` | 有音频 `dj` 或 `track` 的判别联合；文字 DJ 不创建 item |
| `PlaybackCheckpoint` | 可恢复的低频播放快照 |
| `FeedbackEvent` | 固定枚举的 append-only 用户反馈事实 |

播放 URL 是短期资源；历史恢复依赖 Provider source identity。

## 8. 核心数据流

### 节目生成

`Radio submit → Programs job → Codex plan validation → Music resolve → optional TTS → transactional Program/segments/timeline commit → WebSocket event → old checkpoint/stop → Audio Engine atomic switch`

### 播放

`Canonical timeline → single Audio Engine → local media snapshot → throttled Backend checkpoint → Radio 与 Detail Sheet 共享时间线`

### 反馈记忆

`UI intent → explicit FeedbackEvent → TasteProjection → merge TasteOverrides → EffectiveTaste → next Codex context`

## 9. 失败与降级

阻断当前任务：

- Codex 失败、超时或结构化输出无效。
- 搜歌重试后没有可播放曲目。
- 数据路径不可写或节目事务提交失败。
- Codex 未配置，或内置网易云 Provider 运行时不可用。

阻断错误必须保留用户输入并提供重试、修改输入或 Settings 入口。

局部降级：

- TTS 失败 → 文字 DJ，歌曲继续。
- 歌词失败 → 无歌词状态，播放继续。
- 无分句时间戳 → 近似高亮。
- 单曲失败 → 标记失败并尝试下一首。
- 反馈失败 → 回滚反馈 UI，播放继续。
- 历史音频缺失 → 保留文字串讲。
- Detail Sheet 失败 → 返回 Radio，播放继续。
- 新节目生成失败 → 旧节目继续且状态不变。
- Profile 切换 → 取消旧任务、丢弃迟到事件、保存并停止旧播放后加载新档案。
- 数据目录迁移失败 → 回滚 bootstrap 并继续使用旧目录，旧数据不自动删除。
- Local Service 完全离线 → 已打开或缓存 PWA 仅显示只读 Settings、启动说明、脱敏状态和重试。

## 10. 已确定的技术决策

- TypeScript monorepo；React + Vite PWA；Fastify modular monolith。
- SQLite + Drizzle migrations；REST + WebSocket；Zod wire contracts。
- Browser owns live playback；Provider ports 隔离外部服务。
- OS Credential Store；显式 `profileId`；显式 append-only feedback。
- v1 可选语音固定为 bundled native helper + Apple `AVSpeechSynthesizer`，只使用已安装标准系统语音，不使用云 TTS 或 Personal Voice。
- DeviceSettings / ProfilePreferences 分离；判别式 PlaybackTimeline。
- Single active playback session + `BroadcastChannel/localStorage` TTL lease。
- Development 双进程、Production 同源单服务；token 只通过 `POST /api/v1/session/bootstrap` 的 `no-store` JSON 响应进入浏览器内存，WebSocket 使用首条 `session.authenticate` 消息认证。
- 工具链采用 Node 24 LTS、Corepack/pnpm 11、TypeScript 6 project references；Web 由 Vite 8 构建，Server/shared 由 `tsc -b` 构建。
- 质量工具采用 ESLint 10 + typescript-eslint、Prettier 3、Vitest 4 + Testing Library/jsdom、Playwright + axe-core；常规 CI 为 GitHub Actions。
- 全仓使用单一 `pnpm-lock.yaml`、精确直接依赖、frozen CI install、24 小时 release age 和显式 dependency build allowlist。
- macOS 包装采用原生轻量 launcher + bundled Node Local Service + bundled native TTS helper + 外部浏览器 PWA；arm64/x64 独立产物，最低目标 macOS 13.5。
- 当前只支持项目所有者从可信源码在受控本机生成个人预览产物；公开下载后置，届时 Developer ID、Apple 公证、Gatekeeper 与独立干净环境验收仍是硬门。
- Provider 可行性已裁决：NetEase 使用 Backend TypeScript 最小 `linuxapi` Adapter；搜索、歌词、歌单、播放 URL、Range/MIME/CORS 与非法 ID 已脱敏验证，只允许 Personal Local Preview，公开分发前必须重新验证协议、条款和内容边界。

## 11. 尚未决定

Agent 不得自行假定：

- 数据库与其他业务依赖的具体包和精确版本。
- 尚未创建的业务模块、macOS 平台/包装 CI 或产品行为测试覆盖已经可用。

工具链实现必须遵循 ADR 0001；运行拓扑实现必须遵循 ADR 0002；macOS 包装与交付边界必须遵循 ADR 0003；Provider 实现与发布边界必须遵循 ADR 0004。

## 12. Context 路由

| Need | Read |
|---|---|
| 产品范围、字段、文案、验收 | [docs/prd.md](docs/prd.md) |
| 交互路径与异常分支 | [docs/user-flow.md](docs/user-flow.md) |
| 架构、API、数据、安全与依赖 | [architecture.md](architecture.md) |
| UI、token、动效与无障碍 | [design/design.md](design/design.md) |
| 高保真页面生成或原图来源说明 | [design/prompt.md](design/prompt.md) 与 [design/references/README.md](design/references/README.md) |
| 前端视觉实现与冻结版本追溯 | [design/assets/reports/handoff-map.md](design/assets/reports/handoff-map.md)；历史任务和 QA 报告只在追溯时读取 |
| 工程硬约束 | [AI_RULES.md](AI_RULES.md) |
| 工具链、构建、测试、命令与 CI 决策 | [docs/adr/0001-toolchain-and-quality.md](docs/adr/0001-toolchain-and-quality.md) |
| Agent 工作流程 | [AGENTS.md](AGENTS.md) |

文档冲突必须按 Concern 在对应权威文档中显式解决，禁止静默择一。
