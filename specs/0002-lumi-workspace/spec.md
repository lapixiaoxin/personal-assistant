# SPEC-0002 · lumi 命名与工程目录整理

2026-09-24 · 状态：Implemented / Verified（本机 verified_once）。低风险工程整理，规格、计划与验收记录合并维护。

## 目标与范围

用户将超级个人智能体命名为 `lumi`，取意于与“光”有关的词根，短、具有未来感。本次统一产品名称，减少依赖目录的视觉干扰，并分离生产源码与测试。SPEC-0001 的功能开发暂缓。

| 要求 | 实施与影响 |
| --- | --- |
| FR-001 名称统一 | 根包名、CLI 和产品说明使用 `lumi`；内部包采用 `@lumi/*`；DSH 协调者配置迁至 `profiles/dsh-lumi/`。 |
| FR-002 依赖目录精简 | 保留 pnpm 默认隔离布局；子模块 `node_modules` 主要为符号链接，不是每包重复安装一套依赖。编辑器默认隐藏生成目录。 |
| FR-003 测试与源码分开 | 模块测试放 `<module>/tests/`，与 `src/` 同级；跨模块 DSH 契约测试放根 `tests/contract/`；更新发现规则和命令。 |
| FR-004 兼容与可接手 | 保留现有 23 个测试的验证语义、依赖版本、环境变量、数据路径、持久化标识和公开协议；同步事实与目录约定。 |

保留 `PA_*` 环境变量、`data/assistant.db`、`personal-assistant` capability ID、`pa-` DSH 会话前缀，避免已有配置和数据失联。模块文件夹继续按职责命名，例如 `assistant-core`、`personal-memory`；它们不是旧产品品牌。当前磁盘根路径暂不搬迁，使用 `lumi.code-workspace` 显示工作区名称，避免正在使用的 IDE 与工具路径失效。

## 执行计划

1. 更新命名、包依赖引用、profile 路径及工作区配置；重新安装以刷新工作区链接，不升级第三方版本。
2. 逐模块迁移和验证已有测试，保留原断言；明确根测试目录职责。
3. 同步 README、Agent 指南、事实文档、设计源及操作说明；记录飞书投影版本。
4. 运行完整检查与独立数据库的 mock CLI，核验差异后提交本地 main。

## 验收

- AC-001：CLI help 显示 lumi；内部不再引用旧包作用域；DSH SDK 能加载更名后的配置。
- AC-002：保留 pnpm 隔离链接；无依赖版本升级；编辑器配置隐藏 `node_modules` 等生成目录。
- AC-003：`src/` 无测试文件；完整发现 9 个测试文件、23 个用例，测试断言含义保持一致。
- AC-004：`pnpm check`、文档链接检查、mock CLI 提交/审批/跨进程查询全部通过，现有兼容标识保留。

## 迁移与回滚

拉取本次修改后运行 `pnpm install` 以刷新包名链接；自定义引用旧 profile 路径的脚本改为 `profiles/dsh-lumi/cordis.patch.yml`。用编辑器打开 `lumi.code-workspace`，或继续打开原目录。无需数据库迁移。回滚本次提交后重新 `pnpm install` 即可恢复包链接与旧配置路径；运行数据不受影响。

## 验证记录

基线为 `e422f5f`；macOS、Node 22.19.0、pnpm 10.20.0、Vitest 3.2.4。2026-09-24 23:31–23:36 完成以下验证。40 个源码、测试、manifest、构建/测试配置、profile 与锁文件按路径排序，以 `路径 + NUL + 内容 + NUL` 合并后的 SHA-256：`e617655a3fa32a45ec6f7a6f3c2f3e5c37ccdac6c3fdd60eb91834a29ed493c7`。

### 范围与缺陷分析

迁移 8 个模块的 21 个现有用例与根 DSH 契约的 2 个用例，新增用例 0。分析聚焦导入路径、profile 路径与根目录定位，未发现本次整理引入的功能缺陷；SPEC-0001 的既有问题保持原状态。

### 逐文件迁移与验证

每个模块遵循迁移 → 单文件执行 → 复核断言 → 结束，再处理下一模块。前八行命令为 `pnpm exec vitest run <测试路径>`，契约测试使用 `pnpm test:dsh`；外层分别为 120/300 秒超时。全部首轮 `all-pass`、退出码 0，无失败处置或测试修复。

| 测试路径 | 原有用例数 | 保留的验证 |
| --- | --- | --- |
| `adapters/dsh/tests/index.test.ts` | 3 | SDK 事件映射、取消、错误 |
| `apps/gateway/tests/server.test.ts` | 3 | HTTP 任务、审批、异常 |
| `apps/runtime/tests/index.test.ts` | 3 | 执行器装配与模型配置 |
| `packages/assistant-core/tests/index.test.ts` | 4 | 生命周期、审批、幂等、取消 |
| `packages/contracts/tests/index.test.ts` | 2 | 请求规范化与空内容拒绝 |
| `packages/personal-memory/tests/index.test.ts` | 1 | 候选、确认、撤回 |
| `packages/policy/tests/index.test.ts` | 3 | 风险分类 |
| `packages/task-ledger/tests/index.test.ts` | 2 | 跨连接持久化与状态限制 |
| `tests/contract/dsh-runtime.test.ts` | 2 | 真实 SDK 子进程 + mock 模型、MiniMax 初始化 |

前一个文件通过后才处理下一个文件。包名、相对路径、临时目录前缀与 persona 品牌文字规范化后，9 个文件与 `e422f5f` 的原文件逐字相等；没有增删测试或弱化断言。

### 工程验收

本机使用已有隔离工具目录 `data/tooling/npm-cache/_npx/ae6601dc49d75212/node_modules/.bin` 前置 PATH，执行：

```bash
perl -e 'alarm shift; exec @ARGV' 300 pnpm check
python3 scripts/check-docs.py
```

| 验收 | 证据与结果 |
| --- | --- |
| AC-001 | 构建后的 `node dist/cli/main.js --help` 显示 lumi；真实 SDK 通过 runtime 加载新 profile，本地 mock 请求中包含 `You are lumi, a personal agent coordinator`，任务 completed。 |
| AC-002 | 10 个模块合计 25 个有效依赖符号链接；新旧 lockfile 仅 `@personal-assistant/` → `@lumi/`；工作区 JSON 的名称与隐藏配置已核对。 |
| AC-003 | `src/` 无测试文件；完整发现 9 文件、23 用例并通过；逐文件等价检查通过。 |
| AC-004 | `pnpm check` 退出码 0：lint、typecheck、DSH 版本、测试、构建通过。构建后 CLI 使用专用数据库，三个独立进程 submit → approve → get，观察 waiting_approval → completed → completed/approved，结果保留 `[mock:personal-assistant]`。文档检查退出码 0：34 个 Markdown、106 个本地链接、SPEC-0001 追溯检查通过。 |

CLI 具体参数为 `--db <演练目录>/assistant.db submit 发送一份演练摘要 --id lumi-layout-approval`、`approve lumi-layout-approval`、`get lumi-layout-approval`；每次显式 `PA_EXECUTOR=mock`。本机脱敏结果在已忽略的 `data/lumi-reorg/cli-6qcguzpx/`、`profile-smoke.json`、`code-digest.json`。

### 环境处置与边界

依赖刷新首次因原 store 与默认 store 不一致触发无 TTY 的重装确认，并遇到工作区外 pnpm 临时目录写入限制。使用原 `.pnpm-store`、禁用工具自安装后，刷新成功，未新增或升级依赖；成功命令沉淀于 [SOP](../../docs/runbooks/workspace-layout.md)。

测试技能 Step1–Step5 已执行；Step6 的 `utree flush` 已尝试，退出码 127：本机缺少 `~/.local/bin/utree`。准备脚本的工具安装在后台运行，其返回成功不能证明该二进制存在。本记录替代自动汇总输出，不将该步骤声称为成功。

编辑器禁止修改 `.vscode/settings.json`，采用 `lumi.code-workspace` 保存配置；未自动操作编辑器 UI。未执行真实云模型/外部业务验收，未推送或部署。飞书旧审阅投影与这次本地文档的差异已标于 [发布清单](../../docs/publication.md)。
