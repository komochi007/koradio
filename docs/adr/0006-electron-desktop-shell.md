# ADR 0006：Electron 桌面外壳迁移

> 状态：已接受
> 日期：2026-08-03
> 决策人：项目所有者
> Task：S7-09
> 取代：ADR 0003
> 被取代：无

## 1. 背景

迁移前的 macOS 个人预览使用 Swift Native Launcher 启动 bundled Node Local Service，再通过 Chrome 独立应用窗口加载现有 Web/PWA。该方案已经完成 S7-01/S7-02 的历史包装和安装生命周期验收，但桌面窗口、服务生命周期和浏览器入口分属两套进程边界。

S7-09 要求把桌面外壳迁移到 Electron，同时保持 REST、WebSocket、数据库、Provider、AudioEngine、Session、用户数据和既有 Web Renderer 不变。当前目标仅为 macOS 15+ arm64 个人预览，不扩大到 Windows/Linux 或公开分发。

## 2. 决策范围

### 包含

- 新增 `apps/desktop`，由 Electron 主进程拥有单实例、启动前更新、服务检测/启动/停止、窗口和 Renderer 安全策略。
- 使用 `http://127.0.0.1:<port>/radio` 加载现有 Web Renderer，不引入 `file://`、自定义协议或第二套 Renderer。
- 使用 Electron 43.2.0、`@electron/packager` 20.0.2 和 `@electron/osx-sign` 2.5.0；macOS arm64、ad-hoc hardened runtime、`asar: false`。
- 保留 Bundle ID `app.koradio.launcher`、固定 `/Applications/Koradio.app`、现有图标资源名和可见 Dock/Launchpad 行为。
- 启动状态窗口创建后，在 macOS 菜单栏显示 Koradio 品牌 PNG 图标；点击打开原生菜单，展示当前播放状态、曲名/艺人、上一首、播放/暂停、下一首、显示窗口和退出。
- 在 metadata `schemaVersion: 1` 下增加可选 `shell: "electron"` 与 `electronVersion`，旧 Native metadata 仍可解析，新包验证器要求 Electron 标识。

### 不包含

- Windows/Linux、Mac App Store、Developer ID、公证、公开下载或自动更新 feed。
- 全局快捷键、媒体键、通知、后台常驻、第二个 PWA 图标或普通浏览器标签。
- REST/WS v1、`packages/contracts`、数据库 schema、Provider 协议、AudioEngine、Session 或用户数据迁移。
- 不删除 Native Launcher 源码；相关文件保留为 legacy，但不再进入生产构建链路。

## 3. 约束与决策驱动因素

| 因素 | 必须满足的条件 | 证据来源 |
|---|---|---|
| 产品与流程 | 产品仍提供本地 Radio、Profile、播放、节目生成和降级路径；桌面入口只有一个 | [PRD](../prd.md)、[用户流程](../user-flow.md) |
| 系统边界 | Local Service 继续拥有业务、数据库、Provider 和数据；Browser/Web Renderer 继续拥有播放事实 | [architecture.md](../../architecture.md)、[ADR 0002](0002-runtime-topology.md) |
| 更新 | 正常启动前复用现有 `origin/main` fail-closed 更新器和回滚机制 | [安装与恢复手册](../runbooks/install-and-recovery.md) |
| 安全 | Node 集成关闭，启用 context isolation、sandbox、webSecurity、CSP、导航/权限白名单；Renderer 不获得 Token 或 Node API | [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)、[Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) |
| 交付 | 继续支持 macOS 15+ arm64、包内 Node/Python/Qwen/Server，不依赖用户安装 Node.js 或 Chrome | [S7-09](../project-management/tasks.md) |

## 4. 候选方案

### 方案 A：继续 Native Launcher + Chrome 独立窗口

- 做法：保留 Swift Launcher、外部 Chrome 和现有 PWA 入口。
- 收益：包体较小，已有历史本机验证。
- 代价：桌面窗口依赖 Chrome，用户入口与 Renderer 运行时分裂，无法提供统一窗口安全策略。
- 风险：Chrome 安装和 PWA 注册可能产生重复入口；Native/浏览器生命周期继续需要跨进程协调。
- 验证结果：S7-01/S7-02 已有历史 arm64 证据，但不满足本次 Electron 外壳目标。

### 方案 B：Electron 主进程 + 现有 Web Renderer

- 做法：Electron 主进程复用 Local Service 与启动前更新器，窗口加载 loopback `/radio`，生产包携带 Electron Framework/Helpers、Node、Server、Web dist、Qwen Runtime 和 metadata。
- 收益：单一桌面入口和窗口，保持同源 REST/WS/Session/静态路由；可在主进程统一服务归属、导航白名单、CSP 和权限策略。
- 代价：包体增大，需维护 Electron Framework/Helpers、ad-hoc entitlements 和 pnpm deploy 符号链接布局。
- 风险：Electron 版本升级、签名、动态库加载和 bundled runtime 需要独立包验证。
- 验证结果：S7-09 已完成 arm64 真实打包、strict codesign、Electron smoke、Node/Python/Qwen/Server 资源检查；7 日稳定性试用仍未完成。

## 5. 裁决

选择方案 B。Electron 主进程成为桌面外壳和生命周期 owner，现有 Web Renderer 仍是产品 UI 与 Browser Audio Engine 的事实源，Local Service 仍是业务和数据事实源。

运行时固定如下：

- 正常启动：单实例锁 → 启动前更新检查 → 检测并复用 `49373–49383` 的 Koradio 服务，或启动包内 Node 服务 → health ready → 创建唯一 `960 × 1600` content-size、`hiddenInset`、`#090a0c` 窗口并加载 `/radio`。
- 退出：关闭主窗口即退出 Electron，只停止当前 Electron 自己启动的服务；复用的外部服务不终止。
- 菜单栏：启动状态窗口创建后显示；点击打开系统原生菜单。主进程只接收受限播放展示状态并转发三种控制命令，播放事实与命令执行仍归 Web Renderer 的 AudioEngine；关闭主窗口或退出后销毁图标，不保留后台播放。
- 更新：不使用 Electron `autoUpdater`，继续调用现有 updater；更新结果为 `current` 或 `updated`，更新失败 fail-closed。
- 打包：首版 `asar: false`，server deploy 依赖在 Electron app 内保持可重定位；应用 Bundle ID、固定安装路径和图标名保持不变。

## 6. 后果

### 正向后果

- Launchpad/Dock 只有一个 Koradio 桌面入口，用户不再依赖系统 Chrome。
- 现有 Web Renderer、REST、WebSocket、数据库、Provider、AudioEngine、Session 和用户数据不需要建立第二套协议。
- 桌面进程可以统一控制服务归属、窗口生命周期、CSP、权限和导航安全边界。

### 负向后果与权衡

- Electron 包体和签名面大于 Native Launcher；必须锁定版本并持续验证 Framework/Helpers。
- `asar: false` 牺牲封装性以保留 bundled Node、Qwen 和 pnpm deploy 的路径兼容性。
- ad-hoc 签名只支持受控本机预览；公开分发仍需 Developer ID、公证、Gatekeeper 和独立干净环境门。

### 保持不变

- REST、WebSocket、数据库 schema、Provider 协议、Session bootstrap、AudioEngine、Profile/Program/Playback owner 和用户数据目录不变。
- 现有 `/radio` 及产品路由、视觉设计、无障碍要求和 TTS 文字降级不变。
- 不引入后台常驻、独立迷你播放器窗口、媒体键、全局快捷键或通知。

## 7. 实施与验证

| 项目 | 结果或计划 | 证据 |
|---|---|---|
| Electron 主进程 | 已实现单实例、更新前置检查、服务生命周期、窗口策略与 `--smoke` | `apps/desktop/src/`、`tests/unit/desktop-shell.test.ts` |
| macOS 包装 | 已切换到 Electron Packager，保留 Node/Server/Web/Qwen/Updater/metadata 资源 | `scripts/release/build-macos.mjs` |
| 包验证 | arm64 包已通过 strict codesign、Electron Framework/Helpers、metadata、图标、Node 24.18.0、Python 3.12.13、Qwen 导入、Renderer bootstrap/health smoke | `scripts/release/verify-macos-package.mjs` |
| 生命周期 | 已兼容 Native 与 Electron smoke JSON 结果，并覆盖升级/回滚/降级拒绝/数据保留路径 | `scripts/release/verify-macos-lifecycle.mjs` |
| 稳定性试用 | 进行中；需要 7 个自然日、10 次启动/退出、20 次真实节目生成、8 小时播放且无 Blocker/Critical | S7-07 |

## 8. 权威文档同步

| 文档 | 结果 |
|---|---|
| `docs/prd.md` | 已更新桌面入口和启动更新行为 |
| `docs/user-flow.md` | 已更新 Electron 窗口与异常分支 |
| `architecture.md` | 已更新桌面边界、目录和安全/包装模型 |
| `AI_RULES.md` | 已更新 Electron 工程硬约束 |
| `README.md` / `context.md` | 已更新当前事实、状态和下一起点 |
| `docs/project-management/roadmap.md` / `tasks.md` | 已登记 S7-09 与当前验收门 |

## 9. 后续任务

- 完成 S7-07 稳定性试用并记录 Electron 首版结果。
- 外部分发前重新执行 S7-03～S7-05 的 Developer ID、公证、Gatekeeper 和独立干净环境验收。
