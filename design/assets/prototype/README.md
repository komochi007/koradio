# Koradio HTML 视觉原型

> 当前范围：VDA-17 冻结 HTML 主源、15 页 35 个固定状态、Dark / Light、五类响应式布局、60 张正式基线与开发交接映射
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

VDA-12 使用 03、05、08、10、14 分别代表 Profile、Radio、Detail、Management、Settings 布局族。响应式 viewport 不复制页面 fixture：页面保留同一 DOM、内容层级与主题变量，只切换安全边距、滚动边界、固定区域和必要的单列重排。Mobile 的导航、顶部工具和强调控件按共享比例收敛，但命中区不小于 `44 × 44px`；Tablet 与 Desktop 保持各布局族最大内容列，Radio 在宽屏仍为中央单列。

VDA-13 为共享控件和页面补齐 Hover、Active、Focus、Disabled、Loading、Error 与键盘路径。主导航支持左右方向键、Home、End；页面切换后焦点进入主标题，Library 支持 `⌘/Ctrl+K` 聚焦搜索；Detail Sheet 使用 Modal 焦点循环、Escape 关闭和焦点回收。页面、Detail 和波形动效遵循 Reduce Motion，状态变化通过明确文字和 live region 同步，不只依赖颜色。

VDA-14 已从本目录主源派生 60 张正式 PNG，存放于 `../baselines/`；生成与复渲染验证入口为 `../scripts/vda-14-baselines.cjs`。基线只用于视觉回归，不反向定义组件尺寸。

页面元数据与主要展示内容来自 `../fixtures/pages.js`；部分变体专属状态文案固定在 `app.js` 的 renderer helper。两者均只用于视觉定位，不代表真实领域数据、服务响应、产品端口、本地路径或默认配置。完整页面—状态—组件—token—fixture—基线映射见 `../reports/handoff-map.md`。

共享设计资产入口：

```text
catalog.html?theme=dark
catalog.html?theme=light
```

- `tokens.css`：Light / Dark 主题、排版、间距、圆角、组件尺寸、内容列和动效 Tokens。
- `components.css`：品牌、顶部工具、导航、按钮、输入、卡片、状态、媒体、队列、播放器、交互状态和 Focus 基准组件。
- `catalog.html`、`catalog.css`、`catalog.js`：零构建组件目录与主题预览，不是产品页面。
- `../icons/koradio-brand-mark.svg` 与 `../icons/tab-*.svg`：品牌和五个 Tab 的原型 SVG 图形主源；组件只按规范等比例缩放，不修改路径与描边细节。

## 边界

- 不包含产品框架、包管理器或生产配置。
- 不连接 Backend、Provider 或数据库。
- 不模拟真实播放、生成、配置保存或健康检查。
- Radio 心形按钮的业务语义是“喜欢歌曲”，不喜欢位于 More；节目收藏只位于 Programs/节目入口。ARIA 文案遵循该语义，但不改变 VDA-17 像素外观。
- 01–03 已由 VDA-03、04–06 已由 VDA-04、07–08 已由 VDA-05、09 已由 VDA-06、10–11 已由 VDA-07、12–13 已由 VDA-08、14–15 已由 VDA-09 建立 Dark HTML 视觉页面；Library 的五种、Taste 的七种、Programs 的八种和 Settings 的七种固定变体均已通过对应验收。
- Tokens 与共享组件已由 VDA-02 建立，尺度补正和核心体验确认门均已通过；01–15 已完成 Light 独立材质校准，07–08 继续使用不随主题反转的 Detail 专属色面。03、05、08、10、14 已建立三组 viewport 的响应式代表布局；完整交互与无障碍资产已由 VDA-13 补齐，60 张正式基线与视觉 QA 已由 VDA-14 完成，Figma 派生镜像由 VDA-15 完成，开发交接映射与整体视觉冻结门由 VDA-16 完成。
