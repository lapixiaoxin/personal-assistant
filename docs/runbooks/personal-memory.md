# 可控个人记忆

状态：verified_once · 2026-09-25。适用版本：SPEC-0009 v0.1，本机 macOS arm64、Node 22.19.0、pnpm 10.20.0、DSH `0.1.7-rc.1`。

已证明范围：单 owner 本地 SQLite 上的显式创建、候选确认、纠正、撤回、彻底遗忘、Gateway/CLI/Workbench 控制，以及一次 `minimax-cn / MiniMax-M3` 非敏感上下文使用。未证明自动抽取、语义召回、字段级加密、跨设备同步或任意模型质量。

## 前置

- 在仓库根目录使用 Node >=22.19.0、pnpm 10.20.0。
- Gateway 使用 `PA_HTTP_TOKEN`，只监听 loopback。
- 默认 owner/principal 为 `local-owner/local-user`；变更后既有 owner 的记忆不会跨 owner 显示。
- `personal` 记录会发送给当前模型 provider。不得出境的正文使用 `sensitive` 或 `secret`；二者不会自动注入。
- 记忆不是授权、凭据、系统指令或动作参数。需要外部副作用时仍走 Action/Authorization。

## CLI 生命周期

创建一条已确认、只用于日常助手的个人偏好：

```bash
pnpm cli memory add "偏好直接、明确的判定规则" \
  --kind preference \
  --scope global \
  --classification personal \
  --purpose general_assistance
```

需要先审阅的推断使用 `--candidate`。同一个 scope 可以重复 `--purpose` 扩大明确用途：

```bash
pnpm cli memory add "会议简报先列结论" \
  --candidate \
  --scope meeting \
  --purpose meeting
pnpm cli memory list --status candidate
pnpm cli memory confirm <memory-id>
```

纠正会保持 ID、覆盖旧正文、递增 revision，并将结果设为 confirmed：

```bash
pnpm cli memory correct <memory-id> "会议简报先列待决事项" \
  --scope meeting \
  --purpose meeting
```

停止检索但暂时保留正文：

```bash
pnpm cli memory retract <memory-id>
```

删除正文并建立最小 tombstone：

```bash
pnpm cli memory forget <memory-id>
```

预期观察：`forget` 返回 ID、owner、旧 revision、SHA-256 摘要和删除时间，不返回正文；后续 `get/confirm/correct` 返回 not found。

## Workbench

启动 Gateway 和页面后打开顶部“记忆”：

```bash
PA_EXECUTOR=mock pnpm dev
pnpm dev:web
```

页面提供状态筛选、正文、类型、scope、数据分级、允许用途和初始 candidate/confirmed。候选可确认；未撤回记录可纠正或撤回；彻底遗忘需要二次点击确认。页面只调用 `/v2/memories`，不读取 SQLite。

## 任务使用

执行任务前按 capability 映射用途：

- personal-assistant → `general_assistance`
- coding-agent → `coding`
- research-agent → `research`
- meeting-agent → `meeting`

只有 owner 相同、status=confirmed、classification 为 public/personal、allowed purpose 和 scope 均匹配的记录可用；最多 8 条、合计 6,000 字符。任务的当前明确输入优先。Task Ledger 中的原 content/contextRefs 不改变；事件只增加：

```json
{
  "type": "memory.context_attached",
  "payload": {
    "count": 1,
    "memories": [{"id": "memory-example", "revision": 1}],
    "purpose": "general_assistance"
  }
}
```

## 验收

完整门禁：

```bash
pnpm check
PLAYWRIGHT_BROWSERS_PATH=./data/playwright-browsers pnpm test:e2e
```

本次观察：21 个 Vitest 文件、155 个用例通过；10 个真实 DSH SDK contract 通过；桌面/移动共 10 个 Playwright 场景通过。独立 CLI 进程测试覆盖 add/list/confirm/correct/forget。

真实模型 smoke 使用隔离 database/DSH home 和虚构偏好。Task `task-memory-live-smoke` 在约 3.7 秒内返回 `LUMI_MEMORY_OK`；账本原 content 未包含记忆正文，`memory.context_attached` 只有 ID/revision/purpose。该结果只标 `verified_once`。

## 失败与恢复

- `MEMORY_NOT_FOUND`：ID 不存在、已遗忘或属于其他 owner；不要切换身份猜测。
- `MEMORY_CONFLICT`：状态或 revision 已变化；重新 list/get 后由用户决定。
- memory store 不可用：依赖个人记忆的任务在 executor 前失败，不静默宣称已应用偏好。
- candidate、retracted、sensitive、secret 被发现进入模型或事件正文时立即停止服务，保留隔离证据并按安全缺陷处理。

## 清理与回滚

普通遗忘使用 `memory forget`，不要手工编辑 SQLite。测试数据使用单独 `--db`、`PA_DATA_DIR` 和 `PA_DSH_HOME`；只删除本次创建的隔离目录，不删除真实 `data/assistant.db`。

代码回滚可移除 runtime decorator 和入口，旧版本会忽略 `personal_memories`、`personal_memory_tombstones`、`personal_memory_migrations`。如必须删表，先停服务并备份，再只删除这三张 personal-memory 所有表。

失效条件：memory schema、DSH prompt 结构、owner 认证、SQLite 实现、用途映射或模型 provider 发生变化时重新验证。
