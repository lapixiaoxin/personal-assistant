# 受控公开来源研究简报

状态：verified_once。验证日期：2026-09-25。适用版本：SPEC-0007 对应实现，DSH `0.1.7-rc.1`，Node `22.19.0`，pnpm `10.20.0`。

## 已证明的范围

- Workbench、Gateway 和 CLI 可提交问题及 1-8 个显式 HTTPS 来源。
- `research-agent` 的真实 DSH SDK 子进程只注册 `lumi_public_web_fetch`，Host 拒绝未声明 URL 和 Action route。
- Host 可读取公开 UTF-8 HTML，保存不可变 snapshot，并在最终结果引用全部 source ID 后完成 Task。
- 2026-09-25 使用真实 MiniMax 和 `https://example.com/` 完成一次只读样本；该结果不外推到搜索、登录态网页、JavaScript 渲染、任意站点可用性或事实正确性。

## 前置

- Node `>=22.19.0`、pnpm `10.20.0`，依赖已安装。
- Gateway 使用 loopback 地址和 `PA_HTTP_TOKEN`。
- DSH provider/model 凭据位于仓库外环境或未提交的 `.env`。
- 来源必须是用户明确选择的公开 HTTPS URL，不含凭据、fragment、非 443 端口或 IP literal。
- 停止条件：来源需要登录、解析到非公网地址、内容超过 1 MiB、类型/编码不支持、模型未引用全部 source ID。

## Workbench

```bash
pnpm build:legacy
PA_HTTP_TOKEN='<local-token>' pnpm start:legacy
```

打开 `http://127.0.0.1:4310/#token=<local-token>`，在 composer 选择“研究简报”，输入研究问题，并在“公开来源”中每行填写一个 URL。提交后：

1. Task capability 应为 `research-agent`。
2. 用户消息下应显示服务端绑定的规范化来源。
3. 事件中应出现每个来源的 `research.source_captured` 和最终 `verification.completed`。
4. 只有最终结果包含全部 source ID 时 Task 才是 `completed`。

`PA_EXECUTOR=mock` 不会伪造来源抓取，因此 research Task 会以“未抓取声明来源”失败；这用于 UI/失败路径验证，不是成功研究样本。

## CLI

```bash
pnpm cli research "比较两个公开方案" \
  --id research-example \
  --source https://example.com/a \
  --source https://example.com/b

pnpm cli events research-example
pnpm cli audit research-example
```

成功判定：

- 输出 `state` 为 `completed`、`capabilityId` 为 `research-agent`。
- 每个声明 URL 都有 `research.source_captured`，包含 source ID、digest 和 sourceRef。
- `verification.completed` 的 `status` 为 `passed`，`sourceCount` 等于声明来源数。
- 最终结果逐一包含对应 source ID。
- snapshot 位于 `PA_RESEARCH_ROOT` 或 `data/research/sources`，其 `contentDigest` 与规范化 `text` 匹配。

## Gateway

```bash
curl -sS http://127.0.0.1:4310/v2/workflows/research-brief \
  -H "authorization: Bearer $PA_HTTP_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "schemaVersion": "lumi.research-brief/v1",
    "question": "比较两个公开方案",
    "sources": [
      "https://example.com/a",
      "https://example.com/b"
    ]
  }'
```

HTTP 201 只表示 Task 已处理，不单独证明研究成功；必须检查返回 Task state、事件、来源 snapshot 和 verification。

## 失败分支

- `INVALID_REQUEST`：修正问题、URL scheme、凭据、端口、fragment、重复项或 1-8 个数量限制。
- `PERMISSION_DENIED`：URL 未在本 Task 声明，或 DNS 包含本机、私网、链路本地、保留/文档地址。
- `DEPENDENCY_UNAVAILABLE`：DNS、TLS 或远端 HTTP 暂时不可用；用户确认来源仍适用后创建新 Task，不修改旧证据。
- `DEADLINE_EXCEEDED`：单次来源读取超过 10 秒。
- `VERIFICATION_FAILED`：DSH 未抓取全部来源或最终文本漏掉 source ID；该 Task 保持 failed，不手工改成 completed。

## 恢复与清理

读取没有外部副作用。失败 Task 和审计保留；隔离验收创建的数据库、DSH home 和 source root 可按本次明确目录删除。不要删除共享 `data/research/sources` 中其他 Task 仍引用的 snapshot。

Snapshot 当前没有产品级删除/retention UI；在引入长期来源库前按本地数据策略人工管理。依赖版本、URL/DNS 判定、Node TLS/lookup 行为、DSH 工具协议或引用 verifier 变化时，本 SOP 降级为 candidate 并重验。
