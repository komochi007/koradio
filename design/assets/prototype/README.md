# Koradio HTML 视觉原型

> 当前范围：VDA-01 HTML 原型骨架 + VDA-02 Tokens 与共享组件目录 + VDA-03 异常与 Profile 01–03 + VDA-04 Radio 三态 04–06 + 已验收的 VDA-02–04 尺度补正
>
> 性质：零构建、非生产的开发前视觉设计资产预览

## 使用方式

直接在浏览器中打开 `index.html`。页面会把当前选择规范化为以下查询参数：

```text
?page=05-radio-playing&theme=dark&viewport=prototype
```

- `page`：01–15 中唯一的页面状态 ID。
- `theme`：`dark`、`light` 或 `system`。
- `viewport`：`prototype`、`mobile`、`tablet` 或 `desktop`。

预览区提供 `Fit / 1:1` 切换和实时缩放百分比。`1:1` 固定为 `100%` 并允许滚动；`Fit` 会随预览容器变化重新计算。参考图叠图与透明度控制只在 `prototype · 960 × 1600` 视口启用，参考 PNG 会从 `971 × 1619px` 归一化覆盖到画布，其它视口会明确禁用。

所有展示数据来自 `../fixtures/pages.js`，固定且只用于视觉定位。

共享设计资产入口：

```text
catalog.html?theme=dark
catalog.html?theme=light
```

- `tokens.css`：Light / Dark 主题、排版、间距、圆角、组件尺寸、内容列和动效 Tokens。
- `components.css`：品牌、顶部工具、导航、按钮、输入、卡片、状态、媒体、队列、播放器和 Focus 基准组件。
- `catalog.html`、`catalog.css`、`catalog.js`：零构建组件目录与主题预览，不是产品页面。
- `../icons/koradio-brand-mark.svg` 与 `../icons/tab-*.svg`：品牌和五个 Tab 的原型 SVG 图形主源；组件只按规范等比例缩放，不修改路径与描边细节。

## 边界

- 不包含产品框架、包管理器或生产配置。
- 不连接 Backend、Provider 或数据库。
- 不模拟真实播放、生成、配置保存或健康检查。
- 01–03 已由 VDA-03、04–06 已由 VDA-04 建立 Dark HTML 视觉页面，并完成本次尺度补正；07–15 仍是 VDA-01 定位占位。
- Tokens 与共享组件已由 VDA-02 建立，尺度补正已通过用户视觉验收，VDA-05 可开始。Light 校准、响应式规则、正式基线截图与其余页面族仍由后续任务建立。
