---
name: work-together
description: 当用户要求 Codex、ZCode、Qoder 或 WorkBuddy 跨工具协作、在真实桌面中并行处理同一项目时使用。当前聊天负责规划与独立验收，ZCode / Qoder / WorkBuddy 桌面负责执行，提供文件归属调度、进度跟踪和原会话恢复。仅在当前聊天内部拆分任务或调用子代理时不使用。
slug: work-together
version: 1.6.1
displayName: Work Together · 跨工具桌面协作
summary: Codex、ZCode、Qoder、WorkBuddy 六款客户端任一聊天皆可主持：拆包规划、按文件归属调度到其他工具的真实桌面、跟踪待办并逐包独立验收；异常复用原会话恢复，主持方失效可接管。Windows 五级候选按本机预检判定，macOS 实验性。
tags: [collaboration, multi-agent, desktop-automation, codex, zcode, qoder, workbuddy]
homepage: https://github.com/icecolaa/work-together
---

# Work Together

让当前聊天担任主持方，把独立任务包交给其他工具的真实桌面会话执行。你负责 Spec（目标与边界）、Plan（任务与依赖）和 Verify（独立验收）；执行器负责 Exec。交付应包含实际产物、逐条验收证据和未解决事项。

适合跨模块改动、独立文稿或其他能按文件拆分的项目任务：执行过程在真实桌面可见，前置包验收后才放行依赖，审批或提问集中给出介入卡。单文件小改动、必须同时写同一文件的工作不必强行并行。

第一次使用不需要先读完全部文档：拷贝 `examples/` 里的 plan 与 SPEC 模板，照 `references/walkthrough.md` 的端到端样例执行即可。额度不足、模型不可选或桌面不可用时按五级候选自动切换；任务卡住时按症状查 `references/faq.md`（桌面不可见、验收退出码 2、连接断开、接管与自验等），恢复命令集中在 operations.md 的速查表，不用通读全部文档。Windows 五款客户端已按真实任务现场验证并逐包独立验收；macOS 适配已提供，首次使用前按 `references/macos.md` 清单验证即可。

在任何一款客户端（Codex / ZCode / Qoder / WorkBuddy）的聊天中都可这样开始（项目目录使用当前工作目录，主持方=当前聊天）：

> 使用 work-together，coordinator=当前聊天（如 zcode），executor=auto。先检查项目现状，把目标拆成互不重叠的任务包，写清文件归属和验收条件。按指定优先级选择可用的桌面执行器（自动排除主持方同族）；缺额度或不可用时自动切换，你持续跟进并独立验收，最后交付产物和证据。

该示例只授权项目任务协作，发布、推送等外部操作仍取决于用户的具体任务要求。

## 选择主持方与执行器

当前聊天负责管理与独立验收；默认 `engine=auto`。用户已授权在缺额度或不可用时按以下顺序切换，无需为同一策略重复询问。

| 顺序 | `engine` | 模型要求 |
|---|---|---|
| 1 | `zcode` | 精确 `GLM-5.3-FlashX`，不替换为 Flash |
| 2 | `qoder-global` | 国际版当前明确零费率的限时免费 DeepSeek |
| 3 | `qoder-cn` | 国内版当前明确零费率的限时免费 DeepSeek |
| 4 | `workbuddy-global` | 国际版当前明确零费率的限时免费 DeepSeek |
| 5 | `workbuddy-cn` | 国内版当前明确零费率、支持工具调用的模型 |

`workbuddy` 保留为 `workbuddy-global` 别名。显式 `engine` 从该项开始按表向后选择，`fallback=false` 才锁定单项；预检逐项记录不可用原因。每任务每候选最多尝试一次，耗尽后明确报告。Auto、空费率、未标价及付费模型均不能充当免费候选；不因所有候选失败而启用收费模型。限时免费以本次桌面元数据为准，不承诺永久免费。

执行中的任务只有确认原会话已停止，才可带已有产物、原会话 ID 和失败原因转交下一项。创建、派发或连接结果不明确时记 `unknown`，查询原会话，禁止自动重派。模型错误、超时和没回应本身不是停止证明。

计划顶层 `engine` 为默认值，任务可覆写 `engine`。主持方写入 `coordinator`（缺省 `codex`）：Codex 与五款桌面客户端（ZCode、Qoder 双区、WorkBuddy 双区）的聊天**都可以担任主持方**，在哪个聊天里运行本 skill，谁就是主持方；主持方不能把 Exec 指派给同族执行器（如 ZCode 主持时任务自动落到 Qoder/WorkBuddy）。主持方自己的桌面无需调试端口；启动脚本会自动跳过主持方同族桌面，防止重启杀掉协调会话。简单任务用单包；只有文件归属和依赖允许时才并行。旧 `executor=both` 表示 ZCode 与 WorkBuddy 国际版组合，不能写为 `plan.engine=both`。

## 环境与启动

需要 Node.js >=22，以及已安装并登录的候选桌面。桥使用版本相关的本机私有接口，不改桌面数据库或 app.asar，不复制模型密钥。应用可启动、模型可选、任务可执行是不同检查；不能把预检成功写成整套工作流通过。既往验证涵盖 ZCode 3.15.3 / WorkBuddy AI 5.7.6；新版本及 Qoder、WorkBuddy 国内版需按实际 `doctor` 与 smoke 结果报告。

- Windows：`scripts/start-desktops.ps1 -Engine auto` 按五级列表启动/复用；也可只选任一 engine。脚本自动读取当前目录 plan.json 的 `coordinator`（或用 `-Coordinator` 指定），**跳过主持方同族桌面**（主持聊天就运行在其中，重启会杀掉会话）；显式 `-Engine <单项>` 视为覆盖。`both` 兼容旧双客户端，`all` 等同启动列表 `auto`。多候选启动会继续检查其余项，最后汇总失败；它只准备桌面，不派发模型请求。路径参数见 [运行说明](references/operations.md)。
- 健康实例直接复用；缺调试端口的所选应用可能退出后重启。当前项目活跃任务及持锁主持方受保护；其他项目或人工会话需先检查，不能为预检中断活跃任务。仅用户明确允许中断后用 `-ForceRestart`，随后查询原会话恢复。
- macOS：实验性、未真机验证。先读 [macOS 清单](references/macos.md)，Bash 启动器目前仅支持旧 ZCode / WorkBuddy 国际版入口；五级 Windows 启动参数不适用于该脚本。

ZCode 默认权限为 `yolo`，Qoder 与 WorkBuddy 为 `bypassPermissions`。用户指定的权限设置应在执行器能力内尊重，完全访问不扩大业务授权。所有任务先检查当前模型报价；指定模型不可用或不满足免费策略时进入下一候选，`fallback=false` 则明确失败。

## 执行与验收

1. 先读现场、AGENTS.md、现有修改。将目标、输入、禁止修改边界、交付物、逐条验收条件和回退入口写入 `SPEC.md`。不覆盖用户已有 Spec。
2. 写 `PLAN.md` 及 `plan.json`：每包有唯一 id、prompt、files、acceptance、dependsOn；默认 concurrency=2。目录归属覆盖子目录，交叠包串行，依赖包必须等前置包经主持方验收、登记 verified 后启动。共享构建输出、依赖安装、Git index、锁文件分配唯一写入责任。混排不设通用顶层 model，避免跨工具误用。
3. 读 [运行说明](references/operations.md)，使用本 skill 的脚本连接**真实桌面会话**。先 `doctor` 检查候选，或 `doctor <执行器>` 单项检查；桌面登录不代表 API 或 CLI 已登录。派发后必须打开本次真实项目和目标 session，检查侧栏选中正确任务、正文出现本次任务包标记，并记录 `<包ID>.visibility.json`。仅有 sessionId、后台日志或旧测试会话截图不算桌面执行过程可见。脚本会自动定位，失败用 `open <包ID>` 修复原会话，禁止重新派发。接口不可用时按上述候选策略切换并记录原因，不伪造会话、不直接写桌面数据库。已派发但状态未知时禁止切换。首次本地调试适配需说明它是版本相关的私有桌面桥。
4. 在能承载后台进程的宿主中运行 `workflow.mjs run <plan.json>`，工作目录为项目根；Windows 隐藏窗口，stdout/stderr 重定向到 `.work-together` 或用户指定本地日志路径。headless 环境若会回收子进程，按运行说明交由可承载后台的调用方启动；不要反复绕过进程策略。主聊天仅报告状态变化、交付结果和人工决策。
5. 使用当前主持环境真实提供的计划工具（若有）同步任务；没有则维护 PLAN.md 的勾选项。定期读紧凑 status/watch，主会话在本轮保持跟进，独立工作完成后再收尾。skill 本身不能在主持方回合结束后主动唤醒聊天：只有配置了可用的宿主通知机制才能承诺跨回合自动汇报。
6. 状态包括 queued、running、needs_user、exec_done、verified、failed、unknown、blocked、cancelled。needs_user 时自动定位该会话并给出简短回顾卡：完成了什么、卡在哪里、具体需回答什么、项目绝对路径、会话标题/ID、下一步。普通轮询不抢用户当前选中的会话。通过执行器原生待办维护本包进度，不把主持方的总计划假称为外部工具原生全局计划。后台其他无依赖包可继续。
7. 业务问题或超出 Spec 的新操作仍需用户判断。审批模式下，已有明确授权且与 Spec 完全相符的操作可批准一次。失联/超时先查原会话，unknown 不重派；取消后确认停止再释放文件归属。恢复复用持久会话 ID，同项目只允许一个调度器；恢复前确认原 runner 已退出。主持方工具失联时，可由其他工具 `workflow.mjs takeover <执行器>` 接管：写入 coordinatorHistory，接管后的派发排除现任主持方同族执行器；由现任主持方**同族**执行且未验收的包默认拒绝自验，需 `verify <包ID> <证据> --self-review` 显式登记（记录 reviewer/selfReviewed），或交由其他工具/原主持方复核；`run --resume` 始终按初始主持方校验。
8. 网页或小程序需要截图时，把页面/路线、登录前提、截图尺寸、输出文件名与回填位置写入任务包，由所选执行器使用其实际可用的浏览器或桌面工具截图。记录来源与截图时间，并检查图片文件真实可打开、内容对应文章、最终文稿引用全部存在。截图失败列为缺口，不用生成图冒充产品界面。
9. Exec 结束仅记 exec_done。你逐项读取真实产物、检查 diff、独立运行适合改动的测试，必要时看截图/控制台/应用后台状态，证据映射到 Spec 条件。失败退回原会话修复。将独立验收记录交给 `verify` 命令；不能仅凭执行者“通过”结案。所有包 verified 后交付，更新 PLAN.md 并给出简洁总报告。

文件归属是协作约定，非操作系统隔离：真正相互冲突的构建/依赖/可变外部状态必须串行，或经用户接受后使用 worktree。不要承诺“同目录完全互不干扰”。发布、推送、发消息按当前用户授权范围处理。日志、截图、桌面会话、账号配置和密钥默认只留本地。

## 配套材料（按需读取，不用一次读完）

- **遇到问题**：按症状查 [references/faq.md](references/faq.md)——桌面不可见、verify 退出码 2、连接断开/unknown、headless 主持启动失败、模型费率判断等高频问题与反模式。
- **第一次使用**：通读 [references/walkthrough.md](references/walkthrough.md) 端到端样例（含一次真实的"模型请求 error → 退回原会话修复"支线）。
- **macOS 用户**：适配为实验性、未现场验证，先读 [references/macos.md](references/macos.md) 的边界与真机验证清单。
- **写计划**：拷贝 [examples/plan.example.json](examples/plan.example.json) 与 [examples/SPEC.template.md](examples/SPEC.template.md)。
- **命令速查与环境边界**：[references/operations.md](references/operations.md) 顶部速查表；包内导览见 [README.md](README.md)。
