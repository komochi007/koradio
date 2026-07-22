# S7-02 macOS 安装生命周期验收记录

> Task：S7-02
> 日期：2026-07-22
> 结果：通过受控本机 arm64 Personal Local Preview 验收；不授权外部分发。

## 交付物

- `scripts/release/build-macos.mjs`：支持受限的数值语义 `--version`，将版本写入 app 的 `CFBundleShortVersionString`、`CFBundleVersion` 和 DMG 文件名，默认仍为 `0.0.0`。
- `scripts/release/verify-macos-lifecycle.mjs`：在全新临时目录验证 app 的安装、替换、降级保护、启动失败回滚、卸载和数据保留；每个被替换、失败或卸载的 app 仅移动到临时保留目录，不删除。
- `docs/runbooks/install-and-recovery.md`：记录个人本机手动安装、升级、恢复和卸载边界，以及可重复的验证矩阵。

## 受控本机矩阵

在 macOS 15.7.3 arm64 上，使用固定 Corepack pnpm `11.13.0`、bundled Node `24.18.0`，从同一可信源码与锁文件分别构建 `0.0.1`、`0.0.2`：

| 场景 | 结果 |
|---|---|
| 全新安装 | `0.0.1` app 复制到临时 `Applications` 后启动/停止成功，创建新临时数据根。 |
| 重复安装 | 再次替换同版本 app；数据根字节内容不变。 |
| 升级 | `0.0.2` 替换 `0.0.1` 后启动/停止成功；既有数据根文件与用户数据哨兵均保留。 |
| 降级 | `0.0.1` 在替换前被拒绝，已安装 `0.0.2` 与数据保留。 |
| 启动失败回滚 | 构造缺失服务入口的 `0.0.2` 候选；启动失败后恢复上一可启动 app，恢复后的 app 可再次启动。 |
| 卸载 | 仅移除临时 `Applications/Koradio.app`，数据根和保留 app 副本仍存在。 |
| 进程 | 每次 launcher 冒烟结束后，`49373-49383` 无 Koradio 监听端口。 |

两份 app 均通过 `codesign --verify --deep --strict`、包内 Node 版本、TTS helper 合成与 launcher 冒烟验证。生命周期脚本输出的受控临时根为 `/var/folders/92/g760w0y11051f1y720x57nd80000gn/T/koradio-lifecycle-7WiEo1`，保留供本机检查。

使用 bundled Node `24.18.0` 与 pnpm `11.13.0` 执行 `pnpm check` 通过：format、typecheck、lint、79 个 unit、58 个 contract、76 个 integration、30 个 component、243 个 coverage 用例及完整生产 build 全部成功。

## 数据与凭据边界

- app 替换、失败回滚和卸载不调用删除操作，不接触真实 `~/Library/Application Support/Koradio`、其备份或 Keychain item。
- 当前产品默认 Mock Provider；该验证不创建真实凭据。验证器确认 app-only 操作不会访问或修改 Keychain，真实 Provider 凭据保留给后续受控产品验收。
- S6-02 已单独验证 v6→v7 production fixture、migration 事务失败和数据根恢复；本任务只验证包装层不会在跨 app 生命周期中丢弃已有数据。

## 未覆盖范围

- x64 生命周期、Developer ID 签名、公证、Gatekeeper、独立干净 Mac 与任何外部分发均未验证，继续由 S7-03～S7-05 阻断。
- 不支持直接降级；需要恢复时保留并恢复旧 app，数据 migration 故障遵循既有数据目录恢复流程。
