# UX-05 质量门与 Live 验收记录

> Task：UX-05
> 日期：2026-07-27
> 环境：macOS arm64、Node 24.18.0、临时 Live 数据目录
> 结果：通过

## 自动质量门

- `pnpm check` 通过：84 个 unit、60 个 contract、86 个 integration、33 个 component 和 263 个 coverage 用例全部通过；Statements 80.02%、Branches 71.60%、Functions 82.78%、Lines 80.70%，production build 成功。
- `pnpm test:visual` 通过；Radio、Library、Programs、Settings、Detail 和 200% 缩放基线已按 `LIVE` / `DEMO MODE`、全文 DJ、删除入口和恢复操作复核。
- 三浏览器 E2E 覆盖 Chromium、Firefox 和 WebKit；axe、键盘、Focus、44px 命中区、Reduce Motion、200% 重排、Toast、队列折叠、歌词、试听、节目删除和多标签播放租约均纳入最终回归。仅保留仓库原有、带明确原因的浏览器能力跳过。

## 真实 Live 验收

验收使用新建的 `/tmp/koradio-ux05-live.u7tW0n`，未读取、修改或清理现有 Koradio 正式数据；临时目录在验收后保留。

| 场景 | 脱敏结果 |
|---|---|
| 运行模式 | Production Server 以 `live` 启动，Health 返回 Live。 |
| 指定网易云歌单 | Provider 返回 403 首；进度最终为 `403 / 403`，Library `totalCount = 403`、`demoCount = 0`，第一页 100 首。 |
| 可用性统计 | 403 首均完成元数据导入，其中 Provider 标记 4 首当前不可播放；导入事务成功完成，没有半成功快照。 |
| 节目生成 | 真实 Codex、NetEase 和 Apple TTS 成功提交 Live 节目：5 首歌曲、3 段 DJ 串讲。 |
| 候选恢复 | 首批在线搜索结果全部无法解析播放地址时，生成器继续聚合最多 3 个策展关键词并回退同 Profile、同运行模式候选池，最终正常生成；Demo 数据未进入 Live 策展。 |
| DJ 全文与 TTS | 3 段 `text` 与 `displayText` 全部逐字一致，3 段均生成有效 TTS；首段受控音频读取成功。 |
| 音乐播放 | 首曲短期 HTTPS 媒体支持 Range，返回 `206`，验收读取 64 KiB 非空音频。 |
| 歌词 | 首曲持久化为 `available`；Chromium PWA 打开 Detail 后显示 930 字歌词。 |
| PWA 产品路径 | Chromium 中播放按钮进入“暂停”态，Detail 成功打开并显示歌词，无 page error。 |

真实 Provider 响应正文、媒体 URL、Session token、Codex 输出和完整 DJ/歌词内容均未写入本记录。

## 发现并关闭的问题

Live 冒烟首次复现 `PROGRAM_GENERATION_NO_PLAYABLE_TRACKS`：旧实现只使用第一个非空关键词的前 5 个搜索结果，临时不可播时不会尝试后续策展词或已导入候选池。现已改为：

1. 聚合计划中的最多 3 个去重搜索词；
2. 对候选逐项解析，跳过不可播项，直到达到节目曲目上限；
3. 在线候选不足时追加当前 Profile、当前 `originMode` 的可播放 Library 候选；
4. 所有候选均失败时才保持阻断，不创建空节目。

专项 unit/integration 回归覆盖候选合并、运行模式隔离、不可播降级与全量失败边界。

## 范围与保留项

- 验收没有删除任何正式数据、历史 Demo 数据或临时目录。
- 网易云仍为 Personal Local Preview 的非官方 Provider，公开分发限制不变。
- WebKit 对部分受控路由和视觉用例的既有显式跳过不代表产品功能豁免；适用的连接、生成、反馈、健康与 axe 路径仍在 WebKit 运行。
