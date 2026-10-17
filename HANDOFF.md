# HANDOFF — 新窗口交接文档

> 更新时间：2026-10-17。**新会话只需读完本文件即可继续工作。**
> 本文档由上轮会话总结生成；重大进展后请更新本文件（时间线、下一步计划）。

## 一、项目是什么

`work-together`（当前 v0.2.1）：一套"多 AI 桌面协作"工作流。**Codex 负责 Spec / Plan / Verify，ZCode 或 WorkBuddy 桌面会话负责 Exec**。在同一项目目录按文件归属并行派发真实桌面任务包，保留原生待办、审批与执行过程可见性。

- 交付物：中文提示词（`prompts/ai-collaboration.md`）+ Codex skill（`skills/work-together/`）+ Windows 桌面适配脚本 + 自动化测试。
- 安装方式：把 `skills/work-together` 整目录复制到 `~/.codex/skills/work-together`，Codex 聊天里用 `$work-together` 调用。
- 远程：GitHub `icecolaa/work-together` 与 Gitee `ice-colaa/work-together`，均公开、main 同一提交；push 地址顺序为 **Gitee 在前、GitHub 在后**。

## 二、当前状态快照（本窗口开始时实测）

- 分支 `main`，工作区干净，与 origin 同步；最新提交 `c82e829 fix: 自动退出并重启未开启调试端口的桌面应用`。
- `npm test`：**18 项全部通过**（约 2 秒）。
- `PLAN.md` 所有验收项已勾选完毕，SPEC.md 交付合同已全部满足。
- 本地证据（不入库，被 .gitignore 忽略）：`.local/proofs/`（截图、模型/权限快照）、`.local/smoke-zcode/`、`.local/smoke-workbuddy-v2/` 的 `.work-together` 调度记录、`.local/installed-skill-before-v02/`（旧版备份）。
- 环境依赖：Windows、Node.js >=22（实测 v26.5.1）、已登录的 ZCode 3.15.3 / WorkBuddy AI 5.7.6 桌面端。**适配绑定版本相关的私有桌面桥，任一应用升级后必须重新核对**。

## 三、任务完整过程与时间线

1. **bd2340b（2026-10-15）初始化**：写 SPEC.md（交付合同）、PLAN.md、中文提示词、skill 骨架（cdp.mjs / core.mjs / workflow.mjs / start-desktops.ps1）、基础测试与验证记录。
2. **现场验收 v0.1**：两款桌面端均真实建会话连通（ZCode 走 CDP 19331 的 renderer 桥返回 `ZCODE_CONNECTED`；WorkBuddy 走桌面 SDK，端口 19332，返回 `WORKBUDDY_CONNECTED`）；同目录两包并发证实（执行区间重叠 ZCode 125831ms、WorkBuddy 52232ms）；原生待办、needs_user 审批、Codex 独立逐字节验收产物全部通过。
3. **c6bbd65（10-15）文档收口**：记录桌面验收与双远程发布（详见 `docs/verification.md`）。
4. **f89b294（10-15）v0.2**：修复"后端派发了真实会话但桌面停在旧项目"——派发后自动打开真实项目并选中目标 session，核对侧栏选中 + 正文任务包标记，写 `visibility.json`；显示失败阻断验收，用 `open <包ID>` 修复而非重派。同时固化默认模型策略：ZCode=GLM-5.3-Flash+yolo（创建会话即绑定，含 reasoningLevel=max）；WorkBuddy=按 `wb.models.list()` 动态选零费率模型（Step-5-Preview）+bypassPermissions。新增 model-policy.mjs 与可见性回归，共 17 项测试通过。
5. **a884a53（10-15）**：修复调度器退出后独立验收状态未落盘的竞态。
6. **c82e829（10-17）v0.2.1**：启动脚本自动退出并重启未开调试端口的桌面应用（新增 `desktop-lifecycle.ps1`，123 行），健康实例直接复用；当前项目有运行中任务时保护现场，需 `-ForceRestart` 才中断。修掉 Windows PowerShell 5.1 的 JSON 数组包装与 .NET Framework file URL 查询参数解析差异；新增 11 场景启动测试（PS7 与 PS5.1 双环境通过）。总计 18 项测试通过。skill 官方 quick_validate.py 校验通过并已安装本地。

## 四、关键结论（工作原理速查）

- **调度入口**：项目根目录 `node <skill路径>/scripts/workflow.mjs run plan.json`（后台隐藏进程，日志重定向到 `.work-together/`）；`status` / `watch` / `open <包ID>` / `verify <包ID> <证据文件>` / `cancel` / `run --resume`。
- **状态机**：queued → running → needs_user → exec_done → **verified（仅 Codex 独立复核后才算）**；异常有 failed/unknown/blocked/cancelled。unknown 不重派，先查原会话。
- **文件归属**：plan.json 每包声明 files（相对路径，不用 glob）；调度器按归属串行交叠包；运行前后做指纹比对，越界写/删阻断验收（退出码 2）。这是**事后检测，不是写入拦截**，也不是操作系统级沙箱——构建输出、依赖安装、端口、DB 等全局状态必须由计划者串行分配。
- **可见性三要素**：正确项目 + 选中目标 session + 正文出现 `协作任务包：包ID`，三者齐备才写 `visibility.json`；缺一 verify 阻断。旧 smoke 会话被选中不算数。
- **调试端口**：ZCode=19331、WorkBuddy=19332，仅本机；由 `start-desktops.ps1 -Engine both` 负责复用/自动重启，`doctor <engine>` 先行检查。

## 五、经验与踩坑点（重要）

1. **显示失败 ≠ 重新派发**：任务可能已在跑。用 `open <包ID>` 修复原会话显示；重派会造成双会话。
2. **修正轮必须换新请求 ID**：WorkBuddy 首轮产物多写一个 LF 被逐字节验收打回后，若复用首轮请求 ID 发修正，会被缓存吞掉；以独立请求 ID 重发才生效（已有回归测试）。
3. **模型绑定要显式**：ZCode 的 GLM-5.3-Flash 必须显式附带 reasoningLevel（沿用界面 max），失败时不得静默换成普通版模型。WorkBuddy 的"Auto/空费率"不能当免费，只有列表明确 x0.00 才算零费率；同名模型要区分收费区域版本。
4. **共享写入责任归 Codex**：执行器不得写 `.workbuddy-ai/memory` 等共享文件；首轮 WorkBuddy 越界写共享记忆被指纹检测抓到，补约束后重测干净。
5. **PowerShell 5.1 兼容**：JSON 数组会被包装、.NET Framework 解析 file URL 查询参数的方式与 PS7 不同——启动脚本已修并加了回归，改脚本时两个 PS 版本都要跑测试。
6. **发布经验**：GitHub 首次 TLS 失败，切换 Windows schannel 成功（仅写入本仓库 git 配置）；Gitee 空仓库不能先设公开，必须先推送再改公开并复查。
7. **能力边界不要夸口**：微信参考文章被验证页挡住未读到正文，未计入实现；skill 无法在 Codex 回合结束后自动唤醒聊天，需宿主通知机制；本轮未对真实运行中的模型任务做破坏性断线演练。`.work-together/` 不推送远程。
8. **版本敏感**：桌面桥是本机私有接口（ZCode 3.15.3 / 内置 CLI 0.16.9，WorkBuddy 5.7.6）。应用升级后 doctor/run 必须明确失败并先修适配，不许假报成功。

## 六、下一步计划（候选）

1. **升级适配巡检**：ZCode / WorkBuddy 任一发布新版本后重跑 `doctor` 与 18 项测试，必要时修桌面桥。
2. **真实故障演练**：对运行中的真实任务做一次 cancel/失联恢复演练（此前仅命令级验证），补 `docs/verification.md`。
3. **跨回合自动汇报**：调研宿主侧通知/自动化能力（如系统计划任务触发），补上"Codex 回合结束后自动唤醒"这块已知空白。
4. **可选增强**：worktree 隔离选项（真冲突包并行）、plan.json 多执行器混排（zcode+workbuddy 同计划）、把 `.local` 证据归档流程脚本化。

## 七、新窗口快速上手

```powershell
# 1. 跑测试确认基线
npm test                          # 期望：18 pass
npm run doctor                    # 或 node skills/work-together/scripts/workflow.mjs doctor zcode

# 2. 启动/复用两款桌面（自动处理未开调试端口的实例）
powershell -NoProfile -File <skill绝对路径>/scripts/start-desktops.ps1 -Engine both

# 3. 在目标项目根目录派发（plan.json 写法见 skills/work-together/references/operations.md）
node <runner绝对路径>/workflow.mjs run plan.json
node <runner绝对路径>/workflow.mjs status / watch / open <包ID> / verify <包ID> <证据>
```

约束提醒：`.work-together/` 与 `.local/` 不入库；执行结果只信 `state.json` 与真实产物，不信介入卡；所有包 verified 后才更新 PLAN.md 并交付。
