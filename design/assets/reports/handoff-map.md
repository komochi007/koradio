# Koradio 视觉冻结与开发交接映射

> 任务：VDA-17｜用户视觉反馈校准与重新冻结（延续 VDA-16 开发交接）
>
> 冻结标识：`Koradio Visual Freeze · MVP · VDA-17 · 2026-07-15`
>
> 状态：整体视觉冻结门已通过；本文件是前端实现的视觉追溯入口，不代表产品源码已经存在

> 版本边界：Git `6e97fb74826cdd48e5f75fe57646ac55340aab3c` 是 VDA-17 像素基线提交；当前工作树在保持该像素基线不变的前提下补充 Heart/More 业务语义、fixture 非产品事实声明与 ARIA 文案。当前语义校准不创建新的像素基线版本，也不重新生成 Figma。

## 1. 冻结范围与权威关系

本次冻结覆盖 15 个页面、35 个固定页面 / 变体状态、Dark / Light / System 主题入口、五类响应式布局、共享组件、交互与无障碍规则、60 张正式截图基线及 Figma 派生镜像。

| 资产 | 冻结版本 / 位置 | 权威性 |
|---|---|---|
| HTML / CSS / JavaScript 主源 | Git `6e97fb74826cdd48e5f75fe57646ac55340aab3c`；`design/assets/prototype/`、`design/assets/fixtures/`、`design/assets/icons/` | 唯一视觉主源 |
| 当前语义校准 | 当前树中的 `docs/prd.md`、`docs/user-flow.md`、`design/design.md` 与 `design/assets/prototype/app.js` ARIA 标签 | 产品语义与无障碍文案；不得改变 VDA-17 几何或像素基线 |
| 正式截图基线 | Git `6e97fb74826cdd48e5f75fe57646ac55340aab3c`；`design/assets/baselines/manifest.json` | 派生视觉回归参考 |
| Figma 镜像 | [Koradio · Visual Baseline · MVP](https://www.figma.com/design/ZxAWTQW5aH3VMd9H3T8zcJ)；60 个页面 Frame 来源版本 `6e97fb7` | 派生协作镜像 |
| 产品行为 | `docs/prd.md` | 产品事实源 |
| 用户路径 | `docs/user-flow.md` | 流程事实源 |
| UI 规则 | `design/design.md` | 明确视觉规则事实源 |
| 原型提示与历史观感 | `design/prompt.md`、`design/references/` | 生成约束与未覆盖视觉细节参考 |
| 差异裁决 | `design/assets/reports/visual-decisions.md` | 已确认 A / B / C 级决定 |

冻结不改变仓库的 Documentation-first 状态。当前没有产品源码、包管理器、生产依赖、运行脚本或已确认端口；本交接表只说明后续实现必须还原什么。

## 2. 入口与定位规则

| 用途 | 入口 |
|---|---|
| 页面预览 | `design/assets/prototype/index.html?page={page}&theme={theme}&viewport={viewport}` |
| 固定变体 | 在页面查询后增加 `&variant={variant}` |
| 共享组件目录 | `design/assets/prototype/catalog.html?theme=dark` 或 `theme=light` |
| 页面 / 状态清单 | `design/assets/fixtures/pages.js` 中的 `pages[]` |
| 固定视觉内容 | `design/assets/fixtures/pages.js` 中的 `visualContent` |
| 页面渲染与固定交互 | `design/assets/prototype/app.js` |
| 主题与尺寸 token | `design/assets/prototype/tokens.css` |
| 共享组件 | `design/assets/prototype/components.css` |
| 页面族样式 | `design/assets/prototype/styles.css` |
| 正式基线及完整性 | `design/assets/baselines/manifest.json` |

允许的定位值：

- `theme`：`dark`、`light`、`system`。`system` 解析为系统当前的 Dark 或 Light，不维护第三套视觉几何。
- `viewport`：`prototype` `960 × 1600`、`mobile` `390 × 844`、`tablet` `834 × 1194`、`desktop` `1440 × 1200`。
- 没有 `variant` 的 01–08 使用页面自身固定状态；09–15 使用下文列出的固定变体。

## 3. 组件映射

下表中的组件组 ID 用于页面映射，不是生产代码命名要求。后续实现可以调整文件名，但不得拆出与主源并行的视觉规格。

| ID | HTML / CSS 锚点 | 责任 |
|---|---|---|
| `C-BRAND` | `.kr-brand`、`.kr-brand__mark`、`.kr-brand__wordmark`、`.kr-topbar` | Logo、字标、顶部工具行与统一对齐 |
| `C-NAV` | `.kr-nav`、`.kr-nav__item`、`.kr-tab-icon` | 五项底部导航、选中底、Tooltip、键盘 Focus |
| `C-ACTION` | `.kr-button`、`.kr-icon-button`、`.kr-play-button` | Primary / Secondary / Ghost、图标与播放按钮状态 |
| `C-FORM` | `.kr-field`、`.kr-input` 及页面族输入 / 选择器 | 默认、Hover、Focus、Disabled、Loading、Error 与字段关联 |
| `C-CARD` | `.kr-card`、`.kr-card--radio`、页面族卡片 | 普通管理卡、Radio 核心卡、内边距、边框与材质 |
| `C-STATUS` | `.kr-status`、`.kr-status__dot`、tone modifier | Success / Warning / Error / Info / Offline 的文字与状态点双重表达 |
| `C-MEDIA` | `.kr-square-media`、`.kr-circle-media`、`.kr-avatar`、`.kr-cover` 及页面媒体类 | 固定比例头像、封面和圆形控件，不随父级拉伸 |
| `C-QUEUE` | `.kr-queue`、`.kr-queue__item`、`.radio-queue` | 编辑式队列、当前项、骨架、空状态 |
| `C-RADIO` | `.prototype-page--radio`、`.radio-scroll`、`.radio-player`、`.radio-dj-status`、`.radio-dialogue`、`.radio-scene-input` | 04–06 的共享骨架、`HONOR Sans Heavy` 时间、340px 主内容、288px DJ 对话与场景输入 |
| `C-DETAIL` | `.prototype-page--detail`、`.detail-waveform`、`.detail-paper`、`.detail-copy`、`.detail-program-progress` | 07–08 的全屏覆盖、白灰平滑传播声波、节目面、文本跟随、非规则节目进度和唯一播放控制 |
| `C-STATE` | `.library-state`、`.taste-state`、`.programs-state`、内联 warning / error、`.settings-diagnostic-card` | 空、加载、错误、降级与恢复入口 |
| `C-MOTION-A11Y` | `app.js` 的导航、Detail、播放状态与 live-region 行为；Focus / Reduce Motion CSS | 页面切换、Modal 焦点循环、状态播报、200% zoom 与 Reduce Motion |

## 4. Token 映射

所有 token 均以 `design/assets/prototype/tokens.css` 为当前实现值。后续前端应按语义映射，不得在页面内复制平行色值或尺寸体系。

| ID | 变量范围 | 用途 |
|---|---|---|
| `T-COLOR` | `--kr-color-primary` 至 `--kr-color-info`、`--kr-color-ambient`、`--kr-color-radio-ambient`、`--kr-color-surface-sheen` | Dark / Light 表面、文字、边框、状态与环境层 |
| `T-DETAIL-COLOR` | `--kr-color-detail-*` | Detail 固定深色声场、白色节目面、浅灰内容卡与三层文本 |
| `T-TYPE` | `--kr-font-*`、`--kr-type-*` | 系统字体、`HONOR Sans` Radio 时间、等宽状态、Display / H1–H3 / Body / Caption / Label |
| `T-SPACE-RADIUS` | `--kr-space-*`、`--kr-radius-*` | 4px 网格、共享间距与圆角 |
| `T-CONTROL` | `--kr-control-*`、`--kr-input-height`、`--kr-textarea-height`、`--kr-icon-button-size`、`--kr-play-*` | 按钮、输入、文本区与播放器控件 |
| `T-MEDIA` | `--kr-avatar-*`、`--kr-cover-*`、`--kr-status-dot-*` | 头像、封面和状态点固定比例 |
| `T-BRAND-NAV` | `--kr-logo-size`、`--kr-wordmark-*`、`--kr-topbar-height`、`--kr-tool-icon-size`、`--kr-tab-icon-size`、`--kr-nav-*` | 品牌、顶部工具与底部导航 |
| `T-LAYOUT` | `--kr-prototype-*`、`--kr-reading-width`、`--kr-profile-width`、`--kr-management-width`、`--kr-settings-width` | Prototype 画布、安全边距与各页面族内容列 |
| `T-RADIO` | `--kr-radio-*` | Radio rail、播放器高度与内边距 |
| `T-SETTINGS` | `--kr-settings-*` | Settings 输入、偏好控件、紧凑操作与行间距 |
| `T-DETAIL` | `--kr-detail-*` | Detail 全屏列、声波、节目面、标题、内容卡与底部控制 |
| `T-RESPONSIVE` | `--kr-responsive-*` 及 viewport 覆盖 | Mobile / Tablet / Desktop 安全边距、固定区域与尺寸收敛 |
| `T-MOTION` | `--kr-duration-*`、`--kr-ease-*`、`--kr-motion-*`、`--kr-shadow-*` | 交互时序、Detail 开合、Focus 与弱阴影 |

## 5. 页面—状态—组件—token—fixture—基线映射

“基线”列中的 `dark/` 与 `light/` 均相对于 `design/assets/baselines/`。响应式代表页额外对应 `responsive/{theme}-{viewport}-{page}.png` 的六张组合。

| 页面 | 固定状态 / 变体 | 渲染入口 | 组件组 | Token 组 | Fixture | 正式基线 / 响应式继承 |
|---|---|---|---|---|---|---|
| 01 `service-offline` | `offline` | `renderOffline` | `C-BRAND` `C-NAV` `C-ACTION` `C-STATUS` `C-STATE` | `T-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-CONTROL` `T-BRAND-NAV` `T-LAYOUT` `T-MOTION` | `visualContent.offline` | `dark/01-service-offline.png`、`light/01-service-offline.png`；无独立响应式正式基线 |
| 02 `profile-select` | `select` | `renderProfileSelect`、`profileCard` | `C-BRAND` `C-ACTION` `C-CARD` `C-MEDIA` | `T-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-CONTROL` `T-MEDIA` `T-BRAND-NAV` `T-LAYOUT` `T-MOTION` | `visualContent.profiles` | `dark/02-profile-select.png`、`light/02-profile-select.png`；继承 03 Profile 布局族 |
| 03 `profile-create` | `create` | `renderProfileCreate` | `C-BRAND` `C-ACTION` `C-FORM` `C-MEDIA` | `T-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-CONTROL` `T-MEDIA` `T-BRAND-NAV` `T-LAYOUT` `T-RESPONSIVE` `T-MOTION` | `visualContent.profileDraft` | `dark/03-profile-create.png`、`light/03-profile-create.png`；Profile 响应式代表页 |
| 04 `radio-empty` | `empty` | `renderRadio("empty")` | `C-BRAND` `C-NAV` `C-ACTION` `C-STATUS` `C-QUEUE` `C-RADIO` | `T-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-CONTROL` `T-MEDIA` `T-BRAND-NAV` `T-LAYOUT` `T-RADIO` `T-MOTION` | `visualContent.radio`、`.empty` | `dark/04-radio-empty.png`、`light/04-radio-empty.png`；继承 05 Radio 布局族 |
| 05 `radio-playing` | `playing` | `renderRadio("playing")` | `C-BRAND` `C-NAV` `C-ACTION` `C-CARD` `C-STATUS` `C-MEDIA` `C-QUEUE` `C-RADIO` `C-MOTION-A11Y` | `T-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-CONTROL` `T-MEDIA` `T-BRAND-NAV` `T-LAYOUT` `T-RADIO` `T-RESPONSIVE` `T-MOTION` | `visualContent.radio`、`.playing` | `dark/05-radio-playing.png`、`light/05-radio-playing.png`；Radio 响应式代表页 |
| 06 `radio-generating` | `generating` | `renderRadio("generating")` | `C-BRAND` `C-NAV` `C-ACTION` `C-STATUS` `C-QUEUE` `C-RADIO` `C-STATE` | `T-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-CONTROL` `T-BRAND-NAV` `T-LAYOUT` `T-RADIO` `T-MOTION` | `visualContent.radio`、`.generating` | `dark/06-radio-generating.png`、`light/06-radio-generating.png`；继承 05 Radio 布局族 |
| 07 `radio-detail-speaking` | `speaking` | `renderDetail("speaking")` | `C-ACTION` `C-STATUS` `C-DETAIL` `C-MOTION-A11Y` | `T-DETAIL-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-DETAIL` `T-RESPONSIVE` `T-MOTION` | `visualContent.detail`、`.speaking` | `dark/07-radio-detail-speaking.png`、`light/07-radio-detail-speaking.png`；继承 08 Detail 布局族 |
| 08 `radio-detail-lyrics` | `lyrics` | `renderDetail("lyrics")` | `C-ACTION` `C-STATUS` `C-DETAIL` `C-MOTION-A11Y` | `T-DETAIL-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-DETAIL` `T-RESPONSIVE` `T-MOTION` | `visualContent.detail`、`.lyrics` | `dark/08-radio-detail-lyrics.png`、`light/08-radio-detail-lyrics.png`；Detail 响应式代表页 |
| 09 `library` | 见状态矩阵 | `renderLibrary` | `C-BRAND` `C-NAV` `C-ACTION` `C-FORM` `C-MEDIA` `C-STATE` | `T-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-CONTROL` `T-MEDIA` `T-BRAND-NAV` `T-LAYOUT` `T-MOTION` | `visualContent.library` + renderer-local 状态文案 | `dark/09-library.png`、`light/09-library.png`；继承 10 Management 布局族 |
| 10 `taste-overview` | 见状态矩阵 | `renderTasteOverview` | `C-BRAND` `C-NAV` `C-ACTION` `C-CARD` `C-STATE` | `T-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-CONTROL` `T-BRAND-NAV` `T-LAYOUT` `T-RESPONSIVE` `T-MOTION` | `visualContent.taste` + renderer-local 状态文案 | `dark/10-taste-overview.png`、`light/10-taste-overview.png`；Management 响应式代表页 |
| 11 `taste-edit` | 见状态矩阵 | `renderTasteEdit` | `C-BRAND` `C-ACTION` `C-FORM` `C-CARD` `C-STATE` | `T-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-CONTROL` `T-BRAND-NAV` `T-LAYOUT` `T-MOTION` | `visualContent.taste.edit` + variant flags | `dark/11-taste-edit.png`、`light/11-taste-edit.png`；继承 10 Management 布局族 |
| 12 `programs-list` | 见状态矩阵 | `renderProgramsList` | `C-BRAND` `C-NAV` `C-ACTION` `C-CARD` `C-MEDIA` `C-STATE` | `T-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-CONTROL` `T-MEDIA` `T-BRAND-NAV` `T-LAYOUT` `T-MOTION` | `visualContent.programs.summary`、`.items` + renderer-local 状态文案 | `dark/12-programs-list.png`、`light/12-programs-list.png`；继承 10 Management 布局族 |
| 13 `program-detail` | 见状态矩阵 | `renderProgramDetail` | `C-BRAND` `C-NAV` `C-ACTION` `C-CARD` `C-MEDIA` `C-QUEUE` `C-STATE` | `T-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-CONTROL` `T-MEDIA` `T-BRAND-NAV` `T-LAYOUT` `T-MOTION` | `visualContent.programs.detail` + variant flags | `dark/13-program-detail.png`、`light/13-program-detail.png`；继承 10 Management 布局族 |
| 14 `settings-config` | 见状态矩阵 | `renderSettingsConfig` | `C-BRAND` `C-NAV` `C-ACTION` `C-FORM` `C-CARD` `C-STATUS` `C-STATE` | `T-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-CONTROL` `T-BRAND-NAV` `T-LAYOUT` `T-SETTINGS` `T-RESPONSIVE` `T-MOTION` | `visualContent.settings` + variant flags | `dark/14-settings-config.png`、`light/14-settings-config.png`；Settings 响应式代表页 |
| 15 `settings-diagnostics` | 见状态矩阵 | `renderSettingsDiagnostics` | `C-NAV` `C-ACTION` `C-CARD` `C-STATUS` `C-STATE` | `T-COLOR` `T-TYPE` `T-SPACE-RADIUS` `T-CONTROL` `T-BRAND-NAV` `T-LAYOUT` `T-SETTINGS` `T-MOTION` | `visualContent.settings.diagnostics` | `dark/15-settings-diagnostics.png`、`light/15-settings-diagnostics.png`；继承 14 Settings 布局族 |

## 6. 固定状态矩阵

| 页面 | Variant | 用户可见语义 | Fixture / 固定文案位置 | 正式 Prototype 基线 |
|---|---|---|---|---|
| 09 Library | `results` | 搜索结果 | `visualContent.library` | 是，09 默认基线 |
| 09 Library | `importing` | 歌单导入中 | `visualContent.library` + `libraryImportCard` | 否；HTML 固定状态 |
| 09 Library | `empty` | 空音乐库 | `libraryStatePanel` | 否；HTML 固定状态 |
| 09 Library | `no-results` | 搜索无结果 | `visualContent.library.noResultsQuery` + `libraryStatePanel` | 否；HTML 固定状态 |
| 09 Library | `service-error` | 音乐服务异常，可重试 / 前往 Settings | `libraryStatePanel`、`libraryImportCard` | 否；HTML 固定状态 |
| 10 Taste | `formed` | 品味已形成 | `visualContent.taste` | 是，10 默认基线 |
| 10 Taste | `loading` | 品味读取中 | `tasteStatePanel` | 否；HTML 固定状态 |
| 10 Taste | `empty` | 品味尚未形成，可前往 Radio | `tasteStatePanel` | 否；HTML 固定状态 |
| 10 Taste | `load-error` | 档案读取失败，可重新选择档案 | `tasteStatePanel` | 否；HTML 固定状态 |
| 11 Taste Edit | `editing` | 编辑中 | `visualContent.taste.edit` | 是，11 默认基线 |
| 11 Taste Edit | `saving` | 保存中，操作禁用 | `visualContent.taste.edit` + variant flag | 否；HTML 固定状态 |
| 11 Taste Edit | `save-error` | 保存失败，内容保留 | `visualContent.taste.edit` + variant flag | 否；HTML 固定状态 |
| 12 Programs | `list` | 节目列表 | `visualContent.programs.summary`、`.items` | 是，12 默认基线 |
| 12 Programs | `loading` | 历史读取中 | `programsStatePanel` | 否；HTML 固定状态 |
| 12 Programs | `empty` | 无历史，可前往 Radio | `programsStatePanel` | 否；HTML 固定状态 |
| 12 Programs | `load-error` | 历史读取失败，可重试 / 回到 Radio | `programsStatePanel` | 否；HTML 固定状态 |
| 13 Program Detail | `detail` | 节目详情 | `visualContent.programs.detail` | 是，13 默认基线 |
| 13 Program Detail | `replaying` | 串讲重播中 | `visualContent.programs.detail` + variant flag | 否；HTML 固定状态 |
| 13 Program Detail | `tts-missing` | 串讲音频缺失，保留文字 | `visualContent.programs.detail` + variant flag | 否；HTML 固定状态 |
| 13 Program Detail | `reuse-error` | Radio 未连接，场景复用失败 | `visualContent.programs.detail` + variant flag | 否；HTML 固定状态 |
| 14 Settings | `configured` | 已配置 | `visualContent.settings` | 是，14 默认基线 |
| 14 Settings | `detecting` | 服务检测中 | `visualContent.settings` + variant flag | 否；HTML 固定状态 |
| 14 Settings | `incomplete` | 必需配置缺失 | `visualContent.settings` + variant flag | 否；HTML 固定状态 |
| 14 Settings | `save-error` | 数据路径不可写 / 保存失败 | `visualContent.settings` + variant flag | 否；HTML 固定状态 |
| 15 Diagnostics | `degraded` | TTS 局部降级，核心播放可用 | `visualContent.settings.diagnostics.degraded` | 是，15 默认基线 |
| 15 Diagnostics | `available` | 四项服务全部可用 | `visualContent.settings.diagnostics.available` | 否；HTML 固定状态 |
| 15 Diagnostics | `core-error` | 核心服务不可用，阻断生成 | `visualContent.settings.diagnostics.coreError` | 否；HTML 固定状态 |

01–08 的八个固定状态加上本表 27 个变体，共 35 个固定视觉状态。没有独立 PNG 的变体仍属于冻结 HTML 主源；不得把默认页截图当成该变体的像素基线，也不得因此删减变体。

## 7. 响应式继承映射

| 布局族 | 代表页 | 继承页面 | 不变量 |
|---|---|---|---|
| Profile | 03 | 02–03 | 单列表单 / 卡片顺序、固定顶部工具、可滚动内容、字段和隐私说明不隐藏 |
| Radio | 05 | 04–06 | 固定顶部、场景输入与导航；中间连续内容层滚动；宽屏仍为中央单列 |
| Detail | 08 | 07–08 | 覆盖完整 viewport；深色声场 + 白色节目面；状态、关闭、进度、内容卡和唯一播放控制不移除 |
| Management | 10 | 09–13 | 单列内容、固定顶部和导航、同级卡移动端纵向排列、不引入后台侧栏 |
| Settings | 14 | 14–15 | 固定顶部 / 操作区 / 导航、配置内容独立滚动、密钥遮蔽和次级设置不隐藏 |

01 服务异常页不属于 VDA-12 的五个代表布局族，没有独立响应式正式基线。后续实现仍须遵守全局 Mobile / Tablet / Desktop 安全边距、无横向溢出、恢复入口完整和 `44 × 44px` 最小命中区；不得把它描述为已存在独立响应式截图基线。

## 8. 前端实现视觉验收清单

### 8.1 主源与范围

- [ ] 实现前已确认仓库届时的真实脚手架、依赖和测试命令；没有把本视觉原型当作产品运行入口。
- [ ] 产品行为对照 PRD，流程对照 User Flow，明确 UI 规则对照 `design/design.md`。
- [ ] HTML / CSS / JavaScript 主源是视觉实现依据；PNG 只用于回归，Figma 只用于协作查看。
- [ ] 15 个页面、35 个固定状态均有明确实现映射，没有把视觉 fixture 当作真实 Backend / Provider 数据。

### 8.2 Tokens 与共享组件

- [ ] 颜色、排版、间距、圆角、内容列、控件、媒体、导航和动效均映射到共享 token。
- [ ] 主按钮保持黑白高对比；绿色只用于在线、播放、成功、Focus 或细线，Detail 顶部声波只使用白色与浅灰色。
- [ ] Logo、字标、顶部工具、底部导航、按钮、输入、卡片、状态、媒体与队列只有一套共享规格。
- [ ] 头像、封面、状态点、圆形按钮使用固定比例容器，不受文字或 Flex 拉伸。
- [ ] 页面没有为通过截图回归而新增私有色值、私有 rail 或平行组件尺寸。

### 8.3 页面与状态

- [ ] Radio 04–06 共用同一骨架，固定边缘与 slot 在状态切换时零位移。
- [ ] Radio 大号时间使用 `HONOR Sans Heavy`；原型为 `80px / 80px / 900`，移动端为 `56px / 56px / 900`；主内容与 DJ 对话 slot 分别为 `340px` 与 `288px`。
- [ ] Detail 07–08 共用全屏骨架，只替换状态、歌曲进度与主内容；底层 Radio 与主导航不可见。
- [ ] Detail 顶部 64 柱波形使用白灰平滑包络和传播式动效，暂停 / Reduce Motion 停止；07 串讲词顶部对齐并保持 `24px` 组间距，节目进度不出现规则周期重复。
- [ ] Detail 只有一个播放 / 暂停入口，不显示封面、切歌、喜欢、更多或传统控制台。
- [ ] DJ 内容使用节目正文，只有用户输入使用右对齐弱气泡。
- [ ] Management 与 Settings 保持单列，不出现后台侧栏或内容网格化重构。
- [ ] Loading、Empty、Error、Degraded 都保留明确文字和必要恢复入口，不只使用 Toast 或颜色。
- [ ] Settings 密钥保持遮蔽；参考 fixture 中的本地路径和端口没有进入生产默认值或运行声明。

### 8.4 主题与响应式

- [ ] Dark 与 Light 只改变材质，不改变 DOM 顺序、几何、滚动边界或交互语义。
- [ ] Light 使用独立校准的冷灰白背景和白色 Surface，不做机械反色。
- [ ] System 正确解析系统主题，并复用相应 Dark / Light token。
- [ ] `390 × 844`、`834 × 1194`、`1440 × 1200` 对照五类代表页；同族页面遵循继承表。
- [ ] Radio 宽屏保持中央单列；Detail 覆盖完整 viewport；管理页与 Settings 不引入侧栏。
- [ ] 固定顶部、底部操作、导航和 safe area 不遮挡内容，长文案与路径不引发横向滚动。

### 8.5 交互与无障碍

- [ ] Hover、Active、Focus、Disabled、Loading、Error 都有可见且一致的反馈。
- [ ] 所有可用操作命中区不小于 `44 × 44px`，主播放和发送使用组件规定的大尺寸。
- [ ] 底部导航支持 Tab、左右方向键、Home、End；页面切换后焦点进入主标题。
- [ ] Detail 打开后焦点进入关闭按钮，Tab 留在 Sheet 内，Escape 关闭并把焦点还给 DJ 状态栏。
- [ ] 重要状态使用正确的 `role`、`aria-live`、`aria-busy`、`aria-invalid` 与字段关联。
- [ ] 状态不只依赖颜色；暂停、播放、生成和降级都有文字或可访问名称。
- [ ] 200% zoom 下内容可达、导航可用；Reduce Motion 下停止持续波形、骨架、状态脉冲与非必要转场。
- [ ] 代表文本和非文本状态达到 WCAG AA；Detail 已读大字在 `#F5F3F6` 上至少 `3:1`。

### 8.6 视觉回归

- [ ] 15 张 Dark 与 15 张 Light Prototype 对照正式基线；尺寸均为 `960 × 1600px`。
- [ ] 30 张响应式代表页对照对应主题和 viewport 基线。
- [ ] 检查必需文字、裁切、固定比例、恢复入口、Radio / Detail 跨状态几何与 Dark / Light 几何一致性。
- [ ] 运行 VDA-14 复渲染验证；字体抗锯齿容差上限保持 `0.6%`，不得通过放宽布局或内容断言让检查通过。
- [ ] 验证 `design/assets/baselines/manifest.json` 中 60 个文件的尺寸与 SHA-256 完整性。
- [ ] 检查控制台、资源加载、横向溢出、键盘路径与浏览器无障碍树。

## 9. 冻结后的变更流程

1. 行为变化先修改 `docs/prd.md`；流程变化先修改 `docs/user-flow.md`；UI token、组件骨架、状态映射或无障碍变化先修改 `design/design.md`。
2. 在 `design/assets/reports/visual-decisions.md` 登记 A / B / C 级差异；A 级等待确认，B 级按页面族确认，C 级按规范与组件一致性处理。
3. 修改 HTML / CSS / JavaScript 主源及必要固定内容，验证 35 个状态和受影响布局族。
4. 从主源重新生成正式截图与 `manifest.json`，通过结构、视觉、文件与复渲染检查。
5. 从新基线重新同步 Figma；不得在 Figma 中单独修改后反向覆盖 HTML。
6. 更新本交接表的冻结版本、状态映射、基线覆盖与限制说明。

## 10. 已知边界

- Figma 页面 Frame 使用已验收 PNG 图像填充保真，不是可编辑 DOM；响应式计算和交互语义仍以 HTML 主源为准。
- 60 张正式 PNG 覆盖 15 个默认页面状态及五类代表页响应式组合；09–15 的其余 20 个非默认变体由冻结 HTML 和既有自动验收覆盖，没有独立正式 PNG。
- `system` 是主题解析入口，不维护第三套截图基线。
- 01 服务异常页没有 VDA-12 独立响应式截图，后续产品验收需按全局响应式和无障碍规则覆盖。
- `pages.js` 承载页面元数据与主要固定视觉内容；部分变体专属状态文案固定在 `app.js` 的 renderer helper 中。两者均属于 JavaScript 视觉主源，不得被解释为真实领域数据或服务响应。
- 原型中的 `http://localhost:4173`、`http://localhost:3000`、本地路径和时间只属于视觉 fixture，不能作为产品端口、环境或默认配置事实。
- Radio 心形按钮语义为“喜欢歌曲”，不喜欢位于 More；节目收藏只在 Programs/节目入口处理。该校准只修改 ARIA 文案，不改变视觉图标或布局。

## 11. 冻结结论

- 依赖：VDA-14 与 VDA-15 已满足。
- 映射：15 页、35 个固定状态、12 个组件组、13 个 token 组、fixture / renderer 与 60 张正式基线已建立追溯关系。
- 差异：A-001–A-012、B-001–B-004 均已关闭；VDA-17 未新增 A / B 级未决差异，C-015 记录交接映射与非默认变体基线边界，C-016 记录用户确认的 Radio / Detail 冻结后视觉校准。
- 门禁：整体视觉冻结门通过。
- 后续：任何视觉变化按第 9 节流程执行；前端开发按第 8 节验收。
