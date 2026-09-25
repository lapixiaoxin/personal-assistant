# SPEC-0001 验收证据

状态：passed / locally verified。2026-09-25，macOS、Node 22.19.0、pnpm 10.20.0、DSH 0.1.7-rc.1。验证只产生专用目录内的本地文件；未调用真实模型或外部服务。

| 证据 | 关联验收 | 实际观察 | 状态 |
| --- | --- | --- | --- |
| E-01 身份、契约与迁移 | AC-001、009 | Bearer 缺失 401、伪造 actor 403；v1 API 与 DSH contract 通过；v1 SQLite 保留任务迁移到 v2，迁移前备份仍为 v1 且数据可读 | passed |
| E-02 摘要、授权与并发 | AC-002、003、004 | 审阅摘要与执行快照一致；正文/目标/version 篡改、过期/撤销拒绝；重复审批复用同一授权，并发执行仅消费一次额度 | passed |
| E-03 provider 与核验 | AC-005、007 | 路径穿越 Schema 拒绝；根/目标符号链接和既有目标拒绝；provider 伪报成功但读回缺失时 Verification failed、Task failed | passed |
| E-04 故障与取消 | AC-006、008 | 注入文件写后/receipt 前故障，重开 SQLite 后 reconcile 找回一份文件和 recovered receipt；取消前阻断，执行中/成功后报告剩余影响 | passed |
| E-05 真实本地 I/O | AC-010 | 三个独立 CLI 进程完成准备、授权、执行；独立 `shasum` 与 input/receipt/verification 摘要一致；重启读取成功并清理专用目录 | passed |

## 自动检查

命令：

```bash
pnpm check
```

结果：退出码 0；lint、typecheck、DSH 精确版本检查、14 个测试文件/59 个测试和 server/workbench build 全部通过。DSH contract 的 2 项使用真实 SDK 子进程和本地 mock 模型，不是云模型 live 验收。

重点测试：

- `packages/action-runtime/tests/index.test.ts`：8 项，覆盖语义幂等、参数篡改、过期/撤销、并发执行、重启对账、伪成功和取消时序。
- `packages/task-ledger/tests/index.test.ts`：4 项，覆盖 v1→v2 迁移、迁移前备份回读及一次性授权消费。
- `adapters/local-artifact/tests/index.test.ts`：3 项，覆盖真实文件、既有目标和符号链接。
- `apps/gateway/tests/server.test.ts`：6 项，覆盖 v1 兼容、身份失败和完整 v2 HTTP 动作闭环。

Workbench 在认证改动后重新执行：

```bash
PLAYWRIGHT_BROWSERS_PATH=./data/playwright-browsers pnpm test:e2e
```

桌面 Chrome 与移动 Chromium 2/2 通过，无布局溢出或浏览器控制台错误。

## 真实 I/O

专用路径：`data/action-acceptance-20260925/`。正文为测试字符串，不含个人数据。三个独立 CLI 进程依次执行 `action prepare`、`action authorize`、`action execute`，随后第四个进程 `action get`。

关键结果：

- action：`action_f7dc9187-fec5-4377-af9d-d44dbd92ddf2`
- action digest：`sha256:a354b3a6586417811057a6bda54265b32a2d858e76d507dfc04ab1190005142e`
- content digest：`sha256:3d8bd76b3cb85ad2a80e9cb909f22f67b8d37dfa9e60d879c20bc15295747170`
- authorization：`remainingUses=0 / consumed`
- receipt：`succeeded / recovered=false`
- verification：`passed`，expected 与 observed digest 相同
- task：`completed`
- 文件数：1；独立 `shasum -a 256` 为 `3d8bd76...95747170`
- SQLite 占用：128 KiB；产物磁盘块占用：4 KiB

另在 `127.0.0.1:4313` 执行实际 HTTP：未认证查询为 401，匹配 token 查询为 200，伪造 actor 提交为 403；v2 prepare/authorize/execute 为 202/200/200。Fastify 观察的单次处理时间约为 5.1/2.2/14.8 ms，仅作为本机基线，不是 SLA。

验收后精确删除 `data/action-acceptance-20260925/` 与 `data/http-acceptance-20260925/`，再次检查两路径均不存在。

## 边界

- v2 只允许内置 `local-artifact/1`；DSH Shell、网络、MCP 和外部 connector 未接入参数级门禁。
- Gateway 是单 owner 本地 Bearer 模型，仍不应暴露公网。
- 回滚使用迁移前一致备份；旧二进制不能直接打开 v2 数据库。已发生文件先对账，不随数据库回滚自动删除或重做。
