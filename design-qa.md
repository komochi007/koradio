# Design QA｜VDA-11 Light 管理页 09–15

> 日期：2026-07-14
> 结果：passed

## 范围与方法

- 视觉主源：`design/assets/prototype/` 中的 HTML / CSS / JavaScript。
- 对照源：`design/references/09–15` 原始 PNG；参考图均为 Dark，因此只用于结构、密度、组件层级和未被规范覆盖的观感，不作为 Light 配色基线。
- 固定条件：`960 × 1600px`、`theme=light`、Prototype viewport、Reduce Motion。
- 浏览器：本机 Chrome `150.0.7871.115` 与临时只读静态服务；临时地址不是产品端口。

## 结果

- 09–15 的 27 个固定变体均渲染为 `960 × 1600px`，7 张参考图资源全部以 `971 × 1619px` 成功加载，无控制台、运行时或资源错误，无画布溢出。
- 每个变体的 Dark / Light 可见 DOM 数量、节点顺序和矩形几何一致，最大坐标与尺寸差为 `0px`。
- 页面内可用控件最小命中尺寸为 `44px`；11 的 Focus 状态继续使用规范绿色边框与软环，未改变字段语义。
- Light 主要 / 次要文字对页面背景为 `15.99:1` / `5.27:1`，对 Surface 为 `17.60:1` / `5.80:1`，主要按钮文字为 `17.24:1`。
- 加深错误文字对页面背景和 Surface 分别为 `5.21:1` / `5.73:1`；Accent、Warning 与 Information 状态点 / Focus 图形对 Surface 分别为 `3.44:1`、`3.91:1`、`4.29:1`。
- 未发现 P0、P1 或 P2 可见差异；未新增 A / B 级差异。

## C 级裁决

- 09–15 Light 环境光统一改用主题变量，避免继承 Dark Accent 色值；Dark 保持原取值。
- 成功 / 警告色保留在状态点、图标和边框，小号状态文字使用 Secondary；错误文字使用 Error 与 Text Primary 的主题混合色加深。
- 固定封面裁切、极弱阴影、分割线和字体抗锯齿继续按 C-001 / C-002 / C-005 处理，不逐像素复制 PNG。

## 证据与后续边界

- 逐页 Light QA 图：`design/assets/reports/evidence/vda-11-light-09-library.png` 至 `vda-11-light-15-settings-diagnostics.png`。
- 汇总图：`design/assets/reports/evidence/vda-11-light-contact.png`。
- PNG / Light 并排对照：`design/assets/reports/evidence/vda-11-light-comparison.png`。
- 以上均为 VDA-11 自动验收派生产物，不是 VDA-14 正式截图基线。
- 响应式、完整键盘 / 200% zoom / 无障碍与正式截图基线不在 VDA-11 范围。
