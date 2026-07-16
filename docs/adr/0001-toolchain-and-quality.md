# ADR 0001：工具链与质量基线

> 状态：已接受
> 日期：2026-07-15
> Task：S0-03
> 决策人：项目所有者
> 取代：无
> 实施状态：S1-01～S1-04 已完成；根命令族与固定完整 Action SHA 的 GitHub Actions 工作流已由 [真实 CI run](https://github.com/komochi007/koradio/actions/runs/29477544514) 验证

## 1. 决策摘要

Koradio 采用 Node.js 24 LTS、Corepack 与 pnpm 11 的原生 workspace，使用 ESM-only TypeScript 6 工程引用组织四个目标边界。Web 由 Vite 构建，Server 与共享 packages 由 `tsc -b` 构建；质量体系由 ESLint、Prettier、Vitest、React Testing Library、Playwright 与 axe-core 组成；常规 CI 使用 GitHub Actions。

本 ADR 固定后续脚手架必须实现的版本、锁文件、根命令、测试分层、供应链控制和升级策略。本 ADR 作出时仓库还没有 manifest、锁文件、产品源码或质量配置；这些目标合同现已由 S1 实装，历史决策上下文保留不变。

## 2. 上下文与范围

目标架构已经确定 TypeScript monorepo、React + Vite Web/PWA、Node.js + Fastify Local Service、共享 contracts 和 design tokens，但尚未确定实际工具链。若 S1 自行选择版本或命令，会让安装、CI、测试和 macOS 包装形成多套隐含前提。

本决策包含：

- Node.js、Corepack、package manager 与 workspace。
- TypeScript、Web/Server 构建方式和模块解析。
- lint、format、unit、contract、integration、component、E2E、视觉与无障碍工具。
- 根命令族、锁文件、依赖安装安全、CI 分层和升级策略。
- 后续 macOS 包装必须验证的工具链边界。

本决策不包含：

- Development / production 运行拓扑、绑定地址、端口、session bootstrap 或 Origin allowlist；由 S0-04 决定。
- macOS 桌面壳或 PWA + Local Service 安装器的最终形态；由 S0-05 决定。
- Product 支持的最低 macOS 版本、CPU 架构和签名公证实现。
- Provider SDK、数据库驱动、ORM 或业务依赖的具体选择。
- manifest、配置、工作流、源码、测试或安装产物的实际创建；由 S1 及后续任务完成。

## 3. 约束与裁决标准

候选方案必须同时满足：

1. 支持 `strict`、`noImplicitAny`、ESM 和 Web/Node 不同模块解析边界。
2. 支持四个 workspace 边界、单一锁文件和可复现 CI 安装。
3. 覆盖 Domain、contract、integration、React component、真实浏览器 E2E、视觉和无障碍测试。
4. 能在 Linux 执行常规质量门，并在 macOS 验证平台集成和最终包装。
5. 不要求在 S0 引入产品脚手架，也不提前选择桌面包装框架。
6. 依赖安装默认不执行未经审查的 lifecycle/build scripts。

## 4. 官方兼容性证据

下表是 2026-07-15 的决策快照；精确版本来自官方发布页、官方文档和 npm registry 元数据。后续升级按第 11 节处理，不能把 `latest` 当作可复现配置。

| 项目 | 证据与结论 |
|---|---|
| Node.js | [官方发布周期](https://nodejs.org/en/about/previous-releases)将 Node 24 列为 LTS，并建议生产应用使用 Active LTS 或 Maintenance LTS；选择 24.18.0。 |
| pnpm / Corepack | [pnpm 安装文档](https://pnpm.io/installation)说明 pnpm 11 需要 Node.js 22.13+，并支持通过 Corepack 的 `packageManager` 字段固定版本；Node 24 满足要求。 |
| Workspace | [pnpm workspace 文档](https://pnpm.io/workspaces)规定根 `pnpm-workspace.yaml`，并提供 `workspace:` 协议约束内部依赖。 |
| TypeScript / ESLint | [TypeScript 6.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html)提供本代编译器基线；[typescript-eslint 兼容矩阵](https://typescript-eslint.io/users/dependency-versions/)支持 TypeScript `<6.1.0` 与 ESLint 10，因此选择 TypeScript 6.0.x 而非尚未进入该支持范围的下一主版本。 |
| Vite | [Vite 发布策略](https://vite.dev/releases)要求 TypeScript 用户锁定可控版本，并由兼容性说明覆盖 Node 24；选择 8.1.4。 |
| Vitest | [Vitest 迁移文档](https://vitest.dev/guide/migration.html)说明 Vitest 4 的 Node/Vite 支持边界；选择与当前 Vite 兼容的 4.1.10。 |
| ESLint | [ESLint 官方入门](https://eslint.org/docs/latest/use/getting-started)列出 ESLint 10 支持 Node 24；选择 flat config。 |
| Prettier | [Prettier 官方安装说明](https://prettier.io/docs/install)要求在项目中精确固定版本，以避免格式输出随环境漂移。 |
| Playwright | [Playwright 安装文档](https://playwright.dev/docs/intro)覆盖 Node 24、Chromium、Firefox 和 WebKit；[component testing 文档](https://playwright.dev/docs/test-components)仍将该能力标为 experimental，因此不作为组件测试基线。 |
| pnpm 安装安全 | [pnpm 设置文档](https://pnpm.io/settings)提供 `minimumReleaseAge`、`allowBuilds`、`strictDepBuilds`、`nodeVersion` 和 `engineStrict` 等控制；pnpm 11 使用 `allowBuilds` 取代旧的 build-script allowlist 设置。 |

## 5. 候选方案与裁决

| 决策面 | 采用 | 未采用 | 原因 |
|---|---|---|---|
| Node.js | 24.18.0 LTS | 26 Current；22 Maintenance LTS | 24 同时提供生产 LTS 生命周期和当前工具支持；不把 Current 带入 v1 基线，也不从更早维护线起步。 |
| Package manager | Corepack 0.35.0 + pnpm 11.13.0 | npm；Yarn Berry | pnpm 原生 workspace、严格内部依赖与部署裁剪能力符合 monorepo 和包装验证需求；不为现阶段引入 Yarn PnP 兼容面。 |
| Workspace orchestration | pnpm 原生 workspace | Turborepo；Nx | 四个边界和单机产品暂不需要远程缓存或任务图平台；用真实瓶颈证明必要性后再评估。 |
| TypeScript | 6.0.3 | 7.x；5.x | 6.0.3 落在 typescript-eslint 官方支持范围内；不采用工具生态尚未完整覆盖的下一主版本，也不从旧代开始。 |
| Build | Web 使用 Vite 8.1.4；Server/contracts/tokens 使用 `tsc -b` | 全部由 Vite 打包；自定义 bundler | Web 保留浏览器构建能力，Node 与共享边界保留 TypeScript project references 和明确产物；包装可在 S0-05 决定是否额外 bundle。 |
| Unit / integration | Vitest 4.1.10 + `@vitest/coverage-v8` 4.1.10 | Jest；Node test runner | 与 Vite 配置和 TS 路径共享，覆盖率实现明确；不增加转换层或拆分测试生态。 |
| React component | React Testing Library 16.3.2 + jsdom 29.1.1，由 Vitest 执行 | Playwright Component Testing | 采用稳定 DOM 行为测试；避免将 experimental runner 作为质量门。 |
| Browser automation | Playwright 1.61.1 + `@axe-core/playwright` 4.12.1 | Cypress；仅人工浏览器验收 | 单一 runner 覆盖 Chromium、Firefox、WebKit、截图、真实键盘和无障碍扫描。 |
| Lint / format | ESLint 10.7.0 flat config + typescript-eslint 8.64.0 typed lint；Prettier 3.9.5 | TSLint；Biome/Oxlint 全量替代 | 选择与 TypeScript 6 有声明兼容范围的类型感知 lint，并把语义检查与确定性格式化分开。 |
| CI | GitHub Actions | 新增其他 CI 平台 | 仓库和 PR 已在 GitHub；减少额外权限、状态事实源与维护面。 |

## 6. 版本、模块与 workspace 基线

S1 必须实现以下合同：

- `engines.node` 为 `>=24.18.0 <25`，仓库 Node 版本文件精确固定 `24.18.0`。
- 根 manifest 为 ESM，设置 `"type": "module"`。
- `packageManager` 精确固定 `pnpm@11.13.0`；Corepack 准备步骤精确固定 `corepack@0.35.0`。
- 根 `pnpm-workspace.yaml` 只登记 `apps/*` 与 `packages/*`，全仓只有一个根 `pnpm-lock.yaml`。
- workspace 内部依赖必须使用 `workspace:*`，不得退化到 registry 中同名包。
- 不创建 npm、Yarn 或 Bun 锁文件，不混用 package manager。
- 所有直接 dependencies 与 devDependencies 使用精确版本；不得写 `latest`、`next`、宽松 `*` 或无审查的 Git URL。
- TypeScript 使用 project references。Web 使用 `moduleResolution: "bundler"`；Server 和 Node 工具使用 `module` / `moduleResolution: "NodeNext"`。
- `strict` 与 `noImplicitAny` 必须显式启用；共享基线不得用弱化选项覆盖工程规则。
- pnpm 原生递归拓扑顺序承担 workspace build，不在 S1 引入 Turborepo 或 Nx。

## 7. 构建与根命令合同

S1 必须在根 manifest 提供下列稳定 script 名。脚本内部可组合 workspace 子命令，但公共名称只有经新 ADR 或明确规则变更才能改名。

| Script | 合同 |
|---|---|
| `dev` | 启动 S0-04 选定的开发拓扑；在 S0-04 完成前不得猜端口或进程关系。 |
| `typecheck` | 对全部 project references 执行无产物或受控增量类型检查。 |
| `lint` | 对源码、测试、配置执行 ESLint flat config 与 typed lint。 |
| `format` | 使用精确固定的 Prettier 写入受支持文本文件。 |
| `format:check` | 只检查格式，不修改文件。 |
| `test:unit` | 执行纯函数、Domain policy、状态转换和 Audio Engine 确定性单元测试。 |
| `test:contract` | 执行 Zod wire schema、event/error envelope 与兼容样例测试。 |
| `test:integration` | 执行 module、repository、transaction、adapter mapping 与平台边界测试。 |
| `test:component` | 用 Vitest + React Testing Library + jsdom 执行 React 组件行为和无障碍语义测试。 |
| `test:e2e` | 用 Playwright 执行真实浏览器核心用户路径和恢复路径。 |
| `test:visual` | 用 Playwright 对冻结 viewport 和状态执行截图回归。 |
| `test:coverage` | 汇总 Vitest V8 coverage；阈值在 S1-02 基于模块风险显式配置，不以全局单一数字替代关键路径要求。 |
| `build` | 以拓扑顺序构建共享 packages、Server 与 Web；Web 使用 Vite，Node/shared 使用 `tsc -b`。 |
| `check` | 聚合常规合并门：`format:check`、`typecheck`、`lint`、非浏览器测试和 `build`；浏览器、平台与包装门由 CI 对应 job 显式执行。 |

标准调用形式为 `pnpm <script>`。CI 安装必须使用 `pnpm install --frozen-lockfile`。在 S1 实际创建这些 scripts 并验证前，README 不得声称命令可运行。

## 8. 测试分层与执行环境

| 层级 | Runner / 环境 | 必须覆盖 | 默认 CI |
|---|---|---|---|
| Unit | Vitest / Node 或受控 jsdom | Domain policy、纯函数、状态机、projection、Audio Engine 确定性逻辑 | Linux，每个 PR |
| Contract | Vitest / Node | Zod command、DTO、event、error 的有效/无效样例和兼容性 | Linux，每个 PR |
| Integration | Vitest / Node + 临时 SQLite/文件目录 + Provider fakes | module use case、transaction、repository、adapter mapping、session/file boundary | Linux，每个 PR；平台 adapter 另在 macOS |
| Component | Vitest + React Testing Library + jsdom | 关键 UI 状态、键盘、focus、ARIA、reduced motion 和错误恢复 | Linux，每个 PR |
| E2E | Playwright | Profile、配置、生成、播放、反馈、重连和关键失败恢复 | Linux，每个 PR；Chromium 主门，Firefox/WebKit 按矩阵运行 |
| Visual | Playwright screenshots | VDA-17 映射的固定状态、Dark/Light 与响应式 viewport | 固定 Linux image；基线更新必须人工审阅 |
| Accessibility | Testing Library + axe/Playwright + 人工审阅 | 语义、键盘、focus、自动规则和人工不可替代项 | Linux 自动门；阶段验收人工补充 |
| Platform / packaging | Vitest/Playwright probes + macOS shell validation | Credential Store、数据目录、进程生命周期、安装/升级/回滚、签名公证 | macOS；S0-05、S2、S7 对应任务 |

真实 Codex、网易云或 TTS 不进入普通 PR 测试。Unit、contract、integration、component 和常规 E2E 使用 Port fakes 与固定脱敏 fixtures；最小真实 Provider 验证由 S0-06 和受控 smoke 任务承担。

Playwright 测试宿主的 macOS 最低版本不自动成为 Koradio 产品支持下限。产品最低 macOS 版本必须由包装和发布任务独立裁决。

## 9. CI 基线

- 常规平台为 GitHub Actions。
- Linux jobs 执行 frozen install、`check`、Playwright E2E、视觉和自动无障碍门。
- macOS jobs 执行 OS Credential Store、应用数据目录、文件权限、进程生命周期和包装相关探针；不重复所有 Linux 测试来制造无收益的矩阵成本。
- CI 的 Node、Corepack、pnpm 和浏览器版本必须与仓库配置一致；Playwright 浏览器由锁定版本安装。
- 第三方 Actions 必须固定完整 commit SHA；允许注释对应 release tag，不得仅固定浮动 major tag。
- CI cache 只能加速下载，不得替代 `pnpm-lock.yaml` 或 frozen install；cache key 必须包含平台、Node major、pnpm 版本与 lockfile hash。
- 任何必需门无法运行时必须失败或显式披露，不得静默跳过。

## 10. 依赖与供应链控制

S1 必须把下列策略写入可审查配置：

- `nodeVersion: 24.18.0` 与 `engineStrict: true`，阻止不兼容依赖进入锁文件。
- `minimumReleaseAge: 1440`，新发布版本至少观察 24 小时；安全热修复例外必须精确列出包和版本并在 PR 说明原因。
- `strictDepBuilds: true`，使用 pnpm 11 的 `allowBuilds` 明确批准或拒绝依赖 lifecycle/build scripts；不得启用 `dangerouslyAllowAllBuilds`。
- 对需要 build script、原生二进制、下载可执行文件或 Git dependency 的包逐项复核来源、license、支持架构、校验和与包装行为。
- CI 使用 frozen lockfile；lockfile 变化必须与 manifest 变化同一 PR 审阅，不允许 CI 自动改写后继续。
- 常规依赖更新不得自动合并。安全告警按风险优先处理，但仍必须运行受影响质量门。

## 11. 升级策略

- Node.js 保持 24 LTS，并按安全与稳定更新评估 patch；切换 major 或 LTS 线必须新建或取代 ADR，并重新验证 macOS 包装。
- Corepack、pnpm、TypeScript、Vite、Vitest、ESLint、Prettier 和 Playwright 均以独立 PR 升级，更新精确版本和锁文件并运行完整受影响门。
- patch / minor 升级仍需阅读 release notes；可能改变类型、格式、快照、浏览器或产物的 minor 不得视为无行为变化。
- 任何 major 升级必须记录兼容矩阵、迁移影响和回滚路径；不得自动合并。
- 每季度至少复核 LTS 生命周期、工具支持矩阵、弃用公告、漏洞和 license；复核不等于必须升级。
- 回滚使用上一个已验证的 manifest、版本文件和 lockfile 组合，不单独手改 lockfile 或降级某个 transitive dependency。

## 12. macOS 包装边界

- pnpm 开发期的链接式 `node_modules` 不得未经验证直接复制进安装包。
- S0-05 必须比较受控 bundling 与 [`pnpm deploy`](https://pnpm.io/cli/deploy) 生成 self-contained production 文件树的可行性，并验证 Server 启动、动态资源、native dependency 和 license 归集。
- 最终安装包必须自带所需运行时，不能要求最终用户预装 Node.js、Corepack 或 pnpm。
- 若 packaging PoC 证明 Node 24、pnpm 产物或关键依赖无法覆盖目标 macOS 架构，本 ADR 必须回到提议状态或由新 ADR 取代；不得在 S7 临时绕过锁文件或安全设置。

## 13. 后果与风险

正面后果：

- S1 有唯一运行版本、安装入口、构建边界、命令族和测试工具，不再依赖 Agent 猜测。
- Web、Node、共享 contract 和真实浏览器测试使用相容但职责分离的工具。
- 单一锁文件、精确版本、发布年龄和 build-script allowlist 缩小供应链漂移。
- Linux 常规门与 macOS 平台门分工明确，为后续包装保留验证点。

代价与风险：

- 当前开发机的 Node.js 26 不是仓库目标版本；S1 必须先切换/准备 Node 24.18.0 后才能生成可信锁文件。
- pnpm 链接布局可能影响 macOS 生产打包，必须由 S0-05 验证 `deploy` 或 bundling 路径。
- ESLint typed lint、三浏览器 E2E 与视觉回归会增加 CI 时间；可按风险拆 job，但不能删除必需覆盖。
- 精确版本降低无审查漂移，也要求依赖更新 PR 持续维护。

## 14. 验收映射

| S0-03 / README 未决项 | ADR 结论 |
|---|---|
| Package manager | Corepack 0.35.0 + pnpm 11.13.0；单一 `pnpm-lock.yaml`。 |
| Node.js 和依赖版本 | Node 24.18.0 LTS；工具精确版本、直接依赖精确版本与升级策略。 |
| Workspace 工具 | pnpm 原生 workspace + `workspace:*`；暂不引入 Turborepo/Nx。 |
| Build | Web Vite 8.1.4；Server/shared `tsc -b`；拓扑 build。 |
| Test runner | Vitest 4.1.10 + V8 coverage。 |
| Component testing | React Testing Library 16.3.2 + jsdom 29.1.1。 |
| Browser automation | Playwright 1.61.1 + axe-core；不采用 experimental component testing。 |
| Lint / format / typecheck | ESLint 10.7.0 + typescript-eslint 8.64.0；Prettier 3.9.5；TypeScript 6.0.3 project references。 |
| 命令族 | 第 7 节固定 14 个根 scripts；当前只作为 S1 合同。 |
| CI 与 macOS | GitHub Actions；Linux 常规门，macOS 平台/包装门。 |

Development / production 端口不属于工具链决策，继续由 S0-04 关闭。

## 15. 后续任务

- S0-04：固定运行拓扑、端口、session bootstrap 与 Origin 边界，并完善 `dev` 合同。
- S0-05：验证 pnpm production 文件树、Node runtime 捆绑和 macOS 包装形态。
- S1-01：创建 manifest、workspace、版本文件和 lockfile，验证 Node/pnpm 安装闭环。
- S1-02：实现本 ADR 的 TypeScript、ESLint、Prettier、Vitest、Testing Library 与 Playwright 配置及根 scripts。
- S1-04：创建固定完整 Action SHA 的 GitHub Actions 工作流，并以真实 run 验证门禁。
