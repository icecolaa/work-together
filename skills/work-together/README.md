# Work Together · 跨工具桌面协作

把当前聊天当老板，其他工具的桌面会话当员工：老板写订单、排班分活、检查交货，员工各做自己的文件并分享发现。新手直接本地用，不需要 Gitee 账号或聊天平台。

第一次可以直接说：

> 用 work-together 完成【你的目标】。你当老板，先检查项目，准备做事清单并给员工分活，交货后亲自检查和汇总。先本地完成，不接 Gitee，不发布、不推送。

订单是需求与边界（Spec），排班表是任务规划（Plan），员工干活是执行（Exec），老板检查实物是独立验收（Verify）。能独立干的活一起做，要用前一份成果的就排后面；员工说做完了，还得老板检查才算数。团队模式的 `collect` 像把合格成果装成一箱，再检查能否一起用，只汇总到本地集成分支。

老板负责检查环境和准备配置，用户按需完成安装、登录及业务选择。先读 [SKILL.md 的入门说明](SKILL.md)，多员工用 [本地团队说明](references/team.md)；需要线上任务卡与交付窗口时，再选配 [Gitee](references/gitee.md)。

下面是供老板执行的技术速查。默认 `engine=auto`，按 ZCode → Qoder 国际/国内版 → WorkBuddy 国际/国内版顺序检查免费资格；精确模型与当前费率要求以 SKILL.md 为准。缺额度或不可用时按规则切换，禁止收费回退。

先读 [SKILL.md](SKILL.md)。`workbuddy` 是 `workbuddy-global` 的兼容别名；显式 engine 从该项向后选择，`fallback=false` 固定单项。执行中切换必须确认原会话停止；`unknown` 不重派。执行者完成后仍需主持方独立验收。

## Windows 快速开始

```powershell
# 先检查是否有活跃任务；只需一款时使用具体 engine
powershell -NoProfile -File <本skill绝对路径>/scripts/start-desktops.ps1 -Engine auto
node <本skill绝对路径>/scripts/workflow.mjs doctor
# 在项目根目录准备好 SPEC.md、PLAN.md 和 plan.json 后运行
node <本skill绝对路径>/scripts/workflow.mjs run plan.json
```

五款桌面支持独立安装路径；`auto` / `all` 启动五款，旧 `both` 只启动 ZCode 与 WorkBuddy 国际版。启动器可能重启缺调试端口的应用，先保护已有活跃会话。预检不会发模型任务；实际执行能力需单项 smoke 和真实产物验证，不能声称五款已全部可用。macOS 实验性、未真机验证，Bash 启动器仅有旧双客户端入口。

| 文件 | 用途 |
|---|---|
| [SKILL.md](SKILL.md) | 主持方工作流、候选优先级与截图验收 |
| [references/operations.md](references/operations.md) | Windows 路径/端口、计划、切换、恢复和验收 |
| [references/faq.md](references/faq.md) | 桌面不可见、unknown、免费模型和启动排障 |
| [references/walkthrough.md](references/walkthrough.md) | 历史双客户端实战，模型与优先级以 v1.4.0 Skill 为准 |
| [references/macos.md](references/macos.md) | 实验性 macOS 边界与验证清单 |
| [examples/plan.example.json](examples/plan.example.json) | 旧双客户端计划模板，可改为 engine=auto |
| [examples/SPEC.template.md](examples/SPEC.template.md) | 目标、边界、交付、验收和回退模板 |
| `scripts/workflow.mjs` | doctor/run/status/watch/open/verify/cancel |
| `scripts/start-desktops.ps1` | 五款 Windows 桌面启动、复用与保护 |

文件归属不是操作系统沙箱。同文件、共享构建、端口与数据库操作必须协调。没有 Codex 桌面执行适配器；仅在当前聊天内拆子任务无需本 Skill。
