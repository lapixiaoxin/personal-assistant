# 设计文档发布与读回

状态：verified_once · 2026-09-24 / 2026-09-25。环境：本机 Python3、lark-cli 1.0.87、user 身份。初次 11 篇及后续 DSH 六图专题成功发布并读回；[发布清单](../publication.md) 保存目标和版本。仍仅为指定环境证据。

## 前置

先读取当前安装的 lark-doc / lark-wiki 技能与相关参考。用户需已授权目标父节点和文档创建；本次目标是“个人助手”下新建方案系列，不修改原始宪章。

保持仓库根目录为 CWD，所有 `@file` 用 `@./` 相对路径。不得把 token、完整进程参数或环境输出到终端；工具封装进程可能把认证信息放在参数中。诊断进程只查看必要的 PID/进程名。

## 已成功流程

1. 读取原愿景、当前实现、上游参考，按当前技能选择读者任务与体裁；明确事实、设计和未知。初次方案使用当时的 design_rfc，不能将其套用于所有后续文档。
2. 用 `lark-cli docs +script --command init-draft --presentation-decision ...` 创建专属草稿目录。能指定位置时统一放入 `data/publication-drafts/`；工具必须在根目录生成时，记录返回路径并在本次验证结束后删除。总纲包含一张解释双闭环的 SVG；专题使用精确表格和文字。
3. 使用 `python3 scripts/docs-to-lark.py <source.md> <draft.xml>` 生成当前语法子集的 XML。总纲传入 `--board docs/design/assets/closed-loops.svg`；转换器拒绝覆盖已有草稿。`docs/` 中的 Markdown/SVG 是事实源，draft 只是传输格式。
4. 用 `docs +script --command parse --content @./<draft.xml>` 检查；除 `ok=true` 外确认 `assessment.status=passed`，再检查标签和正文。
5. 用 `docs +create --doc-format xml --content @./<draft.xml> --parent-token <已核验父节点> --as user` 创建，立即保存 document_id、URL、revision 和 warning。
6. `docs +fetch --doc <id> --detail full --as user` 读回全文，规范化文本与草稿比较；列表、表格、标题、关键状态和引用不能丢失。
7. 创建完专题后，用保存的 URL map 对总纲目录做局部 block_replace；重新 fetch 验证正文未变化。
8. `wiki +node-get` 核验总纲父节点；`wiki +node-list` 核验专题完整列表和父子关系。
9. 用 `whiteboard +export --output-type preview` 导出总纲画板，实际查看标签、箭头和布局。

`publish-design-doc.py` 将步骤 2–6 封装为本次目录的逐篇操作。它硬编码本次总纲节点，不是通用发布工具。已有回执时只读回；创建失败且无回执时先核查 create-attempt 与远端节点，禁止盲目重建。

## 判定和失败处理

成功信封看 `ok`，不要按顶层 `code==0` 判定。检查 warnings 与 partial_success；资源失败时修已有文档，不能重建整篇。所有更新前读最新 block ID；保留画板 token、评论和未知资源。

本次 `lark-cli whiteboard +export` 成功导出 JPEG。额外 whiteboard-cli 的 npx 版本检查安装等待过久后已停止，没有据此声称该独立 CLI 可用；发布及预览使用 lark-cli 已完成，不依赖它。

Markdown 转换器只支持本次用到的标题、段落、简单列表、表格、粗体、链接和代码围栏。inline code 转为文本；Mermaid 保留关系定义，直观画板在总纲。需要新语法、图片或复杂图时重新按技能设计，不能静默丢内容。

## 保留和更新

Git 中保留 Markdown/SVG 源与脱敏 evidence；本机 `data/` 可按需保留创建回执和最终 fetch。发布快照含源文件摘要，但不替代 Git commit。回查时先比较版本与内容，防止覆盖用户已编辑的正文。

发布完成并读回后精确删除本次 draft 目录及 `.presentation-decision.json`，不在仓库根长期保留 `draft_*_folder`。敏感认证数据不得进入 SOP、fixture 或发布记录。下一次跨版本成功后追加证据，不能凭本次成功推断永久兼容。

## 2026-09-25 · 多画板专题的已验证补充

适用：本机同版本 CLI，授权新建“个人助手”子文档；五张本地 SVG、一张 Mermaid 时序图。独立 whiteboard-cli 不在本机缓存，offline npx 返回 `ENOTCACHED`，因此按 lark-doc 的 SVG / Mermaid 直接插入路线完成，不依赖额外 CLI。

1. 在 init-draft 返回的专属目录中生成 XML；每个图使用 `<whiteboard type="svg|mermaid" path="@./相对路径"></whiteboard>`，外部图源入库，发布草稿不入库。此次专用投影复用旧转换器后，明确替换其硬编码的版本日期、去除自动编号标题里的手写序号，并将六个 Markdown 图引用替换为真实画板，不能直接照搬旧脚本声称支持图片。
2. 五张 SVG 经 XML、自包含资源及文字/连线检查；主文档 parse 为 `assessment.status=passed`，识别 6 个 whiteboard。创建成功后立即保存完整 JSON，核查 new_blocks 六项，无 warning；禁止在读回失败后盲目重建。
3. 全文 fetch 的 Mermaid 画板会带回源码，而 path 引用草稿没有内联源码。比较前将草稿该节点展开为原 `.mmd`，单独逐字核验 Mermaid 内容，再规范化整篇文本。此次正文与源码共 8460 个非空白字符完全一致；不要直接删除所有画板内容掩盖源码差异。
4. 核对 fetch 的六个 token 与创建回执顺序一致；对每个 token 执行 `whiteboard +export --output-type preview --output ./<证据目录>/<序号>-preview --as user`，用实际返回的 `.jpg` 路径打开查看。返回成功和文件非空不能代替目视检查。
5. 以 `wiki +node-get --node-token <document_id> --obj-type docx --as user` 核对真实 parent_node_token；本次确为用户指定“个人助手”。保存源文件、草稿与各图摘要，更新发布清单和规格证据。

本次证据见 [SPEC-0003](../../specs/0003-dsh-centered-design/evidence.md)，回执与逐图预览位于 `data/dsh-architecture-20260925/`。这是文档工具发布验收，不是 lumi 自身具备飞书或设备能力的验证。

## 2026-09-25 · 源码解释文档与草稿清理

状态：verified_once；同机 lark-cli 1.0.87 / user 身份，沿用已授权父节点。本次按更新后的 lark-doc 创建工作流选 `router.knowledge` 的 Explanation 模式，生成两张聚焦图和能力矩阵；未把研究事实套成未来设计。完整证据见 [DSH 源码研究](../evidence/2026-09-25-dsh-source-analysis.md)。

- 源码引用固定到完整 commit SHA；发布前在本地快照检查文件与行号。本次 41 处引用、39 个不同 URL 均通过。
- 复用旧转换器时显式移除硬编码的 v0.2 设计元数据；图片引用改成真实 whiteboard，不能把路径说明当成已渲染图表。辅助脚本仅保存在本次忽略的证据目录中。
- `docs +media-download --type whiteboard --token <board_token> --output ./<证据目录>/<序号>-preview --as user` 可下载实际画板预览；按返回的 `saved_path` 查看，不假设是 PNG。本次两张都返回 JPEG。
- 全文 fetch 后同时比较规范化正文、展开后的 Mermaid 源码及全部链接；本次 7866 个非空白字符一致，并核验四张表和父节点。
- 当前技能要求交付前删除 `init-draft` 返回的整个专属目录。这条新规则替代上文“默认保留草稿”的后续操作建议；保留目录外的源文件、摘要、回执、最终 fetch 和预览即可。只精确删除本次目录，不清理历史草稿或用户资料。
