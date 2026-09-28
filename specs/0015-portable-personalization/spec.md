# SPEC-0015：可迁移个性化内核与 DSH 原生接线 P0

状态：Verified · 2026-09-28。

负责人：lumi Agent。关联：[ADR-005](../../docs/adr/0005-dsh-native-customization.md)、[ADR-006](../../docs/adr/0006-portable-personalization-and-surfaces.md)、[DSH 原生定制方案](../../docs/design/11-dsh-native-customization.md)。

授权来源与范围：用户明确要求直接推进，长期保持个人个性化特征与 Harness 解耦，使其可迁移到其他 Agent；未来允许 DSH Web 之外的语音 UI 和多设备入口；DSH 应及时跟进当前兼容版本。本切片可新增领域包与 DSH bundle、调整依赖、升级 DSH、增加门禁和测试，并在验证后提交推送。不得覆盖主工作区三份用户 SVG，不迁移真实个人数据，不启用公网或真实外部动作。

## 问题和目标

当前 `packages/personal-memory` 同时拥有记忆领域、TaskExecutor 装饰器和 Task Ledger 事件，导致个性化能力虽不依赖 DSH，却仍绑定当前任务 Harness。现有 DSH 接入也固定在每 Task SDK 子进程和临时 HTTP bridge，无法证明外部 bundle 能在标准 DSH Web 中装配。

成功后：

1. 个性化记录和上下文快照拥有 Harness-neutral 的版本化契约，可被 DSH 插件或其他 Agent adapter 消费。
2. 当前 Task 路径继续工作，但 TaskExecutor / Ledger 接线迁出个人记忆领域包。
3. 一个可打包的外部 lumi DSH bundle 能在隔离 Web profile 中装配 lumi Preset，读取测试用个性化快照，并注册只读状态工具。
4. DSH / SDK / mock / tools 升级到当前最新兼容 release `0.1.7-rc.2`，保持精确锁定，并提供显式的上游新鲜度检查。
5. 架构明确 DSH Web、未来语音 UI 和多设备入口都是可替换 surface，不拥有个人资产或授权根。

## 范围

- 新增 `packages/personal-context`，定义 `lumi.personal-context/v1` 快照、选择与渲染契约。
- 让 `packages/personal-memory` 只拥有记忆 Schema、状态、存储和检索，不再依赖 Assistant Core 或 Task Ledger。
- 新增 Task 侧 adapter，将个性化上下文附加到当前执行请求并记录无正文事件，保持现有行为兼容。
- 新增 `plugins/dsh-lumi` 外部 bundle：lumi Preset、动态上下文读取、只读状态工具和生命周期清理。
- 使用隔离 DSH home/profile、临时快照和 mock 模型验证标准 launcher 装配；不得读取默认个人数据库。
- 升级 DSH 同 release 依赖，更新 lock 与兼容检查；增加手动/CI 可选的 registry 新鲜度检查。
- 更新架构、事实、SOP 和验证证据。

## 非目标

- 不实现赛博朋克 UI、实时双向音频、TTS、唤醒词、连续监听或数字人渲染。
- 不把 DSH 实验性语音输入宣称为语音对话；它仅录音后转写到可编辑草稿。
- 不实现设备注册、跨设备同步、远程认证、推送、分布式 lease/fencing 或多主写入。
- 不将完整个人记忆自动导出到文件或 DSH；P0 使用隔离的虚构快照。
- 不迁移现有 Workbench、Gateway、SQLite 或 Action 运行所有权，不删除 SDK adapter / bridge。
- 不使用浮动 semver 或不同 package 的独立 `latest` 标签直接组成运行栈。

## 需求

| ID | 行为 |
| --- | --- |
| FR-001 | `personal-memory` 不得导入 DSH、Assistant Core 或 Task Ledger；其记录和存储行为保持兼容。 |
| FR-002 | `personal-context/v1` 快照必须包含稳定 schema、owner、purpose、生成时间和有 ID/revision/source 的条目；解析拒绝未知 schema、错误 owner、越界正文和重复 ID。 |
| FR-003 | 上下文选择只允许 confirmed public/personal、匹配 purpose/scope 的记录，并保持既有数量、字符预算和确定性顺序。 |
| FR-004 | Task adapter 使用同一快照渲染器附加模型上下文；持久 Task 原文不变，事件仅含 ID、revision、purpose 和 count。 |
| FR-005 | DSH bundle 不拥有个人数据；它只读取显式配置的快照路径，逐次组装时校验并把上下文作为动态 model-visible context 提交。 |
| FR-006 | DSH bundle 提供 scoped lumi persona 和 `lumi_context_status` 只读工具；工具只返回 schema、purpose、revision/count 等元数据，不返回正文。 |
| FR-007 | 快照缺失、非法、owner/purpose 不匹配时必须失败关闭；不得静默运行成“已个性化”。 |
| FR-008 | bundle 可打成不含 `workspace:*` 的 tarball，并通过标准 DSH Web profile 安装/装配；源码 checkout 不作为运行前提。 |
| FR-009 | DSH、SDK、mock server、tools 和插件 peer/dev 版本精确对齐 `0.1.7-rc.2`；原 rc.1 契约测试在升级后重新执行。 |
| FR-010 | 本地门禁默认离线验证精确对齐；显式 online 模式查询 `@deepseek-ai/dsh` 的 registry `latest`，发现更新时失败并输出候选版本。 |
| FR-011 | 架构文档把 text Web、voice UI、IM 和设备入口定义为 surface adapter；它们共享 owner、conversation/task/action 语义，但不共享同一传输协议。 |

| ID | 质量约束 |
| --- | --- |
| NFR-001 | 所有新增领域 TypeScript 保持 strict，领域包不依赖 `@deepseek-ai/*`。 |
| NFR-002 | P0 使用虚构非敏感快照、独立目录和非现有端口；不停止或修改正在运行的本机服务。 |
| NFR-003 | 版本更新不放宽工具 guard、动作授权、来源抓取或验证断言。 |
| NFR-004 | 失败和未运行项写入 evidence；静态配置、mock 和真实模型结果严格区分。 |

## 验收

| AC | Given / When / Then |
| --- | --- |
| AC-001 | Given 既有 personal-memory 测试，When 完成依赖抽离，Then 全部生命周期、SQLite、检索和 tombstone 行为通过，且 manifest / 源码无 Core、Ledger、DSH 依赖。 |
| AC-002 | Given 混合状态/分级/用途记录，When 生成快照，Then只包含允许记录，revision/digest 稳定，预算与重复 ID 负向通过。 |
| AC-003 | Given 当前 runtime custom executor，When执行带记忆任务，Then临时上下文与旧格式语义兼容、Task 原文不变、事件无正文。 |
| AC-004 | Given 有效虚构快照，When加载 lumi DSH 插件，Then动态 context 与只读状态工具可见；修改 snapshot revision 后下一次组装读取新值。 |
| AC-005 | Given缺失、非法或 owner/purpose 不匹配快照，When插件组装上下文或调用状态工具，Then明确失败且不返回部分正文。 |
| AC-006 | Given预构建 bundle tarball，When安装到从 DSH Web 模板初始化的隔离 profile并 dump config，Then出现 lumi preset / plugin，tarball manifest 无 `workspace:*`。 |
| AC-007 | Given升级后的依赖，When运行 DSH contract test，Then SDK mock、Action、research、meeting 与旁路阻断全部通过。 |
| AC-008 | Given默认和 online 版本门禁，When执行检查，Then精确 pins 对齐且 registry `latest=0.1.7-rc.2`；网络不可用时 online 检查明确失败，不影响默认离线门禁。 |
| AC-009 | Given完整仓库，When运行 `pnpm check` 与文档检查，Then全部通过，用户 SVG 未进入本分支提交。 |

## 约束、风险和未知

- DSH npm dist-tags 当前不一致：`dsh latest=0.1.7-rc.2`，SDK `latest=0.0.1-rc.1` 而 `next=0.1.7-rc.2`。兼容组合以 DSH release 为锚并验证同版本存在，不能逐包跟标签。
- DSH 动态 context 会进入 Session 历史。记忆纠正/遗忘只影响新快照；旧 Session 的历史删除和重建不在 P0。
- 外部 Web client bundle 的构建工具未独立发布。本切片不实现 DSH 内 UI 插件；未来个性化语音 UI 优先作为独立 surface，通过稳定协议连接。
- snapshot 文件是 P0 adapter 载体，不是最终同步机制。生产接线需改为认证服务或受控进程内端口，并定义缓存、撤销和失败语义。
- 插件与 DSH 同进程，不构成恶意代码隔离；P0 工具只读且无生产凭据。
