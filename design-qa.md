# Design QA｜VDA-10 Light 核心页 01–08

> 日期：2026-07-14
> 结果：passed

## 范围与方法

- 视觉主源：`design/assets/prototype/` 中的 HTML / CSS / JavaScript。
- 对照源：`design/references/01–08` 原始 PNG；参考图均为 Dark，因此只用于结构、密度、组件层级和未被规范覆盖的观感，不作为 Light 配色基线。
- 固定条件：`960 × 1600px`、`theme=light`、Prototype viewport、Reduce Motion。
- 浏览器：内置浏览器连接与运行时修复均失败后，按用户确认的备用链路使用本机 Chrome 150 的临时只读静态服务；临时地址不是产品端口。

## 结果

- 01–08 均渲染为 `960 × 1600px`，参考图资源全部成功加载，无控制台或资源错误，无画布溢出。
- 每页 Dark / Light 的可见 DOM 数量、节点顺序和矩形几何一致，最大坐标与尺寸差为 `0px`。
- 页面内可用控件最小命中尺寸为 `48px`；03 的 Focus 状态继续使用规范绿色边框与软环，未改变字段语义。
- Light 主要文字 / 页面背景为 `15.99:1`，次要文字 / 页面背景为 `5.27:1`，主要按钮文字为 `17.24:1`。
- Detail 固定节目面保持 `#090A0C / #FFFFFF / #F5F3F6`；标题 / 白色节目面为 `18.11:1`，次要文字 / 白色节目面为 `4.78:1`，当前正文 / 内容卡为 `16.42:1`。
- 未发现 P0、P1 或 P2 可见差异；未新增 A / B 级差异。

## C 级裁决

- Light 核心页环境光改用 Light Accent 的低透明度变量，避免沿用 Dark Accent 色值；只作用于 01–08 页面族，不提前校准 09–15。
- Radio 卡片与对话表面的弱渐变改用主题表面辉光变量：Light 使用低透明度深色薄层，Dark 保持原有白色薄层。
- Detail 随机波形柱高、纸面颗粒、字体抗锯齿与原 PNG 的微小差异继续按 C-003 / C-005 处理，不逐像素复制。

## 证据与后续边界

- 逐页 Light QA 图：`design/assets/reports/evidence/vda-10-light-01-service-offline.png` 至 `vda-10-light-08-radio-detail-lyrics.png`。
- 汇总图：`design/assets/reports/evidence/vda-10-light-contact.png`。
- PNG / Light 并排对照：`design/assets/reports/evidence/vda-10-light-comparison.png`。
- 以上均为 VDA-10 自动验收派生产物，不是 VDA-14 正式截图基线。
- 已知 Detail 已读文本 `#A8A7A1` 在 `#F5F3F6` 上为 `2.19:1`；该颜色来自明确规范，按既有记录留给 VDA-13 的完整无障碍裁决，本任务未静默改色。
- 09–15 Light、响应式、完整键盘 / 200% zoom / 无障碍与正式截图基线不在 VDA-10 范围。
