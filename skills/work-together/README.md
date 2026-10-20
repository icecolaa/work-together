# Work Together · 跨工具桌面协作

让当前聊天里的 AI 担任**主持方**（Spec/Plan/Verify），把 Exec 派发给**其他工具**的桌面会话（ZCode / WorkBuddy）并行执行，逐包独立验收。

适合按文件拆分的跨模块开发、独立文稿和多产物任务。你可以在真实桌面查看执行过程，跟踪各包待办，在审批或提问时收到介入卡；异常时先查询原会话，避免重复执行。文件归属用于调度与事后越界检测，不提供操作系统沙箱；同文件、共享构建或数据库写入需串行协调。

| 主持方 | 可指派的桌面执行器 |
|---|---|
| Codex | ZCode、WorkBuddy，可逐包混排 |
| ZCode | WorkBuddy |
| WorkBuddy | ZCode |

当前没有 Codex 执行适配器。提示词 `executor=both` 仅用于 Codex 主持，不能写成 `plan.engine=both`。仅需在当前聊天内调用子代理时，无需本 Skill。

**环境边界**：Windows 为已验证平台（Node.js >= 22；桌面桥验证绑定 ZCode 3.15.3 / WorkBuddy 5.7.6，任一应用升级后必须重跑 `doctor`，失败即需重新适配——不会假报成功）。macOS 为**实验性适配、未现场验证**：核心逻辑有跨平台单测，darwin 启动器仅语法校验；首次在 Mac 上使用前必读 `references/macos.md` 并执行其验证清单。

## 快速开始（3 步）

```powershell
# 以下为 Windows、Codex 主持、仅派 ZCode 的最小示例
# 1. 启动/复用所选桌面（自动处理未开调试端口的实例）
powershell -NoProfile -File <本skill绝对路径>/scripts/start-desktops.ps1 -Engine zcode

# 2. 预检
node <本skill绝对路径>/scripts/workflow.mjs doctor zcode

# 3. 在项目根目录派发（先准备 SPEC.md 和 plan.json）
node <本skill绝对路径>/scripts/workflow.mjs run plan.json
```

`examples/plan.example.json` 是双执行器混排样例；仅用 ZCode 时将其中的 `"engine": "workbuddy"` 改为 `"engine": "zcode"`，并相应调整任务标题。双执行器计划需启动 both，并分别 doctor zcode/workbuddy。真实任务的后台启动、状态跟踪和逐包验收见 `references/operations.md`；macOS 启动方式见 `references/macos.md`。

## 文件地图

| 文件 | 用途 | 什么时候读 |
|---|---|---|
| `SKILL.md` | 主持方工作流（1-8 步）与硬约束 | 每轮任务开始 |
| `references/operations.md` | 运行协议：命令速查、plan.json 结构、恢复/取消/回退 | 派发前与日常操作 |
| `references/faq.md` | 反模式与高频问题集中清单 | 遇到问题时按症状查 |
| `references/walkthrough.md` | 端到端实战样例（含失败恢复） | 第一次使用前通读 |
| `references/macos.md` | macOS 实验性适配状态与真机验证清单 | macOS 用户首次使用前必读 |
| `examples/plan.example.json` | 可拷贝的最小 plan 模板（含混排写法） | 写计划时 |
| `examples/SPEC.template.md` | SPEC 模板（目标/边界/交付/验收/回退） | 写 Spec 时 |
| `scripts/workflow.mjs` | 调度入口：run/status/watch/open/verify/cancel | — |
| `scripts/start-desktops.ps1` | 桌面启动/自动重启/保护 | — |

## 常见任务 → 对应入口

- 第一次跑通 → `references/walkthrough.md`
- 命令记不住 → `references/operations.md` 顶部速查表
- 任务没出现在桌面 / verify 报退出码 2 / 连接断开 → `references/faq.md` 按症状查
- 写计划卡住 → 拷贝 `examples/plan.example.json`
