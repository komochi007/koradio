# S7-07 个人本机稳定性试用与缺陷收口

> Task：`S7-07`
> 状态：进行中
> 开始日期：2026-07-23
> 范围：项目所有者 macOS arm64、Personal Local Preview、固定 Electron 桌面入口加载既有 Web Renderer、显式 `live` Provider；不含外部分发、遥测、x64、独立干净 Mac 与 Developer ID 签名公证。

## 1. 启动基线

- 当前安装基线：2026-08-05 已将 Electron arm64 `0.0.913`（源码 `5512915`）安装为固定 `/Applications/Koradio.app`；启动前更新检查、Electron 窗口、loopback Local Service 与 session bootstrap 已复验。
- 运行模式：常规 Electron 预览使用 packaged runtime 的 `live` 默认；development、test、CI 与生命周期验证保持 Mock。
- 数据保护：不删除用户数据目录、旧目录、迁移备份或 Keychain 凭据；本记录不保存原始场景、Provider 正文、播放 URL、token、用户名或绝对路径。
- 本次 Electron 切换和启动仅作为安装基线与回归验证，不计入启动/退出、真实生成或播放时长；首个有效样本必须在产品中完成并记录脱敏结果。

当前没有已计入的稳定性试用会话；Local Service 仅监听 loopback 的 `49373-49383` 候选端口范围。

## 2. 累计样本

| 指标 | 门槛 | 当前 | 状态 |
|---|---:|---:|---|
| 连续自然日 | 7 | 0 | 未开始计数 |
| 独立启动/退出 | 10 | 0 | 未开始计数 |
| 真实节目生成 | 20 | 0 | 未开始计数 |
| 累计播放 | 8 小时 | 0 | 未开始计数 |
| 未处理 Blocker / Critical | 0 | 0 | 当前无已登记项 |

## 3. 每日脱敏汇总

| 日期 | 启动/退出 | 真实生成 | 播放时长 | 覆盖路径 | Provider 降级或异常 | 缺陷引用 | 结论 |
|---|---:|---:|---:|---|---|---|---|
| 2026-07-23 | 0 | 0 | 0 | 启动基线与预览包验证完成，等待首个有效样本 | 无 | S7-07-001、S7-07-002、S7-07-003 | 进行中 |
| 2026-07-24 | 0 | 0 | 0 | 桌面 PWA 尺寸适配、Radio 输入控件、歌单导入与应用图标复现 | 未记录 | S7-07-004、S7-07-005、S7-07-006、S7-07-007、S7-07-008、S7-07-009 | UI 首次修复未满足窄窗口验收，已进入二次修复与回归 |
| 2026-07-25 | 0 | 0 | 0 | Management / Settings standalone 滚动边界修复与本机 PWA 复验 | 未记录 | S7-07-010 | Chromium 专项回归和 `0.0.10` arm64 预览包启动通过 |
| 2026-07-26 | 0 | 0 | 0 | 待记录 | 待记录 | 待记录 | 待开始 |
| 2026-07-27 | 0 | 0 | 0 | 待记录 | 待记录 | 待记录 | 待开始 |
| 2026-07-28 | 0 | 0 | 0 | 待记录 | 待记录 | 待记录 | 待开始 |
| 2026-07-29 | 0 | 0 | 0 | 待记录 | 待记录 | 待记录 | 待开始 |
| 2026-07-30 | 0 | 0 | 0 | 唯一 Launchpad 入口与启动前强制联网更新实现、安装和重开复验 | 未记录 | S7-07-011、S7-07-012 | `0.0.137` 修复版已作为自动更新终验基线；不计入稳定性样本 |
| 2026-08-03 | 0 | 0 | 0 | 回退后 Launchpad 图标标准尺寸修复、自动更新安装与实机复验 | 未记录 | S7-07-014 | `0.0.139` 修复版恢复标准尺寸圆角矩形图标；不计入稳定性样本 |
| 2026-08-05 | 0 | 0 | 0 | Electron `0.0.913` 安装、启动前 `origin/main` 更新检查、窗口与 session bootstrap 验证；修复后在线更新至 `0.0.147` 并重新启动 | 无 | S7-09-001、S7-09-002 | Electron 切换与更新器修复基线通过；不计入稳定性样本 |
| 2026-08-06 | 0 | 0 | 0 | Electron 顶部拖拽命中区域修复、`0.0.153` 桌面包更新与实机拖动复验 | 无 | S7-09-003 | 新增未变换的顶部中央拖拽带；`0.0.153` 包验证、strict codesign、session bootstrap 和实机拖动操作复验通过；不计入稳定性样本 |
| 2026-08-12 | 0 | 0 | 0 | 开发态 Local Service 占用 `49373` 时的 Electron 启动 404 修复与 arm64 包 smoke | 无 | S7-09-005 | 可复用服务现同时校验健康接口与 `/radio` Renderer；正式包绕过 API-only 开发服务并使用自带同源服务；不计入稳定性样本 |
| 2026-08-14 | 0 | 0 | 0 | DJ 点播 `PLAY NEXT`、空节目手动切歌与保存/导入反馈回归 | 无 | S7-07-015 | 项目所有者验收通过；该缺陷收口不计入真实生成或播放样本 |
| 2026-08-17 | 0 | 0 | 0 | UX-15/16 Detail、Taste 与常规反馈层级回归，`0.0.179` 包验证、固定应用替换与重新启动 | 更新器缓存可选原生依赖缺失，候选未替换；受控本地构建与严格包验证后完成替换 | S7-09-006 | 项目所有者验收通过；不计入真实生成或播放样本 |
| 2026-08-18 | 0 | 0 | 0 | 更新器缓存依赖重建、真实候选构建与原位替换复验 | 无 | S7-09-006 | `0.0.187` 已经正式启动前更新原位安装；strict codesign、metadata 与重新启动通过；不计入真实生成或播放样本 |

## 4. 必测路径

- 启动、退出与再次启动：确认 Local Service 仅在 loopback 工作，退出后没有残留端口。
- 场景生成：显式 `live` 下完成真实 Codex、NetEase 和可选 Qwen3-TTS（中文 Serena、英文 Ryan）；生成失败时旧节目保持不变且错误脱敏。
- 连续播放：播放/暂停/seek、队列切换、歌词或可见降级、Detail Sheet 串讲与文字 DJ 降级。
- 反馈与记忆：喜欢、撤销、跳过、节目收藏及 Taste 投影的可见结果。
- Profile 与恢复：切换 Profile，重启后恢复可读历史和合法 playback checkpoint。
- Provider 降级：TTS、歌词、单曲媒体或生成依赖失败时，按既有恢复入口继续或保留旧节目。

## 5. 缺陷登记

| ID | 日期 | 影响等级 | 脱敏复现摘要 | 期望 / 实际 | 处理结论 | 回归证据 |
|---|---|---|---|---|---|---|
| S7-07-001 | 2026-07-23 | Low | 安装手册的 `pnpm verify:package:macos -- <Koradio.app>` 会把分隔符传给脚本，导致验证命令拒绝参数。 | 应按手册完成包验证；实际命令以 usage 失败。 | 已将手册改为不含分隔符的有效调用。 | 使用 arm64 `0.0.5` bundle 成功验证 strict codesign、Node、系统语音、TTS 与 launcher smoke。 |
| S7-07-002 | 2026-07-23 | Medium | PWA manifest 缺少 192 × 192 与 512 × 512 品牌图标，Chrome 不提供可靠的独立窗口安装入口。 | 用户应能将 Koradio 安装为 standalone PWA；实际只能在普通浏览器标签页使用。 | 已从既有品牌标记生成深色背景 PNG 图标，补充 manifest identity 与 icon 声明。 | `pwa-manifest.test.ts` 验证 manifest、PNG 签名与精确像素尺寸；重新构建后在 Chrome 复核安装入口。 |
| S7-07-003 | 2026-07-23 | Medium | 已安装旧版本的 Service Worker 会把旧 manifest 缓存在同名 cache 中，升级后仍可能隐藏新的 PWA 图标与安装资格。 | 更新后应读取新 manifest；实际可继续得到旧 manifest。 | cache 升级为 v2，激活时删除 v1，并停止缓存 manifest。 | `pwa-manifest.test.ts` 断言 cache 版本和 manifest 不进入 App Shell 缓存；新包切换后在 Chrome 复核。 |
| S7-07-004 | 2026-07-24 | Medium | 桌面 PWA 在窗口变小时出现页面级纵向滚动，底部导航选中态会收缩为圆形。 | 应在一个窗口内展示完整界面，只有内容卡片可滚动，选中态始终是白色圆角矩形；实际页面可滚动且形态不稳定。 | 以 960 × 1600 设计画布等比适配桌面窗口，禁用外层滚动，并统一导航选中态的颜色、尺寸与圆角。 | Chromium Radio 视觉回归 8 项通过，含 desktop、tablet 与 mobile 基线。 |
| S7-07-005 | 2026-07-24 | Low | Radio 底部输入栏的语音与发送按钮在不同尺寸下形态不一致。 | 两个按钮应是统一的圆角正方形；实际语音按钮为圆形。 | 将语音与发送控件统一为固定圆角正方形，并更新响应式圆角。 | Chromium Radio 视觉回归 8 项通过。 |
| S7-07-006 | 2026-07-24 | Medium | 导入歌单后的 Library 列表和 Radio 正在播放卡片未展示歌曲专辑封面。 | 有可用封面时应展示，缺失时才使用占位样式；实际始终显示占位。 | 在 Provider、持久化与契约中保留封面 URL，并在 Library 与 Radio 使用该字段渲染。 | Library 组件、领域和 Provider 专项测试共 24 项通过。 |
| S7-07-007 | 2026-07-24 | High | 大歌单的详情响应只带部分 `tracks`，导入时仅保存已返回的少量歌曲。 | 应按完整 `trackIds` 保留所有可解析歌曲；不可播放歌曲应保留并标为不可播放；实际 400 首歌单仅导入 6 首。 | 对缺少的 ID 分批补拉歌曲详情，导入时保留完整曲目和可播放状态；不可播放歌曲禁用预览。 | 新增 Provider 补全回归；Library 领域、Provider 与组件专项测试共 24 项通过。 |
| S7-07-008 | 2026-07-24 | Low | 已安装 PWA 的应用图标内层品牌标记贴近边缘并被裁切。 | 图案应完整显示且保留安全留白；实际标记过大。 | 新增带安全边距的 SVG 源图，重生成 192 与 512 图标并为 manifest 图标 URL 增加版本标识。 | `pwa-manifest.test.ts` 验证 manifest、PNG 签名与精确像素尺寸。 |
| S7-07-009 | 2026-07-24 | Medium | 首次 PWA UI 修复仍会在 standalone 窄窗口落入 Mobile 媒体查询，造成页面放大/纵向滚动、输入按钮尺寸不一致；选中图标未稳定呈黑色，品牌标记亦未在图标画布正中。 | standalone 桌面 PWA 应始终完整显示 960 × 1600 画布，页面不滚动；两个输入按钮同尺寸、选中 Tab 图标纯黑、图标标记居中且缩小。 | 以 standalone + fine pointer 启用独立画布并覆盖窄窗口 Mobile 样式；统一输入变量、强化选中图标滤镜，按实际边界重算品牌标记变换并更新图标缓存版本。 | `desktop-canvas.test.ts`、Radio Chromium 视觉基线、PWA manifest 检查和本机包启动复验。 |
| S7-07-010 | 2026-07-25 | Medium | standalone 窄窗口的 Library、Taste、Settings 内容层仍按真实 `100dvh` 计算并显示滚动条；Settings 的内容区与固定操作区没有共同分配画布高度，产生大块空白。 | 页面、画布和浏览器窗口均无纵向滚动条；仅内容区可滚动且滚动条隐藏，Settings 操作区固定在导航上方并且全部字段可达。 | 在 `960 × 1600` 画布内为管理内容区配置固定滚动边界并隐藏滚动条；将 Settings 操作区移出可滚动表单并通过原生 `form` 关联提交。 | Chromium 在 `560 × 600` standalone 下验证 Library / Taste / Settings / Radio，画布和文档无纵向溢出、内容可滚动、滚动条隐藏；`0.0.10` arm64 包启动、静态资源与 strict codesign 通过。 |
| S7-07-011 | 2026-07-30 | High | Launchpad 同时存在原生 launcher 与 Chrome PWA，且已安装原生包可能落后于仓库最新提交；用户无法判断哪个入口是最新版。 | 固定圆角品牌图标应是唯一入口；每次打开必须联网确认并自动更新，旧版、普通网页标签和未来新增图标都不得成为入口。 | 固定 `/Applications/Koradio.app`，由包内 updater 在独立缓存 checkout 中对可信 `origin/main` 执行 frozen build、包验证与原位替换；失败关闭，备份使用非 `.app` 后缀，Chrome 仅以 `--app` 打开。Chrome PWA 已通过自身卸载界面移除，不删除站点数据。 | `macos-update.test.ts` 4 项、Swift typecheck、完整质量门（90 unit、60 contract、93 integration、35 component、278 coverage tests 与 production build）和依赖审计通过；`0.0.133` arm64 包连续验证后 strict codesign 有效，metadata 精确绑定 `61f6d03`。固定 app 在线检查返回 `current`，关闭独立窗口后重开会刷新 updater `FETCH_HEAD` 且仍只有 1 个 launcher；Chrome 窗口无地址栏或普通标签，PWA app id/shim、Dock、LaunchAgent 与后台登录项均不存在，Applications 和 Launch Services 只登记固定 app，旧 `0.0.16` 仅以非 `.app` 备份保留。 |
| S7-07-012 | 2026-07-30 | High | 首次真实自动更新在候选构建和安装复制阶段分别被 Node 版本硬门与 strict codesign 拒绝；launcher 没有打开旧版，但无法完成原位替换。 | updater 应在 launcher 的最小环境中始终使用 bundled Node，并以保持 macOS bundle 封印的方式复制候选；失败 staging 不得留在 Applications。 | 构建 PATH 显式加入候选 `runtime/bin`；安装复制改用系统 `ditto`，复制或签名失败时清理 updater 自有 staging。此前失败 staging 已移动为非 `.app` 备份。 | 最小 `/usr/bin:/bin` PATH 下完整 arm64 构建使用 Node 24.18.0 并通过；完整质量门再次通过。`0.0.137` 修复包的 metadata 精确绑定 `87e9f33`，package verifier 与安装前后 strict codesign 通过；`0.0.133` 仅以非 `.app` 回滚副本保留。 |
| S7-07-014 | 2026-08-03 | Medium | Git 回退将固定 `/Applications/Koradio.app` 和构建源恢复为旧单层 `Koradio.icns`，Launchpad 再次显示直角黑色方块，图标尺寸大于 macOS 标准应用图标。 | 唯一 Launchpad 入口应显示带标准光学留白的圆角矩形 Koradio 品牌图标，并在后续自动更新中保持一致。 | 恢复透明安全边距 SVG：内容区约占 81% 画布，四角为透明；由 16～1024 px 的完整 10 层 iconset 生成 `KoradioAppIconPadded.icns`，保留 bundle ID `app.koradio.launcher`，包验证器强制校验图标资源名、身份和全部图层。 | 回退前截图复现旧直角方块；修复后以 `0.0.139` 启动前联网更新原位安装，package verifier、strict codesign、唯一登记与 Launchpad 标准尺寸圆角矩形图标实机复验通过。 |
| S7-09-001 | 2026-08-05 | High | 从版本化的 `Koradio-0.0.912-arm64.app` 直接启动时，更新前置检查只接受固定 `Koradio.app`，导致报错 `Updater application path is invalid`。 | 已验证的版本化个人预览包应能通过路径校验并执行更新前置检查；实际启动前即被拒绝。 | 更新 Electron `UpdatePreflight` 与 bundled updater，允许 `Koradio.app` 和 `Koradio-<semver>-arm64.app` 两种已验证 bundle 名称，同时保留固定安装路径作为唯一日常入口。 | Electron 桌面单元测试、`0.0.913` package/DMG verifier、strict codesign 与固定 `/Applications/Koradio.app` 正常启动、session bootstrap 均通过。 |
| S7-09-002 | 2026-08-05 | High | Electron 更新器在缓存 checkout 构建新包时，先静态解析 `@electron/packager`，依赖安装尚未执行；修复该问题后，已启用 Hardened Runtime 的包内 Node 又会拒绝加载缓存内原生 zip 模块。 | 更新器应先完成 frozen install，并用可加载缓存构建依赖的受控 Node 构建候选；实际依次以 `ERR_MODULE_NOT_FOUND` 和 Team ID 不一致终止且不打开产品。 | 打包器改在 frozen install 成功后动态加载；更新前置检查将包内 Node 复制到私有临时目录并以无 Hardened Runtime 的 ad-hoc 签名运行更新器，`update-macos.mjs` 继承该 `process.execPath` 执行构建与验证，产品运行时 Node 的签名策略不变。 | `macos-update.test.ts` 断言依赖安装顺序与 updater Node 传递；`desktop-shell.test.ts` 断言临时 Node 签名参数；真实更新器成功将 `/Applications/Koradio.app` 从 `0.0.913` 原位替换为 `0.0.147`（`97ec74b`），strict codesign、正常启动与 session bootstrap 均通过。 |
| S7-09-003 | 2026-08-06 | Medium | Electron 使用 `hiddenInset` 标题栏时，经过缩放的 Renderer 顶部栏 `drag` 区域实机命中不稳定，窗口内容可以正常交互但无法可靠拖动窗口。 | 顶部空白区域应可移动窗口，档案和主题按钮仍可点击；第一次修复在经过 CSS transform 的页面内容内声明拖拽区域，实机仍无法稳定命中。 | Electron canvas 增加位于未变换 viewport 层的顶部中央拖拽带，避开左侧品牌/红绿灯和右侧状态、档案、主题控件；保留控件 `no-drag` 规则，浏览器/PWA 不受影响。 | `desktop-canvas.test.ts` 7 项通过；`0.0.153` 包验证、strict codesign、正常启动、session bootstrap 通过；macOS 实机顶部中央拖动操作复验期间窗口短暂离开 CUA 可见状态，随后恢复可见。 |
| S7-09-005 | 2026-08-12 | High | 开发态 Local Service 占用首选端口 `49373` 且运行模式为 Live 时，Electron 只依据健康接口复用该服务，随后向其请求 `/radio` 得到 404。 | 正式桌面端只能复用同时提供同源 Renderer 的服务；API-only 开发服务必须被忽略，正式包应在可用备用端口启动自带服务。 | Service probe 在确认 `service=koradio` 与运行模式后，继续校验 `/radio` 为包含应用根节点的 HTML；不满足即不复用。 | `desktop-shell.test.ts` 覆盖可用 Renderer 与 API-only 开发服务；保持开发服务占用 `49373` 时，arm64 DMG package verifier、Electron smoke、strict codesign、Node/Python/runtime 与 Renderer 加载均通过。 |
| S7-07-015 | 2026-08-14 | Medium | `PLAY NEXT` 成功后在对话卡片显示红色状态文案；空节目时手动点下一首直接返回，未消费临时点播；Settings、Library 与 Taste 的部分终态反馈只写入页面内状态。 | 成功排队应保持对话干净；无节目和有节目都应一致优先消费 `PLAY NEXT`；保存或导入应有明确成功/失败提示。 | Audio Engine 在无 Program 时先消费 `queuedPreview`；Radio 仅保留失败关联错误；共享短时提示覆盖 Settings、Library 与 Taste 的高频保存/导入操作。 | 新增空节目手动下一首单元回归；完整 `pnpm check` 通过（138 unit、61 contract、107 integration、43 component），项目所有者验收通过。 |
| S7-09-006 | 2026-08-17 | Medium | 已安装应用的独立 updater cache 在候选包构建末段缺少 optional native dependency，导致自动更新失败并拒绝替换旧版。 | 可信远端更新应能完成候选构建与原位替换；实际固定入口安全保持旧版，未发生替换。 | 候选构建前，只删除更新器自有 checkout 的 `node_modules`，再使用应用随附 Corepack 的 pnpm 按 `--frozen-lockfile` 重建依赖，随后执行既有构建、验证与原位替换；不触及用户数据、工作区或应用备份。 | `macos-update.test.ts` 7 项通过；正式启动链路使用 ad-hoc 更新 Node，成功将 `0.0.185`（`5b7fb1b`）原位更新为 `0.0.187`（`0f17bd2`），metadata 精确匹配，替换后 strict codesign 和重新启动通过。 |
| S7-09-007 | 2026-08-21 | High | 直接以带 Hardened Runtime 的包内 Node 手工运行更新器时，候选构建无法加载缓存原生模块；同时 TTS helper 子进程未继承 Python bytecode 写入禁令，会在已签名 runtime 下创建 `.pyc` 并破坏 seal。 | 自动更新必须经 Electron 的更新前置链路使用临时 ad-hoc Node；TTS helper 必须保持 app bundle 只读，继续保持 lockfile、候选包验证与原位替换边界。 | 更新器缓存安装保留 `--frozen-lockfile` 并强制重建 optional dependency；Provider 环境白名单保留 `PYTHONDONTWRITEBYTECODE=1`；只删除 `~/Library/Caches/Koradio/Updater/source/node_modules`，不触及工作区、模型、用户数据或应用备份。 | `macos-update.test.ts` 7 项与 Provider 环境单测通过；从 `/Applications/Koradio.app` 正常启动后，以临时 ad-hoc Node 成功构建、严格校验并原位替换为 `0.0.202`（`ca11abb`）。DeepSeek Flash 完整节目与 Qwen DJ 语音生成后，strict codesign 仍通过。 |

## 6. 完成前复核

- [ ] 样本达到 7 个连续自然日、10 次启动/退出、20 次真实生成和 8 小时播放。
- [ ] 第 4 节的每条关键路径至少有一次有效样本。
- [ ] 每个缺陷都有影响等级、脱敏复现、修复或保留结论；无未处理 Blocker / Critical。
- [ ] 缺陷修复均包含修复前复现与修复后专项回归。
- [ ] `pnpm check`、`pnpm audit:dependencies`、适用 E2E/视觉检查、安装包验证和 `git diff --check` 通过。
- [ ] 用户数据、旧目录和备份未被自动删除。
