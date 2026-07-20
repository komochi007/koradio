# S6-03 安全、隐私与依赖审计记录

> 验收日期：2026-07-20
> 任务：`S6-03` 完成安全、隐私与依赖审计
> 结论：通过

## 1. 范围与威胁模型

本次按 [工程安全规则](../../AI_RULES.md#7-安全)、[架构安全边界](../../architecture.md#17-security-considerations)、[运行拓扑 ADR](../adr/0002-runtime-topology.md)、[工具链与供应链 ADR](../adr/0001-toolchain-and-quality.md)、[Provider ADR](../adr/0004-provider-feasibility.md) 和当前 Personal Local Preview 发布边界，审计 Browser、loopback Local Service、Credential Store、受控文件系统、Provider 与依赖供应链。

威胁模型覆盖恶意网页、非法 REST/WebSocket 会话、恶意路径/文件/下载响应、Provider 非可信输入、敏感正文和凭据进入日志/API，以及已知依赖漏洞和不兼容 license。与架构一致，同机恶意进程不在 v1 威胁模型内；远程访问、公开分发、bundled native TTS helper 和签名公证保持范围外。

## 2. 安全与隐私矩阵

| 边界 | 检查与恶意输入 | 结果 | 证据 |
|---|---|---|---|
| Loopback 与端口 | `KORADIO_HOST` 只接受 `127.0.0.1` / `::1`；production fallback 只允许 `49373-49383` | 通过 | `bootstrap/config.ts`、`session.test.ts`、production E2E 启动 |
| Origin 与 CORS | 精确 origin；拒绝 `localhost`、大小写/尾斜杠异常、`null`、cross-site；无 wildcard/credentials cookie | 通过 | `skeleton-server.integration.test.ts` |
| REST Session | 短期进程内 token；拒绝缺失、过期、跨进程、URL/header 错误传输；bootstrap `no-store` 且无 Cookie/redirect | 通过 | `session.test.ts`、`skeleton-server.integration.test.ts` |
| WebSocket Session | 握手先验 Origin；首条 text message 认证；认证前无事件；拒绝 URL/header token、超时和非法消息 | 通过 | `skeleton-server.integration.test.ts` |
| API 错误 | parser 与未知异常只返回稳定 error envelope，不返回原始正文、框架消息或堆栈 | 通过；本任务补强 | `bootstrap/app.ts`、`skeleton-server.integration.test.ts` |
| Secret Store | Keychain secret 经 stdin 传递且不进入 argv；headless/非 macOS 返回稳定脱敏错误，无文件 fallback | 通过 | `platform-security.integration.test.ts`、既有真实 Keychain 往返 |
| 文件引用与权限 | 拒绝绝对路径、`..`、反斜杠、深层路径和符号链接；目录/文件使用 `0700/0600` | 通过 | `platform-security.integration.test.ts` |
| MIME、扩展名与大小 | 扩展名/MIME 联合 allowlist；校验声明大小和无 `Content-Length` 的真实流式上限 | 通过；本任务补强 | `platform-security.integration.test.ts` |
| 重定向与超时 | 只允许显式 origin；逐跳重验；限制 redirect 数与总超时 | 通过 | `platform-security.integration.test.ts` |
| Provider 进程 | 参数数组、受限环境、stdin-only 敏感正文、输出上限、取消/超时与迟到结果隔离 | 通过 | `provider-adapters.integration.test.ts` |
| NetEase 媒体 | 固定协议入口；媒体域名、DNS 私网、redirect、Range、MIME 与 100 MiB 上限校验；短期 URL 不持久化 | 通过 | `provider-adapters.integration.test.ts`、Library integration |
| 日志与诊断 | token/key/cookie/password、prompt/scenario/lyrics/raw output、URL credential 和用户路径递归脱敏；Error 不输出 stack | 通过 | `platform-security.integration.test.ts`、Provider integration |
| 浏览器持久化 | Session 不进入 Cookie、LocalStorage、SessionStorage、IndexedDB、URL 或 Service Worker cache | 通过 | `skeleton-connection.spec.ts`、`transport.ts` 与 S2-04 证据 |

本任务发现并修复一个跨层缺口：请求体 parser 等路由前异常原由 Fastify 默认错误响应处理。现在所有未被业务映射的 `4xx/5xx` 异常都收敛为 Koradio 稳定、安全的 error envelope，新增 malformed JSON 回归证明敏感正文、`SyntaxError` 与 stack 不会进入 API。

## 3. 依赖、license 与供应链

| 检查 | 结论 |
|---|---|
| 已知漏洞 | `pnpm audit --audit-level high` 对完整依赖树返回 `No known vulnerabilities found` |
| 生产依赖范围 | 5 个 workspace 中 14 个顶层生产依赖；license 扫描覆盖 89 个生产依赖条目 |
| 生产 license | 仅 MIT、Apache-2.0、BSD-3-Clause、ISC、BlueOak-1.0.0；无未知、专有或强 copyleft 生产依赖 |
| 开发 license | 自动化工具包含 MPL-2.0 等开发期依赖，不进入当前 production 文件树；未来若改变捆绑边界必须重新审计 |
| 锁定与来源 | 直接依赖精确版本、单一 frozen `pnpm-lock.yaml`、无 Git/URL dependency；workspace 内部使用 `workspace:*` |
| 安装脚本 | `strictDepBuilds: true`，只允许 `esbuild` build script；未启用 `dangerouslyAllowAllBuilds` |
| 发布年龄 | `minimumReleaseAge: 1440`，依赖至少观察 24 小时；Node/pnpm engine 精确限制 |
| CI 供应链 | 第三方 GitHub Actions 固定完整 commit SHA；CI 使用 frozen install |

新增 `pnpm audit:dependencies` 稳定入口，组合已知漏洞扫描和生产 license allowlist。license 检查遇到未知或未批准标识会失败；它不生成发布声明，完整 `THIRD_PARTY_NOTICES.md` 仍由 `S7-04` 基于最终包装文件树生成。

漏洞扫描是 2026-07-20 的 registry 快照，不证明未来不会披露新漏洞；S6-05、依赖升级和任何发布候选都必须重新执行。

## 4. Provider 与发布风险

| Provider | 当前 Personal Local Preview | 公开分发结论 |
|---|---|---|
| Codex | 使用用户本机安装并已登录的 CLI；auth 不捆绑，prompt 不进入 argv/日志 | 发布文档必须要求用户自备配置，禁止捆绑或采集 auth；S7 复核最终包装 |
| NetEase | 最小 TypeScript `linuxapi` Adapter 已由 Port、schema、媒体校验和 Mock 隔离；只允许项目所有者个人预览 | 非官方协议不等于条款或内容授权；任何外部分发前必须重新验证条款、协议、内容边界与替代 Provider，否则阻断发布 |
| Apple TTS | Adapter 已实现并可文字降级；bundled native helper 尚不存在 | helper、Node 与 app 必须完成双架构签名、公证、Gatekeeper 和干净环境验收 |

NetEase 发布风险对当前渠道通过“禁止外部分发、无公开下载、Provider Port 隔离和 S7 硬门”缓解，不构成当前未缓解 Critical/High；该结论不授权公开发布。真实 Codex + NetEase 产品运行组合与 native helper 仍未验证。

## 5. 验证记录

使用 Node.js `24.18.0`、pnpm `11.13.0` 执行：

| 检查 | 结果 |
|---|---|
| 安全专项 | `platform-security` + `skeleton-server` 共 2 个文件、18 个用例通过 |
| `pnpm audit:dependencies` | 完整依赖树无已知漏洞；89 个生产依赖条目的 license allowlist 通过 |
| 仓库敏感模式扫描 | 未发现私钥、GitHub token、Google API key、AWS access key 或 OpenAI-style secret 模式 |
| `pnpm check` | format、typecheck、lint、18 unit 文件 76 用例、7 contract 文件 58 用例、14 integration 文件 76 用例、7 component 文件 30 用例、46 coverage 文件 240 用例与 build 全部通过 |
| Coverage | statements 81.16%、branches 72.44%、functions 83.63%、lines 81.77% |
| `pnpm test:e2e` | Chromium、Firefox、WebKit 共 89 个通过、61 个既有显式能力跳过；无失败 |
| `pnpm test:visual` | Chromium 1 个确定性视觉门通过 |
| 人工 API/日志复核 | error envelope、session bootstrap、Provider 错误、健康状态与结构化日志均未包含 secret、原始敏感正文、用户路径或 stack |

## 6. 结论与剩余边界

- 当前 v1 本地威胁模型内无未缓解 Critical/High 安全、隐私、漏洞或生产 license 问题，S6-03 验收通过。
- `S6-04` 成为下一 Ready 任务；长时播放、缓存增长、性能、跨浏览器和无障碍回归不由本任务提前声明完成。
- 同机恶意进程、真实 Provider 联合运行、bundled native helper、最终包装依赖归集、签名公证和公开分发合规仍分别由既定后续阶段处理。
