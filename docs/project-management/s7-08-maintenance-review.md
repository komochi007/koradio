# S7-08 项目整体 Review 与维护性优化

> 日期：2026-07-30
> 状态：进行中
> 范围：仓库结构、分支、生成物、代码维护性、文档一致性与历史任务复盘

## 审查基线

- 基线提交：`e69639d`，`main` 与 `origin/main` 一致，工作树 clean。
- 并发状态：执行开始时仅 S7-08 任务处于 active；其余可见 Koradio 任务均为 idle 或 not loaded。
- 生成物：`artifacts/macos/` 约 15 GiB，包含 20 个旧 DMG、多个重复 cache、staging、安装备份和历史 run 目录。
- 当前保留版本：`Koradio-0.0.16-arm64.dmg`；构建缓存统一归并到 `artifacts/macos/cache/`。
- 代码规模热点：Server 入口约 1763 行；Radio、Programs、Taste、Library、Settings 页面约 561–924 行；`app.css` 与 `radio.css` 分别约 1815、1383 行。
- 当前自动化基线：Node 24.18.0 下 86 unit、60 contract、93 integration、35 component 用例通过；Node 26 会触发与产品无关的 `localStorage` 测试失败。
- 当前 lint 阻塞：ESLint 扫描被忽略但实际存在的打包产物内第三方 Python runtime；排除 `artifacts/**` 后 lint 通过。

## 分支核验

- `codex/s0-08-simplify-git-workflow` 指向 `8a2f605`，与 `main` 分叉 2/77 个提交。
- `e0abc52` 与 `main` 中 `6e6540c` 对 `AGENTS.md`、`docs/project-management/git-workflow.md` 的文件树完全一致。
- `8a2f605` 记录的 S0-08 进行中状态已由 `4e33e1e` 的完成状态及后续任务表演进吸收；该分支无独有产品实现。
- 结论：本地与远端旧分支已删除，未创建保留标签。

## 文档冲突

- 阶段描述仍停留在 S6-04/S7-07，与已完成 S6-05、UX-10 和当前 S7-08 不一致。
- README、Context、Roadmap 和任务表部分位置仍把 Apple TTS 写成当前事实；当前实现已统一为 Qwen3-TTS 8-bit、中文 Serena、英文 Ryan、macOS 15+ arm64。Apple TTS 只属于 S7-06 历史验收，并已被 UX-10 取代。
- README 将已存在的 Library、Taste、native helper 写成目标结构，并保留“数据库依赖未决定”等失效描述。
- Architecture 将未安装的 Zustand 写成当前技术事实；真实实现使用 React feature-local state、TanStack Query 与 Audio Engine facade。
- VDA-11 阶段报告位于设计根目录，容易被误认为当前视觉事实源，应归档到 `design/assets/reports/` 并保留 superseded 导航。

## 代码审查结论

1. `apps/server/src/bootstrap/app.ts` 同时承担依赖装配、安全中间件、31 个路由、请求解析和错误映射，重复 `try/catch` 与错误 envelope 是主要维护成本。
2. SQLite persistence 存在生产代码双重类型断言，应改为统一运行时 row parser，保持 repository 接口与 schema 不变。
3. 前端五个体验入口把远程数据、页面状态、视图和交互揉在单文件；图标、时长格式化、错误文本和日期工具重复。
4. 大型 CSS 同时包含主题、Shell、管理页、Radio 和响应式覆盖，固定坐标与重复声明使视觉回归难以定位。
5. Audio Engine 与节目生成管线虽较长，但属于显式状态机和跨层策略，本轮不以行数为由盲目拆分。

## 历史任务复盘

对全部可见 Koradio 任务做摘要级扫描，并重点复核开发前 Review、S6/S7 验收、上线前优化 V1–V3、TTS 替换及回滚任务。反复出现的问题为：

- Mock、Live 与临时验收数据边界不清，造成运行模式和数据来源误判。
- 大文件持续追加补丁，曾反复引发队列、滚动、固定坐标与视觉回归。
- Node 运行时未在入口预检，环境漂移被误诊为产品测试失败。
- macOS 包装每次复制完整 runtime/cache 且不清 staging，生成物持续累积。
- 代码修改、正式用户数据操作与本机安装验证混在同一任务，扩大了回滚和归属判断成本。

本报告只记录脱敏结论，不保存原始用户输入、Taste 内容、Provider 正文、个人路径或临时文件内容。

## 优先级

1. P0：运行时预检、生成物隔离、包装清理、分支与文档事实源。
2. P1：Server route plugin 与 SQLite row parser。
3. P1：前端容器/视图/hooks 和共享 UI 工具。
4. P2：CSS 分层，在完整视觉门保护下逐步合并重复声明。

## 验证记录

- 生成物清理后 `artifacts/macos/` 由约 15 GiB 降至 744 MiB，只包含共享缓存与 `Koradio-0.0.16-arm64.dmg`。
- 包装脚本静态检查通过；真实构建、DMG 验证和最终质量门完成后继续补充。
