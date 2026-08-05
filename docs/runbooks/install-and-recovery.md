# Koradio 唯一入口、自动更新与恢复

> Scope: S7-02/S7-07/S7-09 Personal Local Preview；不适用于外部分发、签名公证、Gatekeeper 或干净 Mac 验收。

## 前提

- macOS 15+ Apple Silicon，唯一可启动入口为 `/Applications/Koradio.app`。
- Electron 桌面壳随 `Koradio.app` 一起安装；不要求系统安装 Node.js、Chrome 或额外 PWA。
- 首次需要语音串讲时，在 Settings 明确触发约 1.84 GiB Qwen3-TTS 模型下载；下载失败不影响文字 DJ 与歌曲播放。
- 先对两份 app 执行 `codesign --verify --deep --strict`，再用 `pnpm verify:package:macos <Koradio.app>` 验证包内容与启动停止。
- 当前只支持数值语义版本。自动更新按可信 `origin/main` 的提交总数生成 `0.0.<count>`；手动构建必须同时写入完整 source commit。
- 真实用户数据默认位于 `~/Library/Application Support/Koradio`；不得在升级、回滚或卸载过程中删除该目录、其备份或 Keychain 凭据。

## 日常启动与自动更新

1. 用户从 Launchpad 打开固定的 `/Applications/Koradio.app`。
2. Electron 主进程使用包内 Node 和 updater，在独立缓存 checkout 中抓取 `https://github.com/komochi007/koradio.git` 的 `origin/main`；不得读取或修改日常开发工作树。
3. 已安装 metadata 与远端 commit 一致时才启动 Local Service。
4. commit 不一致时，先对精确远端 commit 执行 frozen install、本机构建、ad-hoc strict codesign 和完整 package verifier。
5. 验证通过后将旧 app 移到 `~/Library/Application Support/Koradio/Updater/backups/*.backup`，再把候选包原位安装为 `/Applications/Koradio.app` 并重新打开。
6. 无网、远端不可信、checkout 有 tracked changes、构建失败、验证失败或替换失败时均不打开旧版或产品页面；恢复条件后再次点击同一图标重试。

更新 checkout 与下载缓存位于 `~/Library/Caches/Koradio/Updater`。首次更新或依赖变化时可能耗时数分钟；这不是后台更新，不创建 LaunchAgent、Login Item、新 `.app` 或公开下载入口。

## 首次安装与手动恢复

1. 首次安装时，仅把已经验证且带有效 `build-metadata.json` 的 `Koradio.app` 安装到 `/Applications/Koradio.app`。版本化 `Koradio-<semver>-arm64.app` 仅用于受控 package smoke 或本机预览，不得与固定入口并存。不要以管理员身份启动 Local Service。
2. 安装前退出 Koradio，并确认其他 `Applications` 目录与 Dock 中不存在第二个 Koradio `.app` 或 PWA 入口。
3. 自动替换失败时，updater 会把旧 app 恢复到固定路径；候选包不会作为第二个入口保留。
4. 需要人工回滚时，退出 Koradio，把固定路径当前 app 移入新的非 `.app` 备份目录，再将目标 `*.backup` 恢复为 `/Applications/Koradio.app`。回滚后启动仍会先检查远端；只要远端仍是更新版本，旧版不会被打开。
5. 如果确需离线诊断旧包，只能直接运行备份中的 `Contents/MacOS/Koradio --smoke`，不得把备份改回 `.app` 或添加到 Launchpad。
6. 卸载只移除固定路径的 app；更新缓存、备份、真实用户数据、数据迁移备份和 Keychain item 默认保留。删除这些内容需要单独明确授权。

手动构建示例：

```bash
COMMIT="$(git rev-parse HEAD)"
COUNT="$(git rev-list --count "$COMMIT")"
node scripts/release/build-macos.mjs \
  --arch arm64 \
  --version "0.0.$COUNT" \
  --commit "$COMMIT" \
  --output artifacts/macos/s7-09 \
  --keep-app \
  --no-dmg
```

## 受控本机验证矩阵

使用两个独立 arm64 构建后执行：

```bash
OLD_APP=/absolute/path/to/Koradio-0.0.1.app
NEW_APP=/absolute/path/to/Koradio-0.0.2.app
pnpm verify:lifecycle:macos --old "$OLD_APP" --new "$NEW_APP"
```

验证器在新的系统临时目录中运行，完成或失败后清理其自有临时目录及 app 副本，不删除任何用户文件。它验证：

| 场景 | 预期结果 |
|---|---|
| 全新安装 | 旧版本 app 可启动并停止；新临时数据根创建成功。 |
| 重复安装 | 同版本可替换；数据根字节内容不变。 |
| 升级 | 新版本 app 可启动；既有数据根文件与用户数据哨兵仍存在。 |
| 降级 | 在替换 app 前拒绝较低版本；仍保留新版 app 和数据。 |
| 启动失败回滚 | 缺失服务入口的候选 app 启动失败；上一可启动 app 被恢复。 |
| 卸载 | 仅移除临时 `Applications/Koradio.app`；数据根和保留 app 副本仍存在。 |
| 进程 | 每次冒烟结束后 `49373-49383` 没有 Koradio 监听端口。 |
| 唯一入口 | 只有固定 `/Applications/Koradio.app` 使用 `.app` 后缀；第二个 PWA 入口和其他 Koradio `.app` 不存在。 |
| 启动前更新 | 每次正常打开都读取可信 `origin/main`；更新失败不启动 Local Service 或 Electron 产品窗口。 |

生命周期验证使用 Mock Provider，不创建或修改真实 Keychain item；手动 app 替换和移除均不调用 Keychain 操作。常规 Electron 预览的 packaged runtime 使用 `live` 默认。真实 Provider 凭据与外部分发环境的复验留给后续任务。
