# SPEC-0013 验证证据

时间：2026-09-25。验证者：lumi Agent。规格：SPEC-0013 v0.1。实现 commit：`aadf89c`，已普通 push 到 `origin/main`。

环境：macOS arm64；Node 22.19.0；pnpm 10.20.0；DSH `0.1.7-rc.1`。本切片不调用真实模型或外部业务，不修改数据库 Schema、运行配置或授权。

## 审计结论

- 20 个 workspace package 的生产依赖图无环；`apps/runtime` 的高扇入符合 composition root 职责。
- 唯一明确的反向生产依赖是 `packages/action-runtime -> adapters/local-artifact`。端口迁移后变为 `adapters/local-artifact -> packages/action-runtime`。
- 模块内 `tests/` 与根 `tests/{contract,integration,e2e}` 的分层符合所有权，不做集中迁移。
- 根目录 12 个 `draft_*_folder` 共约 392 KiB、25 个文件，均为忽略的发布临时 XML/决策/预览；Git Markdown/SVG 源和 `data/` 回执已存在，无唯一内容。
- `data/` 约 1.8 GiB，主要是 Node/pnpm 与 Playwright 缓存、DSH 源码快照及运行数据；本切片只增加说明文件，不清理这些不同风险类别的数据。

## 证据矩阵

| 证据 | AC | 结果 |
| --- | --- | --- |
| E-01 draft 来源/引用/ignore 审计 | AC-001、007 | passed：12 个目录未跟踪、无运行引用；删除后根目录计数为 0 |
| E-02 data ignore 与说明 | AC-002 | passed：`data/README.md` 可跟踪，数据库、凭据、缓存和其他 data 子目录继续忽略 |
| E-03 provider 依赖倒置 | AC-003 | passed：action-runtime 无 adapter 生产依赖；adapter 类型兼容 re-export；runtime 从端口拥有者导入 |
| E-04 架构门禁 | AC-004、005 | passed：20 packages、41 source files、58 production edges、11 rule self-tests；无生产环或边界错误 |
| E-05 行为验证 | AC-003、006 | passed：完整 `pnpm check`，25 个 Vitest 文件、196 项测试、DSH pin、server/Workbench build |
| E-06 文档与运行状态 | AC-001、002、006、007 | passed：100 个 Markdown、209 个本地链接，diff check 无错误；4310 PID 26508 与 4313 PID 5493 保持监听 |

## 关键命令

```bash
pnpm install --offline --frozen-lockfile
pnpm check:architecture
pnpm exec vitest run \
  packages/action-runtime/tests/index.test.ts \
  adapters/local-artifact/tests/index.test.ts \
  apps/runtime/tests/index.test.ts
pnpm check
python3 scripts/check-docs.py
git diff --check
find . -maxdepth 1 -type d -name 'draft_*_folder'
```

依赖安装输出确认 lockfile up to date 且依赖已就绪；TRAE 在命令完成后因沙箱禁止写用户级 pnpm 临时状态而返回非零包装状态。未据此修改项目权限或绕过检查。后续 `pnpm check` 使用同一依赖树完整通过。

## 架构门禁范围

`scripts/check-architecture.mjs` 检查：

- production workspace dependency cycle；
- packages→adapters/apps/plugins 和 adapters/plugins→apps 等反向层级依赖；
- 源码引用未声明的 `@lumi/*` production dependency；
- 跨 package 相对 import；
- domain package 直接引用 DSH SDK；
- 模块 `src/` 中的测试文件；
- 根目录重新出现 `draft_*_folder`。

该检查是静态结构门禁，不替代 TypeScript、运行测试、安全审计或包级 API 兼容测试。

## 未执行与边界

- 未运行 Playwright；没有 UI、HTTP 或交互行为变更，Workbench production build 已通过。
- 未删除 `data/mvp-local`、`data/dev`、默认数据库、DSH home/凭据、工具缓存、浏览器或历史本机证据。
- 未拆并现有业务包。继续拆大文件只有在降低真实修改耦合且不破坏事务/所有权时才进行。
- 未创建 release/tag，未部署或发布飞书文档。

## 回滚

代码和规范可通过 revert `aadf89c` 恢复；没有数据库迁移或外部业务副作用。根 draft 不回滚，需要时按 [发布 SOP](../../docs/runbooks/design-publication.md) 从 Git 源重新生成到 `data/publication-drafts/`。
