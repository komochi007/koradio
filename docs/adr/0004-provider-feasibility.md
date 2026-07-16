# ADR 0004：Provider 可行性与发布边界

> 状态：已接受
> 日期：2026-07-16
> 决策人：项目所有者
> Task：S0-06
> 取代：无
> 被取代：无

## 1. 背景

Koradio 当前仍处于 Documentation-first 阶段，没有产品源码、Provider adapter、Secret Store、测试替身或可运行服务。S1 最小骨架和 S3 Provider 后端都需要提前确认 Codex、网易云和 Apple 系统 TTS 的调用边界、授权风险、失败行为与可重复测试方案。

本 ADR 只记录 S0-06 的 Provider 可行性验证结果、唯一技术裁决与发布边界，不创建产品实现，不把任何 Provider 原始响应固定为公共 contract，也不把本机已配置的真实凭据写入仓库。脱敏验证证据见 [S0-06 Provider 验证报告](evidence/0004-provider-feasibility.md)。

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

### 方案 A：Codex CLI + TypeScript NetEase `linuxapi` Adapter + bundled macOS TTS helper

- 做法：Codex 通过本地 `codex exec` 非交互调用；网易云由 Backend 内的 TypeScript Adapter 使用 Node `crypto` 实现最小 `linuxapi` 请求，不调用官方 CLI、不直接依赖 C# 仓库、不增加 .NET runtime；TTS 由 bundled Swift helper 调用 `AVSpeechSynthesizer`。
- 收益：搜索、歌词、歌单详情和短期播放 URL 已在同一协议上完成脱敏真实采样；实现可留在既定 Node 24 Local Service 内，不改变 Browser owns playback 和 Provider Port 边界。
- 代价：该协议是非官方、逆向兼容接口，可能随网易云服务变化失效；部分 VIP、地区或版权受限资源仍需要逐曲降级。
- 风险：只接受用于项目所有者受控本机 Personal Local Preview；任何公开下载前必须重新验证协议、网易云条款、内容授权和替代路径，不得把当前可调用性解释为公开分发许可。
- 验证结果：同一 `linuxapi` 流程的歌曲搜索、歌词、歌单详情和播放 URL 均返回 `200`；播放资源返回 `audio/mpeg`、支持 Range `206` 和 CORS `*`，非法歌曲 ID 返回逐曲 `404`。项目所有者已于 2026-07-16 明确接受本方案。

### 方案 B：NetEase OpenAPI/`ncm-cli`

- 做法：通过开放平台 API 或 `@music163/ncm-cli` 获取搜索、歌词、歌单和播放地址。
- 收益：官方授权链与应用凭据边界更清晰。
- 代价：当前应用未授权批量播放 URL 接口；`ncm-cli play` 只返回 `orpheus://` 唤端结果。
- 风险：继续等待会阻塞本地个人预览；未来公开发布仍可重新评估为替代路线。
- 验证结果：不作为 v1 Personal Local Preview 的运行时方案，`ncm-cli` 仅保留为 S0 历史验证证据。

### 方案 C：直接依赖 `wwh1004/NeteaseCloudMusicApi`

- 做法：把该 C#/.NET Standard 2.0 库纳入 Koradio 运行时。
- 收益：已有 `SongUrl`、搜索、歌词和歌单 Provider 实现，MIT 许可证允许代码使用与修改。
- 代价：仓库最后提交为 2021-02-22，原上游已归档；直接依赖会给既定 Node 包装增加 .NET runtime，而当前机器未安装 `dotnet`。
- 风险：扩大安装包、签名、公证、漏洞维护和跨架构验证范围。
- 验证结果：不采用直接依赖；只把其协议实现作为可审计参考，在 TypeScript 中做最小重实现。

### 方案 D：S0 不绑定真实 Provider，只做 Mock

- 做法：S1/S3 先用 Mock Provider 推进，真实 Provider 延后。
- 收益：短期脚手架最快。
- 代价：核心生成和音乐能力的可用性风险后移，违反 S0-06 任务目的。
- 风险：发布前才发现 Codex、网易云或 TTS 无法满足 P0。
- 验证结果：不采用。

## 5. 当前裁决

**接受方案 A**：v1 Personal Local Preview 使用 Codex CLI、TypeScript NetEase `linuxapi` Adapter 与 bundled Apple TTS helper。NetEase Adapter 必须由 Koradio Backend 直接实现最小协议，不运行 `ncm-cli`，不依赖或捆绑 `wwh1004/NeteaseCloudMusicApi` 二进制，也不引入 .NET runtime。

该裁决关闭 S0-06 的技术选型阻塞和 S0 阶段门，但只证明当前受控本机的技术可行性，不授权公开下载。S3 实现必须补齐 schema、超时、取消、URL 安全校验、逐曲失败和 fixtures；S7 在任何公开分发前重新验证网易云条款、协议可用性、内容边界与替代路线。

### 5.1 Codex Provider

- v1 使用用户配置的本地 `codex` 命令路径，通过参数数组启动 `codex exec`。
- Adapter 必须使用非交互模式、受控工作目录、明确 sandbox、超时和取消；不得拼接 shell command。
- 结构化输出应优先使用 `--output-schema` 与 `--output-last-message`，并在 adapter 边界用 Koradio Zod schema 再校验。
- `codex exec` 的进度、warning、session metadata 和 token usage 不进入 Program、History 或普通日志；schema 失败只记录稳定错误码、correlation ID 和脱敏摘要。
- Codex 未认证、命令缺失、超时 60 秒、非 JSON 或 schema 无效均阻断本次生成，并保留用户输入和旧节目。

### 5.2 NetEase Music Provider

- v1 Adapter 在 `apps/server` 内使用 Node `crypto`、固定端点和结构化 payload 实现最小 `linuxapi` 协议，只覆盖 PRD 必需的搜索、歌词、歌单详情/曲目与播放 URL；不得复制完整第三方服务或暴露通用代理接口。
- Adapter 只能从 Backend 发起 NetEase API 请求；Browser 只接收归一化 metadata 与经过校验的短期 `resolvedAudioRef`，不得接触协议参数、Cookie 或原始 Provider response。
- 当前 Personal Local Preview 的免费公开曲目可无登录解析；后续若引入账号 Cookie，必须先通过 Secret Store、最小权限、过期和清除设计，不得把 Cookie 写入配置文件、URL、日志或 fixture。
- 播放 URL 视为不可信短期资源：只允许 `http:`/`https:`，校验已批准的网易云媒体域名、DNS/重定向、MIME `audio/*`、Range 行为和大小上限；不得持久化完整 URL。
- 搜索无结果按 PRD 换关键词重试 2 次；逐曲 `code != 200`、空 URL、VIP/地区/版权限制、15 秒超时、限流、协议变化或 schema 异常均映射为稳定脱敏错误并尝试下一首。
- 官方 OpenAPI 和 `ncm-cli` 不进入 v1 运行时；未来公开发布若改回官方接口，必须创建替代 ADR 并重新完成 Provider 验证。

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
| NetEase | 搜索歌曲、取得稳定 source identity、歌词、歌单曲目、播放 URL | 可行；`linuxapi` 最小真实调用覆盖全部必需能力，播放资源通过 Range/MIME/CORS 验证 | S3 用 TypeScript 最小 Adapter、Zod schema、URL allowlist、超时和脱敏 fixtures 实现 |
| TTS | 本机标准语音合成 DJ 音频，失败文字降级 | 可行；系统语音与临时 AIFF 合成通过 | S7 将 Swift helper 纳入签名、公证、双架构和 Gatekeeper 验收 |

## 7. 失败、重试与降级策略

| 场景 | 边界行为 | 用户结果 |
|---|---|---|
| Codex 命令缺失、未认证、错误退出、超时或 schema 无效 | 结束 generation job；不保存原始正文；保留 scenario 和旧节目 | 阻断本次生成，提示重试或前往 Settings |
| NetEase 协议不可用、15 秒超时、限流、上游 schema 变化或非法响应 | 标记音乐服务不可用；不创建空节目 | Settings 显示不可用；Radio 提示服务暂不可用 |
| NetEase 搜索无结果 | 换关键词重试 2 次 | 仍无结果时不创建节目 |
| 歌词缺失或歌词 schema 异常 | 标记 lyric unavailable | 播放继续，Detail Sheet 显示无歌词状态 |
| 单曲不可播放或播放 URL 失效 | 标记 runtime failure 并尝试下一首 | 可继续时自动切歌，全部失败时提示重新生成 |
| TTS helper、语音或合成失败 | 保存文字 DJ segment，不创建伪音频 timeline item | 歌曲继续播放，显示文字串讲 |

## 8. Mock Fixture 计划

| Provider | Fixture 类别 | 必须覆盖 |
|---|---|---|
| Codex | `valid-plan`、`invalid-json`、`schema-missing-field`、`timeout`、`provider-error` | intro 必填、language/persona、musicQueries、playlistIntent、原始正文脱敏 |
| NetEase | `search-success`、`search-empty`、`lyric-success`、`lyric-empty`、`playlist-tracks`、`playurl-success`、`playurl-unavailable`、`invalid-id`、`rate-limited`、`malicious-url`、`mime-mismatch` | source identity、playability flags、歌词时间轴、分页、逐曲错误码、URL/MIME/重定向/Range 校验 |
| TTS | `voices-success`、`voice-missing`、`synthesis-success`、`timeout`、`invalid-metadata`、`helper-missing` | voice identifier 校验、duration/marker、FileStore ref、取消与迟到输出忽略 |

Fixture 必须脱敏并存放在后续测试任务确定的测试目录中；真实 Provider 不进入常规 PR 质量门。

## 9. 发布与合规风险

| Provider | Personal Local Preview | 未来公开发布风险 |
|---|---|---|
| Codex | 可由项目所有者本机已登录 Codex CLI 调用 | 不捆绑用户 auth；公开文档必须说明用户自备 Codex 配置，CI/诊断不得泄露 `auth.json`、API key 或 prompt 正文 |
| NetEase | `linuxapi` 搜索、歌词、歌单和播放 URL 在受控本机验证可行；仅允许项目所有者个人预览 | 非官方协议可能失效且不等于内容授权；公开下载前必须重新确认条款、内容边界、协议可用性和受控替代 Provider |
| Apple TTS | 本机标准系统语音可用，完全本地 | Swift helper、bundled Node 和 app 必须在 S7 完成 Developer ID 签名、公证、Gatekeeper 和干净环境语音冒烟 |

当前结论允许关闭 S0 阶段门并进入 S1，但不允许公开下载、外部分发、内置网易云账号材料或把第三方原始响应作为 Koradio 公共 contract。

## 10. 实施与验证

| 项目 | 结果或计划 | 证据 |
|---|---|---|
| 实施路径 | 进入 S1；S3 在既定 Provider Port 后实现 TypeScript 最小 `linuxapi` Adapter 与 Mock，不引入 CLI、C# 库或 .NET | [tasks.md](../project-management/tasks.md) |
| 自动检查 | 本任务运行 Codex、NetEase 搜索/歌词/歌单/播放 URL、Range/MIME/CORS、非法 ID、TTS 合成和 Markdown 检查 | [验证报告](evidence/0004-provider-feasibility.md) |
| 人工/外部验证 | 对照 PRD、架构、AI_RULES、Codex 文档、候选仓库源码/MIT 许可证和用户明确裁决复核 | 本 ADR |
| 回滚或替代路径 | 若 `linuxapi` 在 S3 或本地预览中失效，则保留 Port/fixtures，停止真实调用并创建替代 ADR，改用受控官方 Provider 或调整 MVP 音乐边界 | Provider runtime failure |

## 11. 权威文档同步

| 文档 | 是否需要修改 | 原因或结果 |
|---|---|---|
| `docs/prd.md` | 是 | 移除网易云 API 地址/密钥配置和核心配置前置，改为内置 Provider 运行时健康状态 |
| `docs/user-flow.md` | 是 | 首次配置只要求 Codex，网易云与 TTS 自动检测 |
| `architecture.md` | 是 | Provider Port 不变；明确 Backend TypeScript `linuxapi` Adapter、非持久化能力状态和 URL 安全边界 |
| `design/design.md` | 是 | 保留 VDA-17 布局基线，将网易云视觉槽位的产品语义改为“内置·本地模式”只读状态 |
| `AI_RULES.md` | 是 | 完全离线时禁用 v1 真实存在的配置、测试与迁移控件，不再暗示网易云密钥表单 |
| `README.md` / `context.md` | 是 | 记录 ADR 0004 已接受、S0 关闭，但 Provider adapter 尚未实现 |
| 项目管理文档 | 是 | 标记 S0-06 已完成并同步 S0 阶段门关闭、S1 可开始 |

## 12. 后续任务

- S1-03：建立 Mock Provider health 与端到端 skeleton，不提前实现真实 Provider。
- S2-03：实现 Secret Store、File Store 与日志脱敏，为未来可选秘密与音频引用提供平台边界；v1 NetEase 不使用 Secret Store。
- S3-02：实现 Library 与音乐归一化，复验网易云播放 URL / audio ref。
- S3-05：实现 Codex、NetEase 与 TTS adapters、fixtures、超时、取消、恶意响应和媒体 URL 安全测试。
- S7-04：补齐 Provider 风险、隐私、安全和第三方说明；公开发布前复核网易云条款、内容边界和替代 Provider。
