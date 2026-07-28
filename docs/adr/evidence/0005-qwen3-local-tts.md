# ADR 0005 Qwen3-TTS 可行性证据

## 环境

- macOS 15.7.3
- Apple Silicon arm64
- 8 GB 内存
- Python 3.12 可重定位运行时
- MLX-Audio 0.4.5

## 已验证

- 固定 8-bit 模型可在目标机器本地加载并合成有效 WAV。
- 中文 `Serena` 使用完整中文句子试听正常。
- 英文 `Ryan` 使用完整英文句子试听正常。
- 持久化 helper 可连续处理中文和英文请求。
- helper 与可重定位 Python runtime 一起移动目录后仍可运行。
- 完整 app 为约 632 MiB、压缩 DMG 为约 256 MiB；包内 Python 3.12.13、MLX-Audio 0.4.5、native extensions 签名、launcher smoke 与 strict codesign 均通过。
- 使用最终包内 runtime 对完整中文与英文句子真实合成，分别得到约 8.56 秒与 14.4 秒的有效 WAV。
- 输出经过 WAV 签名、大小、时长和 RMS 下限校验；异常长音频会降低温度重试。
- 模型清单逐文件记录固定大小与 SHA-256；安装器使用临时目录和原子 rename。
- 失败实验、4-bit 模型、Swift 路线、旧 Metal wheels、试听文件与 Whisper 临时环境未进入仓库。

## 边界

- 当前证据只覆盖项目所有者的 macOS 15.7.3 arm64 机器。
- 尚不证明 Developer ID、公证、Gatekeeper 或外部分发。
- 模型首次从 Hugging Face 下载依赖用户网络；网络、磁盘或校验失败时保持文字 DJ。
- x64 与 macOS 14 及以下不支持。
