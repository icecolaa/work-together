# 桌面运行协议

已验证环境为 Windows、Node.js >=22（原生 fetch/WebSocket），以及已安装并登录的所选执行器 ZCode / WorkBuddy。当前适配验证目标：ZCode 3.15.3（内置 CLI 0.16.9）、WorkBuddy AI 5.7.6。macOS 为实验性，先读 [macos.md](macos.md)，使用其中的 Bash 启动方式。脚本从 CDP 主窗口调用现有 renderer 服务，不安装或复制模型密钥，不改 app.asar，不使用云端会话替代桌面。

## 命令速查

| 命令 | 用途 | 何时用 |
|---|---|---|
| `start-desktops.ps1 -Engine both` | 启动/复用两款桌面（自动重启未开调试端口的实例） | 每次开工前 |
| `workflow.mjs doctor [zcode\|workbuddy]` | 预检桌面桥与模型策略 | 启动后、排障时 |
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
powershell -NoProfile -File <skill绝对路径>/scripts/start-desktops.ps1 -Engine both
node <skill绝对路径>/scripts/workflow.mjs doctor zcode
```

端口仅本机：ZCode=19331，WorkBuddy=19332。WorkBuddy 路径可用 `-WorkBuddyPath` 覆盖，ZCode 用 `-ZCodePath`。已经开启调试端口的实例直接复用；未开启端口的实例由脚本先关闭窗口，等待默认 5 秒，托盘或后台进程仍未退出时自动终止同一安装路径的剩余进程，再重新启动并等待桌面会话就绪。应用配置、账号与本地会话文件保留。脚本只关闭所选执行器，不要求用户逐次手动退出。

若当前项目目录的调度记录显示该执行器仍有运行中任务，或该执行器正是当前主持方且调度器仍持锁，默认停止重启。用户明确要中断时可加 `-ForceRestart`，该参数也可用于重启已开启调试端口的实例。重启后先查询旧会话，按需要 `--resume`，不自动重派任务。`-GraceSeconds` 可调整正常退出等待时间，`-StartupTimeoutSeconds` 可调整启动超时。调试端口有本地应用控制能力，不转发、不暴露外网；使用后正常退出应用、普通方式重新打开即可关闭。升级导致私有桥变化时 doctor/run 必须明确失败，先修适配，不继续假报成功。

`plan.json`（files 是相对根目录的文件或目录；不使用 glob；任务包可单独指定 `engine`，缺省用顶层 engine）：

```json
{
  "coordinator": "codex",
  "engine": "zcode",
  "concurrency": 2,
  "spec": "SPEC.md",
  "tasks": [
    {"id":"draft-a","title":"第一篇草稿","files":["drafts/a.md"],"dependsOn":[],"prompt":"按 Spec 写第一篇草稿，不发布。","acceptance":["文件非空，包含规定的十张图片引用"]},
    {"id":"draft-b","title":"第二篇草稿","engine":"workbuddy","files":["drafts/b.md"],"dependsOn":[],"prompt":"按 Spec 写第二篇草稿，不发布。","acceptance":["文件非空，包含规定的十张图片引用"]}
  ]
}
```

顶层 `coordinator`（codex|zcode|workbuddy，缺省 codex）声明主持方——运行本 skill、负责 Spec/Plan/Verify 的聊天所在的工具；调度器拒绝 engine 与主持方相同的任务包，Exec 必须指派其他工具。主持方自身的桌面无需调试端口，只有执行器桌面需要。调度器按各包 engine 连接对应桌面；`open`、`cancel` 和验收自动使用该包自己的执行器。多款工具同时参与时，不同执行器的包在同一目录同样受文件归属与并发约束；顶层 `model`/`mode`/`permissionMode` 会应用到所有参与的执行器，混排计划建议不设顶层 `model`，让各工具使用默认模型。

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

ZCode 默认 `mode=yolo`（完全访问）、`model=GLM-5.3-Flash`；每次发送都明确指定模型，且从当前桌面供应商目录检查其可用性。WorkBuddy 默认 `permissionMode=bypassPermissions`（允许完全访问），模型按本机 `wb.models.list()` 的 credits 动态选：优先零费率，若无则选最低已知费率并报告；Auto/空费率不能据此视为免费。零费率同档优先 Step-5-Preview、Deepseek-V4.1-Flash、Hy3，仅在列表显示该模型费率为零时适用。服务方计费信息可能变化，记录的是本次选择时的桌面报价，不保证永久免费。

可在 plan.json 顶层明确覆盖 `model`、ZCode 的 `mode`、WorkBuddy 的 `permissionMode`。例如 ZCode 的 `{"engine":"zcode","model":"GLM-5.3-Flash","mode":"yolo",...}`。这些设置应用于新建协作会话，不修改所有项目的全局配置，不打断已有任务。共享工作日志/记忆需由主持方统一写，执行者不得写 `.workbuddy-ai/memory` 等共享文件。并发同目录不能隔离全局安装、端口、数据库、生成目录；计划者要避免这些冲突。首次启动的文件指纹会读取项目普通文件，大型目录的启动检查可能较慢。
