# Koradio HTML 视觉原型

> 当前范围：VDA-01 HTML 原型骨架
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

## 边界

- 不包含产品框架、包管理器或生产配置。
- 不连接 Backend、Provider 或数据库。
- 不模拟真实播放、生成、配置保存或健康检查。
- 当前页面画布是 VDA-01 定位占位，不是已验收页面基线。
- Tokens、共享组件和页面视觉分别由 VDA-02 及后续页面族任务建立。
