# Koradio Git 工作流

> Status: Active
> Audience: 项目所有者、AI Coding Agents
> Collaboration model: 单人 + AI，顺序执行
> Canonical task registry: [tasks.md](tasks.md)

## 0. AI 快速规则

| 问题 | 默认规则 |
|---|---|
| 在哪里工作 | 只使用 `/Users/kleinblue/Project/Koradio` |
| 使用哪个分支 | 常规任务直接在 `main` 执行并推送 |
| 是否创建 worktree | 否，不为任务创建额外目录 |
| 是否创建分支或 PR | 默认否；只有用户明确要求，或高风险方案经用户确认后才使用 |
| 能否并行多个任务 | 否；同一目录一次只执行一个未完成任务 |
| 如何暂存 | 明确列出本任务路径；默认禁止 `git add -A`、`git add .` 和 `git commit -am` |
| 如何提交 | 一个任务对应一个或少量可验证提交，提交信息包含任务 ID |
| 如何推送 | 验证通过后执行 `git push origin main` |
| 发现无关改动怎么办 | 停止暂存和提交，先确认归属；不得覆盖、回退或顺带提交 |

## 1. 默认流程

```text
同步 main → 核实任务 → 修改 → 验证
→ 更新任务状态 → 显式暂存 → 提交 → 推送 main
```

### 1.1 开始任务

```bash
cd /Users/kleinblue/Project/Koradio
git switch main
git status --short --branch
git fetch origin --prune
git pull --ff-only origin main
```

开始前必须确认：

- 当前分支是 `main`，且本地没有未确认归属的改动。
- `tasks.md` 中任务 ID、依赖、边界、验收、交付物和验证方式明确。
- 依赖已完成，相关权威文档无未解决冲突。
- 没有另一个 AI 或终端正在修改同一仓库。

若工作树已有改动：全部属于当前任务时可以继续；包含其他任务、用户工作或归属不明内容时必须停止并请求决定。

### 1.2 执行任务

- 在本地把任务状态更新为 `进行中`，无需单独提交或推送状态变更。
- 只修改任务边界内文件；修改超过 3 个文件时，先拆成可独立验证的小步骤。
- 按任务表运行适用检查，不得通过弱化规则或跳过失败检查完成任务。
- 验收全部通过后，将任务和状态摘要更新为 `已完成`；未通过时如实记录 `待验收` 或 `阻塞`。

### 1.3 提交与推送

```bash
git status --short --branch
git diff --name-status
git diff --check
git add <本任务文件...>
git diff --cached --name-status
git diff --cached --check
git commit -m '<type>(<scope>): [<task-id>] <结果>'
git push origin main
```

提交前必须确认：

- 暂存区只包含本任务文件，没有密钥、临时文件或构建产物。
- 任务定义的测试、检查和人工验收已有真实结果。
- `tasks.md`、README、ADR 或其他权威文档已按实际变化同步。
- `git diff --check` 和 `git diff --cached --check` 通过。

任务完成后直接提交和推送，不再默认创建 PR。推送失败时先 fetch 并检查远端变化，禁止用 force 覆盖。

## 2. 提交规则

| 项目 | 规则 |
|---|---|
| 粒度 | 一个提交表达一个可验证结果；大任务可按独立交付物拆成少量提交 |
| 格式 | `<type>(<scope>): [<task-id>] <结果>` |
| 类型 | `feat`、`fix`、`docs`、`test`、`refactor`、`build`、`ci`、`chore` |
| 暂存 | 默认只使用 `git add <明确路径...>` |
| 全量暂存 | 只有用户明确要求全量提交，且全部改动已核验归属时才允许 |
| 历史修改 | 禁止改写已推送的 `main` 历史 |

示例：`feat(server): [S2-02] 建立 SQLite migration runner`。

## 3. 何时使用临时分支

仅在以下情况使用分支和 PR：

- 用户明确要求 PR 或需要在 GitHub 上审阅。
- 方案具有高风险、实验性或可能被放弃，且用户确认先隔离验证。
- 发布、数据迁移、安全边界或大范围重构需要合并前检查。

临时分支仍在同一个仓库目录中创建，不使用 worktree：

```bash
git switch main
git pull --ff-only origin main
git switch -c codex/<task-id>-<slug>
```

分支使用 `codex/<task-id>-<slug>`，通过 PR squash merge。合并后切回并同步 `main`；删除 branch 前必须确认 clean、无独有工作并取得用户批准。

## 4. `main` 安全设置

| 设置 | 规则 |
|---|---|
| Direct push | 允许项目所有者直接推送 |
| Require pull request | 关闭 |
| Required status checks | 默认不作为推送前门禁；CI 建立后在 `main` 上运行并及时修复失败 |
| Require linear history | 开启 |
| Force push | 禁止 |
| Branch deletion | 禁止 |
| Merge methods | 临时 PR 只使用 squash merge |

直接推送减少了合并前 GitHub Review/CI 门禁，因此本地验证是强制步骤。高风险任务应按第 3 节改用临时分支和 PR。

## 5. 异常处理

| 异常 | 动作 |
|---|---|
| 工作树混入多个任务 | 停止暂存和提交，逐项确认归属后再继续 |
| `main` 落后远端 | 仅在 clean 状态执行 `git pull --ff-only` |
| 推送被拒绝 | fetch 并检查远端提交；不得 force push |
| 验证失败 | 定位原因并修复；不得删除检查、放宽断言或隐瞒失败 |
| 发现密钥或敏感文件 | 停止提交和推送，按安全事件处理 |
| 任务中断 | 保留改动并汇报状态；未经授权不得 stash、reset、删除或迁移文件 |

## 6. 本地 Git 默认值

| 配置 | 值 | 目的 |
|---|---|---|
| `pull.ff` | `only` | 阻止意外 merge commit |
| `fetch.prune` | `true` | 清理已删除的远端引用 |
| `rebase.autoStash` | `false` | 不隐藏未提交改动 |
| `push.default` | `current` | 只推送当前分支 |
| `push.autoSetupRemote` | `true` | 临时分支首次推送自动建立 upstream |

这些配置不能替代任务边界、显式暂存、本地验证和用户授权。
