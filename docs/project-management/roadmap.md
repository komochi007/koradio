# Koradio macOS v1.0 路线图

> Status: Planning baseline
> Release scope: PRD P0 + P1 全量能力
> External testing rule: S5、S6、S7 全部通过后才开始首轮外部 Beta
> Schedule model: 依赖与阶段门，不承诺日历日期

## 0. AI 路线定位

| 判断项 | 当前结论 | AI 行动 |
|---|---|---|
| 当前阶段 | S0 基线与关键决策 | 不创建 monorepo 或产品代码 |
| 已通过阶段门 | 尚无完整阶段门；`S0-01`、`S0-02`、`S0-03`、`S0-04`、`S0-07` 已完成，`S0-05` 阻塞 | 继续关闭 S0 剩余决策，不提前启动 S1 |
| 当前关键路径 | `S0-05` 等待签名、公证与独立干净环境；`S0-06` 已 Ready | 先推进不依赖包装裁决的 S0-06；取得环境后恢复 S0-05 |
| 产品实现状态 | 未开始 | 不把架构目标目录、API 或端口描述为仓库事实 |
| 外部测试状态 | 禁止开始 | 仅当 `S5-04`、`S6-05`、`S7-05` 全部完成后解除 |
| 发布目标 | macOS v1.0，P0 + P1，签名公证直发 | Windows、App Store、自动更新和云能力保持范围外 |

阶段定位只在阶段门通过后更新。单个任务完成只更新 [tasks.md](tasks.md)；若它关闭或改变阶段门，再同步本表。

## 1. 当前进度评估

Koradio 已完成开发前产品和视觉定义，但尚未进入产品工程实现。静态设计预览可运行不代表产品可安装、启动、测试或构建。

| 进度维度 | 当前状态 | 证据 | 下一门槛 |
|---|---|---|---|
| 产品定义 | 已完成开发前校准 | `docs/prd.md`、`docs/user-flow.md` | 实现中发现冲突时先回写权威文档 |
| 系统架构 | 已完成目标架构，工具链与运行拓扑基线已冻结；包装 PoC 已形成提议但未接受 | `architecture.md`、`AI_RULES.md`、`docs/adr/0001-toolchain-and-quality.md`、`docs/adr/0002-runtime-topology.md`、`docs/adr/0003-macos-packaging.md` | 取得 Developer ID、公证和独立干净用户证据后关闭包装形态决策 |
| 视觉设计 | VDA-17 已冻结 | HTML 主源、60 张基线、Figma 镜像、handoff map | 产品实现通过视觉和无障碍回归 |
| 工程基础 | 未开始 | 无 manifest、锁文件、源码入口或 CI | S1 脚手架阶段门 |
| 产品功能 | 未开始 | 无 Frontend、Local Service、数据库或 Adapter | S3～S5 功能阶段门 |
| 质量验证 | 未开始 | 无产品测试配置和测试入口 | S6 全质量门 |
| 发布准备 | 未开始 | 无 macOS 包装、签名、公证和发布流程 | S7 发布工程阶段门 |

开发基线已由 ADR 0000 确认并进入 `main`；后续任务必须继续使用独立 worktree，不得覆盖或回退 VDA-17 与已提交的文档资产。

## 2. v1.0 发布边界

v1.0 包含 PRD 定义的六项 P0 和三项 P1 能力，并以 macOS 签名、公证安装包直接发布。Windows、Mac App Store、云同步、远程访问、支付、公开社区、自动更新和多音乐源不进入 v1.0。

包装形态仍是受控决策项：S0-05 PoC 推荐 macOS 13.5+ 的分架构 DMG、原生轻量 launcher + bundled Local Service + 外部浏览器 PWA，但 ADR 0003 仍为“提议”。只有 Developer ID 签名、公证、Gatekeeper 和独立干净用户生命周期全部通过后，才能接受裁决、同步架构并进入后续实现。

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
| S7 macOS 打包与发布工程 | 生成可直接分发的可信安装包 | 包装、安装生命周期、签名公证、发布流水线、用户文档 | 干净 Mac 安装验收通过，RC 候选包签名公证有效 |
| S8 外部测试与 RC | 用完整产品进行外部验证并冻结候选版本 | Beta、缺陷分流、兼容验证、完整回归、RC 冻结 | 无 Blocker/Critical；High 已修复或有发布豁免 |
| S9 v1.0 发布与稳定期 | 公开发布并建立可恢复的运营闭环 | Go/No-Go、发布、下载冒烟、热修复、复盘 | v1.0 可下载安装，稳定期退出条件满足 |

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
| S0-05 | 已创建 · 阻塞 | `docs/adr/0003-macos-packaging.md`、`docs/adr/evidence/0003-macos-packaging-poc.md` | 包装形态提议与 PoC 证据；等待正式签名、公证和独立干净用户验收，不代表决策已接受 |
| S0-06 | 计划 | `docs/adr/0004-provider-feasibility.md` 及脱敏验证报告 | Provider 可行性决策 |
| S1-01 | 计划 | 根 `package.json`、选定 workspace manifest、锁文件、Node 版本文件 | 固定安装和 workspace 入口；具体文件名由 ADR 决定 |
| S1-02 | 计划 | 根 TypeScript、lint、format、test 配置 | strict 类型和统一质量门，不在 ADR 前猜测工具 |
| S1-03 | 计划 | `apps/web/`、`apps/server/`、`packages/contracts/`、`packages/design-tokens/` | 架构规定的 monorepo 主边界 |
| S1-04 | 计划 | `.github/workflows/ci.yml`、非敏感环境模板 | CI 和 Mock/本地运行配置；不得包含密钥 |
| S2-01 | 计划 | `packages/contracts/src/` | `/api/v1` DTO、command、event、error Zod schemas |
| S2-02 | 计划 | `apps/server/src/bootstrap/`、`apps/server/src/platform/` | 服务组合、数据库、文件、秘密、日志和事件平台 |
| S2-03 | 计划 | `apps/server/src/platform/db/migrations/` | 版本化 SQLite migrations；禁止运行时自动重建 |
| S2-04 | 计划 | `apps/server/src/modules/device-settings/`、`profile-preferences/` | 设备级配置、Profile 偏好和数据迁移能力 |
| S3-01～S3-05 | 计划 | `apps/server/src/modules/profiles/`、`programs/`、`playback/`、`library/`、`taste/`、`feedback/` | 业务模块；每个模块只有一个公开入口 |
| S3-06 | 计划 | `apps/server/src/integrations/` | Codex、NetEase、TTS Adapter 和测试替身 |
| S3-07 | 计划 | 各模块测试目录与 Provider fixtures | 单元、contract、集成和事务测试；位置服从测试 ADR |
| S4-01 | 计划 | `apps/web/src/app/`、`apps/web/src/shared/` | App Shell、路由、session、transport 和无领域 UI primitives |
| S4-02～S4-06 | 计划 | `apps/web/src/features/` 下八个 feature、`apps/web/src/audio/` | 页面用例、唯一 Audio Engine 和 P0 体验 |
| S4-06 | 计划 | `packages/design-tokens/src/` | 从 VDA-17 视觉主源转录生产 token，不建立平行规范 |
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
| Provider 可用性或授权不确定 | 核心生成、搜歌或公开发布可能受阻 | S0 可行性验证、Port 隔离、Mock 和稳定降级 | S0 / S7 |
| macOS 包装提议尚未正式验收 | 影响凭据库实现与发布路径定案 | 两方案 PoC 已完成；补齐 Developer ID、公证、Gatekeeper 和独立干净用户验证 | S0 |
| Browser 播放与多标签竞争 | 双主、状态丢失或自动播放失败 | 单 Audio Engine、TTL lease、checkpoint 和确定性测试 | S4 / S6 |
| 数据目录迁移和升级 | 可能造成用户数据损坏 | 备份、校验、原子切换、失败回滚且不自动删除旧数据 | S6 / S7 |
| 本地秘密和日志泄露 | 安全与发布阻断 | OS Credential Store、脱敏、loopback、Origin/session 校验 | S2 / S6 |
| 工具链产物与 macOS 包装不兼容 | 生产文件树或 runtime 无法可靠进入安装包 | ADR 0001 固定验证边界，S0-05 对 `pnpm deploy` / bundling 与 Node runtime 做 PoC | S0 / S7 |

## 7. 发布成功定义

v1.0 只有在以下条件同时满足时才可发布：

- PRD 九项能力、关键异常分支和 15 个页面状态全部验收。
- 适用的 typecheck、lint、format、unit、integration、component、E2E、build、安全和视觉检查通过。
- macOS 安装、首次启动、配置、生成、播放、反馈、手动升级、回滚和卸载已在干净环境验证。
- 安装包签名、公证和校验和有效，发布文档不包含秘密或敏感路径。
- 无 Blocker/Critical 缺陷；High 缺陷已修复或有明确发布豁免。
- 发布、诊断、恢复和热修复手册可执行，Go/No-Go 记录完整。
