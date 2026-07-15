# ADR 0004：Provider 技术与发布可行性

> 状态：提议
> 日期：2026-07-15
> 决策人：项目所有者
> Task：S0-06
> 取代：无
> 被取代：无

## 1. 背景

Koradio 当前仍处于 Documentation-first 阶段，仓库中没有 Provider Adapter、产品服务或可执行测试入口。PRD 需要 Codex 生成结构化节目、网易云提供音乐搜索与播放相关能力，并允许可选 TTS；架构要求所有外部响应先经过 Adapter 校验和归一化，密钥只能进入 OS Credential Store。

本任务已经证明 Codex 的本地非交互调用链可用，也确认网易云存在官方开放平台与个人开发者 CLI。项目所有者于 2026-07-15 决定 v1 不使用 Fish Audio，改用 Apple 系统 `AVSpeechSynthesizer`；该本机语音链路、失败处理和双架构 deployment target 已通过探针。当前剩余阻塞是网易云：桌面客户端已安装且用户确认已登录，但官方 `ncm-cli login --check` 仍因缺少开放平台 AppID/私钥而失败，无法验证搜索、歌词与浏览器可播资源。因此本 ADR 仍不能作为已接受的完整 Provider 实现依据。完整探针结果见[脱敏验证报告](evidence/0004-provider-feasibility-validation.md)。

## 2. 决策范围

### 包含

- Codex、网易云和可选 Apple 系统 TTS 的推荐接入形态、能力边界与版本探针。
- 鉴权、超时、重试、取消、降级和响应校验原则。
- 可重复 Mock fixture 计划与真实 Provider 测试边界。
- Personal Local Preview 与未来公开分发的授权风险和硬门。

### 不包含

- 不实现 Adapter、业务模块、公共 contract、播放引擎、配置页面或 Secret Store。
- 不把任何 Provider 原始响应、命令或字段冻结为 Koradio 公共 contract。
- 不保存真实密钥、登录态、原始用户数据或未经脱敏的 Provider 日志。
- 不改变 PRD 当前 `neteaseApiUrl` 字段；官方 CLI 路径与该字段的冲突必须在本 ADR 可接受后先由产品与架构权威文档裁决。

## 3. 约束与决策驱动因素

| 因素 | 必须满足的条件 | 证据来源 |
|---|---|---|
| 工程 | Provider 只能通过 Port/Adapter 进入系统；Codex 必须使用参数数组启动；原始响应先校验再映射 | [架构 Provider Ports](../../architecture.md)、[工程规则](../../AI_RULES.md) |
| 产品与流程 | 生成总时限 60 秒；音乐源 v1 只支持网易云；TTS 不可用时必须退回文字稿 | [PRD](../prd.md) |
| 安全与数据 | 密钥只进入 OS Credential Store；Frontend、数据库、日志和 fixture 不得出现明文秘密 | [架构](../../architecture.md)、[工程规则](../../AI_RULES.md) |
| 发布与运维 | 当前仅限项目所有者受控本机；未来公开下载必须重新授权并通过 Provider 条款与内容权利复核 | [路线图](../project-management/roadmap.md)、[验证报告](evidence/0004-provider-feasibility-validation.md) |

## 4. 候选方案

### 方案 A：只使用官方 Provider 通道并保持 Adapter 隔离

- 做法：Codex 使用本机 `codex exec`；网易云使用官方开放平台批准的 API、SDK 或个人开发者 CLI；TTS 通过 bundled macOS native helper 调用 Apple `AVSpeechSynthesizer`。所有结果先在服务端校验并归一化。
- 收益：来源、鉴权和发布责任可追踪；不依赖逆向协议；TTS 不需要云凭据或网络，并可用 Mock 隔离 CI 与系统语音差异。
- 代价：需要用户自行完成 Provider 注册、凭据配置和登录；网易云个人预览与公开分发可能需要不同的批准形态。
- 风险：网易云官方个人 CLI 是否能稳定提供浏览器可播资源和歌词仍未证实；其动态命令树依赖有效凭据和登录态。
- 验证结果：Codex 与 Apple 系统 TTS 已通过最小真实调用、错误边界和超时/取消探针；网易云只完成无凭据与失败路径采样，核心成功调用证据不完整。

### 方案 B：使用非官方网易云兼容或逆向 API

- 做法：通过社区服务或自建兼容端点满足现有 `neteaseApiUrl` 设计。
- 收益：表面上更接近现有 URL 配置和常见 REST 集成方式。
- 代价：需要维护逆向协议、Cookie、反滥用绕行和不稳定响应映射。
- 风险：常见社区实现已经归档且没有可确认的发布授权；网易云服务条款禁止未授权兼容软件、插件和内容再分发，不能作为可公开发布的核心链路。
- 验证结果：不满足合法、稳定提供核心音乐能力的门槛，排除。

### 方案 C：替换音乐 Provider

- 做法：选择另一个具有明确开发者授权与 Web 播放能力的音乐服务。
- 收益：可能获得更清晰的公开 API 和发布条款。
- 代价：改变 PRD 的 v1 产品范围、来源标识、导入行为和用户预期。
- 风险：属于产品范围变更，不能由 S0-06 静默决定。
- 验证结果：保留为官方网易云路径无法满足核心能力时的替代决策，不进入本任务实施范围。

## 5. 裁决

本 ADR 当前推荐方案 A。Apple 系统 TTS 子决策已由项目所有者确认并同步权威文档，但完整 ADR 只有以下剩余条件全部满足后才能改为 `已接受`：

1. 使用项目所有者在网易云官方开放平台创建的受控测试应用和本机登录态，证明歌曲搜索、可见性/可播性判断、歌词、歌单导入，以及可交给 Browser Audio Engine 的播放资源或等价受控播放方式。
2. 先在 `docs/prd.md` 与 `architecture.md` 裁决 `neteaseApiUrl` 和官方 CLI/API 路径的冲突，再同步相关摘要；不得让 Adapter 实现反向定义公共行为。

推荐的 Adapter 规则如下。

| Provider | 推荐调用与版本边界 | 超时与取消 | 重试 | 降级与校验 |
|---|---|---|---|---|
| Codex | 显式可执行文件路径，参数数组调用 `codex exec --ephemeral --json`；启动时记录脱敏版本，升级后重跑 schema fixture | 受 PRD 60 秒总预算约束；超时终止子进程并丢弃迟到结果 | 缺失/错误鉴权、非法输入、schema 错误不重试；剩余预算允许时仅对瞬态传输失败重试 1 次 | 只接受最终结构化消息；校验失败进入稳定错误或 Mock，不记录原始输出 |
| NetEase | 仅使用官方开放平台批准通道；个人预览可调用用户安装并配置的固定版本 `ncm-cli`，启动时检查版本、登录态和必需动态命令 | 健康检查不超过 PRD 15 秒；搜索/资源请求必须可取消并忽略迟到结果 | 鉴权、未登录、命令缺失、不可见/不可播不重试；瞬态网络失败最多重试 1 次；PRD 的换关键词重试属于业务流程 | 映射为内部音乐模型；尊重 `visible`/可播性；缺歌词可继续，核心资源不可用则阻塞该曲目；禁止非官方 fallback |
| Apple System TTS | Local Service 用参数数组启动固定路径的 bundled Swift helper；DJ 文本和 voice 参数经结构化 stdin 传递；helper 用 `AVSpeechSynthesizer.write` 输出 PCM/音频元数据 | 单次 45 秒，且不得突破生成总预算；超时终止 helper 并丢弃迟到输出 | 本地确定性失败不重试；voice 列表变化后可重新解析 1 次标准语音 | 只从 `speechVoices()` 选择已安装、非 Personal Voice；校验音频元数据后写入 FileStore；任何失败退回文字稿 |

版本策略不把当前探针版本写入产品公共 contract。实现任务必须显式固定经过验证的 Provider 版本或协议版本，启动时报告脱敏兼容性状态；升级只能通过依赖更新 PR 和成功/失败 fixture 回归完成。

## 6. 后果

### 正向后果

- 排除非官方网易云兼容 API，避免把不可审计的逆向协议变成核心依赖。
- 明确 Provider 原始结构、错误和密钥都停留在 Adapter/Secret Store 边界内。
- Codex 已有可复现的成功、鉴权失败和超时基线，后续实现无需猜测非交互调用形态。
- Apple 系统 TTS 不再需要云 API key、服务地址、网络或付费 Provider；TTS 仍是可选增强，失败不会阻断文字节目生成。

### 负向后果与权衡

- S0 阶段门暂时不能关闭，S1 和所有依赖 S0-06 的任务继续禁止启动。
- 网易云官方能力验证依赖项目所有者的开发者账号、应用审批和本机登录，自动化环境不能代替。
- 未来公开分发不能沿用个人预览结论，仍需公司开发者能力、应用验收与内容权利复核。
- 官方 CLI 路径可能要求修改设备设置字段和运行时边界，需额外的产品/架构同步。
- Apple 系统 TTS 需要额外维护 arm64/x64 native helper，并将其纳入签名、公证和 FileStore 安全边界。

### 保持不变

- PRD、用户流程、架构、工程规则和设计提示词已按项目所有者的 Apple 系统 TTS 决策同步；网易云公共配置与播放行为仍未修改。
- 当前仍是 Personal Local Preview，仓库仍无 Provider 实现或产品可执行入口。
- TTS 时间戳、音乐推荐策略和 Browser Audio Engine 仍由既有权威文档及后续任务负责。

## 7. Mock fixture 计划

CI、单元测试和常规 E2E 默认只使用固定、脱敏且无版权音频内容的 fixture；真实 Provider 探针只能由显式 opt-in 的外部验证执行。

| Provider | 固定成功 fixture | 固定失败 fixture | 必须断言 |
|---|---|---|---|
| Codex | 最小合法节目、含主持稿和音乐查询的完整节目 | 非零退出、无最终消息、畸形 JSON、字段越界、超时、迟到结果、超大输出 | 参数数组、schema 拒绝、日志脱敏、总时限和稳定错误映射 |
| NetEase | 可播/不可播混合搜索结果、带/不带歌词、歌单部分成功 | 空结果、未登录、鉴权失败、动态命令缺失、资源过期、限流、超时、恶意字段 | `visible`/可播性、source identity、分页、部分导入、歌词可选和禁止非官方 fallback |
| Apple System TTS | 标准 voice、PCM buffer 与合法音频元数据 | helper 缺失、目标 voice 未安装、Personal Voice、空 buffer、非法格式、超大输出、超时、迟到结果 | stdin/argv 边界、installed voice 校验、FileStore 边界、取消和文字降级 |

fixture 只表达 Koradio Adapter 的输入边界和归一化输出，不复制整份真实 Provider 响应，也不成为 `/api/v1` contract 的事实源。

## 8. 发布风险结论

| 使用范围 | Codex | NetEase | Apple System TTS |
|---|---|---|---|
| Personal Local Preview | 用户自有登录或 API key；不随应用分发 | 仅允许用户自有官方个人开发者应用、官方 CLI 与登录态；禁止兼容/逆向 API | 只使用当前设备已安装的标准系统语音；不请求 Personal Voice 授权，不复制或分发 voice asset |
| 未来公开分发 | 发布前复核当时的 Codex 产品条款、认证方式和配额；不得内置共享凭据 | 必须取得适合公开应用的官方批准、应用验收和内容权利；个人 CLI 探针不能作为公开授权证据 | helper 必须随 app 双架构签名、公证并在干净 macOS 13.5+ 验证；只分发应用代码，不打包系统 voice asset |

任何 Provider 条款、审批、配额或内容权利缺少可追溯证据时，公开分发门保持关闭；Mock 通过不能替代发布授权。

## 9. 实施与验证

| 项目 | 结果或计划 | 证据 |
|---|---|---|
| 实施路径 | 当前只创建 ADR 与脱敏报告；后续 Adapter 仍由 S3-05 实施 | [任务表](../project-management/tasks.md) |
| 自动检查 | Codex 四类探针、Apple TTS 成功/voice/取消/双架构 typecheck、网易云 CLI 版本和失败路径探针已执行；文档检查由本 PR 验证 | [验证报告](evidence/0004-provider-feasibility-validation.md) |
| 人工/外部验证 | 只剩网易云成功链路待项目所有者在本机安全配置开放平台凭据后执行 | [验证报告解阻清单](evidence/0004-provider-feasibility-validation.md#8-解阻与复验清单) |
| 回滚或替代路径 | 提议未接受前不实施；若官方网易云无法满足核心能力，停止实现并发起 PRD Provider 替换决策 | 本 ADR 方案 C |

## 10. 权威文档同步

| 文档 | 是否需要修改 | 原因或结果 |
|---|---|---|
| `docs/prd.md` | 已部分同步 | Apple TTS 地址/密钥已移除；`neteaseApiUrl` 与官方 CLI/API 仍待裁决 |
| `docs/user-flow.md` | 已同步 TTS | TTS 未配置改为原生 helper/标准语音不可用；网易云登录流程待复验 |
| `architecture.md` | 已部分同步 | Apple native helper 边界已固定；MusicProvider 配置与播放资源边界仍待裁决 |
| `design/design.md` | 不需要；`design/prompt.md` 已同步 | 视觉体系不变，Settings 字段与修复文案已移除云 TTS 配置 |
| `AI_RULES.md` | 已同步 | 固定 helper、stdin、installed voice、Personal Voice 排除与文字降级规则 |
| `README.md` / `context.md` | 已同步 | 记录 Apple TTS 已决策但尚未实现，网易云结论仍未接受 |

## 11. 后续任务

- 复验并接受本 ADR：完成网易云受控真实调用，取得项目所有者对官方 MusicProvider 形态的确认，并同步 PRD/架构冲突。
- S2-03：实现 Secret Store、File Store 与脱敏日志，不暴露 Provider 凭据。
- S3-02、S3-05：按已接受 ADR 实现归一化音乐模型和 Provider Adapter。
- S7-04：按发布时有效条款补齐第三方、隐私、安全与授权声明。
