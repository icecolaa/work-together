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

本地原始证据位于 `.local/smoke-zcode/.work-together`、`.local/smoke-workbuddy-v2/.work-together` 和 `.local/proofs`，均被 Git 忽略。首轮 WorkBuddy 的共享记忆违规样本保留在 `.local/smoke-workbuddy`，未将该轮标为全部验收通过。最终两轮均由 Codex 记录 verified。

自动化测试覆盖文件重叠、大小写/目录归属、越界链接、依赖环/重复 ID、审批/错误/完成状态、未声明记忆写入/文件删除和内部链接别名。脚本没有宣称操作系统级隔离，也没有修改两款应用的安装包或桌面数据库。

## 来源与能力范围

参考了 [Codex 官方长任务说明](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex)、[ZCode 官方文档](https://zcode.z.ai/cn/docs/welcome) 与 [WorkBuddy 官方 ACP 说明](https://www.workbuddy.ai/docs/zh/cli/acp)。具体适配以本机已安装版本的真实桌面桥为准，未把 CodeBuddy CLI 会话等同于 WorkBuddy 桌面会话。

[用户提供的微信文章](https://mp.weixin.qq.com/s/KeQmHzdWDY53cfDBZj81lA)在网页读取时失败，直接请求返回环境验证页，未取得正文，不能声称已从文章补齐功能。

当前支持当前 Codex 回合内持续汇总，后台进程保留状态；Codex 回合结束后的自动唤醒需要宿主另外提供通知/自动化能力。待办在各执行器原生会话内显示，总计划在 PLAN.md 和 STATUS.md 更新，未实现 Codex 原生界面组件替换。取消、故障恢复提供了命令和持久会话 ID，但本轮没有对正在运行的真实模型任务做破坏性断线演练。
