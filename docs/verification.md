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
