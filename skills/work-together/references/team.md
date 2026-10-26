# 本地 team 模式（v1.7.0）

用于自动拆分、多 agent 分配/认领、共享发现、独立 worktree 和统一集成。默认本地运行，无须 Mattermost、Gitea 或额外数据库服务器。v1.8.0 可选开启 [Gitee Issue/PR 同步](gitee.md)，仅该显式同步命令发布已验收的专用分支；普通 run/collect 不自动推送。

把它理解为老板在本机带多名员工干活：老板分工并验收，每名员工在自己的桌面会话和文件工位工作，通过本地消息箱分享发现。**新手或没有 Gitee 账号时，直接使用本页本地流程即可**，不需要添加 Gitee、不需要它的 API 令牌，也不需要聊天平台。下文的 Git 是本机版本管理工具，不等于需要注册 Gitee。

## 配置与启动

给新手讲解时，先说「老板准备订单和排班表，员工分头干活，老板检查后装箱」，再按需解释下面的命令。用户只需给出目标；本节的配置和命令由主持 AI 根据项目准备并执行，缺少安装、登录或业务信息时再引导用户处理。

例如让甲做帮助页、乙写使用说明，两份文件互不重叠，可以同时开工；丙要根据两人的成果更新导航，就等前两件活通过检查并汇总后再开工。老板最后实际打开页面、检查链接和说明，并运行配置的检查。这只是讲解例子，不是新的实测记录。

要求 Node >=22.13（内置 node:sqlite）、Git、已登录且有调试桥的桌面客户端。旧 workflow 的状态目录和 team 不能混用；先验收旧任务、确认会话停止，再归档旧 .work-together。不要通过删除活跃运行记录强行重跑。

目标项目需要是 Git 仓库根目录、已有提交且基线干净。需要共享的源代码、Spec、检查脚本先提交；私有未提交内容不会自动进入工作树。初始化只创建忽略目录下的配置，不启动桌面：

```powershell
$team = '<skill>/scripts/team.mjs'
node $team init
# 编辑 .work-together/team.config.json；也可参考 examples/team.config.example.json
node $team plan SPEC.md
# 桌面规划超时或连接结果未知时，只查原会话：
node $team plan SPEC.md --resume
node $team run
```

plan 使用当前可用的免费模型策略，由桌面返回 JSON 任务图，校验 scope、路径/链接、依赖环、验收、任务数和能力要求，再保存 .work-together/team/plan.json。规划会话及受理结果持久保存，恢复不重复发请求。规划器不准修改文件；工作树变化会阻断接纳。没有可用桌面时明确失败，亦可由主持方手写包含 tasks 的完整计划 JSON，交给 run。

team 使用独立常驻进程。Windows 可由支持后台进程的宿主隐藏启动：

```powershell
$team = 'C:/Users/lenovo/.codex/skills/work-together/scripts/team.mjs'
Start-Process node -ArgumentList @($team,'run') -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput '.work-together/team.out.log' -RedirectStandardError '.work-together/team.err.log'
node $team status
node $team watch
```

已有明确运行记录时用 run --resume；--once 只做一轮调度/观测后退出，供维护或诊断使用，不表示任务完成。stop 只停止调度/监控，不取消桌面会话；需要中断任务时用 cancel 并确认停止。聊天回合结束不等于后台进程已启动，宿主若回收子进程需按实际能力安排，不能承诺自动唤醒聊天。

## agent、容量与认领

- engine 为客户端类型；agent id 为逻辑实例；每项任务拥有独立 attemptId、claimToken、原生 sessionId。一个 engine 可配置多个 agent，也可把 agent capacity 设置为 1..4；必须先验证客户端实际并发容量。
- concurrency 为全局上限（1..4）。balanced 优先空闲容量，priority 优先原候选顺序；claim 模式只执行已显式认领的任务。agentId 可固定任务队列，requires 匹配 capabilities。
- scope 是允许的相对目录/文件，不接受仓库根目录、.git 和 .work-together 作为任务归属。maxTasks 为总任务上限（1..100）；父子层级不超过 8 层。
- 接受旧任务字段 id/prompt/files/acceptance/dependsOn/engine；禁止同族执行、免费模型限制及未知结果不重派继续有效。fallback=false 只允许锁定候选。

```powershell
node $team claim zcode-01 task-a
# 省略任务 ID，原子认领该 agent 的第一个可执行任务
node $team claim zcode-01
```

依赖必须 merged 后才启动，新工作树从最新集成分支创建；同一归属仍保守串行，避免语义/契约冲突。每个任务独立 worktree，不代表 OS 沙箱，也不隔离共享数据库、外部端口或全局依赖；这些资源仍需在 Spec 中指定唯一写入者。

## 消息、上下文与追加任务

任务开始时注入最近消息快照（最多约 24000 字符）和 Spec，执行提示词附带 inbox/report/propose 命令。agent 在开始及重要检查点读消息，保存最大 seq 后用 --after 增量读取；不会把消息强行插入执行中的桌面回合。需要更早上下文时用 inbox 分页读取。最新 Spec 和任务上下文以持久运行快照为准，不在运行中静默替换。

主持方发送消息：

```powershell
# decision.json: {"id":"decision-001","kind":"decision","body":{"text":"接口采用 v2","evidence":"SPEC.md"}}
node $team message zcode-01 decision.json
node $team message '*' decision.json
node $team inbox zcode-01 --after 0
```

同一消息 id 必须对应相同内容/接收者；重试使用相同 id 可去重。每次最多返回 100 条，继续用最后 seq 读取下一页。finding/help/decision/message 都是资料，普通消息不会被直接执行为 shell 命令。

agent 在自身工作树 .work-together/report.json 写入 {"id":"可选幂等键","kind":"finding","recipient":"*","body":{"text":"发现","evidence":"路径/测试证据"}}，再执行提示词提供的 report 命令。认领令牌只接受活跃且未过期的任务，过期尝试不能报告结果。共享消息与数据库只留本地，不提交公开仓库。

```powershell
node $team --root '<原项目根>' report <claimToken> .work-together/report.json
# 主持方追加：JSON 为 {"tasks":[...]}，保留原任务和计划哈希
node $team append additional-tasks.json
# agent 自主提议后续任务（也使用 {"tasks":[...]}）
node $team --root '<原项目根>' propose <claimToken> .work-together/additional-tasks.json
```

自主提议要求显式 scope，自动附加父任务及依赖，完成并集成父任务后才放行，不替换正在执行的工作。超范围、重复 ID、依赖环或超预算会整体回滚。该功能是有边界的后续任务提议，尚未提供任意递归重写现有任务图。

## 独立验收与一键汇总

把这里看作「检查交货，再装箱」：`exec_done` 是员工交货，`verified` 是老板检查通过，`merged` 是合格成果已放入本地汇总箱。装箱后的组合还要检查；如果出问题就保留现场修复。箱子留在本机，不代表已经交到 Gitee 或发布给用户。

执行者停止且交回后，控制器检查本包归属并创建本地任务提交，标记 exec_done。主持方读取真实产物、原生待办、差异和必要测试，写独立证据；verify 会再运行配置的 checks 并绑定精确提交。checks 用 {command,args,timeoutMs}，不接受 shell 字符串或 .cmd/.bat；Windows 的 npm.cmd 请改为 node 加脚本绝对路径。未配置 checks 时只记录未自动执行检查，不能声称已通过测试。

```powershell
node $team open task-a
node $team verify task-a .work-together/task-a.review.md
node $team collect
```

collect 串行把已 verified 的任务合并到隔离候选 worktree、运行团队检查，成功后才快进本地集成分支。任务源码或候选提交变化会阻断旧验收；集成目标变化自动作废旧候选并重新测试。冲突和测试失败保留候选目录及原因，不覆盖主工作区。状态分开显示 exec_done、verified、integrating、merged。

主持方验收发现问题时，用 revise 创建新的修复尝试，保留旧产物、原会话和历史，撤销该任务旧验收；只能修订未集成的 exec_done/verified，不更换文件归属或验收条件。修复后必须重新 verify/collect：

```powershell
node $team revise task-a .work-together/correction.md
```

status 返回 agent 当前任务、显式队列、容量、最近桌面响应、问题及任务状态；文件版在 .work-together/team/STATUS.md。最近响应来自桌面快照，不代表 agent 自行发出的心跳。未知任务继续占用其归属/容量，其他健康任务可继续。

全部集成后，主持方审查 status 给出的 codex/team-* 分支。在主工作区干净、目标未分叉时可 git merge --ff-only <集成分支>，再按用户授权走现有 Gitee/GitHub 推送流程。collect 本身不会改主工作目录、推送或创建 PR。

## 故障恢复与边界

- SQLite 是任务/消息的唯一状态来源；.work-together/state.json 是兼容启动保护的投影，禁止手工编辑投影代替更新数据库。数据库不放 Git，也不作为跨机器共享文件。
- 同目录只有一个 runner，团队进程与旧 workflow 共用锁。断线/受理应答丢失保留原 session 查询，绝不自动创建第二次；工作区操作另有串行锁。
- unknown 有原会话时先 open/cancel；取消必须确认停止。无会话 ID 或接口失联时，独立检查原生会话/进程，确认停止并写证据，再用 abandon。仅有超时不能作为停止证据。

```powershell
node $team cancel task-a
# 只有已独立确认停止的 unknown 才可执行：
node $team abandon task-a .work-together/stopped.md
node $team retry task-a
node $team run --resume
```

retry 保留旧工作树及记录，在新尝试中携带本包允许的部分产物；若集成基线已改变同一路径，则阻断自动复制，需人工解决。旧令牌不能更新新尝试。独立验收后发生的改动不会自动继续执行，需主持方明确修复安排。

当前 team 的多机通信、聊天推送、任意动态重规划和主持方切换命令尚未提供；旧 workflow 的 takeover 仍用于旧模式。Gitee 自动化需单独初始化并运行 sync/watch，见 [接入说明](gitee.md)。桌面 API 是版本相关私有桥，多 worktree/并发和 macOS 需按实际平台验证。测试中的模拟适配器不能替代真实桌面验证，具体证据见项目 docs。
