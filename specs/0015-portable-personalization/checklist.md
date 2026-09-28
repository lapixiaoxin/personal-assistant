# SPEC-0015 检查单

## Ready

- [x] 用户已决定个性化资产独立于 Harness，DSH Web 不是唯一 UI。
- [x] P0 不迁移真实数据、运行服务或生产动作。
- [x] DSH registry 的版本标签差异已核验，兼容 release 选择规则明确。
- [x] 领域、Task adapter、DSH plugin 和 surface 的依赖方向明确。
- [x] 失败关闭、隔离目录、回滚和未实现范围可判定。

## Done

- [x] `personal-memory` 与 Task / Harness 解耦，旧行为测试通过。
- [x] `personal-context/v1` 正负、预算、digest 与渲染测试通过。
- [x] 当前 runtime 通过 Task adapter 保持记忆注入和无正文事件。
- [x] DSH rc.2 同 release pins、lock 和契约测试通过。
- [x] dsh-lumi tarball 无 `workspace:*`，可由标准 Web profile 装配。
- [x] snapshot 动态刷新、缺失/非法/owner/purpose 不匹配失败关闭。
- [x] `lumi_context_status` 不泄漏正文。
- [x] 完整 `pnpm check` 和文档检查通过。
- [x] 隔离运行产物已精确清理，主工作区用户 SVG 未改变。
- [x] 事实、ADR、SOP、evidence、commit 和 push 已记录。

## 后续而非本切片

- [ ] 定义实时语音 transport、打断、TTS、延迟预算和隐私策略。
- [ ] 定义设备注册、短期令牌、在线租约、同步及单写入者切换。
- [ ] 构建独立个性化语音 UI。
- [ ] 用认证服务替换 P0 snapshot 文件 adapter。
