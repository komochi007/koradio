# Koradio 受控本机安装与恢复

> Scope: S7-02 Personal Local Preview；不适用于外部分发、签名公证、Gatekeeper 或干净 Mac 验收。

## 前提

- macOS 13.5+，旧版与新版均从可信源码构建，且架构相同。
- 先对两份 app 执行 `codesign --verify --deep --strict`，再用 `pnpm verify:package:macos -- <Koradio.app>` 验证包内容与启动停止。
- 当前只支持数值语义版本（例如 `0.0.1`）。构建命令使用 `node scripts/release/build-macos.mjs --arch arm64 --version 0.0.1 --output artifacts/macos/s7-02`。
- 真实用户数据默认位于 `~/Library/Application Support/Koradio`；不得在升级、回滚或卸载过程中删除该目录、其备份或 Keychain 凭据。

## 手动安装和升级

1. 首次安装时，将已验证的 `Koradio.app` 复制到目标 `Applications` 目录，再启动 app。不要以管理员身份启动 Local Service。
2. 重复安装同一版本前先退出菜单栏中的 Koradio；替换 app 后启动并确认产品可用。
3. 升级只接受相同架构、版本号更高的 app。退出旧 launcher，保留旧 app 作为可恢复副本，替换后启动新 app。
4. 新 app 启动失败时，退出失败实例，恢复保留的旧 app，再启动旧 app；不得重建或清空数据目录。
5. 不支持直接降级。应恢复保留的旧 app；如果数据 migration 已失败，按既有数据目录迁移恢复机制处理，不能手动删库。
6. 卸载只移除 `Koradio.app`。数据目录、数据迁移备份和 Keychain item 默认保留；清理用户数据需要单独的明确授权。

## 受控本机验证矩阵

使用两个独立 arm64 构建后执行：

```bash
OLD_APP=/absolute/path/to/Koradio-0.0.1.app
NEW_APP=/absolute/path/to/Koradio-0.0.2.app
pnpm verify:lifecycle:macos --old "$OLD_APP" --new "$NEW_APP"
```

验证器在新的系统临时目录中运行，保留该目录及被替换、失败和卸载的 app 副本，不删除任何用户文件。它验证：

| 场景 | 预期结果 |
|---|---|
| 全新安装 | 旧版本 app 可启动并停止；新临时数据根创建成功。 |
| 重复安装 | 同版本可替换；数据根字节内容不变。 |
| 升级 | 新版本 app 可启动；既有数据根文件与用户数据哨兵仍存在。 |
| 降级 | 在替换 app 前拒绝较低版本；仍保留新版 app 和数据。 |
| 启动失败回滚 | 缺失服务入口的候选 app 启动失败；上一可启动 app 被恢复。 |
| 卸载 | 仅移除临时 `Applications/Koradio.app`；数据根和保留 app 副本仍存在。 |
| 进程 | 每次冒烟结束后 `49373-49383` 没有 Koradio 监听端口。 |

当前产品默认 Mock Provider，生命周期验证不创建或修改真实 Keychain item；手动 app 替换和移除均不调用 Keychain 操作。真实 Provider 凭据与外部分发环境的复验留给后续任务。
