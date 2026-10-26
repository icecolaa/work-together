# HANDOFF — work-together 新窗口交接

核对日期：2026-10-26（Asia/Shanghai）。当前源码 **v1.8.0**，包含本地 team 模式及 Gitee Issue/PR 自动化。本文替代 v1.6.2 交接快照；历史过程查 Git 和 docs/verification*.md。功能源码尚未提交/推送；本轮仅向 Gitee 推送过隔离验证分支，测试 Issue/PR 已关闭且未合并；未发布 SkillHub。

## 1. 已接受的目标与当前交付

用户要求自动拆分任务、给同一执行器或多个执行器分配多任务、agent 自主认领/共享发现、独立验证、合并团队成果，以及主持方展示各 agent 状态。选型已确定：**复用现有 Gitee，本地常驻调度服务 + SQLite 消息箱 + 独立 worktree，首版不接 Mattermost/Gitea**。

v1.7.0 新增 scripts/team.mjs 入口，旧 workflow.mjs 的 run/verify/takeover 保持兼容；同一目录两种模式不能混跑。没有 Codex 桌面 Exec 适配器。

已实现：
- 桌面规划器按 Spec 自动返回结构化任务图，程序校验 scope、路径/链接、依赖、能力、验收及总任务预算；保留手写计划。
- engine / agent / task / attempt / native session 分离，同一客户端可配置多个 agent，支持容量均衡、优先级、显式认领及固定任务队列。
- SQLite 事务保证唯一认领，保存状态/事件/消息；租约过期转 unknown，旧令牌拒收，不因失联直接重派。
- 每个尝试独立 worktree/分支，按单任务检测归属，依赖必须集成后再启动。
- 共享消息与发现、游标分页、有限大小上下文快照；agent 可在 scope/预算内自主提议后续任务，自动附加父依赖。
- 主持方独立 verify 绑定精确提交，collect 在候选工作区重测、串行快进本地集成分支；基线变化重新测试，源码变化阻断旧验收。
- retry / revise 保留旧尝试与产物，修订后重新执行和验收；明确停止的 unknown 可凭独立证据 abandon。
- status/watch 和团队 STATUS.md 展示 agent 当前任务、显式队列、容量、最近桌面响应、阻塞及各任务集成状态。
- v1.8.0 新增 Gitee init/doctor/plan/sync/watch/status/retry：每任务一个 Issue，全部独立验收集成后发布一个团队 PR，轮询同步远程状态。按标记/SHA 对账、未知请求不盲重试、保留人工正文/终态，只有精确远程合并才关闭相应 Issue。

普通 run/collect 默认保持本地；用户显式使用 gitee sync/watch 后才创建 Issue、推送专用团队分支和创建 PR。不会自动合并 PR、推送目标分支或修改分支保护。尚不接外部聊天、不支持多机 worker 或 team 主持方切换命令。接入配置 .work-together/gitee.json 仅保存环境变量名，API 令牌从现有 GITEE_OPEN_API 读取，Git 凭据单独沿用已有配置。

## 2. 本轮验证

| 项目 | 结果 |
|---|---|
| 项目 / 分支 | E:\code\work-together / main |
| 修改前 HEAD | 6d683f0424fe238b8eb8f3064c33e7882fe44651 |
| 修改前工作树 | 研究文档 docs/multi-agent-feasibility.md 已存在为未跟踪文件，本轮保留并更新 |
| 版本 | package.json、源 SKILL.md 均为 1.8.0 |
| Node | 本机 v26.5.1；team 要求 >=22.13，使用 node:sqlite，无 npm 运行依赖 |
| 自动化 | npm test **65/65 通过**，0 fail、0 skip；旧模式 38、team 15、Gitee 12；末尾目标分支保护与操作错误清理另有定向重跑 |
| Windows 启动 | 全测内通过，内部 27 场景；本轮未重新单独跑 PS5.1，上一轮 v1.6.2 曾通过 |
| 桌面预检 | ZCode 桥可用；Qoder 双区、WorkBuddy 双区未连接，本轮未启动或重启这些应用 |
| 真实 team 闭环 | Windows ZCode 3.16.3.8992，精确 GLM-5.3-FlashX / yolo / max；自动规划三任务、双 agent、消息、独立验收、串行集成通过 |
| 并发观测 | 两任务事件区间重叠 80163 ms；不代表固定加速比或模型请求全程并行 |
| 测试项目状态 | 三任务 merged，检查输出 SMOKE_CHECK_OK；主分支工作区干净、主目录没有产物；runner 已退出、锁已释放 |
| Gitee 真实验证 | 复用 ice-colaa/work-together；成功创建并对账测试 Issue IKQIKS、PR #1，人工正文保留，远程差异仅一份测试文档，已关闭测试单，PR 未合并 |
| 远程 / SkillHub | Gitee main 测试前后均为 6d683f0，独立测试分支保留追溯；功能源码与 GitHub 镜像未推送，SkillHub 未发布 |

本机 Skill 安装目录为 C:\Users\lenovo\.codex\skills\work-together。v1.8.0 已同步全部 28 个源文件，SHA256 差异为 0；安装版 gitee watch --once 对账通过，测试 Issue/PR 保持 closed、未合并。临时投影的 Codex 核心校验、源 SkillHub 扩展元数据/版本一致性和文档链接检查均通过，不删除源扩展字段。

现场细节见 docs/verification-1.7.0.md；原生会话、令牌、消息原文、完整证据只在 .local/team-smoke-v17/.work-together，Git 忽略。不要把个人 sessionId/账号配置写入公开交接。

Gitee 细节见 docs/verification-1.8.0.md；接口快照和真实远程对账 proof 位于 .local/gitee-openapi.json、.local/gitee-smoke-v171/.work-together/team/gitee-proof.json，仅本地。Gitee 测试由控制器生成隔离文档，并未伪造或重复运行桌面 agent。PR 合并后自动关 Issue 等故障路径是模拟回归，不冒称现场合并验证。

现场曾发现规划器先发说明再单独发 JSON，旧拼接方式解析失败。已修复为优先检查最新完成消息，恢复同一会话取得计划，未重派。独立复核时 ZCode readSession 曾报 Session is not active；open 原工作区/会话后读取成功，未新建会话。

## 3. 当前核心约束

- 主持方缺省 codex，默认候选顺序：zcode → qoder-global → qoder-cn → workbuddy-global → workbuddy-cn。端口依次为 19331、19333、19334、19332、19335。
- ZCode 精确 GLM-5.3-FlashX，不静默替换 Flash；Qoder 双区要求明确零费 DeepSeek，WorkBuddy 国际版要求零费 DeepSeek 工具模型，国内版可用其他明确零费工具模型。Auto/空费率/未标价不算免费，不回退收费模型。
- family() 按品牌整族排除：Qoder 主持排除双区 Qoder，WorkBuddy 主持排除双区 WorkBuddy。README 矩阵已修正。
- 旧模式失败切换预判已改用现任 state.coordinator，fallback=false 也检查同族；存在 unknown 时其他 running/needs_user 继续观测。
- team 全局 concurrency 为 1..4，每个 agent capacity 为 1..4，实际并发能力必须验证。balanced 按容量分配，priority 按候选顺序，claim 只处理显式认领。
- 可见性仍需正确项目、选中会话、正文任务标记；open 修复原会话。执行交回仅 exec_done，主持方须独立读产物/待办/diff/测试证据。
- verified 与 merged 分开。依赖按 merged 解锁，确保新工作区具有依赖代码。collect 不修改项目主工作目录，不自动推送。
- Gitee 同步显式绑定仓库/base；本地 merged 只表示已集成。远程 PR head 必须匹配发布 SHA，且任务当前验收提交仍匹配才关 Issue。人工关闭不重开；源分支被他人改动时不覆盖；不强推或合并 PR。使用轮询而非公网 WebHook。
- 文件归属/worktree 都不是 OS 沙箱；全局依赖、数据库、构建共享输出、外部端口仍要分配唯一责任。team 只承诺 Git 可见产物的逐包边界检测。
- SQLite 为唯一状态来源；state.json 为旧启动保护兼容投影，禁止手改投影。SQLite 不入 Git，不作为跨机器共享文件。
- 同目录一个 runner；team 和旧 workflow 共用 runner.lock，工作区管理另有锁。创建/受理未知不重派；过期尝试继续隔离，独立确认停止后才释放。
- team 进程可常驻，不表示聊天能自动唤醒。桌面私有桥、后台宿主生命周期和 Mac 支持继续有明确验证边界。
- 旧 workflow takeover 需原调度器退出，恢复按初始主持方校验；接管后同族包默认拒绝自验，--self-review 显式登记。team 暂不支持该命令，旧命令不会改写 team 状态。

## 4. 入口与命令

所有 scripts/references/examples 路径均位于 skills/work-together/ 下。

| 入口 | 用途 |
|---|---|
| scripts/team.mjs | 新模式 CLI：init/plan/run/status/watch/claim/append/propose/message/report/inbox/open/cancel/abandon/retry/revise/verify/collect/stop |
| scripts/team-core.mjs | v2 计划校验、能力匹配、容量/依赖/归属、视图 |
| scripts/team-store.mjs | SQLite 事务、事件、认领、消息、增量图和修订 |
| scripts/team-workspace.mjs | Git worktree、逐包边界、控制器提交、测试、候选集成 |
| scripts/team-runtime.mjs | 桌面自动规划、执行轮询、可见性、独立验收和汇总 |
| references/team.md | team 完整配置、后台运行、通信、恢复和集成说明 |
| scripts/gitee-client.mjs / team-gitee.mjs | Gitee 官方 API、配置/仓库识别、任务映射、对账和专用分支发布 |
| references/gitee.md / examples/gitee.config.example.json | Gitee 初始化、预览/同步/监控、未知操作恢复及配置 |
| examples/team.config.example.json | scope、agent、checks 示例 |
| scripts/workflow.mjs / core.mjs / executors.mjs | 保持兼容的旧调度、归属/指纹、候选/停止确认 |
| scripts/cdp.mjs / qoder.mjs / model-policy.mjs | 现有桌面桥和模型策略 |
| tests/team.test.mjs | 15 个新增测试，临时真实 Git/多进程 + 模拟桌面 |
| tests/gitee.test.mjs / docs/verification-1.8.0.md | 12 个 Gitee 回归及真实远程验证记录 |
| docs/verification-1.7.0.md | 本轮真实验证与边界 |
| docs/multi-agent-feasibility.md | 初始研究和分阶段改造清单，完成情况以当前交接为准 |

在实际任务仓库根目录使用，先提交需共享的干净基线，不在源仓库重复派发 smoke：

~~~powershell
$team = 'C:/Users/lenovo/.codex/skills/work-together/scripts/team.mjs'
node $team init
# 编辑 .work-together/team.config.json，指定 Spec/scope/agent/检查脚本
node $team plan SPEC.md
node $team run
# 需要时由支持后台运行的宿主隐藏启动 run，另一个终端/主持聊天跟进：
node $team status
node $team verify task-a .work-together/task-a.review.md
node $team collect
~~~

上述命令按实际阶段使用。run 已有记录必须 --resume，规划结果未知用相同输入 plan --resume；不要再次 init/run 创建重复任务。stop 不取消桌面任务，cancel 必须确认停止。具体恢复、消息及修订见 references/team.md。

Gitee 任务同步在对应 team 项目根目录执行：gitee init → doctor → plan（或 sync --dry-run）→ sync；持续对账用 gitee watch --interval 60。源项目已初始化 Gitee 本地配置并完成 doctor，但没有为源码开发伪造 team 任务，因此不要在源码根直接 sync 未初始化的团队状态。预览不需要令牌；配置文件禁止存明文令牌或自定义 API 主机。

## 5. 历史证据与发布习惯

- docs/verification-1.4.0.md：2026-10-24 五执行器 marker 任务、实际模型、可见性和独立验收；预检不可用 ZCode → Qoder 国际版回退通过，不等于真实额度耗尽演练。
- docs/verification.md：早期 Codex/ZCode/WorkBuddy 主持闭环。不是新 team 多客户端或六种主持全覆盖证据。
- .local 旧 state：smoke-zcode、smoke-workbuddy-v2、smoke-coordinator-zcode、smoke-mixed、smoke-coordinator-workbuddy 与 visibility 样例均登记 verified；smoke-workbuddy 为 exec_done 的历史越界样例，不是新待办。
- 原 Bash/WSL 入口误选及 darwin 拒绝用例平台判断已在旧版修复，不再列待修。WT_TEST_BASH 仍可指定 Git Bash。
- 改源 skills/work-together，验证后同步本机安装，根/Skill 版本一致。quick_validate.py 只认识 Codex 核心字段；临时投影验证核心字段，另核对 SkillHub 扩展元数据，不删源扩展字段。
- origin fetch 为 GitHub，源码发布 push URL 顺序 Gitee→GitHub。推后分别核对两端 SHA。本轮只向 Gitee 直推独立验证分支，未推功能源码或 GitHub 镜像；Gitee 自动化只用精确 Gitee URL，不使用 origin 的多目标 push。
- GitHub：https://github.com/icecolaa/work-together；Gitee：https://gitee.com/ice-colaa/work-together。
- SkillHub：https://skillhub.cn/skills/user_5dea5c46/work-together。历史 pending/提交不代表当前 latest；发布前实时查状态及官方规则，避免重复提交。
- 微信原始参考曾被验证页阻挡，未取得正文，不声称据其补齐功能。日志/截图/令牌默认只留本地。

## 6. 后续边界与候选

1. 将 team 新 worktree/同客户端多实例模式在其他四款 Windows 执行器现场验证；目前仅 ZCode 有新闭环证据。
2. 多机 worker、服务认证、资源池/分布式领导者和 team 主持方切换，需进一步设计与故障验证。
3. Gitee Issue/PR 轮询同步已实现；WebHook、CI 检查写入、远程自动合并及企业私有域名仍未提供。可选聊天适配后续按需实施，本地共享消息已能完成协作。
4. 自主提议是受 scope/预算和父依赖约束的后续任务，不是任意递归重写现有执行图；更复杂重规划、重复语义任务识别、按价值分配预算仍待增强。
5. macOS 真机、真实额度耗尽/cancel/失联全链路演练仍有缺口，逻辑回归不能冒称现场验证。
6. 终端/文件视图已实现，交互看板、宿主通知、自动安全清理 worktree 和证据归档可按需求增加。
