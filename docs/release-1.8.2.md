# v1.8.2 新手说明与发布记录

日期：2026-10-27（Asia/Shanghai）。

本次仅调整文档、提示词和版本号，不改变脚本执行逻辑：

- 用写订单、排班分活、员工开工、老板检查交货、合格成果装箱解释 Spec、Plan、Exec、Verify 和 collect。
- 增加一句话请求；主持 AI 负责检查环境和准备配置，用户按需处理安装、登录和业务选择。
- 保留本地优先与 Gitee 可选，修正旧提示词的候选与模型说明；区分本地集成和远程 PR 合并。
- 示例明确为讲解场景，macOS 仍为实验性，不承诺平台评分提升。

验证：文档相对链接无缺失，git diff --check 通过；Codex 核心元数据临时投影校验通过，源扩展字段保留；官方 CLI dry-run 通过，发布包 28 文件，无本地运行目录。此次未重跑执行逻辑回归；此前 v1.8.0 的 65 项通过记录仅作历史依据。

通过官方 CLI 发布到现有账号 user_5dea5c46；skillId=284961，versionId=464876，ok=true。提交时 review/contentAudit/securityScan 均 pending，审核结果以平台实时状态为准。发布前核实 1.8.1 已通过审核并为 latest；未重复提交旧版本。

[SkillHub 页面](https://skillhub.cn/skills/user_5dea5c46/work-together)。原始响应仅保存在忽略目录 .local/skillhub-182-*，不进入仓库。
