# SPEC-0013: 仓库架构精简与边界门禁

状态：Specified · v0.1 · 2026-09-25。

负责人：lumi Agent。关联 Goal：降低长期维护成本，避免目录与依赖边界随迭代退化。依据：[ADR-004](../../docs/adr/0004-host-ownership-and-module-boundaries.md)。

授权来源与范围：用户要求 Agent 从头检阅架构、整理根目录 draft 和优化工程规范，并明确无需中途询问。本切片可删除已确认可再生的忽略草稿、调整包内端口所有权、增加静态架构门禁、修正文档并在验证后提交/推送 `origin/main`；不得覆盖三份用户 SVG，不得删除运行数据库、凭据、浏览器/工具缓存或正在使用的数据目录。

## 问题和目标

当前模块单测位于各模块 `tests/`，跨模块测试位于根 `tests/`。这是按所有权分层的合理结构，不应为了“统一”把全部测试搬到根目录。真正的问题有三项：

1. 根目录残留 12 个 `draft_*_folder`，内容是已发布设计文档的临时 XML/预览副本，且被 `.gitignore` 静默隐藏。
2. `packages/action-runtime` 依赖具体 `adapters/local-artifact` 才能取得 provider 类型和错误，违反“应用服务拥有端口、adapter 实现端口”的方向。
3. 依赖方向主要靠文档约定，`pnpm check` 尚不能阻止 package→adapter、生产依赖环、跨包相对导入或测试回流 `src/`。

成功后，仓库根只保留源码、配置和导航；`data/` 的用途与清理规则可见；Action provider 依赖方向正确；架构边界成为本地与 CI 的自动门禁。

## 范围

- 删除根目录 12 个已忽略、可由 Git 文档源重新生成的 `draft_*_folder`。
- 将 `.gitignore` 的 `data/` 改为保留 `data/README.md`、继续忽略其他数据，并不再静默忽略根目录 draft。
- 新增 `data/README.md`，区分权威运行数据、可再生缓存、隔离验证数据和发布草稿。
- 将 `ArtifactProvider`、`ArtifactObservation`、`ArtifactWriteResult` 端口移入 `packages/action-runtime`；`adapters/local-artifact` 实现并兼容 re-export。
- 移除 `action-runtime` 对 `local-artifact` 的生产依赖；由 adapter 依赖端口包，测试依赖单独声明。
- 新增 `scripts/check-architecture.mjs` 和 `pnpm check:architecture`，纳入完整 `pnpm check`。
- 修正 README 当前状态，并补充测试布局的判定规则和发布草稿路径。

## 非目标

- 不合并现有业务包，不建立新的微服务，不移动模块测试到根目录。
- 不继续拆分 Task Ledger、Gateway、CLI、Personal Memory 或 Workbench 大文件；这些需要独立行为切片或真实复用压力。
- 不删除 `data/mvp-local`、`data/dev`、默认数据库、DSH home、凭据、Playwright 浏览器、Node/pnpm 工具缓存或历史本机证据目录。
- 不修改 Action Schema、HTTP/CLI、SQLite 数据、授权、执行或核验语义。
- 不执行 force push、release、部署或飞书发布。

## 需求

| ID | 行为 |
| --- | --- |
| FR-001 | 根目录历史 draft 清理后不得保留 `draft_*_folder`；未来草稿进入 `data/publication-drafts/` 并在验证后按范围清理。 |
| FR-002 | `data/README.md` 必须是 `data/` 中唯一默认纳入 Git 的文件，并明确禁止误删运行数据和凭据。 |
| FR-003 | `ActionService` 依赖自身拥有的 `ArtifactProvider` 端口，不导入 `@lumi/local-artifact`。 |
| FR-004 | `LocalArtifactProvider` 实现 `@lumi/action-runtime` 端口，并继续兼容导出三个既有 provider 类型。 |
| FR-005 | 架构检查必须拒绝生产依赖环、packages→adapters/apps/plugins、adapters→apps/plugins、源码未声明的 `@lumi/*` 依赖和跨 package 相对导入。 |
| FR-006 | 架构检查必须拒绝模块 `src/` 中的测试文件和根目录 `draft_*_folder`，并输出被检查 package/source 数。 |
| FR-007 | 模块测试继续放 `<module>/tests`；只有 contract/integration/e2e/跨模块 fixture 放根 `tests/`。 |

| ID | 质量约束 |
| --- | --- |
| NFR-001 | 现有根包 import 和 LocalArtifactProvider 行为兼容；不修改测试断言以掩盖回归。 |
| NFR-002 | `pnpm check` 在 Node 22.19.0 / pnpm 10.20.0 下执行新门禁并全量通过。 |
| NFR-003 | 文档检查通过；历史 evidence 保持原始时点语义，新文档记录后续清理。 |
| NFR-004 | Git 暂存与推送排除用户 SVG、运行数据、凭据、缓存和构建产物。 |

## 验收

| AC | Given / When / Then |
| --- | --- |
| AC-001 | Given 12 个根 draft 均为忽略的发布临时产物，When清理，Then根目录无 draft，正式 `docs/` 与历史发布回执不变。 |
| AC-002 | Given开发者打开 `data/`，When读取 README，Then能区分哪些目录不可删、哪些可再生、验证目录如何精确清理。 |
| AC-003 | Given Action provider 注入，When typecheck/build/test，Then ActionService 不再生产依赖 adapter，现有写入/对账测试保持通过。 |
| AC-004 | Given当前 workspace，When执行架构检查，Then生产依赖图无环、边界和声明检查通过。 |
| AC-005 | Given人为构造的 cycle、反向依赖、未声明依赖、跨包相对导入、src 测试或根 draft，When运行 checker 核心规则，Then对应规则会失败。 |
| AC-006 | Given完整仓库，When执行 `pnpm check` 与 docs checker，Then全部通过且测试/构建数量有记录。 |
| AC-007 | Given用户 SVG 和运行中 4310/4313 服务，When提交并推送，Then SVG 仍未提交，服务与数据未被停止或删除。 |

## 约束、风险和未知

- adapter 对 action-runtime 的类型依赖是预期的依赖倒置；不得通过 runtime import 形成执行期循环。
- `action-runtime` 测试仍使用 local adapter，因此它是 devDependency，不计入生产依赖图。
- 根 draft 已有远端文档、Git Markdown 源和 `data/` 发布回执；删除后不保留恢复承诺，需要时由源重新生成。
- 架构 checker 使用静态 import/manifest 规则，不替代 TypeScript、运行测试或安全审计。
