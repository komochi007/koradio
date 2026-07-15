# ADR 0000：确认开发基线

> 状态：已接受
> 日期：2026-07-15
> 决策人：项目所有者
> Task：S0-02
> 取代：无
> 被取代：无

## 1. 背景

Koradio 在进入工具链与脚手架决策前，需要把 VDA-17 冻结点、冻结后的语义与治理变更、当前 Git 状态和后续 ADR 起点固定为可追溯事实。任务登记时曾提示“当前工作树包含用户尚未提交的文档和视觉语义校准改动”；S0-02 启动核查表明这些改动已经进入提交并合入 `main`，根工作树不再存在待归属的未提交改动。

本记录只确认开发起点和改动归属，不裁决工具链、端口、运行拓扑、Provider 或包装形态，也不改变产品行为、系统架构或视觉基线。

## 2. 核查结果

### 2.1 不可变基线标识

| 边界 | Git 标识 | 结论 |
|---|---|---|
| VDA-17 像素基线 | `6e97fb74826cdd48e5f75fe57646ac55340aab3c` | `context.md` 与 handoff map 指定的 HTML/截图像素基线；后续语义校准不得改变其几何或像素外观 |
| VDA-17 冻结记录收口 | `1e6c51808586fd373f22cc4071078990ea7286c8` | 更新冻结说明、审计、决策与交接记录；未修改正式截图、fixture、icon 或视觉 CSS/HTML 主源 |
| 产品与项目管理基线 | `7f8c1d1a5ea8b075e0f1995923d8f39ed6da8ad1` | 已提交产品/流程/架构语义校准、ARIA 文案、文档导航和 S0-01 项目管理事实源 |
| Git 治理基线 | `51399f197b4194bc9aa4bb7f15e51da198050372` | 已通过 S0-07 固化 worktree、任务分支、PR、squash merge 和清理规则；是 S0-02 worktree 从 `origin/main` 创建时的父提交 |

`6e97fb7` 是 `51399f1` 的祖先。冻结点之后、S0-02 开始之前只有上表列出的三个提交，提交链可由 `git log 6e97fb7..51399f1` 重建。

### 2.2 现有改动归属

| 分组 | 路径 | 归属与处理 |
|---|---|---|
| VDA-17 冻结证据 | `README.md`、`context.md`、`design/assets/reports/`、`design/tasks/visual-assets.md` | 已归属 VDA-17 收口并提交到 `1e6c518`；作为视觉追溯证据保留 |
| 产品、流程与架构语义校准 | `docs/prd.md`、`docs/user-flow.md`、`architecture.md`、`AI_RULES.md`、`context.md` | 已归属开发前语义校准并提交到 `7f8c1d1`；后续实现按各 Concern 的权威文档读取 |
| 视觉语义与文档导航 | `design/assets/prototype/app.js`、`design/assets/prototype/README.md`、`design/design.md`、`design/prompt.md`、`design/references/README.md`、`design/design-qa.md` 及交接/任务记录 | 已归属冻结后业务语义、ARIA 文案与导航校准并提交到 `7f8c1d1`；不构成新的像素版本 |
| 项目管理事实源 | `docs/project-management/README.md`、`roadmap.md`、`tasks.md`、`release-checklist.md` 及根 `README.md` 导航 | 已归属 S0-01 并提交到 `7f8c1d1` |
| Git 与 Worktree 治理 | `AGENTS.md`、`docs/project-management/git-workflow.md` 及项目管理同步项 | 已归属 S0-07 并通过 squash 结果 `51399f1` 合入 `main` |
| S0-07 保留 worktree | `/Users/kleinblue/Project/Koradio-worktrees/s0-07-git-workflow`、`codex/s0-07-git-workflow` | 工作树 clean；分支仍保留 squash 前的独有提交，归属 S0-07。按 Git 规范未经用户批准不清理、不提交到 S0-02 |
| S0-02 任务改动 | `docs/adr/`、`docs/project-management/tasks.md` | 归属 S0-02；只建立 ADR 机制、记录基线并同步任务状态 |

S0-02 启动时根工作树 `main` 与 S0-07 保留 worktree 均为 clean，因此没有需要猜测归属、迁移或覆盖的未提交用户资产。若后续发现与上表不一致的独有工作，应按 Git 工作流停止暂存和清理，重新确认归属。

### 2.3 像素基线保护核查

从 `6e97fb7` 到 `51399f1`，以下冻结资产没有路径级差异：

- `design/assets/baselines/`
- `design/assets/fixtures/`
- `design/assets/icons/`
- `design/assets/prototype/` 中的 HTML 与视觉 CSS 主源

冻结后对 `design/assets/prototype/app.js` 的两行调整只校准 Heart/More 的 ARIA 标签。该变化已由 handoff map 明确为语义校准，不创建新像素基线。

## 3. 裁决

1. 后续开发任务必须从合入 S0-02 后的最新 `origin/main` 创建独立 worktree；追溯其基础时，以 `51399f1` 加本任务 PR 的变更链为开发前基线。
2. VDA-17 像素比较继续锚定 `6e97fb74826cdd48e5f75fe57646ac55340aab3c`，不得把后续文档或 ARIA 校准误记为新的像素冻结版本。
3. 已提交到 `1e6c518`、`7f8c1d1` 和 `51399f1` 的改动均作为已确认基线保留，不在 S0-02 中重写、回退或重新提交。
4. 后续高影响工程决策使用 [ADR 机制](README.md)；编号从 `0001` 开始，S0-03 至 S0-06 分别使用任务表预留的 `0001` 至 `0004`。
5. 未经用户明确批准，不清理 S0-07 或其他保留 branch/worktree。

## 4. 后果

### 正向后果

- 产品工程的父基线、视觉像素基线和任务治理基线各自拥有不可变 Git 标识。
- 冻结后 22 个变化路径被归入已有提交和任务，不再存在“工作树改动是否属于开发基线”的歧义。
- S0-03 至 S0-06 可以使用统一状态、编号、模板和替代规则记录决策。

### 负向后果与权衡

- 开发基线由多个有不同 Concern 的提交共同构成，追溯时必须同时区分像素冻结点与当前 `main`，不能用单一标签替代全部语义。
- S0-07 的旧 worktree/branch 仍占用本地空间，但保留它符合未经批准不得自动清理的安全约束。

### 保持不变

- 项目仍处于 Documentation-first，产品源码、依赖、运行端口和测试命令仍不存在。
- 产品行为、系统边界、数据与安全规则、视觉像素资产均未因本 ADR 改变。
- 工具链、运行拓扑、macOS 包装和 Provider 可行性仍由 S0-03 至 S0-06 裁决。

## 5. 验证证据

| 检查 | 结果 |
|---|---|
| `git fetch origin --prune` 与 `git pull --ff-only origin main` | 根工作树同步到 `51399f1`，与 `origin/main` 一致 |
| `git status --short --branch` | 根工作树 clean；S0-02 创建前无未提交改动 |
| `git merge-base --is-ancestor 6e97fb7 51399f1` | 通过，退出码 `0` |
| `git log --reverse 6e97fb7..51399f1` | 仅 `1e6c518`、`7f8c1d1`、`51399f1` 三个提交 |
| `git diff --stat 6e97fb7..51399f1` | 22 个路径，1384 insertions、344 deletions；均已按 2.2 节归属 |
| 冻结资产路径 diff | 正式 baseline、fixture、icon、视觉 HTML/CSS 路径无差异 |
| S0-07 worktree 状态 | clean；独有提交保留且未纳入 S0-02 |
| 用户确认要求 | 用户明确授权执行 S0-02；启动时没有未提交资产需要额外选择归属，因此无需扩大范围或补充高影响决策 |

## 6. 权威文档同步

本 ADR 只记录已经存在的仓库事实，没有改变产品、流程、架构、视觉或工程规则，因此不修改 `docs/prd.md`、`docs/user-flow.md`、`architecture.md`、`design/design.md`、`AI_RULES.md`、`README.md` 或 `context.md`。动态任务状态仅在 `docs/project-management/tasks.md` 同步。

## 7. 后续任务

- S0-03：`0001-toolchain-and-quality.md`
- S0-04：`0002-runtime-topology.md`
- S0-05：`0003-macos-packaging.md`
- S0-06：`0004-provider-feasibility.md`
