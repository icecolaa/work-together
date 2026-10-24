# work-together

六款 AI 客户端（Codex、ZCode、Qoder 国际/国内版、WorkBuddy 国际/国内版）**任意一款的聊天都能担任主持方**：负责 Spec / Plan / Verify，把 Exec 拆成独立任务包，调度到**其他工具**的真实桌面会话并行执行。按文件归属防冲突、跟踪原生待办与审批、逐包独立验收，主持方失效可由其他工具接管。

适合跨模块代码改动、多文稿生产、网页/小程序截图等多产物工作流；单文件小改动或必须同时写同一文件的工作不必强行并行。

## 主持方 × 执行器

| 主持方（写 `coordinator`，缺省 `codex`） | 可调度的执行器 |
|---|---|
| Codex 聊天 | 其余五款桌面全部可用 |
| ZCode 聊天 | Qoder 双区 + WorkBuddy 双区（同族 ZCode 自动排除） |
| Qoder 国际/国内版聊天 | ZCode + 另一地区 Qoder + WorkBuddy 双区 |
| WorkBuddy 国际/国内版聊天 | ZCode + Qoder 双区 + 另一地区 WorkBuddy |

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

把 `skills/work-together` 整个目录复制到主持工具的技能目录（Codex 为 `~/.codex/skills/work-together`，重开聊天后 `$work-together` 调用；其他客户端可直接给聊天 SKILL.md 绝对路径）。需要 Node.js >= 22，无 npm 运行依赖。

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
