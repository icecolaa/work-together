# work-together

当前聊天负责 Spec / Plan / Verify，把 Exec 交给其他工具的真实桌面会话。按文件归属拆包、跟踪原生待办与审批，并逐包独立验收。适用于代码、文章、网页/小程序截图与多产物工作流。

v1.5.0 新增主持方接管：`workflow.mjs takeover <执行器>` 移交主持权（写入 coordinatorHistory，派发排除同族）；接管后同族未验收包默认拒绝自验，`verify --self-review` 显式登记，`run --resume` 按初始主持方校验。

v1.4.0 默认 `engine=auto`，按用户授权的五级顺序选择助手：

| 优先级 | 执行器 | 模型 |
|---|---|---|
| 1 | `zcode` | 精确 `GLM-5.3-FlashX` |
| 2 | `qoder-global` | 国际版当前明确零费率的 DeepSeek |
| 3 | `qoder-cn` | 国内版当前明确零费率的 DeepSeek |
| 4 | `workbuddy-global` | 国际版当前明确零费率的 DeepSeek |
| 5 | `workbuddy-cn` | 国内版当前明确零费率的工具模型 |

缺额度、模型不可选或桌面不可用时按序尝试下一项；免费候选耗尽即报告，禁止收费回退。Auto、未知/空费率不算免费。`workbuddy` 兼容为国际版别名；显式 engine 从该项向后尝试，`fallback=false` 锁定单项。每候选每任务至多一次。

执行中切换必须确认原会话已停止；创建/派发/连接结果未知时保留 `unknown` 并查询原会话，禁止重复派发。桌面可见性需要正确项目、目标会话与任务标记；执行者交回 `exec_done` 后仍需主持方独立核对产物再 `verify`。

安装：把 `skills/work-together` 整个目录复制到主持工具的技能目录。Codex 使用 `~/.codex/skills/work-together`，重新打开聊天后调用 `$work-together`。其他工具也可直接读取 `SKILL.md` 绝对路径。需要 Node.js >=22，无 npm 运行依赖。

Windows 启动入口为 `scripts/start-desktops.ps1 -Engine auto`，支持五款客户端独立路径覆盖，健康实例直接复用；有活跃会话时先保护现场。`workflow.mjs doctor` 检查所有候选，`doctor <engine>` 检查单项，不创建任务。Qoder 与 WorkBuddy 分地区客户端的可用性由实际安装、登录、模型列表及桌面适配决定，不把启动/预检当成任务实测。

- [主持方工作流](skills/work-together/SKILL.md)
- [启动、模型、切换与验收](skills/work-together/references/operations.md)
- [常见问题](skills/work-together/references/faq.md)
- [v1.4.0 五客户端与切换验证](docs/verification-1.4.0.md)
- [历史现场验证记录](docs/verification.md)
- [可复制提示词](prompts/ai-collaboration.md)

`npm test` 运行调度、模型策略、桌面启动与可见性约束测试。桌面桥使用本机版本相关接口，应用升级后重新预检。Windows 启动支持五级候选；macOS 实验性、未现场验证，Bash 启动器目前保留 ZCode / WorkBuddy 国际版两个入口，见 [macOS 清单](skills/work-together/references/macos.md)。测试可用 `WT_TEST_BASH` 指定 Bash，Windows 默认选择 Git Bash。

文件归属是协作约定和事后检测，不是操作系统隔离。日志、会话和截图默认仅留本地；共享安装、Git index、构建输出和数据库写入需串行。发布、推送按用户已给授权处理。主持聊天需保持跟进；skill 本身不保证聊天结束后自动唤醒。
