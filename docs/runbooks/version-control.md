# Agent 版本管理 SOP

标准状态：已按用户 2026-09-24 与 2026-09-25 明确指令生效。操作状态：verified_once，本地提交及 `origin/main` 首次推送均已验证。用户授权 Agent 在完成必要验证后主动 commit 并 push；两者都是每次代码交付的一部分。

## 常规流程

1. 读取 AGENTS 与对应 spec，运行 `git status --short --branch` 和 `git log -3 --oneline`，区分本任务与用户其他改动。
2. 常规工作在 main 完成；复杂或并行工作可创建临时分支/worktree，明确文件责任范围。
3. 运行与变更相称的检查。源码改变按要求运行相关测试和必要完整门禁；文档修改运行 `python3 scripts/check-docs.py`。不得为提交而无理由重复昂贵测试。
4. 使用明确路径 `git add <相关文件>` 暂存，检查 `git diff --cached --stat`、`git diff --cached` 和 `git diff --cached --check`。核对无无关文件、私人数据、凭据、数据库和构建产物。
5. `git commit -m "<类型>: <具体目的>"`，有 spec 时注明编号。提交保持一个可解释的目的；不把不完整功能伪装成已验收。
6. 临时分支在验证后集成回 main；有冲突先理解两侧改动再解决，不丢弃用户工作。已有 commit 的撤回优先使用可追踪的 revert，不默认强制重置或改写历史。
7. 提交后执行 `git fetch origin`，检查当前分支 upstream 与 ahead/behind；远端有未整合提交或分叉时先理解并安全集成，禁止 force push、删除远端分支或改写共享历史。
8. 执行普通 `git push`，再以 `git status --short --branch`、`git branch -vv` 和远端引用核验同步结果。报告 commit、push、验证范围及剩余改动。命令返回异常但 commit/push 已生效时以本地与远端事实对账，不重复制造提交。

持续 push 授权仅适用于当前仓库已配置并跟踪的正常开发分支；新增 remote、force push、改写历史、删除远端引用、创建 release/tag、部署和正式发布不在该授权内。不把 Git push 写成已部署或已发布。现有 hooks 保持启用，发现问题先修复；不得通过关闭 hooks 或删验收绕过失败。

## 已合并 worktree 清理

仅在以下三个条件同时满足时移除临时 worktree：`git -C <path> status --short --branch` 无工作区改动；`git merge-base --is-ancestor <branch> main` 退出码为 0；路径不承载运行数据库、服务或未纳入 Git 的必要产物。

先执行 `git worktree remove <path>`，再用 `git worktree list --porcelain` 确认登记已删除，最后以 `git branch -d <branch>` 删除已合并分支。禁止使用 `--force` 掩盖未提交内容；不直接 `rm -rf` 已登记 worktree。SPEC-0012 已按此流程移除两个 clean worktree 并释放约 1.5 GB，提交历史仍可从 main 到达。

## 首次基线的成功记录

起点：无初始 commit 的 `feat/initial-mvp`。用户明确授权提交当前工程后，执行 `git branch -m main`，按明确目录暂存 83 个工程文件；`.env`、data、node_modules、dist、draft 目录均未入库。

检查结果：暂存差异空白检查通过；凭据模式/异常路径/大文件检查无命中；45 个已验证业务源码、测试及配置文件与此前 23 测试通过时的摘要一致，无业务修改。

实际基线：`1cd54cc chore: establish personal assistant MVP and SDD baseline`。提交后 `git status --short --branch` 仅返回 `## main`。本记录证明本机首次提交，不证明远端同步或部署。

## 首次远端推送记录

2026-09-25 只读验证 GitHub SSH 可访问且远端尚无分支后，执行 `git push -u origin main`。远端创建 `main`，本地建立 `main...origin/main` 跟踪关系；首次推送包含截至 `94dc50b` 的已提交历史，三份未暂存 SVG 未进入远端。该记录证明当前 remote 与 SSH 凭据可用，不等于部署或正式发布。

## 失败处理

身份未配置时使用真实已确认身份，不虚构作者。Git 锁或并发变更先查来源，不随意删锁。hook 阻止提交时阅读具体原因并修复；权限或政策确实无法满足时交付完整差异并说明阻塞，不声称已提交。
