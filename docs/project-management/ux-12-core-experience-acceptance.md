# UX-12 核心体验与视觉优化验收

> Status: Accepted
> Date: 2026-08-12
> Owner: 项目所有者 / 当前工作区

## 结果

UX-12 的六个工作包及后续点播、推荐与播放同步收口已完成，并由项目所有者在桌面 Live 环境中验收通过。

- 全局错误以可关闭的居中卡片呈现；Settings 使用自定义下拉和受控 Key 编辑流程。
- Profile 支持用户与 DJ 独立头像、裁图和受控同源读取；Radio 对话使用双头像与区分气泡。
- 常规 DJ 对话不再出现语音按钮；已播串讲保留并提供 `REPLAY` / `PLAYING` 状态。
- Detail 使用歌词原文、过滤元信息、真实 LRC/YRC 时间；YRC 以逐词平滑渐变高亮，LRC 保持整行真实时间高亮；首尾滚动区域提供安全留白与渐隐。
- 音乐播放使用真实 Web Audio 波形采样、短期 URL 刷新与一次当前曲目恢复；推荐默认过滤替代版本。
- Audio Engine 的播放快照是 Radio 与 Detail 的唯一实时展示来源；页面往返不会用服务端节目覆盖当前歌曲、临时点播或播放位置。
- 单曲和最多 5 首策展卡片支持 `PLAY NOW` / `PLAY NEXT` 临时 DJ 点播；播放器、队列、Detail、歌词、波形和暂停恢复均保持同一首点播歌曲，播放结束后恢复原节目位置；无节目时手动下一首同样优先播放 `PLAY NEXT`，成功排队不在对话中插入红色状态文案。
- 歌词当前行采用平滑滚动、颜色/透明度/缩放过渡并尊重 `prefers-reduced-motion`；最小 Electron 窗口下的长行会换行且保留缩放安全宽度。串讲优先按自然短句分行。
- Radio 可操作控件具有手型光标、Hover、Active 和键盘 Focus 反馈；3～5 首推荐默认返回策展卡片，明确节目、歌单或 8～12 首请求才生成完整节目。
- Settings 配置、媒体库导入/加入候选池与 Taste 保存均在终态显示可关闭、自动消失的成功或失败提示，不再只依赖页面内隐藏或易遗漏的状态文案。

## 验证证据

| 检查 | 结果 |
| --- | --- |
| 受影响单元、集成与组件测试 | 通过；覆盖跨页面同步、点播展示/恢复、下一首点播、无节目点播、多首推荐、不可播放降级、自然分句与歌词状态 |
| `pnpm exec vitest run` | 61 files / 340 tests 通过 |
| `pnpm -s typecheck && pnpm -s lint && pnpm -s format:check && git diff --check` | 通过 |
| `pnpm audit:dependencies` | 通过 High 阻断阈值与生产许可证审计 |
| `KORADIO_E2E_PORT=49374 pnpm test:e2e` | 117 passed、78 declared skipped、0 failed |
| `KORADIO_E2E_PORT=49374 pnpm test:visual` | 1 passed |
| 桌面 Live Electron | 项目所有者人工验收通过；覆盖页面往返、Detail 歌词/串讲、Radio 控件反馈、点播同步、暂停恢复、波形与策展卡片 |

审计仍报告 `postcss@8.5.19` 的一个 Moderate 开发依赖告警；没有 High 或 Critical 告警，且该链路不进入生产包。

## 临时文件

本轮只清理由验证命令生成的临时测试目录；不清理用户数据、Profile 对话、Keychain 密钥、历史节目、已安装应用或正在运行的开发服务。
