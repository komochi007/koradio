# Koradio HTML 视觉原型

> 当前范围：VDA-01 HTML 原型骨架 + VDA-02 Tokens 与共享组件目录
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

所有展示数据来自 `../fixtures/pages.js`，固定且只用于视觉定位。

共享设计资产入口：

```text
catalog.html?theme=dark
catalog.html?theme=light
```

- `tokens.css`：Light / Dark 主题、排版、间距、圆角、组件尺寸、内容列和动效 Tokens。
- `components.css`：品牌、顶部工具、导航、按钮、输入、卡片、状态、媒体、队列、播放器和 Focus 基准组件。
- `catalog.html`、`catalog.css`、`catalog.js`：零构建组件目录与主题预览，不是产品页面。

## 边界

- 不包含产品框架、包管理器或生产配置。
- 不连接 Backend、Provider 或数据库。
- 不模拟真实播放、生成、配置保存或健康检查。
- 当前页面画布是 VDA-01 定位占位，不是已验收页面基线。
- Tokens 与共享组件已由 VDA-02 建立；15 页完整视觉仍由后续页面族任务建立。
