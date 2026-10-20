---
name: work-together
description: 当用户要求 Codex、ZCode 或 WorkBuddy 跨工具协作、在真实桌面中并行处理同一项目时使用。当前聊天负责规划与独立验收，ZCode / WorkBuddy 桌面负责执行，提供文件归属调度、进度跟踪和原会话恢复。仅在当前聊天内部拆分任务或调用子代理时不使用。
slug: work-together
version: 1.3.1
displayName: Work Together · 跨工具桌面协作
summary: 在真实 ZCode / WorkBuddy 桌面中并行完成同一项目：当前聊天拆包规划，按文件归属调度、跟踪待办与人工介入，并逐包独立验收；异常复用原会话恢复。Windows 已验证，macOS 实验性。
tags: [collaboration, multi-agent, desktop-automation, codex, zcode, workbuddy]
homepage: https://github.com/icecolaa/work-together
---

# Work Together

让当前聊天担任主持方，把独立任务包交给其他工具的真实桌面会话执行。你负责 Spec（目标与边界）、Plan（任务与依赖）和 Verify（独立验收）；执行器负责 Exec。交付应包含实际产物、逐条验收证据和未解决事项。

适合跨模块改动、独立文稿或其他能按文件拆分的项目任务：执行过程在真实桌面可见，前置包验收后才放行依赖，审批或提问集中给出介入卡。单文件小改动、必须同时写同一文件的工作不必强行并行。

在 Codex 聊天中可这样开始（项目目录使用当前工作目录）：

> 使用 work-together，executor=both。先检查项目现状，把目标拆成互不重叠的任务包，写清文件归属和验收条件。让 ZCode 与 WorkBuddy 在真实桌面执行，你持续跟进并独立验收，最后交付产物和证据。

该示例只授权项目任务协作，发布、推送等外部操作仍取决于用户的具体任务要求。

## 选择主持方与执行器

读取当前聊天所在工具及用户已指定的执行器；只有执行器仍不明确时才询问，不擅自切换工具。

| 当前主持方 `coordinator` | 可用执行器 `engine` |
|---|---|
| `codex`（缺省） | `zcode`、`workbuddy`，或逐包混排两者 |
| `zcode` | `workbuddy` |
| `workbuddy` | `zcode` |

当前没有 Codex 执行适配器。`executor=both` 是提示词中的选择，不能写为 `plan.engine=both`；它只在 Codex 主持时可同时指派两款执行器。计划顶层 `engine` 为默认值，任务可覆写 `engine`，禁止执行器与主持方相同。简单任务用单包；只有归属和依赖允许时才并行。

## 环境与启动

需要 Node.js >=22，以及已安装并登录的所选执行器桌面。Windows 已现场验证，桌面桥适配 ZCode 3.15.3 / WorkBuddy 5.7.6；应用升级后重新 `doctor`。桥使用版本相关的本机私有接口，不改桌面数据库或 app.asar，不复制模型密钥。

- Windows：运行 `scripts/start-desktops.ps1 -Engine <zcode|workbuddy|both>`。健康实例复用，未开调试端口的所选应用自动退出并重启。当前项目活跃任务及持锁主持方受保护；仅用户明确允许中断后用 `-ForceRestart`，随后查询原会话恢复。
- macOS：实验性、未真机验证。先读 [macOS 清单](references/macos.md)，使用 `scripts/start-desktops.sh`；不要运行 PowerShell 启动器或承诺可直接用于正式任务。

脚本默认 ZCode 为 `yolo` + 精确 `GLM-5.3-Flash`，WorkBuddy 为 `bypassPermissions` + 当前列表中明确零费率的工具调用模型。开始前说明默认权限与模型；用户已指定时不重复确认，指定审批模式或模型则尊重覆盖值。空费率和 Auto 不代表免费；无零费率时选最低已知费率并说明，指定模型不可用则明确失败。完全访问不扩大业务授权。

## 执行与验收

1. 先读现场、AGENTS.md、现有修改。将目标、输入、禁止修改边界、交付物、逐条验收条件和回退入口写入 `SPEC.md`。不覆盖用户已有 Spec。
2. 写 `PLAN.md` 及 `plan.json`：每包有唯一 id、prompt、files、acceptance、dependsOn；默认 concurrency=2。目录归属覆盖子目录，交叠包串行，依赖包必须等前置包经主持方验收、登记 verified 后启动。共享构建输出、依赖安装、Git index、锁文件分配唯一写入责任。混排不设通用顶层 model，避免跨工具误用。
3. 读 [运行说明](references/operations.md)，使用本 skill 的脚本连接**真实桌面会话**。先 `doctor <执行器>`；桌面登录不代表 API 或 CLI 已登录。派发后必须打开本次真实项目和目标 session，检查侧栏选中正确任务、正文出现本次任务包标记，并记录 `<包ID>.visibility.json`。仅有 sessionId、后台日志或旧测试会话截图不算桌面执行过程可见。脚本会自动定位，失败用 `open <包ID>` 修复原会话，禁止重新派发。接口不可用时报告缺口，不伪造会话、不直接写桌面数据库、不自动替换其他执行器。首次本地调试适配需说明它是版本相关的私有桌面桥。
4. 在能承载后台进程的宿主中运行 `workflow.mjs run <plan.json>`，工作目录为项目根；Windows 隐藏窗口，stdout/stderr 重定向到 `.work-together` 或用户指定本地日志路径。headless 环境若会回收子进程，按运行说明交由可承载后台的调用方启动；不要反复绕过进程策略。主聊天仅报告状态变化、交付结果和人工决策。
5. 使用当前主持环境真实提供的计划工具（若有）同步任务；没有则维护 PLAN.md 的勾选项。定期读紧凑 status/watch，主会话在本轮保持跟进，独立工作完成后再收尾。skill 本身不能在主持方回合结束后主动唤醒聊天：只有配置了可用的宿主通知机制才能承诺跨回合自动汇报。
6. 状态包括 queued、running、needs_user、exec_done、verified、failed、unknown、blocked、cancelled。needs_user 时自动定位该会话并给出简短回顾卡：完成了什么、卡在哪里、具体需回答什么、项目绝对路径、会话标题/ID、下一步。普通轮询不抢用户当前选中的会话。通过执行器原生待办维护本包进度，不把主持方的总计划假称为外部工具原生全局计划。后台其他无依赖包可继续。
7. 业务问题或超出 Spec 的新操作仍需用户判断。审批模式下，已有明确授权且与 Spec 完全相符的操作可批准一次。失联/超时先查原会话，unknown 不重派；取消后确认停止再释放文件归属。恢复复用持久会话 ID，同项目只允许一个调度器；恢复前确认原 runner 已退出。
8. Exec 结束仅记 exec_done。你逐项读取真实产物、检查 diff、独立运行适合改动的测试，必要时看截图/控制台/应用后台状态，证据映射到 Spec 条件。失败退回原会话修复。将独立验收记录交给 `verify` 命令；不能仅凭执行者“通过”结案。所有包 verified 后交付，更新 PLAN.md 并给出简洁总报告。

文件归属是协作约定，非操作系统隔离：真正相互冲突的构建/依赖/可变外部状态必须串行，或经用户接受后使用 worktree。不要承诺“同目录完全互不干扰”。发布、推送、发消息按当前用户授权范围处理。日志、截图、桌面会话、账号配置和密钥默认只留本地。

## 配套材料（按需读取，不用一次读完）

- **遇到问题**：按症状查 [references/faq.md](references/faq.md)——桌面不可见、verify 退出码 2、连接断开/unknown、headless 主持启动失败、模型费率判断等高频问题与反模式。
- **第一次使用**：通读 [references/walkthrough.md](references/walkthrough.md) 端到端样例（含一次真实的"模型请求 error → 退回原会话修复"支线）。
- **macOS 用户**：适配为实验性、未现场验证，先读 [references/macos.md](references/macos.md) 的边界与真机验证清单。
- **写计划**：拷贝 [examples/plan.example.json](examples/plan.example.json) 与 [examples/SPEC.template.md](examples/SPEC.template.md)。
- **命令速查与环境边界**：[references/operations.md](references/operations.md) 顶部速查表；包内导览见 [README.md](README.md)。
