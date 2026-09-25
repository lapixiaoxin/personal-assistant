# @lumi/contracts

`@lumi/contracts` 是 lumi 进程内公共领域协议的唯一包。消费者只从包根导入，不引用 `src/` 子路径。

## 领域文件

| 文件 | 责任 |
| --- | --- |
| `src/common.ts` | JSON、Principal、通用校验器与 ID |
| `src/task.ts` | Task、Capability、Event、Audit、Approval |
| `src/action.ts` | Action、Authorization、Receipt、Verification |
| `src/recovery.ts` | 重启恢复记录与查询 |
| `src/reminder.ts` | Reminder 与本地 Notification |
| `src/index.ts` | 稳定的根导出面 |

这里不能引入数据库、DSH SDK、HTTP 或具体 provider。Schema 是运行时边界，TypeScript 类型由对应 Schema 推导；新增或改义字段时按协议兼容规则和对应 spec 更新测试。

验证：

```bash
pnpm exec vitest run packages/contracts/tests/index.test.ts
pnpm typecheck
```
