# ADR 0007：增加 DeepSeek 节目规划 Provider

> 状态：已接受
> 日期：2026-08-06
> 决策人：项目所有者
> Task：AI 大脑可切换与 DeepSeek 接入
> 取代：无
> 被取代：无

## 1. 背景

Koradio 当前使用本机 Codex CLI 完成节目规划。用户确认新增 DeepSeek API 作为第二个 AI 大脑，用于读取已有 `EffectiveTaste`、编排节目和生成 DJ 串讲，并要求在设备级 Settings 中配置与切换。当前系统已有 Provider Port、DeviceSettings、macOS Keychain、Mock/live composition 和生成任务失败保护，但没有远程规划 Provider 或业务凭据接入。

本决策只覆盖节目规划 Provider 的选择、DeepSeek API 边界、密钥存储和 Settings 公共行为；不改变 Music Provider、TTS、Browser Audio Engine、Profile 数据 owner 或已有节目持久化模型。

## 2. 决策范围

### 包含

- 在 `codex` 与 `deepseek` 之间选择活动的节目规划 Provider。
- DeepSeek `deepseek-v4-flash` / `deepseek-v4-pro` 模型选择。
- DeepSeek 读取与 Codex 相同的有界 planning context，其中包含当前 Profile 的 `EffectiveTaste`、历史和最多 500 首可播放库内曲目摘要。
- macOS Keychain 中的 API key 写入、替换、删除和只读配置状态。
- 首次启用隐私确认、持久隐私提示、切换生效时机、失败与重试边界。

### 不包含

- 自定义 DeepSeek endpoint、代理地址、账号体系、云端同步或浏览器直连。
- 自动在 Codex 与 DeepSeek 之间 fallback。
- 把 API key 写入 SQLite、浏览器存储、URL、命令行参数或日志。
- 让已有运行中的节目或 generation job 因 Settings 切换而重启或改写。

## 3. 约束与决策驱动因素

| 因素 | 必须满足的条件 | 证据来源 |
|---|---|---|
| 产品与流程 | 用户可在设备级 Settings 选择 AI 大脑；下一次生成使用新选择；旧节目和当前任务不被切换打断 | [PRD](../prd.md)、[用户流程](../user-flow.md) |
| 编排上下文 | DeepSeek 必须读取既有 `EffectiveTaste`，由 Backend 组装有界上下文，不能读取完整数据库或 Browser 状态 | [架构](../../architecture.md)、[AI_RULES](../../AI_RULES.md) |
| Provider 边界 | 通过 Backend Planner Provider Port 调用，响应先经过现有节目计划 schema 校验 | [架构](../../architecture.md)、[Programs Provider Port](../../apps/server/src/modules/programs/providers.ts) |
| 安全 | API key 只进入 OS Credential Store；响应正文、reasoning、prompt 和密钥不得进入普通日志、SQLite 或公共 API | [AI_RULES](../../AI_RULES.md)、[Secret Store](../../apps/server/src/platform/secrets/index.ts) |
| 外部 API | 使用固定官方 `https://api.deepseek.com/chat/completions`、Bearer auth、JSON Output 和 Thinking Mode；网络失败不自动切换 Provider | [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) |
| 测试 | Mock、单元、契约和集成测试不调用真实 DeepSeek；真实 smoke 只在受控本机手动执行 | [ADR 0001](0001-toolchain-and-quality.md)、[AI_RULES](../../AI_RULES.md) |

## 4. 候选方案

### 方案 A：Backend 内置 DeepSeek Adapter，设备级显式切换

- 做法：新增 `DeepSeekPlannerProvider`，使用原生 `fetch` 调用固定 Chat Completions endpoint；API key 由 Keychain Port 提供；DeviceSettings 保存 provider/model/privacy 状态；生成开始时读取一次活动 Provider。
- 收益：保持现有 Port 和应用边界；不增加 SDK、浏览器秘密或第二套 planning contract；可复用 `EffectiveTaste`、历史、库内曲目和现有 Zod 计划校验。
- 代价：需要维护远程网络超时、限流和余额错误映射；DeepSeek 调用产生外部费用和数据出站风险。
- 风险：网络不可用、认证/余额不足或响应不符合 schema 时本次生成失败；远程服务能力与价格可能变化。
- 验证结果：由本任务的 adapter contract/integration tests、非网络 smoke stub、Settings/API/Provider composition tests 验证；真实 API 不进入 CI。

### 方案 B：Browser 直接调用 DeepSeek

- 做法：前端保存 API key 并直接调用 DeepSeek。
- 收益：实现路径短。
- 代价：暴露 API key、扩大 CORS 和 prompt 数据边界，无法统一审计、重试、schema 校验和日志脱敏。
- 风险：违反本地秘密与 Provider Port 规则，不采用。

### 方案 C：DeepSeek 失败自动回退 Codex

- 做法：当前 Provider 出错时由 Backend 自动换另一个 Provider 重试。
- 收益：可能提高生成成功率。
- 代价：用户无法判断实际数据出站和费用来源，失败延迟不可预测，两个 Provider 的输出风格与数据边界不透明。
- 风险：隐私与费用不可控；运行中的任务语义不稳定，不采用。

## 5. 裁决

选择方案 A。

- 公共 Provider 选择为 `plannerProvider: "codex" | "deepseek"`，默认和迁移后的既有设备均为 `codex`。
- DeepSeek 模型只允许 `deepseek-v4-flash` 与 `deepseek-v4-pro`；默认 `deepseek-v4-flash`。
- endpoint 固定为 `https://api.deepseek.com/chat/completions`，不提供自定义 base URL。
- 请求使用 Bearer API key、JSON Output、现有 `codexProgramPlanOutputSchema` 的 JSON Schema 提示和 Thinking Mode；`reasoning_content` 只在边界读取后丢弃，不进入业务或日志。
- 只在 generation job 开始时解析活动 Provider。Settings 切换或模型改变只影响下一次生成；正在运行的任务继续使用启动时 Provider，旧节目保持不变。
- 只对 429、500、503 做一次有界重试；401、402、422、配置缺失、取消、超时和结构化响应错误不自动切换到其他 Provider。
- 第一次启用 DeepSeek 前要求用户确认隐私提示；确认后持久化已接受状态。Settings 始终显示 DeepSeek 数据出站与费用风险提示。
- API key 通过 Keychain 写入、替换和删除；GET 只返回 `configured: boolean`，任何公共响应都不返回 key 或 Secret Store 内部引用。

## 6. 后果

### 正向后果

- 用户可以在同一台设备上明确选择本机 Codex 或 DeepSeek，且 `EffectiveTaste` 的读取路径保持一致。
- Provider 选择、模型选择、密钥状态和隐私确认均有可测试的设备级 owner。
- 失败仍遵循已有旧节目保护和文字 DJ/TTS 降级边界；不会因为配置切换破坏正在播放的节目。

### 负向后果与权衡

- DeepSeek 规划会把场景、品味摘要、历史摘要、音乐库摘要和偏好发送给远程服务；用户必须在首次启用时确认并可删除密钥、切回 Codex。
- 远程费用、限流、余额和服务可用性由 DeepSeek 控制；系统不承诺跨 Provider 自动兜底。
- 需要把健康状态从 Codex 专属语义改为活动 `planner`，以免未选中的 Provider 被误报为核心故障。

### 保持不变

- `EffectiveTaste` 仍由 Taste owner 合并反馈投影与人工覆盖；DeepSeek 只读取规划上下文，不写回品味。
- Music Provider、TTS、节目 schema、Library intent 解析、数据库事务和 Browser 播放边界不变。
- Mock/test/CI 默认保持确定性，不访问真实网络。

## 7. 实施与验证

| 项目 | 结果或计划 | 证据 |
|---|---|---|
| 实施路径 | 更新 DeviceSettings migration/contracts；新增 DeepSeek Adapter、Keychain credential service、Provider selector、Settings routes/UI 与健康语义 | 本任务变更文件 |
| 自动检查 | contracts、adapter、Keychain composition、generation provider snapshot、Settings API/UI、旧节目保护和完整质量门 | `pnpm test:*`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check` |
| 人工/外部验证 | 受控本机手动验证真实 API key、Flash/Pro 生成、隐私提示和切换生效；不将 key、prompt 或响应写入仓库 | DeepSeek 官方 API 文档与本机脱敏记录 |
| 回滚或替代路径 | 删除/停用 Keychain key 并切回 Codex；保留 Planner Port 与现有 Codex 路径；不删除用户节目和 taste 数据 | Settings 与数据恢复流程 |

## 8. 权威文档同步

| 文档 | 是否需要修改 | 原因或结果 |
|---|---|---|
| [docs/prd.md](../prd.md) | 是 | 新增 AI 大脑选择、隐私确认、密钥状态和下一次生成生效规则 |
| [docs/user-flow.md](../user-flow.md) | 是 | 新增首次启用、切换、失败、删除密钥和运行中任务流程 |
| [architecture.md](../../architecture.md) | 是 | 新增 DeepSeek 外部边界、Planner selector、Keychain 和健康语义 |
| [design/design.md](../../design/design.md) | 是 | 新增 AI 大脑设置、模型选择、隐私提示和密钥操作状态 |
| [AI_RULES.md](../../AI_RULES.md) | 是 | 把 Provider/secret/日志/测试硬约束扩展到 DeepSeek |
| [README.md](../../README.md) / [context.md](../../context.md) | 是 | 同步当前实现事实、默认行为和限制 |

## 9. 后续任务

- 完成本 ADR 对应的代码、契约、迁移和测试。
- 在受控 macOS 本机执行一次真实 DeepSeek Flash/Pro smoke，并只记录脱敏状态。
- 任何公开分发前重新确认 DeepSeek 条款、隐私说明、费用边界和用户文档。
