# S7-09 Electron UI 优化验收记录

> Date: 2026-08-06<br>
> Scope: Electron 桌面窗口、Radio、Library、Taste、Programs 与全屏 Detail Sheet<br>
> Result: 项目所有者人工验收通过；S7-07 七日稳定性门已于 2026-08-30 完成

## 1. 验收范围

本轮只优化 Electron 桌面界面的尺寸、间距、滚动边界和窗口适配，不改变既有视觉风格、Radio 信息层级、Tab 选中态或业务协议。主要交付包括：

- Electron 窗口最小尺寸限制为 `430 × 652px`，原生 macOS 窗口按钮不再与品牌信息重叠。
- 日常紧凑窗口固定已验收的内容比例；继续缩窄时只减少外侧留白，不再缩小组件、正文或改变布局。
- Radio 页面外层禁止纵向滚动；队列和 DJ 对话框独立滚动并隐藏滚动条，DJ 对话区增加可读高度。
- 品牌图标与 Radio 内容区左边缘对齐，在所有窗口宽度保持同一对齐逻辑。
- Library、Taste、Programs 删除主标题下的说明小字；Programs 标题到内容区间距与其他管理页一致。
- Library 内容层允许整体滚动，本地音乐列表仍在自身卡片内独立滚动，不再使用“加载更多”。
- Detail Sheet 挂载到窗口根节点，覆盖完整物理窗口；白色节目面左右无外边距。
- 歌词与 DJ 串讲按播放位置逐字高亮；缺少真实逐字时间戳时按文字长度估算，中文逐字、英文逐词、标点跟随前一个单位。

## 2. 窗口变化规则

| 状态 | 规则 |
|---|---|
| 普通浏览器与手机 | 保留原有响应式阅读布局 |
| standalone PWA | 保留 `960 × 1600px` 等比画布行为 |
| Electron 常规窗口 | 在可用空间中保持既有单列结构，不增加侧栏或第二列 |
| Electron 日常紧凑窗口 | 使用 `900px` 逻辑参考宽度与 `0.425` 内容比例，组件、文字和内部布局保持不变 |
| 继续缩窄至最小窗口 | 优先收敛外侧留白；不得压缩正文、隐藏组件或启用页面外层滚动 |

## 3. 实现与回归边界

- `apps/desktop/src/window-policy.ts` 与 `apps/desktop/src/main.ts` 负责窗口最小尺寸和 Electron 内容尺寸策略。
- `apps/web/src/app/desktop-canvas.*` 负责 Electron 紧凑参考比例、视口逻辑尺寸和原生标题栏安全距离。
- `apps/web/src/features/radio/` 负责 Radio 固定 rail、内部滚动、品牌对齐、Detail 根节点覆盖和逐字高亮。
- `apps/web/src/features/library/`、`taste/` 与 `programs/` 负责管理页尺寸、标题节奏和内部滚动边界。
- REST/WS v1、Audio Engine、Session、Provider、数据库与用户数据格式保持不变。

## 4. 验证结果

- 完整 `pnpm check` 通过，覆盖 unit、contract、integration、component、coverage 与 production build。
- Electron 最小窗口与紧凑参考窗口人工检查通过：品牌/内容区对齐、原生按钮避让、Radio 全内容可见、DJ 正文不缩小、卡片内部滚动和底部导航均符合要求。
- Detail Sheet 人工检查通过：覆盖完整窗口，白色节目面左右外边距为 `0`，歌词/DJ 文本可换行且逐字高亮。
- Library 与 Programs 专项组件、E2E 和截图回归通过。
- 项目所有者于 2026-08-06 明确确认验收通过。

## 5. 关闭结论

本记录先行关闭了 S7-09 的 Electron UI 优化子范围；随后 S7-07 要求的连续七日、启动/退出次数、真实节目生成次数和累计播放时长也已满足。S7-09 总任务的最终结论见 [S7-09 Electron 桌面外壳验收记录](s7-09-electron-shell-acceptance.md)。
