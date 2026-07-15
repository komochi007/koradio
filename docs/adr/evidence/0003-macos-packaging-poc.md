# ADR 0003 macOS 包装 PoC 证据

> 日期：2026-07-15
> Task：S0-05
> 结果：架构 PoC 完成；Developer ID 签名、公证与独立干净用户验收阻塞
> PoC 隔离：源码、依赖、运行时与二进制只存在于系统临时目录，未进入仓库

## 1. 验证范围

本 PoC 使用同一个零依赖 Node Local Service 和同源静态页面，分别验证：

1. Electron 桌面壳 + bundled Node 24.18.0 sidecar。
2. 原生轻量 launcher + bundled Node 24.18.0 Local Service + 外部浏览器 PWA。

两种候选都保持 [ADR 0002](../0002-runtime-topology.md) 的 loopback、同源、`49373-49383`、JSON session bootstrap 和内存 token 边界。PoC 不实现产品功能、正式安装器、自动更新、登录启动或真实 Secret Store adapter。

## 2. 环境与官方依据

| 项目 | 核验结果 |
|---|---|
| 主机 | macOS 15.7.3 `arm64`；Command Line Tools SDK 15.5；Swift 6.1.2；Rosetta x86_64 执行可用 |
| 目标工具链 | 官方 Node 24.18.0；Corepack 0.35.0；pnpm 11.13.0 |
| Node arm64 SHA-256 | `e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1`，与官方 `SHASUMS256.txt` 一致 |
| Node x64 SHA-256 | `dfd0dbd3e721503434df7b7205e719f61b3a3a31b2bcf9729b8b91fea240f080`，与官方 `SHASUMS256.txt` 一致 |
| 最低系统证据 | 两个 Node 二进制的 `LC_BUILD_VERSION.minos` 均为 `13.5`；launcher 也以 `13.5` 为 deployment target |
| Electron | 43.1.0 + `@electron/packager` 20.0.2 + `@electron/osx-sign` 2.5.0 |
| 供应链门 | Electron 43.1.1 发布未满 24 小时，被 `minimumReleaseAge: 1440` 拒绝；改用已过观察期的 43.1.0 |

官方依据：

- [Node.js 24.18.0 下载归档](https://nodejs.org/en/download/archive/v24.18.0)同时提供 macOS arm64 与 x64 二进制。
- [pnpm deploy](https://pnpm.io/cli/deploy)生成带独立 `node_modules` 的可搬运 production 文件树；本 PoC 的零依赖服务已通过 frozen install、`--prod deploy` 和 bundled runtime 启动。
- [Apple 公证文档](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)要求 Developer ID、Hardened Runtime、安全时间戳与 `notarytool`，ad-hoc 签名不能代替正式验证。
- [Apple 公证问题排查](https://developer.apple.com/documentation/security/resolving-common-notarization-issues)要求用 `codesign --deep --strict`、`spctl` 与 ticket 验证最终产物。
- [Electron 签名文档](https://www.electronjs.org/docs/latest/tutorial/code-signing)说明 Electron macOS 直发需要签名与公证，并由 Electron 工具处理多层 helper/framework。
- [Electron breaking changes](https://www.electronjs.org/docs/latest/breaking-changes)显示 Electron 43 仍支持 macOS 12，但 bundled Node 24.18.0 将实际下限提高到 macOS 13.5。

## 3. Production 文件树发现

- 不能把 Node 官方开发归档整棵复制进 Electron bundle；其中 `npm`、`npx`、`corepack` 符号链接导致 strict bundle 签名校验失败。
- 最终用户运行时只需要经过校验的 `bin/node` 和 `LICENSE`；Corepack、pnpm、headers、文档及开发工具不进入安装包。
- Server/PWA 应先由 `pnpm --filter <server> --prod deploy <target>` 生成独立 production 树，再与精简 Node runtime 一起进入每个架构的 `.app`。
- 当前没有已选定的 SQLite/Secret Store native addon；原生依赖、license 汇总和 ABI 验证必须在相应依赖落地后重新执行，不能由本零依赖 PoC 代替。

## 4. 生命周期结果

| 验证项 | Electron 桌面壳 | 原生 launcher + PWA |
|---|---|---|
| 只读 DMG 内启动 | 通过 | arm64 与 x64 均通过；x64 在 Rosetta 下执行 |
| Bundled runtime | `v24.18.0` | arm64/x64 均为 `v24.18.0` |
| Local Service | `127.0.0.1:49373` 同源页面与 health 通过 | 同左 |
| 端口冲突 | 共用服务探针可 fallback | 未知进程占用 `49373` 时选择 `49374`，原进程保持不变 |
| Session | bootstrap 返回 token；`no-store`；无 `Set-Cookie`；token 未进入文本产物 | 同左 |
| Credential Store 边界 | bundled Node 使用参数数组对临时 macOS Keychain 完成写入/读取 | arm64/x64 均通过同一探针 |
| 停止 | 壳退出后子服务收到 `SIGTERM`、端口释放 | launcher 退出后子服务收到 `SIGTERM`、端口释放 |
| 残留 | 无 PoC 进程、端口或挂载；数据根和 Keychain 测试数据保留 | 同左；没有 LaunchAgent、Login Item 或系统级安装残留 |

生命周期结束后的统一检查结果：

```json
{"ok":true,"tokenInTextArtifacts":false,"pocProcesses":0,"pocPortsOpen":0,"pocMounts":0}
```

这里的“干净环境”是只读挂载 DMG + 全新临时用户数据根，不是新的 macOS 登录用户或 VM。任务要求的独立干净用户验收仍未完成。

## 5. 体积与架构

| 验收产物 | 架构 | App 大小 | DMG 大小 | SHA-256 |
|---|---|---:|---:|---|
| `Koradio-Shell-PoC-arm64-adhoc2.dmg` | arm64 | 401,240 KiB | 174,828,239 bytes | `5a69490949715ada6ca010b1592b3e355106b30996e6d329ebd94a8e5f96fc27` |
| `Koradio-Launcher-PoC-arm64-final.dmg` | arm64 | 118,476 KiB | 43,921,763 bytes | `328c59f053ff14e6a81948bb4c2ce62a816250761f6e8c637e435910eb2bfd65` |
| `Koradio-Launcher-PoC-x64-objc-final.dmg` | x64 | 120,680 KiB | 45,469,538 bytes | `36cac10484672e8d4b203629c38ea0a782e8dfd770fa6507dc717634516ad1d3` |

Electron arm64 DMG 约为轻量 launcher arm64 DMG 的 4 倍，并额外引入 Chromium/Electron 与 bundled Node 两套高频运行时维护面。

## 6. 签名、公证与 Gatekeeper

PoC 只使用 ad-hoc hardened-runtime 签名验证 bundle 结构：

- 两种 `.app` 均通过 `codesign --verify --deep --strict`。
- Electron 需要处理 helper/framework、JIT entitlement 和 ad-hoc Team ID 差异；正式 Developer ID 流程必须使用 Electron 官方签名工具或等价的逐层签名顺序。
- 两种 `.app` 均被 `spctl` 拒绝，退出码为 `3`；这是 ad-hoc 且未公证产物的预期结果。
- 两个 DMG 的 `stapler validate` 均返回无 ticket，退出码为 `65`。
- 测试 `.pkg` 没有签名；推荐方案使用 DMG 直发，不需要 Developer ID Installer certificate。

本机环境检查：

- `security find-identity -v`：`0 valid identities found`。
- 未提供 Apple ID/app-specific password 或 App Store Connect API key 环境凭据。
- `notarytool`、`stapler`、`codesign`、`productbuild` 与 `pkgbuild` 工具存在。

因此尚不能生成 Developer ID 签名、提交 Apple notary service、staple ticket 或得到 Gatekeeper 接受证据。根据 [S0-05 任务合同](../../project-management/tasks.md)，该缺口阻止任务关闭。

## 7. 恢复验证所需最小条件

1. 在本机或受控 CI Keychain 配置有效 `Developer ID Application` identity；不要把证书私钥或密码写入仓库。
2. 在 Keychain 配置 `notarytool` profile，或在受控 CI Secret 中配置 App Store Connect API key；不要在 PR、日志或报告中粘贴凭据。
3. 为 arm64/x64 重新生成候选 DMG，逐层签名并验证 secure timestamp、Hardened Runtime 和无 `get-task-allow`。
4. 执行 `notarytool submit --wait`、`stapler staple/validate`、`codesign --verify` 与 `spctl --assess`，保留脱敏 ticket ID 和结果。
5. 在独立 macOS 13.5+ 干净用户或 VM 中完成安装、启动、停止、手动替换升级、移除应用和残留检查。

上述门全部通过后，才能将 [ADR 0003](../0003-macos-packaging.md) 从“提议”改为“已接受”，同步架构与工程规则，并把 S0-05 更新为“已完成”。
