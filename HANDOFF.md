# HANDOFF — work-together 新窗口交接

## 2026-10-24 v1.4.0 更新（优先于下文历史记录）

用户要求五级自动选择并发布代码。当前默认 `engine=auto`：ZCode 精确 GLM-5.3-FlashX → Qoder 国际版免费 DeepSeek → Qoder 国内版免费 DeepSeek → WorkBuddy 国际版免费 DeepSeek → WorkBuddy 国内版免费工具模型。不可用按序切换，不收费回退；每候选每包最多一次。已派发结果未知不得重派，故障会话确认停止后才可交接。

五款 Windows 客户端均完成真实文件任务、实际模型核对、原会话显示校验和主持方独立 verify；ZCode 不可用模型 → Qoder 国际版自动回退实测通过。npm test 34/34，生命周期内部25场景。版本及边界见 docs/verification-1.4.0.md。未人为耗尽真实额度，macOS 未真机验证。

根 package.json、源 Skill 和本机安装副本统一1.4.0。五级策略与本节优先于下文1.3.1的Flash/最低付费回退旧记录。代码推送状态以 Git HEAD 和双远程 main 为准。本次代码发布不代表 SkillHub 1.4.0 已提交或审核通过。

更新时间：2026-10-20（Asia/Shanghai）。根据当前聊天、Git、现有验收文档及本次核查整理；只读本文即可判断现状并继续。历史验收与当前运行状态分开记录。

## 1. 从这里继续

**原始交付已完成，本地项目/已安装 Skill 当前 v1.3.1，已提交 SkillHub 审核。** 最新状态见下方发布记录；后文 v1.3.0 为历史快照。不自动重跑全部冒烟、重启应用或重复派发。Windows 已现场验证；macOS 实验性，未真机验证。

用户随后明确要求 Git 自动提交推送；本次将交接、测试修复与 v1.3.1 优化一并提交到 main，并按 Gitee→GitHub 同步。下方“未提交/未推送”为发布阶段快照，当前同步结果以 Git HEAD 和两端 main 为准。

### 2026-10-20 SkillHub 优化与发布（最新）

用户明确要求依据 `https://skillhub.cn/ai/release.md` 优化 Skill 及概述并发布，随后要求继续，已完成：

- 发布前实时确认账号 `user_5dea5c46` 及线上最新版本 **1.3.0**，未依据旧 pending 记录重复提交旧版本。
- 根 package.json / 源 SKILL.md / 本机安装副本统一 **1.3.1**。优化 displayName、summary、description、概述开场与使用示例；补充主持方/执行器矩阵、无 Codex Exec、both 配置、平台启动分流，统一主持方术语，修正包内单执行器快速开始。
- SkillHub 网页概述从根 SKILL.md 读取并剥离 frontmatter（优先于 README）；本次直接优化该正文，不另造无效 overview 元数据。现有头像未替换。
- 验证：`npm test` **24/24**；SkillHub 官方 CLI dry-run 通过；Codex 核心 frontmatter/正文校验通过（临时投影去掉 SkillHub 扩展字段，未改发布源文件），另校验扩展字段和本地 Markdown 引用。内置 quick_validate.py 仅接受 Codex 字段，不能直接用它拒绝 SkillHub 必填的 slug/version/displayName。
- 官方 CLI 位于 `C:/Users/lenovo/.skillhub/skills_store_cli.py`，版本 2026.8.5；包装入口不在当前 PATH，直接 `python <CLI> --skip-self-upgrade ...`，设置 `PYTHONUTF8=1`、`PYTHONIOENCODING=utf-8`。已存登录凭据经 `auth whoami` 实时确认，不输出 token，不需要重新索取密钥。
- 官方 CLI publish 返回 `ok=true`、skillId **284961**、versionId **447671**、version **1.3.1**、fileCount **15**，reviewStatus/contentAuditStatus/securityScanStatus 均为 pending。随后认证后台版本列表确认该版本 **reviewStatus=pending、isLatest=false**，安全扫描进行中；公开详情 latestVersion 仍为 **1.3.0**。提交成功不等于审核通过。
- 详情链接：`https://skillhub.cn/skills/user_5dea5c46/work-together`。复核原始响应仅本地保存于 `.local/skillhub-before.json`、`.local/skillhub-after.json`、`.local/skillhub-versions.json`；不推送这些文件。
- 本机安装版 15 个源文件已同步并逐字节一致。未启动桌面，未做 macOS 真机验证，未提交 Git 或推送双远程。
- 当前未提交范围：此前 HANDOFF.md、README.md、tests/cross-platform.test.mjs，加本次 package.json、skills/work-together/{SKILL.md,README.md,references/operations.md}。后续查审核结果时先读后台/详情，不重复发布同版本。

### 2026-10-20 新窗口续接记录（优先于下文旧快照）

用户要求读取交接、核对后继续，已按候选第 2 项完成测试可移植性修复：

- `tests/cross-platform.test.mjs` 支持 `WT_TEST_BASH`；Windows 默认从 Git 安装位置及 PATH 寻找 Bash，排除 System32/WindowsApps 的 WSL 入口，无需临时修改 PATH。
- Bash 语法检查与非 darwin 拒绝检查拆开；darwin 跳过拒绝检查，避免测试启动真实应用。拒绝检查同时要求退出码 2。
- README 补充 Bash 依赖、配置和 macOS 测试边界。未修改 skill 包文件，根/skill 版本仍为 1.3.0。
- 默认环境 `npm test` **24/24 通过**；显式 `WT_TEST_BASH=C:/Program Files/Git/bin/bash.exe` 的跨平台用例 **4/4 通过**；PS5.1 生命周期用例通过（内部 20 场景）。未做 Mac 真机验证。
- 重新核对：本地 HEAD 与 GitHub/Gitee main 均为 `25e09c1bc3506d0f150a3d40a3a9d2785e64783d`；本机安装 skill 的 15 个源文件逐字节一致；根目录无 state.json、runner.lock。没有启动桌面或派发任务。
- 当前未提交文件：原有 HANDOFF.md 加本次 README.md、tests/cross-platform.test.mjs。尚未提交/推送。下面“23 项”“Bash 待修”等为续接前快照；该测试问题已解决。
- 后续候选：第 3 项术语统一；Mac 真机、SkillHub 发布与故障演练仍按各自触发条件执行。

2026-10-20 本次核查：

| 项目 | 结果 |
|---|---|
| 工作目录 | E:\code\work-together |
| 分支 / 修改前基线 | main / 25e09c1bc3506d0f150a3d40a3a9d2785e64783d |
| 版本 | 根 package.json、skill frontmatter 均为 1.3.0 |
| 双远程 | GitHub/Gitee main 均为上述 SHA，本次 ls-remote 确认 |
| 本机 skill | C:\Users\lenovo\.codex\skills\work-together，15 个源文件逐字节一致；未检查安装目录额外文件 |
| Node | v26.5.1，要求 >=22，无 npm 依赖 |
| 全测 | 临时优先 Git Bash 后 **23/23 通过**；默认系统 Bash 下 22 通过、1 超时，详见第 7 节 |
| PS5.1 | tests/startup.test.mjs 通过，内部含 20 个生命周期场景；默认全测使用缓存 PS7 |
| 根目录运行状态 | 无 .work-together/state.json，无 runner.lock；不代表其他项目没有任务 |
| 桌面端口 | 127.0.0.1:19331、19332 此刻均不监听；本次未启动应用、未重做 doctor |
| 工作树 | 本轮开始干净；完成后仅 HANDOFF.md 为本轮修改，尚未提交/推送 |

新窗口先看 git status --short、git log -3 --oneline。本文是快照，现场新变化优先。候选下一步不代表用户要求全部立即执行。

## 2. 用户目标与固定偏好

原始要求：中文提示词和 skill，由 Codex 同目录规划/验收，开始时指定 ZCode 或 WorkBuddy 的真实桌面会话执行。后台并发、主聊天清爽、自动紧凑汇总、会话状态/人工介入可见、原生待办、回应前回顾卡，责任分为 Spec / Plan / Exec / Verify。需启动已登录应用现场验证，并推公开 GitHub/Gitee 便于迭代。后续扩展为三种工具任一主持、其余可用执行器执行。

- 仓库 work-together，**公开**；origin fetch=GitHub，push 顺序 **Gitee→GitHub**。
- ZCode 默认 **yolo 完全访问 + 精确 GLM-5.3-Flash**，创建即绑定，reasoningLevel=max，不静默替换普通版。
- WorkBuddy 默认 **bypassPermissions 允许完全访问，优先当前模型列表明确零费率模型**。历史现场是 Step-5-Preview；Auto/空费率不是免费，无零费率时选最低已知费率并说明。历史报价不保证永久。
- 不让用户每次退出托盘，脚本复用健康实例，自动退出/重启未开调试端口的所选应用。
- 必须在真实 ZCode/WorkBuddy 桌面看到过程，后台 sessionId/CLI 输出不足以验收。
- 小包独立验收、文件归属明确；执行者在边界内可判断差异，自测完成只算交回，主持方独立验收。
- 文件归属是协作约定，不是 OS 沙箱。构建、依赖、Git index、端口、DB 等共享状态另行协调。

提示词在 prompts/ai-collaboration.md，格式为“## N. 标题 / **适用场景** / **提示词：** / 可复制正文”。SPEC.md 是初始合同，PLAN.md 原交付均勾选；保留早期 Codex 主持用词，不代表现功能退回 v0.1。

微信参考 https://mp.weixin.qq.com/s/KeQmHzdWDY53cfDBZj81lA 被验证页挡住，未取得正文，不能声称已从文章补齐功能。官方参考链接见 README/验收文档。

## 3. 完整过程与关键提交

日期按 Git 的 Asia/Shanghai 提交日期；现场与提交可能跨日。

| 日期 / 提交 | 工作、原因、结论 |
|---|---|
| 10-15 bd2340b | 初始化 Spec/Plan、提示词、skill、CDP 桥、调度、测试。Codex 主持，外部桌面执行。 |
| 10-15 c6bbd65 | 首轮真实并发/待办/审批/产物独立验收收口，双远程公开发布。 |
| 10-15 f89b294 | v0.2：用户“派给 ZCode 却看不到过程”。后台已建会话，桌面停旧 smoke；补真实项目导航、选中 session、正文任务标记、visibility.json。显示失败阻断验收，open 修复而非重派。固化默认模型/权限。 |
| 10-15 a884a53 | runner 已释放锁但 PID 尚存时，验收只排队不落盘的竞态修复。 |
| 10-17 c82e829 | v0.2.1：自动退出/重启未开调试端口应用，健康复用、当前项目任务保护、ForceRestart 显式中断。真实启动发现 PS5.1 JSON 包装及 .NET file URL 查询串差异，修复并补 11 场景。 |
| 10-17 8040b00 | 首次 HANDOFF.md。 |
| 10-17 0caedee | review 后修 WorkBuddy 路径回退、状态不可读时保守保护、缺 URL 页面跳过，补生命周期场景。 |
| 10-18 89447e6 | v0.3：executor=zcode/workbuddy/both；顶层 engine 默认、逐包 engine 混排；open/cancel/验收/重启保护逐包路由。 |
| 10-18 9de514e | v0.4：Codex/ZCode/WorkBuddy 任一主持，coordinator 缺省 codex；禁止 engine=coordinator；本项目持锁期间保护主持方。 |
| 10-18 8021f01 | ZCode 主持、Codex CLI 主持混排闭环，status 加 coordinator；记录 headless 分离进程回收等坑。 |
| 10-18 ee82af4 | WorkBuddy 主持→ZCode 执行闭环，两轮新独立验收，三种主持均有现场证据。 |
| 10-18 19f4ddb | SkillHub 元数据补齐，根/skill 统一 1.1.0。 |
| 10-18 b5e0393 | v1.2.0：按评测补 FAQ、含失败恢复实战、计划/Spec 模板、包内 README、速查、headless 分工，纯文档迭代。 |
| 10-19 25e09c1 | v1.3.0：macOS 实验性页面/路径推导、darwin 启动器、纯逻辑测试、真机清单，没有 Mac 现场验证。 |
| 10-20 本轮 | 纠正旧交接顶部 v0.2.1/20 项/18 项矛盾；核对当前远程/安装/state；发现系统 Bash 超时，临时 Git Bash 后 23 全过。仅更新此文件。 |

SkillHub 信息来自旧交接与提交描述，本次未查线上：v1.1.0 曾以 skillId=284961、versionId=444546 提交，v1.2.0 也记录为提交，当时 pending。历史评测 4.6/5，FAQ/反模式 3.8、文档 4.0，促成补文档。**当前审核、latest、v1.3.0 是否上线未实时确认。** 本地版本不证明线上已发布。

## 4. 架构与不能破坏的约束

### 4.1 计划与职责

- 主持方负责 Spec/Plan/监督/独立 Verify，其他工具的真实桌面 Exec。
- plan.coordinator=codex/zcode/workbuddy（缺省 codex）；顶层 engine=zcode/workbuddy 作默认。**提示词 executor=both，不等于 plan.engine=both。**
- tasks 有 id、prompt、files、acceptance、dependsOn，可覆写 engine；concurrency 默认 2。
- 当前执行适配只有 ZCode/WorkBuddy，**没有 Codex Exec 适配器**。Codex 主持可混排两款；ZCode 主持只能派 WorkBuddy；WorkBuddy 主持只能派 ZCode。“其余工具”不等于能派 Codex 桌面。
- coordinator 与任务 engine 不能相同，混排不宜设顶层 model，防止跨工具误用。
- 相交归属串行，前置 verified 才启动依赖，全局可变状态另协调。

### 4.2 状态、证据、恢复

- queued→running→needs_user→exec_done→verified；异常 failed/unknown/blocked/cancelled，中间 creating/dispatching。
- needs_user 定位原生审批/提问并出回顾卡；主聊天只报变化，普通轮询不抢用户当前选择。
- **unknown 不重派**，先查原 session；恢复复用 sessionId，显示错用 open，修正消息新 requestId。
- 可见性三要素：正确项目、正确选中 session、正文“协作任务包：包ID”；写 .work-together/<id>.visibility.json。旧 smoke 不算新任务证据。
- verify 检查状态/可见性/归属/非空证据文件，不证明证据文字真实，主持方必须亲自检查产物和测试。
- 指纹检测归属外增/改/删，发现阻断，可能退出码 2；事后检测，主持方迟写文件也触发。
- 同项目一个 runner.lock；干净结束释放，未知保留恢复入口。--resume 检查计划路径、engine、coordinator、计划哈希，不静默换计划。
- state.json 是当前依据，review.md 会过期；证据/控制/日志放 .work-together，避免污染指纹。
- 依赖等待时 runner 可驻留，全部交回后也可能先退出，由主持方离线登记 verified。runner 退出不代表全部验收。

### 4.3 生命周期与能力边界

Windows 历史现场版本：ZCode 3.15.3（CLI 0.16.9）、WorkBuddy AI 5.7.6。版本相关本机私有 renderer/CDP 桥，非稳定 API；升级先 doctor、小冒烟。未修改 app.asar/数据库，不复制密钥，不把 CLI 冒称桌面。

仅本机端口 ZCode=19331、WorkBuddy=19332。Windows 健康实例复用；未开端口 CloseMainWindow，默认等 5 秒，再按**相同可执行文件路径**终止剩余托盘进程，重启等页面就绪，不能按名字误杀其他安装。

当前项目活跃任务、或所选应用是仍持锁主持方时默认保护；状态读不出保守报错。明确中断才 -ForceRestart，随后查旧会话恢复。保护范围是**脚本当前项目**，不是全局所有项目探测。

skill 不会在主持回合结束后自行唤醒，跨回合通知需宿主。总计划用 PLAN.md/STATUS.md，外部原生待办，未替换 Codex UI。完全访问只影响审批，不扩大业务范围。

Mac 已有 .app URL/路径推导、start-desktops.sh、最小 lock 保护；真机桥/SDK/fiber/--open-workspace/bundle 名均未知。默认猜 /Applications/ZCode.app、/Applications/WorkBuddyAI.app，可覆写。正式任务前按 references/macos.md 验证。

## 5. 证据地图

本次复查持久 state、安装一致性和测试，下列桌面结果来自历史。原始截图/会话/日志只本地，不推远程。

| .local 下项目（前缀 E:\code\work-together\.local） | 历史结果 / 本次 state 核对 |
|---|---|
| smoke-zcode | alpha/beta verified；并发重叠 125831 ms |
| smoke-workbuddy-v2 | alpha/beta verified；并发重叠 52232 ms |
| smoke-workbuddy | 首轮共享记忆越界样本，两个 exec_done；**不是新待办，不是全部通过** |
| visibility-zcode / visibility-workbuddy | visible-check verified；历史逐字节 VISIBLE_OK 加 LF |
| smoke-coordinator-zcode | coordinator=zcode，WorkBuddy alpha/beta verified；模型 error 后同会话修复 |
| smoke-mixed | coordinator=codex，zside→ZCode、wbside→WorkBuddy verified，15B/19B，待办核查通过 |
| smoke-coordinator-workbuddy | coordinator=workbuddy，zexec→ZCode verified，36B、两轮独立验收、Todo、无越界 |
| proofs | 截图/模型权限快照 |
| installed-skill-before-v02 | 旧版备份，不要覆盖现版本 |

每项目 .work-together/state.json 存 sessionId/证据路径，不把个人会话 ID 抄进公开交接。完整叙述在 docs/verification.md；v0.4 早期“WorkBuddy 主持未验证”由后文“验收三”补足，目前三种主持均闭环。

## 6. 文件入口

相对路径以 E:\code\work-together 为根。

| 文件 | 用途 |
|---|---|
| prompts/ai-collaboration.md | 中文启动/恢复提示词 |
| skills/work-together/SKILL.md | 入口、版本/SkillHub 元数据、职责 |
| skills/work-together/scripts/workflow.mjs | 调度与 doctor/run/status/watch/open/verify/cancel |
| 同目录 core.mjs | 计划/依赖/归属/摘要/指纹 |
| 同目录 cdp.mjs | 桥接会话、发送、快照、导航、取消、平台路径 |
| 同目录 model-policy.mjs | 模型/权限/费率 |
| 同目录 start-desktops.ps1、desktop-lifecycle.ps1 | Windows 启动/保护/就绪 |
| 同目录 start-desktops.sh | 实验性 Mac 启动 |
| skills/work-together/references/operations.md | 速查、协议、headless 分工、恢复 |
| 同目录 faq.md、walkthrough.md、macos.md | 排障、失败恢复实战、Mac 清单 |
| skills/work-together/examples | plan.example.json、SPEC.template.md |
| tests/*.test.mjs、tests/desktop-startup.ps1 | 23 Node 测试，启动用例内含 20 场景 |
| docs/verification.md | 历史现场验收 |
| SPEC/PLAN/README/HANDOFF.md | 初始合同、计划、入口、当前交接 |

## 7. 经验、踩坑与待闭环

1. 后台成功不等于桌面可见，靠导航与三要素；显示失败重派会双执行。
2. WorkBuddy 修正轮新 requestId，复用会缓存吞掉；模型瞬时 error 也已同会话修复。
3. 创建即绑定模型/权限，Flash 显式 reasoningLevel；仅明确 x0.00 免费，区分同名收费区域。
4. 共享记忆/日志主持方统一写，执行者仅归属。主持辅助文件提前就位或放 .work-together。
5. PS5.1 的 @() 可能包装嵌套数组，.NET file LocalPath 含查询串，要先剥离。PS1 保留 UTF-8 BOM，生命周期双通道回归。
6. codex exec 回收分离 runner，WMI 成功也可能消失；WorkBuddy 策略层拦 WMI，自有后台机制可能撞用户 runner.lock。由能承载后台的调用方/交互宿主启动，headless 主持只写计划、监控、验收。
7. 历史 MSYS 中 Start-Process -WindowStyle Hidden 出现 127，不泛化为 Windows 一律失败；用合适宿主，不反复绕沙箱策略。
8. 多层转义曾使 Desktop.create cwd 丢分隔符，用 argv/结构化参数，node -e 首个额外参数 argv[1]；含空格 Start-Process 参数正确引用。
9. cancel 送达不等于已停，桌面确认才释放归属；真实破坏性 cancel/失联演练仍缺。
10. **本次新发现**：cross-platform.test.mjs 直接调用 bash。默认命中 C:\WINDOWS\system32\bash.exe（另有 WindowsApps 入口），bash -n 15 秒超时。临时优先 Git Bash 后 23 全过，未改测试或全局 PATH。
11. **Mac 全测边界待改**：“非 darwin 拒绝”用例未按宿主跳过，实际执行启动器且预期拒绝。Mac 全量 npm test 前先审查，URL 纯逻辑不证明现场可用。
12. GitHub TLS 曾用仓库局部 schannel 修复，Gitee 空仓库先推后公开。双推前一失败中断后续，两边 SHA 单独核对。SkillHub pending 不等于过审。
13. 微信未读、宿主唤醒未实现、Mac 未真机如实留缺口，历史通过不代表当前在线。

## 8. 新窗口可复制命令

### 8.1 核对与测试（不启动桌面）

~~~powershell
Set-Location 'E:\code\work-together'
git status --short
git log -3 --oneline

# 临时优先 Git Bash，结束恢复 PATH
$originalPath = $env:Path
try {
  $env:Path = 'C:\Program Files\Git\bin;' + $originalPath
  npm test                       # 本次 23 pass
} finally { $env:Path = $originalPath }

# PS5.1：一个 Node 用例，内部 20 场景
$env:WT_TEST_POWERSHELL = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
try { node --test tests/startup.test.mjs }
finally { Remove-Item Env:WT_TEST_POWERSHELL }
~~~

### 8.2 用户要真实协作时

在**真实任务根目录**查原 Spec/计划/state/修改，决定新任务或恢复，不在源码仓库重复派发旧 smoke。以下 Codex 主持为例，当前交接未执行；run/open/verify/resume 属不同阶段，非无条件顺序运行。

~~~powershell
$skill = 'C:/Users/lenovo/.codex/skills/work-together'
$runner = "$skill/scripts/workflow.mjs"

# 仅启动所需执行器
powershell -NoProfile -ExecutionPolicy Bypass -File "$skill/scripts/start-desktops.ps1" -Engine both
node $runner doctor zcode
node $runner doctor workbuddy

# Spec/plan/辅助材料先就位
New-Item -ItemType Directory -Force .work-together | Out-Null
Start-Process node -ArgumentList @($runner,'run','plan.json') -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput '.work-together/runner.out.log' -RedirectStandardError '.work-together/runner.err.log'
node $runner status
node $runner watch

# 显示错只定位原会话
node $runner open draft-a

# 真独立验收后，先写真实证据再登记
node $runner verify draft-a .work-together/draft-a.verify.md

# 确认旧 runner 退出、先查原 session，再用原计划恢复
node $runner run plan.json --resume
~~~

主持持续读取 watch/status，不能启动即结束。最小混排计划：

~~~json
{
  "coordinator": "codex",
  "engine": "zcode",
  "concurrency": 2,
  "spec": "SPEC.md",
  "tasks": [
    {"id":"draft-a","files":["drafts/a.md"],"dependsOn":[],"prompt":"按 Spec 写第一篇草稿，不发布。","acceptance":["内容符合 Spec，文件可打开"]},
    {"id":"draft-b","engine":"workbuddy","files":["drafts/b.md"],"dependsOn":[],"prompt":"按 Spec 写第二篇草稿，不发布。","acceptance":["内容符合 Spec，文件可打开"]}
  ]
}
~~~

已知安装路径：ZCode 为 C:\Users\lenovo\AppData\Local\Programs\ZCode\ZCode.exe，WorkBuddy 为 E:\workbuddy\WorkBuddyAI\WorkBuddyAI.exe。升级/迁移重查，支持 -ZCodePath/-WorkBuddyPath。端口关闭不证明登录失效。

### 8.3 修改、安装、发布

改源 skills/work-together，验证再同步安装，不只改安装副本。早期 quick_validate.py 通过在加入 SkillHub 扩展字段前；当前兼容性需实际确认，不沿用旧结论当 v1.3.0 当前验证。根/skill 版本对齐。

- GitHub：https://github.com/icecolaa/work-together
- Gitee：https://gitee.com/ice-colaa/work-together

已有公开双远程迭代授权；本轮只写交接，未提交/推送。确需同步先看 diff，勿 add 不明材料。.gitignore 忽略 .local、.work-together、.env、.workbuddy-ai 等；日志/截图/会话/密钥只本地。

本机历史用忽略目录内 .local/git-credential.cjs，从 GITHUB_TOKEN/GITEE_OPEN_API 环境给 Git helper 供凭据；不打印值、不写进文档/远程。新环境用正规登录，不复制本机密钥。

~~~powershell
# 确需同步才执行，本轮未执行
# git add HANDOFF.md
# git commit -m 'docs: 更新完整任务交接与验证基线'
# git push origin main

# 双推后分别核对
git rev-parse HEAD
git ls-remote https://gitee.com/ice-colaa/work-together.git refs/heads/main
git ls-remote https://github.com/icecolaa/work-together.git refs/heads/main
~~~

## 9. 下一步计划（候选，按触发条件）

1. **当前交付**：只交付本文件，新窗口依用户指令继续；HANDOFF 未提交，需远程同步时单独提交。
2. **测试可移植性**：继续代码时优先让 Bash 可配置/正确选择，解决 WSL 入口超时；darwin 的“非 darwin 拒绝”用例加平台边界。保持 Windows 23 项和 PS5.1 场景通过。
3. **术语统一**：SPEC/PLAN 初始 Codex 表述、skill/operations 的“经 Codex 验收”“共享日志由 Codex 写”“[Codex/包ID]”等旧词应改主持方。代码已按 hostLabel；验收文档旧未验证句与后文验收三消歧，不能据旧词回退功能。
4. **Mac 真机**：真实 Mac、两款登录应用，按 references/macos.md 从启动/doctor/单包/可见性/验收到混排记录；先审查测试边界，完成前继续实验性。
5. **SkillHub**：用户要发布时查审核/latest、v1.3.0 是否已提交，避免因旧 pending 重复发；版本/文档/安装同步。
6. **升级巡检**：桌面升级先 doctor、小任务，再业务并行。
7. **真实故障演练**：用户明确允许中断的隔离样例做 cancel/失联/恢复，核对原会话、停止、指纹、不重派。模型 error→同会话修复不等于这些演练。
8. **可选增强**：宿主跨回合通知、worktree 隔离、证据归档脚本化，均未承诺实现。

交接标准：只读本文能理解意图、代码/远程/安装、历史与当前验证差异、限制、复现和后续优先级，无需翻长聊天。新代码/环境变化以现场为准更新本文。
