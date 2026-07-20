# S6-02 数据生命周期兼容性与恢复验收记录

> 验收日期：2026-07-20
> 任务：`S6-02` 关闭数据生命周期、迁移与恢复矩阵
> 结论：通过

## 1. 验收范围与结论

本次按 [架构迁移协议](../../architecture.md#data-root-bootstrap-and-migration)、[PRD 服务配置规则](../prd.md#功能-6服务配置与健康检查)、[用户流程校准矩阵](../user-flow.md#7-开发前校准验收矩阵) 与 [工程数据规则](../../AI_RULES.md#6-数据与文件)，使用临时数据根、固定 v6 生产 schema fixture 和确定性操作注入关闭首次启动、旧版本升级、数据目录迁移、备份、回滚和恢复矩阵。

所有失败都保持 bootstrap 指向或回到旧目录；旧目录、已创建备份和部分目标目录均保留，没有测试或生产逻辑自动删除任何目录或用户文件。公共 REST、contracts、migration SQL、UI 与包装行为未改变。

## 2. 数据生命周期矩阵

| 场景 | 注入或输入 | 必须结果 | 证据 | 结果 |
|---|---|---|---|---|
| 首次启动 | 不存在的数据根路径 | 自动创建 `0700` 数据根与 `0600` SQLite，执行 7 个生产 migration，启用 WAL/foreign keys | `data-root.test.ts`、`sqlite-platform.integration.test.ts` | 通过 |
| 重复数据库启动 | 同一已迁移数据根再次 bootstrap | migration 记录仍为 7，`user_version=7`，不重复写入或重建 | `sqlite-platform.integration.test.ts` | 通过 |
| 生产旧库升级 | 固定 v6 production migrations + 代表性用户数据 | 只执行待处理 v7 migration；Profile、偏好、Taste、Library、反馈、Program、checkpoint 与受控文件不变 | `data-lifecycle.ts` fixture/helper、`sqlite-platform.integration.test.ts` | 通过 |
| schema migration 失败 | 第二个测试 migration 中途引用不存在的表 | 整个 migration 回滚；原表和原数据保留；失败表不存在；migration 记录不推进 | `sqlite-platform.integration.test.ts` | 通过 |
| 数据根迁移成功 | 空且可写目标 | 暂停/checkpoint、备份、复制、SHA-256 校验、目标 DB 验证、bootstrap 原子切换和重启请求依次完成 | `settings-foundation.integration.test.ts`、`data-lifecycle-recovery.integration.test.ts` | 通过 |
| 重复迁移命令 | 相同 `Idempotency-Key` 重复提交 | 返回同一 `jobId`，不启动第二份复制或备份 | `settings-foundation.integration.test.ts`、`data-lifecycle-recovery.integration.test.ts` | 通过 |
| 各阶段失败 | validating、pausing、checkpointing、backing_up、copying、verifying、switching、restarting 分别注入失败 | 任务收敛为 `rolling_back/rolled_back`；bootstrap 指向旧目录；旧数据可读；已有旧/备份/目标目录均不删除 | `data-lifecycle-recovery.integration.test.ts` | 通过 |
| 真实校验和不匹配 | 备份复制完成后篡改文件正文 | SHA-256 manifest 返回 `COPY_VERIFICATION_FAILED`；不进入目标复制/切换；被篡改备份保留供检查 | `data-lifecycle-recovery.integration.test.ts` | 通过 |
| 成功重启恢复 | bootstrap 已切换到目标目录 | 从 active data root 重新 bootstrap 后，当前 Profile、设置、Program、checkpoint 与受控头像继续可读；旧目录和备份仍存在 | `data-lifecycle-recovery.integration.test.ts` | 通过 |
| 重启失败恢复 | 切换完成后模拟新服务启动失败 | bootstrap 原子回到源目录；源/目标任务记录均为 `SERVICE_RESTART_FAILED`；从源目录恢复完整旧数据 | `data-lifecycle-recovery.integration.test.ts` | 通过 |

## 3. 固定旧版本样本

`tests/fixtures/data-lifecycle.ts` 只保存稳定版本标签、UUID 与字段常量；`tests/helpers/data-lifecycle.ts` 从仓库真实 migration 目录复制到 v6 截止的版本，并写入代表性数据：

- DeviceSettings、Profile 与 ProfilePreferences。
- TasteOverrides、TasteProjection 与 append-only FeedbackEvent。
- MusicTrack 与 LibraryItem。
- Program、ordered track、DJ script、PlaybackTimeline 与 PlaybackCheckpoint。
- data root 内受控头像文件。

升级测试从该真实 v6 schema 启动当前生产 bootstrap，验证 v7 `program_generation_job` 新表存在且为空，同时逐项回读既有数据。样本不包含真实用户正文、凭据、路径或 Provider 数据。

## 4. 故障注入边界

`apps/server/src/modules/device-settings/data-root-migration.ts` 新增内部 `DataRootMigrationOperations`，只允许测试替换目标校验、复制校验、目标数据库验证和 bootstrap 写入操作；默认实现仍调用原生产路径。暂停/checkpoint 与 restart 继续使用既有 Ports。

文件复制和 manifest 校验被暴露为可独立验证的内部操作，使测试能在复制后篡改目标并运行真实 SHA-256 比较，不通过伪造成功、跳过校验或放宽断言关闭矩阵。该注入边界不进入公共 contract，也不改变产品命令与错误语义。

## 5. 验证记录

使用 Node.js `24.18.0`、pnpm `11.13.0`，所有迁移与破坏性注入只使用系统临时目录：

| 检查 | 结果 |
|---|---|
| S6-02 专项 | 4 个文件、33 个用例通过；覆盖首次启动、生产旧库升级、8 阶段回滚、SHA-256 篡改、重复命令和成功/失败恢复 |
| `pnpm check` | format、typecheck、lint、18 个 unit 文件 76 个用例、7 个 contract 文件 58 个用例、14 个 integration 文件 73 个用例、7 个 component 文件 30 个用例、46 个 coverage 文件 237 个用例与 build 全部通过 |
| Coverage | statements 81.06%、branches 72.35%、functions 83.62%、lines 81.67%；DeviceSettings 模块 lines 91.42% |
| `pnpm test:e2e` | Chromium、Firefox、WebKit 共 89 个通过、61 个显式能力跳过；无失败 |
| `pnpm test:visual` | Chromium 1 个确定性视觉门通过 |
| 人工复核 | 每个失败终态逐项回读 bootstrap、源文件、备份/目标目录和 SQLite 业务数据；未调用删除 API，未触碰真实用户数据根 |

## 6. 结论与剩余边界

- `S6-02` 验收标准全部成立，阻塞条件未发生。
- `S6-03` 成为下一 Ready 任务，继续完成安全、隐私与依赖审计。
- 尚未验证：安装包跨版本升级/卸载、真实旧发布包样本、独立干净 Mac 生命周期、签名公证与公开分发恢复；这些分别由 S7 与发布阶段处理。
- 本任务没有删除任何源目录、备份、目标目录或用户文件；测试临时目录由测试运行环境管理。
