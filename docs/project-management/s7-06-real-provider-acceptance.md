# S7-06 个人本机真实 Provider 闭环验收记录

> Task：S7-06
> 日期：2026-07-22
> 结果：通过 macOS 15.7.3 arm64 Personal Local Preview 验收；Mock 仍为默认，不授权外部分发。

## 交付物

- `apps/server/src/bootstrap/providers.ts`：按 `mock` / `live` 组合 Codex、NetEase、TTS Provider；Mock 保持默认，自动测试不调用真实 Provider。
- `apps/server/src/bootstrap/config.ts`、`app.ts`：接受显式 `KORADIO_PROVIDER_MODE=live` 和可选 TTS helper 路径；live 生成链路使用六分钟有界预算，并为受控 TTS 文件提供仅浏览器同源可读的媒体入口。
- `apps/server/src/integrations/codex.ts`、`tts.ts`：每次规划读取最新设备级 Codex 命令；Apple TTS 优先稳定 compact/ttsbundle 标准语音，排除 Personal Voice。
- `packaging/macos/launcher/main.swift`：默认继续启动 Mock；只有外部显式传入 `live` 才启用真实 Provider，并在 bundled helper 可执行时注入受控路径。
- `tests/integration/live-provider-composition.integration.test.ts` 与 Provider adapter 回归：覆盖默认 Mock、显式 live、文字 DJ 降级、动态 Codex 命令、稳定语音选择、TTS 同源读取及跨站拒绝。

## 受控启用方式

个人本机预览包通过以下形式显式启用 live；Finder 常规启动仍保持 Mock：

```bash
KORADIO_PROVIDER_MODE=live /path/to/Koradio.app/Contents/MacOS/Koradio
```

首次进入 Settings 后配置本机 Codex 可执行文件。launcher 自动定位包内 Apple TTS helper；如果 helper 缺失或合成失败，节目保留文字 DJ，音乐继续生成与播放。网易云不使用 Cookie、账号或业务密钥。

## 真实 Provider 验收矩阵

在新的 `/tmp/koradio-s7-06-live.*` 临时数据根执行，未接触实际 Koradio 数据目录：

| 场景 | 结果 |
|---|---|
| Codex 环境 | 本机 Codex CLI 可执行且处于 ChatGPT 登录态；命令路径从 DeviceSettings 读取，保存后无需重启服务。 |
| 完整生成 | 真实 Codex + NetEase + Apple TTS 成功提交节目：5 首曲目、3 段中文 TTS、完整判别式时间线。 |
| 歌词 | 首曲返回 `untimed` 歌词，产品按既有近似高亮路径显示，不阻断播放。 |
| 音乐播放 | 首曲重新解析为短期 HTTPS 播放引用；PWA 播放控件进入“暂停”态并切换到真实当前曲目，队列和当前节目同步。 |
| TTS 播放 | 中文 compact 系统语音生成有效 WAV；受控 `/tts/` 媒体返回 `audio/wav`、`no-store`，跨站请求返回 `403`，PWA 播放无浏览器 warning/error。 |
| TTS 降级 | 不注入 helper 时仍成功生成 5 首曲目和 3 段文字 DJ，所有 `ttsAudioRef` 为 `null`。 |
| 网易云无结果 | 对高熵无意义关键词执行真实搜索，返回 `200` 与空结果，不创建占位曲目。 |
| Codex 失败 | 配置不存在的可执行路径后 Job 以脱敏 `PROGRAM_GENERATION_FAILED` 结束；既有节目数量和 ID 保持不变，响应不包含配置路径。 |
| 配置与健康 | health 返回 `mode: live`；Codex、NetEase、TTS 只暴露可用/降级状态和脱敏摘要，不返回命令路径、播放 URL 或 Provider 私有字段。 |

实机过程中发现真实 Codex、搜歌与多段 TTS 组合可能超过原 120 秒总预算，现仅对 live composition 使用六分钟上限；Mock 和显式测试超时保持原行为。另发现按标识符排序会优先选择当前机器上不稳定的 Eloquence 中文语音，现改为优先 compact/ttsbundle 标准语音，并由 fixture 与真实中文合成共同验证。

## 自动质量门与包装

- 专项回归：3 个测试文件、20 个用例通过；全部使用 fixture、假进程或不触网 composition，不调用真实 Provider。
- Node `24.18.0`、pnpm `11.13.0` 完整 `pnpm check` 通过：79 unit、58 contract、80 integration、30 component、247 coverage 用例，以及 format、typecheck、lint 和完整 production build。
- arm64 `0.0.5` 个人预览 app/DMG 从固定锁文件构建；`codesign --verify --deep --strict`、bundled Node `v24.18.0`、191 个系统语音、TTS 合成和 launcher `--smoke` 通过。签名仅为受控本机 ad-hoc 验证，不是 Developer ID 签名或公证。

## 数据、安全与未覆盖范围

- 真实场景正文只通过 Codex stdin 传入，音乐查询只进入 Backend NetEase Adapter；日志和验收摘要不记录原始 Provider body、完整播放 URL、session token 或认证材料。
- 本任务未创建 NetEase Cookie、账号或 Keychain item；真实 Codex 登录态由现有本机 CLI 自行管理，应用只保存非敏感命令路径。
- 验收临时数据根和临时 Node 24 测试运行时未被自动删除，遵循仓库禁止擅自删除的约束，可由操作系统后续清理。
- x64、Developer ID、公证、Gatekeeper、独立干净 Mac、长期 Provider 稳定性和任何公开分发均未验证；这些范围继续等待项目所有者重新授权 S7-03～S7-05。
