# Koradio Engineering Rules

> Scope: Koradio 的所有源码、配置、测试、migration 与工程文档  
> Status: Target engineering law；代码尚未实现  
> Keywords: `MUST`、`MUST NOT`、`ALWAYS`、`NEVER` 均为强制要求

## 1. 权威与适用性

> [RULE-SOURCE]

- **MUST** 按 Concern 使用权威来源：产品行为看 `docs/prd.md`，流程看 `docs/user-flow.md`，架构看 `architecture.md`，UI 看 `design/design.md`。
- **MUST** 将本文件作为工程实现与代码审查的硬约束入口。
- **MUST** 在实现前核实相关代码、配置和依赖真实存在。
- **MUST NOT** 将目标架构、目标目录或 Planned 技术描述为当前实现。
- **MUST NOT** 在权威文档冲突时静默选择；冲突必须先被显式解决并同步文档。

## 2. 系统架构

> [RULE-ARCH]

- **MUST** 使用 TypeScript monorepo 组织目标实现。
- **MUST** 保持 `apps/web`、`apps/server`、`packages/contracts` 与 `packages/design-tokens` 的边界。
- **MUST** 使用模块化单体承载 Local Service；模块必须按业务能力划分。
- **MUST** 让依赖指向更稳定边界：composition → feature → shared/contracts，adapter → port。
- **MUST** 为每个模块提供单一公开入口；跨模块调用必须经过公开 application API、contract 或 domain event。
- **MUST** 让每个持久实体只有一个写入 owner。
- **MUST NOT** 让 Shared Layer 依赖任何 feature。
- **MUST NOT** 让 Feature 读取其他 Feature 的表、内部 repository、store 或 component。
- **MUST NOT** 因未来设想提前引入微服务、插件系统、同步层或远程身份边界。

## 3. Frontend 与播放状态

> [RULE-FRONTEND]

- **MUST** 让 Page 只负责组合 Feature，不承载领域规则或 Provider 细节。
- **MUST** 使用 Server State 层管理远端查询、mutation、失效和重连。
- **MUST** 仅让跨组件、非持久 UI 状态进入轻量 UI Store。
- **MUST** 让局部表单、Sheet、筛选和折叠状态保留在 Feature 或 Component 内。
- **MUST** 通过单一 Audio Engine facade 暴露播放快照和控制命令。
- **MUST** 让 Browser Audio Engine 成为 `positionMs`、pause、seek、buffering 与 media error 的实时事实源。
- **MUST** 让 Radio 与 Detail Sheet 订阅同一播放时间线。
- **MUST** 对播放 checkpoint 进行节流，并在暂停、切歌和关闭等边界触发保存。
- **MUST** 使用 `BroadcastChannel + localStorage TTL lease` 保证唯一主控标签；主控每 `2s` 续约，租约 `5s` 过期，被动标签只读。
- **MUST** 在标签接管前由原主控保存 checkpoint 并停止播放；使用 lease epoch 丢弃旧主控的迟到命令。
- **MUST** 在 Profile 切换时取消旧生成任务、丢弃迟到事件、保存并停止旧播放，再加载新 Profile。
- **MUST NOT** 创建多个竞争的 `HTMLAudio` 实例或页面级播放事实源。
- **MUST NOT** 通过 WebSocket 发送逐帧播放进度。
- **MUST NOT** 让 Frontend 导入 Server、Drizzle、Node API 或秘密配置。

## 4. Backend、Domain 与 Provider

> [RULE-BACKEND]

- **MUST** 将 Transport、Application、Domain、Ports、Adapters 与 Platform 职责分离。
- **MUST** 让 Application 层负责用例、事务、取消、超时、重试和降级决策。
- **MUST** 让 Domain 只表达稳定业务规则。
- **MUST** 通过 Port 接口调用 Codex、Music、TTS、Repository、Secret Store 与 File Store。
- **MUST** 将 Provider response 归一化后再进入 Application 或公共 contract。
- **MUST** 为异步生成任务提供 job ID、取消、超时、幂等和可恢复 snapshot。
- **MUST** 在 TTS 不可用时保留文字 DJ，并继续可播放节目。
- **MUST** 将 Codex 与网易云视为节目生成核心依赖，将 TTS 视为可选增强。
- **MUST** 在新节目完整提交前继续播放旧节目；失败保持旧节目不变，成功后保存旧 checkpoint、停止旧时间线并原子切换。
- **MUST** 在单曲不可播放时标记运行时失败并尝试下一首。
- **MUST NOT** 让 Domain 导入 React、Fastify、Drizzle、WebSocket 或 Provider SDK。
- **MUST NOT** 让 Adapter 决定业务降级、修改领域规则或泄露供应商结构。
- **MUST NOT** 让外部网络请求占用数据库事务。

## 5. Contracts、REST 与 Events

> [RULE-CONTRACT]

- **MUST** 使用 Zod schema 作为 wire contract 的唯一运行时定义。
- **MUST** 从 Zod schema 推导 TypeScript wire 类型。
- **MUST** 将 Wire DTO 与 internal entity 分离。
- **MUST** 在 REST、WebSocket、Codex output 和 Provider response 边界执行运行时校验。
- **MUST** 使用 `/api/v1` 承载资源查询、命令、snapshot 与 health check。
- **MUST** 使用 `/api/v1/events` 推送领域变化和异步任务阶段。
- **MUST** 让 Profile-owned route 显式携带 `profileId`。
- **MUST** 使用 `/api/v1/device-settings` 管理设备配置，使用 `/api/v1/profiles/:profileId/preferences` 管理 Profile 偏好。
- **MUST** 让数据目录迁移使用 `/api/v1/device-settings/data-root-migrations` 幂等异步命令并返回 `jobId`。
- **MUST** 使用 `POST /api/v1/session/bootstrap` 承载本地 session token bootstrap，并返回 `Cache-Control: no-store` 的 JSON 响应。
- **MUST** 让 Event envelope 包含 `eventId`、`eventType`、`version`、可选 `profileId`、`correlationId`、`sequence`、`occurredAt` 与 `payload`。
- **MUST** 使用 `sequence` 去重并丢弃乱序事件，使用 `correlationId` 隔离任务。
- **MUST** 让创建类命令接受 `Idempotency-Key`，重复请求返回原结果或当前 job。
- **MUST** 返回包含稳定 `code`、安全 `message`、`retryable` 与 `correlationId` 的错误 envelope。
- **MUST** 对 breaking contract 提升 major version；新增可选字段必须保持向后兼容。
- **MUST NOT** 将 Provider 协议、ORM model、秘密或原始异常堆栈暴露为公共 API。

## 6. 数据与文件

> [RULE-DATA]

- **MUST** 使用版本化 migration 修改 SQLite schema。
- **MUST** 启用 SQLite foreign keys 与 WAL。
- **MUST** 在单一事务中提交 Program、DJ segments 与 PlaybackTimeline items。
- **MUST** 使用 `dj` / `track` discriminated union 表达 PlaybackTimelineItem；文字 DJ 只保留在 Program segment，不创建伪音频 item。
- **MUST** 将 Feedback 保存为固定枚举的 append-only 显式事件：`track_liked`、`track_like_removed`、`track_disliked`、`track_dislike_removed`、`program_favorited`、`program_favorite_removed`、`track_skipped`。
- **MUST** 将 Taste 分为可重建 `TasteProjection`、人工 `TasteOverrides` 与合并后的 `EffectiveTaste`；人工规则优先且不得被 projection 重建覆盖。
- **MUST** 将 `DeviceSettings` 与 `ProfilePreferences` 分属设备级和 Profile 级 owner；`ServiceHealth` 仅作为运行时 snapshot。
- **MUST** 在首次启动使用 OS 应用数据目录；迁移前验证目标为空且可写，暂停任务和播放、保存 checkpoint、备份复制校验并原子切换 bootstrap。
- **MUST** 在迁移失败时回滚到旧数据目录，并保留旧数据与备份，不得自动删除。
- **MUST** 只保存上传流程生成的受控 `avatarRef`，拒绝任意 URL、绝对路径和裸文件名。
- **MUST** 使用 Provider source identity 恢复历史曲目。
- **MUST** 只在数据库保存受控相对文件引用，不保存任意绝对路径。
- **MUST** 通过 Application use case 完成 Profile 数据和文件清理。
- **MUST** 为 Program 列表提供分页，为歌词和历史详情提供按需加载。
- **MUST** 对媒体、歌词、TTS 和搜索缓存设置容量、过期或清理策略。
- **MUST NOT** 依赖短期播放 URL 作为永久历史身份。
- **MUST NOT** 在运行时自动重建、覆盖或静默修复生产数据表。
- **MUST NOT** 持久化队列展开态、详情覆盖层开关、高亮行、场景输入 draft 或实时播放进度。
- **MUST NOT** 让 UI 直接执行数据库级联删除。

## 7. 安全

> [RULE-SECURITY]

- **MUST** 默认只绑定 `127.0.0.1` 或 `::1`。
- **MUST** 按 ADR 0002 使用 Development Vite `127.0.0.1:5173` + Local Service `127.0.0.1:49373`，Production 同源 Local Service 首选 `49373` 并仅允许 `49373-49383` 有界 fallback。
- **MUST** 对 REST 与 WebSocket 使用相同的 session 与 Origin 校验。
- **MUST** 在每次服务启动时生成短期 session token，并只保存在内存。
- **MUST** 让 WebSocket 先校验 Origin，再通过首条 `session.authenticate` 消息认证；认证前不得发送领域事件。
- **MUST** 使用 OS Credential Store 保存 API key 与其他秘密。
- **MUST** 对日志、错误、诊断和 API 响应执行秘密与敏感正文脱敏。
- **MUST** 在 Codex 输出校验失败时只记录稳定错误码、correlation ID、schema 失败摘要和脱敏诊断元数据。
- **MUST** 将 External JSON、Codex output、歌词、媒体 URL、文件名和 MIME 视为不可信输入。
- **MUST** 让 File Store 拒绝路径越界、未允许扩展名、超限大小、非法 MIME 和不安全重定向。
- **MUST** 通过参数数组启动 Codex，并验证可执行路径。
- **MUST NOT** 将 token 或 key 写入 URL、日志、SQLite、LocalStorage、历史或错误报告。
- **MUST NOT** 将 token 嵌入 HTML、query、fragment、redirect、cookie、SessionStorage、IndexedDB 或 WebSocket URL。
- **MUST NOT** 保存、记录或回显无效 Codex 输出的原始正文。
- **MUST NOT** 拼接 shell command 启动 Provider 或本地进程。
- **MUST NOT** 默认监听局域网或公网。
- **NEVER** 向 Frontend 返回明文秘密。

## 8. TypeScript

> [RULE-TS]

- **MUST** 启用 TypeScript strict mode 与 `noImplicitAny`。
- **MUST** 对外部输入使用 `unknown`，经 schema 或 type guard 收窄后再使用。
- **MUST** 为公共函数、Port、event、command 和 repository 定义明确输入输出类型。
- **MUST** 使用 discriminated union 表达有限状态机和结果类型。
- **MUST** 对异步失败返回可判别错误或抛出受控领域错误。
- **MUST** 通过公开入口导入跨模块类型与函数。
- **MUST NOT** 使用 `any`、双重类型断言或 `@ts-ignore` 绕过边界校验。
- **MUST NOT** 复制与 Zod schema 独立维护的 wire interface。
- **MUST NOT** 使用 Boolean 参数隐藏多个行为分支；必须使用明确 command 或 options 类型。
- **MUST NOT** 添加复述代码的注释；注释只能解释无法从实现推导的原因、约束或权衡。

## 9. 工具链与依赖治理

> [RULE-TOOLCHAIN]

- **MUST** 按 `docs/adr/0001-toolchain-and-quality.md` 实现工具链，不得将尚未创建的 manifest、锁文件、配置或 script 描述为当前事实。
- **MUST** 使用 Node.js 24.18.0 LTS、Corepack 0.35.0 与 pnpm 11.13.0，并在配置中同时固定运行版本和 package manager 版本。
- **MUST** 使用单一根 `pnpm-lock.yaml`、pnpm 原生 workspace 和 `workspace:*` 内部依赖；CI 必须执行 frozen lockfile install。
- **MUST** 使用 ESM-only TypeScript 6.0.3 project references；Web 使用 `moduleResolution: "bundler"`，Server 与 Node 工具使用 `NodeNext`。
- **MUST** 让 Web 使用 Vite 8.1.4 构建，让 Server、contracts 与 design tokens 使用 `tsc -b` 构建。
- **MUST** 使用 ESLint 10 flat config、typescript-eslint typed lint 与精确固定的 Prettier 3.9.5。
- **MUST** 使用 Vitest 4 + V8 coverage 承载 unit、contract 与 integration，使用 React Testing Library + jsdom 承载 component，使用 Playwright + axe-core 承载 E2E、视觉与自动无障碍检查。
- **MUST** 在根 manifest 提供 ADR 0001 定义的 `dev`、typecheck、lint、format、测试、build 与 `check` 命令族。
- **MUST** 精确固定直接依赖，设置 24 小时 release age、严格 engine、frozen lockfile 和 pnpm `allowBuilds` 审批；依赖 build script 默认拒绝。
- **MUST** 让 GitHub Actions 的常规质量门运行在 Linux，让 Credential Store、数据目录、进程生命周期与包装探针运行在 macOS；第三方 Actions 固定完整 commit SHA。
- **MUST NOT** 混用 package manager 或锁文件、依赖浮动 tag、启用 `dangerouslyAllowAllBuilds`，或自动合并 major 工具升级。
- **MUST NOT** 在没有可观察瓶颈和新 ADR 的情况下引入 Turborepo、Nx 或第二套测试/格式化体系。

## 10. UI 与无障碍

> [RULE-UI]

- **MUST** 使用 `design/design.md` 定义的 token、组件尺寸和状态映射。
- **MUST** 让后续页面族从共享 token 继承顶部工具、底部导航、排版、表单和内容列尺度；不得恢复 VDA-00 的历史小规格，也不得用页面私有硬编码建立平行尺寸体系。
- **MUST** 保持 Radio 为中央单列；宽屏不得改成多栏控制台。
- **MUST** 让 Radio 空态、播放态和生成态共享同一页面骨架。
- **MUST** 让 Detail Sheet 覆盖完整产品画布，并与 Radio 共享播放状态。
- **MUST** 让 Radio 心形按钮只表达“喜欢歌曲”，不喜欢位于 More，节目收藏只位于 Programs/节目入口；Detail Sheet 只保留单一播放/暂停。
- **MUST** 在 Local Service 完全离线时仅允许已打开或缓存的 PWA 展示只读 Settings，禁用配置、密钥、测试与迁移控件。
- **MUST** 让主按钮使用黑白高对比，绿色只表达在线、播放、成功、Focus 或少量波形活动。
- **MUST** 让头像、封面、圆形按钮、状态点和图标按钮使用固定比例容器。
- **MUST** 让 DJ 文案使用节目正文语义；仅用户输入使用弱气泡。
- **MUST** 为阻断错误提供内联恢复入口；Toast 只能承担非阻断反馈。
- **MUST** 支持键盘操作、可见 Focus、WCAG AA、200% zoom、`aria-live` 与 44 × 44px 最小命中区。
- **MUST** 支持 `prefers-reduced-motion`，并以文字保留状态语义。
- **MUST NOT** 用颜色作为唯一状态表达。
- **MUST NOT** 使用大型装饰插画、霓虹、重玻璃拟态、后台式侧边栏或大面积绿色填充。
- **MUST NOT** 让专辑封面控制页面主题色。

## 11. 测试与质量门禁

> [RULE-TEST]

- **MUST** 为 Domain policy、状态转换、projection 与纯函数编写单元测试。
- **MUST** 为所有 Zod command、DTO、event 与 error schema 编写有效和无效样例测试。
- **MUST** 为 Module use case、transaction、repository 与 Adapter mapping 编写集成测试。
- **MUST** 为 Audio Engine 的 play、pause、seek、切段、checkpoint 和 media error 编写确定性测试。
- **MUST** 为关键 UI 状态、键盘操作、Focus、aria 与 Reduce Motion 编写组件测试。
- **MUST** 为档案创建、首次配置、节目生成、播放、反馈和失败恢复建立核心 E2E。
- **MUST** 覆盖 Codex invalid output、搜歌为空、TTS 降级、歌词缺失、单曲失败、反馈回滚与事件重连。
- **MUST** 覆盖 OS 默认数据目录、迁移成功/回滚、播放中生成、Profile 切换、双标签接管、反馈撤销和 TasteProjection 重建不覆盖 overrides。
- **MUST** 在 Unit 与 Integration 测试中替换真实 Provider，保持测试可重复且不消耗外部额度。
- **MUST** 为每个 bug fix 添加能在修复前失败、修复后通过的 regression test。
- **MUST** 在合并前通过 typecheck、lint、format check、相关测试与构建。
- **MUST** 披露无法运行的质量门禁及其缺失条件。
- **MUST NOT** 通过删除测试、放宽断言、跳过失败用例或降低类型安全使检查通过。

## 12. 规则变更

> [RULE-CHANGE]

- **MUST** 在改变事实源、module owner、contract、数据库归属或依赖方向前更新 `architecture.md`。
- **MUST** 在改变 UI token、组件骨架、状态映射或无障碍要求前更新 `design/design.md`。
- **MUST** 在改变产品行为或验收标准前更新 `docs/prd.md` 与受影响流程。
- **MUST** 在同一变更中同步本文件、README 与 Context 摘要。
- **MUST NOT** 保留失效规则、重复规则或与权威文档矛盾的规则。
