# lumi · Agent 入口

lumi 是单 owner、可自己部署的超级管家。先读事实，再读方案；文档存在不等于能力已启用。

## 接手

1. 阅读 [README](README.md)、[工程事实](docs/current-state.md)和[文档索引](docs/README.md)。
2. 检查 `git status --short --branch`、当前服务和相关源码；保护用户改动及 `data/server`。
3. 阅读当前 [SPEC-0016](specs/0016-dsh-server-feishu.md) 与任务对应 spec。
4. 边界变化先更新[架构](docs/design/02-architecture.md)、[协议](docs/design/03-protocols.md)和[安全](docs/design/05-safety.md)。

规范默认使用一个 `specs/<id>-<topic>.md`，写清范围、验收、证据与回滚。只有复杂并行工作才拆 plan/tasks/checklist/evidence，避免制造过程文件。

## 当前事实

2026-10-14：主线只有 DSH 常驻 SDK Host、飞书通道、持久收件箱和可选个人上下文。真实 Bot 已观察到 7 条成功回复、无未决回执，状态为 `verified_once`。DSH 固定 `0.2.0-rc.2`。

旧 Gateway、CLI、Workbench、Task/Action/Reminder/Research/Meeting MVP 已从当前工作树退役；历史在 Git，旧数据只归档不迁入新服务。当前不接具体外部 Agent、设备、App、自动记忆、周期推送或业务动作。

## 不变量

- DSH 拥有通用推理、规划、Session、工具和 Agent 调度；lumi 不再实现第二套 Harness。
- 个人身份、记忆、目标、授权和证据不属于模型、DSH Session 或某个入口。
- Surface 只负责认证输入和展示，不复制业务授权。
- 外部 SDK 留在所属 channel/plugin；Host 不直接依赖平台 SDK，`plugins/*/src/domain` 不依赖 DSH 或平台 SDK。
- 插件可替换但不能绕过授权、审计、验收和发布控制。
- 模型输出、HTTP 200 或执行者自报不能替代结果证据。
- 未知副作用先对账；重试不得扩大授权或重复发送。
- 凭据、私人正文、数据库、缓存和构建产物不进入 Git。
- 未验证功能明确标记；不能删测试或改报告制造完成。

## 工程约定

Node `>=22.19.0`，pnpm `10.20.0`。完整门禁：

```bash
pnpm check
pnpm test:dsh:bundle
python3 scripts/check-docs.py
```

生产代码在 `<module>/src/`，模块测试在同级 `tests/`，跨模块契约在根 `tests/`。内部包使用 `@lumi/*`。保留 pnpm workspace 链接，不提交 `dist`、`node_modules` 或 `data/*`。

运行数据规则见 [data/README](data/README.md)。真实服务操作见[飞书 SOP](docs/runbooks/server-feishu.md)，mock/离线结果不得写成 live。

## Git 授权

用户已授权 Agent 在验证后直接提交当前仓库 `main` 并普通推送 `origin/main`：

- 只暂存本任务文件，保护用户未提交改动。
- 提交前检查差异、凭据、数据库和生成物。
- 推送前 fetch 并确认无未整合远端提交。
- 禁止 force push、改写共享历史、删除远端引用。
- Git push 不等于部署或正式发布。

复杂任务可用临时分支/worktree；合并后仅在 clean、已被 main 包含且无必要运行数据时清理。详见[版本管理 SOP](docs/runbooks/version-control.md)。

## 交付

报告改动、证据、未验证项、迁移/回滚和 commit。一次成功只标 `verified_once`。后续进化机制不得自行修改本文件中的控制原则、受保护验收或授权根。
