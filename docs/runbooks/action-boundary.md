# 本地动作门禁、对账与回滚

状态：verified_once。2026-09-25，macOS、Node 22.19.0、pnpm 10.20.0、SQLite schema v2。适用于内置 `local-artifact/1` 的 Host 路径；DSH personal profile 的接线与旁路边界见 [DSH Action Bridge SOP](dsh-action-bridge.md)，真实外部服务仍不适用。

## 前置与边界

使用新的专用数据库和 artifact 根，不指向用户已有目录。Gateway 必须保持 loopback，并配置至少 32 字符的随机 `PA_HTTP_TOKEN`；token 不写入命令记录、日志或 Git。默认身份为 `local-owner/local-user`，可通过 `PA_OWNER_ID`、`PA_PRINCIPAL_ID` 修改。

动作只接受 artifact ID 和正文。provider 将其映射为专用根内的服务端文件名，拒绝绝对路径、`..`、符号链接和既有目标。`artifact.write` 之外的 operation、capability/version 均失败关闭。

## CLI 闭环

```bash
export PA_EXECUTOR=mock
export PA_ARTIFACT_ROOT=./data/action-check/artifacts

pnpm cli --db ./data/action-check/assistant.db \
  action prepare acceptance-note "verified content" --key acceptance-001
pnpm cli --db ./data/action-check/assistant.db action authorize <action-id>
pnpm cli --db ./data/action-check/assistant.db action execute <action-id>
pnpm cli --db ./data/action-check/assistant.db action get <action-id>
```

预期顺序：

1. `prepare` 返回 `prepared / waiting_approval`，显示目标、动作摘要、正文摘要和 capability 版本，不回显审计正文。
2. `authorize` 返回一次性授权，`remainingUses=1`、`status=active`。
3. `execute` 原子消费额度，独占创建文件，保存 receipt，再独立读回；通过时为 `succeeded / completed / verification.passed`。
4. 新 CLI 进程执行 `get` 仍读到同一 action、receipt 和 verification。
5. 使用 `shasum -a 256 <artifact-path>` 独立计算，必须等于 `inputDigest` 去掉 `sha256:` 后的值。

同一 `(owner, operation, idempotencyKey)` 与相同语义参数返回原动作；正文、目标、deadline 或 capability 改变时返回 `CONFLICT`。授权后数据库内容、目标或版本变化会在领取事务中重新计算摘要并拒绝。

## HTTP 与 Workbench

```bash
export PA_HTTP_TOKEN="$(openssl rand -hex 32)"
PA_EXECUTOR=mock pnpm start:legacy
```

除 `/health` 和静态资源外，请求带：

```text
Authorization: Bearer <PA_HTTP_TOKEN>
```

Workbench 使用 `http://127.0.0.1:4310/#token=<PA_HTTP_TOKEN>` 首次进入；fragment 随即从地址栏移除，token 只保存在当前 tab 的 `sessionStorage`。无 token 返回 401；请求体中的 `actorId` 与 principal 不同返回 403。

v2 顺序为：

```text
POST /v2/actions
POST /v2/actions/:id/authorize
POST /v2/actions/:id/execute
GET  /v2/actions/:id
```

## 不确定结果与取消

如果 provider 已返回成功但 receipt 未提交，`execute` 返回 `OUTCOME_UNKNOWN`、`safeToRetry=false`。不要再次执行，使用：

```bash
pnpm cli --db ./data/action-check/assistant.db action reconcile <action-id>
```

对账只读确定性目标。摘要匹配时补 recovered receipt 并核验；缺失或不匹配时失败，不自动重写。

`cancel` 在 `prepared/authorized` 阶段撤销授权并阻止文件创建；在 `executing/succeeded/outcome_unknown` 阶段只记录 `effectMayRemain=true`，不声称撤回已发生效果。

## 迁移与回滚

启动时读取 `PRAGMA user_version`。v1→v2 仅增加 `migration_history`、actions、action_inputs、authorizations、action_receipts 和 verifications；旧 tasks/events/approvals/audit 表与字段保留。高于 v2 的数据库拒绝启动。

回滚优先顺序：

1. 停止 Gateway，禁止新的 `/v2/actions`。
2. 保留 v2 数据库和 artifact 根只读，先对账 `executing/outcome_unknown`。
3. 旧程序只使用迁移前的一致备份；不要假定旧二进制可安全打开 v2 数据库。
4. 已创建文件不会因代码或数据库回滚自动消失。删除前核对 receipt、digest 和业务保留要求。

## 清理

仅删除本次明确创建的专用目录，并再次确认路径不存在。不要删除 `data/assistant.db`、DSH home 或其他任务数据。真实验收记录清理后无残留；测试产生的 `data/workbench-e2e` 和截图也属于忽略文件，可按对应 Workbench SOP 清理。
