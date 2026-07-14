# Koradio 视觉设计系统规范

**版本：V1.2**
**适用范围：Web / PWA MVP 与高保真前端原型图**
**原型画布：960 × 1600 px，宽高比 3:5**
**设计基准：竖版桌面应用原型优先，后续兼容手机与平板**
**主题支持：Dark / Light / System，默认 Dark**
**页面依据：`prompt.md` 中 15 个界面的高保真原型提示词**

---

## 1. 设计愿景与情感调性

### 1.1 设计愿景

Koradio 应呈现为一台安静存在于用户身边的私人电台。

它不是强调控制效率的专业音频工作台，也不是依靠大幅封面和高饱和色彩吸引注意力的传统音乐播放器。产品需要通过时间、`ON AIR` 状态、DJ 串讲、播放队列和克制的动态反馈，建立一种稳定、私密、有策展感的陪伴体验。

整体视觉方向如下：

* **Radio 页面**：60% Apple Music、25% Apple 官网、15% 专业广播设备
* **管理页面**：60% Apple 系统设置、40% Apple 官网
* **情感构成**：50% 深夜独立电台、40% 私人音乐沙龙、10% 专业广播工作室

视觉设计应优先依靠排版、比例、留白和材质层级形成高级感，只使用少量半透明、背景模糊和弱渐变。避免明显玻璃拟态、霓虹科技感、复杂装饰纹理和重度硬件拟物。

### 1.2 三个核心关键词

#### **私密 Private**

界面应让用户感到这是只为自己播放的电台，而不是公开内容平台。使用窄内容容器、低亮度背景、温和的文字层级和有限的视觉干扰，强化一对一陪伴感。

#### **克制 Restrained**

所有视觉元素都应有明确功能。减少无意义装饰、颜色和动画，避免同时出现过多操作按钮。核心操作通过位置、尺寸和明暗对比突出，而不是依赖高饱和色。

#### **策展 Curated**

产品应表现出经过挑选和编排的节目感，而非随机歌曲列表。节目标题、DJ 串讲、队列序号、时间和状态标签需要具有统一的编辑排版秩序。

### 1.3 品牌识别

品牌标准字使用全大写形式：

```text
KORADIO
```

推荐使用几何无衬线字体，字距略微拉开：

```css
letter-spacing: 0.12em;
font-weight: 600;
```

Logo 采用“图形图标 + KORADIO”组合。图标建议围绕以下视觉母题设计：

* 调谐旋钮或圆形频率刻度
* 抽象化的字母 `K`
* 单点向外扩散的广播信号
* 电台状态灯与声音波纹的组合

图标应使用单色、几何、低细节设计，避免直接使用麦克风、耳机、唱片等常见音乐应用符号。

### 1.4 电台视觉元素的使用边界

点阵或等宽视觉只作为识别性元素，主要用于：

* 大号时间
* `ON AIR`
* 日期与星期
* `LIVE`、`PLAYING`、`THINKING`、`SPEAKING`
* 队列序号、曲目时长和播放时间

正文、DJ 串讲、设置表单和说明文字不使用点阵字体。

专辑封面只作为小尺寸歌曲识别信息，不主导页面色彩，也不改变主题背景。

---

## 2. 色彩系统

### 2.1 色彩策略

Koradio 不使用传统意义上的高饱和品牌主色。

核心操作采用黑白反差建立优先级，绿色只负责表达电台在线、播放、连接成功和 `ON AIR` 等状态，不大面积应用于按钮、导航背景或装饰区域。

绿色应比 Apple 系统绿色更低饱和、更安静，避免形成游戏化或强科技感。

---

### 2.2 Dark Theme

Dark 为产品默认主题，适合夜间使用和 Radio 核心页面。

#### 基础颜色

* **Primary / 主操作色**：`#F2F4F7`

* **Primary Foreground**：`#111317`

* **Accent / 电台状态绿**：`#55B978`

* **Accent Hover**：`#61C584`

* **Accent Soft**：`rgba(85, 185, 120, 0.14)`

* **Background / 页面背景**：`#090A0C`

* **Background Elevated**：`#0D0F12`

* **Surface / 基础表面**：`#111317`

* **Surface Elevated**：`#171A1F`

* **Surface Hover**：`#1C2026`

* **Surface Active**：`#22272E`

* **Border Subtle**：`#20242A`

* **Border Default**：`#2A2F37`

* **Border Strong**：`#3A414C`

#### 文本颜色

* **Text Primary**：`#F3F5F7`
* **Text Secondary**：`#A9B0BA`
* **Text Tertiary**：`#737B87`
* **Text Disabled**：`#505761`
* **Text Inverse**：`#111317`

#### 状态颜色

* **Success**：`#55B978`
* **Warning**：`#D3A653`
* **Error**：`#D76D72`
* **Information**：`#7294BC`

---

### 2.3 Light Theme

Light 主题不采用纯白通铺，也不直接反转 Dark 主题。页面背景使用冷灰白，卡片使用白色或接近白色表面，从而保留材料层级。

#### 基础颜色

* **Primary / 主操作色**：`#191B1F`

* **Primary Foreground**：`#FFFFFF`

* **Accent / 电台状态绿**：`#4FAE6B`

* **Accent Hover**：`#459B5E`

* **Accent Soft**：`rgba(79, 174, 107, 0.12)`

* **Background / 页面背景**：`#F3F4F6`

* **Background Elevated**：`#F8F8F9`

* **Surface / 基础表面**：`#FFFFFF`

* **Surface Elevated**：`#FAFAFB`

* **Surface Hover**：`#F0F1F3`

* **Surface Active**：`#E8EAED`

* **Border Subtle**：`#E5E7EA`

* **Border Default**：`#D6D9DE`

* **Border Strong**：`#BEC3CA`

#### 文本颜色

* **Text Primary**：`#17191D`
* **Text Secondary**：`#5F6670`
* **Text Tertiary**：`#8B929C`
* **Text Disabled**：`#B5BAC1`
* **Text Inverse**：`#FFFFFF`

#### 状态颜色

* **Success**：`#459B5E`
* **Warning**：`#A87824`
* **Error**：`#B94F55`
* **Information**：`#557DA9`

---

### 2.4 状态颜色使用原则

颜色不能成为唯一的状态表达方式。所有状态点必须同时配合文字：

```text
● ON AIR
● CONNECTED
● THINKING
● OFFLINE
● ERROR
```

`ON AIR`、`LIVE`、播放中和连接成功可以使用绿色。

`THINKING`、加载中和服务检测中优先使用中性色或 Information 蓝灰色，避免用户误以为已经成功。

警告色用于可降级但不阻断的状态，例如 TTS 不可用但文字 DJ 仍可使用。

错误色用于当前任务无法继续的状态，例如 Codex 未连接、音乐服务不可用或数据路径不可写。

---

### 2.5 渐变与透明材质

渐变只用于建立非常轻微的表面层次，不用于大面积品牌装饰。

Dark 模式推荐：

```css
background:
  linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.025) 0%,
    rgba(255, 255, 255, 0) 100%
  ),
  #111317;
```

底部导航可使用有限的背景模糊。全屏 Detail Sheet 不使用背景模糊承载主体内容，因为它覆盖完整产品画布，不露出底层 Radio 页面：

```css
background: rgba(17, 19, 23, 0.82);
backdrop-filter: blur(20px) saturate(120%);
-webkit-backdrop-filter: blur(20px) saturate(120%);
```

模糊层后必须保留明确的边框，避免内容与背景混在一起。

Detail Sheet 使用专属的沉浸色面：上半区为深色声场 `#090A0C`，下半区为纯白节目面 `#FFFFFF`，串讲词/歌词卡片为浅灰 `#F5F3F6`。这些浅色面不得使用高饱和绿色作为大面积背景。

---

### 2.6 CSS Variables

```css
:root {
  color-scheme: light;

  --kr-color-primary: #191b1f;
  --kr-color-on-primary: #ffffff;

  --kr-color-accent: #4fae6b;
  --kr-color-accent-hover: #459b5e;
  --kr-color-accent-soft: rgba(79, 174, 107, 0.12);

  --kr-color-bg: #f3f4f6;
  --kr-color-bg-elevated: #f8f8f9;
  --kr-color-surface: #ffffff;
  --kr-color-surface-elevated: #fafafb;
  --kr-color-surface-hover: #f0f1f3;
  --kr-color-surface-active: #e8eaed;

  --kr-color-border-subtle: #e5e7ea;
  --kr-color-border: #d6d9de;
  --kr-color-border-strong: #bec3ca;

  --kr-color-text-primary: #17191d;
  --kr-color-text-secondary: #5f6670;
  --kr-color-text-tertiary: #8b929c;
  --kr-color-text-disabled: #b5bac1;
  --kr-color-text-inverse: #ffffff;

  --kr-color-success: #459b5e;
  --kr-color-warning: #a87824;
  --kr-color-error: #b94f55;
  --kr-color-info: #557da9;
}

[data-theme="dark"] {
  color-scheme: dark;

  --kr-color-primary: #f2f4f7;
  --kr-color-on-primary: #111317;

  --kr-color-accent: #55b978;
  --kr-color-accent-hover: #61c584;
  --kr-color-accent-soft: rgba(85, 185, 120, 0.14);

  --kr-color-bg: #090a0c;
  --kr-color-bg-elevated: #0d0f12;
  --kr-color-surface: #111317;
  --kr-color-surface-elevated: #171a1f;
  --kr-color-surface-hover: #1c2026;
  --kr-color-surface-active: #22272e;

  --kr-color-border-subtle: #20242a;
  --kr-color-border: #2a2f37;
  --kr-color-border-strong: #3a414c;

  --kr-color-text-primary: #f3f5f7;
  --kr-color-text-secondary: #a9b0ba;
  --kr-color-text-tertiary: #737b87;
  --kr-color-text-disabled: #505761;
  --kr-color-text-inverse: #111317;

  --kr-color-success: #55b978;
  --kr-color-warning: #d3a653;
  --kr-color-error: #d76d72;
  --kr-color-info: #7294bc;
}
```

---

## 3. 字体与排版

### 3.1 字体族

正文和界面使用系统字体，优先保证本地加载、中文显示质量和跨平台稳定性。

```css
--kr-font-sans:
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Display",
  "SF Pro Text",
  "PingFang SC",
  "Hiragino Sans GB",
  "Microsoft YaHei",
  "Segoe UI",
  sans-serif;

--kr-font-mono:
  "SFMono-Regular",
  "SF Mono",
  "Roboto Mono",
  "JetBrains Mono",
  "IBM Plex Mono",
  monospace;
```

产品不强制加载外部 Web Font。

时间与状态标签使用等宽字体，而不是低可读性的装饰性点阵字体。后续如引入点阵字体，只允许用于大号时间数字和 Logo 展示，不得用于功能文字。

### 3.2 字体层级

| 层级           |   字号 |   行高 |  字重 | 主要用途                    |
| ------------ | ---: | ---: | --: | ----------------------- |
| Display Time | 64px | 64px | 500 | Radio 大号时间              |
| H1           | 40px | 52px | 600 | 页面主标题、节目标题              |
| H2           | 32px | 40px | 600 | 页面分区、详情标题               |
| H3           | 24px | 32px | 600 | 卡片标题、设置区标题              |
| Body Large   | 20px | 32px | 400 | DJ 串讲、重点正文              |
| Body         | 18px | 28px | 400 | 常规正文、表单文字               |
| Body Small   | 16px | 24px | 400 | 辅助描述、列表元数据              |
| Caption      | 14px | 20px | 500 | 状态、时间、标签                |
| Label Mono   | 14px | 20px | 600 | `ON AIR`、`QUEUE`、`LIVE` |

移动端 Display Time 调整为 `48px`，H1 调整为 `28px`。

### 3.3 字距规则

除品牌字标和英文状态标签外，界面文字默认不做字距压缩或拉伸。

* 正文：`0`
* 大标题：`0`
* 大号时间：`0`
* 英文状态标签：`0.08em`
* KORADIO 品牌字标：`0.12em`
* 中文不可使用明显字距拉伸

### 3.4 文本宽度

长文本应限制阅读宽度：

```css
max-width: 40rem;
```

DJ 串讲建议控制在每行约 24–32 个中文字符。Detail Sheet 中的大号串讲文本每行建议为 16–24 个中文字符。

### 3.5 排版语义

Radio 页面采用“编辑排版”而不是“表单排版”：

* 节目标题可使用较大的 H1 或 H2
* 歌手、专辑和时长降为 Secondary 或 Tertiary
* `ON AIR`、`QUEUE`、`NOW PLAYING` 使用等宽大写标签
* DJ 串讲使用自然段，不使用聊天产品常见的密集气泡样式
* 用户输入可以使用弱气泡，但 DJ 内容应更接近节目正文

---

## 4. 布局与栅格

### 4.1 高保真原型画布

当前前端原型图以 `prompt.md` 为准，统一使用竖版桌面应用截图规格：

```css
--kr-prototype-width: 960px;
--kr-prototype-height: 1600px;
--kr-prototype-ratio: 3 / 5;
--kr-prototype-gutter-x: 56px;
--kr-prototype-padding-top: 40px;
--kr-prototype-padding-bottom: 128px;
--kr-prototype-nav-bottom: 32px;
```

原型图必须是正面平视的完整产品 UI 截图，不展示设备模型、浏览器外框、系统窗口和透视效果。画布边缘即产品外框。

所有一级页面的页面级内容必须放在统一的安全边距内：

```css
.prototype-page {
  width: 960px;
  min-height: 1600px;
  padding:
    var(--kr-prototype-padding-top)
    var(--kr-prototype-gutter-x)
    var(--kr-prototype-padding-bottom);
  background: var(--kr-color-bg);
}
```

页面顶部品牌区、标题区、管理页表单和所有主要交互控件，距离画布左右边缘不得小于 `56px`。不同页面可在安全区域内使用不同内容列宽，但内容列必须水平居中，不能贴近产品外框。

底部胶囊导航在原型图中固定居中：

* 宽度：`620px`
* 高度：`88px`
* 距离画布底部：`32px`
* 左右始终相对于 `960px` 画布居中

### 4.2 响应式断点

```css
/* Mobile */
@media (max-width: 767px) {}

/* Tablet */
@media (min-width: 768px) and (max-width: 1199px) {}

/* Desktop */
@media (min-width: 1200px) {}
```

Tailwind 对应建议：

```js
screens: {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1200px",
  "2xl": "1440px",
}
```

### 4.3 页面容器

Radio 页面始终保持中央窄列，不在宽屏中拆分为多栏。

```css
--kr-radio-width-mobile: 100%;
--kr-radio-width-tablet: calc(100% - 56px);
--kr-radio-width-desktop: 816px;
--kr-radio-player-height: 408px;
--kr-radio-player-padding: 28px;

--kr-profile-width: 848px;
--kr-management-width: 840px;
--kr-settings-width: 832px;
--kr-settings-input-height: 64px;
--kr-settings-preference-control-height: 44px;
--kr-settings-preference-gap: 8px;
--kr-settings-compact-action-target-height: 44px;
--kr-settings-compact-action-frame-height: 32px;
--kr-detail-sheet-width: 960px;
```

在 `960 × 1600px` 原型画布中的内容列规则：

| 页面类型 | 内容宽度 | 画布内视觉留白 | 使用页面 |
|----------|----------|----------------|----------|
| Radio | `816px` | 左右各 `72px` | Radio 空状态、Radio 播放、节目生成中 |
| 服务异常恢复区 | `560px` | 左右各 `200px` | 服务未连接 |
| Profile / Onboarding | `848px` | 左右各 `56px` | 档案选择、创建档案 |
| 管理页 | `840px` | 左右各 `60px` | Library、Taste、Programs、历史节目详情 |
| Settings | `832px` | 左右各 `64px` | 服务配置、服务检测结果 |
| Detail Sheet | `960px` 全屏覆盖；浅色节目面内使用 `848px` 专属内容列 | 外层不留底层页面；浅色面内左右各 `56px` | DJ 串讲态、歌词跟随态 |

这些视觉留白来自内容列居中，不替代 `56px` 页面安全边距。若某个页面有更窄的主任务区域，例如服务未连接页的错误恢复区域，应保持该区域居中并优先使用 `560px`。

Settings 服务配置页的四个路径与密钥输入框固定为 `64px` 高；该规格只作用于 Settings 页面族，不取代 Profile 表单和组件目录使用的全局 `80px` 输入规格。偏好设置的 Theme Mode、DJ Language 和 DJ Voice Style 控件统一为 `44px` 高，三行之间保留 `8px` 间距，不得让相邻控件边框直接相接。服务状态中的 Test 与本地数据中的 Change 使用同一紧凑操作规格：真实命中区保持 `44px` 高，可见边框内收为 `32px` 高并垂直居中，边框上下各保留 `6px`，不得与外层卡片边框或分割线重叠。服务状态、服务配置、偏好设置、本地数据、固定操作区和底部导航之间统一保留 `24px` 的纵向间距。DJ Voice Style 选择器只显示当前值，不在选择框下重复显示声音风格说明。

桌面端 Radio 页面：

```css
.radio-shell {
  width: min(100%, 816px);
  margin-inline: auto;
}
```

桌面宽屏可以通过背景留白、轻微环境层和底部胶囊导航平衡视觉，但不在左右两侧堆放功能面板。

Library、Taste、Programs 和 Settings 可以使用更宽的管理容器：

```css
.management-shell {
  width: min(100%, 840px);
  margin-inline: auto;
}

.settings-shell {
  width: min(100%, 832px);
  margin-inline: auto;
}

.profile-shell {
  width: min(100%, 848px);
  margin-inline: auto;
}
```

MVP 原型中的管理页面统一使用单列布局，不拆分为复杂后台式多栏。后续真实响应式产品可以在超宽屏做辅助信息侧栏，但核心表单和列表仍应保持上述主内容宽度。

### 4.4 页面内边距

* Prototype Canvas：左右统一 `56px`
* Prototype Top：顶部统一 `40px`
* Prototype Bottom：底部预留 `128px`
* Mobile：左右不小于 `20px`
* Tablet：左右不小于 `28px`
* Desktop Radio：左右不小于 `32px`
* Desktop Management：左右 `40px–56px`
* 顶部安全区：至少 `24px`
* 底部内容需预留导航和安全区：至少 `104px`

移动端：

```css
padding-bottom: calc(104px + env(safe-area-inset-bottom));
```

### 4.5 间距系统

采用 **4px 基础网格**，主要布局使用 8px 倍数。

```css
--kr-space-1: 4px;
--kr-space-2: 8px;
--kr-space-3: 12px;
--kr-space-4: 16px;
--kr-space-5: 20px;
--kr-space-6: 24px;
--kr-space-8: 32px;
--kr-space-10: 40px;
--kr-space-12: 48px;
--kr-space-16: 64px;
--kr-space-20: 80px;
```

推荐使用规则：

* 图标与文字：`8px`
* 表单标签与输入框：`8px`
* 同组控件：`12px`
* 卡片内部：`16px–24px`
* 页面区块之间：`32px–48px`
* Radio 仪式感区块之间：`40px–64px`

### 4.6 Radio 页面垂直结构

Radio 主页面的空状态、播放态和生成中状态必须共享同一套页面骨架。状态变化只替换中间内容，不改变内容 rail、组件宽度、组件高度、底部输入框位置和底部导航位置。

Radio 页面在 `960 × 1600px` 原型画布中分为两层：

| 层级 | 宽度与位置 | 内容 |
|------|------------|------|
| 顶部品牌工具区 | `x 56 / y 40 / w 848 / h 64` | Logo、KORADIO、用户头像、主题切换 |
| Radio 内容 rail | `x 72 / w 816`，垂直贯穿画布 | 时间状态区、播放器/空状态/生成区、队列、DJ 状态栏、DJ 对话区、底部输入框 |

Radio 内容 rail 内的主要组件必须左右对齐，不能因为状态、文案长度、队列内容或骨架屏变化而自动变宽。

原型固定 slot：

| 组件 | 坐标与尺寸 | 约束 |
|------|------------|------|
| 时间状态区 | `x 72 / y 128 / w 816 / h 148` | 三态保持同一位置、同一字号 |
| 状态主内容区 | `x 72 / y 292 / w 816 / h 408` | 空状态、播放器或生成中核心内容在此替换 |
| 当前播放器卡片 | `816 × 408px` | 仅播放态显示，填满状态主内容区 |
| 队列区 / 骨架队列 | `x 72 / y 724 / w 816 / h 300` | 空、播放、生成中状态同宽 |
| DJ 状态栏 | `x 72 / y 1048 / w 816 / h 64` | 状态文字变化不改变尺寸 |
| DJ 对话区 | `x 72 / y 1132 / w 816 / h 224` | 独立 dialogue well，三态同宽同高 |
| Radio 场景输入框 | `x 72 / y 1372 / w 816 / h 88` | 固定在底部 Tab 栏上方 |
| 底部胶囊导航 | `x 170 / y 1480 / w 620 / h 88` | 五个等宽 tab slot |

页面内容保持 PRD 定义的固定顺序：

```text
品牌区
↓
时间 / 日期 / ON AIR
↓
当前播放器
↓
QUEUE
↓
DJ 状态栏
↓
DJ 对话与串讲
↓
场景输入
↓
底部胶囊导航
```

首屏重点是时间、`ON AIR` 和当前播放状态。真实产品实现可以滚动，但高保真生图原型必须按上表固定 slot 出图，不通过压缩垂直间距解决内容溢出。

三态不可变项：

* 顶部品牌工具区、Logo、字标、头像、主题按钮。
* Radio 内容 rail 的 `x 72 / w 816`。
* 时间状态区坐标、时间字号、日期字号、状态行位置。
* DJ 状态栏、DJ 对话区、底部输入框、底部胶囊导航。
* Radio Tab 选中底尺寸和五个 tab slot 宽度。

Radio 场景输入框在三个状态中位置完全一致：

* 宽度：`816px`
* 高度：`88px`
* 水平居中
* 画布坐标：`x 72 / y 1372`
* 与底部胶囊导航间距：`20px`
* 下方不显示状态文字、连接状态、步骤摘要或辅助说明

### 4.7 生图原型模式

生图原型模式用于 `prompt.md` 中 15 张高保真原型图。该模式优先保证同一组件跨状态稳定，使用精确坐标和固定 slot；响应式实现中的 `min()`、`max()`、断点、滚动和自适应高度不进入生图提示词的关键布局约束。

Radio 三态状态差异白名单：

| 区域 | 04 空节目 | 05 正在播放 | 06 生成中 |
|------|-----------|-------------|-----------|
| 时间状态词 | `LIVE`，绿色点 | `ON AIR`，绿色点 | `TUNING`，中性色点 |
| 状态主内容区 | 空状态标题和引导文案 | `816 × 408px` 播放器 | 生成标题、说明、`640 × 72px` 中性色波形 |
| 队列区 | `QUEUE · 0 TRACKS` 和空提示 | `QUEUE · 4 TRACKS` 和四行歌曲 | `QUEUE · PREPARING` 和四行骨架 |
| DJ 状态栏 | `LIVE` | `PLAYING` | `THINKING` |
| DJ 对话区 | DJ 待命自然段 | DJ 串讲自然段 + 用户弱气泡 | 用户弱气泡 + `Tuning your station...` |
| 底部输入框 | `Say something to the DJ...` | `Say something else to the DJ...` | `Generating...`，禁用发送 |

生图原型不得改变：

* 固定 slot 的 `x / y / w / h`。
* Logo、头像、时间、状态点、图标按钮、主播放按钮、Tab 选中底的尺寸。
* Radio 内容 rail、DJ 状态栏、DJ 对话区、输入框、底部导航的左右对齐。
* 04/05/06 的底部输入框和 Tab Bar 垂直位置。

生图验收允许 `4px` 以内的边缘误差；同一轮三态出图中，同一组件之间的相对尺寸不得出现肉眼可见差异。若使用通用生图模型仍无法稳定保持坐标，下一轮原型应改用 HTML 或 Figma 渲染作为基线图，再把生图作为风格参考。

### 4.8 底部胶囊导航

所有主要页面使用固定底部胶囊式 Tab Bar，以图标为主，不显示常驻文字。

推荐导航项：

```text
Radio / Library / Taste / Programs / Settings
```

规格：

* 高度：`88px`
* 最大宽度：`620px`
* 原型画布宽度：`620px`
* 移动端宽度：`calc(100% - 32px)`
* 圆角：`999px`
* 内边距：`8px`
* 原型图标容器尺寸：`40 × 40px`
* 工程默认图标容器尺寸：`40px`
* 原型 Tab slot：5 个等宽 `124 × 88px`
* 原型选中底：`88 × 64px`，位于当前 tab slot 中心
* 单项最小点击区域：`44 × 44px`
* 原型画布底部距离：`32px`
* 实际移动端底部距离：`12px + safe area`
* 背景模糊：`20px`
* 边框：`1px solid var(--kr-color-border-subtle)`

选中状态不使用大面积绿色。推荐使用高对比中性色胶囊：

* Dark：浅色圆形或圆角底，深色图标
* Light：深色圆形或圆角底，白色图标

绿色仅可作为选中项旁边的小型 `LIVE` 状态点。

由于导航不显示文字，必须提供：

* `aria-label`
* 键盘 Focus 状态
* 桌面端 Hover Tooltip
* 清晰、互不混淆的图标

```css
.bottom-nav {
  position: fixed;
  left: 50%;
  bottom: calc(var(--kr-prototype-nav-bottom, 32px) + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(calc(100% - 32px), 620px);
  height: 88px;
  padding: 8px;
  border-radius: 999px;
  background: color-mix(
    in srgb,
    var(--kr-color-surface) 82%,
    transparent
  );
  border: 1px solid var(--kr-color-border-subtle);
  backdrop-filter: blur(20px) saturate(120%);
}
```

---

## 5. 核心组件微规范

### 5.1 通用圆角

```css
--kr-radius-sm: 10px;
--kr-radius-md: 14px;
--kr-radius-lg: 20px;
--kr-radius-xl: 24px;
--kr-radius-2xl: 32px;
--kr-radius-3xl: 56px;
--kr-radius-full: 999px;
```

使用建议：

* 标签和小状态块：`10px`
* 输入框和普通按钮：`14px`
* 普通卡片：`20px`
* Profile、Programs、Settings 等信息卡片：`20px`
* Radio 核心卡片：`24px`
* Detail Sheet 浅色节目面顶部：`56px`
* Detail Sheet 串讲词/歌词卡片：`32px`
* 底部导航：`999px`

同一页面中不应混用过多不同圆角。除底部胶囊导航、标准正圆元素和 Detail Sheet 的全屏浅色节目面外，卡片、面板和输入容器应使用更柔和的 `20–24px` 圆角，避免旧版 `16px` 卡片在不同页面中混用造成产品感不统一。

---

### 5.2 固定比例媒体与圆形元素

所有头像、封面、圆形按钮、状态点和图标按钮都必须先定义固定比例容器，再放入图像或图标。不得依赖卡片高度、文字行高或父级 Flex 拉伸来决定形状。

#### 通用规则

```css
.kr-square-media {
  width: var(--kr-media-size);
  height: var(--kr-media-size);
  aspect-ratio: 1 / 1;
  flex: 0 0 var(--kr-media-size);
  min-width: var(--kr-media-size);
  min-height: var(--kr-media-size);
}

.kr-circle-media {
  border-radius: 50%;
  overflow: hidden;
}

.kr-square-media > img,
.kr-circle-media > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}
```

生成原型图或实现 UI 时，所有圆形头像都应理解为“固定尺寸裁切区域内的标准正圆”。如果源图片不是 1:1 比例，应在不可见裁切区域内居中裁切，再显示为圆形头像。圆形头像只显示圆形图像本身，周围不要出现额外框线、角点或底板，不能把图片或蒙版非等比拉伸成椭圆。

#### 固定比例清单

| 元素 | 尺寸 | 形状 | 约束 |
|------|------|------|------|
| 档案列表头像 | `160 × 160px` | 标准圆形 | 只显示圆形头像本身，不能随档案卡片高度拉伸 |
| 创建档案头像上传 | `144 × 144px` | 标准圆形 | 默认图形居中，编辑按钮可叠在右下角 |
| 顶部用户头像 | `64 × 64px` | 标准圆形 | 与主题按钮共用顶部工具尺寸，不放大成装饰图 |
| 歌曲列表小封面 | `64 × 64px` | 圆角方形 | `10–12px` 圆角，不裁成圆形 |
| Radio 当前封面 | `132 × 132px` | 圆角方形 | 不抽取背景色，不被播放器卡片拉伸 |
| Detail Sheet 封面 | 不使用 | 不使用 | Detail Sheet 仅显示简洁歌曲文字，不显示专辑封面 |
| 图标按钮 | `64 × 64px` | 圆形或小圆角 | 点击区域固定，不因图标大小变化 |
| 主播放按钮 | `96 × 96px` | 标准圆形 | 播放/暂停状态切换不改变尺寸 |
| 状态点 | `12 × 12px` | 标准圆形 | 不随文字行高变成椭圆；紧凑辅助状态可使用 `6px` |

图像生成提示词中涉及固定比例元素时，统一使用 `64 × 64px` 这种明确写法，不使用星号连接宽高。需要圆形时同时写明“只显示标准正圆，不显示额外框线或底板、不得生成椭圆或纵向拉伸”。

---

### 5.2.1 全局品牌锁定与顶部工具区

所有页面中只要出现 Logo、`KORADIO` 字标、顶部头像、主题按钮、设置按钮、返回按钮或其它同类顶部工具元素，都必须复用同一套组件规格。不得因为页面类型不同而重新设计 Logo 尺寸、字标字号、图标按钮大小、头像大小、对齐方式或间距。页面可以没有品牌区，但一旦出现品牌元素，就必须使用以下规格。

| 元素 | 原型坐标与尺寸 | 视觉规则 |
|------|----------------|----------|
| 顶部品牌工具区 | `x 56 / y 40 / w 848 / h 64` | 一级页面默认顶部工具行；二级页面可只使用其中的返回按钮和字标 |
| Logo 图标 | `x 56 / y 48 / w 48 / h 48` | 单色几何低细节广播图标 |
| KORADIO 字标 | `x 120 / y 56 / w 160 / h 32` | `20px`，`600`，字距 `0.12em` |
| 顶部用户头像 | `x 744 / y 40 / w 64 / h 64` | 标准正圆，不显示额外底板 |
| 主题切换按钮 | `x 840 / y 40 / w 64 / h 64` | 标准圆形图标按钮 |
| 顶部设置按钮 | `64 × 64px` | 与主题切换按钮同尺寸，使用同一图标按钮样式 |
| 顶部返回按钮 | `64 × 64px` | 位于内容列左侧或顶部工具行左侧，图标视觉中心对齐 |

Logo 图标与字标共同构成一个品牌整体，不允许在不同页面或不同状态中改变图标尺寸、字标字号、字间距或二者间距。头像、主题按钮、设置按钮和返回按钮属于同一顶部工具组件族，不允许被模型放大成装饰元素，也不允许缩小成普通列表图标。

如果品牌 lockup 出现在 `816px`、`848px`、`840px` 或 `832px` 内容列内，组件尺寸仍保持不变，只改变整体 x 坐标以贴合当前内容列左边缘。若只显示 `KORADIO` 字标而不显示 Logo，字标仍使用 `20px`、`600`、`0.12em`，高度保持 `32px`，不得生成新的小号品牌字标。

---

### 5.3 按钮 Buttons

#### 尺寸

* Compact：高度 `48px`
* Default：高度 `64px`
* Large：高度 `80px`
* 圆角：`14px`
* 左右内边距：`16px–20px`
* 图标按钮：固定 `64 × 64px`

#### Primary Button

主按钮使用高对比黑白色，不使用绿色填充。

Dark：

```css
background: #f2f4f7;
color: #111317;
```

Light：

```css
background: #191b1f;
color: #ffffff;
```

适用于：

* 发送场景
* 保存配置
* 创建档案
* 重试关键任务
* 确认主要操作

#### Secondary Button

```css
background: var(--kr-color-surface-elevated);
color: var(--kr-color-text-primary);
border: 1px solid var(--kr-color-border);
```

适用于测试连接、导入、编辑、复用场景等次级操作。

#### Ghost Button

```css
background: transparent;
color: var(--kr-color-text-secondary);
border: 1px solid transparent;
```

适用于关闭、返回、更多、折叠队列等低优先级操作。

#### 状态变化

Hover：

```css
filter: brightness(1.04);
transform: translateY(-1px);
```

Active：

```css
filter: brightness(0.96);
transform: translateY(0) scale(0.98);
```

Disabled：

```css
opacity: 0.38;
cursor: not-allowed;
transform: none;
```

Focus：

```css
outline: none;
box-shadow:
  0 0 0 2px var(--kr-color-bg),
  0 0 0 4px var(--kr-color-accent);
```

Focus Ring 可以使用绿色，但只作为可访问性提示，不代表成功状态。

---

### 5.4 播放器控制

播放、暂停、上一首、下一首使用通用播放器符号，不引入需要学习的广播设备图标。

主播放按钮：

* 尺寸：`96 × 96px`
* 圆形
* 使用 Primary 高对比填充
* 播放与暂停切换不改变按钮尺寸
* 图标视觉中心需进行光学校正

次级控制：

* 尺寸：`40–44px`
* 默认使用 Text Secondary
* Hover 提升到 Text Primary
* Active 使用轻微缩放

主控制区常驻：

```text
Previous / Play-Pause / Next
```

辅助操作常驻：

```text
Like / More
```

不喜欢、收藏节目、查看来源等操作放入主播放器更多菜单或节目历史详情，不放入全屏 Detail Sheet 的沉浸节目界面。

---

### 5.5 当前歌曲信息

专辑封面使用小尺寸，不成为视觉主角。全屏 Detail Sheet 例外：不显示专辑封面，只保留简洁歌曲文字。

推荐尺寸：

* Mobile：`64 × 64px`
* Tablet / Desktop：`132 × 132px`
* Detail Sheet：不显示封面

圆角：`10px–12px`

封面必须保持 1:1 正方形比例，不因所在行高或卡片高度被压缩、拉伸或裁成椭圆。封面不可向整体背景提取主色，也不使用大面积彩色模糊背景。

歌曲名称使用 Body Large 或 H3，歌手与专辑使用 Body Small。超长歌曲名最多显示两行，歌手名最多一行。

---

### 5.6 输入框 Inputs

#### Default

```css
min-height: 48px;
padding: 12px 14px;
border-radius: 14px;
background: var(--kr-color-surface);
border: 1px solid var(--kr-color-border);
color: var(--kr-color-text-primary);
box-shadow: none;
```

#### Hover

```css
border-color: var(--kr-color-border-strong);
```

#### Focus

```css
border-color: var(--kr-color-accent);
box-shadow:
  0 0 0 3px var(--kr-color-accent-soft);
```

#### Error

```css
border-color: var(--kr-color-error);
box-shadow:
  0 0 0 3px color-mix(
    in srgb,
    var(--kr-color-error) 14%,
    transparent
  );
```

#### Disabled

```css
background: var(--kr-color-bg-elevated);
color: var(--kr-color-text-disabled);
opacity: 0.72;
```

普通场景输入框可使用自动扩展的多行输入：

* 最小高度：`52px`
* 最大高度：`132px`
* 输入文字：`15px / 23px`
* 发送按钮固定在右下或右侧
* 生成期间保留输入内容，但禁用重复发送
* 达到长度限制时显示字符计数

Radio 主页面底部场景输入框是固定底部组件，不使用自动扩展高度：

* 尺寸：`816 × 88px`
* 位置：`x 72 / y 1372 / w 816 / h 88`，底部距画布 `140px`
* 内边距：左右 `24px`
* 右侧控件：语音图标区 + `64 × 64px` 圆形发送按钮
* 空状态占位：`Say something to the DJ...`
* 播放态占位：`Say something else to the DJ...`
* 生成中：输入框内部显示 `Generating...`，发送按钮禁用
* 输入框下方不显示连接状态、步骤摘要或任何辅助状态文字

---

### 5.7 卡片 Cards

#### 内边距与内容网格

所有卡片都必须先确定统一的内容内边距，再放置文字、图标、按钮、头像或封面。同一张卡片内：

* 内容与上边框、下边框的距离必须一致。
* 内容与左边框、右边框的距离必须一致。
* 右上角状态、右侧箭头、右下角按钮或小封面必须落在同一组内边距网格内。
* 不在卡片右下角孤立放置日期、时间或低优先级元数据，除非该页面明确需要，并且与其它内容保持同一内边距。

推荐内边距：

| 卡片类型 | 内边距 |
|----------|--------|
| 紧凑列表行 | `16px` |
| 标准管理卡片 | `20px` |
| Profile 档案卡片 | `32px` |
| Radio 当前播放器卡片 | `28px` |
| Radio 其它核心卡片 | `24px` |

Radio 当前播放器使用纵向等分布局：顶部媒体信息、进度条和底部控制区之间由剩余空间均匀分配；播放器内容与上、下边框均保持 `28px`，不得再通过单独的 `margin-top` 或 `margin-bottom` 形成不对称留白。
| Detail / 摘要卡片 | `24px` |
| 检测结果卡片 | `24px` |

Profile 档案卡片使用固定三列结构：

```text
32px inset
160px avatar
32px gap
content column
32px gap
88px action rail
32px inset
```

档案卡片高度固定为 `256px`，相邻卡片间距为 `32px`；头像、档案信息和右侧箭头垂直居中。当前档案的 `CURRENT` 标签放在右侧操作区顶部，不再显示最近使用时间。创建档案卡高度为 `212px`。

#### 普通管理卡片

```css
border-radius: 20px;
background: var(--kr-color-surface);
border: 1px solid var(--kr-color-border-subtle);
box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
```

#### Radio 核心卡片

```css
border-radius: 24px;
background:
  linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.025),
    rgba(255, 255, 255, 0)
  ),
  var(--kr-color-surface);
border: 1px solid var(--kr-color-border-subtle);
```

Radio 页面不应为每个区块都使用独立悬浮卡片。时间、状态和 DJ 串讲可以直接排版在背景上，只将需要明确边界的播放器、队列和输入区卡片化。

#### Hover Card

仅可点击卡片出现 Hover：

```css
transform: translateY(-1px);
border-color: var(--kr-color-border);
box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
```

Dark 模式阴影应极弱，主要通过边框和表面亮度建立层次。

---

### 5.8 队列 Queue

队列采用编辑列表样式，不使用大块歌曲卡片。

Radio 主页面中的队列区宽度固定为 `816px`，必须与播放器、DJ 状态栏和底部输入框左右对齐。

单行高度：

* Compact：`52px`
* Default：`60px`

结构：

```text
序号 / 播放状态
歌曲信息
歌手
时长或更多操作
```

当前曲目通过以下组合表达：

* 标题使用 Text Primary
* 其他曲目使用 Text Secondary
* 序号位置显示简化动态波形
* 左侧可增加 `2px` 绿色状态线
* 不使用整行绿色背景

队列生成中使用 3–5 条骨架项。队列为空时只保留区块标题和简洁引导，不展示大尺寸插画。

---

### 5.9 DJ 状态栏

DJ 状态栏是打开 Detail Sheet 的主要入口。

推荐结构：

```text
● KORADIO                         PLAYING  ›
```

或：

```text
KORADIO
● SPEAKING NOW                            ›
```

规格：

* Radio 页面宽度：`816px`
* 高度：`64px`
* 圆角：`20px`
* 背景：Surface
* 边框：Border Subtle
* 点击区域覆盖整行
* 状态点：`12px`
* 状态文字：等宽字体、全大写、`14px`

状态映射：

* `LIVE`：绿色静态点
* `PLAYING`：绿色点或低频呼吸
* `SPEAKING`：绿色点配合柔和波形
* `THINKING`：中性色扫描动画
* `PAUSED`：灰色静态点
* `OFFLINE`：错误色或灰色，并显示文字

---

### 5.9.1 DJ 对话区

DJ 对话区用于承载 DJ 串讲、用户场景输入回显和生成中状态。它是节目对话区域，不是聊天列表。

Radio 主页面原型规格：

* 坐标与尺寸：`x 72 / y 1132 / w 816 / h 224`
* 背景：`rgba(17, 19, 23, 0.32)`
* 上下边界：`1px solid var(--kr-color-border-subtle)`
* 内边距：`24px`
* DJ 文案宽度：`768px`
* 用户弱气泡最大宽度：`520px`
* 用户弱气泡圆角：`18px`

内容规则：

* DJ 内容使用自然段排版，不进入气泡。
* DJ 段落下方可以显示 `22:46 · REPLAY` 等小型等宽元数据。
* 用户原始输入使用右对齐弱气泡，气泡只比背景高一层亮度。
* 生成中状态先显示用户弱气泡，再显示 `Tuning your station...` 和灰色点阵。
* 对话区不得出现机器人头像、连续聊天气泡、社交聊天颜色、输入建议按钮或大面积绿色背景。

三态必须保留对话区边界，即使空状态只有一句待命文案，也要显示同一块 `816 × 224px` dialogue well。

---

### 5.10 ON AIR 状态

`ON AIR` 是 Koradio 的核心品牌元素，但不应被设计成高饱和红色广播灯牌。

推荐表现：

```text
● ON AIR
```

* 状态点：绿色
* 文本：等宽字体
* 字号：`11–12px`
* 字距：`0.1em`
* 状态点仅在播放或节目已准备完成时亮起

当本地服务连接但尚未播放时，显示：

```text
● LIVE
```

当服务未连接时：

```text
○ OFFLINE
```

---

### 5.11 Radio Detail Sheet

Detail Sheet 是当前节目的全屏沉浸界面，而不是覆盖在 Radio 页面上的窄浮层。打开后覆盖完整产品画布，不露出底层 Radio 页面、顶部品牌区或底部主导航。用户可通过顶部拖动条或右上角关闭按钮收起，播放不中断。

规格：

* 全屏覆盖：`x 0 / y 0 / w 960 / h 1600`
* 顶部拖动条：`x 438 / y 32 / w 84 / h 6`
* 关闭按钮：`x 840 / y 40 / w 64 / h 64`
* DJ 状态区：`x 80 / y 76 / w 720 / h 40`
* 声波区：`x 0 / y 160 / w 960 / h 280`
* 浅色节目面：`x 0 / y 420 / w 960 / h 1180`，顶部圆角 `56px`
* 节目面专属内容列：`x 56 / w 848`；该值仅用于 Detail Sheet，不改变其他页面族内容列
* 节目单名称：`x 56 / y 484 / w 848`，字号 `60px`，行高 `68px`
* 歌曲信息：`x 56 / y 584 / w 848`
* 歌曲进度：`x 56 / y 636 / w 848 / h 28`
* 串讲词/歌词卡片：`x 56 / y 700 / w 848 / h 700`，圆角 `32px`；保留 `40px` 内边距，正文行在可用高度内均匀纵向分布
* 节目整体进度条：`x 56 / y 1456 / w 768 / h 48`
* 单一播放/暂停按钮：约 `x 848 / y 1452 / w 56 / h 56`
* 声波区使用 `64` 根确定性竖条，从左至右逐根以白灰与状态绿交替

色面：

* 深色声场区：`#090A0C`
* 纯白节目面：`#FFFFFF`
* 浅灰文本卡：`#F5F3F6`
* 浅色面主文本：`#14161A`
* 浅色面次要文本：`#6E737A`

Detail Sheet 内部优先级：

```text
DJ 状态区
声波图
节目单名称
正在播放的歌曲信息
歌曲播放进度条
串讲词或歌词卡片
节目整体进度条
单一播放/暂停
```

07 串讲态和 08 歌词态必须共用同一套固定骨架，只替换状态词、歌曲文案和主内容卡文字。

DJ 段落播放时，串讲词卡片为主。歌曲播放时，歌词卡片为主。两种状态都不显示专辑封面、上一首、下一首、喜欢按钮、更多按钮、音量按钮或传统底部播放器控制台。

当前句或当前歌词行使用浅色面主文本；已读内容降至浅灰；未播放内容使用中灰。避免使用大面积绿色文字高亮，可使用非常轻的词级绿色柔光或小状态点辅助定位，不使用绿色侧边条。

---

### 5.12 Toast 与错误提示

Toast 只用于非阻断反馈：

* 已记住你的偏好
* 配置已保存
* 反馈保存失败
* 已切换到下一首

持续时间：

* 普通成功：`2400ms`
* 警告：`4000ms`
* 错误：保持到用户关闭，或至少 `5000ms`

阻断错误应在相关区块内联显示，不能只使用 Toast。例如 Codex 未配置时，应在场景输入区显示错误和 Settings 入口。

---

## 6. 用户体验与动效细节

### 6.1 动效原则

Koradio 的动效不用于制造活跃感，而用于表达声音、状态和空间关系。

动效重点只放在：

* 播放与暂停
* DJ 状态切换
* 波形变化
* Detail Sheet 打开与关闭
* 队列生成
* 加载和服务检测
* 导航选中状态

避免：

* 大幅弹跳
* 高频闪烁
* 过度缩放
* 卡片持续浮动
* 页面切换时大面积视差
* 多个区域同时进行高强度动画

### 6.2 全局时间参数

```css
--kr-duration-instant: 100ms;
--kr-duration-fast: 160ms;
--kr-duration-base: 220ms;
--kr-duration-slow: 320ms;
--kr-duration-sheet: 420ms;

--kr-ease-standard: cubic-bezier(0.2, 0, 0, 1);
--kr-ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
--kr-ease-exit: cubic-bezier(0.4, 0, 1, 1);
--kr-ease-spring-soft: cubic-bezier(0.22, 1, 0.36, 1);
```

常规 Hover 和颜色变化：

```css
transition:
  color 160ms var(--kr-ease-standard),
  background-color 160ms var(--kr-ease-standard),
  border-color 160ms var(--kr-ease-standard),
  opacity 160ms var(--kr-ease-standard);
```

按钮位移与缩放：

```css
transition:
  transform 160ms var(--kr-ease-standard),
  filter 160ms var(--kr-ease-standard);
```

Detail Sheet：

```css
transition:
  transform 420ms var(--kr-ease-enter),
  opacity 320ms var(--kr-ease-standard);
```

### 6.3 波形状态

波形根据系统状态使用不同表现。

#### THINKING

* 低速扫描或从左至右的点阵流动
* 不模拟真实音频
* 动画周期：`1600–2200ms`

#### SPEAKING

* 使用柔和的人声式波形
* 柱体高度变化有限
* 动画周期：`500–900ms`
* 当前句切换时不做闪烁

#### PLAYING

* 常规播放组件使用 12–24 根竖条；Detail Sheet 使用 64 根竖条
* 高度随播放状态变化
* 不要求与真实频谱完全同步
* 最大高度差不超过容器高度的 70%

#### PAUSED

* 波形停止
* 保留当前柱形，或切换为缓慢呼吸
* 不应继续呈现明显播放节奏

#### ERROR / OFFLINE

* 波形消失
* 显示静态状态图标和文字

### 6.4 加载状态

加载状态应反映具体任务阶段，而不是统一使用无限旋转图标。

普通界面默认只展示简洁状态：

```text
TUNING YOUR STATION...
SEARCHING FOR TRACKS...
PREPARING THE VOICE...
CONNECTING...
```

高级用户可展开查看详细过程：

```text
Codex planning
Music search
Lyrics retrieval
TTS generation
Queue preparation
```

#### 场景生成

* 输入区保留用户原文
* 发送按钮进入禁用状态
* DJ 状态变为 `THINKING`
* 队列区域展示骨架
* 不显示虚假的进度百分比
* 超时或失败后恢复输入能力

#### 骨架屏

骨架屏只模拟真实内容结构，不应铺满整个页面。

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--kr-color-surface) 0%,
    var(--kr-color-surface-hover) 50%,
    var(--kr-color-surface) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1600ms linear infinite;
}
```

### 6.5 空状态

空状态应保持克制，不使用大型卡通插画。

结构建议：

```text
简洁图标或状态符号
一句状态说明
一句操作引导
一个主要操作
```

Radio 空状态：

```text
NO SESSION ON AIR

告诉 DJ 你现在正在做什么，
或者想让这一段时间听起来怎样。
```

Library 空状态：

```text
还没有导入音乐

可以先搜索一首歌，
或导入你的网易云歌单。
```

Taste 空状态：

```text
你的品味还在形成

播放、跳过和喜欢都会帮助
Koradio 更准确地理解你。
```

空状态按钮最多一个主要操作和一个文字链接。

### 6.6 降级体验

系统发生局部失败时，应尽可能保留节目连续性。

* TTS 失败：继续播放歌曲，保留文字 DJ
* 歌词失败：继续播放，显示静态歌曲信息
* 波形不可用：使用模拟波形
* 单曲不可播放：自动跳至下一首
* 反馈保存失败：播放不中断，按钮状态回滚
* 历史音频缺失：保留文字串讲
* 主题保存失败：回滚到上次主题

降级提示使用 Warning，而不是 Error，除非核心任务已经无法继续。

### 6.7 页面切换

底部导航页面切换使用淡入和轻微纵向位移：

```css
opacity: 0 → 1;
transform: translateY(4px) → translateY(0);
duration: 220ms;
```

不使用横向滑动，避免让五个一级页面产生层级误解。

### 6.8 无障碍与 Reduce Motion

所有正式组件必须支持：

* WCAG AA 文本对比度
* 完整键盘操作
* 可见 Focus Ring
* 屏幕阅读器语义
* 浏览器缩放至 200%
* `aria-live` 播报重要状态
* 状态颜色与文字双重表达
* 基础点击区域为 `44 × 44px`；播放主按钮、发送按钮等强调控件按组件规格使用更大尺寸

支持系统减少动态效果：

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }

  .waveform {
    animation: none !important;
  }
}
```

波形暂停后仍需通过 `PLAYING`、`SPEAKING` 等文字表达当前状态。

---

## 7. Tailwind Token 参考

```js
/** @type {import("tailwindcss").Config} */
export default {
  darkMode: ["class", '[data-theme="dark"]'],

  theme: {
    extend: {
      colors: {
        kr: {
          primary: "var(--kr-color-primary)",
          "on-primary": "var(--kr-color-on-primary)",

          accent: "var(--kr-color-accent)",
          "accent-hover": "var(--kr-color-accent-hover)",
          "accent-soft": "var(--kr-color-accent-soft)",

          bg: "var(--kr-color-bg)",
          "bg-elevated": "var(--kr-color-bg-elevated)",

          surface: "var(--kr-color-surface)",
          "surface-elevated": "var(--kr-color-surface-elevated)",
          "surface-hover": "var(--kr-color-surface-hover)",
          "surface-active": "var(--kr-color-surface-active)",

          border: {
            subtle: "var(--kr-color-border-subtle)",
            DEFAULT: "var(--kr-color-border)",
            strong: "var(--kr-color-border-strong)",
          },

          text: {
            primary: "var(--kr-color-text-primary)",
            secondary: "var(--kr-color-text-secondary)",
            tertiary: "var(--kr-color-text-tertiary)",
            disabled: "var(--kr-color-text-disabled)",
            inverse: "var(--kr-color-text-inverse)",
          },

          success: "var(--kr-color-success)",
          warning: "var(--kr-color-warning)",
          error: "var(--kr-color-error)",
          info: "var(--kr-color-info)",
        },
      },

      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "SFMono-Regular",
          "SF Mono",
          "Roboto Mono",
          "JetBrains Mono",
          "IBM Plex Mono",
          "monospace",
        ],
      },

      borderRadius: {
        "kr-sm": "10px",
        "kr-md": "14px",
        "kr-lg": "20px",
        "kr-xl": "24px",
        "kr-2xl": "32px",
        "kr-3xl": "56px",
      },

      spacing: {
        18: "4.5rem",
        22: "5.5rem",
        26: "6.5rem",
      },

      maxWidth: {
        prototype: "960px",
        radio: "816px",
        profile: "848px",
        management: "840px",
        settings: "832px",
        sheet: "960px",
        reading: "40rem",
      },

      transitionDuration: {
        160: "160ms",
        220: "220ms",
        320: "320ms",
        420: "420ms",
      },

      transitionTimingFunction: {
        "kr-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "kr-enter": "cubic-bezier(0.16, 1, 0.3, 1)",
        "kr-exit": "cubic-bezier(0.4, 0, 1, 1)",
        "kr-soft": "cubic-bezier(0.22, 1, 0.36, 1)",
      },

      boxShadow: {
        "kr-focus":
          "0 0 0 2px var(--kr-color-bg), 0 0 0 4px var(--kr-color-accent)",
        "kr-card": "0 8px 24px rgba(0, 0, 0, 0.08)",
        "kr-sheet": "0 -16px 48px rgba(0, 0, 0, 0.18)",
      },

      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1200px",
        "2xl": "1440px",
      },
    },
  },
};
```

---

## 8. 高保真原型页面规范

本节用于约束 `prompt.md` 中 15 张高保真原型图。若本节与通用响应式规范发生冲突，当前原型阶段以本节为准。

### 8.1 统一生成约束

所有界面共同遵循：

* 画布固定为 `960 × 1600px`，宽高比 `3:5`。
* 只生成完整产品 UI 截图，不出现设备模型、浏览器外框、系统窗口、透视角度和营销落地页布局。
* 默认使用 Dark Theme：背景 `#090A0C`，表面 `#111317`，低亮度边框 `#20242A`。
* 原型阶段使用固定坐标和固定 slot；响应式自适应只用于工程实现，不进入关键出图约束。
* 页面内容距离产品外框的安全边距统一为 `56px`；内容列在安全区域内按页面类型居中。
* 所有页面中出现的同类组件必须使用同一组件族规格：品牌 lockup、头像、封面、图标按钮、状态点、输入框、底部导航、卡片内边距和卡片圆角不得在不同页面中自行变体。
* 全局品牌和工具组件尺寸固定：Logo `48 × 48px`，`KORADIO` 字标 `160 × 32px`，顶部头像与顶部图标按钮统一 `64 × 64px`，状态点默认 `12 × 12px`，底部 Tab Bar `620 × 88px`，tab slot `124 × 88px`，图标容器 `40 × 40px`，选中底 `88 × 64px`。
* 一级页面底部使用固定胶囊导航，规格为 `620 × 88px`，距离画布底部 `32px`。
* 主按钮使用黑白高对比，不使用绿色填充。绿色只用于 `ON AIR`、`LIVE`、`PLAYING`、`CONNECTED` 等状态点或细线。
* Radio 类页面保持 `x 72 / w 816` 中央单列，不拆分左右栏；管理类页面保持单列，不做后台式侧边栏。
* Radio 04/05/06 必须共用同一套顶部品牌工具区、时间状态区、DJ 状态栏、DJ 对话区、底部输入框和底部导航坐标。
* 图片和专辑封面只作为小尺寸识别信息，不抽取背景色，不主导页面视觉。
* 空状态、异常状态和加载状态都必须提供清晰的下一步，不使用大型卡通插画或庆祝插画。

### 8.2 页面尺寸与内容矩阵

| 编号 | 界面 | 内容宽度与布局 | 状态 / 导航 | 必须出现的核心内容 |
|------|------|----------------|-------------|--------------------|
| 01 | 本地服务未连接 | `560px` 错误恢复区域垂直居中；顶部品牌区在统一安全边距内 | `○ OFFLINE`；底部导航选中 Settings | 极简断开波纹状态图标、标题“Koradio 服务未连接”、辅助说明、主按钮“重新连接”、次按钮“前往 Settings”、诊断信息 `LOCAL SERVICE · NOT RESPONDING` |
| 02 | 本地档案选择 | `848px` 中央内容列；三张 `256px` 档案卡片；卡片统一 `32px` 内边距与间距 | 第一张卡片 `CURRENT`；右上角可放设置图标 | 全局品牌 lockup、标题“选择你的电台档案”、`160 × 160px` 标准圆形头像、档案名/昵称/品味标签、`212px` 虚线创建卡片、本地存储说明；不显示最近使用时间 |
| 03 | 创建电台档案 | `848px` 单列表单 | 返回箭头；保存后进入 Radio | `144 × 144px` 标准圆形头像上传、电台名称、昵称、常听风格标签、默认场景多行输入、`80px` 表单控件、主按钮“保存并进入 Koradio”、Ghost 按钮“稍后设置偏好”、本地隐私说明 |
| 04 | Radio 空节目状态 | `x 72 / w 816` Radio rail；输入框 `x 72 / y 1372 / w 816 / h 88` | `● LIVE`，不显示 `ON AIR`；导航选中 Radio | 固定顶部品牌与头像、固定时间区、`NOW PLAYING`、`NO SESSION ON AIR`、`QUEUE · 0 TRACKS`、`816 × 64px` DJ 状态栏、`816 × 224px` dialogue well、固定场景输入框；输入框下方不显示状态文字 |
| 05 | Radio 正在播放 | 与 04 共用同一套 Radio slot；播放器、队列、DJ 状态栏、dialogue well 和输入框同宽 | `● ON AIR`；DJ 状态 `PLAYING`；导航选中 Radio | `816 × 408px` 当前播放器、132px 小封面、歌曲信息、进度 `01:42 / 02:35`、96px 圆形暂停按钮、816px 队列 4 首、当前曲目 2px 绿色状态线、DJ 自然段串讲、用户弱气泡、固定场景输入框 |
| 06 | Radio 生成节目中 | 与 04 共用同一套 Radio slot；骨架队列、DJ 状态栏、dialogue well 和输入框同宽 | 时间区状态 `TUNING`；DJ 状态 `THINKING`；导航选中 Radio | `PREPARING SESSION`、`TUNING YOUR STATION...`、`640 × 72px` 中性色低速波形、816px 队列骨架、用户原始输入、`Tuning your station...`、固定禁用输入框内显示 `Generating...`；输入框下方不显示步骤摘要 |
| 07 | Detail Sheet：DJ 串讲 | `x 0 / y 0 / w 960 / h 1600` 全屏沉浸节目界面；浅色节目面内使用 Detail 专属 `x 56 / w 848` 内容列 | `● SPEAKING NOW`；无底部导航 | 顶部 `84 × 6px` 拖动条、`64 × 64px` 关闭按钮、64 柱交替绿白全宽声波区、纯白节目面、60px 节目标题、`If · Bread`、歌曲进度、`848 × 700px` 串讲词卡片、768px 节目整体进度、单一播放/暂停 |
| 08 | Detail Sheet：歌词跟随 | 与 07 共用同一套全屏固定骨架 | `● PLAYING`；无底部导航 | 64 柱交替绿白全宽声波区、纯白节目面、60px 节目标题、`Space Song · Beach House`、歌曲进度、`848 × 700px` 歌词卡片、当前歌词高亮、768px 节目整体进度、单一播放/暂停 |
| 09 | Library 音乐库 | `840px` 单列管理页 | 导航选中 Library | 标题“音乐库”、副标题、本地音乐数量、搜索框、5 条搜索结果、试听图标、加入候选池按钮、导入网易云歌单卡片、服务状态 `CONNECTED`、已导入来源 |
| 10 | Taste 品味档案 | `840px` 单列管理页 | 导航选中 Taste | 标题“你的音乐品味”、编辑品味按钮、品味概览摘要、极简圆环或线性分布、10–12 个常听风格标签、喜欢的声音、避雷规则、场景偏好、最近反馈 |
| 11 | Taste 编辑状态 | `840px` 单列编辑页 | 二级编辑态，底部固定操作区优先 | 返回箭头、标题“编辑音乐品味”、上次更新时间、风格标签编辑、避雷规则输入行、场景规则卡片、Ghost 按钮“取消”、主按钮“保存品味”、数量限制说明 |
| 12 | Programs 节目历史列表 | `840px` 单列管理页；本周摘要三组信息使用等宽三分网格定位，第一组靠左、时长组水平居中、歌曲组靠右，每组上下两行左对齐 | 导航选中 Programs；分段控制器 All 选中 | 标题“节目”、搜索图标、本周收听摘要、150–180px 节目卡片、日期时间、收藏图标、节目标题、场景摘要、曲目数量、总时长、封面叠放或歌曲名 |
| 13 | 节目历史详情 | `840px` 单列详情页；节目队列使用 `96px` 行高、`64 × 64px` 低饱和封面和上下各 `16px` 内边距 | 导航选中 Programs | 返回箭头、收藏和更多、`PROGRAM ARCHIVE`、节目元数据、`YOUR SCENE` 摘要卡片、复用场景、重播串讲、DJ 开场自然段、节目队列、节目反馈摘要 |
| 14 | Settings 服务配置 | `832px` 单列设置页；服务配置输入框 `64px` 高；主要区块间距 `24px` | `● 3 SERVICES ONLINE`；导航选中 Settings | 标题“设置”、服务状态四行、TTS `DEGRADED` 黄色状态、服务配置输入框、密钥遮蔽、Theme Mode、DJ Language、DJ Voice Style、本地数据、底部固定操作区；声音风格选择器下方不显示重复说明 |
| 15 | Settings 连接检测结果 | `832px` 单列检测页 | 导航选中 Settings | 标题“服务检测”、摘要 `3 OF 4 SERVICES AVAILABLE`、四张检测结果卡片、TTS 展开修复建议、局部降级说明、主按钮“返回 Radio”、次按钮“修改配置” |

### 8.3 页面间一致性检查

出图或实现前按以下规则检查：

1. 页面画布是否为 `960 × 1600px`，且所有主要内容使用对应页面的固定内容列。
2. 内容列宽是否匹配页面类型：Radio `816px`、Profile `848px`、管理页 `840px`、Settings `832px`；服务异常恢复区域保持 `560px`；Detail Sheet 是否覆盖完整 `960 × 1600px` 画布，并在浅色节目面内使用仅对该页面族生效的 `848px` 专属内容列。
3. 底部胶囊导航是否为 `x 170 / y 1480 / w 620 / h 88`；二级编辑态不与导航重复抢占底部，Detail Sheet 打开后不显示底部导航。
4. Radio 三个主页面状态是否共享 `x 72 / w 816` 内容 rail，播放器、队列、DJ 状态栏、dialogue well 和输入框是否左右对齐。
5. Radio 底部输入框是否固定为 `x 72 / y 1372 / w 816 / h 88`；输入框下方是否没有状态文字、连接状态或步骤摘要。
6. Radio 空状态是否只显示 `LIVE`，播放态才显示 `ON AIR`；生成中使用 `TUNING` / `THINKING`，不可误用绿色成功状态。
7. Radio 三态的 Logo、头像、时间、状态点、Tab 图标和 Radio 选中底是否保持同一尺寸。
8. DJ 对话区是否保留 `816 × 224px` dialogue well 边界，DJ 文案是否为自然段，用户输入是否为右对齐弱气泡。
9. 主按钮是否保持黑白高对比；绿色是否只用于状态点、焦点环、细线或少量波形活动柱。
10. 管理页是否保持单列、克制表单和列表样式，不出现排行榜、商城、后台表格、营销 Banner 或侧边栏。
11. 空状态、加载状态和错误状态是否都有明确恢复入口，且不使用大型插画或虚假进度百分比。
12. 所有页面中的品牌 lockup、头像、封面、图标按钮、状态点和底部导航是否复用同一尺寸体系。
13. 卡片内容是否使用统一内边距，避免右下角孤立元数据、按钮或封面贴近边框；普通卡片圆角是否使用 `20px`，Radio 核心卡片是否使用 `24px`，Detail Sheet 浅色节目面顶部是否使用 `56px` 圆角，串讲词/歌词卡片是否使用 `32px` 圆角。
14. Detail Sheet 07/08 是否共用同一套全屏骨架，只替换状态词、歌曲文案和主内容卡文字；是否没有专辑封面、上一首、下一首、喜欢按钮、更多按钮和传统底部播放器控制台。

---

## 9. 设计执行约束

为了保持 Koradio 的统一气质，实际设计和开发中应遵循以下约束：

1. **绿色不作为大面积品牌填充色。** 它只负责在线、播放、成功、Focus 等状态表达。
2. **Radio 页面不做桌面多栏化。** 即使在宽屏上，也保持中央窄列的私人电台体验。
3. **不让专辑封面控制主题颜色。** 封面只作为歌曲识别信息。
4. **不将所有内容放进卡片。** 页面需要保留呼吸感和编辑排版感。
5. **点阵或等宽字体仅用于时间、数字和状态标签。**
6. **DJ 不是聊天机器人。** DJ 串讲以节目文本呈现，用户输入才使用弱聊天语义。
7. **动效以状态反馈为目的。** 不为装饰增加持续动画。
8. **所有失败状态必须有恢复入口。** 包括重试、跳转 Settings、修改输入或继续降级播放。
9. **图标导航必须提供 Tooltip 和无障碍标签。**
10. **深浅主题分别校准。** Light 主题不得只是 Dark 主题的颜色反转。
