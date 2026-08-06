# S7-09-004 歌词、封面与启动体验验收记录

> Date: 2026-08-06<br>
> Scope: Electron Detail Sheet、歌词高亮、NetEase artwork、启动状态窗口与服务探测<br>
> Result: 实现、自动化质量门、Electron smoke 与本机紧凑窗口检查已完成，等待项目所有者验收与 arm64 包验证

## 1. 问题与处理

| 问题 | 处理结论 |
|---|---|
| Detail Sheet 偶发上移、底部空白 | Electron Detail portal 脱离全局缩放画布，直接使用实际 viewport；节目面按约 `25% / 75%` 分区并固定贴底 |
| 歌词仅单字高亮 | 增加 `played` 单位状态；当前句已播放字符保持主文本颜色，句末整句变为 `read` |
| 歌词贴近卡片边界 | 歌词容器增加上下 padding 与 `scroll-padding`，当前行滚动只作用于容器自身 |
| 最小窗口文字过小及 Detail 视觉失衡 | Electron 最小窗口增加标题、普通歌词和当前歌词字号下限；收敛关闭/播放按钮与底部节目进度，为歌词卡片保留更多高度；状态行与节目标题左对齐并避让原生按钮和声场；波形柱延续到节目面下方，由节目面层叠自然填满两侧圆角空隙 |
| 专辑封面破图 | NetEase artwork HTTP 地址规范化为 HTTPS；图片失败时保留现有中性占位背景 |
| 启动窗口出现过慢 | `app.whenReady()` 后先显示本地状态页；更新和 Local Service 健康检查完成后才加载产品页 |
| 端口探测耗时 | `49373–49383` 候选端口并行探测，仍按最低有效端口选择 |

## 2. 代码与边界

- `TimedTextUnit` 增加内部 `played` 状态，未修改公共 REST/WS contract。
- artwork 规范化仅接受 HTTPS，或把 NetEase `music.126.net` HTTP 地址升级为 HTTPS；未放宽 Electron CSP。
- 持久化读取时兼容旧 artwork URL，不新增数据库 migration。
- 启动状态页为本地静态 data 页面，仅暴露私有重试协议；产品页仍只允许同源 loopback 路由。
- Radio、Library 的全局缩放策略和用户数据保持不变。

## 3. 已执行验证

- Detail timed text unit/component 定向测试通过。
- artwork URL、Provider、持久化读取和图片失败兜底定向测试通过。
- Electron desktop shell typecheck、并行端口探测和启动页测试通过。
- Node 24.18.0 / pnpm 11.13.0 下完整 `pnpm check` 通过：112 unit、60 contract、94 integration、37 component、303 coverage tests 与生产 build。
- Chromium Detail/Library E2E 17 项通过，包含 Dark/Light、移动/平板/桌面截图、`430 × 652px` Electron 紧凑布局、`960 × 1600px` Electron 顶部控制对齐和长歌词滚动；截图基线已同步累计高亮行为。
- Electron `--smoke` 通过，Renderer bootstrap 与 Local Service origin 校验通过；本机紧凑窗口人工检查确认 Detail 无外层漂移、底部黑色空白，波形/歌词约 `25% / 75%`。
- `pnpm audit:dependencies` 通过 high 阻断阈值与许可证审计；安全审计仍有 1 个仅存在于开发依赖链的 PostCSS moderate advisory，未进入生产包。
- `git diff --check` 通过。

## 4. 待执行验收

- arm64 app/DMG 包验证；当前未覆盖包验证是因为最终提交和固定安装更新必须等项目所有者验收后执行。
- 真实 NetEase HTTP artwork、缺失 artwork、图片加载失败和启动失败重试验收。
- 项目所有者确认通过后，才提交 `S7-09-004`、推送 `origin/main`、更新固定 Koradio 安装并清理本轮明确生成的冗余产物。

## 5. 追加验收意见（2026-08-06）

- 波形最左、最右柱体继续向节目面下方延伸，与卡片圆角重叠，填满两侧空隙。
- 所有窗口尺寸下，状态行与关闭按钮保持同一水平控制带；状态行贴合左侧内容边缘，关闭按钮贴合右侧安全边缘。
- 宽窗口关闭按钮调整为 `56px`、播放按钮调整为 `48px`；最小窗口按钮可见圆形收敛为 `32px`，外层保留 `44px` 命中区，并释放空间给更长的节目进度波形。
- 本轮新增宽/窄 Electron 几何断言，并更新 Detail Dark/Light 与响应式截图基线；17 项 Chromium Detail/Library E2E 全部通过。
