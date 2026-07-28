# ADR 0005：使用 Qwen3-TTS 本地模型替换 Apple System TTS

## 状态

已接受，2026-07-28。

## 背景

Apple `AVSpeechSynthesizer` 的标准系统音色无法满足 Koradio 对自然电台串讲的要求。用户要求完整替换现有方案，同时保持低成本、本地处理、失败不阻断歌曲播放，并已通过完整句子试听选定中文 `Serena` 与英文 `Ryan`。

本决策只替换 TTS Provider 与 macOS 包装中的语音运行时，不改变 Codex、NetEase、节目生成事务、受控媒体入口或文字降级规则。

## 决策

- 使用 `mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`，固定 revision `049ef77fe8816b536193c0c25f9a214d17921282`。
- 支持范围收窄为 macOS 15+ Apple Silicon（arm64）。
- app/DMG 捆绑可重定位 Python 3.12、MLX-Audio 0.4.5 及持久化 JSONL helper，但不捆绑约 1.84 GiB 模型。
- 用户在 Settings 明确点击后，模型才从固定 Hugging Face revision 下载到应用数据目录；逐文件校验大小与 SHA-256，先写 `.partial`，全部通过后原子切换。
- 中文固定 `Serena`，英文固定 `Ryan`；公共偏好值统一为 `natural-radio`。
- helper 保持单进程复用已加载模型，接收完整句子并返回完整 WAV；异常时终止并由下一次调用重启。
- 模型未安装、下载失败、helper 失败、超时、取消、音频或时长校验失败时，只保留完整文字 DJ，不创建伪音频时间线项。
- 数据目录迁移与模型下载互斥；应用退出会中止下载并清理应用拥有的 `.partial` 目录。
- 所有 DJ 文本与推理均留在本机；不调用云端合成服务。
- 当前 ad-hoc 个人预览为加载重新签名的 Python native extensions，对 Python 子进程启用最小 `disable-library-validation` entitlement；该权限不授予 launcher 或 Node。任何外部分发前必须用 Developer ID 同 Team 重签全部 Mach-O，并重新评估或移除该 entitlement。

## 成本

- 软件与模型许可成本：零 API 调用费。
- 首次下载：约 1.84 GiB。
- app 内运行时增量：约 450 MiB；当前压缩 DMG 约 256 MiB，模型不计入 DMG。
- 推理成本：用户本机 CPU/GPU、内存和电量；无按字符费用。

## 后果

自然度明显优于系统 TTS，且没有持续 API 成本。代价是只支持 Apple Silicon/macOS 15+、首次下载较大、app 增加约 450 MiB Python/MLX runtime，并需要维护锁定依赖、模型完整性清单、native extension 签名、启动时延与本机资源保护。

ADR 0004 中关于 Apple TTS 的选择由本 ADR 取代；Codex 与 NetEase 结论保持不变。ADR 0003 的当前包装矩阵同步收窄为 arm64/macOS 15+。

## 验证

见 [Qwen3-TTS 可行性证据](evidence/0005-qwen3-local-tts.md)。
