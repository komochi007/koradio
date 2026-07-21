# S7-01 macOS 包装验收记录

> Task：S7-01
> 日期：2026-07-21
> 结果：通过受控本机 arm64 个人预览验收；不授权外部分发

## 交付物

- `packaging/macos/launcher/main.swift`：菜单栏 launcher，复用已就绪的 Koradio 服务或启动自身 bundled Local Service；只打开 loopback 同源 origin，并在退出时停止自身启动的服务。
- `native/macos/tts-helper/main.swift`：枚举非 Personal Voice 的系统语音，并以结构化 stdin/stdout 合成 WAV；DJ 文本不进入 argv 或错误输出。
- `scripts/release/build-macos.mjs`：校验固定 SHA-256 的 Node 24.18.0、执行 frozen install/build、production deploy、组装 PWA、分架构编译、ad-hoc Hardened Runtime 签名并创建 DMG。
- `scripts/release/verify-macos-package.mjs`：检查 strict codesign、包内 Node、TTS helper 与 launcher 启停冒烟。

构建输出位于被忽略的 `artifacts/`，不进入 Git、不上传也不作为下载入口。

## 验收证据

在 macOS 15.7.3 arm64 上，使用 Corepack 0.35.0 提供的 pnpm 11.13.0 与包内 Node 24.18.0 完成：

- frozen install、production build、`pnpm deploy --prod`、strict codesign 和 DMG 创建通过。
- bundle verifier 返回 Node `v24.18.0`，TTS helper 成功枚举 191 个系统标准语音并用标准英文语音生成有效 WAV，launcher 以临时数据根启动并停止 Local Service，端口 `49373-49383` 无残留监听。
- launcher、bundled Node 与 TTS helper 均为 arm64；Node 签名包含 V8 所需的 `allow-jit` 和 `allow-unsigned-executable-memory` entitlement。
- production deploy 不保留指向仓库外部的符号链接。
- `NODE_OPTIONS=--localstorage-file=/tmp/koradio-s7-01-localstorage pnpm check` 通过：79 unit、58 contract、76 integration、30 component、243 coverage tests 与完整 build。

## 范围与限制

- 已实现 arm64 与 x64 的独立构建路径，但本任务只在受控本机验收 arm64；x64、安装/升级/回滚/卸载由 S7-02 继续验证。
- 产物仅为 ad-hoc 签名的个人预览。Developer ID、公证、ticket staple、Gatekeeper、独立干净环境与任何外部分发仍未验证，继续由 S7-03～S7-05 阻断。
- 产品运行时仍默认使用 Mock Provider；本任务没有宣称真实 Codex + NetEase 组合或 TTS 产品编排已经验收。
