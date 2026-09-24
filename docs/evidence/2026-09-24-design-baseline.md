# 2026-09-24 设计交付与工程基线证据

对象：当前 macOS 工作区，`feat/initial-mvp`，无初始 commit。本次未修改业务源码、测试、依赖或锁文件；README 修正能力表述，新增设计/规范/SOP 和文档发布辅助脚本。

## 源码标识

对 apps、packages、adapters、profiles、tests 中全部文件及 package.json、pnpm-lock.yaml、pnpm-workspace.yaml、upstream.lock.json、tsconfig.json、tsup.config.ts、vitest.config.ts、eslint.config.js、.nvmrc、scripts/check-dsh-compat.mjs 共 45 个文件计算 SHA-256。

各文件摘要按路径排序，序列化为 UTF-8 紧凑 JSON 数组（键顺序 path、sha256；不计末尾换行）后得到：

`e520d5a98f122aa83b25e17dc92b2c0b9ba3cf902a5b9b632359e860ba98f951`

锁文件 SHA-256：`3dea6828b096c0c9ad0da912cce3afaaaf4e7dbf46fe087e2c782e908a396b40`。

本机明细：`data/design-validation-20260924/source-manifest.json`（忽略，不含凭据）。摘要范围不包含设计文档或新发布脚本，不冒充 Git revision 或签名发布证明。

## E-BASE-01：工程检查

默认 Node v18.20.8 不满足 engines，版本检查脚本失败；未修改源码适配旧环境。切换 Node 22.19.0 / pnpm 10.20.0 后，约北京时间 22:28：

```bash
NPM_CONFIG_CACHE=./data/tooling/npm-cache NPM_CONFIG_REGISTRY=https://registry.npmjs.org npx --yes --package=node@22.19.0 --package=pnpm@10.20.0 -c 'pnpm check'
```

退出码 0。lint、typecheck、DSH 版本对齐、9 个测试文件 / 23 个测试、build 均成功。原始输出在本次 Agent 工具记录；未另保存完整测试日志。DSH contract 使用真实 SDK 子进程和本地 mock 模型，不是云模型 live 质量验收。

## E-BASE-02：实际 CLI 与持久化

数据库 `data/design-validation-20260924/assistant.db`，任务 `design-mock-approval-001`，executor 显式 mock。三次命令独立进程，见 [完整 SOP](../runbooks/local-validation.md)。

| 操作 | UTC 时刻 / 观察 | 结果 |
| --- | --- | --- |
| submit 发送测试报告 | 14:33:46.810，waiting_approval；approval pending | 退出码 0，无结果正文 |
| approve | 14:34:17.948，completed；审批者 local-user | 退出码 0，mock 输出 |
| 新 CLI get | 读取同一 ID、时间、completed/approved | 退出码 0，数据跨进程保留 |

实际结果为 `[mock:coding-agent] 发送测试报告`。审批 ID `approval_d9fc4e5b-6504-4b99-b317-2189be176a0b`。无真实消息、日历、支付或设备效果；未测试运行中恢复、认证、动作门禁和独立核验。专用演练库保留，无外部对象待清理。

## E-DOC：设计与发布

详见 [发布清单](../publication.md)。设计与首个 SDD 规范保持 Proposed/Specified，实施任务未勾选。

- `python3 scripts/check-docs.py`：退出码 0；31 份 Markdown、89 个本地链接检查通过；11 个 FR、10 个 AC、10 个 T 编号齐全；辅助 Python 语法和 SVG XML 解析通过。编号存在性检查不代替人工语义评审。
- 飞书 11 篇草稿均 `assessment=passed`，创建与全文读回成功；最终规范化正文与对应草稿相等（导航的仓库路径转换为实际链接）。
- 总纲有 10 个专题链接，每个专题都有返回总纲链接。Wiki 查询确认总纲属于指定父节点，10 篇专题均为其子节点，无分页遗漏。
- 画板预览已导出并目视检查；本地 SVG 闭合标签拼写经最终校验修正，文字及布局不变。
- 45 个业务源码/测试/配置文件与基线摘要复核一致；交付文件凭据模式扫描未发现 JWT 或私钥内容。

最终发布核对明细在 `data/design-publication-20260924/final-verification.json`；本机原始草稿及回查信封保留在忽略目录。

文档辅助工具通过实际生成、解析、创建、读回操作验证适用性；没有为文档转换新增运行时依赖或业务测试。任何未覆盖 Markdown 语法仍须人工检查，不将工具宣称为通用导入器。
