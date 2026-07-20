# S6-04 性能、缓存、长时播放与无障碍验收记录

> 验收日期：2026-07-20
> 任务：`S6-04` 完成性能、缓存、长时播放与无障碍回归
> 结论：通过

## 1. 验收范围与结论

本次验收按 [架构性能规则](../../architecture.md#16-performance-considerations)、[设计响应式规范](../../design/design.md#421-响应式布局族继承) 与 [无障碍规范](../../design/design.md#68-无障碍与-reduce-motion)，对当前已实现的 Browser Audio Engine、Library/Frontend/App Shell 缓存、五个一级产品页面和三组代表 viewport 执行确定性压力、三浏览器无障碍与视觉回归。

发现并关闭两个可观察缺口：高频 `timeupdate` 在 checkpoint 请求未返回时可能重复写入；Service Worker 会接管全部同源非 API GET，可能把动态 TTS/媒体路径纳入静态缓存。修复后 checkpoint 以发起时刻节流，Service Worker 只接管导航、`/`、`/index.html`、`/manifest.webmanifest` 与构建产物 `/assets/`，不改变 Audio Engine 事实源、公共 contract、页面骨架或领域 owner。

缓存容量、过期与清理策略均有实现和回归证据；八小时等价播放、三浏览器键盘/Focus/axe、Reduce Motion、代表 viewport、44px 导航命中区、200% 等价重排和截图全部通过。S6-04 验收标准成立，可以进入 S6-05 内部全质量门。

## 2. 缓存与资源边界

| 边界 | 容量 | 过期 | 清理策略 | 验证结果 |
|---|---:|---:|---|---|
| Library 搜索缓存 | 100 项 | 5 分钟 | 写入时清除过期项并按 LRU 淘汰；读取刷新顺序 | 通过 |
| Library 歌词缓存 | 500 项 | 60 分钟 | 同上 | 通过 |
| Library 播放解析缓存 | 100 项 | Provider 到期时间与 10 分钟上限取较小值 | 同上；短期 URL 不进 SQLite | 通过 |
| TanStack Query | 按当前活跃 query 集合 | 默认 stale 15 秒、无观察者 5 分钟 GC；Library 搜索 stale 5 分钟 | Query GC、Profile key 隔离和 mutation invalidation | 通过 |
| Audio 预加载 | 单个下一段 `<link rel="preload">` | 当前段切换 | 新预加载先移除旧 link；队尾、试听、停止和销毁均清理 | 通过 |
| Service Worker | 当前版本有限静态 App Shell 资源 | Cache 名版本化 | activate 删除旧版本；动态 route、API、TTS/媒体不进入 CacheStorage | 通过 |

`BoundedTtlCache` 压力测试连续写入 250,000 项，容量始终收敛为 512，推进时钟后 `prune()` 清零。当前机器观测耗时约 652 ms，堆增量约 31.2 MB，低于 5 秒与 64 MiB 的宽松回归上限。

bundled native TTS helper 尚未实现，因此架构中按 voice identifier、OS build 与合成参数建立持久 TTS 缓存的目标不构成本次当前实现验收项；其容量、过期和文件清理必须随 native helper 实装一起验证。

## 3. 长时播放与性能

| 检查 | 输入 | 必须结果 | 结果 |
|---|---:|---|---|
| 进度更新 soak | 八小时等价、每 250 ms 一次，共 115,200 次 | 快照持续更新，监听器集合不增长 | 通过 |
| checkpoint 节流 | 15 秒间隔 | 1,920 次周期写入；销毁边界额外 1 次，不出现同区间并发洪泛 | 通过 |
| 高频未决请求回归 | 同一区间 2,000 次 `timeupdate`，首个 PUT 保持未决 | 只产生 1 次 PUT | 通过 |
| Audio 资源 | 单 Audio、单预加载器、5 类媒体事件监听 | 不创建第二 Audio，不累积 preload 或事件监听 | 通过 |
| CPU/内存观察 | 当前 Node/jsdom 确定性环境 | 10 秒、64 MiB 宽松上限内完成 | 约 32 ms、9.9 MB，通过 |

这些结果证明当前纯前端状态更新、checkpoint 与资源集合有界，不代表真实 NetEase 媒体网络可连续播放八小时；真实 Provider 长期稳定性仍需在真实 Provider 产品运行组合实现后验证。

## 4. 无障碍、响应式与视觉

| 检查 | 覆盖 | 结果 |
|---|---|---|
| 自动无障碍 | Chromium、Firefox、WebKit；Radio、Library、Taste、Programs、Settings | 五页面均无 axe violation |
| 键盘与 Focus | Tab、左右方向键、Home、End、页面切换主标题、可见 Focus 样式 | 通过 |
| Reduce Motion | `prefers-reduced-motion: reduce` 与 Radio 持续波形 | 动画为 `none`，文字与操作保留 |
| 代表 viewport | `390×844`、`834×1194`、`1440×1200` | 无横向溢出；导航命中区均不小于 44px |
| 200% zoom | `1440×1200` 的 `720×600` CSS layout viewport 等价重排 | 核心 Settings 控件可见、无横向溢出、axe 通过 |
| 视觉基线 | `settings-zoom-200.png` 与现有 VDA-17/产品响应式截图 | 自动对比和人工复核通过 |

Firefox/WebKit 不重复执行 Chromium-only 几何截图和 CacheStorage 检查；它们继续执行五页面真实产品 axe、键盘/Focus 与 Reduce Motion 回归。对应能力在 Chromium 有直接几何/视觉证据，不属于关键功能跳过。

## 5. 验证记录

使用 Node.js `24.18.0`、pnpm `11.13.0` 和 Mock Provider 执行：

| 检查 | 结果 |
|---|---|
| `pnpm check` | 通过；19 个 unit 文件 79 个用例、7 个 contract 文件 58 个用例、14 个 integration 文件 76 个用例、7 个 component 文件 30 个用例、47 个 coverage 文件 243 个用例及 build 全部通过 |
| Coverage | statements 81.16%、branches 72.44%、functions 83.63%、lines 81.77% |
| `pnpm test:e2e` | 三浏览器共 94 个通过、65 个既有显式能力跳过、无失败 |
| S6-04 无障碍专项 | 5 个通过、4 个 Chromium-only 几何能力在 Firefox/WebKit 显式跳过 |
| `pnpm test:visual` | Chromium 确定性视觉门 1 个通过；S6-04 200% 截图同时在完整 E2E 通过 |
| CacheStorage 专项 | Chromium 证明 `/api/v1`、`/radio` 与 `/tts/` 不进入静态缓存，离线 App Shell 可用 |
| `git diff --check` | 通过 |

## 6. 剩余边界

- 未实现且未验证：真实 Codex + NetEase 产品运行组合、真实 Provider 媒体八小时播放、bundled native TTS helper 及其文件缓存、macOS 包装与系统辅助技术人工走查。
- 当前自动证据覆盖 WCAG AA 可自动检测规则、键盘/Focus、Reduce Motion、200% 等价重排与命中区；VoiceOver 的真实朗读顺序和语音反馈应在 S7 干净 macOS 产品包上人工复验。
- 本任务没有引入遥测、微服务、真实频谱、第二 Audio Engine 或新视觉体系；阻塞条件未发生。
