# lumi 测试约定

生产源码与测试分开放置，同时保持测试归属清晰：

这里采用“模块测试就近、系统测试集中”，不是把所有测试统一堆到根目录。模块内 `tests/` 能让一个包的实现、测试、依赖和删除生命周期保持一致；根 `tests/` 则只承载需要同时装配多个包、独立进程或浏览器的场景。若全部集中到根目录，模块边界会被大量跨路径 import 淹没，单包责任也更难判断。

```text
packages/assistant-core/
  src/index.ts
  tests/index.test.ts
packages/task-recovery/
  src/index.ts
  tests/index.test.ts
packages/reminders/
  src/index.ts
  tests/index.test.ts
apps/gateway/
  src/server.ts
  tests/server.test.ts
apps/workbench/
  src/App.tsx
  tests/App.test.tsx
adapters/dsh/
  src/index.ts
  tests/index.test.ts
tests/
  contract/dsh-runtime.test.ts
  integration/personal-memory-cli.test.ts
  integration/reminder-cli.test.ts
  integration/task-recovery-cli.test.ts
  fixtures/blocking-runtime.ts
  e2e/workbench.spec.ts
```

- 模块单测、只针对该模块的组合测试放 `<module>/tests/`，通过 `../src/` 导入被测代码。未来源码增加子目录时，测试可对应镜像目录结构。
- 跨模块、外部运行时协议测试放根 `tests/contract/`；出现真实需求后再增加 `integration/`、`scenario/` 等目录，不预建空目录。
- 需要跨独立进程证明持久化入口一致性的用例放 `tests/integration/`；personal-memory CLI 串联多个进程，task-recovery 会在 running 后 `SIGKILL` 隔离 runtime，reminder CLI 验证 latest/skip 启动误点与去重。
- 不在 `src/` 放测试，也不通过包的生产 `exports` 暴露测试。复用 fixture/helper 时放在所属测试目录，确有多个调用方再提取共享工具。
- `pnpm check:architecture` 会拒绝 `src/` 中的测试文件、跨 package 相对 import、未声明的内部生产依赖和反向层级依赖。
- Vitest 从模块 `tests/` 和根 `tests/` 发现 `*.test.ts` / `*.test.tsx`；TypeScript 同时检查源码与测试。服务端由 tsup 构建，Workbench 由 Vite 构建到 `dist/workbench`。
- 浏览器 E2E 放在根 `tests/e2e/*.spec.ts`，由 Playwright 单独执行，不进入默认 Vitest 文件匹配。浏览器二进制和截图放在忽略的 `data/` 下。

在仓库根目录执行：

```bash
pnpm test
pnpm check:architecture
pnpm exec vitest run packages/assistant-core/tests/index.test.ts
pnpm test:dsh
PLAYWRIGHT_BROWSERS_PATH=./data/playwright-browsers pnpm test:e2e
pnpm check
```

需要 Node >=22.19.0、pnpm 10.20.0。DSH 契约测试启动真实 SDK 子进程，模型端点为本地 mock，不能视为云模型或真实外部业务验收。未来 live 用例遵循 [真实验收规程](../docs/runbooks/live-acceptance.md)，不默认加入离线测试集。

目录迁移及验证记录：[SPEC-0002](../specs/0002-lumi-workspace/spec.md)。
