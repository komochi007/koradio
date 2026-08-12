# UX-12 核心体验与视觉优化验收

> Status: Accepted
> Date: 2026-08-12
> Owner: 项目所有者 / 当前工作区

## 结果

UX-12 的六个工作包已完成并由项目所有者在隔离 Live Electron 环境中验收通过。

- 全局错误以可关闭的居中卡片呈现；Settings 使用自定义下拉和受控 Key 编辑流程。
- Profile 支持用户与 DJ 独立头像、裁图和受控同源读取；Radio 对话使用双头像与区分气泡。
- 常规 DJ 对话不再出现语音按钮；已播串讲保留并提供 `REPLAY` / `PLAYING` 状态。
- Detail 使用歌词原文、过滤元信息、真实 LRC/YRC 时间；YRC 以逐词平滑渐变高亮，LRC 保持整行真实时间高亮；首尾滚动区域提供安全留白与渐隐。
- 音乐播放使用真实 Web Audio 波形采样、短期 URL 刷新与一次当前曲目恢复；推荐默认过滤替代版本。

## 验证证据

| 检查 | 结果 |
| --- | --- |
| `pnpm check` | 通过；coverage 334 tests，Audio 分支覆盖率 90.02% |
| `pnpm audit:dependencies` | 通过 High 阻断阈值与生产许可证审计 |
| `KORADIO_E2E_PORT=49374 pnpm test:e2e` | 117 passed、78 declared skipped、0 failed |
| `KORADIO_E2E_PORT=49374 pnpm test:visual` | 1 passed |
| 隔离 Live Electron | 项目所有者人工验收通过；服务、Renderer 与桌面窗口均使用隔离数据根和 Live Provider |

审计仍报告 `postcss@8.5.19` 的一个 Moderate 开发依赖告警；没有 High 或 Critical 告警，且该链路不进入生产包。

## 隔离边界

验收使用独立数据目录 `/tmp/koradio-ux12-live.iHvSW0` 和 Live Provider。正式用户数据、Keychain 密钥、历史节目与旧头像文件均未读取或修改。该目录、相关进程、诊断产物和 Playwright 临时结果将在本任务提交并推送后清理。
