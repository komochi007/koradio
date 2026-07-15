# ADR 0003：macOS 包装形态与发布边界

> 状态：已接受
> 日期：2026-07-15
> 决策人：项目所有者
> Task：S0-05
> 取代：无
> 被取代：无

## 1. 背景

Koradio 当前仍处于 Documentation-first 阶段，没有产品源码、manifest、锁文件、生产构建或正式安装包。[ADR 0001](0001-toolchain-and-quality.md) 已固定 Node 24.18.0、pnpm production 文件树与运行时自带要求；[ADR 0002](0002-runtime-topology.md) 已固定 production 同源 Local Service、loopback、端口 fallback 和本地 session 安全边界。

S0-05 需要比较 Electron 桌面壳一体包与 PWA + Local Service 安装器，关闭会改变 S1 脚手架、S2 Credential Store、S7 发布工程和用户安装生命周期的包装未知项。项目所有者于 2026-07-15 明确当前产品只在受控本机个人使用，不提供公开下载；公开分发后置。因此本 ADR 接受包装架构与本地交付边界，把 Developer ID、公证和独立分发环境保留为未来公开发布硬门，而不是 S0 架构决策的前置条件。

## 2. 决策范围

### 包含

- macOS 包装形态、本地个人预览容器与未来公开分发边界。
- Node runtime、Server production 文件树和 PWA 静态资源的捆绑边界。
- launcher、Local Service、外部浏览器的启动与停止关系。
- 最低 macOS 版本、CPU 架构和产物拆分方式。
- Credential Store、数据目录、手动升级、卸载和残留原则。
- Developer ID 签名、公证、staple 与 Gatekeeper 验证路径。

### 不包含

- 产品源码、完整 launcher、正式安装器、release workflow 或自动更新实现。
- SQLite、Secret Store、Provider 或其他 native dependency 的具体包选择。
- Windows、Mac App Store、登录自动启动、后台常驻服务或远程访问。
- 产品页面、视觉设计或 PRD 公共行为变更。

## 3. 约束与决策驱动因素

| 因素 | 必须满足的条件 | 证据来源 |
|---|---|---|
| 工程 | 自带 Node 24.18.0；production Server 使用受控 `pnpm deploy` 或等价 bundling；不复制开发期链接树 | [ADR 0001](0001-toolchain-and-quality.md) |
| 架构 | Browser 仍拥有实时播放；Production 仍由 Local Service 同源托管 PWA/REST/WS；launcher 不携带 token | [architecture.md](../../architecture.md)、[ADR 0002](0002-runtime-topology.md) |
| 安全与数据 | 只绑定 loopback；Secret 进入 OS Credential Store；数据进入用户 Application Support；卸载不自动删除数据 | [AI_RULES.md](../../AI_RULES.md)、[PRD](../prd.md) |
| 当前交付 | 只允许项目所有者从可信源码在受控本机构建并个人使用，不创建公开下载入口 | [roadmap.md](../project-management/roadmap.md) |
| 未来发布 | 任何外部分发都必须完成 Developer ID、Apple 公证、Gatekeeper 与独立干净环境硬门 | [release checklist](../project-management/release-checklist.md) |
| 验收 | 两方案必须比较启动、运行时、凭据、升级、卸载、签名公证与维护成本，并记录本地生命周期 | [tasks.md](../project-management/tasks.md) |

## 4. 候选方案

评分为 `1-5`，分数越高越适合 Koradio。签名公证复杂度仍参与架构成本比较；在当前本地个人预览中不作为 S0 关闭门，在任何未来外部分发中仍是独立硬门。

| 维度 | Electron 桌面壳一体包 | 原生 launcher + 外部浏览器 PWA |
|---|---:|---:|
| 启动体验 | 5：单一桌面窗口 | 4：双击 launcher 后打开默认浏览器 |
| 运行时捆绑 | 2：Electron/Chromium 之外仍需精确 Node sidecar | 5：只携带精简 Node runtime 与生产文件树 |
| Credential Store | 4：sidecar 可访问，但 entitlement/签名面更大 | 5：同一用户会话下由 Local Service adapter 访问 |
| 手动升级 | 4：替换 app，数据外置 | 5：按架构替换 launcher app，数据外置 |
| 卸载与残留 | 4：移除 app，数据保留 | 5：移除 app，无 LaunchAgent/Login Item，数据保留 |
| 签名公证复杂度 | 3：多 helper/framework 与 JIT entitlement | 4：launcher + Node 两层 Mach-O；仍需真实 Developer ID 验证 |
| 维护成本 | 2：Electron 与 Node 双运行时、Chromium 高频升级 | 5：薄 launcher，产品 Web 仍服从既有 PWA 架构 |
| 总分 | **24 / 35** | **33 / 35** |

详细 PoC 结果见 [证据记录](evidence/0003-macos-packaging-poc.md)。

## 5. 推荐裁决

采用 **原生轻量 launcher + bundled Local Service + 外部浏览器 PWA**。当前只从可信源码在受控本机构建实际机器架构的个人预览 app/DMG；不上传、不公开下载、不向外部用户分发。

本 ADR 接受的是包装架构和交付边界，不代表产品代码、正式 launcher、安装包或发布流水线已经实现。

### 5.1 产物形态

- 构建目标为两个独立产物：`arm64` app/DMG 与 `x64` app/DMG，不构建包含两份 Node runtime 的 universal 产物；当前个人使用只需构建实际机器架构。
- 每个 DMG 包含一个薄原生 launcher `.app`、对应架构的 Node 24.18.0 精简 runtime、`pnpm --prod deploy` 生成的 Server 文件树和 built PWA assets。
- 精简 runtime 只保留运行所需 `bin/node` 与 Node `LICENSE`；不携带 npm、npx、Corepack、pnpm、headers 或开发文档。
- 最低支持系统推荐为 **macOS 13.5**，由 Node 24.18.0 arm64/x64 官方二进制的 `LC_BUILD_VERSION.minos` 决定。

### 5.2 启动与停止

```text
用户启动 Koradio launcher
  → 检测 49373 是否为现有 Koradio Local Service
  → 复用现有实例，或启动 bundled Node + deployed Server
  → 未知进程占用时在 49373-49383 有界 fallback
  → health ready 后只打开 http://127.0.0.1:<selected-port>/
  → PWA 通过同源 POST bootstrap 取得内存 token

用户退出 launcher
  → launcher 向自己启动的 Local Service 发送 SIGTERM
  → 等待 checkpoint/关闭完成并释放端口
  → 不遗留后台服务、LaunchAgent 或 Login Item
```

- launcher URL 只能包含 origin 和普通路径，不得包含 token、key、profile 或敏感诊断。
- v1 不默认登录启动或后台常驻；直接打开已安装 PWA 而服务未运行时，继续使用既有只读离线 Settings 行为。
- S7 正式 launcher 必须提供清晰的“打开 Koradio”和“退出 Koradio”生命周期入口；PoC 的无 UI agent 形态不是最终用户界面。

### 5.3 数据与凭据

- 首次启动继续由 platform adapter 选择 `~/Library/Application Support/Koradio` 等 OS 应用数据目录；launcher 不把绝对用户路径编译进包。
- Local Service 以当前登录用户身份访问 OS Credential Store；浏览器、launcher URL、SQLite、日志与普通文件不接触明文 secret。
- 应用二进制、用户数据与 Keychain item 分离。替换或移除 `.app` 不修改数据目录、备份或凭据。
- 用户主动清理数据必须由后续明确授权的 runbook/use case 执行，不属于默认卸载。

### 5.4 升级与卸载

- 当前个人使用采用手动升级：从可信源码构建相同架构的新 app/DMG，停止旧 launcher，替换 `.app`，再启动并由产品 migration 处理数据版本。
- 未来公开分发时，架构选择错误必须在下载页和启动诊断中明确；不能静默用 Rosetta 代替 arm64 原生包。
- 卸载默认只移除 `.app`。数据目录、备份和 Credential Store 保留，防止未经确认的数据删除。
- S7 必须用两个真实版本验证替换升级、失败回滚和数据保留；本 S0 PoC 只证明包装边界与进程生命周期。

### 5.5 当前本地个人预览

1. 只从项目所有者确认的可信源码和锁定依赖构建，不下载或执行来源不明的预构建二进制。
2. 对 bundled Node 和 app bundle 使用 ad-hoc hardened-runtime 签名，并执行 `codesign --verify --deep --strict` 验证结构。
3. 产物只留在受控本机，不上传 Release、下载页、聊天、网盘或其他外部分发渠道。
4. 不通过关闭 Gatekeeper、全局降低系统安全策略或移除第三方下载 quarantine 来伪装可信分发。

ad-hoc 签名不证明开发者身份，也不能替代 Developer ID 或 Apple 公证。

### 5.6 未来公开分发路径

每个架构独立执行：

1. 用 `Developer ID Application` 对 bundled Node 和 launcher bundle 逐层签名，启用 Hardened Runtime、安全时间戳，禁止 `get-task-allow`。
2. 执行 `codesign --verify --deep --strict`，复核 entitlements、架构和 deployment target。
3. 创建并签名 DMG；推荐方案不使用 `.pkg`，因此不需要 Developer ID Installer identity。
4. 使用 `notarytool submit --wait` 提交最终 DMG，检查 accepted 结果和脱敏日志。
5. 对 DMG 执行 `stapler staple/validate`，并在带 quarantine 的独立干净环境执行 Gatekeeper `spctl` 与首次启动。

签名私钥和公证凭据只能进入受控 Keychain 或 CI Secrets，不得进入仓库、命令回显、PR、日志或产物。

未来一旦决定提供公开下载或向外部用户分发，每个架构必须独立完成：

- arm64/x64 DMG 均取得 Developer ID 签名、安全时间戳和 strict codesign 通过证据。
- Apple notary service 返回 accepted，ticket 可 staple/validate，Gatekeeper 接受最终产物。
- 在独立 macOS 13.5+ 干净用户或 VM 完成启动、停止、手动替换升级、移除应用和残留检查。
- 公开发布任务的权威文档、工程规则、README、context、路线图和任务状态同步更新。

### 5.7 S0 架构接受门禁

本 ADR 的当前接受条件为：

- Electron 与 native launcher 两种候选已按任务要求比较并形成唯一裁决。
- launcher arm64/x64 和 Electron arm64 最小包已验证 bundled runtime、同源服务、Credential Store 探针、启动、停止、端口 fallback 与无进程/端口/挂载残留。
- 所选方案的 app bundle 已通过 ad-hoc hardened-runtime 与 strict codesign 结构检查。
- 当前渠道明确为本地个人使用；未验证的 Developer ID、公证、Gatekeeper 和独立分发环境已转入第 5.6 节及 S7 公开发布门，不能被解释为通过。

## 6. 后果

### 正向后果

- 保持 Browser Audio Engine 与既有 PWA 为产品事实源，不再引入 Electron renderer 分支。
- arm64 PoC DMG 约 43.9 MB，Electron arm64 PoC DMG 约 174.8 MB，下载与维护面明显缩小。
- launcher 明确拥有子服务生命周期，默认无后台常驻、登录项或系统级 daemon。
- per-architecture 包与 Node 官方分发一致，避免把两份 runtime 塞入 universal 包。

### 负向后果与权衡

- 启动会打开默认浏览器，不是单窗口桌面壳；用户直接打开 PWA 时仍可能看到 Local Service 离线状态。
- 需要维护一个很小但真实的 native launcher 与 arm64/x64 构建矩阵。
- 手动下载时用户可能选错架构；发布页和诊断必须可操作。
- 当前没有真实签名、公证与独立干净用户证据，任何公开下载或外部分发都不可进行。

### 保持不变

- Production 同源、loopback、端口 fallback、session bootstrap 与 Origin 规则不变。
- Browser Audio Engine、Backend、DeviceSettings、ProfilePreferences、Secret Store 和数据迁移 owner 不变。
- v1 仍不包含 Windows、Mac App Store、自动更新、云身份、远程访问或默认登录启动。

## 7. 实施与验证

| 项目 | 结果或计划 | 证据 |
|---|---|---|
| 隔离 PoC | Electron arm64、launcher arm64/x64 均生成 DMG；临时源和二进制未进入仓库 | [证据记录](evidence/0003-macos-packaging-poc.md) |
| 生命周期 | 只读 DMG 启动、Node 版本、Keychain、同源 health/session、停止和端口释放通过 | [证据记录](evidence/0003-macos-packaging-poc.md) |
| 包装结构 | `pnpm deploy`、精简 Node runtime、arm64/x64 与 macOS 13.5 下限已验证 | [证据记录](evidence/0003-macos-packaging-poc.md) |
| 本地签名 | ad-hoc strict codesign 通过；只证明本地 bundle 结构，不证明开发者身份 | [证据记录](evidence/0003-macos-packaging-poc.md) |
| 未来公开发布 | Developer ID、notary ticket、Gatekeeper 与独立干净用户未验证；外部分发保持禁止 | S7 发布硬门 |
| 回滚或替代 | 未来正式签名/公证若证明该方案不可行，停止公开发布并用新证据更新或取代本 ADR | 新证据 + 新/更新 ADR |

## 8. 权威文档同步

| 文档 | 是否需要修改 | 原因或结果 |
|---|---|---|
| `docs/prd.md` | 否 | 产品行为未变化 |
| `docs/user-flow.md` | 否 | 用户流程未变化；launcher 最终 UI 尚未接受 |
| `architecture.md` | 是 | 记录已接受包装架构、本地使用和未来公开分发边界 |
| `design/design.md` | 否 | 没有产品视觉变更 |
| `AI_RULES.md` | 是 | 禁止公开分发 ad-hoc 产物，并保留未来发布硬门 |
| `README.md` | 是 | 记录已接受决策、当前渠道与未实现事实 |
| `context.md` | 是 | 收录稳定包装和交付边界 |
| 项目管理文档 | 是 | 关闭 S0-05，并把公开分发验证保留在 S7～S9 |

## 9. 后续任务

- S0-05：包装架构与当前交付边界已接受；Developer ID 缺失不再阻塞本地个人使用。
- S1-01/S1-03：在 S0 阶段门关闭后实现 production deploy、static serving 与 launcher 消费边界。
- S2-03：按接受后的包装边界实现 OS Credential Store adapter，并在 headless/错误环境验证。
- S7-01～S7-02：实现正式 launcher、双架构构建和本地手动升级/回滚。
- S7-03～S9：只有项目所有者重新授权公开下载后，才取得 Developer ID 权限并执行签名、公证、独立环境、Beta、RC 和公开发布门。
