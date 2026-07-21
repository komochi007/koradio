# S6-05 内部全质量门记录

> 验收日期：2026-07-21
> 任务：`S6-05` 通过内部全质量门
> 基线提交：`3b0b56a6dd91bdaeec6b563e3f35e057065e04a4`
> 结论：通过

## 1. 范围与结论

本次在干净、冻结安装环境重跑合并质量门、依赖审计、三浏览器产品 E2E 与 Chromium 视觉门，并复核 S6-01～S6-04 的失败恢复、数据生命周期、安全/供应链、性能与无障碍证据。验证使用确定性 Mock Provider，不调用真实 Codex 或 NetEase Provider；不开始 macOS 包装、签名、公证或外部测试。

所有 S6-05 验收项均通过。测试未删除、断言未放宽、数据 fixture 未被手工改写以规避失败。S6 阶段门关闭，下一关键路径为 S7-01 的本地 macOS 包装工程；这不授权外部分发。

## 2. 可复现环境

| 项目 | 实际结果 |
|---|---|
| Node.js | 官方 `v24.18.0` darwin-arm64 archive；SHA-256 与同版本 `SHASUMS256.txt` 一致：`4477b9f78efb77744cf5eb57a0e9594dba66466b38b4e93fa9f35cb907a095a6` |
| Corepack | `0.35.0` |
| pnpm | `11.13.0` |
| 安装 | `pnpm install --frozen-lockfile` 通过；388 个 lockfile 条目通过 supply-chain policy，未改写 lockfile |
| Provider | `KORADIO_PROVIDER_MODE=mock`，仅使用受控 Port、临时数据与固定 fixture |

开发机默认 Node 26 不在仓库支持范围；本次使用隔离临时运行时，未修改仓库或全局 Node/pnpm 配置。

## 3. 质量门结果

| 门 | 命令或证据 | 结果 |
|---|---|---|
| 格式、类型、lint、分层测试、coverage、build | `pnpm check` | 通过：19 unit / 79 tests、7 contract / 58 tests、14 integration / 76 tests、7 component / 30 tests、47 coverage 文件 / 243 tests，以及完整 build |
| 安全与生产依赖 | `pnpm audit:dependencies` | 通过：无已知 High+ 漏洞；89 个生产依赖条目均符合 Apache-2.0、BSD-3-Clause、BlueOak-1.0.0、ISC 或 MIT allowlist |
| 三浏览器 E2E 与自动无障碍 | `pnpm test:e2e` | 通过：159 个已配置测试零失败；94 个执行通过、65 个显式能力跳过 |
| 视觉回归 | `pnpm test:visual` | 通过：Chromium 1 个确定性截图测试 |
| 无障碍与响应式 | `tests/e2e/accessibility-regression.spec.ts` 已包含在完整 E2E | Chromium、Firefox、WebKit 的五个一级页面 axe、键盘、Focus、Reduce Motion 通过；Chromium 另覆盖 44px 命中区与 200% 等价重排 |
| 既有 S6 交叉复核 | S6-01～S6-04 验收记录 | 通过：失败恢复、迁移/回滚、安全/隐私/依赖、缓存/长时播放/视觉与无障碍的专项证据均仍由本次完整流水线覆盖 |

`pnpm check`、E2E 与视觉门均从生产构建启动 Local Service。Playwright 在 E2E 结束后继续清理其 WebServer 子进程；确认端口释放后再运行视觉门，未更改测试配置或复用遗留服务。

## 4. 跳过用例审计与缺口清单

本次没有 Critical 质量缺口，也没有未运行的必需门。

65 个 E2E 跳过均为测试文件内声明的既有、非关键能力分工，未在本任务新增或扩大：

| 跳过类别 | 覆盖保证 | 结论 |
|---|---|---|
| Chromium-only 视觉、响应式几何、200% zoom 与 CacheStorage 断言 | Chromium 执行直接截图、几何和缓存断言；三浏览器仍执行产品交互与 axe | 不跳过产品功能 |
| WebKit 受控 Provider/API/media route 限制 | Chromium 与 Firefox 执行同一受控路由的 Library、Taste、Programs 与 S6 失败矩阵；WebKit 保留 App Shell、Profile/Settings、Radio、播放、Detail、反馈和无障碍路径 | 不跳过关键恢复或无障碍门 |

以下是已知范围边界而非 S6-05 缺口，继续由后续任务关闭：真实 Codex + NetEase 产品组合与长时媒体播放、bundled native TTS helper 及缓存、macOS 包装/签名/公证，以及 S7 干净 macOS 上的 VoiceOver 人工走查。它们不被本记录声明为已完成，也不阻断当前 Personal Local Preview 的内部质量门。

## 5. CI 可追溯性

[CI workflow](../../.github/workflows/ci.yml) 固定完整 SHA 的 `actions/checkout` 与 `actions/setup-node`，使用 `.nvmrc`、Corepack `0.35.0`、pnpm `11.13.0` 和 `pnpm install --frozen-lockfile`。其 `quality` job 运行 `pnpm check`；`browser` job 在其后运行 `pnpm test:e2e` 与 `pnpm test:visual`。本次本地命令与 CI 门一一对应，并额外重跑 `pnpm audit:dependencies`。

本记录基线提交、命令、精确运行版本、测试入口和 workflow 路径共同构成可追溯证据；推送到 `main` 后该 workflow 会对本次状态/记录提交再次执行相同的 CI 门。

## 6. 阶段结论

- `S6-05` 验收标准全部满足，S6 集成、质量与安全加固阶段门通过。
- 当前仅形成进入 S7 的内部质量基线；External Beta 仍需 S7-05 与项目所有者后续授权。
- 本次没有处理、删除或迁移任何真实用户数据目录、备份或 Provider 凭据。
