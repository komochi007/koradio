# Koradio 视觉设计资产契约

> Status: Planned · 尚未开始资产制作  
> Scope: 正式前端开发前的视觉设计资产  
> Task source: [视觉设计资产任务清单](../tasks/visual-assets.md)  
> UI authority: [视觉设计系统规范](../design.md)

## 1. 目的与边界

本目录用于管理从已确认原型图到可交付设计资产的稳定契约、资产索引和验收证据。

目标交付物包括：

- 15 张 Dark 与 15 张 Light 的 `960 × 1600px` Figma 页面。
- 与 Figma 同源的 HTML/CSS/JS 视觉原型，支持关键流程点击演示。
- Figma Variables、Components、Variants 与真实图片、图标素材。
- Dark 参考基线、页面截图、叠层图、差异记录和开发映射。

本阶段不包含：

- 正式 React 页面、业务组件或 `packages/design-tokens` 实现。
- API、持久化、Audio Engine、真实 Provider 或业务状态管理。
- Mobile、Tablet 或其它桌面视口设计。
- 包管理器、产品运行命令和工程脚手架决策。

## 2. 当前事实

- 已确认的 15 张 Dark 原型位于 [`design/references/`](../references/)。
- 原始图片实际尺寸均为 `971 × 1619px`，不得覆盖或删除。
- 权威原型画布为 `960 × 1600px`；归一化基线尚未生成。
- Light 页面、Figma 文件、HTML 原型、组件库和 QA 证据尚不存在。
- 仓库仍处于 Documentation-first 阶段，尚无产品源码或构建工具。

## 3. 来源与裁决顺序

设计资产采用按 Concern 分层的混合裁决：

| Concern | Authority | 裁决规则 |
|---|---|---|
| 整体构图、视觉比例、密度、明暗层级与观感 | 已确认原型图 | Dark 页面优先匹配归一化原型基线 |
| Token、公共组件、主题、动效与无障碍 | [`design/design.md`](../design.md) | 跨页面一致性高于生图产生的局部随机差异 |
| 文案、字段、状态语义与产品验收 | [`docs/prd.md`](../../docs/prd.md) | 不从图片猜测业务规则 |
| 操作路径与异常分支 | [`docs/user-flow.md`](../../docs/user-flow.md) | HTML 关键流程必须与用户流一致 |
| 原型生成背景 | [`design/prompt.md`](../prompt.md) | 只作为辅助资料，不覆盖已确认原型与权威规则 |

以下情况不得直接固化为组件规范：

- 生图导致的尺寸漂移、椭圆头像、非等比封面或图标变体。
- 错字、缺字、乱码和不符合 PRD 的状态词。
- 只在单页出现且没有设计依据的颜色、间距、圆角或控件。
- 与键盘操作、Focus、命中区、对比度或 Reduce Motion 冲突的表现。

若规范修正会明显改变已确认原型的整体观感，任务进入 `Review`，由用户确认后再继续。

## 4. 参考图归一化

`VDA-001` 必须：

1. 保留 `design/references/` 下全部原始图片。
2. 使用高质量重采样生成 `960 × 1600px` Dark 基线，不修改原图。
3. 在资产清单记录原始尺寸、目标尺寸、文件摘要和处理方式。
4. 使用归一化结果进行 Figma 与 HTML 的同视口比较。

归一化只解决画布尺寸差异，不得顺便修图、改文案或重排版。原型中的问题由 `VDA-002` 登记后按裁决规则处理。

## 5. 目标资产结构

以下路径均为计划结构，只有对应 VDA 任务完成后才可视为真实资产：

```text
design/
├── assets/
│   ├── README.md
│   ├── manifest.json
│   ├── baselines/
│   │   ├── dark/
│   │   └── light/
│   ├── exports/
│   │   ├── figma/
│   │   └── html/
│   ├── comparisons/
│   └── source-assets/
├── prototype/
│   ├── index.html
│   ├── styles/
│   ├── scripts/
│   └── assets/
└── tasks/
    └── visual-assets.md
```

Figma 文件是仓库外资产。创建后必须把文件链接、页面结构和最近验收版本记录到 `manifest.json` 与本文件，不能只依赖聊天记录。

## 6. 命名接口

### 6.1 Screen ID

Screen ID 与参考图文件名保持一致：

```text
01-service-offline
02-profile-select
03-profile-create
04-radio-empty
05-radio-playing
06-radio-generating
07-radio-detail-speaking
08-radio-detail-lyrics
09-library
10-taste-overview
11-taste-edit
12-programs-list
13-program-detail
14-settings-config
15-settings-diagnostics
```

主题值只允许：

```text
dark | light
```

Figma 页面帧统一命名为：

```text
Screen / <screen-id> / <theme>
```

组件与变量统一使用：

```text
Component / <family> / <name>
Variable / <category> / <semantic-name>
```

HTML 原型必须能通过 `screen-id + theme` 唯一定位页面状态；具体导航实现由 `VDA-003` 固化，但不得引入正式产品路由或 API contract。

## 7. 单任务交付规则

每项页面或组件任务必须同时交付：

- 可编辑 Figma 结构。
- 对应 HTML 实现。
- `960 × 1600px` 同视口截图。
- 参考图与实现图的并排图、半透明叠层图和差异记录。
- 在 [VDA 主清单](../tasks/visual-assets.md) 中更新状态与证据链接。

单次任务边界：

- 一个 token 或素材主题。
- 一个公共组件族。
- 一个复杂页面状态。
- 最多三个结构相近的简单页面。
- Radio 04/05/06 分开制作，再单独执行一致性验收。

## 8. 验收门禁

- 所有页面画布为 `960 × 1600px`。
- Dark 页面与归一化基线比较；固定 slot 和组件边缘误差不超过 `4px`。
- Light 页面复用同一结构和组件实例，只使用 Light variables 改变主题表现。
- Figma 页面使用 Variables、Auto Layout、Component Instances 和 Variants，不以整页截图充当交付。
- HTML 原型只使用 mock 数据，不连接 API，不实现持久化和真实播放。
- 主流程可点击，支持键盘操作、可见 Focus、44 × 44px 最小命中区和 Reduce Motion。
- 文案、状态词和恢复入口符合 PRD 与用户流。
- 30 张页面、3 组关键流程和最终 QA 任务全部为 `Done` 后，才能进入正式前端开发。

