# S0-06 Provider 可行性脱敏验证报告

> 日期：2026-07-15
> 环境：macOS 15.7.3 arm64、Swift 6.1.2、Codex CLI 0.144.2、网易云音乐客户端 3.1.9、`@music163/ncm-cli` 0.1.6
> 结论：进行中；项目所有者已确认保持 Browser Audio Engine；网易云官方开放平台已公开播放 URL 接口，当前应用授权与返回资源的 Browser CORS/Range 仍待真实探针
> 脱敏：本文不包含真实密钥、登录态、请求 ID、用户标识、临时目录或原始 Provider 日志

## 1. 验证边界

本报告只验证 S0-06 的技术接入、失败行为、响应形态和发布风险。仓库仍没有产品代码或 Provider Adapter；命令均在隔离临时配置或当前用户已有 Codex 登录态下执行，没有把凭据写入仓库。

成功标准来自[任务表](../../project-management/tasks.md)、[PRD](../../prd.md)和[架构 Provider Ports](../../../architecture.md)：每个 Provider 需要能力矩阵、超时/重试/降级、Mock fixture 计划、公开发布风险，以及最小真实调用、鉴权失败、超时和 schema 采样证据。

## 2. 来源与版本快照

| Provider | 官方来源 | 2026-07-15 快照结论 |
|---|---|---|
| Codex | [认证](https://developers.openai.com/codex/auth)、[非交互模式](https://developers.openai.com/codex/noninteractive) | 支持 ChatGPT 登录或 API key；`codex exec` 支持临时会话、JSONL 事件和输出 schema；凭据可由 OS keyring 保存 |
| NetEase | [开放平台](https://music.163.com/st/developer)、[获取歌曲播放 url](https://developer.music.163.com/st/developer/document?docId=3d2c9f695ff24f4ea37611614b7f7856)、[官方 CLI 包](https://www.npmjs.com/package/@music163/ncm-cli)、[官方 Agent skills](https://github.com/NetEase/skills) | 官方开放平台提供播放 URL；调用需 AppID、RSA-SHA256 签名、登录令牌和完整设备参数，具体 API 分组仍受应用授权约束 |
| NetEase 条款 | [网易云音乐服务条款](https://music.163.com/html/web2/service.html) | 未经书面授权不得商业使用；禁止使用未开发、未授权或未认可的兼容软件与插件；内容复制和再分发受限 |
| Apple System TTS | [`AVSpeechSynthesizer`](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer)、[`write(_:toBufferCallback:)`](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer/write%28_%3Atobuffercallback%3A%29)、[voice traits](https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoice/traits)、[Personal Voice authorization](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer/personalvoiceauthorizationstatus-swift.type.property) | 可枚举已安装语音并把 utterance 写入音频 buffer；Personal Voice 需要用户授权，v1 明确排除 |

社区仓库 [Binaryify/NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) 已归档且停止维护，也没有可确认的授权边界，只能作为被排除方案的事实证据，不能作为实现来源。

## 3. 能力矩阵

| Provider / 能力 | 文档证据 | 真实成功调用 | 结论 |
|---|---:|---:|---|
| Codex 非交互调用与结构化节目骨架 | 有 | 已通过 | 可行 |
| Codex 无凭据、错误凭据和进程超时 | 有 | 已通过 | 可形成稳定错误映射；CLI 自身会重试部分传输，Adapter 仍需受总预算约束 |
| NetEase 官方命令发现、版本与登录检查 | 有 | 已通过 | 可行；必须同时断言动态命令与 JSON 业务状态 |
| NetEase 歌曲搜索、`visible`/`playFlag` 与 source identity | 有 | 已通过 | 可行；同一结果集可混合可播与不可播记录 |
| NetEase 歌词、歌单导入 | 有 | 已通过 | 可行；歌词存在滚动/纯文本分支，歌单歌曲 `data` 为数组且允许部分不可播 |
| NetEase 可交给 Browser Audio Engine 的播放资源 | 有 | 未获得 | 官方接口已确认；当前应用权限、成功 URL、过期、CORS、Range 与取消仍待验证 |
| Apple 系统 TTS 标准语音枚举与 PCM buffer | 有 | 已通过 | 可行；不需要云凭据或网络 |
| Apple 系统 TTS 无效 voice、timeout/cancel 与双架构目标 | 有 | 已通过 | 可形成 native helper 稳定错误映射；Personal Voice 排除 |

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

首轮失败探针使用新的临时 HOME；项目所有者随后在受控本机完成官方 CLI 配置与登录，成功探针使用当前用户已有登录态。报告只保留命令类别、字段名、类型、数量和脱敏结果，不记录凭据、登录态、完整歌曲/歌单内容或客户端队列。

| 场景 | 结果 | 解释 |
|---|---|---|
| 固定版本启动 | `ncm-cli --version` 返回 0.1.6 | 官方 CLI 包可在探针环境启动，不代表目标 Node 24 打包兼容性已验证 |
| 无凭据发现命令 | 退出码 1，明确提示 API key 未设置 | 可识别本地配置缺失 |
| 合成错误 App 凭据发现命令 | 退出码 0，但只返回静态播放控制命令并遮蔽私钥 | `commands` 成功不能当健康检查；必须断言必需动态命令存在 |
| 合成错误 App 凭据检查登录 | 退出码 0，但 JSON 中 `success=false`、状态为未登录 | 必须同时解析业务状态，不能只看退出码 |
| 合成错误 App 凭据执行搜索 | 搜索动态命令不存在 | 无法用错误凭据采样实际搜索鉴权错误或响应 schema |
| 官方 CLI 登录检查 | 退出码 0，JSON `success=true`，状态为已登录实名账号 | App 凭据、动态命令和用户登录态均可用；健康检查不得只依赖桌面客户端进程 |
| 歌曲搜索 | 返回 `code=200`；样本包含 `visible=true/playFlag=true/plLevel=exhigh` 与 `visible=false/playFlag=false/plLevel=none` | 必须同时校验 `visible` 与 `playFlag`，记录存在不等于可播放；加密 ID 为 string、原始 ID 为 number |
| 歌词 | 返回 `code=200`；样本的滚动歌词为空、纯文本歌词非空，另有 `noLyric`、`pureMusic` 和翻译/罗马音可选字段 | 歌词必须归一化为可选能力，不能假定滚动歌词存在，也不能把原文写入 fixture |
| 歌单元数据与歌曲 | 元数据返回 `trackCount`；歌曲查询的 `data` 直接为数组，3 条样本中 2 条不可播、1 条可播 | 导入必须分页、逐条校验并报告部分成功，不能假定外层存在 `records` 包装 |
| 100 ms 进程时限 | 真实已登录搜索被外部 deadline 终止，退出码 142 | Adapter 必须拥有进程 deadline、终止子进程并忽略迟到结果；100 ms 仅为故障注入，不是产品超时值 |
| 构造极低概率关键词 | 模糊搜索仍返回 3 条记录 | 真实空结果未能稳定构造，需用固定 Mock fixture 覆盖，不把模糊结果误判为精确命中 |
| 播放与状态契约 | `play` 要求加密 ID 与“用于唤起客户端”的原始 ID；当前播放器配置为 `orpheus`；云音乐模式不支持 `state`，`queue` 只返回客户端队列标签 | CLI 没有返回 Browser Audio Engine 可消费的 URL、媒体字节或可验证资源引用；为避免打断用户客户端，未执行有声 `play` |
| 官方 skill 播放边界 | 播放前要求判断播放器是内置 `mpv` 还是客户端；对用户返回的是网易云歌曲页面链接 | 官方公开 skill 没有描述音频资源 URL 输出，进一步确认网页链接和本机播放控制不能充当 Browser Audio Engine 资源 |
| 官方播放 URL 文档 | `GET/POST /openapi/music/basic/song/playurl/get/v2`；`bizContent.songId` 必填，响应含 `url`、`size`、`md5`、实际码率、音质和可选 `freeTrail` | 接口能力存在；音频少于 25 分钟时 URL 有效 25 分钟，较长音频按音频时长；`subCode=10003/10004` 分别表示当前端无版权与需购买/VIP |
| 公共参数 | 需要 `appId`、`signType=RSA_SHA256`、`sign`、毫秒时间戳、`bizContent`、登录 `accessToken` 和 `device` | `channel`、`deviceType`、`os`、`brand` 等设备值需网易云分配或确认，不能从浏览器或本机信息自行猜造 |
| 当前应用与 Browser 资源探针 | 官方 CLI 动态命令树未暴露播放 URL 命令；Chrome 安全策略禁止 Agent 读取开发者门户登录态或 API 调试 UI | 不能用公共文档访问成功推断当前 App 已获 API 分组，也不能在没有真实 URL 时推断 CORS、Range 或媒体类型 |

成功 schema 只用于证明官方能力和设计 Adapter fixture，不冻结 Provider 字段为 Koradio 公共 contract。CLI 动态命令树依赖有效 App 凭据和登录态；实现时必须在启动与健康检查中验证 `search song`、`song lyric`、`playlist get/tracks` 等必需命令存在。

本轮关闭了“官方播放 URL 能力是否存在”的信息缺口，并保留了两个工程边界：

- 当前 PRD 的设备设置是 `neteaseApiUrl`，官方开放平台路径还需要 App 凭据、登录令牌和获分配的设备字段；两者会改变 Settings 公共字段和 Secret Store/请求边界，必须在真实探针通过后同步权威文档。
- 官方 CLI 可以控制本机播放器或网易云客户端，但没有向命令调用者交付播放 URL；播放 URL 应由 Local Service 通过已授权的官方开放平台接口取得，Browser Audio Engine 继续是唯一实时播放事实源。

项目所有者已明确保持 Browser Audio Engine，外部客户端或 CLI 内置播放器不进入 v1 播放链路。CLI 最多承担已经验证的搜索、歌词和歌单查询；官方播放 URL 请求及签名必须留在 Local Service。若当前 App 无法取得播放地址 API 分组，或返回资源不允许目标浏览器跨域与 Range 播放，则必须重新裁决音乐 Provider，而不是改变播放事实源。

## 6. Apple 系统 TTS 探针

项目所有者于 2026-07-15 决定 v1 不采用 Fish Audio，改用 Apple 系统 `AVSpeechSynthesizer`。此前 Fish Audio 的网络与凭据缺口不再属于 v1 验收条件。

Apple 官方文档确认 `AVSpeechSynthesizer.write` 可把 utterance 写入音频 buffer，并可枚举 `AVSpeechSynthesisVoice.speechVoices()`。本机探针结果：

| 场景 | 结果 | 实现约束 |
|---|---|---|
| 可用语音枚举 | `speechVoices()` 共返回 191 个语音；`en-GB` 11 个，中文 21 个；成功探针选择其中一个标准 `en-GB` voice | 运行时必须排除 Personal Voice，再按 BCP 47 与已安装列表解析，不能假设固定 voice 一定存在 |
| 最小真实合成 | 指定已安装 `en-GB` 标准语音，收到 342 个非空 buffer、87345 frames、22050 Hz、单声道，约 3.96 秒 | helper 可输出可缓存 PCM/音频；实际文件必须进入 FileStore |
| 无效 voice identifier | initializer 返回了回退对象而不是可靠的 `nil`，且返回 identifier 不等于请求值 | 每次合成前必须显式检查 requested identifier 是否存在于 `speechVoices()`，禁止静默换声 |
| 50 ms deadline | 长文本未完成时触发 timeout，已调用 immediate stop；取消前未接收 frame | Application 必须终止 helper、忽略迟到输出并文字降级 |
| deployment target | `AVSpeechSynthesizer.write` 最小 helper 对 `arm64-apple-macosx13.5` 与 `x86_64-apple-macosx13.5` 均通过 Swift typecheck | 与 ADR 0003 双架构和最低系统一致；仍需 S7 真实双架构构建、签名、公证 |

系统 TTS 没有“无凭据/错误凭据”场景；等价失败输入是 helper 缺失、requested voice 未安装、Personal Voice、空/非法 buffer 与进程超时。v1 不请求 Personal Voice 授权，也不把系统 voice asset 打包进应用。

## 7. 安全、合规与复现结论

- 没有把 Provider secret、用户登录态、Cookie 或原始日志写入仓库；无效凭据使用合成值并在报告中省略。
- 未来 Codex/网易云实现必须从 OS Credential Store 注入秘密；所有子进程使用参数数组，并对 stdout/stderr、错误正文、健康状态和诊断包统一脱敏。
- Apple TTS helper 不使用 secret；DJ 文本通过结构化 stdin 传递，stdout 只返回经 schema 校验的脱敏结果，目标文件由 FileStore 分配。
- v1 只允许已安装的标准系统语音；不请求 Personal Voice 授权，也不把 Personal Voice identifier 写入 fixture、日志或诊断包。
- CI 和普通 E2E 不调用真实、付费或有版权内容的 Provider；只使用 ADR 0004 定义的固定 fixture。
- 个人本机探针不是公开分发授权。公开发布前必须重新获取并保存当时有效的服务条款、应用审批、商业使用与内容权利证据。
- 非官方网易云兼容 API 不满足本任务的合法稳定门槛，不作为 fallback。
- 官方文档请求/返回示例包含仅用于说明格式的凭据形态与临时 URL；不得复制为配置、fixture、日志或真实调用凭据。

## 8. 解阻与复验清单

项目所有者不应在聊天、Issue、PR 或仓库中粘贴任何密钥。官方播放 URL 文档已经解除“能力是否存在”的阻塞；官方 CLI 登录、查询与失败探针以及 Browser Audio Engine 决策也已完成。剩余验收项是当前 App 授权和真实资源行为：

1. 在网易云开发者控制台确认当前 App 已获“获取播放地址 API”分组，并取得官方分配或确认的 `channel`、`deviceType`、`os`、`brand` 等设备参数；只记录脱敏的权限结果，不记录凭据。
2. 使用当前 App 与已登录用户完成一次真实请求，覆盖成功 URL、`10003` 当前端无版权、`10004` 付费/VIP、资源过期、请求取消和 15 秒健康检查；校验 `freeTrail` 与 URL 刷新策略。
3. 对成功 URL 验证目标 Browser 的 CORS、HTTP Range/206、媒体类型和过期后重新获取；不把签名 URL 持久化到数据库、日志或 fixture。
4. 探针通过后同步 `neteaseApiUrl`、App/设备配置、Secret Store 和 Local Service 签名边界；若权限或 Browser 资源能力无法取得，则启动音乐 Provider 替换决策。
5. 真实搜索空结果和歌词完全缺失目前未稳定复现，先保留为 Mock fixture；它们不改变当前播放资源验收结论。

在以上证据完整前，S0-06 保持进行中，S0 阶段门保持关闭，不启动 S1。
