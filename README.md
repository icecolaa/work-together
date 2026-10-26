# work-together

把当前 AI 聊天当「老板」，把其他工具的真实桌面会话当「员工」：老板拆任务、分活并验收，员工各做自己的文件、分享发现、交回成果。老板可以给一名员工排多件活，也可以安排同一工具或不同工具里的多名员工（独立会话）并行干活，并查看每个人的当前任务和阻塞情况。

**新手直接本地用，不需要 Gitee 账号或聊天平台。** 本地就能完成拆任务、分配、消息共享、验收和成果汇总；按 [本地团队说明](skills/work-together/references/team.md) 准备本地 Git 和桌面工具即可。需要线上任务记录和 PR 交付时，再选配 [Gitee 自动同步](skills/work-together/references/gitee.md)。

支持 Codex、ZCode、Qoder 国际/国内版、WorkBuddy 国际/国内版六款客户端，任意一款的聊天都能担任老板（主持方）；执行工作由其他工具的桌面员工承担。

适合跨模块代码改动、多文稿生产、网页/小程序截图等多产物工作流；单文件小改动或必须同时写同一文件的工作不必强行并行。

## 主持方 × 执行器

| 主持方（写 `coordinator`，缺省 `codex`） | 可调度的执行器 |
|---|---|
| Codex 聊天 | 其余五款桌面全部可用 |
| ZCode 聊天 | Qoder 双区 + WorkBuddy 双区（同族 ZCode 自动排除） |
| Qoder 国际/国内版聊天 | ZCode + WorkBuddy 双区（整个 Qoder 家族排除） |
| WorkBuddy 国际/国内版聊天 | ZCode + Qoder 双区（整个 WorkBuddy 家族排除） |

在哪个客户端的聊天里运行本 skill，谁就是主持方；派发自动排除主持方同族，主持方自己的桌面无需调试端口。会话侧栏标题、派发提示词与 STATUS.md 都使用主持方名称。

## 执行器候选与自动切换

缺额度、模型不可选或桌面不可用时，按用户授权的五级顺序自动切换（每任务每候选至多一次）：

| 优先级 | `engine` | 模型要求 |
|---|---|---|
| 1 | `zcode` | 精确 `GLM-5.3-FlashX`，不替换为 Flash |
| 2 | `qoder-global` | 国际版当前明确零费率的 DeepSeek |
| 3 | `qoder-cn` | 国内版当前明确零费率的 DeepSeek |
| 4 | `workbuddy-global` | 国际版当前明确零费率的 DeepSeek |
| 5 | `workbuddy-cn` | 国内版当前明确零费率的工具模型 |

默认 `engine=auto` 从头选；显式 engine 从该项向后尝试；`fallback=false` 锁定单项。只接受目录明确零费率的模型——Auto、空费率、未标价和付费模型都不算免费候选，免费耗尽即报告，禁止收费回退。运行中失败必须**确认原会话已停止**才带产物交接；创建/派发/连接结果不明保持 `unknown` 并查原会话，禁止重复派发。

## 主持方失效与接管

主持方（如 Codex）没额度或会话中断时，在其他工具的聊天里运行：

```powershell
node <skill>/scripts/workflow.mjs takeover <执行器>
```

主持权写入 `coordinatorHistory`（status/STATUS.md 显示来源），接管后的派发排除现任主持方同族，`run --resume` 仍按初始主持方校验。**自验红线**：由现任主持方同族执行且未验收的包，`verify` 默认拒绝，加 `--self-review` 才显式登记（state 记录 reviewer/selfReviewed），或交由其他工具复核。

## 验收纪律

- 执行者交回只记 `exec_done`；主持方逐项核对真实产物（逐字节比对、diff、测试退出码）、确认原生待办与桌面可见性后执行 `verify` 才是 `verified`。不把执行者自测当验收。
- 归属清单外的任何增/改/删（含主持方自己迟写的文件）会在验收时被指纹检测阻断（退出码 2）——主持方材料放 `.work-together/` 或在启动前就位。
- 可见性 = 正确项目 + 选中目标会话 + 正文任务包标记，缺一用 `open <包ID>` 修复，禁止重派。

## 安装与启动

把 `skills/work-together` 整个目录复制到主持工具的技能目录（Codex 为 `~/.codex/skills/work-together`，重开聊天后 `$work-together` 调用；其他客户端可直接给聊天 SKILL.md 绝对路径）。需要 Node.js >= 22.13，无 npm 运行依赖；team 使用 Node 内置 SQLite。

```powershell
# 启动/复用桌面：auto 按五级列表，自动跳过主持方同族桌面（防误杀协调会话）
powershell -NoProfile -File <skill>/scripts/start-desktops.ps1 -Engine auto
# 预检：逐项报告桌面桥与模型策略，不创建任务
node <skill>/scripts/workflow.mjs doctor
# 派发（plan.json 从 skills/work-together/examples/plan.example.json 拷贝修改）
node <skill>/scripts/workflow.mjs run plan.json
# 跟进与验收
node <skill>/scripts/workflow.mjs status | watch | open <包ID> | verify <包ID> <证据> | cancel <包ID> | takeover <执行器>
```

启动脚本自动读取当前目录 plan.json 的 `coordinator`（或 `-Coordinator` 指定）跳过主持方同族桌面；运行中持锁期间该应用拒绝自动重启。健康实例直接复用，缺调试端口的所选应用自动退出后重启。

## 本地多 agent 团队（v1.7.0）

新增可选 `team.mjs` 入口：桌面规划器按 Spec 自动拆分任务；同一客户端可配置多个 agent 实例，按容量均衡分配或自主认领。每次执行使用独立 worktree，SQLite 保存任务、认领租约、事件和消息；agent 可共享发现、请求协助并在 scope 内提议后续任务，主持方通过 `status/watch` 和团队 STATUS.md 查看当前任务、队列及阻塞。

执行交回后由主持方独立 `verify`，再 `collect` 串行测试并合并到本地 `codex/team-*` 分支；依赖任务从已集成代码启动。主工作目录保持原样，默认本地运行，不依赖 Mattermost。v1.8.0 可选接入下面的 Gitee Issue/PR 同步。

```powershell
# 在目标 Git 仓库根目录；先提交需要共享的基线代码
node <skill>/scripts/team.mjs init
# 编辑 .work-together/team.config.json：scope、agents、checks
node <skill>/scripts/team.mjs plan SPEC.md
node <skill>/scripts/team.mjs run
# 另一个终端或主持聊天
node <skill>/scripts/team.mjs status
node <skill>/scripts/team.mjs verify <任务ID> <独立验收证据>
node <skill>/scripts/team.mjs collect
```

完整配置、后台启动、消息、动态任务、恢复与合并到主分支见 [团队模式说明](skills/work-together/references/team.md)。旧 workflow 模式保持兼容，同一目录两种模式不可混跑。Windows ZCode 已完成自动规划、双 agent、消息和三任务集成的 [真实验证](docs/verification-1.7.0.md)；其他客户端的 team 并发容量仍需实测。离线任务的 unknown 不会触发自动重派。

## Gitee Issue / PR 自动化（v1.8.0）

在 team 项目根目录配置一次即可使用现有 Gitee。每个任务映射一个 Issue，全部任务独立验收并集成后，推送专用团队分支并创建一个汇总 PR，避免依赖任务各自提 PR 重复带入前置改动。

```powershell
node <skill>/scripts/team.mjs gitee init
node <skill>/scripts/team.mjs gitee doctor
node <skill>/scripts/team.mjs gitee sync --dry-run
node <skill>/scripts/team.mjs gitee sync
# 可选常驻同步，每 60 秒对账一次
node <skill>/scripts/team.mjs gitee watch --interval 60
```

初始化从 origin 的 Gitee push URL 识别仓库，API 令牌从现有 `GITEE_OPEN_API` 或指定环境变量读取；Git 推送使用正常 Git 凭据。配置与同步映射只留本地。请求应答丢失先按管理标记和 SHA 对账，不盲目重复创建；人工正文保留，远程分支被他人修改时不覆盖。只有远程 PR 确认合并且 SHA 匹配，才关闭对应 Issue；本地 `merged` 不等于远程 PR 已合并。

不自动合并 PR、推送 main 或修改分支保护；使用轮询，无需公网 WebHook 回调。完整配置、恢复和发布轮次见 [Gitee 接入说明](skills/work-together/references/gitee.md)。

## 平台边界

- **Windows 为已验证平台**：五款客户端均完成真实文件任务、模型核对、显示校验与独立验收（[v1.4.0 验证](docs/verification-1.4.0.md)）；ZCode 3.15.3 / WorkBuddy AI 5.7.6 为历史验证基线，新版本以实际 doctor 与 smoke 结果为准。桌面桥使用版本相关的本机私有接口，应用升级后需重新预检适配。
- **macOS 为实验性适配**：未在真机现场验证，首次使用必读 [macOS 清单](skills/work-together/references/macos.md) 并逐项执行验证清单；Bash 启动器仅保留 ZCode / WorkBuddy 国际版入口。

## 文档地图

- [主持方工作流 SKILL.md](skills/work-together/SKILL.md) — 六步工作流、候选策略、接管语义
- [运行说明](skills/work-together/references/operations.md) — 命令速查表、plan.json 结构、恢复/取消/回退
- [FAQ](skills/work-together/references/faq.md) — 按症状索引的反模式与高频问题
- [端到端样例](skills/work-together/references/walkthrough.md) / [plan 与 SPEC 模板](skills/work-together/examples/)
- [验证记录](docs/verification.md) · [v1.4.0 五客户端验证](docs/verification-1.4.0.md) · [可复制提示词](prompts/ai-collaboration.md)

## 开发

`npm test` 运行调度约束、执行器候选、启动生命周期、可见性与接管守卫测试（Windows 双 PowerShell 通道）。发布到 [SkillHub](https://skillhub.cn/skills/user_5dea5c46/work-together)（`@user_5dea5c46/work-together`）按 [官方规范](https://skillhub.cn/ai/release.md) dry-run 后提交。文件归属是协作约定与事后检测，不是操作系统隔离；日志、会话、截图与账号元数据默认仅留本地；共享安装、Git index、构建输出与数据库写入需串行。主持聊天需保持跟进，skill 本身不提供聊天回合结束后的自动唤醒。
