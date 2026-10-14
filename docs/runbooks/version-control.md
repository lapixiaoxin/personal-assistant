# 版本管理

状态：当前生效。用户授权 Agent 在必要验证后直接提交 `main` 并普通推送 `origin/main`。

## 交付流程

1. 读取 AGENTS 和当前 spec，检查分支、远端与未提交改动。
2. 复杂工作使用临时分支/worktree，保护主工作区和运行数据。
3. 运行与风险相称的测试；源码主线完整门禁为 `pnpm check`。
4. 显式暂存任务文件，检查 cached diff、空白、凭据、数据库和生成物。
5. 使用具体提交信息；有关联 spec 时写编号。
6. fetch 后确认远端无未整合提交，再普通 push。
7. 核对本地/远端引用一致，报告 commit、验证与未完成项。

禁止 force push、关闭 hook、改写共享历史、删除远端引用或把 push 说成部署。hook 命令异常但 commit 已存在时以 Git 引用对账，不能重复提交。

## Worktree 清理

只有 worktree clean、分支已被 main 包含且不承载必要运行数据时，才执行：

```bash
git worktree remove <path>
git branch -d <branch>
```

不用 `--force` 掩盖未提交内容，不直接删除登记中的 worktree 目录。

## 回退

已共享提交优先用 `git revert`，不默认 reset/rebase。代码回退与运行数据恢复分开；DSH Session 或已发送消息不会因 Git 回退自动撤销。
