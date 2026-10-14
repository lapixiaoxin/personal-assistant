# 个人上下文 bundle 验证

状态：`verified_once` · DSH `0.2.0-rc.2`。

`plugins/dsh-lumi` 可打包为不含 `workspace:*` 的外部 bundle，安装到标准 DSH Web profile，并动态读取 `lumi.personal-context/v1` 快照。状态工具只返回 schema、purpose、revision、时间和条目数。

```bash
pnpm check:dsh
pnpm test:dsh:bundle
```

脚本自动：

1. 创建临时 DSH home 和虚构快照。
2. pack bundle 并检查 manifest/必需文件。
3. 从 Web 模板创建 profile、安装 tarball、dump 组合配置。
4. 在随机 loopback 端口启动 DSH Web 并观察 readiness。
5. 停止子进程并删除临时目录。

成功输出：

```text
DSH lumi bundle verified: packed, installed, composed, and served on temporary port <port>
```

该验证不读取真实个人数据库，不证明生产记忆同步、动作权限、语音或多设备。snapshot 缺失、owner/purpose 不匹配或摘要篡改必须失败关闭，不能降级为空上下文并声称已个性化。

升级失败时恢复同一组 manifest、lockfile 和 `upstream.lock.json`，禁止只降顶层 DSH 而保留另一 release 的 peer 图。
