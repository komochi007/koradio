# S7-09 Electron 桌面外壳最终验收记录

> Task: `S7-09`<br>
> Date: 2026-08-30<br>
> Result: 已完成<br>
> Scope: macOS 15+ arm64、项目所有者本机正式版；不授权外部分发。

## 1. 最终结论

Koradio 已完成从 Native Launcher + 外部浏览器窗口到 Electron 主进程 + 既有 Web Renderer 的迁移。固定 `/Applications/Koradio.app` 是唯一日常入口；启动前从可信 `origin/main` 执行 fail-closed 更新检查，应用内 Local Service、Renderer、Qwen3-TTS runtime、Provider、Audio Engine、Session、REST/WS 与既有用户数据边界保持不变。

S7-07 已完成连续 7 个自然日、10 次正常启动并退出、至少 20 次真实节目生成和累计至少 8 小时播放。S7-09 的自动化、包装、实机 UI、真实 Provider 与稳定性关闭门均已满足，因此任务状态为“已完成”。

## 2. 已验收范围

- Electron 单实例、启动状态页、服务探测/启动/停止、窗口导航与权限安全策略。
- macOS arm64 app 包装、bundled Node/Python/MLX/Qwen helper、strict codesign、package verifier 与更新回滚。
- 最小 `430 × 652px`、紧凑窗口内容比例、内部滚动、品牌对齐、Detail 全窗口覆盖、歌词和 DJ 串讲显示。
- 正常启动前可信远端检查、独立 updater checkout、frozen install、精确提交构建和固定路径替换。
- DeepSeek Flash 完整节目与 Qwen DJ 语音的受控真实生成；该证据只证明验收时可用，不承诺第三方服务永久可用。
- 用户数据、Keychain、Updater 缓存、回滚备份和开发依赖保留；收尾不改变产品功能、设计、体验或持久化格式。

## 3. 证据索引

- [S7-07 本机稳定性试用与缺陷收口](s7-07-local-stability-acceptance.md)
- [S7-09 Electron UI 优化验收](s7-09-electron-ui-optimization-acceptance.md)
- [S7-09-004 歌词、封面与启动体验验收](s7-09-004-ux-acceptance.md)
- [ADR 0006：Electron 桌面外壳](../adr/0006-electron-desktop-shell.md)
- [安装、自动更新与恢复](../runbooks/install-and-recovery.md)
- [版本管理规范](version-management.md)

## 4. 保留边界

当前 `v1.0.0` 是项目所有者本机正式版，不是公开发行版。S7-03、S7-04、S7-05、S8 和 S9 中涉及外部 Beta、Developer ID、公证、Gatekeeper、Provider 公开分发合规、独立干净 Mac、公开下载与发布稳定期的事项保持待开始，必须获得新的明确授权后执行。
