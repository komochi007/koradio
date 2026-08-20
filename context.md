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
- **UX-12 已完成并验收**：Audio Engine 跨页面播放稳定性、DJ 临时点播在播放器/Detail/歌词/波形中的实时同步、平滑歌词跟随与自然短句串讲、Radio 控件反馈、3～5 首 DJ 策展推荐与 8～12 首节目分流均已通过 Live 人工验收；点播不改写节目历史或持久队列。推荐追问不升级为节目，活动规划与待切换节目可跨页面及重启恢复，其他一级页面提供回到 Radio 的轻量状态入口。
- **最近节目规划优化已完成并验收**：默认节目优先覆盖完整 Profile 曲库；语言、地区与人声/纯音乐要求先归一为结构化 `ProgramListeningIntent`，再由共享候选资格策略在库内、搜索、锚点和补选路径统一执行。明确“华语/中文”或“欧美流行且不要纯音乐”时，不以 Taste 长期语言比例静默放宽；歌词脚本不可验证、语种/地区不符或纯音乐候选被拒绝，候选不足保留旧节目并给出具体原因。围绕指定歌曲时锚点置首；“重试一下/再试一次”继承最近一次非重试节目场景，找不到时先澄清。
- **UX-21 已完成并验收**：明确节目请求继续由本地确定性路由立即创建任务，不再额外调用 AI 大脑；DJ 开场基于场景、结构化语言/地区/人声/类型或锚点意图，并以对话轮次稳定轮换句式，避免统一的客服式模板回复。

```text
场景 → 规划 → 搜歌 → 全部 TTS → 节目与队列 → 播放 → 反馈 → 品味投影 → 下一次规划
```

## 3. 当前事实与目标状态

### 当前事实

- S1～S6 阶段门均已通过；S7-01～S7-02 已完成 Native arm64 受控本机 macOS 包装与两版本安装生命周期验收，S7-06 的 Codex/NetEase/Apple TTS 事实只保留为历史验收，当前 TTS 已由 UX-10 替换为 Qwen3-TTS 8-bit。S7-08 维护性优化已关闭，S7-09 Electron 外壳迁移与 S7-07 稳定性试用仍在进行；S7-03 签名、公证与发布流水线继续后置。
- S7-09 正在收敛本机桌面入口：固定 `/Applications/Koradio.app` 是唯一 Launchpad 图标，每次正常打开先联网检查可信 `origin/main`；新提交只在独立缓存源码完成 frozen install、构建、strict codesign 与 Electron 包验证后原位替换，失败时不打开旧版。产品由 Electron 主进程加载现有 Web Renderer，不创建第二个 PWA 图标或普通网页标签；更新和服务检查期间先显示本地启动状态页。
- UX-15/16 已验收：最窄 Detail 歌词保持完整单词/汉字、DJ 串讲显示按播放时间估算高亮、宽窗口波形覆盖节目面宽度、对话头像顶部对齐；Taste 宽窗口统计标题与数值对齐。所有普通 Toast 共享顶部中央的状态提示样式，Taste、Settings、头像裁切和节目删除等常规对话框共享居中遮罩与前景卡片；全屏 Detail Sheet 保持沉浸式例外。
- 当前有产品、流程、架构、视觉规范、原型提示词和参考图。
- Git 仓库已初始化并关联 GitHub 远端。
- VDA-17 已冻结并纳入开发基线：`design/assets/prototype/` 是 HTML/CSS/JavaScript 视觉主源，`design/assets/baselines/` 包含 60 张正式基线，`design/assets/reports/handoff-map.md` 是开发交接索引。
- VDA-17 像素基线提交为 `6e97fb74826cdd48e5f75fe57646ac55340aab3c`；当前树只允许在不改变像素外观的前提下校准业务语义与无障碍文案。
- Figma 是 VDA-17 基线的派生镜像，不是视觉事实源；历史 VDA 任务与 QA 报告保留追溯，但不属于默认开发入口。
- 根 manifest、pnpm workspace、单一锁文件、Node 版本文件、四个目标边界源码入口、strict TypeScript project references 与质量配置已创建；frozen install、`check`、Playwright、axe、视觉、`dev` 与 `build` 可运行。
- React/Vite App Shell 与 Fastify Local Service 默认以 Mock 模式启动，受控本机可显式启用 live；五个一级 route、短期进程内 session bootstrap、认证 REST/WS、事件断线重连、production 同源静态托管和仅静态 App Shell 的离线缓存已验证；Profile 创建/编辑/选择、受控头像上传、可写 Settings、主题与 DJ 偏好、服务检测、安全数据目录迁移、Profile 级持久 DJ 对话、闲聊/澄清/单曲/3～5 首推荐/节目分流、单曲与推荐的临时 DJ 点播（含空节目手动下一首）、对话清空与按需 Qwen 朗读、8～12 首节目、活动规划跨页面恢复、生成中保留旧节目和待切换节目、双声道 overlay/ducking、checkpoint、多标签租约、全屏 Detail 平滑歌词/DJ 串讲跟随、七类反馈 UI、Settings/Library/Taste 的可关闭短时操作成功或失败提示、Library 搜索/试听/候选池/分页/缓存/网易云歌单导入、按 Profile 隔离的 Taste 蓝图/学习基线/投影/人工规则/有效结果查看与显式重塑，以及 Programs 分页历史/详情、串讲重播、场景复用和收藏/撤销已实现。
- Electron 桌面窗口最小尺寸为 `430 × 652px`；Radio、Library 等常规页面继续以 `0.425` 的固定内容比例保持已验收的组件与布局，Detail Sheet 在 Electron 下例外使用实际 viewport 并按约 `25% / 75%` 分配波形区与节目面。Radio 页面外层不滚动，队列与 DJ 对话框独立滚动且隐藏滚动条；品牌标记与内容区左边缘对齐并避让 macOS 原生窗口按钮。普通浏览器与手机仍保留响应式阅读布局。
- Node 24 `node:sqlite`、Drizzle ORM/Kit 1.0 RC、OS 默认数据目录、版本化 migration、WAL、foreign keys、严格文件权限和失败迁移事务回滚已验证；当前 v18 包含 Profile、Taste、Feedback、Settings、Music/Library、Program/Generation/ProgramHandoff、RadioMessage/Turn/Recommendation/SpeechGeneration、DjCitation、PlaybackTimeline 与 PlaybackCheckpoint 等 owner 表。
- macOS Keychain adapter 使用 `/usr/bin/security -i` 从 stdin 接收十六进制 secret，不把明文写入 argv；受控 File Store 只生成 data root 内相对引用并限制扩展名、MIME、大小、来源与重定向；日志移除 token、key、敏感正文、凭据 URL 和用户路径。
- `packages/contracts/src/` 已包含完整 v1 REST DTO/command、显式 `profileId`、幂等 request、异步 job、事件与错误 Zod schemas；health/session/events、Profiles、Library、Radio conversation/speech、Programs/Playback、生成受理/Snapshot、DeviceSettings、DeepSeek credential status、ProfilePreferences 和数据目录迁移已有后端实现。
- Profiles 创建在单事务内建立 Profile、默认 ProfilePreferences 与由 onboarding genres/default scenario 初始化的 TasteOverrides；current Profile ID 与 active data root 共用原子 bootstrap runtime config，切换失败不会更新当前 context。
- Library 通过 MusicProvider Port 接收不可信输出并严格归一化为稳定 source identity；搜索、歌词和短期播放解析使用有界 TTL 缓存，播放直链不进入 SQLite，异步歌单导入按完整曲目 ID 清单补齐元数据并在短事务内写入全部可解析歌曲、封面 URL 与可播放状态。
- Feedback 以 `(profileId, idempotencyKey)` 去重，在同一短事务内追加事实并按内部 replay order 重建 TasteProjection；skip 不自动推断为不喜欢。TasteOverrides 独立版本化，EffectiveTaste 在读取时保序合并且不单独持久化。
- Programs 通过 Library 公开 API 解析曲目元数据、通过 Playback 公开事务写入 Port 原子提交 Program、ordered track refs、DJ segments 与 timeline；已有节目时新 Program 进入持久 ProgramHandoff，只有当前曲自然结束或用户显式切换才成为 CurrentProgram；production Feedback composition 使用真实 Programs owner 校验节目目标。
- Programs application 以持久 Job 元数据和内存 executor 编排活动 Planner（Codex 或 DeepSeek）、Music、可信事实源与 Qwen3-TTS；Radio 先把用户输入归一化为结构化听歌意图，Settings Provider 切换先做轻量连接与认证检测，手动“测试连接”和真实生成再执行完整规划契约，桌面启动只读取活动 Provider 配置与本地服务状态，不重复执行完整节目规划。规划通过 Library Port 获取当前 Profile 最多 1,000 首可播放库内摘要，覆盖个人完整候选库，并结合近 20 期历史、偏好和 `EffectiveTaste` 强制默认约 70% 库内曲目。Planner 输出先校验库内下限，遗漏时 Backend 从完整候选库补位；仅明确“只探索新歌”允许零库内曲目。完整节目默认 8 首、可指定 8～12 首，Planner 最多提供 16 个原版候选，Backend 依序解析全部备用候选；精确曲目近期去重、默认同艺人一首，点名歌曲/艺人/特殊版本可覆盖；明确“围绕某首歌规划歌单/节目”时锚点歌曲为第一首，并按旋律、编曲、音色、情绪、节奏和年代等维度规划相似曲目。`languageScope`、`regionScope` 与 `vocalMode` 是不可放宽的硬约束：华语/中文要求可验证的中文主唱歌词，欧美流行且不要纯音乐要求可验证的西方语言人声；歌词脚本不可验证、其他东亚语种、纯音乐、短制作信息和非原版候选均不满足相应场景。候选不足会明确区分库内曲目、语言/地区、人声、原版筛选与音频可播性原因。全部 DJ TTS 成功后才提交新节目，失败则保留旧节目。DeepSeek 首次结构化输出无效或截断时，只在原 Provider 内以精简契约重试一次，绝不自动切换 Codex。每个 generation job 启动时快照 Provider/model，Settings 切换只影响下一次生成，完整规划失败时保留旧节目。
- 固定 Provider fixtures 已验收 Radio 对话分流、单曲与节目边界、默认/指定数量、两轮补选、中文歌词、同艺人与点名覆盖、近 10 期去重不足时整档失败、MusicBrainz/Wikimedia 来源、Qwen 朗读、双声道叠播与失败保护；DeepSeek adapter 使用脱敏 HTTP fixtures 覆盖 JSON Output/Thinking、错误映射、一次重试和 reasoning 丢弃；常规质量门不调用真实 Provider。
- S7-06 曾在 macOS 15.7.3 arm64 验证 Codex/NetEase/Apple TTS 闭环；该 TTS 实现已被 UX-10 取代，失败保护与 Mock/fixture 回归边界继续有效。
- S6-01 使用固定故障 fixtures、数据库快照和 Chromium/Firefox 产品 E2E 证明生成阻断保留旧 Program/Audio、局部依赖失败确定降级、反馈失败回滚且不中断播放、媒体失败稳定收敛；生成状态同时丢弃低于当前 sequence 的迟到 REST Snapshot，避免覆盖较新 WebSocket 阶段或终态。
- S6-02 使用固定 v6 production migration fixture 和临时数据根证明当前 schema 只执行待处理升级且保持 Profile、Taste、Library、Feedback、Program、Playback 与受控文件可读；数据根迁移在八个阶段失败、真实 SHA-256 不匹配或重启失败时均回到旧 bootstrap，旧目录、备份和部分目标不自动删除。
- S6-03 证明 loopback/Origin/session、Keychain、受控文件、MIME/大小/重定向、Provider 恶意输入与日志/API 脱敏边界；未映射的 parser/5xx 异常现统一返回安全 error envelope。完整依赖树无已知漏洞，生产 license allowlist 通过；NetEase 非官方协议仍只允许 Personal Local Preview，任何外部分发前必须在 S7 重新验证条款、内容边界与替代路径。
- S6-04 证明搜索/歌词/播放解析、TanStack Query、单一 Audio 预加载与静态 App Shell 缓存均有容量、过期或版本清理边界；八小时等价播放的 115,200 次进度更新不会造成 checkpoint 同区间并发洪泛或监听器增长。三浏览器五页面 axe/键盘/Focus、Reduce Motion、三组代表 viewport、44px 导航命中区与 200% 等价重排均通过。
- Playback 每个 Profile 只保存最新 checkpoint；写入校验 Program/timeline ownership、item 时长、完成边界和 `leaseEpoch`，拒绝旧标签页用更低 epoch 覆盖新状态。
- `POST /api/v1/profile-avatars` 使用固定版本 `@fastify/multipart` 接收单文件上传，校验 PNG/JPEG/WebP 文件签名、声明 MIME 与 5 MiB 上限后才写入受控 File Store。
- [ADR 0001](docs/adr/0001-toolchain-and-quality.md) 的运行版本、workspace、锁文件、完整根命令族和 Linux GitHub Actions CI 已实装并由真实 run 验证。[ADR 0002](docs/adr/0002-runtime-topology.md) 的完整 REST/WS session、Origin 与浏览器存储安全矩阵已由 S2-04 实装验证。
- [ADR 0004](docs/adr/0004-provider-feasibility.md) 记录历史 Provider 可行性裁决；其中 Apple TTS 已由 [ADR 0005](docs/adr/0005-qwen3-local-tts.md) 与 UX-10 取代；[ADR 0007](docs/adr/0007-deepseek-planner-provider.md) 固定 DeepSeek Planner、Keychain 与显式切换边界。当前组合为 Codex CLI、DeepSeek Chat Completions、Backend TypeScript NetEase `linuxapi` Adapter 与 bundled Qwen3-TTS helper；production 默认 Live，development/test/CI 默认 Mock。
- 设计预览可直接打开 `design/assets/prototype/index.html`，但这是零构建设计 fixture，不代表产品可运行。
- `architecture.md` 中超出当前本机真实 Provider/Web Renderer 闭环的 x64 生命周期、Developer ID、签名公证、独立干净 Mac 和公开分发仍是目标设计；当前事实以本节与真实仓库为准。

### 目标运行形态

- React + Vite 本地 Web/PWA。
- Node.js + Fastify TypeScript 模块化单体。
- Node.js 24.18.0 LTS + Corepack 0.35.0 + pnpm 11.13.0 原生 workspace，ESM-only TypeScript 6.0.3。
- Browser Audio Engine 拥有唯一 `HTMLAudio` 实例。
- REST 承载查询与命令，WebSocket 推送任务和领域事件。
- SQLite 保存结构化事实，File Store 保存媒体与缓存。
- Codex、DeepSeek、网易云通过 Backend Adapter 接入；DeepSeek 使用固定官方 endpoint、Bearer key、JSON Output 与 Thinking Mode，key 只在 macOS Keychain；NetEase v1 Adapter 在 Backend 内用 TypeScript 实现最小 `linuxapi` 协议，不调用官方 CLI、不引入 .NET；TTS 由 Backend TTS Port 调用 bundled Python/MLX helper 与固定 revision 的 Qwen3-TTS 8-bit 本地模型，新节目提交前必须全部成功。
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
| dataRoot、活动 Planner、Codex、DeepSeek 模型/隐私确认、Secret Store 引用 | DeviceSettings | Device durable |
| Theme、DJ language、voice style | ProfilePreferences | Profile durable |

关键边界：Profile 是数据分区而非身份认证；MVP 只有一个 active playback session，标签页通过 `2s` 续约、`5s` 过期的 TTL lease 选出主控；Browser 不直接调用 Provider；Domain 不依赖框架或 Provider SDK；Provider response 不得成为公共 contract；外部输入必须在边界校验。

## 6. 模块认知

| Module | Owns | Does not own |
|---|---|---|
| Profiles | 档案 CRUD、profile context 与受控 avatarRef | 登录身份、播放状态、任意头像 URL/路径 |
| Radio | Profile 级对话、意图路由、单曲/3～5 首推荐/节目协调与按需朗读 | Provider 实现、实时播放状态 |
| Programs | 生成任务、节目、DJ 段和历史 | `HTMLAudio` 状态 |
| Playback | 时间线规则与恢复 checkpoint | 实时播放进度、UI Sheet |
| Library | 搜索、导入与归一化曲目 | 推荐决策、播放控制 |
| Taste | TasteBlueprint、TasteProjection、TasteOverrides 与 EffectiveTaste | Provider response、覆盖人工规则 |
| Feedback | 显式喜欢/撤销、不喜欢/撤销、跳过、节目收藏/撤销事实 | 重写历史事实 |
| DeviceSettings | 设备服务配置、Secret Store 引用与数据目录迁移 | Profile 偏好、明文密钥输出 |
| ProfilePreferences | 主题、DJ 语言与声音风格 | 设备服务配置、密钥 |

## 7. 关键领域对象

| Object | Meaning |
|---|---|
| `Profile` | 本地数据分区根，头像只保存受控 `avatarRef` |
| `TasteProjection` | 可从反馈事实重建的自动投影 |
| `TasteBlueprint` | Profile 级稳定品味起点；包含特质、歌曲语言比例、原唱/原版优先的版本偏好与学习基线，蓝图应用前的反馈不再参与品味学习 |
| `TasteOverrides` | 人工规则，优先且不被重建覆盖 |
| `EffectiveTaste` | 合并后的活动 Planner 只读上下文 |
| `DeviceSettings` | 设备级 dataRoot、Planner/模型/隐私配置与 Secret Store 引用 |
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

`Radio submit → structured listening intent → Programs job → bounded Profile library context → Codex ordered track intents → Library-owned intent resolution → all DJ TTS → transactional Program/segments/timeline commit → WebSocket event → old checkpoint/stop → Audio Engine atomic switch`

### 播放

`Canonical timeline → single Audio Engine → local media snapshot → throttled Backend checkpoint → Radio 与 Detail Sheet 共享时间线`

### 反馈记忆

`TasteBlueprint → feedback learning baseline → UI intent → explicit FeedbackEvent → TasteProjection → TasteBlueprint + TasteOverrides → Planner context`

## 9. 失败与降级

阻断当前任务：

- 活动 Planner 失败、超时或结构化输出无效。
- 搜歌重试后没有可播放曲目。
- 数据路径不可写或节目事务提交失败。
- 活动 Planner 未配置（Codex 命令缺失，或 DeepSeek 未确认隐私/未配置 key），或内置网易云 Provider 运行时不可用。

阻断错误必须保留用户输入并提供重试、修改输入或 Settings 入口。

局部降级：

- TTS 失败 → 本次新节目不提交，旧节目继续。
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
- v1 可选语音固定为 Qwen3-TTS 8-bit，中文 `Serena`、英文 `Ryan`；模型由用户首次下载，文本和推理不离开本机，不使用云 TTS 或 Personal Voice。
- DeviceSettings / ProfilePreferences 分离；判别式 PlaybackTimeline。
- Single active playback session + `BroadcastChannel/localStorage` TTL lease。
- Development 双进程、Production 同源单服务；token 只通过 `POST /api/v1/session/bootstrap` 的 `no-store` JSON 响应进入浏览器内存，WebSocket 使用首条 `session.authenticate` 消息认证。
- 工具链采用 Node 24 LTS、Corepack/pnpm 11、TypeScript 6 project references；Web 由 Vite 8 构建，Server/shared 由 `tsc -b` 构建。
- 质量工具采用 ESLint 10 + typescript-eslint、Prettier 3、Vitest 4 + Testing Library/jsdom、Playwright + axe-core；常规 CI 为 GitHub Actions。
- 全仓使用单一 `pnpm-lock.yaml`、精确直接依赖、frozen CI install、24 小时 release age 和显式 dependency build allowlist。
- macOS 包装采用 Electron 主进程 + 现有 Web Renderer + bundled Node Local Service + bundled Python/MLX TTS runtime；当前目标为 macOS 15+ arm64，Qwen 模型不进入 DMG；旧 Swift Launcher 仅作为 legacy 源码保留。
- Personal Local Preview 的唯一桌面入口固定为 `/Applications/Koradio.app`；正常启动前从可信 `origin/main` 本机构建更新并 fail-closed，不修改开发工作树、不创建第二个 PWA 图标或普通网页标签。
- 当前只支持项目所有者从可信源码在受控本机生成个人预览产物；公开下载与外部分发在当前开发阶段后置，不阻塞 Personal Local Preview，届时 Developer ID、Apple 公证、Gatekeeper 与独立干净环境验收仍是硬门。
- Provider 可行性已裁决：NetEase 使用 Backend TypeScript 最小 `linuxapi` Adapter；搜索、歌词、歌单、播放 URL、Range/MIME/CORS 与非法 ID 已脱敏验证，只允许 Personal Local Preview，公开分发前必须重新验证协议、条款和内容边界。

## 11. 尚未决定

Agent 不得自行假定：

- 数据库与其他业务依赖的具体包和精确版本。
- 尚未创建的业务模块、macOS 平台/包装 CI 或产品行为测试覆盖已经可用。

工具链实现必须遵循 ADR 0001；运行拓扑实现必须遵循 ADR 0002；macOS 包装与交付边界必须遵循 ADR 0003；Provider 实现与发布边界必须遵循 ADR 0004、ADR 0007。

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
