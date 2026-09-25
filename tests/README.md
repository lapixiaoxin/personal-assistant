# lumi 测试约定

生产源码与测试分开放置，同时保持测试归属清晰：

```text
packages/assistant-core/
  src/index.ts
  tests/index.test.ts
packages/task-recovery/
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
  integration/task-recovery-cli.test.ts
  fixtures/blocking-runtime.ts
  e2e/workbench.spec.ts
```

- 模块单测、只针对该模块的组合测试放 `<module>/tests/`，通过 `../src/` 导入被测代码。未来源码增加子目录时，测试可对应镜像目录结构。
- 跨模块、外部运行时协议测试放根 `tests/contract/`；出现真实需求后再增加 `integration/`、`scenario/` 等目录，不预建空目录。
- 需要跨独立进程证明持久化入口一致性的用例放 `tests/integration/`；personal-memory CLI 串联多个进程，task-recovery 还会在 running 后 `SIGKILL` 隔离 runtime，证明 stale PID 判定。
- 不在 `src/` 放测试，也不通过包的生产 `exports` 暴露测试。复用 fixture/helper 时放在所属测试目录，确有多个调用方再提取共享工具。
- Vitest 从模块 `tests/` 和根 `tests/` 发现 `*.test.ts` / `*.test.tsx`；TypeScript 同时检查源码与测试。服务端由 tsup 构建，Workbench 由 Vite 构建到 `dist/workbench`。
- 浏览器 E2E 放在根 `tests/e2e/*.spec.ts`，由 Playwright 单独执行，不进入默认 Vitest 文件匹配。浏览器二进制和截图放在忽略的 `data/` 下。

在仓库根目录执行：

```bash
pnpm test
pnpm exec vitest run packages/assistant-core/tests/index.test.ts
pnpm test:dsh
PLAYWRIGHT_BROWSERS_PATH=./data/playwright-browsers pnpm test:e2e
pnpm check
```

需要 Node >=22.19.0、pnpm 10.20.0。DSH 契约测试启动真实 SDK 子进程，模型端点为本地 mock，不能视为云模型或真实外部业务验收。未来 live 用例遵循 [真实验收规程](../docs/runbooks/live-acceptance.md)，不默认加入离线测试集。

目录迁移及验证记录：[SPEC-0002](../specs/0002-lumi-workspace/spec.md)。
