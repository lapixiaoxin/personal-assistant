# SPEC-0013 实现计划

状态：Ready · 对应 spec v0.1。

## 边界

- `packages/action-runtime` 拥有动作执行所需 provider port，不依赖具体 adapter。
- `adapters/local-artifact` 实现 port；`apps/runtime` 负责装配两者。
- 架构 checker 只读取 workspace manifest、源码路径和根目录，不加载业务模块或运行数据库。
- `data/README.md` 是说明文件；`data/*` 其他内容保持忽略和本地所有。

## 依赖调整

```text
before: action-runtime -> local-artifact
after:  local-artifact -> action-runtime <- runtime
                                ^
                                `-- action-runtime tests (dev adapter)
```

`ArtifactProvider` 三个类型从 adapter 移到 action-runtime。adapter 从自身根继续 type re-export，兼容现有消费者；runtime 改从端口拥有者导入类型。`ArtifactBoundaryError` 留在 adapter，ActionService 通过受限 `code` 结构映射 provider 错误，不引用具体错误类。

## 架构门禁

`scripts/check-architecture.mjs`：

1. 发现 `apps/*`、`packages/*`、`adapters/*`、`plugins/*` 的 package manifest。
2. 建立仅含 production dependencies 的内部图并检查环。
3. 禁止 packages 依赖 adapters/apps/plugins，禁止 adapters 依赖 apps/plugins。
4. 扫描 `src/**/*.{js,ts,tsx,mjs}` 的静态和动态 import，检查内部依赖已在 production dependencies 声明。
5. 拒绝跨 package 相对 import、`src` 内 `*.test.*`/`*.spec.*` 与根 `draft_*_folder`。
6. 每次运行先对关键失败规则执行内置负向 self-test，再检查真实仓库。

## 数据与兼容

不修改数据库。根 `.gitignore` 使用 `data/*` 加 `!data/README.md`，使说明文件可跟踪，其他现有目录继续被忽略。历史 draft 删除前确认无 Git 跟踪、无唯一源、无运行进程依赖。

## 验证与回滚

- 聚焦：`pnpm check:architecture`、checker self-test、action-runtime/local-artifact/runtime tests。
- 完整：`pnpm check`、`python3 scripts/check-docs.py`。
- 状态：根 draft 为零；用户 SVG 仍未暂存；4310/4313 PID 不变。

回滚依赖调整时同时恢复两个 package manifest、provider 类型位置和 lockfile。根 draft 不回滚；需要时按 publication SOP 从 Git 源重新生成到 `data/publication-drafts/`。
