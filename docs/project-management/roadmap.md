# Koradio macOS v1.0 路线图

> Status: Planning baseline
> Release scope: PRD P0 + P1 全量能力
> External testing rule: S5、S6、S7 全部通过后才开始首轮外部 Beta
> Schedule model: 依赖与阶段门，不承诺日历日期

## 0. AI 路线定位

| 判断项 | 当前结论 | AI 行动 |
|---|---|---|
| 当前阶段 | S4 P0 核心产品体验 | S3-01～S3-07 已完成，按依赖进入 S4 |
| 已通过阶段门 | S0 基线与关键决策；S1 工程脚手架；S2 平台、数据与安全底座；S3 核心领域与 Provider 后端 | ADR 0000～0004、Mock skeleton、平台安全底座、八个后端模块、Provider adapters 与确定性 Mock 后端闭环已验证 |
| 当前关键路径 | `S4-05` | 实现 Detail Sheet、歌词与串讲跟随 |
| 产品实现状态 | S4-04 唯一 Audio Engine、确定性播放控制、checkpoint 和多标签接管完成；Detail Sheet 与反馈 UI 未实现 | 不把 Mock 后端、设计 fixture 或尚未实现的 Detail/反馈入口描述为完整 P0 闭环 |
| 外部测试状态 | 禁止开始 | 仅当 `S5-04`、`S6-05`、`S7-05` 全部完成后解除 |
| 当前交付渠道 | Personal Local Preview，只在项目所有者受控本机使用 | 不上传、不建立公开下载入口、不向外部分发 ad-hoc 产物 |
| 后续公开目标 | 经项目所有者再次授权的 macOS v1.0，P0 + P1，Developer ID 签名公证直发 | Windows、App Store、自动更新和云能力保持范围外 |

阶段定位只在阶段门通过后更新。单个任务完成只更新 [tasks.md](tasks.md)；若它关闭或改变阶段门，再同步本表。

## 1. 当前进度评估

Koradio 已完成开发前产品和视觉定义、可安装/启动/测试/构建的 S1 Mock skeleton、S2 平台/数据/安全底座、S3 后端闭环，以及 S4-01～S4-04 App Shell、Profile/Settings、Radio 三态/节目生成交互和唯一 Browser Audio Engine/多标签租约。bundled native TTS helper 与真实 Provider 产品运行组合尚未实现。

| 进度维度 | 当前状态 | 证据 | 下一门槛 |
|---|---|---|---|
| 产品定义 | 已完成开发前校准 | `docs/prd.md`、`docs/user-flow.md` | 实现中发现冲突时先回写权威文档 |
| 系统架构 | 目标架构已完成；S1 Web/Server/Contracts/Tokens、S2 平台边界、S3 后端闭环与 S4-01～S4-04 Frontend 已实装 | `architecture.md`、`AI_RULES.md`、ADR 0001～0004、S1/S2/S3 测试、S3-07 验收记录与 S4-01～S4-04 浏览器验收 | S4-05～S4-06 P0 前端组合 |
| 视觉设计 | VDA-17 已冻结 | HTML 主源、60 张基线、Figma 镜像、handoff map | 产品实现通过视觉和无障碍回归 |
| 工程基础 | S1 阶段门已通过 | manifest、锁文件、四边界源码、dev/build/check、REST/WS、三浏览器 E2E 与真实 CI 已验证 | 随 S2～S6 持续扩展质量门 |
| 产品功能 | Profile/Settings、Radio 生成交互与浏览器播放控制已形成；Detail/反馈闭环未形成 | Profile CRUD/选择、配置、偏好、诊断、Library、Taste/Feedback、Program/Playback、生成 Job、Provider adapters、Mock 闭环、Radio 三态与唯一 Audio Engine 已实现 | S4 P0 与 S5 P1 功能阶段门 |
| 质量验证 | S3 后端阶段门已通过 | unit/contract/integration/component/E2E/visual/coverage 入口、Provider fixtures、事务/失败矩阵与数据库快照断言 | S4/S5 持续扩展，S6 全质量门收口 |
| 发布准备 | 未开始 | 无 macOS 包装、签名、公证和发布流程 | S7 发布工程阶段门 |

开发基线已由 ADR 0000 确认并进入 `main`；常规任务在根目录 `main` 顺序执行，不得覆盖或回退 VDA-17 与已提交的文档资产。

## 2. v1.0 发布边界

当前先完成项目所有者受控本机的 Personal Local Preview，不创建公开下载入口。项目所有者后续再次授权公开下载时，macOS v1.0 包含 PRD 定义的六项 P0 和三项 P1 能力，并以签名、公证安装包直接发布。Windows、Mac App Store、云同步、远程访问、支付、公开社区、自动更新和多音乐源不进入 v1.0。

包装形态已由 ADR 0003 固定为 macOS 13.5+ 的分架构 app/DMG、原生轻量 launcher + bundled Local Service + 外部浏览器 PWA。S0 接受本地架构裁决；Developer ID、Apple 公证、Gatekeeper 和独立干净环境保留为未来 S7 公开分发硬门。

## 3. 阶段路线

| 阶段 | 目标 | 主要任务组 | 阶段门 |
|---|---|---|---|
| S0 基线与关键决策 | 关闭所有会改变脚手架和发布路径的高影响未知项 | 基线整理、工具链 ADR、运行拓扑、包装 PoC、Provider 可行性 | 决策均有 ADR，工作树基线明确，无阻塞性选型 |
| S1 工程脚手架 | 建立可安装、可运行、可测试、可构建的最小骨架 | Monorepo、严格类型、应用骨架、health/events、Mock、CI | 全新环境按 README 完成 install/dev/test/build |
| S2 平台、数据与安全底座 | 建立公共 contract、持久化、文件、秘密和本地安全边界 | Zod、SQLite/Drizzle、data root、Secret/File Store、session/Origin | 平台集成测试通过，Frontend 无明文秘密 |
| S3 核心领域与 Provider 后端 | 建立完整生成、播放和记忆领域闭环 | 八个业务模块、Provider adapters、jobs、事务和事件 | Mock Provider 可生成可播放节目，TTS 可安全降级 |
| S4 P0 核心体验 | 交付首次配置、生成、播放、详情和反馈闭环 | App Shell、Profile、Settings、Radio、Audio Engine、Detail、Feedback | P0 E2E、失败恢复、视觉和无障碍验收通过 |
| S5 P1 全量功能 | 补齐 Library、Taste 和 Programs | 搜索/导入、品味编辑、历史/复用/收藏 | PRD 九项能力和 15 个页面状态由真实产品承载 |
| S6 集成、质量与安全加固 | 关闭异常、性能、安全和跨边界缺口 | 失败矩阵、迁移回滚、长时播放、审计、可访问性、全回归 | 所有合并前质量门和安全检查通过 |
| S7 macOS 打包与发布工程 | 先完成本地个人包装生命周期；公开分发获授权后再生成可信安装包 | 包装、安装生命周期、签名公证、发布流水线、用户文档 | 本地包可重复构建；任何外部分发前干净 Mac 验收和签名公证有效 |
| S8 外部测试与 RC | 仅在项目所有者授权外部测试后，用完整产品进行验证并冻结候选版本 | Beta、缺陷分流、兼容验证、完整回归、RC 冻结 | 无 Blocker/Critical；High 已修复或有发布豁免 |
| S9 v1.0 发布与稳定期 | 仅在项目所有者授权公开下载后建立可恢复的发布闭环 | Go/No-Go、发布、下载冒烟、热修复、复盘 | v1.0 可下载安装，稳定期退出条件满足 |

## 4. 关键路径

```text
S0 决策关闭
  → S1 可运行骨架
  → S2 平台边界
  → S3 后端闭环
  → S4 P0 体验
  → S5 P1 全量
  → S6 全质量门
  → S7 签名公证安装包
  → S8 全量 Beta 与 RC
  → S9 v1.0 发布
```

S3 的独立模块、S4 的视觉实现和 S6 的测试建设可以在依赖明确时并行，但不能绕过所属阶段门。自动化测试必须随功能建设持续落地，S6 负责完整收口而不是首次补测试。

## 5. 文件与目录生成矩阵

下表中的“计划”路径当前不存在，不得描述为已实现。精确工具配置文件名在 S0 ADR 选定后确定；表中只列已经由架构或发布目标确定的路径。

| 阶段 / 任务 | 状态 | 待创建或生成的路径 | 用途与边界 |
|---|---|---|---|
| S0-01 | 已创建 | `docs/project-management/README.md`、`roadmap.md`、`tasks.md`、`release-checklist.md` | 项目管理事实源，不承载产品规则 |
| S0-02 | 已创建 | `docs/adr/`、`docs/adr/README.md`、`docs/adr/template.md`、`docs/adr/0000-development-baseline.md` | 记录开发基线和后续高影响工程决策 |
| S0-03 | 已创建 | `docs/adr/0001-toolchain-and-quality.md` | 工具链、命令族、测试、CI 与升级策略；不代表配置已实装 |
| S0-04 | 已创建 | `docs/adr/0002-runtime-topology.md` | 运行拓扑、端口、Origin allowlist 与本地 session bootstrap 决策 |
| S0-05 | 已创建 · 已接受 | `docs/adr/0003-macos-packaging.md`、`docs/adr/evidence/0003-macos-packaging-poc.md` | 包装架构与本地个人使用边界；未来公开分发仍需正式签名、公证和独立干净环境验收 |
| S0-06 | 已创建 · 已接受 | `docs/adr/0004-provider-feasibility.md` 及脱敏验证报告 | 接受 Codex CLI、TypeScript NetEase `linuxapi` Adapter 与 bundled Apple TTS helper；仅限 Personal Local Preview |
| S1-01 | 已创建 | 根 `package.json`、workspace manifest、锁文件、Node 版本文件 | 固定安装和 workspace 入口 |
| S1-02 | 已创建 | 根 TypeScript、lint、format、test 配置 | strict 类型和统一质量门 |
| S1-03 | 已创建 | `apps/web/`、`apps/server/`、`packages/contracts/`、`packages/design-tokens/`、`.env.example` | 四边界最小源码、Mock health、REST/WS、dev/build 与同源静态托管 |
| S1-04 | 已创建 | `.github/workflows/ci.yml` | 固定完整 Action SHA 的 Linux CI、frozen install、聚合质量门、浏览器/axe 与视觉回归；不包含密钥 |
| S2-01 | 已扩展 | `packages/contracts/src/` | 完整 `/api/v1` DTO、command、event、error、幂等 request 与异步 job contracts；不包含 ORM、Provider response 或内部 entity |
| S2-02 | 已创建 | `apps/server/src/platform/db/`、`apps/server/migrations/` | SQLite/Drizzle、版本化 migration、WAL、foreign keys 与首次数据目录 bootstrap |
| S2-03 | 已创建 | `apps/server/src/platform/secrets/`、`files/`、`logging/` | macOS Keychain、受控文件、下载限制与结构化脱敏日志平台边界 |
| S2-04 | 已扩展 | `apps/server/src/bootstrap/`、`apps/web/src/transport.ts` 与 session/transport 测试 | 短期进程内 token、REST/WS 一致认证、精确 Origin、浏览器内存存储与重连防护 |
| S2-05 | 已创建 | `apps/server/src/modules/device-settings/`、`profile-preferences/`、`platform/events/`、settings migration 与集成测试 | 设备级配置、Profile 偏好、脱敏 health、幂等迁移 job、备份校验、原子 bootstrap 切换和回滚 |
| S3-01 | 已创建 | `apps/server/src/modules/profiles/`、`profile-preferences/`、`taste/` | Profiles CRUD、受控头像、current context、默认偏好与切换协调 |
| S3-02 | 已创建 | `apps/server/src/modules/library/`、Library migration 与公共 contracts | 音乐归一化、候选池、异步歌单导入、歌词/播放解析、有界缓存与确定性 Mock |
| S3-03～S3-04 | 已创建 | `apps/server/src/modules/programs/`、`playback/`、`taste/`、`feedback/` | Programs/Playback 与 Feedback/Taste owner、公开入口、事务和专项测试 |
| S3-05 | 已扩展 | `apps/server/src/integrations/` | Codex、NetEase、TTS Adapter、Provider Ports、确定性 Mock 与边界测试 |
| S3-06 | 已创建 | Programs application、job store、event hub 与 snapshot endpoints | 生成任务、事件排序、取消、超时、重连和恢复 |
| S3-07 | 已创建 | `tests/fixtures/program-generation.ts`、`tests/integration/mock-provider-backend-loop.integration.test.ts` 与验收记录 | Mock Provider 后端成功流、阻断/降级分支、事务回滚和数据库快照验收 |
| S4-01 | 已创建 | `apps/web/src/app/`、`apps/web/src/shared/`、`apps/web/public/` | App Shell、路由、Query、内存 session、事件重连、静态缓存和无领域 UI primitives |
| S4-02 | 已创建 | `apps/web/src/features/profiles/`、`device-settings/`、`profile-preferences/` 与 Profile/Settings 测试 | 首启创建、编辑/选择、安全切换、可写配置、偏好回滚、服务检测和迁移命令 |
| S4-03 | 已创建 | `apps/web/src/features/radio/`、`programs/`、事件总线、Radio tokens 与专项测试 | Radio 三态、场景命令、Snapshot/有序事件恢复、失败保留旧节目、原子替换与 7 张视觉基线 |
| S4-04 | 已创建 | `apps/web/src/audio/`、Radio 播放组合与 Audio 专项测试 | 唯一 `HTMLAudio`、预加载、确定性控制、checkpoint、`2s/5s` lease、epoch fencing 与三浏览器双标签接管 |
| S4-05～S4-06 | 计划 | `apps/web/src/features/` 其余 feature | Detail、反馈和 P0 体验 |
| S4-06 | 计划扩展 | `packages/design-tokens/src/` | 把 S1 最小 token 扩展为 VDA-17 完整生产 token，不建立平行规范 |
| S5-01～S5-03 | 计划 | Library、Taste、Programs 对应前后端 feature/module 测试与页面 | 补齐 P1，不新增 PRD 外功能 |
| S6-01～S6-05 | 计划 | E2E、视觉回归、安全、恢复和长时测试资产 | 具体目录服从 S0 测试 ADR，固定 fixture 不调用真实付费 Provider |
| S7-01 | 计划 | `packaging/macos/`、`scripts/release/` | 按包装 ADR 产出安装、升级、回滚和卸载流程 |
| S7-02 | 计划 | `.github/workflows/release.yml` | 签名、公证、校验和和发布证据；秘密只进入受控 CI Secret |
| S7-03 | 计划 | `docs/runbooks/`、`docs/release-notes/` | 安装、诊断、恢复、发布和热修复手册 |
| S7-04 | 计划 | `CHANGELOG.md`、`SECURITY.md`、`PRIVACY.md`、`THIRD_PARTY_NOTICES.md` | 对外发布所需说明；`LICENSE` 由授权决策决定是否创建 |
| S8-01～S8-04 | 计划 | Beta/RC 测试记录、已知问题和发布豁免记录 | 不包含用户密钥、原始日志正文或敏感路径 |
| S9-01～S9-04 | 计划 | `docs/release-notes/v1.0.0.md`、Go/No-Go 记录、稳定期复盘 | 版本事实与发布证据；构建产物进入忽略的输出目录 |

## 6. 主要风险与控制

| 风险 | 影响 | 前置控制 | 最晚关闭阶段 |
|---|---|---|---|
| 全量完成后才做外部测试 | 产品和包装反馈可能集中到后期 | 内部阶段门、Mock 用户路径、持续 E2E 和视觉回归 | S8 |
| 非官方 Provider 协议失效或公开发布授权不足 | 核心搜歌/播放可能降级，公开发布可能受阻 | S0 真实 PoC、Port 隔离、Mock、逐曲失败和替代 ADR；任何公开下载前重新验证协议、条款和内容边界 | S3 / S7 |
| 当前本地预览产物被误作公开分发 | 用户会遇到身份与 Gatekeeper 风险 | ad-hoc 产物仅留受控本机；公开下载必须重新授权并通过 Developer ID、公证和独立环境门 | S7 / S9 |
| Browser 播放与多标签竞争 | 双主、状态丢失或自动播放失败 | 单 Audio Engine、TTL lease、checkpoint 和确定性测试 | S4 / S6 |
| 数据目录迁移和升级 | 可能造成用户数据损坏 | 备份、校验、原子切换、失败回滚且不自动删除旧数据 | S6 / S7 |
| 本地秘密和日志泄露 | 安全与发布阻断 | OS Credential Store、脱敏、loopback、Origin/session 校验 | S2 / S6 |
| 工具链产物与 macOS 包装不兼容 | 生产文件树或 runtime 无法可靠进入安装包 | ADR 0001 固定验证边界，S0-05 对 `pnpm deploy` / bundling 与 Node runtime 做 PoC | S0 / S7 |

## 7. 发布成功定义

以下条件只在项目所有者后续授权公开下载时适用；当前 Personal Local Preview 不构成 v1.0 公开发布。v1.0 只有在以下条件同时满足时才可发布：

- PRD 九项能力、关键异常分支和 15 个页面状态全部验收。
- 适用的 typecheck、lint、format、unit、integration、component、E2E、build、安全和视觉检查通过。
- macOS 安装、首次启动、配置、生成、播放、反馈、手动升级、回滚和卸载已在干净环境验证。
- 安装包签名、公证和校验和有效，发布文档不包含秘密或敏感路径。
- 无 Blocker/Critical 缺陷；High 缺陷已修复或有明确发布豁免。
- 发布、诊断、恢复和热修复手册可执行，Go/No-Go 记录完整。
