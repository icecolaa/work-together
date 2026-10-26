# Gitee Issue / PR 同步（v1.8.0）

用于已初始化的 team 项目：每个任务一个 Issue，整轮已验收集成成果一个团队 PR。现有 tasks、scope、独立验收和本地消息继续使用。Gitee 不承担任务互斥或执行状态仲裁，不需要 Mattermost、额外数据库服务器或公网回调。

**这是可选扩展，新手可以跳过。** 老板和员工在本地就能分工、交流、验收并汇总成果，不需要 Gitee 账号。需要把团队的任务卡放到网上、把验收成果交给仓库评审时，再把 Gitee 当作线上任务清单和交付窗口接入；本地流程见 [团队模式说明](team.md)。

## 初始化与预检

```powershell
$team = 'C:/Users/lenovo/.codex/skills/work-together/scripts/team.mjs'
node $team gitee init
node $team gitee doctor
node $team gitee plan
# 同样可以预览：
node $team gitee sync --dry-run
```

init 从 origin 的全部 push URL 中识别唯一 Gitee 仓库（支持 HTTPS、SSH）；GitHub 镜像 URL 不会被选为 Gitee 推送目标。API 查询仓库默认分支后保存 .work-together/gitee.json。可提供 examples/gitee.config.example.json 格式的文件：gitee init config.json。配置已存在时不覆盖。

API 令牌从 tokenEnv 指定的环境变量读取，默认优先现有 GITEE_OPEN_API，否则 GITEE_ACCESS_TOKEN；配置文件只存变量名，禁止存令牌或自定义 API 主机。doctor 检查认证账号、目标仓库、基线 SHA、Issue/PR 开关，不自动开启功能或扩大令牌权限。

API 身份和 Git 推送凭据分开：API 使用 Bearer header，不把令牌放 URL；Git 沿用现有 credential helper/SSH 以外的 HTTPS 推送凭据配置。本实现向固定 Gitee HTTPS 地址推送，不把 API 令牌拼进 Git URL。推送不会弹出交互登录，缺凭据时明确失败。

plan/dry-run 不需要令牌、不创建远程对象、不绑定远程映射；显示会公开的任务标题、归属、验收与提交。不会上传 Spec 全文、原生 sessionId、认领令牌、消息原文、本地绝对路径或完整验收日志。目标仓库本身可以是公开仓库，用户应按项目要求选择内容。

## 同步与自动化

```powershell
node $team gitee sync
# 仅同步任务 Issue，不发布分支/PR：
node $team gitee sync --issues-only
# 单独常驻观察，可与 team run 同时运行：
node $team gitee watch --interval 60
node $team gitee status
```

watch 默认每 60 秒一轮，interval 支持 15..3600 秒；--once 只运行一轮。Ctrl+C 停止 Gitee 监控，不停止桌面任务；team stop 也不代替停止独立 Gitee watch。后台启动沿用 team.md 中隐藏窗口与日志重定向方式，命令参数改为 gitee watch。

| 本地情况 | 远程行为 |
|---|---|
| 任务 queued | 创建/更新对应 Issue 为 open |
| running、needs_user、unknown、exec_done、verified、本地 merged 等 | Issue 为 progressing，正文写明本地状态；错误或未知不会伪装为完成 |
| 全部任务 merged，验证 SHA 与产物匹配 | 推送专用 codex/team-<run>-gitee-<轮次> 分支，创建/更新一个团队 PR |
| PR 未合并 | 不关闭任务 Issue，不改本地验收状态 |
| PR 确认 merged，远程 head 与记录的发布 SHA 一致 | 关闭此 PR 快照内、当前任务验收提交仍匹配的 Issue |
| PR 人工关闭未合并 | 保留关闭状态，不重开或重复提单 |
| Issue 人工 closed/rejected | 保留人工终态，不自动重开；不据此停止本地任务 |
| 一轮 PR 已合并，后来新增并集成任务 | 新建下一发布轮次及独立分支/PR；旧 PR 不会关闭新增任务 Issue |

依赖信息通过 Issue 链接汇总，任务图顺序导致的初次缺失链接在后续同步补齐。人工文字保留在管理区块外；若管理标记被删除或改坏，停止覆盖。标题不反复覆盖人工修改。

发布要求全部任务已有独立验收且本地集成完毕，当前集成 HEAD 必须是调度器登记的集成提交；未经登记的提交、交回后变化的任务产物或错误分支都会阻断。只推送本次专用分支，无 force，无 main 推送。远程目标基线变动仍需仓库评审/CI，本实现不调用远程合并接口，也不设置检查成功或变更分支保护。

Gitee 链接与状态会出现在 team status、团队 STATUS.md；gitee status 另外列出同步操作和错误。本地 SQLite 仍是任务归属、依赖与验收的唯一来源，外部评论不自动变成执行命令。

## 中断与对账

Issue/PR 创建前在 SQLite 持久记录 pending 操作。完整分页查询远程对象中的 run/task/round 管理标记，采用既有对象后才标 done；Git 发布按远程分支 SHA 对账。两个同步进程使用独立互斥锁。

创建结果未知且未查询到对象时保留 unknown/pending，不因暂时查不到就重复 POST。列表扫描超过安全上限会停止创建；标记重复时也停止，不猜测归属。普通状态/正文 PATCH 可以在下一轮先读取真实状态后收敛。

```powershell
node $team gitee status
# 独立确认上次没有创建/推送成功后，写对账证据文件，再释放指定未知操作：
node $team gitee retry issue-task-a .work-together/gitee-reconcile.md
node $team gitee sync
```

操作键来自 status，例如 issue-task-a、push-1、pull-1。retry 仅释放本地重试阻断，不删除任何远程对象。网络超时本身不证明未执行；如果远程对象已存在，下一轮会按标记/SHA 接回。源分支被其他人更新时不强推，由主持方核对后处理。

映射绑定仓库和 base；修改配置后不能将同一运行记录静默同步到其他项目。默认关闭 Issue 仅限精确合并确认，可设置 closeIssuesOnMerge=false 禁用。

## 官方接口与版本边界

对照 Gitee 官方 OpenAPI 5.4.93：创建 Issue 使用 POST /repos/{owner}/issues，repo 在 form body；更新 Issue 使用 PATCH /repos/{owner}/issues/{number}。Issue number 是字符串，不应当作 PR 的整数编号处理。PR 使用 /repos/{owner}/{repo}/pulls。客户端不将 Gitea 接口直接替换域名。

官方文档：[Gitee OpenAPI](https://gitee.com/api/v5/swagger)、[Swagger JSON](https://gitee.com/api/v5/swagger_doc.json)。首版以轮询对账实现自动化，尚未接 WebHook、CI 检查写入、远程 PR 自动合并或 Gitee 企业私有域名。
