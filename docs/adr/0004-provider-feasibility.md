# ADR 0004：Provider 可行性与发布边界

> 状态：提议
> 日期：2026-07-16
> 决策人：项目所有者
> Task：S0-06
> 取代：无
> 被取代：无

## 1. 背景

Koradio 当前仍处于 Documentation-first 阶段，没有产品源码、Provider adapter、Secret Store、测试替身或可运行服务。S1 最小骨架和 S3 Provider 后端都需要提前确认 Codex、网易云和 Apple 系统 TTS 的调用边界、授权风险、失败行为与可重复测试方案。

本 ADR 只记录 S0-06 的 Provider 可行性验证结果与阻塞条件，不创建产品实现，不把任何 Provider 原始响应固定为公共 contract，也不把本机已配置的真实凭据写入仓库。脱敏验证证据见 [S0-06 Provider 验证报告](evidence/0004-provider-feasibility.md)。

## 2. 决策范围

### 包含

- Codex、网易云和 Apple 系统 TTS 的 v1 调用方式。
- 每个 Provider 的能力矩阵、失败边界、超时/重试/降级策略。
- Mock fixture 与 schema 采样计划。
- 当前 Personal Local Preview 与未来公开发布的 Provider 风险结论。

### 不包含

- Provider adapter 源码、contracts、测试代码或环境模板。
- 真实密钥、账号、原始敏感响应、播放直链或未脱敏日志。
- 改变 PRD 已定义的 Settings 字段、用户流程或视觉设计。
- 新增多音乐源、云 TTS、Personal Voice、远程服务或公开分发授权。

## 3. 约束与决策驱动因素

| 因素 | 必须满足的条件 | 证据来源 |
|---|---|---|
| 产品 | Codex 与网易云可用时，合法场景至少生成 1 首可播放歌曲和 1 段开场文字；TTS 失败只降级为文字 DJ | [PRD](../prd.md) |
| 架构 | Provider 只能通过 Backend Adapter/Port 访问；Provider response 先归一化，不能成为公共 API | [architecture.md](../../architecture.md) |
| 安全 | 密钥进入 OS Credential Store；Codex、网易云、歌词、媒体 URL 和 TTS 输出均视为不可信 | [AI_RULES.md](../../AI_RULES.md) |
| 工程 | 真实 Provider 不进入常规 PR 测试；普通测试使用 Port fakes 与脱敏 fixtures | [ADR 0001](0001-toolchain-and-quality.md) |
| 发布 | 当前只允许项目所有者受控本机 Personal Local Preview；公开下载后置并需要再次授权 | [ADR 0003](0003-macos-packaging.md) |

## 4. 候选方案

### 方案 A：Codex CLI + NetEase OpenAPI/`ncm-cli` + bundled macOS TTS helper

- 做法：Codex 通过本地 `codex exec` 非交互调用；网易云通过开放平台 API 与 `@music163/ncm-cli` 做最小验证与后续 adapter 输入；TTS 由 bundled Swift helper 调用 `AVSpeechSynthesizer`。
- 收益：与当前 PRD 的本地配置模型一致，不把外部服务直接暴露给 Browser；S0 已有本机真实验证路径。
- 代价：Codex 与网易云都依赖本机配置和外部账号状态；`ncm-cli` 当前公开命令可验证搜索、歌词和歌单，但没有直接暴露 Browser 可消费的播放 URL 命令。
- 风险：公开发布前必须确认网易云开放平台条款、播放 URL 接口授权和用户自备凭据边界。
- 验证结果：Codex JSON、网易云搜索/歌词/歌单、无凭据失败和 TTS 合成均完成脱敏验证；网易云官方文档确认存在“获取歌曲播放url”API，实测端点为 `/openapi/music/basic/song/playurl/get/v2`，但当前应用返回 `code: 300`、`应用未授权当前接口`，因此本方案尚不能作为已接受裁决。

### 方案 B：自建或第三方 NetEase HTTP API 服务

- 做法：Settings 继续填写网易云 API 地址，由 Koradio 调用第三方或自建 HTTP API。
- 收益：更贴近当前 PRD 字段“网易云 API 地址”，有机会直接返回播放 URL。
- 代价：第三方 API 合规、稳定性、维护和分发风险更高；可能需要额外本地服务或账号状态。
- 风险：公开发布时更难证明来源、授权、错误脱敏和升级可控。
- 验证结果：本任务没有可用的受控服务地址；不作为 S0 接受方案。

### 方案 C：S0 不绑定真实 Provider，只做 Mock

- 做法：S1/S3 先用 Mock Provider 推进，真实 Provider 延后。
- 收益：短期脚手架最快。
- 代价：核心生成和音乐能力的可用性风险后移，违反 S0-06 任务目的。
- 风险：发布前才发现 Codex、网易云或 TTS 无法满足 P0。
- 验证结果：不采用。

## 5. 当前裁决

S0-06 暂不接受任何方案作为完整 Provider 可行性裁决。**方案 A 是唯一保留候选**，但必须先解除网易云播放 URL 接口授权阻塞：当前 `ncm-cli` 凭据可完成搜索、歌词和歌单调用，也能复用签名链访问官方 `song/playurl/get/v2` 端点；该端点返回的稳定错误为“应用未授权当前接口”，说明问题位于开放平台应用权限而非本地 CLI 可用性或请求构造。

因此，S0 阶段门仍未关闭。后续只有在当前或替代网易云开放平台应用获得“获取歌曲播放url”接口授权，并完成脱敏成功响应采样、URL 安全校验方案和失败映射后，才能把本 ADR 更新为已接受或创建替代 ADR 关闭 S0-06。

### 5.1 Codex Provider

- v1 使用用户配置的本地 `codex` 命令路径，通过参数数组启动 `codex exec`。
- Adapter 必须使用非交互模式、受控工作目录、明确 sandbox、超时和取消；不得拼接 shell command。
- 结构化输出应优先使用 `--output-schema` 与 `--output-last-message`，并在 adapter 边界用 Koradio Zod schema 再校验。
- `codex exec` 的进度、warning、session metadata 和 token usage 不进入 Program、History 或普通日志；schema 失败只记录稳定错误码、correlation ID 和脱敏摘要。
- Codex 未认证、命令缺失、超时 60 秒、非 JSON 或 schema 无效均阻断本次生成，并保留用户输入和旧节目。

### 5.2 NetEase Music Provider

- S0 采用已安装的 `@music163/ncm-cli@0.1.6` 作为受控真实验证工具；后续 S3 adapter 不能依赖 `ncm-cli play`，应直接实现等价开放平台 HTTP 调用或由受控工具暴露可校验响应。
- DeviceSettings 仍保留网易云服务配置；凭据必须进入 OS Credential Store，API 只返回 `configured` / `available` / `unavailable` 和脱敏摘要。
- 已验证能力：歌曲搜索、无结果分支、歌词获取、歌单搜索和歌单曲目分页。
- 已定位但阻塞的能力：用户提供的网易云官方文档 `docId=3d2c9f695ff24f4ea37611614b7f7856` 对应“获取歌曲播放url”；实测端点 `/openapi/music/basic/song/playurl/get/v2` 存在，但当前应用未获授权。
- `ncm-cli play` 返回 `orpheus://` 唤端结果，不适合作为 Browser Audio Engine 的事实源，也不能替代 `resolvedAudioRef`。
- 解除 S0-06 阻塞前，S1-03 不应把真实 NetEase Adapter 当作可用依赖；只能使用 Mock Provider 或把 S1 继续置于 S0-06 依赖之后。
- 网易云健康检查 15 秒超时；搜索无结果按 PRD 换关键词重试 2 次；API key 缺失、凭据错误、限流、非法 ID 或响应 schema 异常均返回脱敏错误。

### 5.3 Apple System TTS Provider

- v1 保持 ADR 0003 与架构既定方向：使用 bundled macOS native helper 调用 `AVSpeechSynthesizer` 和已安装标准系统语音。
- Helper 由 Local Service 通过固定路径与参数数组启动；DJ 文本经结构化 stdin 传入，不进入 argv、URL、日志或错误正文。
- 每次合成前枚举并校验 voice identifier；当前机器验证存在 `Daniel` `en_GB`、`Tingting` `zh_CN` 等标准语音。
- 合成超时 45 秒、helper 缺失、语音不匹配、输出元数据非法、取消或写入失败均降级为文字 DJ，不阻止歌曲播放。
- Personal Voice、云 TTS、第三方 TTS 和用户自定义音色不进入 v1。

## 6. Provider 能力矩阵

| Provider | 必需能力 | S0 结论 | 后续验收 |
|---|---|---|---|
| Codex | 根据场景、taste、history 和偏好输出结构化节目计划 | 可行；本机 `codex exec` 返回 PRD 最小 JSON | S2/S3 用 Zod schema、`--output-schema`、超时和脱敏日志覆盖 |
| NetEase | 搜索歌曲、取得稳定 source identity、歌词、歌单曲目、播放 URL | 阻塞；搜索/歌词/歌单可行，官方播放 URL 端点存在但当前应用未授权 | 先开通 `song/playurl/get/v2` 权限并完成成功采样，再进入 S3 Adapter 实现 |
| TTS | 本机标准语音合成 DJ 音频，失败文字降级 | 可行；系统语音与临时 AIFF 合成通过 | S7 将 Swift helper 纳入签名、公证、双架构和 Gatekeeper 验收 |

## 7. 失败、重试与降级策略

| 场景 | 边界行为 | 用户结果 |
|---|---|---|
| Codex 命令缺失、未认证、错误退出、超时或 schema 无效 | 结束 generation job；不保存原始正文；保留 scenario 和旧节目 | 阻断本次生成，提示重试或前往 Settings |
| NetEase API key 缺失、凭据错误、播放 URL 未授权、15 秒超时、限流或非法响应 | 标记音乐服务不可用；不创建空节目 | Settings 显示不可用；Radio 提示修复配置或服务授权 |
| NetEase 搜索无结果 | 换关键词重试 2 次 | 仍无结果时不创建节目 |
| 歌词缺失或歌词 schema 异常 | 标记 lyric unavailable | 播放继续，Detail Sheet 显示无歌词状态 |
| 单曲不可播放或播放 URL 失效 | 标记 runtime failure 并尝试下一首 | 可继续时自动切歌，全部失败时提示重新生成 |
| TTS helper、语音或合成失败 | 保存文字 DJ segment，不创建伪音频 timeline item | 歌曲继续播放，显示文字串讲 |

## 8. Mock Fixture 计划

| Provider | Fixture 类别 | 必须覆盖 |
|---|---|---|
| Codex | `valid-plan`、`invalid-json`、`schema-missing-field`、`timeout`、`provider-error` | intro 必填、language/persona、musicQueries、playlistIntent、原始正文脱敏 |
| NetEase | `search-success`、`search-empty`、`lyric-success`、`lyric-empty`、`playlist-tracks`、`playurl-success`、`playurl-unauthorized`、`invalid-id`、`rate-limited`、`malicious-url` | source identity、playability flags、歌词时间轴、分页、错误码映射、URL/MIME/重定向校验 |
| TTS | `voices-success`、`voice-missing`、`synthesis-success`、`timeout`、`invalid-metadata`、`helper-missing` | voice identifier 校验、duration/marker、FileStore ref、取消与迟到输出忽略 |

Fixture 必须脱敏并存放在后续测试任务确定的测试目录中；真实 Provider 不进入常规 PR 质量门。

## 9. 发布与合规风险

| Provider | Personal Local Preview | 未来公开发布风险 |
|---|---|---|
| Codex | 可由项目所有者本机已登录 Codex CLI 调用 | 不捆绑用户 auth；公开文档必须说明用户自备 Codex 配置，CI/诊断不得泄露 `auth.json`、API key 或 prompt 正文 |
| NetEase | 本机已有 `ncm-cli` 和开放平台凭据，S0 可做搜索/歌词/歌单验证；播放 URL 权限未开通 | 不得内置项目凭据；公开下载前必须确认开放平台入驻、调用条款、播放 URL 接口授权和音乐内容边界 |
| Apple TTS | 本机标准系统语音可用，完全本地 | Swift helper、bundled Node 和 app 必须在 S7 完成 Developer ID 签名、公证、Gatekeeper 和干净环境语音冒烟 |

当前结论不允许 S0 阶段门关闭。它也不允许公开下载、外部分发、内置网易云凭据或把 `ncm-cli play` 作为 Koradio 播放事实源。

## 10. 实施与验证

| 项目 | 结果或计划 | 证据 |
|---|---|---|
| 实施路径 | 暂停依赖 S0-06 的 S1-03；先解除网易云播放 URL 授权，或由项目所有者裁决替代音乐 Provider/产品边界 | [tasks.md](../project-management/tasks.md) |
| 自动检查 | 本任务运行最小真实调用、无凭据、无结果、非法 ID、TTS 合成和 Markdown 检查 | [验证报告](evidence/0004-provider-feasibility.md) |
| 人工/外部验证 | 对照 PRD、架构、AI_RULES、Codex 非交互文档、NetEase CLI 文档和用户提供的网易云官方播放 URL 文档复核 | 本 ADR |
| 回滚或替代路径 | 若无法开通网易云播放 URL 权限，则停止相关实现并更新 PRD/架构/ADR，改为受控替代 Provider 或调整 MVP 音乐播放边界 | S0-06 阻塞条件 |

## 11. 权威文档同步

| 文档 | 是否需要修改 | 原因或结果 |
|---|---|---|
| `docs/prd.md` | 否 | 产品行为暂不改变；播放 URL 未授权先作为 S0 阻塞，不降低用户承诺 |
| `docs/user-flow.md` | 否 | 失败、重试和 TTS 降级沿用既有流程 |
| `architecture.md` | 否 | Provider Port 边界不变；本 ADR 只细化可行性 |
| `design/design.md` | 否 | UI、token、动效和无障碍不变 |
| `AI_RULES.md` | 否 | 现有 Provider、TTS、安全和测试规则足够约束后续实现 |
| `README.md` / `context.md` | 是 | 记录 ADR 0004 处于提议/阻塞状态，Provider adapter 尚未实现 |
| 项目管理文档 | 是 | 标记 S0-06 阻塞，并同步 S0 阶段门未关闭 |

## 12. 后续任务

- S0-06：开通或更换可调用网易云“获取歌曲播放url”的受控凭据，并完成脱敏成功采样。
- S1-03：解除 S0-06 阻塞后建立 Mock Provider health 与端到端 skeleton。
- S2-03：实现 Secret Store、File Store 与日志脱敏，为 Provider 凭据和音频引用提供平台边界。
- S3-02：实现 Library 与音乐归一化，复验网易云播放 URL / audio ref。
- S3-05：实现 Codex、NetEase 与 TTS adapters、fixtures、超时、取消、恶意响应和密钥脱敏测试。
- S7-04：补齐 Provider 风险、隐私、安全和第三方说明；公开发布前复核网易云开放平台条款。
