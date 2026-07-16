# S0-06 Provider 可行性验证报告

> 日期：2026-07-16
> 任务：S0-06
> 范围：Codex、网易云 `ncm-cli`、Apple 系统 TTS 的最小真实调用与失败采样
> 脱敏原则：不记录真实 API key、private key、Codex auth、完整日志正文、播放直链或本机用户敏感路径

## 1. 环境与工具确认

| 项目 | 结果 |
|---|---|
| Git 起点 | `main`，`git fetch origin --prune` 与 `git pull --ff-only origin main` 后 clean |
| Codex CLI | `/Applications/ChatGPT.app/Contents/Resources/codex`，`codex-cli 0.144.2` |
| 网易云 CLI | `/opt/homebrew/bin/ncm-cli`，`@music163/ncm-cli@0.1.6`，bin 为 `ncm-cli` |
| 网易云 CLI 文档/元数据 | npm registry 描述为支持 music playback、search、playlist management；Node engine `>=18.0.0` |
| 网易云凭据状态 | `ncm-cli config list` 显示 `appId` 与 `privateKey` 来自凭证文件，输出已遮蔽 |
| Apple TTS | `/usr/bin/say` 可用；Swift 6.1.2 可用；系统语音包含 `Daniel en_GB`、`Tingting zh_CN` |

本次额外要求的“网易云 CLI 是否可用”结论：**可用**。实际命令名是 `ncm-cli`，不是 `ncm`、`netease-cloud-music` 或 `cloudmusic`。

## 2. 外部文档复核

| 来源 | 结论 |
|---|---|
| OpenAI Codex 非交互文档 | `codex exec` 用于脚本/CI；默认只读 sandbox；可用 `--ephemeral`、`--output-schema` 和 `--output-last-message` 产出机器可读结果；认证材料不得进入仓库或不受信环境 |
| NetEase skills / ncm-cli 文档 | 使用前需要安装 `@music163/ncm-cli`、完成开放平台入驻和 `ncm-cli configure`；能力覆盖搜索歌曲/歌单/专辑、歌单管理、推荐等；所有命令依赖 API key |
| 网易云官方开发者文档 | 用户提供的 `docId=3d2c9f695ff24f4ea37611614b7f7856` 在官方文档搜索 API 中对应“获取歌曲播放url”，分类为“获取播放地址API”；开发者平台问答进一步给出批量接口路径、POST 方法和业务参数约束 |
| 本机 CLI help | `ncm-cli search song`、`song lyric`、`search playlist`、`playlist tracks` 可返回 JSON；`play` 可播放音频 URL、歌曲加密 ID 或歌单，但实测返回 `orpheus://` 唤端结果，不返回 Browser 播放 URL |

## 3. Codex 验证

| 检查 | 命令摘要 | 结果 |
|---|---|---|
| 版本 | `codex --version` | `codex-cli 0.144.2` |
| 非交互 help | `codex exec --help` | 支持 `--ephemeral`、`--ignore-rules`、`--output-schema`、`--json`、`--output-last-message`、`--skip-git-repo-check` |
| 最小真实 JSON | `codex exec --ephemeral --ignore-rules --sandbox read-only --skip-git-repo-check -C /tmp <最小 JSON prompt>` | 成功返回符合 PRD 最小结构的 JSON；stdout 同时包含 CLI 进度/metadata，因此 adapter 不应直接把完整 stdout 当业务响应 |
| 启动约束 | 同上但缺少 `--skip-git-repo-check` 且 `-C /tmp` | 退出码 `1`，提示不在 trusted directory；adapter 需要受控工作目录或显式 skip |
| 无效 Codex home | `CODEX_HOME=/dev/null codex exec ...` | 退出码 `1`，提示 `CODEX_HOME` 不是目录；可映射为 Codex 不可用 |

结论：Codex 规划能力可行；S3 必须使用 `--output-schema`、`--output-last-message` 或 JSONL 事件解析来隔离最终消息，并在 Koradio schema 处二次校验。

## 4. 网易云验证

| 检查 | 命令摘要 | 结果 |
|---|---|---|
| CLI 可用性 | `command -v ncm-cli && ncm-cli --version` | `/opt/homebrew/bin/ncm-cli`，版本 `0.1.6` |
| CLI 元数据 | `npm view @music163/ncm-cli ... --json` | 包名、版本、bin、Node engine 和描述可从 registry 回读 |
| 凭据遮蔽 | `ncm-cli config list --output json` | 显示 `appId` 和 `privateKey` 已配置且遮蔽；报告不保存真实值 |
| 搜索成功 | `ncm-cli search song --keyword "Space Song Beach House" --limit 1 --output json` | `code: 200`，`recordCount: 91`，首条含 `originalId`、加密 `id`、title、artist、album、duration、`playFlag: true` |
| 搜索无结果 | `ncm-cli search song --keyword "zzzz-koradio-no-result-0004" --limit 1 --output json` | `code: 200`，`recordCount: 0`，`records: []` |
| 歌词成功 | `ncm-cli song lyric --songId <脱敏 songId> --output json` | `code: 200`，返回 LRC、翻译歌词和 `noLyric: false` |
| 歌单搜索 | `ncm-cli search playlist --keyword "写作 BGM" --limit 1 --output json` | `code: 200`，返回歌单 `originalId`、加密 `id`、名称、trackCount、tags |
| 歌单曲目 | `ncm-cli playlist tracks --playlistId <脱敏 playlistId> --limit 1 --output json` | `code: 200`，返回 1 条歌曲记录和 playability flags |
| CLI 播放命令 | `ncm-cli play --song --encrypted-id <脱敏 songId> --original-id <originalId> --output json` | 返回成功唤起云音乐播放歌曲，输出 `orpheus://` 唤端协议；不返回 Browser 可消费音频 URL |
| 官方播放 URL 文档定位 | 官方文档搜索 API 查询“获取歌曲播放url” | 返回目标 `docId`、标题“获取歌曲播放url”、分类“获取播放地址API” |
| 官方批量接口约束 | 用户提供的网易云开发者平台问答截图 | 使用 `POST /openapi/music/basic/batch/song/playurl/get`；歌曲 ID 列表最多 500 个并序列化为 JSON 字符串；音质可选 `128/320/999/1999`、默认 `320`；可选音效参数如杜比 `eac3/ac4`；请求携带 SDK 公共参数，响应从 `url` 字段取得短期播放地址 |
| 批量播放 URL 授权采样 | 复用 `ncm-cli` 已验证签名链，将受控请求路径临时改写为 `/openapi/music/basic/batch/song/playurl/get` | 返回 `code: 300`、`message: 应用未授权当前接口`；授权层在业务参数校验前拒绝请求，未返回播放直链，报告不保存原始 URL、access token、签名或密钥 |
| 非法 ID | `ncm-cli playlist tracks --playlistId invalid-playlist-id --limit 1 --output json` | 输出 `code: 400`、`message: 歌单id有非法字符`；进程退出码仍为 `0`，adapter 必须按 body code 判错 |
| 无凭据 | `HOME=/dev/null ncm-cli search song ...` | 退出码 `1`，提示 API key 未设置，并建议 `ncm-cli configure` 或 `config set` |
| 超时包装 | 1 秒外层 alarm 包装搜索 | 外层可返回 `124`，但子进程仍可能完成输出；产品 adapter 必须用可杀进程组的 timeout/cancel 机制 |

结论：网易云搜索、歌词、歌单导入与失败采样可行；官方批量播放 URL 端点和调用约束已经定位，但当前开放平台应用未授权该接口，正式业务字段名与成功响应 schema 尚未验证。S0-06 因此阻塞，不能把外部播放器唤端或 `orpheus://` 结果作为 Browser Audio Engine 的事实源。

## 5. Apple TTS 验证

| 检查 | 命令摘要 | 结果 |
|---|---|---|
| 系统语音枚举 | `say -v '?'` | 可枚举多语言标准语音 |
| 目标语言语音 | 过滤 `en_GB`、`zh_CN`、`zh_TW`、`zh_HK` | `Daniel en_GB`、`Tingting zh_CN`、`Meijia zh_TW`、`Sinji zh_HK` 可用 |
| 最小合成 | `say -v Daniel -o <临时 AIFF> "Koradio smoke test"` | 成功生成 AIFF-C 音频 |
| Swift 环境 | `swift --version` | Apple Swift 6.1.2，可用于后续 native helper PoC/实现 |

结论：当前机器具备 Apple 系统 TTS 的 v1 语音基础；产品仍必须通过 bundled helper 实现，不直接从 Node 拼接 shell command 调用 `say`。

## 6. Schema 采样结论

| Provider | 可归一化字段 | 必须丢弃或脱敏 |
|---|---|---|
| Codex | `programTitle`、`scenarioSummary`、`djLanguage`、`djScripts`、`musicQueries`、`playlistIntent` | 原始不可解析正文、session id、token usage、warning、auth 信息 |
| NetEase | `source`、`sourceTrackId`、`title`、`artist`、`album`、`duration`、`lyricStatus`、playability flags、playlist source identity、播放 URL 授权状态 | `openApiTraceInfo`、完整日志上下文、API key/private key、原始 Provider response、播放直链 |
| TTS | `voiceIdentifier`、`language`、`audioRef`、`durationMs`、可选 marker、estimatedTiming | helper stdout 原始异常、绝对输出路径、DJ 文本日志、Personal Voice |

## 7. 未验证范围与后续门

- 网易云官方播放 URL 端点已定位，但当前应用未授权，尚未得到成功响应 schema、Browser 可播放 URL 或 FileStore 代理音频资源；这是 S0-06 当前阻塞条件。
- 未验证真实 Swift TTS helper、音频 marker、取消后迟到输出和双架构签名；由 S3/S7 关闭。
- 已验证当前应用对播放 URL 端点的真实未授权响应；未验证隔离错误凭据 fixture，后续应使用测试账号或 SecretStore fixture 验证，不修改全局凭据。
- 未验证公开发布条款；S7-04 必须复核 Codex、网易云开放平台和音乐内容边界。
- 未运行产品测试命令，因为当前仓库没有产品 manifest、源码、测试脚本或可运行服务。
