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

- 项目处于 Documentation-first 阶段。
- 当前有产品、流程、架构、视觉规范、原型提示词和参考图。
- Git 仓库已初始化并关联 GitHub 远端。
- 开发前视觉设计资产任务与视觉差异裁决机制已定义；VDA-00 资产盘点与差距审计已完成，15 页清单、归一化证据和 A / B / C 级裁决已形成。
- HTML 视觉设计主源骨架、15 页固定 fixture 与页面 / 主题 / viewport 定位已建立；VDA-01 已完成并通过自动验收。
- 与视觉规范对应的 CSS Variables、共享组件 CSS、原型 SVG 图标和 Dark / Light 组件目录已建立；品牌、Tab 与顶部设置图标复用 SVG 图形主源并仅按规范等比例缩放；VDA-02–04 尺度补正已完成自动检查与用户视觉验收。
- 异常与 Profile 01–03 的 Dark HTML 视觉页面已建立，并已按当前权威尺度完成内容列、卡片、头像、表单和纵向节奏校准。
- Radio 三态 04–06 的 Dark HTML 视觉页面已建立；三态复用同一固定骨架，播放器、队列、DJ 状态、对话、输入和底部导航保持共享边缘零位移。
- Detail Sheet 07–08 的 Dark HTML 视觉页面已建立；双态复用同一全屏固定骨架，只替换状态、歌曲、进度与主内容卡文字；浏览器反馈要求的波形密度、标题字号、Detail 专属内容列、主卡尺寸、内部文字分布和底部进度长度已完成同步校准，这些规格不影响其他页面族。
- 01–08、共享组件的新尺度与 Detail Sheet 双态已于 2026-07-13 通过自动验收；核心体验确认门已关闭。
- Library 09 的 Dark HTML 视觉页面已建立；使用 `840px` Management 单列、共享顶部工具与底部导航，并通过 `variant` 固定定位结果、导入中、空库、无结果和服务异常五种状态；结构与文件自动检查及用户视觉验收均已通过，VDA-06 已完成。
- Taste 10–11 的 Dark HTML 视觉页面已建立；概览页使用 `840px` Management 单列与 Taste 选中导航，编辑页不显示主导航并使用全宽半透明固定操作区及内部 `840px` rail；七种读取与保存状态均已通过自动浏览器视觉、结构和文件检查，场景名称与偏好描述控件已按用户视觉反馈统一为 `52px` 高并校准文字垂直对齐，VDA-07 已完成。
- Programs 12–13 的 Dark HTML 视觉页面已建立；列表页使用 `840px` Management 单列、`168px` 编辑式节目卡、本周摘要与 Programs 选中导航，详情页提供场景复用、串讲重播、四曲队列和反馈摘要；八种读取、空态、错误与降级状态均已通过自动浏览器视觉、结构和文件检查，VDA-08 已完成。
- Settings 14–15 的 Dark HTML 视觉页面已建立；配置页使用 `832px` Settings 单列、`64px` 服务配置输入框和主要区块间 `24px` 纵向节奏，偏好设置三项控件统一为 `44px` 高并保留 `8px` 行间距，Test 与 Change 保持 `44px` 命中区并将可见边框内收为 `32px`，保留密钥遮蔽、Theme Mode、DJ 偏好、本地数据和固定操作区，DJ Voice Style 选择框下不重复显示说明；检测页提供四项服务结果、TTS 局部降级、全部可用与核心服务失败状态；七种固定变体均已通过自动浏览器视觉、结构和文件检查，VDA-09 已完成。
- Light 核心页 01–08 已完成独立材质校准；Light 使用冷灰白背景、白色或近白 Surface、Light Accent 低透明度环境光与主题表面薄层，Dark 取值和页面结构保持不变，07–08 继续使用固定 Detail 色面。八页已通过 `960 × 1600px` 自动浏览器视觉、结构、对比度和文件验收，VDA-10 已完成。
- Light 管理页 09–15 已完成独立材质校准；管理页和 Settings 的表单、列表、卡片、固定操作区继续复用 Dark 几何，Light 环境光统一使用主题变量，低对比状态色只保留在状态点、图标和边框，小号状态文字使用可读的 Secondary 或加深错误色。27 个固定变体已通过自动浏览器视觉、结构、对比度和文件验收，VDA-11 已完成。
- 响应式代表页 03、05、08、10、14 已覆盖 Profile、Radio、Detail、Management、Settings 五类布局；Mobile `390 × 844px`、Tablet `834 × 1194px`、Desktop `1440 × 1200px` 共享同一 HTML 内容与主题几何，使用布局族安全边距、独立滚动层和固定顶部 / 底部区域。30 个 Dark / Light 场景已通过画布、滚动、固定区域、安全区、长文案、横向溢出和 `44 × 44px` 最小命中区自动浏览器验收，VDA-12 已完成。
- 组件目录与 01–15 HTML 视觉主源已覆盖 Hover、Active、Focus、Disabled、Loading、Error、键盘路径、状态播报、页面切换、Detail 开合、200% zoom 与 Reduce Motion；Detail 已读大字按用户确认使用 `#898A86` 并满足大号文字 WCAG AA。15 页 185 个可见可用控件、9 个 Loading / Error 代表状态、Modal 焦点循环、暂停语义和浏览器无障碍树均通过自动验收，VDA-13 已完成。
- VDA-14 已从 HTML 视觉主源生成 15 张 Dark、15 张 Light `960 × 1600px` Prototype 基线，以及 5 个布局族代表页 × 3 组 viewport × 2 个主题的 30 张响应式基线；60 张 PNG、清单、自动 QA 与复渲染验证均通过，未新增 A / B 级差异。
- VDA-15 已从 HTML Git 版本 `325b604` 与 VDA-14 正式基线建立 [Koradio · Visual Baseline · MVP](https://www.figma.com/design/ZxAWTQW5aH3VMd9H3T8zcJ) 派生镜像；文件含 10 页、209 个变量、10 个文字样式、4 个效果样式、7 个组件集 66 个变体及 60 张页面 Frame，并通过结构与人工视觉复核。C-014 明确页面图像填充、SF Pro 可见文字回退、响应式计算和交互转换限制；HTML / CSS / JavaScript 仍是唯一视觉主源。
- VDA-16 已建立 15 页、35 个固定状态、12 个组件组、13 个 token 组、fixture / renderer 与 60 张正式基线的开发交接映射和前端视觉验收清单；冻结标识为 `Koradio Visual Freeze · MVP · VDA-16 · 2026-07-14`。C-015 明确 20 个非默认 HTML 变体没有独立正式 PNG，整体视觉冻结门已通过；后续视觉变化须先更新对应权威文档与 HTML 主源，再重新生成截图与 Figma 派生物。
- VDA-17 已按 2026-07-15 用户验收完成冻结后视觉校准：Radio 大号时间使用本机 `HONOR Sans Heavy`，原型为 `80px / 80px / 900`、移动端为 `56px / 56px / 900`；04–06 共用 `340px` 主内容与 `288px` DJ 对话 slot；07–08 顶部声波使用 64 根白色/浅灰色平滑包络柱与 `880ms` 传播式波浪，节目进度改为确定性非规则波形，07 串讲词顶部对齐并使用 `24px` 组间距。HTML、权威设计文档与 60 张正式基线固化于 Git `6e97fb74826cdd48e5f75fe57646ac55340aab3c`，复渲染最大像素差异率 `0.4%`；Figma 60 个页面 Frame 已全部按新基线刷新并通过图片哈希核对。当前冻结标识为 `Koradio Visual Freeze · MVP · VDA-17 · 2026-07-15`。
- 尚无源码、依赖清单、锁文件、运行脚本和测试配置。
- 当前不可安装、启动、测试或构建。
- 文档中的代码结构、技术栈、API 和运行行为均为目标设计。

### 目标运行形态

- React + Vite 本地 Web/PWA。
- Node.js + Fastify TypeScript 模块化单体。
- Browser Audio Engine 拥有唯一 `HTMLAudio` 实例。
- REST 承载查询与命令，WebSocket 推送任务和领域事件。
- SQLite 保存结构化事实，File Store 保存媒体与缓存。
- Codex、网易云与 TTS 通过 Backend Adapter 接入。
- 服务默认只在 loopback 提供本地访问。

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
| Profile、Taste、Program、Queue、Feedback | Backend modules | SQLite |
| 播放时间、暂停、seek、buffering、媒体错误 | Browser Audio Engine | 低频 checkpoint |
| 生成任务与服务健康状态 | Backend runtime | Snapshot |
| Sheet、draft、筛选、展开状态 | Frontend feature | In-memory |
| Theme、DJ language、voice style | Backend Settings | SQLite / secret reference |

关键边界：Profile 是数据分区而非身份认证；MVP 只有一个 active playback session；Browser 不直接调用 Provider；Domain 不依赖框架或 Provider SDK；Provider response 不得成为公共 contract；外部输入必须在边界校验。

## 6. 模块认知

| Module | Owns | Does not own |
|---|---|---|
| Profiles | 档案 CRUD 与 profile context | 登录身份、播放状态 |
| Radio | 场景入口与当前节目组合 | Provider、持久化 |
| Programs | 生成任务、节目、DJ 段和历史 | `HTMLAudio` 状态 |
| Playback | 队列控制与恢复 checkpoint | 节目规划、UI Sheet |
| Library | 搜索、导入与归一化曲目 | 推荐决策、播放控制 |
| Taste | 标签、避雷、场景规则与 projection | Provider response |
| Feedback | 喜欢、不喜欢、跳过、收藏事实 | 重写历史事实 |
| Settings | 配置、偏好、secret reference 与诊断 | 明文密钥输出 |

## 7. 关键领域对象

| Object | Meaning |
|---|---|
| `profile` | 本地数据分区根 |
| `taste_profile` | 可从反馈重建的品味 projection |
| `settings` | Profile 配置与 secret reference |
| `music_track` | 归一化曲目与 Provider source identity |
| `program` | 一次场景生成后的节目快照 |
| `dj_script_segment` | DJ 文本与可选音频引用 |
| `play_queue` / item | 节目规范播放顺序 |
| `playback_state` | 可恢复的低频播放 checkpoint |
| `feedback_event` | Append-only 用户反馈事实 |

播放 URL 是短期资源；历史恢复依赖 Provider source identity。

## 8. 核心数据流

### 节目生成

`Radio submit → Programs job → Codex plan validation → Music resolve → optional TTS → transactional Program/segments/queue commit → WebSocket event → Audio Engine`

### 播放

`Canonical queue → single Audio Engine → local media snapshot → throttled Backend checkpoint → Radio 与 Detail Sheet 共享时间线`

### 反馈记忆

`UI intent → feedback_event → Taste projection → cache invalidation → next Codex context`

## 9. 失败与降级

阻断当前任务：

- Codex 失败、超时或结构化输出无效。
- 搜歌重试后没有可播放曲目。
- 数据路径不可写或节目事务提交失败。
- 必需的本地服务或音乐服务未配置。

阻断错误必须保留用户输入并提供重试、修改输入或 Settings 入口。

局部降级：

- TTS 失败 → 文字 DJ，歌曲继续。
- 歌词失败 → 无歌词状态，播放继续。
- 无分句时间戳 → 近似高亮。
- 单曲失败 → 标记失败并尝试下一首。
- 反馈失败 → 回滚反馈 UI，播放继续。
- 历史音频缺失 → 保留文字串讲。
- Detail Sheet 失败 → 返回 Radio，播放继续。

## 10. 已确定的技术决策

- TypeScript monorepo；React + Vite PWA；Fastify modular monolith。
- SQLite + Drizzle migrations；REST + WebSocket；Zod wire contracts。
- Browser owns live playback；Provider ports 隔离外部服务。
- OS Credential Store；显式 `profileId`；append-only feedback。
- Single active playback session。

## 11. 尚未决定

Agent 不得自行假定：

- Package manager、Node.js 与依赖版本。
- Workspace、build、test 和浏览器自动化工具。
- Development 与 production 端口。
- 安装、启动、测试、构建、lint 和 format 命令。
- 实际 monorepo 脚手架和 CI 平台。

实现脚手架前必须显式决策，并同步 README、工程配置和权威文档。

## 12. Context 路由

| Need | Read |
|---|---|
| 产品范围、字段、文案、验收 | [docs/prd.md](docs/prd.md) |
| 交互路径与异常分支 | [docs/user-flow.md](docs/user-flow.md) |
| 架构、API、数据、安全与依赖 | [architecture.md](architecture.md) |
| UI、token、动效与无障碍 | [design/design.md](design/design.md) |
| 高保真页面生成 | [design/prompt.md](design/prompt.md) 与 [design/references/](design/references/) |
| 开发前视觉设计资产沉淀 | [design/tasks/visual-assets.md](design/tasks/visual-assets.md) |
| 视觉资产审计与裁决 | [design/assets/reports/visual-audit.md](design/assets/reports/visual-audit.md) 与 [design/assets/reports/visual-decisions.md](design/assets/reports/visual-decisions.md) |
| 前端视觉实现与冻结版本追溯 | [design/assets/reports/handoff-map.md](design/assets/reports/handoff-map.md) |
| 工程硬约束 | [AI_RULES.md](AI_RULES.md) |
| Agent 工作流程 | [AGENTS.md](AGENTS.md) |

文档冲突必须按 Concern 在对应权威文档中显式解决，禁止静默择一。
