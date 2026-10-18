# work-together（Skill 包导览）

让当前聊天里的 AI 担任**主持方**（Spec/Plan/Verify），把 Exec 派发给**其他工具**的桌面会话（ZCode / WorkBuddy）并行执行，逐包独立验收。

**环境边界**：仅 Windows；需要 Node.js >= 22；桌面桥验证绑定 ZCode 3.15.3 / WorkBuddy 5.7.6，任一应用升级后必须重跑 `doctor`，失败即需重新适配（不会假报成功）。

## 快速开始（3 步）

```powershell
# 1. 启动/复用两款桌面（自动处理未开调试端口的实例）
powershell -NoProfile -File <本skill绝对路径>/scripts/start-desktops.ps1 -Engine both

# 2. 预检
node <本skill绝对路径>/scripts/workflow.mjs doctor zcode

# 3. 在项目根目录派发（plan.json 从 examples/plan.example.json 拷贝修改）
node <本skill绝对路径>/scripts/workflow.mjs run plan.json
```

## 文件地图

| 文件 | 用途 | 什么时候读 |
|---|---|---|
| `SKILL.md` | 主持方工作流（1-8 步）与硬约束 | 每轮任务开始 |
| `references/operations.md` | 运行协议：命令速查、plan.json 结构、恢复/取消/回退 | 派发前与日常操作 |
| `references/faq.md` | 反模式与高频问题集中清单 | 遇到问题时按症状查 |
| `references/walkthrough.md` | 端到端实战样例（含失败恢复） | 第一次使用前通读 |
| `examples/plan.example.json` | 可拷贝的最小 plan 模板（含混排写法） | 写计划时 |
| `examples/SPEC.template.md` | SPEC 模板（目标/边界/交付/验收/回退） | 写 Spec 时 |
| `scripts/workflow.mjs` | 调度入口：run/status/watch/open/verify/cancel | — |
| `scripts/start-desktops.ps1` | 桌面启动/自动重启/保护 | — |

## 常见任务 → 对应入口

- 第一次跑通 → `references/walkthrough.md`
- 命令记不住 → `references/operations.md` 顶部速查表
- 任务没出现在桌面 / verify 报退出码 2 / 连接断开 → `references/faq.md` 按症状查
- 写计划卡住 → 拷贝 `examples/plan.example.json`
