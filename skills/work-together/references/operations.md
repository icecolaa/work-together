# 桌面运行协议

需要 Windows、Node.js >=22（原生 fetch/WebSocket），以及已安装并登录的候选执行器。v1.4.0 新增 Qoder 国际/国内版、WorkBuddy 国内版候选；历史桌面验证目标为 ZCode 3.15.3 / WorkBuddy AI 5.7.6，新候选按本机 doctor 和 smoke 的实际结果报告。macOS 为实验性，先读 [macos.md](macos.md)，使用其中的 Bash 启动方式。脚本从 CDP 主窗口调用现有 renderer 服务，不安装或复制模型密钥，不改 app.asar，不使用云端会话替代桌面。

## 命令速查

| 命令 | 用途 | 何时用 |
|---|---|---|
| `start-desktops.ps1 -Engine auto` | 按五级列表启动/复用桌面（可能重启缺调试端口的实例） | 每次开工前 |
| `workflow.mjs doctor [engine]` | 预检桌面桥与模型策略 | 启动后、排障时 |
| `workflow.mjs run plan.json` | 派发并调度全部任务包（后台长驻） | 计划就绪后 |
| `workflow.mjs run plan.json --resume` | 复用原会话恢复（先确认旧进程已退出） | 调度器意外退出后 |
| `workflow.mjs status` | 当前各包状态与可见性（JSON） | 随时轮询 |
| `workflow.mjs watch` | 实时输出状态变化 | 主持会话保持跟进时 |
| `workflow.mjs open <包ID>` | 重新定位桌面会话，修复显示 | 派发了但桌面没显示/选中错误 |
| `workflow.mjs verify <包ID> <证据文件>` | 登记独立验收证据，状态转 verified | 主持方核对完产物后 |
| `workflow.mjs cancel <包ID>` | 向原会话送停止请求 | 需要中断某包时 |

状态机：`queued → running → needs_user → exec_done → verified`；异常分支 `failed / unknown / blocked / cancelled`。unknown 不重派，先查原会话。遇到问题按症状查 [faq.md](faq.md)。

## 开始

直接执行启动脚本，无需先手动退出托盘里的应用：

```powershell
powershell -NoProfile -File <skill绝对路径>/scripts/start-desktops.ps1 -Engine auto
node <skill绝对路径>/scripts/workflow.mjs doctor
```

端口仅本机，安装路径可以逐项覆盖：

| 执行器 | 端口 | 路径参数 | 默认路径 |
|---|---|---|---|
| `zcode` | 19331 | `-ZCodePath` | `%LOCALAPPDATA%/Programs/ZCode/ZCode.exe` |
| `qoder-global` | 19333 | `-QoderGlobalPath` | `E:/Qoder/Qoder.exe` |
| `qoder-cn` | 19334 | `-QoderCNPath` | `E:/Qoder CN/Qoder CN.exe` |
| `workbuddy-global` | 19332 | `-WorkBuddyGlobalPath` | `E:/workbuddy/WorkBuddyAI/WorkBuddyAI.exe` |
| `workbuddy-cn` | 19335 | `-WorkBuddyCNPath` | `E:/workbuddyCN/WorkBuddy.exe` |

`-WorkBuddyPath` 和 engine `workbuddy` 保留为国际版兼容入口。`auto` / `all` 启动五款，`both` 只启动旧 ZCode + WorkBuddy 国际版。多客户端启动遇到一项失败会继续其余项，最后汇总并返回失败，不把部分成功声称为全部就绪。可只启动下一款具体 engine，避免无谓重启其他应用。

ZCode / Qoder 通过 `--remote-debugging-address=127.0.0.1 --remote-debugging-port=<端口>` 启动；WorkBuddy 两版使用启动进程环境变量 `WORKBUDDY_REMOTE_DEBUGGING_PORT`，随后恢复宿主原值。启动窗口为 Hidden。已开启端口且主页面属于所选安装目录的实例直接复用；否则先正常退出，默认等 5 秒，再仅终止同一安装路径的余留进程，重新启动后等待桥就绪。账号和本地会话文件保留。

启动前检查其他项目和人工会话：当前项目保护无法证明其他项目没有活跃任务，不得为了候选预检中断已有执行。已有健康国际版 WorkBuddy 无需为国内版预检重启。

若当前项目目录的调度记录显示该执行器仍有运行中任务，或该执行器正是当前主持方且调度器仍持锁，默认停止重启。用户明确要中断时可加 `-ForceRestart`，该参数也可用于重启已开启调试端口的实例。重启后先查询旧会话，按需要 `--resume`，不自动重派任务。`-GraceSeconds` 可调整正常退出等待时间，`-StartupTimeoutSeconds` 可调整启动超时。调试端口有本地应用控制能力，不转发、不暴露外网；使用后正常退出应用、普通方式重新打开即可关闭。升级导致私有桥变化时 doctor/run 必须明确失败，先修适配，不继续假报成功。

`plan.json`（files 是相对根目录的文件或目录；不使用 glob；任务包可单独指定 `engine`，缺省用顶层 engine）：

```json
{
  "coordinator": "codex",
  "engine": "auto",
  "concurrency": 2,
  "spec": "SPEC.md",
  "tasks": [
    {"id":"draft-a","title":"第一篇草稿","files":["drafts/a.md"],"dependsOn":[],"prompt":"按 Spec 写第一篇草稿，不发布。","acceptance":["文件非空，包含规定的十张图片引用"]},
    {"id":"draft-b","title":"第二篇草稿","engine":"workbuddy-global","files":["drafts/b.md"],"dependsOn":[],"prompt":"按 Spec 写第二篇草稿，不发布。","acceptance":["文件非空，包含规定的十张图片引用"]}
  ]
}
```

顶层 `coordinator` 声明主持方（缺省 codex）；不能把 Exec 派给同一主持工具。主持方自身无需调试端口，只有执行器需要。engine 缺省或 `auto` 按五级列表选择；显式 engine 从该项开始依次向后回退，`fallback=false` 锁定该项，适合逐项 smoke。任务可覆写 engine；混排/自动回退时避免顶层固定跨工具 model。`open`、`cancel` 和验收均使用该包当前实际执行器。

候选顺序与模型固定为：`zcode` 精确 `GLM-5.3-FlashX` → `qoder-global` 免费 DeepSeek → `qoder-cn` 免费 DeepSeek → `workbuddy-global` 免费 DeepSeek → `workbuddy-cn` 免费工具模型。后四项必须从当次桌面元数据确认明确零费率，Auto、未知、空费率和收费模型均被排除。无免费候选不启用最低付费选项。用户授权此顺序下的自动切换，无需重复确认。

预检失败可继续下一候选；每任务每候选最多尝试一次。创建/发送结果不明或失联记 `unknown`，不能重派。运行中发生不可用/额度失败，必须确认原会话进入终态并停止后，才可把原会话 ID、失败原因、已有产物和剩余任务交给下一项；错误文本不是停止证明。所有候选耗尽后保留证据并报告。

在项目根目录运行；脚本路径可以在已安装 skill 目录：

```powershell
New-Item -ItemType Directory -Force .work-together | Out-Null
$runner='C:/Users/你的用户名/.codex/skills/work-together/scripts/workflow.mjs'
Start-Process node -ArgumentList @($runner,'run','plan.json') -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput '.work-together/runner.out.log' -RedirectStandardError '.work-together/runner.err.log'
node $runner status
node $runner watch
node $runner open draft-a
node $runner verify draft-a .work-together/draft-a.verification.md
```

含空格的参数在 PowerShell Start-Process 中需显式加双引号；推荐使用绝对无空格 runner 路径或由调用方正确引用。状态文件 `.work-together/state.json`，简洁看板 `STATUS.md`，每包日志 `<id>.jsonl`，介入卡 `<id>.review.md`。不要将该目录推送远程。`watch` 在当前工具调用存续时实时输出变化；宿主需持续读取才能自动带回当前主持会话。

headless 主持（如 `codex exec`、WorkBuddy 命令沙箱）无法承载长驻调度器：前者回收分离子进程，后者在策略层拦截 WMI/Start-Process 进程创建。此场景由调用方（用户或其他宿主会话）按上方命令启动调度器，主持会话只负责 Spec/Plan、监控轮询与独立验收。WorkBuddy 沙箱的后台任务机制可以另起调度器，但会与已有实例在 runner.lock 上冲突（单调度器约束）；本机经 MSYS 调用时 `Start-Process -WindowStyle Hidden` 会以退出码 127 静默失败，分离启动可用 WMI `Win32_Process.Create`。

## 桌面查看与介入

派发后脚本自动打开当前项目并选择对应任务，不再要求用户从旧项目里自行寻找。ZCode 使用当前安装的 ZCode.exe `--open-workspace <项目绝对路径>` 和真实会话导航状态；WorkBuddy 使用原生会话路由。侧栏标题前缀随主持方显示为 `[Codex/包ID]`、`[ZCode/包ID]` 或 `[WorkBuddy/包ID]`，正文应出现 `协作任务包：包ID`。两者都确认后记录 `.work-together/<包ID>.visibility.json`。未确认则明确报告，`verify` 会阻断；任务可能已在运行，不能为了显示问题重复派发。

已有任务显示在错误项目、旧 smoke-zcode 会话或侧栏收起时，在**实际任务项目根目录**执行 `node <runner绝对路径> open <包ID>`。命令只打开已有会话，不发送新消息、不重建会话，不影响原调度进程。该项目必须已有 `.work-together/state.json` 和 sessionId。普通轮询不切屏，派发和首次 needs_user 自动定位；用户仍可在侧栏切换并行任务。

权限/提问用桌面原生回答，调度器会继续轮询。不会自动绕过审批；主代理可对用户已明确授权且逐项核对一致的操作批准一次。介入卡只是状态概括，过期文件以 state.json 为准。执行结果只汇总简短文本；完整过程保留在各执行器会话与本地快照中。

## 恢复、取消、回退

```powershell
node $runner cancel draft-a
node $runner run plan.json --resume
```

同目录只允许一个调度器；意外退出保留锁，`--resume` 先确认旧进程已退出并复用已有 sessionId。创建/派发期间失联结果可能未知，缺少会话 ID 时必须到桌面查找，不得再创建一份。调度器不删除原会话、不做 git reset、不清理用户修改。每轮新任务先把 `.work-together` 归档到用户指定位置，再新建状态。回退使用开始前的 diff/备份，只处理该包拥有的文件。

依赖包等前置包 verified；主持方尚未复核时 `run` 会继续驻留。`verify` 仅记录人工/主代理提供的证据路径，并不自动证明内容真实；主代理必须实际检查。运行前保存文件指纹，收口和验收时检测归属范围外的新增、修改和删除；发现后阻断验收，退出码为 2，不自动回退。这是事后检测，不是写入拦截。证据与运行日志放 `.work-together`，避免被当作执行包的越界写入。

ZCode 默认 `mode=yolo`（完全访问）、`model=GLM-5.3-FlashX`；每次发送都明确指定模型，并检查当前桌面供应商目录。WorkBuddy 默认 `permissionMode=bypassPermissions`；国际版仅接受明确零费率 DeepSeek，国内版接受明确零费率工具模型。Qoder 两版也只接受当次目录证明免费的 DeepSeek，并使用桥实际支持的权限模式。费率属于本次选择证据，不保证未来仍免费。

权限覆盖须由适配器支持；模型覆盖也不能绕过免费候选规则。设置作用于新建协作会话，不改其他项目全局配置。执行者不得写 `.workbuddy-ai/memory`、`MEMORY.md` 等共享文件；共享日志由主持方统一写。文件指纹读取项目普通文件，大型目录可能较慢。

## 网页与小程序截图

截图包应列出真实页面、打开步骤、必要的登录状态、尺寸、输出路径及文章回填位置。由实际可用的执行器工具操作浏览器或小程序界面并截图；本 Skill 负责调度，不假定每款助手都具备相同的截图能力。记录页面来源、截图时间、结果路径；无法打开或登录时明确列缺口。

验收需要同时检查图片真实可打开、界面与文章主张相符、文稿已引用所有必需截图、最终 HTML/文档中的图片可渲染。文件数量满足不代表截图完整，不能用生成图代替应有的产品截图。
