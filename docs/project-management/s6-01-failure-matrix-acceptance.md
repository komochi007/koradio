# S6-01 跨层失败矩阵验收记录

> 验收日期：2026-07-20
> 任务：`S6-01` 关闭生成、播放与事件失败矩阵
> 结论：通过

## 1. 验收范围与结论

本次按 [PRD](../prd.md) 的异常处理、[用户流程](../user-flow.md) 的异常清单和 [工程规则](../../AI_RULES.md) 补齐固定故障注入、后端事务快照、Browser Audio 状态与事件乱序/重连回归。所有阻断失败均保留已提交节目，所有局部失败均按权威规则降级或回滚，未通过吞错、减少重试或放宽断言关闭用例。

本任务只关闭确定性失败矩阵及其发现的回归。真实 Codex + NetEase 产品运行组合、bundled native TTS helper、数据迁移恢复、安全审计、长时播放、包装与发布仍在后续任务范围内。

## 2. 跨层失败矩阵

| 场景 | 注入位置 | 必须结果 | 自动化证据 | 结果 |
|---|---|---|---|---|
| Codex 非法输出 | 固定 Codex plan 缺少 `intro`；生成 Job 返回稳定错误 | `PROGRAM_GENERATION_PLAN_INVALID`；旧 Program、数据库快照与播放状态不变；输入可重试 | `mock-provider-backend-loop.integration.test.ts`、`failure-matrix.spec.ts` | 通过 |
| 三次搜歌无结果 | 三个唯一查询均返回空结果 | 只查询三次；`PROGRAM_GENERATION_NO_PLAYABLE_TRACKS`；不创建空节目；旧 Program、数据库快照与播放状态不变 | `mock-provider-backend-loop.integration.test.ts`、`failure-matrix.spec.ts` | 通过 |
| TTS 失败 | TTS Port 返回不可用；产品读取文字 DJ fixture | 保留 DJ 文字；不创建伪音频 timeline item；歌曲继续播放 | `mock-provider-backend-loop.integration.test.ts`、`failure-matrix.spec.ts` | 通过 |
| 歌词不可用 | Lyrics Port 返回不可用；Detail 读取无歌词状态 | `lyricStatus=unavailable`；Detail 明确显示无歌词；播放继续 | `mock-provider-backend-loop.integration.test.ts`、`failure-matrix.spec.ts` | 通过 |
| 单曲媒体失败 | 第一首媒体请求失败、第二首可用 | 第一项提交 failed checkpoint；Audio Engine 自动前进到下一首 | `failure-matrix.spec.ts` | 通过 |
| 全队列媒体失败 | 所有媒体请求失败 | 每项只失败一次；停在稳定 failed 状态并提示重新生成；旧节目文字和队列保留 | `failure-matrix.spec.ts` | 通过 |
| 反馈持久化失败 | Feedback 写入返回 `500` | 乐观 UI 回滚；错误可见；当前节目与 Audio 播放不中断 | `failure-matrix.spec.ts`、既有 Feedback integration | 通过 |
| 事件乱序与重连 | 先接收较新 WebSocket event，再接收旧 REST Snapshot；重连后重复旧事件 | 旧 sequence 不回退阶段或终态；只接受更新 sequence 的 commit；新 Program 才原子切换 | `program-generation-state.test.ts`、`failure-matrix.spec.ts` | 通过 |

数据库专项复核：两类生成阻断均在已有成功 Program 上触发；失败后仍为 1 个 Program、1 个 track ref、1 个 DJ script 和 2 个 timeline items，未产生半成品，也未覆盖旧节目。

## 3. 缺陷回归记录

产品 E2E 发现：WebSocket 已接受 `sequence=3` 的生成事件后，迟到的 `sequence=1` REST Snapshot 虽不会降低内部 sequence，却会覆盖 `stage`，使 UI 从较新阶段回退。

修复位于 `apps/web/src/features/programs/generation-state.ts`：Snapshot sequence 低于当前活动任务 sequence 时整体丢弃，不再只对 sequence 取最大值。Unit 回归同时证明旧 Snapshot 不能改变 stage、status、error 或 commit；较新事件仍可正常提交新节目。

## 4. 验证记录

使用 Node.js `24.18.0`、pnpm `11.13.0`，在 `main` 的生产构建与确定性 Mock/route 故障注入上执行：

| 检查 | 结果 |
|---|---|
| S6-01 unit + integration 专项 | 2 个文件、8 个用例通过；覆盖旧 Snapshot fencing、非法计划、三次空搜索、联合降级与事务回滚 |
| S6-01 产品 E2E | Chromium、Firefox 共 10 个通过；WebKit 5 个按受控 route 限制显式跳过；无失败 |
| `pnpm check` | format、typecheck、lint、18 个 unit 文件 76 个用例、7 个 contract 文件 58 个用例、13 个 integration 文件 60 个用例、7 个 component 文件 30 个用例、45 个 coverage 文件 224 个用例与 build 全部通过 |
| Coverage | statements 80.84%、branches 72.18%、functions 83.49%、lines 81.44% |
| `pnpm test:e2e` | Chromium、Firefox、WebKit 共 89 个通过、61 个显式能力跳过；无失败 |
| `pnpm test:visual` | Chromium 1 个确定性视觉门通过 |
| 人工复核 | 失败注入均经真实产品入口或公开 application API；旧节目文字、队列、数据库计数、Audio 控件和错误提示逐项与权威异常规则一致 |

WebKit 无法稳定执行 Playwright 受控 route 故障注入，新增矩阵在该项目显式跳过；WebKit 现有 App Shell、生成、播放、反馈、Detail 和无障碍核心冒烟继续通过。跨浏览器路由与长时能力属于 `S6-04`，该已知验证边界不阻断本任务的确定性跨层矩阵。

## 5. 结论与剩余边界

- `S6-01` 验收标准全部成立，阻塞条件未发生。
- `S6-02` 成为下一 Ready 任务，继续关闭首次启动、升级、数据目录迁移、备份与回滚矩阵。
- 尚未验证：真实 Provider 联合运行、真实 Provider 媒体长期稳定性、bundled native TTS helper、旧版本升级全样本、安全/依赖审计、长时性能与 macOS 包装发布。
