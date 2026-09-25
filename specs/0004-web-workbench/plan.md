# SPEC-0004 实现计划

状态：In Progress。

## 实现边界

1. 新建 `apps/workbench`，使用 React、Vite 和 TypeScript。
2. 在浏览器端封装现有 Gateway API，组件不直接拼接请求。
3. 客户端提交前生成 task ID；提交 Promise 与轮询并行，使同步 Gateway 仍能显示运行状态。
4. Gateway 在生产构建存在时托管 `dist/workbench`；测试默认不依赖静态目录。
5. 根构建先执行服务端 tsup，再执行 Workbench Vite build，避免清理顺序删除前端产物。

## 页面结构

- 左侧：lumi 标识、新任务入口、状态过滤、最近任务。
- 中间：任务标题、请求内容、结果/错误、任务输入框。
- 右侧：状态摘要、审批操作、事件/审计切换。
- 窄屏：三区纵向排列，输入和关键操作保持可见。

## 状态与刷新

- 初次加载并行读取健康状态、能力目录和任务列表。
- 选中任务后读取任务详情、事件与审计。
- 存在 `queued`、`running`、`waiting_approval` 任务时定时刷新。
- POST / approve / reject / cancel 请求期间禁用对应操作；失败写入页面级错误。
- API 返回的 TaskRecord 是唯一任务状态，不从请求是否完成推断成功。

## 验证

- API 客户端与展示辅助函数单元测试。
- React 组件测试覆盖空状态、任务结果和审批操作。
- Gateway 静态托管测试。
- `pnpm check`。
- mock Gateway + Vite 实际浏览器桌面/移动截图及控制台检查。

## 回滚

移除 `apps/workbench`、Gateway 静态托管选项及根构建脚本即可；现有 CLI、API、数据库和 DSH Profile 不迁移。
