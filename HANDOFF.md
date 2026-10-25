# HANDOFF — work-together 新窗口交接

核对日期：2026-10-25（Asia/Shanghai）。本文依据现有源码、测试、Git 和本机安装重整，替代此前叠加的旧快照。历史过程见 Git 历史及验收文档，历史验证不代表当前桌面在线。

## 1. 当前状态与本轮验证

项目当前 **v1.6.2**。六款客户端聊天可主持，五款桌面执行器按候选策略执行；已实现任务归属调度、独立验收、失败切换、主持接管及自验登记，没有 Codex 桌面 Exec 适配器。

| 项目 | 本轮核对结果 |
|---|---|
| 工作目录 / 分支 | E:\code\work-together / main |
| 修改前 HEAD | 5485fc4a322a6d5035ade8e5496f89703200d0f0 |
| 双远程 | 分别 git ls-remote，GitHub、Gitee main 均与上述 HEAD 一致 |
| 工作树 | 开始时干净；本轮仅更新 HANDOFF.md，未提交、推送或发布 |
| 版本 | package.json、源 SKILL.md 均为 1.6.2 |
| 本机安装 | C:\Users\lenovo\.codex\skills\work-together，17 个源文件均存在且 SHA256 一致；未核对安装目录额外文件 |
| Node | v26.5.1，要求 >=22，无 npm 运行依赖 |
| 全测 | npm test **38/38 通过**，0 fail、0 skip；生命周期内部 27 场景 |
| PowerShell 5.1 | 显式指定系统 Windows PowerShell，startup.test.mjs **1/1 通过**，内部 27 场景 |
| 根目录任务记录 | 无 .work-together/state.json、runner.lock，不代表其他项目无任务 |
| 桌面状态 | 本轮未启动/重启桌面，未运行 doctor，未派发或重做现场验收 |
| SkillHub | 本轮未查线上审核/latest，未发布；本地版本与 Git 同步不证明线上已上架 |

最近提交：5485fc4（v1.6.2 老板/员工概述）、39136e8（v1.6.1 新手路径和排障）、8edcbb4（v1.6.0 六客户端主持、启动跳过同族）、84e41b6（v1.5.0 接管、自验）。

## 2. 源码行为与不能破坏的约束

### 2.1 主持方、候选与模型

core.mjs 缺省 coordinator=codex、engine=auto。**concurrency 必须显式指定为 1..4 的整数**，示例使用 2，validatePlan 不补默认值。workflow 按主持方生成会话标题和派发提示词。

| 顺序 | engine | 端口 | 默认模型策略 |
|---|---|---|---|
| 1 | zcode | 19331 | 精确 GLM-5.3-FlashX，yolo；优先 reasoningLevel=max，实际取模型支持项 |
| 2 | qoder-global | 19333 | 已启用且 priceFactor=0 的 DeepSeek |
| 3 | qoder-cn | 19334 | 已启用且 priceFactor=0 的 DeepSeek |
| 4 | workbuddy-global | 19332 | 明确零费率、支持工具调用的 DeepSeek |
| 5 | workbuddy-cn | 19335 | 明确零费率、支持工具调用的模型 |

Qoder / WorkBuddy 默认权限为 bypassPermissions。Auto、空费率、未标价和付费模型不能充当免费候选；耗尽后报告，不回退收费模型。报价以当前目录查询为准。旧记录中的 GLM-5.3-Flash 和“最低付费回退”已失效。

workbuddy / qoder 分别为对应 global 别名。显式 engine 从该项向后尝试；fallback=false 锁定单项，auto 时取首个非主持方同族候选。每任务每候选最多一次。executor=both 是提示词/启动器兼容入口，不能写 plan.engine=both。auto 不接受通用顶层 model，可用 models 按执行器指定。

**整族排除以代码为准**：executors.mjs 的 family() 按品牌前缀分类。Codex 主持可用全部五款；ZCode 主持可用 Qoder/WorkBuddy 双区；Qoder 任一区主持只能用 ZCode、WorkBuddy 双区；WorkBuddy 任一区主持只能用 ZCode、Qoder 双区。根 README 矩阵仍允许同品牌另一地区执行，与源码不符，待修。

### 2.2 调度与验收

- 每包有合法唯一 id、prompt、files、acceptance，可有 dependsOn、独立 engine；拒绝循环/未知依赖、归属越界和穿过工作区外的链接。
- 相交文件/父子目录归属串行，依赖必须等前置包 verified。文件归属是约定和事后检测，不是 OS 隔离；Git index、构建输出、依赖安装、端口、数据库等共享状态单独协调。
- 状态含 queued、creating、dispatching、running、needs_user、exec_done、verified、failed、unknown、blocked、cancelled。执行者完成仅算 exec_done。
- 创建/派发结果未知、断连时保留 unknown，不重派，先查原会话。失败切换前须确认原会话停止，保留原会话及摘要，继续已有产物。
- 可见性必须同时满足正确项目、目标会话选中、正文任务包标记，写 .work-together/<id>.visibility.json；失败用 open 修复原会话，禁止重派。
- verify 要求 exec_done、匹配当前项目/会话的可见性证据、无归属外变更、非空独立验收证据文件。它不判断证据文字真伪，主持方须亲自核对产物、原生待办和必要测试。
- 指纹排除根目录 .git、.work-together，检测其他路径的增/改/删。归属外变更阻断验收，runner 收尾可返回退出码 2；主持辅助材料应在基线前就位或放 .work-together。
- 同项目一个 runner.lock。run --resume 校验原计划路径、engine、初始主持方和计划哈希；creating/dispatching 恢复时转 unknown。
- 全部交回时 runner 可能先退出，仍需独立登记 verified；锁释放而旧 PID 尚存时的离线验收已有回归。
- watch 只读 state，不轮询桌面；全部交回或进入失败/未知等终态会返回，runner/主持方仍负责跟进。

### 2.3 接管与启动

takeover <执行器> 要求旧调度器退出、目标为不同家族的有效桌面执行器；写 coordinatorHistory，status/STATUS.md 显示来源。当前 takeover 不接受 codex 作为目标，尽管 codex 可作为新计划主持方。

接管后正常候选选择按现任主持方过滤；恢复仍用原 plan，按历史链起点校验初始主持方。同族执行且未验收的包默认拒绝自验，--self-review 显式登记 reviewer/selfReviewed，或交其他工具复核。该标记不等于独立复核。相关 4 个 Node 测试通过，真实桌面接管全链路演练尚无现有验收记录。

Windows start-desktops.ps1 的 auto/all/both 根据当前目录 plan.json 的 coordinator 或 -Coordinator 参数跳过同族，显式单项 -Engine 覆盖启动选择过滤。**接管后原 plan 仍为初始主持方，启动时显式传现任 -Coordinator**；启动器不会自动读取 coordinatorHistory。

健康实例复用，缺调试端口的所选应用可自动退出/重启。当前项目活跃任务、持锁主持方受保护，状态不可读保守拒绝；不是所有项目的全局保护。仅用户明确允许中断后用 -ForceRestart，随后查原会话。按可执行文件完整路径定位，避免按名字误杀其他安装。

macOS 仍实验性、未真机验证；已有 .app 页面/路径推导、Bash 启动器及清单，但启动器只保留旧 ZCode / WorkBuddy 国际版入口，不支持五级 Windows 参数。首次须按 references/macos.md 真机验证。

桥依赖版本相关的本机私有接口，不改 app.asar/数据库，不复制密钥；升级后 doctor 和小任务验证。skill 不会在主持回合结束后自行唤醒，跨回合通知需要宿主机制。

## 3. 验证证据与边界

**旧测试问题已解决**：cross-platform.test.mjs 支持 WT_TEST_BASH，Windows 自动找 Git Bash、排除 System32/WindowsApps 的 WSL 入口。Bash 语法与非 darwin 拒绝检查已拆分，darwin 跳过拒绝用例，拒绝要求退出码 2。本轮不修改 PATH 即全测通过，勿再将两项列为待修。

当前 38 个测试覆盖归属/链接、依赖、候选顺序及有界失败、免费策略、停止确认、未知保护、Qoder 区域协议/回合状态、可见性、接管/自验/恢复、验收竞态、启动生命周期和 macOS 纯逻辑/语法。

docs/verification-1.4.0.md 记录 2026-10-24 五执行器真实 marker.txt 任务、实际模型、会话可见性及主持方独立 verify：

| 历史客户端版本 | 现场实际模型 |
|---|---|
| ZCode 3.16.3.8992 | GLM-5.3-FlashX，yolo |
| Qoder 国际版 0.4.9.0 | dfmodel / DeepSeek-Flash，零费率 |
| Qoder 国内版 0.4.8.0 | dfmodel / DeepSeek-Flash，零费率 |
| WorkBuddy 国际版 5.8.4.0 | deepseek-v4.1-flash，零费率 |
| WorkBuddy 国内版 5.8.3.0 | step-5-preview，零费率 |

产物为 WORK_TOGETHER_SMOKE_OK 加 LF（23 字节、无 BOM）。不可用 ZCode 模型在预检阶段回退 Qoder 国际版已现场通过；未人为耗尽真实额度，运行中故障交接主要靠模拟回归。上述版本/模型来自历史文档，本轮未重查桌面。

docs/verification.md 保留早期 Codex、ZCode、WorkBuddy 三种主持闭环。Qoder 双区、WorkBuddy 国内版聊天主持及真实 takeover 的完整现场覆盖尚未补齐，不能从五执行器通过推断已经通过。

本轮读取 .local 下历史 state，仅核对登记，未重验产物/桌面：

| .local 子目录 | 登记状态 |
|---|---|
| smoke-zcode、smoke-workbuddy-v2 | 各 alpha/beta verified |
| smoke-workbuddy | alpha/beta exec_done，历史越界样例，不是新待办或完整通过 |
| visibility-zcode、visibility-workbuddy | 各 visible-check verified |
| smoke-coordinator-zcode | alpha/beta verified |
| smoke-mixed | zside/wbside verified |
| smoke-coordinator-workbuddy | zexec verified |

会话、截图、日志、账号元数据和原始发布响应只留本地，不把个人会话 ID 或密钥抄进公开文档。

## 4. 文件入口与发布

| 文件（相对项目根） | 用途 |
|---|---|
| README.md | 安装、矩阵、文档地图 |
| skills/work-together/SKILL.md | Skill 入口、版本和工作流 |
| skills/work-together/scripts/workflow.mjs | doctor/run/status/watch/open/verify/cancel/takeover |
| 同目录 core.mjs、executors.mjs、model-policy.mjs | 计划/归属/指纹、候选/停止确认、模型/费率 |
| 同目录 cdp.mjs、qoder.mjs | 桌面桥、会话、导航和区域协议 |
| 同目录 start-desktops.ps1、desktop-lifecycle.ps1、start-desktops.sh | Windows 生命周期、实验性 Mac 启动 |
| skills/work-together/references/、examples/ | 运行说明、FAQ、样例、Mac 清单及模板 |
| tests/*.test.mjs、tests/desktop-startup.ps1 | 38 个 Node 测试，生命周期内部 27 场景 |
| docs/verification*.md | 历史现场证据 |
| prompts/ai-collaboration.md、SPEC.md、PLAN.md | 提示词、初始合同和交付勾选表 |

改源 skills/work-together，验证后再同步安装，不只改安装副本。根/Skill 版本一致。本轮仅改交接，无需升级 Skill 版本或同步安装。

GitHub：<https://github.com/icecolaa/work-together>；Gitee：<https://gitee.com/ice-colaa/work-together>。origin fetch 为 GitHub，push 顺序 Gitee→GitHub；推后分别核对两端 SHA。本轮未提交/推送。

SkillHub：<https://skillhub.cn/skills/user_5dea5c46/work-together>。旧交接记录 v1.3.1 提交待审、v1.5.0 发布操作；本轮未查线上，不推断当前 latest/审核。发布前先查账号、审核、版本，避免重复提交；发布规则以当时实时资料为准。quick_validate.py 只接受 Codex 核心字段，不能用它直接拒绝 SkillHub 扩展字段，历史校验通过不代替当前检查。

## 5. 继续工作命令

核对与测试不启动桌面：

~~~powershell
Set-Location 'E:\code\work-together'
git status --short
git log -3 --oneline
npm test

# 需要单独核对 PS5.1 时运行
$env:WT_TEST_POWERSHELL = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
try { node --test tests/startup.test.mjs }
finally { Remove-Item Env:WT_TEST_POWERSHELL }
~~~

真实协作先到任务根目录检查已有 Spec/plan/state/改动，决定新任务或恢复；不要在源码仓库重复派发旧 smoke。以下是不同阶段参考，不应无条件依次执行：

~~~powershell
$skill = 'C:/Users/lenovo/.codex/skills/work-together'
$runner = "$skill/scripts/workflow.mjs"
# 按当前聊天指定主持方，只启动本次所需桌面
powershell -NoProfile -ExecutionPolicy Bypass -File "$skill/scripts/start-desktops.ps1" -Engine auto -Coordinator codex
node $runner doctor qoder-global

# 计划/Spec/辅助材料先就位，runner 交给可承载后台进程的宿主启动
New-Item -ItemType Directory -Force .work-together | Out-Null
Start-Process node -ArgumentList @($runner,'run','plan.json') -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput '.work-together/runner.out.log' -RedirectStandardError '.work-together/runner.err.log'
node $runner status
node $runner watch

# 按实际阶段选择：显示修复 / 独立验收登记 / 原计划恢复
node $runner open draft-a
node $runner verify draft-a .work-together/draft-a.verify.md
node $runner run plan.json --resume

# 旧调度器退出后，在目标客户端聊天内按需接管
node $runner takeover qoder-global
~~~

run/resume 不与旧 runner 并行；验收证据须来自主持方真实核对。unknown 查原会话，cancel 送达不等于已停。headless 宿主可能回收分离进程，应由支持后台运行的调用方启动，不反复绕过进程策略。

## 6. 后续候选与核对发现

1. **文档一致性**：README 矩阵允许同品牌另一地区执行，与整族排除不符；SKILL.md 新手引导重复，历史版本提示未充分反映 v1.4.0 五客户端验证；SPEC/PLAN、提示词和部分运行说明有早期 Codex 专属用词。修订时保留历史合同与现功能的区别。本轮仅更新 HANDOFF。
2. **接管后派发边界复核**：正常 selectExecutor 用 state.coordinator，但 workflow 的运行失败后候选预判仍传 plan.coordinator，fallback=false 分支也未像正常候选选择一样重新过滤现任主持方同族。现有接管测试不代表覆盖这些分支；修改前补针对性回归、明确预期。
3. **现场故障/接管演练**：用户允许中断的隔离任务中补 cancel、失联、停止确认、恢复及 takeover，核对原会话、归属和不重派；不声称完成真实额度耗尽演练。
4. **Mac 与主持覆盖**：按 macos.md 真机验证；补 Qoder 双区、WorkBuddy 国内版聊天主持的完整现场记录，完成前保留边界。
5. **发布/升级按需**：SkillHub 审核/latest 实时查询，桌面升级先 doctor 和小任务。本轮未发布、重启应用。
6. **可选增强**：跨回合宿主通知、worktree 隔离、证据自动归档未承诺实现，不当作当前能力。

微信原始参考曾被验证页挡住，未取得正文，不声称据此补齐功能。旧 Bash 可移植性和 darwin 测试判断问题已解决，不再作为下一步。
