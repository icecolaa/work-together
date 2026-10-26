# v1.8.1 文案与发布记录

日期：2026-10-26（Asia/Shanghai）。

## 本次更新

v1.8.0 的功能提交为 9e82c4e，已按 Gitee→GitHub 推送；发布前重新运行 npm test，65/65 通过，0 fail、0 skip。发布范围为 23 个项目文件，Skill 包内 28 文件，扫描确认未包含本地运行目录或实际凭据。

用户随后明确要求继续用“老板/员工”解释多 agent，并突出 Gitee 可选。v1.8.1 仅更新摘要、概述和新手说明，不改变执行逻辑：

- 老板拆任务、分活、查看每名员工的进度并独立验收；员工在各自桌面会话中执行、分享发现和交回成果。
- 新手或没有 Gitee 账号，可以直接本地使用，不需要添加 Gitee、Gitee 令牌或外部聊天平台；本机 Git 与 Gitee 账号是两件事。
- 需要线上任务卡和 PR 交付时，才把 Gitee 作为可选的线上任务清单和交付窗口接入。

两次发布均遵循 SkillHub 官方流程，使用已登录 user_5dea5c46 账号和官方 CLI，先 dry-run 再提交；没有输出或重新索取 API Key。1.8.1 的元数据/版本、Codex 核心字段临时投影、链接与关键文案断言均通过。

## SkillHub 提交结果

| 版本 | versionId | 包内文件 | 提交返回状态 |
|---|---|---|---|
| 1.8.0 | 462820 | 28 | ok=true；review/contentAudit/securityScan 均 pending |
| 1.8.1 | 462837 | 28 | ok=true；review/contentAudit/securityScan 均 pending |

skillId=284961。发布前线上已审核 latest 为 1.6.2；1.8.0 上传后，用户追加了本次文案要求，因此使用新补丁版本 1.8.1，不覆盖或重复提交 1.8.0。审核通过、公开 latest 和可下载版本应以平台实时结果为准；pending 不等于上架。

[SkillHub 页面](https://skillhub.cn/skills/user_5dea5c46/work-together) · [官方发布规则](https://skillhub.cn/ai/release.md)

原始发布响应及后台版本快照仅保存在 .local/skillhub-180-*、.local/skillhub-181-*，不推送。仓库文案和本机安装同步到 1.8.1，后续核对可比较源 Skill 与安装副本全部文件的 SHA256。
