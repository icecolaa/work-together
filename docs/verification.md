# 现场验证记录

日期：2026-10-15，Windows，Node.js v26.5.1。

| 检查项 | 结果 | 证据 |
|---|---|---|
| ZCode 3.15.3 桌面接入 | 通过 | 本机 renderer 桥创建真实会话，返回 ZCODE_CONNECTED |
| WorkBuddy AI 5.7.6 桌面接入 | 通过 | 本机桌面 SDK 创建真实会话，返回 WORKBUDDY_CONNECTED |
| ZCode 同目录两个包后台并发 | 通过 | alpha/beta 执行区间重叠 125831 ms |
| WorkBuddy 同目录两个包后台并发 | 通过 | 修订后 alpha/beta 执行区间重叠 52232 ms |
| Codex 独立验证四个产物 | 通过 | Node assert 严格按字节匹配 ALPHA_OK\n、BETA_OK\n |
| 原生待办 | 通过 | ZCode 会话 Todo，WorkBuddy TaskCreate/TaskUpdate 均在真实工具记录中 |
| 审批和回顾卡 | 通过 | ZCode Write 审批形成 needs_user 和 review.md；核对已授权测试写入后仅批准一次 |
| 桌面过程可见 | 通过 | ZCode smoke-zcode 项目、WorkBuddy smoke-workbuddy-v2 空间可见任务和执行过程；截图仅留本地 |
| 归属外变更检查 | 通过 | 首轮 WorkBuddy 多写共享记忆，补约束和检测后重测，boundaryViolations=[] |
| skill frontmatter 校验 | 通过 | 官方 quick_validate.py：Skill is valid! |
| 本地安装 | 通过 | skill 复制至用户 .codex/skills/work-together，逐文件内容一致 |
| 双远程 | 通过 | GitHub/Gitee 均公开，首轮 main 提交 SHA 与本地一致；origin 的 push 地址顺序为 Gitee、GitHub |

本地原始证据位于 `.local/smoke-zcode/.work-together`、`.local/smoke-workbuddy-v2/.work-together` 和 `.local/proofs`，均被 Git 忽略。首轮 WorkBuddy 的共享记忆违规样本保留在 `.local/smoke-workbuddy`，未将该轮标为全部验收通过。最终两轮均由 Codex 记录 verified。

自动化测试覆盖文件重叠、大小写/目录归属、越界链接、依赖环/重复 ID、审批/错误/完成状态、未声明记忆写入/文件删除和内部链接别名。脚本没有宣称操作系统级隔离，也没有修改两款应用的安装包或桌面数据库。

## 来源与能力范围

参考了 [Codex 官方长任务说明](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex)、[ZCode 官方文档](https://zcode.z.ai/cn/docs/welcome) 与 [WorkBuddy 官方 ACP 说明](https://www.workbuddy.ai/docs/zh/cli/acp)。具体适配以本机已安装版本的真实桌面桥为准，未把 CodeBuddy CLI 会话等同于 WorkBuddy 桌面会话。

[用户提供的微信文章](https://mp.weixin.qq.com/s/KeQmHzdWDY53cfDBZj81lA)在网页读取时失败，直接请求返回环境验证页，未取得正文，不能声称已从文章补齐功能。

当前支持当前 Codex 回合内持续汇总，后台进程保留状态；Codex 回合结束后的自动唤醒需要宿主另外提供通知/自动化能力。待办在各执行器原生会话内显示，总计划在 PLAN.md 和 STATUS.md 更新，未实现 Codex 原生界面组件替换。取消、故障恢复提供了命令和持久会话 ID，但本轮没有对正在运行的真实模型任务做破坏性断线演练。

远程入口：[GitHub](https://github.com/icecolaa/work-together)、[Gitee](https://gitee.com/ice-colaa/work-together)。GitHub 的初次 Git TLS 连接失败，切换为 Windows schannel 后成功；此设置仅写入本仓库 Git 配置。Gitee 不允许空仓库改为公开，首次推送后才设置公开并重新查询确认。

## v0.2：桌面可见性与默认配置修复

现场原因：后端创建/派发了真实会话，但桌面仍停留在旧 smoke 项目，原脚本没有导航项目与选中目标任务。现改为派发后自动打开真实项目和 session，检查选中状态及任务包正文标记，并保存独立 visibility.json；显示失败不重复发消息，需 open 修复，verify 会检查可见性证据。首次 needs_user 也会自动定位，普通轮询不抢用户当前选择。

新增真实测试：ZCode 用 GLM-5.3-Flash、yolo 完成原生 Todo 和 result.md 写入；WorkBuddy 用模型列表标为 x0.00 的 Step-5-Preview、bypassPermissions 完成原生待办和相同写入。两份文件由 Codex 按字节检查为 VISIBLE_OK 加一个换行，归属外变更均为空。另验证 ZCode 新建空会话时即绑定 Flash 与完全访问，避免输入框沿用旧模型。模型初始化测试发现 Flash 必须显式附带 reasoningLevel，已沿用界面原有 max 设置；未在失败后擅自切换普通版模型。

新增回归覆盖：旧 smoke 被选中不算新任务可见、正文未加载不能通过、项目/session/正文共同确认、已受理消息后的重命名错误不重复执行、创建时绑定模型配置、零费率优先和收费区域同名模型区分、调度器退出时验收落盘的竞争，共 17 项测试全部通过。WorkBuddy 首轮多写了一个 LF，Codex 严格验收发现后退回原 session，以独立请求 ID 发送修正，再次逐字节验收通过；避免复用首轮请求 ID 导致修正轮被缓存吞掉。截图与模型/权限快照仅保存在本地 `.local/proofs`。

## v0.2.1：自动退出并重启桌面应用

2026-10-17 在 Windows PowerShell 5.1 运行 `start-desktops.ps1 -Engine both`：ZCode 与 WorkBuddy 均从未开放调试端口的运行实例自动关闭窗口，等待后终止同一安装路径的剩余托盘进程，再重启并通过桌面页面就绪检测。重复运行时两者均直接复用，未再次重启。随后两个 doctor 均通过：ZCode 为 GLM-5.3-Flash/yolo，WorkBuddy 为列表零费率 Step-5-Preview/bypassPermissions。

真实检测发现 Windows PowerShell 5.1 的 JSON 数组包装及 .NET Framework 对 file URL 查询参数的解析差异，已修复并加入回归。`npm test` 共 18 项通过，其中启动生命周期包含 11 个独立场景，覆盖健康复用、自动重启、托盘退出回退、按安装路径筛选、当前项目运行任务保护、显式强制重启、超时及页面身份检查；该组在 PowerShell 7 和 Windows PowerShell 5.1 均通过。skill 官方校验通过。运行任务保护与强制中断使用模拟测试，未中断真实模型任务；保护范围是启动脚本所在项目的协作记录。

## v0.3：提示词选择协作组合与逐包混排

2026-10-18：提示词/skill 支持 `executor=zcode|workbuddy|both`；plan.json 逐包可写 `engine`（顶层 engine 为缺省），调度器按包连接对应桌面并分别解析模型策略，`open`/`cancel`/验收按各包执行器路由，启动保护改为按任务级引擎判断（旧 state 无逐包引擎时回退顶层 engine）。自动化测试覆盖逐包 engine 校验（合法/非法值）与混排计划的启动保护（workbuddy 包运行中只阻断 workbuddy 重启、不误伤 zcode），共 19 项测试在 PowerShell 7 与 5.1 双通道通过。现场验收于同日完成（见「v0.3/v0.4 现场验收」节），现有单引擎计划的命令与状态文件格式保持兼容。

## v0.4：主持方可为 ZCode 或 WorkBuddy

2026-10-18：plan.json 顶层 `coordinator`（codex|zcode|workbuddy，缺省 codex）声明主持方——运行 skill、负责 Spec/Plan/Verify 的聊天所在的工具。调度器拒绝 engine 与主持方相同的任务包（Exec 必须指派其他工具），会话标题与派发提示词改用主持方名称，恢复校验加入主持方一致性，STATUS.md 显示主持方。启动保护新增主持方规则：主持方为 ZCode/WorkBuddy 且调度器持锁时该应用不可被自动重启（重启会杀死主持会话与调度器），执行器应用仍按任务级引擎与活跃状态判断。自动化测试覆盖 coordinator 校验（自指派被拒、跨工具合法、缺省 codex）与主持方应用保护（驻留期仍保护主持方、不误保护无活跃任务的执行器），共 20 项测试在 PowerShell 7 与 5.1 双通道通过。主持方=ZCode 的完整现场流程已于同日验收（见下节）；主持方=WorkBuddy 未单独跑现场（其机制与 ZCode 主持完全对称：同一调度器、对称的校验与保护测试均已覆盖），Codex 主持路径行为不变，旧 state 缺 coordinator 时按 codex 处理。

## v0.3/v0.4 现场验收（2026-10-18）

**验收一：主持方=ZCode，执行器=WorkBuddy（`.local/smoke-coordinator-zcode`）**。本 ZCode 会话作为主持方写 SPEC/plan（coordinator=zcode），调度器派发两包到 WorkBuddy 桌面；两包 visibility confirmed、原生待办产生；执行中两包均遭遇 step-5-preview 模型请求瞬时 error，按 skill 流程**退回原会话修复**（独立请求 ID wt-fix-*，未重派），恢复后产物逐字节验收（31B/36B，Buffer.equals 通过），双包 verified、boundaryViolations=[]。同步验证了归属门：主持方迟写入的脚本先被拦（退出码 2），移入 .work-together 后放行。

**验收二：双执行器混排，主持方=Codex CLI（`.local/smoke-mixed`）**。SPEC/plan 由 ZCode 会话代拟（模拟用户输入，coordinator=codex），`codex exec` 作为主持方完成：doctor 双桥预检 → 监控轮询 → 独立逐字节验收（zcode-side.txt 15B、workbuddy-side.txt 19B）→ 原生待办核对（ZCode Todo 4 条、WorkBuddy TaskCreate/TaskUpdate 3 条）→ 证据落盘 → 两次 verify → 最终 status 双包 verified。调度器输出逐引擎模型策略 `{zcode:…Flash/yolo, workbuddy:step-5-preview…}`。现场缺口就此关闭；zcode-side.txt 为首轮被取消运行的残留，第二轮 ZCode 执行者按回退条款逐字节核验后保持原样交付。

**现场新踩坑（已可复现）**：
1. `codex exec` 的命令沙箱会回收分离子进程：Start-Process 与 WMI Win32_Process.Create（ReturnCode=0）启动的调度器均在命令结束后消失——headless codex 不能承载长驻调度器，启动须由调用方或交互式宿主执行（operations.md 的既有设计得到实证）；`codex exec resume` 也不接受 `-C`。
2. 本机经 MSYS/codex 环境调用时，任何 PowerShell 的 `Start-Process -WindowStyle Hidden` 都以退出码 127 静默失败（最小矩阵定位到 -WindowStyle 参数）；分离启动改用 WMI `Win32_Process.Create` 或宿主后台进程承载。
3. 归属指纹门对主持方自己的迟写入文件同样生效——用户侧材料应在调度器启动前就位或放 `.work-together`。
4. `codex exec` 模型端点当晚多次超时重试（最多 5 次），两轮 resume 均自行恢复，未丢操作。
