# S0-06 Provider 可行性脱敏验证报告

> 日期：2026-07-15
> 环境：macOS 本机、Codex CLI 0.144.2、`@music163/ncm-cli` 0.1.6
> 结论：阻塞；Codex 核心调用已验证，网易云和 Fish Audio 缺少完成验收所需的受控成功调用
> 脱敏：本文不包含真实密钥、登录态、请求 ID、用户标识、临时目录或原始 Provider 日志

## 1. 验证边界

本报告只验证 S0-06 的技术接入、失败行为、响应形态和发布风险。仓库仍没有产品代码或 Provider Adapter；命令均在隔离临时配置或当前用户已有 Codex 登录态下执行，没有把凭据写入仓库。

成功标准来自[任务表](../../project-management/tasks.md)、[PRD](../../prd.md)和[架构 Provider Ports](../../../architecture.md)：每个 Provider 需要能力矩阵、超时/重试/降级、Mock fixture 计划、公开发布风险，以及最小真实调用、鉴权失败、超时和 schema 采样证据。

## 2. 来源与版本快照

| Provider | 官方来源 | 2026-07-15 快照结论 |
|---|---|---|
| Codex | [认证](https://developers.openai.com/codex/auth)、[非交互模式](https://developers.openai.com/codex/noninteractive) | 支持 ChatGPT 登录或 API key；`codex exec` 支持临时会话、JSONL 事件和输出 schema；凭据可由 OS keyring 保存 |
| NetEase | [开放平台](https://music.163.com/st/developer)、[官方 CLI 包](https://www.npmjs.com/package/@music163/ncm-cli)、[官方 Agent skills](https://github.com/NetEase/skills) | 个人开发者可申请官方 CLI 能力；应用需 AppID/私钥和用户登录；歌曲结果区分加密 ID、原始 ID 与 `visible` 可播性 |
| NetEase 条款 | [网易云音乐服务条款](https://music.163.com/html/web2/service.html) | 未经书面授权不得商业使用；禁止使用未开发、未授权或未认可的兼容软件与插件；内容复制和再分发受限 |
| Fish Audio | [TTS API](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)、[价格与限流](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits)、[条款](https://fish.audio/terms/)、[状态页](https://status.fish.audio/) | 官方 Bearer API 返回 MP3/WAV/PCM/Opus；401/402/422 有文档；免费使用限个人非商业，商业发布需要付费服务或适用授权 |

社区仓库 [Binaryify/NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) 已归档且停止维护，也没有可确认的授权边界，只能作为被排除方案的事实证据，不能作为实现来源。

## 3. 能力矩阵

| Provider / 能力 | 文档证据 | 真实成功调用 | 结论 |
|---|---:|---:|---|
| Codex 非交互调用与结构化节目骨架 | 有 | 已通过 | 可行 |
| Codex 无凭据、错误凭据和进程超时 | 有 | 已通过 | 可形成稳定错误映射；CLI 自身会重试部分传输，Adapter 仍需受总预算约束 |
| NetEase 官方命令发现、版本与未登录检查 | 有 | 已采样 | 只证明 CLI 外壳可运行，不证明音乐核心能力 |
| NetEase 歌曲搜索、`visible`/可播性与 source identity | 有 | 未完成 | 阻塞 |
| NetEase 歌词、歌单导入 | 有 | 未完成 | 阻塞 |
| NetEase 可交给 Browser Audio Engine 的资源或等价播放控制 | 不充分 | 未完成 | 阻塞；这是现有架构的关键缺口 |
| Fish Audio TTS、媒体类型与错误 schema | 有 | 未完成 | 可选能力阻塞；产品可按文字稿降级 |

## 4. Codex 探针

### 4.1 最小真实调用

使用本机已存在的用户登录态运行显式 Codex 可执行文件，参数为非交互、临时会话、只读 sandbox 和 JSONL 输出。进程退出码为 0，最终消息可解析为：

```json
{"programTitle":"Probe","musicQueries":[{"keyword":"If Bread"}]}
```

该样例只证明最小结构化输出链路，不代表完整 Program schema 已冻结。实际 Adapter 必须使用 S2-01 的 Zod contract 和更严格输出 schema 再验证。

### 4.2 鉴权与超时

| 场景 | 隔离方法 | 结果 | Adapter 预期分类 |
|---|---|---|---|
| 无凭据 | 全新配置目录，不继承登录态，不注入 API key | 退出码 1，HTTP 401，提示缺少认证 | 不可重试的配置错误 |
| 错误凭据 | 全新配置目录，只注入合成无效 key | 退出码 1，HTTP 401，CLI 输出已遮蔽 key | 不可重试的鉴权错误 |
| 1 秒进程时限 | 外部进程 deadline 包裹真实调用 | 1 秒终止，退出码 142 | `PROVIDER_TIMEOUT`，忽略迟到结果 |

Codex CLI 在鉴权失败时仍可能先尝试多种传输并产生内部重试，因此 Local Service 不能把 CLI 默认等待当作应用策略，必须实施 PRD 的 60 秒总 deadline 和显式取消。

## 5. NetEase 探针

所有命令均使用新的临时 HOME；报告只保留命令类别和脱敏结果。

| 场景 | 结果 | 解释 |
|---|---|---|
| 固定版本启动 | `ncm-cli --version` 返回 0.1.6 | 官方 CLI 包可在探针环境启动，不代表目标 Node 24 打包兼容性已验证 |
| 无凭据发现命令 | 退出码 1，明确提示 API key 未设置 | 可识别本地配置缺失 |
| 合成错误 App 凭据发现命令 | 退出码 0，但只返回静态播放控制命令并遮蔽私钥 | `commands` 成功不能当健康检查；必须断言必需动态命令存在 |
| 合成错误 App 凭据检查登录 | 退出码 0，但 JSON 中 `success=false`、状态为未登录 | 必须同时解析业务状态，不能只看退出码 |
| 合成错误 App 凭据执行搜索 | 搜索动态命令不存在 | 无法用错误凭据采样实际搜索鉴权错误或响应 schema |

官方 skill 文档给出了 `search song`、歌词、歌单和播放能力，并要求搜索请求携带用户输入、尊重 `visible`。但没有有效官方 App 凭据和 QR 登录态时，CLI 不暴露完整动态命令树；因此本次不能声称这些能力对 Koradio 可用。

还存在两个必须在成功探针中关闭的工程风险：

- 当前 PRD 的设备设置是 `neteaseApiUrl`，个人官方路径却是本地 CLI；两者会改变配置公共行为和运行边界。
- 官方 CLI 文档展示本机播放器/官方客户端控制，但 Koradio 架构要求 Browser Audio Engine 为唯一播放事实源；必须证明可获得合法、稳定且受控的浏览器播放资源，或先修改权威设计。

## 6. Fish Audio 探针

官方文档和 OpenAPI 页面可访问，确认 `POST https://api.fish.audio/v1/tts`、Bearer 鉴权、请求字段、音频响应格式及 401/402/422 错误。但当前 shell 和 Node 到 `api.fish.audio` 的 TLS 连接均在握手前被重置，且环境没有受控 Fish Audio 测试凭据，因此以下实际调用均未完成：

- 成功合成与媒体类型/大小采样。
- 无凭据和错误凭据的实际 401。
- 429、5xx、45 秒超时与取消。

TTS 是可选能力，此缺口不应阻止节目生成：任何配置、网络、配额、内容或媒体校验失败都必须退回文字稿。但 S0-06 要求逐 Provider 验证，故任务仍不能通过验收。

## 7. 安全、合规与复现结论

- 没有把 Provider secret、用户登录态、Cookie 或原始日志写入仓库；无效凭据使用合成值并在报告中省略。
- 未来实现必须从 OS Credential Store 注入秘密，使用参数数组启动子进程，并对 stdout/stderr、错误正文、健康状态和诊断包统一脱敏。
- CI 和普通 E2E 不调用真实、付费或有版权内容的 Provider；只使用 ADR 0004 定义的固定 fixture。
- 个人本机探针不是公开分发授权。公开发布前必须重新获取并保存当时有效的服务条款、应用审批、商业使用与内容权利证据。
- 非官方网易云兼容 API 不满足本任务的合法稳定门槛，不作为 fallback。

## 8. 解阻与复验清单

项目所有者不应在聊天、Issue、PR 或仓库中粘贴任何密钥。请在受控本机按 Provider 官方流程完成配置后，再恢复 S0-06：

1. 在网易云官方开放平台创建或指定测试应用，将 AppID/私钥存入本机安全凭据边界，完成官方 CLI 的 QR 登录；记录应用能力和审批状态的脱敏截图或文字证据。
2. 在隔离测试账号下执行歌曲搜索、无结果、`visible=false`、歌词存在/缺失、歌单部分导入、资源过期、错误凭据和 15 秒超时；保存最小脱敏 schema 样例。
3. 证明网易云播放输出能合法接入 Browser Audio Engine；若只能控制外部播放器，先由项目所有者决定修改 PRD/架构还是替换 Provider。
4. 配置 Fish Audio 测试 key 并修复当前网络到 API 域名的 TLS 可达性；执行成功、无凭据、错误凭据、429/5xx、媒体类型和 45 秒超时探针。
5. 由项目所有者确认 ADR 0004 推荐方案，先同步 `docs/prd.md` 与 `architecture.md` 的 NetEase 配置/播放边界，再把 ADR 改为 `已接受`、任务改为 `已完成`。

在以上证据完整前，S0 阶段门保持关闭，不启动 S1。
