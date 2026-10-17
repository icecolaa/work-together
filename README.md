# work-together

Codex 负责 Spec / Plan / Verify，ZCode 或 WorkBuddy 负责 Exec。在同一目录按文件归属并行派发真实桌面会话，保留原生待办、审批与执行过程。

v0.2 会在派发后自动打开真实项目、选中目标会话，并核对正文中的任务包标记；显示失败会阻断验收。已有任务可在其项目根目录运行 `node <skill路径>/scripts/workflow.mjs open <包ID>` 修复显示，无需重新派发。

默认：ZCode 完全访问 + GLM-5.3-Flash；WorkBuddy 允许完全访问，按当前模型列表优先零费率模型。没有免费选项时明确报告最低已知费率。模型、权限和可见性证据均写入本地状态。

v0.2.1 启动脚本自动退出并重启未开启调试端口的应用，无需手动退出托盘。已有可用实例直接复用；当前项目有运行中协作任务时保护现场，明确需要中断时使用 `-ForceRestart`。

v0.3 支持在提示词里选择协作组合：`executor=zcode`、`workbuddy` 或 `both`。plan.json 顶层 engine 为缺省执行器，个别包可用同名 engine 字段改派另一款工具，调度器按包连接对应桌面，`open`/`cancel`/验收自动使用各包自己的执行器。

- [可复制的中文提示词](prompts/ai-collaboration.md)
- [Codex skill](skills/work-together/SKILL.md)
- [启动、后台运行、恢复及验收](skills/work-together/references/operations.md)
- [现场验证记录](docs/verification.md)

安装：把 `skills/work-together` 整个目录复制到 `~/.codex/skills/work-together`，重新打开 Codex 聊天后用 `$work-together` 调用。每轮在提示词里指定 `executor=zcode`、`workbuddy` 或 `both`；plan.json 顶层 engine 为缺省执行器，个别包可用同名 engine 字段改派另一款工具。

需要 Node.js >=22，无 npm 依赖。`npm test` 运行调度关键约束测试。桌面适配使用版本相关的本机 CDP 私有桥，当前针对 ZCode 3.15.3 / WorkBuddy AI 5.7.6；升级需要重新检查。

边界：文件归属是协作约定，不是沙箱。日志和会话在本地，主代理需保持当前回合跟进；单靠 skill 不能在 Codex 聊天结束后自动唤醒。桌面会话原生显示每包待办，总计划通过 PLAN.md / STATUS.md 同步，未修改 Codex 自身 UI。

参考：[Codex 长任务的持久计划与验证](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex)、[ZCode 官方文档](https://zcode.z.ai/cn/docs/welcome)、[WorkBuddy 官方文档](https://www.workbuddy.ai/docs/)。用户提供的[微信文章](https://mp.weixin.qq.com/s/KeQmHzdWDY53cfDBZj81lA)未能读取正文，未将推测内容计入实现。
