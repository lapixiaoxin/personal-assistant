# 结构化会议准备简报

状态：verified_once。版本：SPEC-0008 v0.1、DSH `0.1.7-rc.1`、Node 22.19.0、pnpm 10.20.0。首次验证：2026-09-25，本机 macOS、MiniMax 中国区。

## 适用范围

本 SOP 用于把用户显式提供的会议主题、目标、参与者、议程和背景交给 `meeting-agent`，生成并验证固定六段会议准备简报。它不读取日历、通讯录、网页或文档，不邀请参与者、不创建日程、不发送材料，也不写会后纪要。

会议内容会保存到 Task Ledger 并发送给模型。不要输入凭据、真实高敏个人资料或不应进入模型上下文的内部原文。

## 前置

- Node.js `>=22.19.0`，pnpm `10.20.0`。
- 已执行 `pnpm install`。
- 离线验证显式设置 `PA_EXECUTOR=mock`。
- 真实验证配置受支持的 DSH provider 和凭据；Gateway 继续只监听 loopback。
- CLI 命令使用 `pnpm cli meeting ...`。不要在 `cli` 与子命令之间加入 `--`，否则 Commander 不再解析后续选项。

## CLI

离线结构与账本验证：

```bash
PA_EXECUTOR=mock PA_DATA_DIR=./data/meeting-smoke \
  pnpm cli meeting "季度路线评审" \
  --objective "确定下一季度三项优先级" \
  --participant "产品负责人" \
  --participant "研发负责人" \
  --agenda "回顾目标" \
  --agenda "比较候选项" \
  --agenda "确认责任人" \
  --background "交付日期保持不变" \
  --id task-meeting-smoke
```

预期：

- `channel` 为 `meeting-brief`，`capabilityId` 为 `meeting-agent`。
- `contextRefs` 只含 `lumi-workflow:meeting-brief/v1`。
- 结果有版本化首尾 marker 和六个固定标题。
- Task 为 `completed`，事件含 `verification.completed` 且 `status=passed`。

查询验证事实：

```bash
PA_EXECUTOR=mock PA_DATA_DIR=./data/meeting-smoke \
  pnpm cli events task-meeting-smoke
PA_EXECUTOR=mock PA_DATA_DIR=./data/meeting-smoke \
  pnpm cli audit task-meeting-smoke
```

真实 DSH 只需移除 `PA_EXECUTOR=mock`，并使用已配置 provider。只用虚构样本验收，不能把模型生成质量或结构通过等同于会议事实正确。

## HTTP

```bash
curl -sS http://127.0.0.1:4310/v2/workflows/meeting-brief \
  -H "authorization: Bearer $PA_HTTP_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "schemaVersion": "lumi.meeting-brief/v1",
    "topic": "季度路线评审",
    "objective": "确定下一季度三项优先级",
    "participants": ["产品负责人", "研发负责人"],
    "agenda": ["回顾目标", "比较候选项", "确认责任人"],
    "background": "交付日期保持不变"
  }'
```

Workbench 同源入口的“会议准备”模式收集相同字段。服务端返回的 protocol marker 不显示在页面中；通过验证的六段正文显示为会议目标、参与者关注点、议程、决策与问题、风险与准备、跟进事项。

## 失败分支

- HTTP 400 / CLI schema error：检查 topic、objective、participants、agenda 是否非空；参与者规范化后不得重复；数量与长度见 SPEC-0008。
- Task failed 且提示 marker/section：模型结果未满足固定协议。保留失败证据，不手工把 Task 改成 completed；可在同一输入下新建 Task 重试。
- `plugin did not become ready`：protected plugin 未完成握手。检查 profile 路径与 DSH 版本，不绕过 ready gate。
- 模型请求出现 `lumi_artifact_prepare`、`lumi_action_execute` 或 `lumi_public_web_fetch`：停止使用该 profile并检查 runtime capability 集合；meeting Run 不应注册这些工具。
- provider 不可用或超时：Task 失败可重试，但不要改 verifier 或放宽结构要求来制造成功。

## 停止、清理和回滚

- 运行中通过现有 Task cancel 终止；adapter 会关闭对应 DSH 子进程和 per-Run bridge。
- 验收数据只放在独立 `PA_DATA_DIR`，取证后按该目录精确删除；不要删除默认 `data/assistant.db`。
- 回滚移除 `packages/meeting-workflow`、`profiles/dsh-meeting`、meeting capability/入口和 runtime decorator。SQLite schema没有变化，无数据迁移。
- 回滚后已有 meeting Task 仍是历史账本记录；旧二进制不能再次执行该 capability，但不应删除或改写记录。

## 首次证据

2026-09-25 本机完整门禁为 20 个测试文件、139 个用例，其中 10 个真实 DSH SDK 子进程；桌面/移动 Playwright 8 个场景通过。真实 MiniMax 虚构路线评审约 8.2 秒完成，六段中文结果通过 `meeting-brief-structure/1`，事件无工具调用。详见 [SPEC-0008 evidence](../../specs/0008-meeting-brief/evidence.md)。
