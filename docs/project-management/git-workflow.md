# Koradio Git、Worktree 与分支管理规范

> Status: Active
> Audience: 项目所有者、AI Coding Agents
> Collaboration model: 单人 + AI
> Canonical task registry: [tasks.md](tasks.md)

## 0. AI 快速决策表

| 问题 | 唯一规则 |
|---|---|
| 在哪里查看稳定版本 | 根工作树的 `main`；根路径为 `/Users/kleinblue/Project/Koradio` |
| 在哪里开发 | 每个任务使用独立 worktree，统一放在 `/Users/kleinblue/Project/Koradio-worktrees/` |
| 如何划分分支 | 一个任务 ID 对应一个 branch、一个 worktree、一个 PR |
| 是否直接修改或推送 `main` | 否；`main` 只接收通过 PR 的 squash merge |
| 如何暂存 | 明确列出本任务路径；默认禁止 `git add -A`、`git commit -am` |
| 谁做 Review | AI 先自检，项目所有者按风险抽查；单人仓库不要求审批人数 |
| 任务状态放在哪里 | 稳定状态写入 `main` 上的 `tasks.md`；执行中的变更写在任务分支副本，PR 只保存证据和入口 |
| 何时删除分支或 worktree | 合并且确认无独有提交后，由用户明确批准；默认不自动删除 |
| 发现混杂改动怎么办 | 立即停止暂存、提交和清理，先按任务归属拆分或请求用户决定 |

## 1. 目标与不变量

本规范用物理隔离代替复杂分支层级，使一个人同时调用多个 AI 时仍能追溯每项修改。项目不设长期 `develop` 分支，也不把 GitHub Issues、Projects 或 PR 变成第二套任务状态。

| 不变量 | 验证条件 |
|---|---|
| 根工作树只承载 `main` | 根路径执行 `git branch --show-current` 返回 `main`，且日常保持 clean |
| 任务隔离 | 每个活动任务有独立任务 ID、分支和 worktree；不同任务不共用工作树 |
| 单一合入入口 | `main` 禁止直接 push、force push 和删除，只通过 PR 合并 |
| 线性历史 | PR 使用 squash merge；`main` 上一个任务对应一个结果提交 |
| 显式范围 | 提交前核对允许修改路径，暂存区不得包含其他任务或用户改动 |
| 可重复验证 | PR 记录验收标准、实际验证命令和结果，不能只写“已测试” |
| 审慎清理 | 分支删除前验证已合并、无独有提交、无未提交改动并取得用户批准 |

## 2. 工作树布局

| 类型 | 固定位置 / 形式 | 用途 | 允许修改 |
|---|---|---|---|
| 根工作树 | `/Users/kleinblue/Project/Koradio` + `main` | 查看稳定版本、同步远端、创建或移除 task worktree | 默认不做任务开发 |
| AI 任务工作树 | `/Users/kleinblue/Project/Koradio-worktrees/<task-id>-<slug>` | AI 完成一个已登记任务 | 仅任务边界内路径 |
| 用户任务工作树 | 同一父目录下的独立目录 | 用户手工开发 | 由用户指定 |
| 临时验证目录 | 系统临时目录或任务明确计划路径 | 构建、PoC、下载产物 | 不得混入仓库状态 |

默认只保留一个活动实现 worktree。确需并行时，每个 worktree 必须修改互不重叠的文件；若会修改同一权威文档或公共 contract，则改为串行。

## 3. 分支命名

| 场景 | 格式 | 示例 |
|---|---|---|
| AI 任务 | `codex/<task-id>-<slug>` | `codex/s0-07-git-workflow` |
| 用户任务 | `user/<task-id>-<slug>` | `user/s3-02-library-provider` |
| 紧急修复 | `hotfix/<issue-or-version>-<slug>` | `hotfix/v1.0.1-startup` |

规则：全部使用小写 ASCII 和连字符；`task-id` 必须能解析到 `tasks.md`；禁止使用长期个人分支、`develop`、`misc`、`wip` 或无任务 ID 的功能分支。

## 4. 开始任务

### 4.1 Ready 检查

| 检查项 | 通过条件 |
|---|---|
| 任务登记 | `tasks.md` 已有唯一 ID、依赖、边界、验收、交付物和验证方式 |
| 依赖 | 依赖任务均为 `已完成`，或文档明确允许安全并行 |
| 根基线 | 根工作树位于 `main`、clean，且已 `fetch --prune` 和 fast-forward 到 `origin/main` |
| 工作冲突 | `git worktree list` 中没有相同任务，也没有会修改同一文件的活动任务 |
| 权威规则 | 已读取 `AGENTS.md`、`AI_RULES.md` 和任务输入引用的文档 |

### 4.2 标准命令

```bash
cd /Users/kleinblue/Project/Koradio
git status --short --branch
git fetch origin --prune
git switch main
git pull --ff-only origin main
git worktree add -b codex/<task-id>-<slug> \
  /Users/kleinblue/Project/Koradio-worktrees/<task-id>-<slug> origin/main
```

创建后，AI 必须在开始修改前报告以下上下文：任务 ID、worktree 绝对路径、branch、base commit、允许修改路径、明确保持不变的路径、验证计划。

## 5. 修改与提交

### 5.1 提交前门禁

| 顺序 | 检查 | 目的 |
|---:|---|---|
| 1 | `git status --short --branch` | 确认分支和全部改动归属 |
| 2 | `git diff --name-status` | 确认未越过任务允许路径 |
| 3 | 任务定义的测试或文档检查 | 用证据验证交付物 |
| 4 | `git diff --check` | 拒绝空白错误和冲突残留 |
| 5 | `git add <明确路径...>` | 只暂存本任务文件 |
| 6 | `git diff --cached --name-status` 与 `git diff --cached --check` | 再次确认提交范围和质量 |

默认禁止：`git add -A`、`git add .`、`git commit -am`、跳过 hooks、把密钥或构建产物纳入提交。只有用户明确要求“全量提交”，且当前 worktree 的全部改动已逐项核验归属时，才允许全量暂存。

### 5.2 提交粒度与格式

- 一个提交只表达一个可验证结果；文档与实现需要原子一致时可以同一提交。
- 大任务可以有多个中间提交，但 squash merge 后 `main` 只保留一个任务结果。
- 推荐格式：`<type>(<scope>): [<task-id>] <结果>`。
- `type` 使用 `feat`、`fix`、`docs`、`test`、`refactor`、`build`、`ci`、`chore`。

示例：`docs(git): [S0-07] 建立单人 AI 工作流`。

## 6. 推送与 Pull Request

### 6.1 首次推送

```bash
git push -u origin HEAD
```

禁止向 `main` 直接 push。普通同步禁止 `--force`；任务分支确需重写历史时，仅在该分支由当前操作者独占、PR 尚未合并且已再次核对远端后，才可使用 `--force-with-lease`。

### 6.2 PR 必填信息

| 字段 | 内容 |
|---|---|
| Task | 任务 ID 与任务表链接 |
| Purpose | 一至两句说明结果和价值 |
| Scope | 实际修改路径；明确未改内容 |
| Acceptance | 对应任务验收标准 |
| Validation | 实际执行的命令、检查和结果 |
| Risks | 数据、公共行为、安全、发布或回滚风险；没有则写“无已知风险” |
| Evidence | 截图、日志摘要、ADR 或其他可复核证据；不粘贴敏感信息 |

PR 默认先建为 Draft。交付物和自检完成后更新 `tasks.md` 为 `待验收`；所有门禁通过、任务可被接受时转为 Ready。PR 是审阅和证据载体，不在标题、标签或 Project 中维护一套独立任务状态。

## 7. 审阅、同步与合并

### 7.1 单人 + AI 审阅模型

| 责任 | 必做事项 |
|---|---|
| AI 自检 | 对照 diff、任务边界、权威文档和验收标准；运行适用检查并披露未验证范围 |
| 项目所有者 | 对高影响产品、架构、数据、安全和发布决策做最终确认；低风险任务可依据证据直接合并 |
| GitHub 门禁 | 需要 PR、解决全部 conversation、保持线性历史；单人仓库所需审批数为 `0` |

### 7.2 合并前同步

```bash
git fetch origin --prune
git rebase origin/main
```

只有 worktree clean 才能 rebase。发生冲突时先停止并按权威文档判断归属；不得用接受整侧内容的方式批量覆盖。rebase 后重新运行受影响检查，再按第 6.1 节安全推送。

### 7.3 合并规则

- 只允许 squash merge；禁止 merge commit 和 rebase merge。
- squash 标题使用任务结果式提交标题，并保留任务 ID。
- 合并前将 `tasks.md` 更新为真实最终状态；不得提前把未通过验收的任务标为 `已完成`。
- 合并后在根工作树执行 `git pull --ff-only origin main` 并确认 clean。

## 8. `main` 保护与仓库设置

| 设置 | 当前规范值 | 后续调整条件 |
|---|---|---|
| Require pull request | 开启 | 不关闭 |
| Required approvals | `0` | 增加长期协作者后再改为 `1` |
| Require conversation resolution | 开启 | 不关闭 |
| Require status checks | CI 建立前为空 | `S1-04` 完成后加入稳定且必需的 CI checks |
| Require linear history | 开启 | 不关闭 |
| Force push / branch deletion | 禁止 | 不关闭 |
| Merge methods | 仅 squash merge | 不启用 merge commit 或 rebase merge |
| Auto-delete head branches | 关闭 | 保持人工确认清理 |

## 9. 任务状态与 Git 状态映射

| 任务状态 | Git / PR 状态 | 允许动作 |
|---|---|---|
| `待开始` | 无 branch，或只有未使用的计划分支 | 通过 Ready 检查后创建 worktree |
| `进行中` | task branch + worktree，PR 可为 Draft | 修改、验证、提交和推送 |
| `待验收` | Draft 或 Ready PR，交付物与自检齐全 | 审阅、修复、补验证 |
| `已完成` | PR 已通过门禁并进入合并流程；稳定事实最终落在 `main` | 更新根工作树，等待批准后清理 |
| `阻塞` | 保留 branch/worktree，PR 标明阻塞事实 | 不扩大范围；记录最小解除条件 |

任务分支中的 `tasks.md` 表示该变更准备写入的状态；合并后的 `main` 才是全仓稳定状态。GitHub PR 只保存变更、检查和反向链接，不能脱离 Markdown 独立改变任务状态。

## 10. 清理分支与 Worktree

### 10.1 可清理判定

只有同时满足以下条件才属于“可清理”：

- 对应 PR 已合并或明确关闭且工作不再保留。
- `git status --short` 为空。
- 分支相对 `main` 没有独有提交，或独有提交已由 squash PR 完整取代并人工核对。
- 目录中没有未跟踪的交付物、凭据、构建证据或用户文件。
- 用户已明确批准删除该 branch/worktree。

### 10.2 清理顺序

```bash
cd /Users/kleinblue/Project/Koradio
git fetch origin --prune
git worktree remove /Users/kleinblue/Project/Koradio-worktrees/<task-id>-<slug>
git branch -d <branch>
git push origin --delete <branch>
git worktree prune --dry-run
```

`git branch -d` 因 squash merge 拒绝时，不得立即改用 `-D`。先用 `git log main..<branch>` 和 PR diff 证明独有提交已完整进入 `main`，再次取得用户批准后才可强制删除。禁止自动删除根工作树、`main`、含未提交改动的 worktree 或未明确归属的分支。

## 11. 异常处理

| 异常 | 立即动作 | 恢复条件 |
|---|---|---|
| 根工作树出现任务改动 | 停止提交，将归属报告给用户 | 改动安全迁入对应 task worktree 或用户确认处理方式 |
| 一个工作树混入多个任务 | 停止暂存和清理，按文件与 hunk 盘点 | 每项改动归属明确并拆到独立任务 |
| 分支落后 `origin/main` | fetch 后在 clean worktree rebase | 冲突已按权威文档解决并重跑验证 |
| 推送被拒绝 | 检查远端新提交和 upstream | 明确远端来源；不得用无租约 force 覆盖 |
| PR 合并后本地分支仍有独有提交 | 暂停删除并比较 commit / patch | 证明提交已进入 `main` 或另建恢复任务 |
| 检出密钥或敏感文件 | 停止推送并按安全事件处理 | 秘密轮换、历史影响确认、脱敏验证完成 |

## 12. 本仓库本地 Git 默认值

| 配置 | 值 | 目的 |
|---|---|---|
| `pull.ff` | `only` | 阻止意外 merge commit |
| `fetch.prune` | `true` | 获取时清理已删除远端引用 |
| `rebase.autoStash` | `false` | 不隐藏未提交改动 |
| `push.default` | `current` | 只推送当前任务分支 |
| `push.autoSetupRemote` | `true` | 首次推送自动建立同名 upstream |

这些设置只降低误操作概率，不能替代工作树隔离、显式暂存、PR 门禁和人工清理确认。
