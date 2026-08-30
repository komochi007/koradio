# Koradio 版本管理规范

> Status: Active<br>
> Applies to: `v1.0.0` 起的本机正式版、后续优化与产品迭代<br>
> Distribution boundary: 当前仅供项目所有者在本机使用；版本号和 Git tag 不代表已授权外部发布或分发。

## 1. 版本身份

Koradio 使用两个彼此独立、共同定位产物的编号：

- **产品版本**：仓库根目录 [VERSION](../../VERSION) 中的 `MAJOR.MINOR.PATCH`，同时与根 `package.json`、`apps/desktop/package.json` 保持一致，并写入 macOS `CFBundleShortVersionString`。
- **构建号**：对应源码提交在仓库中的 Git commit count，必须为正整数并写入 `CFBundleVersion` 与 `build-metadata.json`。构建号只表示先后与追溯关系，不参与产品版本含义。

准确识别一个安装包时必须同时记录：产品版本、构建号、完整源码提交和来源远端。`v1.0.0` 是首个本机正式版；外部 Beta、公开下载、Developer ID 签名与公证仍是独立发布门，不因版本号存在而自动获得授权。

## 2. 版本号规则

| 变更类型 | 版本变化 | 适用范围 |
|---|---|---|
| `PATCH` | `1.0.0 → 1.0.1` | 缺陷、安全或维护修复；不有意改变既有产品能力、设计与数据契约 |
| `MINOR` | `1.0.x → 1.1.0` | 向后兼容的新能力、明确的体验扩展或较大范围优化 |
| `MAJOR` | `1.x.y → 2.0.0` | 不兼容的数据、公共 contract、核心用户路径或支持平台边界变化 |

以下变更不单独提升产品版本，但会生成新的构建号：纯文档修正、测试维护、CI 或不进入应用产物的工程整理。若同一任务同时包含产品或运行时变化，按最高影响级别提升版本。

当前构建和自动更新只接受三段数字正式版本，不支持 `alpha`、`beta`、`rc` 后缀。未来确需预发布渠道时，必须先扩展并验证构建、比较、升级和回滚规则，不得只在文件名中临时添加后缀。

## 3. 单一事实源与一致性

每次提升产品版本时，必须在同一任务中同步：

1. `VERSION`。
2. 根 `package.json` 与 `apps/desktop/package.json` 的 `version`。
3. 对应任务、验收记录和用户可见发布说明中出现的当前版本。
4. 受版本变化影响的安装、升级与回滚验证。

锁文件若未记录 workspace 包自身版本，不为制造差异而改动。历史验收记录中的旧版本号属于当时事实，除非表述错误，否则不得批量改写。

## 4. 开发、验收与安装流程

1. 开始任务前按 [Git 工作流](git-workflow.md) 同步 clean `main`，确认没有归属不明改动。
2. 在方案阶段判断本次是否需要 `PATCH`、`MINOR` 或 `MAJOR`；无法判断且会影响公共行为时先由项目所有者确认。
3. 先更新权威文档，再完成最小实现和回归测试；需要升版时同步第 3 节的版本事实源。
4. 执行适用的 `pnpm check`、浏览器/视觉、依赖审计、macOS 包验证和人工验收。
5. 只显式暂存本任务路径，提交信息包含任务 ID，推送 `origin/main`。
6. 从最终 `main` 提交构建并安装；验证 metadata、strict codesign、启动与正常退出，确认用户数据未改变。
7. 稳定正式版本在最终提交创建 annotated tag `vMAJOR.MINOR.PATCH` 并推送。tag 一经推送不得移动、删除或复用；任何新二进制必须使用新版本或至少新的源码提交与构建号。

手动构建默认读取 `VERSION`，也可显式传入相同的产品版本；构建号默认由源码提交计算：

```bash
COMMIT="$(git rev-parse HEAD)"
BUILD_NUMBER="$(git rev-list --count "$COMMIT")"
node scripts/release/build-macos.mjs \
  --arch arm64 \
  --version "$(tr -d '[:space:]' < VERSION)" \
  --build-number "$BUILD_NUMBER" \
  --commit "$COMMIT" \
  --output artifacts/macos/release \
  --keep-app \
  --no-dmg
```

## 5. Git 分支与提交规范

- `main` 是唯一长期分支和本机自动更新来源；当前不保留 `develop`、版本分支或长期功能分支。
- 常规任务直接在 clean `main` 顺序完成。只有项目所有者明确要求，或高风险隔离方案经确认后，才创建 `codex/<task-id>-<slug>` 临时分支。
- 临时分支必须在工作已合并、无独有提交、无未提交文件且获得项目所有者明确批准后才能删除。
- 一个任务使用一个或少量可独立验证的提交；禁止 force push、改写已推送历史或移动正式版本 tag。
- 修复已安装正式版时使用新的 patch 版本；不要用相同 tag 覆盖不同源码或二进制。

## 6. 迭代记录与兼容性

每次产品版本变化至少记录：目标与范围、版本判断、源码提交、构建号、受影响 contract/数据/UI、验证结果、已知限制与回滚方式。记录优先落在对应任务和验收文档；进入外部发布阶段后，再按发布清单维护 release notes、校验和、签名和公证证据。

版本升级默认必须保留 `~/Library/Application Support/Koradio`、Updater 回滚备份和 Keychain 凭据。涉及数据库或持久化格式时，应先验证向前迁移、失败回滚和旧数据可读性；任何自动清理用户数据的行为都需要单独明确授权。

## 7. 外部发布边界

本机正式版与外部发布渠道相互独立：

- 当前 `v1.0.0` 仅确认项目所有者本机使用基线。
- 外部 Beta 或公开下载仍须单独授权，并完成 Developer ID、Apple 公证、Gatekeeper、独立干净环境、Provider 合规、隐私与发布材料等门禁。
- 未来首次对外版本不必重新使用 `v1.0.0`；应发布届时已经通过外部门禁的实际版本，并冻结其精确 tag、提交、构建号和产物。
