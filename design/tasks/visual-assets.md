# Koradio 开发前视觉设计资产任务清单

> Workstream: `VDA` · Visual Design Assets  
> Status: Planned · 全部任务尚未开始  
> Scope: `960 × 1600px` Desktop Dark / Light 设计资产  
> Asset contract: [视觉设计资产契约](../assets/README.md)

## 1. 使用方式

本文件是开发前视觉设计资产的唯一任务清单。它不记录正式前端、后端、API、数据库或工程脚手架任务。

后续正式开发任务使用独立的 `DEV-*` 编号和开发任务文档，不得混入本清单。`context.md` 只记录当前阶段与本文件入口，不同步每条任务的动态状态。

### 1.1 任务字段

每条任务必须维护以下字段：

| 字段 | 规则 |
|---|---|
| ID | 使用唯一 `VDA-*` 编号，编号完成后不得复用 |
| 状态 | 只允许 `Not Started`、`In Progress`、`Review`、`Blocked`、`Done` |
| 依赖 | 所有前置任务必须为 `Done` 才能开始 |
| 单次会话边界 | 限制一次对话中的页面数、组件族或验证范围 |
| 输入 | 指向原型、规范、PRD、用户流或上游资产 |
| Figma 产物 | 明确要创建或更新的 Figma 页面、变量、组件或证据 |
| HTML 产物 | 明确要创建或更新的 HTML 视觉原型资产 |
| 验收标准 | 当前任务独立可检查的完成条件 |
| 证据链接 | 任务完成后记录 Figma、截图、比较图或报告位置 |

### 1.2 状态流转

```text
Not Started → In Progress → Review → Done
                         ↘ Blocked
```

- 开始任务前检查依赖，只允许一项 VDA 任务处于 `In Progress`。
- 产物和验证证据齐全后进入 `Review`，不得直接标记 `Done`。
- 明显改变已确认原型观感的裁决必须停留在 `Review` 等待用户确认。
- 阻塞解除后回到 `In Progress`；不得用降低验收标准的方式解除阻塞。

### 1.3 通用完成条件

除纯治理任务外，每项组件或页面任务均需满足：

- Figma 与 HTML 使用相同 token、组件命名和页面内容。
- 页面截图使用 `960 × 1600px` 视口。
- 提供并排图、半透明叠层图和差异记录。
- 固定 slot 和组件边缘误差不超过 `4px`。
- Figma 结构可编辑，不使用整页截图作为页面主体。
- HTML 使用 mock 数据，不接 API、持久化或真实音频。
- 更新本表状态并补充证据链接。

## 2. A · 基线与治理

| ID | 状态 | 依赖 | 单次会话边界 | 输入 | Figma 产物 | HTML 产物 | 验收标准 | 证据链接 |
|---|---|---|---|---|---|---|---|---|
| `VDA-001` | Not Started | 无 | 只盘点与归一化 15 张图片 | `design/references/`、画布规范 | 无 | 无 | 原图不变；生成 15 张 `960 × 1600px` Dark 基线与完整 manifest | —（未开始） |
| `VDA-002` | Not Started | `VDA-001` | 一次只审查一个页面家族，最终汇总 | 基线、`design.md`、PRD、用户流 | 差异标注页 | 无 | 15 页差异均按视觉、系统、产品、流程分类并给出裁决状态 | —（未开始） |
| `VDA-003` | Not Started | `VDA-001`、`VDA-002` | 只确定命名、页签与目录接口 | 资产契约、差异登记 | 文件页签与命名骨架 | HTML screen/theme 定位骨架 | 15 个 screen ID、两种主题和资产路径唯一且无冲突 | —（未开始） |
| `VDA-004` | Not Started | `VDA-001`、`VDA-003` | 只建立 QA 模板，不审查页面 | 基线、命名接口、`4px` 规则 | QA 证据页模板 | 截图与比较输出约定 | 模板包含参考图、Figma、HTML、并排、叠层、差异和结论 | —（未开始） |

## 3. B · Token 与素材

| ID | 状态 | 依赖 | 单次会话边界 | 输入 | Figma 产物 | HTML 产物 | 验收标准 | 证据链接 |
|---|---|---|---|---|---|---|---|---|
| `VDA-101` | Not Started | `VDA-002`、`VDA-003` | 只处理语义颜色与主题映射 | `design.md` 色彩与 CSS Variables | Dark/Light Color Variables | `tokens.css` 颜色变量 | 规范中全部语义颜色一一映射，组件不得引用散落色值 | —（未开始） |
| `VDA-102` | Not Started | `VDA-002`、`VDA-003` | 只处理非颜色 token | 字体、间距、圆角、阴影、栅格、动效规范 | Typography、Number、Effect Variables/Styles | 对应 CSS tokens | 数值与命名覆盖现有规范且无重复语义 | —（未开始） |
| `VDA-103` | Not Started | `VDA-002`、`VDA-003` | 只整理素材，不制作页面 | 原型图、品牌规则、固定比例清单 | Logo、图标、头像、封面素材页 | `prototype/assets/` 素材 | 每项素材具有来源、许可、尺寸、裁切与使用范围；无假素材 | —（未开始） |

## 4. C · 组件系统

| ID | 状态 | 依赖 | 单次会话边界 | 输入 | Figma 产物 | HTML 产物 | 验收标准 | 证据链接 |
|---|---|---|---|---|---|---|---|---|
| `VDA-201` | Not Started | `VDA-101`–`VDA-103` | 一个结构组件族 | 品牌、容器、导航规范 | 品牌锁定、顶部工具、页面容器、底部导航 | 对应结构与样式 | 固定尺寸、内容列与选中态在两主题中一致 | —（未开始） |
| `VDA-202` | Not Started | `VDA-101`–`VDA-103` | 一个基础控件族 | Buttons、Inputs、Toast 规范 | 按钮、图标按钮、输入、标签、状态、Toast、内联错误 | 对应控件与样式 | Default/Hover/Active/Focus/Disabled/Error 结构完整 | —（未开始） |
| `VDA-203` | Not Started | `VDA-101`–`VDA-103` | 一个内容组件族 | Cards、Queue、媒体规范 | 卡片、列表、媒体、队列、分段器、进度控件 | 对应内容组件 | 圆角、内边距、固定比例和列表密度一致 | —（未开始） |
| `VDA-204` | Not Started | `VDA-201`–`VDA-203` | 只处理 Radio 组件族 | Radio 骨架与三态规范 | 播放器、DJ 状态栏、dialogue well、输入、波形 | Radio 组件样式与 mock 状态 | 固定 rail/slot 可复用，三态变化限制在白名单内 | —（未开始） |
| `VDA-205` | Not Started | `VDA-201`–`VDA-203` | 只处理 Detail Sheet 组件族 | Detail Sheet 规范 | Sheet、串讲卡、歌词卡、歌曲/节目进度 | 对应 Sheet 结构 | 07/08 共用骨架，无专辑封面和传统控制台 | —（未开始） |
| `VDA-206` | Not Started | `VDA-201`–`VDA-205` | 只补 variants 与可访问状态 | 组件库、动效与无障碍规范 | 组件 variants 与 Reduce Motion 展示 | 状态样式与交互反馈 | Focus 可见、命中区达标、状态不只依赖颜色 | —（未开始） |

## 5. D · Dark 页面还原

| ID | 状态 | 依赖 | 单次会话边界 | 输入 | Figma 产物 | HTML 产物 | 验收标准 | 证据链接 |
|---|---|---|---|---|---|---|---|---|
| `VDA-301` | Not Started | `VDA-004`、`VDA-206` | 2 个同类页面 | 01/02 Dark 基线、Profile 规范 | 01、02 Dark 页面 | 01、02 Dark screens | 服务恢复与档案卡片结构准确，组件均为实例 | —（未开始） |
| `VDA-302` | Not Started | `VDA-004`、`VDA-206` | 1 个表单页面 | 03 Dark 基线、Profile 表单规则 | 03 Dark 页面 | 03 Dark screen | 字段、计数、头像与操作层级准确 | —（未开始） |
| `VDA-303` | Not Started | `VDA-004`、`VDA-204` | 1 个复杂状态 | 04 Dark 基线、Radio 固定骨架 | 04 Dark 页面 | 04 Dark screen | 只显示 `LIVE`，全部固定 slot 在容差内 | —（未开始） |
| `VDA-304` | Not Started | `VDA-004`、`VDA-204` | 1 个复杂状态 | 05 Dark 基线、播放器与队列规范 | 05 Dark 页面 | 05 Dark screen | `ON AIR`、播放器、队列、串讲和输入框准确 | —（未开始） |
| `VDA-305` | Not Started | `VDA-004`、`VDA-204` | 1 个复杂状态 | 06 Dark 基线、生成态规范 | 06 Dark 页面 | 06 Dark screen | `TUNING/THINKING`、骨架和禁用输入准确 | —（未开始） |
| `VDA-306` | Not Started | `VDA-303`–`VDA-305` | 只审查 Radio 三态 | 04/05/06 Figma 与 HTML | 三态一致性证据页 | 三态截图与叠层 | 不可变项尺寸、位置和组件实例一致 | —（未开始） |
| `VDA-307` | Not Started | `VDA-004`、`VDA-205` | 2 个共骨架状态 | 07/08 Dark 基线、Detail 规范 | 07、08 Dark 页面 | 07、08 Dark screens | 全屏骨架一致，只替换允许变化的状态和内容 | —（未开始） |
| `VDA-308` | Not Started | `VDA-004`、`VDA-206` | 1 个管理页面 | 09 Dark 基线、Library 规则 | 09 Dark 页面 | 09 Dark screen | 搜索、列表、导入与来源区完整，保持单列 | —（未开始） |
| `VDA-309` | Not Started | `VDA-004`、`VDA-206` | 2 个 Taste 页面 | 10/11 Dark 基线、Taste 规则 | 10、11 Dark 页面 | 10、11 Dark screens | 查看与编辑结构、标签和固定操作区准确 | —（未开始） |
| `VDA-310` | Not Started | `VDA-004`、`VDA-206` | 2 个 Programs 页面 | 12/13 Dark 基线、Programs 规则 | 12、13 Dark 页面 | 12、13 Dark screens | 列表、详情、节目队列与反馈摘要准确 | —（未开始） |
| `VDA-311` | Not Started | `VDA-004`、`VDA-206` | 2 个 Settings 页面 | 14/15 Dark 基线、Settings 规则 | 14、15 Dark 页面 | 14、15 Dark screens | 密钥遮蔽、服务状态、降级与恢复操作准确 | —（未开始） |

## 6. E · Light 页面派生

Light 页面复用 Dark 的结构、Auto Layout 和组件实例，只通过 Light variables 与必要的主题专属材质规则改变表现。

| ID | 状态 | 依赖 | 单次会话边界 | 输入 | Figma 产物 | HTML 产物 | 验收标准 | 证据链接 |
|---|---|---|---|---|---|---|---|---|
| `VDA-401` | Not Started | `VDA-301`、`VDA-302`、`VDA-206` | 3 个服务/Profile 页面 | 01–03 Dark 页面、Light tokens | 01–03 Light 页面 | 01–03 Light screens | 结构同源，表面与对比度按 Light 规则校准 | —（未开始） |
| `VDA-402` | Not Started | `VDA-303`、`VDA-206` | 1 个复杂状态 | 04 Dark、Light tokens | 04 Light 页面 | 04 Light screen | 固定 slot 不变，Light 层级清晰 | —（未开始） |
| `VDA-403` | Not Started | `VDA-304`、`VDA-206` | 1 个复杂状态 | 05 Dark、Light tokens | 05 Light 页面 | 05 Light screen | 播放器、队列和状态绿在浅色面可读 | —（未开始） |
| `VDA-404` | Not Started | `VDA-305`、`VDA-206` | 1 个复杂状态 | 06 Dark、Light tokens | 06 Light 页面 | 06 Light screen | 生成态不误用成功色，骨架可读 | —（未开始） |
| `VDA-405` | Not Started | `VDA-402`–`VDA-404` | 只审查 Light Radio 三态 | 04/05/06 Light 页面 | 三态一致性证据页 | 三态截图与叠层 | 不可变项一致且与 Dark 共用组件 | —（未开始） |
| `VDA-406` | Not Started | `VDA-307`、`VDA-206` | 2 个共骨架状态 | 07/08 Dark、Light tokens | 07、08 Light 页面 | 07、08 Light screens | 保留沉浸色面语义，结构与 Dark 同源 | —（未开始） |
| `VDA-407` | Not Started | `VDA-308`、`VDA-309`、`VDA-206` | 3 个管理页面 | 09–11 Dark、Light tokens | 09–11 Light 页面 | 09–11 Light screens | 表单、列表、标签和卡片层级清晰且一致 | —（未开始） |
| `VDA-408` | Not Started | `VDA-310`、`VDA-206` | 2 个 Programs 页面 | 12/13 Dark、Light tokens | 12、13 Light 页面 | 12、13 Light screens | 叙事层级、封面和元数据不被浅色表面削弱 | —（未开始） |
| `VDA-409` | Not Started | `VDA-311`、`VDA-206` | 2 个 Settings 页面 | 14/15 Dark、Light tokens | 14、15 Light 页面 | 14、15 Light screens | 状态、密钥、警告与操作层级满足对比度 | —（未开始） |

## 7. F · 关键流程原型

| ID | 状态 | 依赖 | 单次会话边界 | 输入 | Figma 产物 | HTML 产物 | 验收标准 | 证据链接 |
|---|---|---|---|---|---|---|---|---|
| `VDA-501` | Not Started | `VDA-401`、`VDA-201`、`VDA-202` | 只处理入口与档案流程 | 01–03、导航与主题组件、用户流 | 对应 Prototype connections | 服务恢复、档案选择/创建、导航、主题切换 | Dark/Light 均可完成核心点击路径，无真实持久化 | —（未开始） |
| `VDA-502` | Not Started | `VDA-405`、`VDA-406` | 只处理 Radio 核心流程 | 04–08、Radio 用户流 | Radio Prototype connections | 提交→生成→播放→Detail 开关→串讲/歌词切换 | 状态语义正确、播放仅为 mock、关闭 Sheet 不丢页面状态 | —（未开始） |
| `VDA-503` | Not Started | `VDA-407`–`VDA-409` | 只处理管理页核心操作 | 09–15、管理页用户流 | 管理页 Prototype connections | Library、Taste、Programs、Settings 点击与表单演示 | 关键入口、取消/保存、检测与恢复路径可演示 | —（未开始） |

## 8. G · QA 与开发交付

| ID | 状态 | 依赖 | 单次会话边界 | 输入 | Figma 产物 | HTML 产物 | 验收标准 | 证据链接 |
|---|---|---|---|---|---|---|---|---|
| `VDA-601` | Not Started | `VDA-301`–`VDA-311` | 按页面家族审查，最终汇总 | 15 张 Dark 基线与实现 | Dark QA 汇总页 | Dark 截图与比较报告 | 15 页视觉差异关闭；跨页面组件一致 | —（未开始） |
| `VDA-602` | Not Started | `VDA-401`–`VDA-409` | 按页面家族审查，最终汇总 | 15 张 Light 页面、Dark 结构 | Light QA 汇总页 | Light 截图与跨主题报告 | 15 页主题与对比度通过；结构完全同源 | —（未开始） |
| `VDA-603` | Not Started | `VDA-206`、`VDA-501`–`VDA-503` | 分键盘、缩放、动效三轮检查 | 组件状态和 3 组流程 | 无障碍与状态证据页 | 交互检查报告 | 键盘、Focus、44px、200% zoom、Reduce Motion 和状态文字通过 | —（未开始） |
| `VDA-604` | Not Started | `VDA-601`–`VDA-603` | 只做最终资产盘点与映射 | 全部资产、QA 证据、目标架构 | Figma 文件索引和交付页 | HTML screen 索引与资产包 | 30 页、3 流程、组件、变量、素材、证据齐全并映射到未来实现 | —（未开始） |

## 9. 最终完成定义

只有以下条件同时满足，视觉资产工作流才可结束：

- `VDA-001` 至 `VDA-604` 的适用任务全部为 `Done`。
- 15 张 Dark 与 15 张 Light 页面均为 `960 × 1600px`。
- 3 组关键流程在 Figma 和 HTML 中均可演示。
- Variables、Components、Variants 和素材来源清晰可追溯。
- Dark 页面有参考对比证据，Light 页面有跨主题同源证据。
- 键盘、Focus、命中区、200% zoom 与 Reduce Motion 检查通过。
- 最终清单能够直接指导未来 `packages/design-tokens`、Shared UI 和各 Feature 页面实现。
- 未把本工作流误记为产品代码已经实现或应用已经可运行。

