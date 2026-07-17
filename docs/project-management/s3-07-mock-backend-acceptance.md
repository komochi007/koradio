# S3-07 Mock Provider 后端闭环验收记录

> 日期：2026-07-17
> 任务：S3-07
> 结论：通过

## 1. 验收范围

本次只验收确定性 Mock Provider 从 REST 场景受理到 Program、DJ segments 与 PlaybackTimeline 原子提交的后端闭环，不调用真实 Provider，不实现产品 UI、Browser Audio Engine 或 bundled native TTS helper。

固定输入位于 `tests/fixtures/program-generation.ts`，跨模块验收位于 `tests/integration/mock-provider-backend-loop.integration.test.ts`。测试通过各模块公开 application API 和 REST 入口组合，数据库仅用于结果快照与事务回滚断言。

## 2. 验收矩阵

| 类别 | 注入条件 | 必须结果 | 结果 |
|---|---|---|---|
| 成功流 | 前两次搜歌为空，第三次返回固定可播放曲目，TTS 成功 | `202 + jobId`；生成终态成功；至少一首曲目和开场文字；timeline 为 `dj → track` | 通过 |
| Codex 阻断 | Provider 抛错 | Job 以稳定失败终态结束；旧 Program 不变 | 通过 |
| 计划校验阻断 | 固定计划缺少 `intro` | `PROGRAM_GENERATION_PLAN_INVALID`；不提交新 Program | 通过 |
| 搜歌阻断 | 三个固定关键词均无结果 | 只尝试三次；`PROGRAM_GENERATION_NO_PLAYABLE_TRACKS`；不创建空节目 | 通过 |
| 全曲阻断 | 搜歌成功但全部音频解析失败 | 发布曲目降级事件后以无可播放曲目失败；不提交 Program | 通过 |
| 联合降级 | 一首曲目不可用、可用曲目歌词缺失、TTS 不可用 | Job 成功；保留文字 `intro`；timeline 只含可播放 `track`；三类降级事件按 sequence 发布 | 通过 |
| 事务失败 | SQLite trigger 阻止 timeline insert | Program、track refs、segments、timeline 与 Job 成功终态共同回滚；Job 收敛为 `PROGRAM_GENERATION_COMMIT_FAILED` | 通过 |
| 数据快照 | 成功或失败终态后读取临时 SQLite | 成功流表计数、timeline 顺序、Job `programId` 一致；失败流无半成品记录 | 通过 |

S3-06 已覆盖幂等重复、每 Profile 单活、取消、超时、迟到结果隔离、重启中断收敛、REST Snapshot 恢复与事件排序。本次 S3-07 在其上补齐跨模块成功/阻断/降级/事务快照验收，不重复调用外部服务。

## 3. 验证证据

在 Node.js `24.18.0`、Corepack `0.35.0`、pnpm `11.13.0` 下执行：

| 验证 | 结果 |
|---|---|
| S3-07 定向 integration | 1 个测试文件、6 个用例通过 |
| `pnpm check` | format、typecheck、lint、35 unit、58 contract、60 integration、1 component、154 coverage tests 与 build 全部通过 |
| `pnpm test:e2e` | Chromium、Firefox、WebKit 共 6 个用例通过 |
| `pnpm test:visual` | Chromium 1 个视觉回归用例通过 |
| 数据库人工复核 | 成功快照为 1 Program、1 track ref、1 intro、2 timeline items；联合降级快照为 1 Program、1 track ref、1 text-only intro、1 track item；事务失败快照均为 0 |

## 4. 保留边界

- 真实 NetEase 搜索、歌词、歌单与播放 URL smoke 已由 S3-05 在受控本机完成，本任务没有重复外部调用或消耗额度。
- Codex 与 NetEase 的真实节目生成组合、bundled native TTS helper、Browser Audio Engine 和产品 UI 仍未实现或未验收。
- 单曲运行时播放失败、反馈 UI 回滚、事件重连与浏览器媒体恢复属于后续 S4/S6 跨层验收，不由本后端闭环记录提前声明完成。
