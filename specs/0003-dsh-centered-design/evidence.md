# SPEC-0003 · 设计验证证据

2026-09-25 · 状态：Verified（设计交付 / 本机 verified_once）。验收对象为设计源、六张图和飞书审阅投影；不包含新运行时能力验证。

## 事实来源

- 本仓起点：`main / 22f4548`，接手时工作区干净。
- 安装产物：DSH SDK/runtime/mock `0.1.7-rc.1`；已读取 tools、schedule、MCP 与 SDK 协议定义，区分同步 guard、异步工具钩子和 SDK 生命周期。
- 上游参考：2026-09-25 `git ls-remote` 返回 master `477b4f420553e8a52c2fbccc464d7561b239c443`；固定此 SHA 读取 architecture 与 SAFETY。
- 用户愿景：原“超级个人助手”文档 revision 7；目标父节点“个人助手”已读取核验。
- 本机 lark-cli 1.0.87、Python3；发布使用 user 身份。凭据不进入设计或提交。

## 验收结果

| 验收 | 证据与结果 |
| --- | --- |
| AC-001 职责唯一 | 主设计第 2 节及 ADR-003：DSH 唯一认知编排，Host 确定性服务；架构 02 与路线 07 已同步，通用 plugin-host 建议已收敛 |
| AC-002 六图覆盖 | 5 SVG + 1 Mermaid；主 Agent 检查图源语义，并查看 6 张远端 JPEG；审批、未知对账、单权威与进化边界清晰，关键文字未截断 |
| AC-003 事实边界 | SDK/runtime `0.1.7-rc.1` 与当日固定上游 SHA 分开标注；SDK 取消/审批、同步 guard、schedule 限制写入设计；新增状态与能力为 Proposed |
| AC-004 发布读回 | `docs +script parse` 返回 ok=true、assessment=passed，5611 word_count、7704 char_count、6 whiteboards；创建无 warning，revision 4；正文展开 Mermaid 后 8460 个非空白字符完全相等，Mermaid 源码另逐字比较通过 |
| AC-005 工程交接 | 文档链接、规格追溯和差异检查通过；仅文档/图源进入提交，源码、测试、依赖和运行 profile 未变 |

飞书：[lumi：以 DSH 为核心 Harness 的工程架构](https://bytedance.larkoffice.com/docx/ORmCdJYrkozaqoxLRHCc7ZocnFc)。Wiki 节点 `OAjGw2beri62HykYOAVcqc1KnCd`，parent_node_token 已验证为 `CIACwItFgimTkrkM3B4cGAxznyf`，space `7563861482091446300`。

主设计源 SHA-256：`9b46917889c93df1485b8ca3e212e3e482dd286fc882aba8cf3c2b8748ff7c43`；XML 草稿：`8048c37accbf37c4dae7e1f8168cbd2586dbd948fac169645e7a9db1e1b91146`。每张图源与远端预览的摘要、大小和 token 记录在本机 `verification.json`。

执行命令：

```bash
python3 scripts/check-docs.py
lark-cli docs +script --command parse --content @./draft_ad9469ef_folder/draft.xml --format json
lark-cli docs +create --doc-format xml --content @./draft_ad9469ef_folder/draft.xml --parent-token CIACwItFgimTkrkM3B4cGAxznyf --as user --format json
lark-cli docs +fetch --doc ORmCdJYrkozaqoxLRHCc7ZocnFc --detail full --as user --format json
python3 data/dsh-architecture-20260925/verify-publication.py
git diff --check
```

创建命令仅执行一次；后续维护须读最新文档后原地更新，不能按本记录重复创建。六次 `whiteboard +export --output-type preview` 都返回 JPEG，每张由主 Agent 打开确认。

## 异常与处置

独立 whiteboard-cli 不可用，offline npx 返回 `ENOTCACHED`；采用已支持的 lark-doc 直接 SVG/Mermaid 插入，成功完成全部图示。首次直接对比 path 草稿与 fetch 时因飞书返回 Mermaid 源码而不等；核对唯一差异后展开原 `.mmd`，正文与源码完整对比通过，没有修改远端内容或降低比较范围。

流程图右下两个框的边缘相接，但标签和箭头互不遮挡，已按实际预览确认分支可区分；不声称做过像素级自动排版验收。时序图较长，阅读细节需放大画板。

## 未验证边界

DSH 工具接线、生产动作阻断、持久恢复、多端审批、设备与自主发布仍为 Proposed。当前源码与测试未变，不重复运行与本次文档变更无关的业务测试；之前的 23 测试成绩只作为历史基线，不算本轮实测。

## 证据保留

本地忽略目录 `data/dsh-architecture-20260925/` 保留调研、草稿生成辅助、创建回执、完整 fetch 和画板预览；`draft_ad9469ef_folder/` 保留创作决策及 XML。可维护图源入库，远端预览与构建产物不入库。
