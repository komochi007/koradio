# Koradio HTML 视觉原型

> 当前范围：VDA-01 HTML 原型骨架 + VDA-02 Tokens 与共享组件目录 + VDA-03 异常与 Profile 01–03 + VDA-04 Radio 三态 04–06 + VDA-05 Detail Sheet 07–08 + VDA-06 Library 09 + VDA-07 Taste 10–11 + VDA-08 Programs 12–13 + VDA-09 Settings 14–15 + 已验收的尺度与核心体验确认门
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
- `variant`：仅在页面族定义了固定视觉变体时出现；Library 09 支持 `results`、`importing`、`empty`、`no-results`、`service-error`；Taste 10 支持 `formed`、`loading`、`empty`、`load-error`，Taste 11 支持 `editing`、`saving`、`save-error`；Programs 12 支持 `list`、`loading`、`empty`、`load-error`，Program 13 支持 `detail`、`replaying`、`tts-missing`、`reuse-error`；Settings 14 支持 `configured`、`detecting`、`incomplete`、`save-error`，Settings 15 支持 `degraded`、`available`、`core-error`。

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
- 01–03 已由 VDA-03、04–06 已由 VDA-04、07–08 已由 VDA-05、09 已由 VDA-06、10–11 已由 VDA-07、12–13 已由 VDA-08、14–15 已由 VDA-09 建立 Dark HTML 视觉页面；Library 的五种、Taste 的七种、Programs 的八种和 Settings 的七种固定变体均已通过对应验收。
- Tokens 与共享组件已由 VDA-02 建立，尺度补正和核心体验确认门均已通过。Light 校准、响应式规则、正式基线截图与其余页面族仍由后续任务建立。
