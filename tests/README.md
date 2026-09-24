# lumi 测试约定

生产源码与测试分开放置，同时保持测试归属清晰：

```text
packages/assistant-core/
  src/index.ts
  tests/index.test.ts
apps/gateway/
  src/server.ts
  tests/server.test.ts
adapters/dsh/
  src/index.ts
  tests/index.test.ts
tests/
  contract/dsh-runtime.test.ts
```

- 模块单测、只针对该模块的组合测试放 `<module>/tests/`，通过 `../src/` 导入被测代码。未来源码增加子目录时，测试可对应镜像目录结构。
- 跨模块、外部运行时协议测试放根 `tests/contract/`；出现真实需求后再增加 `integration/`、`scenario/` 等目录，不预建空目录。
- 不在 `src/` 放测试，也不通过包的生产 `exports` 暴露测试。复用 fixture/helper 时放在所属测试目录，确有多个调用方再提取共享工具。
- Vitest 从模块 `tests/` 和根 `tests/` 发现 `*.test.ts`；TypeScript 同时检查源码与测试，构建入口仅为 CLI/Gateway。

在仓库根目录执行：

```bash
pnpm test
pnpm exec vitest run packages/assistant-core/tests/index.test.ts
pnpm test:dsh
pnpm check
```

需要 Node >=22.19.0、pnpm 10.20.0。DSH 契约测试启动真实 SDK 子进程，模型端点为本地 mock，不能视为云模型或真实外部业务验收。未来 live 用例遵循 [真实验收规程](../docs/runbooks/live-acceptance.md)，不默认加入离线测试集。

目录迁移及验证记录：[SPEC-0002](../specs/0002-lumi-workspace/spec.md)。
