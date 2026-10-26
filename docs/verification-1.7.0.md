# v1.7.0 本地多 agent 团队验证

验证日期：2026-10-26（Asia/Shanghai）。新增 team 模式，使用本地 SQLite、消息箱和独立 worktree；现有 Git 远程继续可用，无 Gitea/Mattermost 依赖。本轮未调用 Gitee API、未创建远程 Issue/PR、未推送。

## 自动化回归

原有 38 个测试保留，新增 15 个 team 测试；最终 npm test **53/53 通过**，0 fail、0 skip。覆盖 team 协议、真实多进程认领竞争、租约/旧代次拒收、消息幂等/游标/上下文预算、增量任务图、自主后续提议、桌面规划响应解析、独立 worktree、均衡/认领模式、断线结果未知不重派、逐包归属、依赖产物传递、精确提交验收、集成测试失败、快进后状态恢复、目标基线变化重测及修订任务。

测试使用临时真实 Git 仓库和 worktree，桌面调用由可控模拟适配器提供；模拟结果不等同真实客户端验证。Windows 启动生命周期用例仍包含内部 27 个场景。

## Windows ZCode 真实闭环

本地隔离项目：.local/team-smoke-v17（Git 忽略目录）。使用已登录 ZCode 3.16.3.8992 桌面和原生会话，模型精确 GLM-5.3-FlashX，yolo，reasoningLevel=max。本轮预检发现 ZCode 可用，Qoder 双区/WorkBuddy 双区桥未连接；未为测试重启其他应用。

1. 桌面规划器读取 Spec，自动生成三个任务。alpha、beta 独立，index 依赖前两项集成。程序校验任务图、scope、归属和验收后接纳。
2. 两个 agent（zcode-a、zcode-b）在同一客户端的不同原生会话、不同 worktree 执行。调度事件记录的观测执行区间重叠 **80163 ms**；该数字不证明固定加速比，也不证明模型请求全程并行。
3. 主持方逐字节读取两份产物，检查只修改自身归属，独立执行 node check.mjs，核对原生待办全部完成、idle、无 pending，并重新打开各目标项目/会话/正文以确认显示。
4. verify 绑定各任务精确提交，collect 在隔离候选工作树重测，再串行快进本地集成分支。
5. index 工作树基线包含已集成的 alpha/beta。主持方通过本地消息箱发送协调决策；index agent 读取并引用 seq=1，完成后调用 report 向共享消息箱上报 finding（seq=2）。这验证了实际桌面 agent 到消息接口的双向链路。
6. 主持方独立读取 index 和两项依赖，核对原生 7 项待办全部 completed、idle、无 pending，刷新可见性证据；verify/collect 后三个任务均为 merged，最终团队检查输出 SMOKE_CHECK_OK、退出码 0。

| 产物 | 主持方核对结果 |
|---|---|
| drafts/alpha.txt | 精确 TEAM_ALPHA_OK 加 LF，14 字节，无 BOM/CR |
| drafts/beta.txt | 精确 TEAM_BETA_OK 加 LF，13 字节，无 BOM/CR |
| drafts/INDEX.txt | 精确 alpha.txt 加 LF、beta.txt 加 LF，19 字节，无 BOM/CR |

最终成果只在本地 codex/team-* 集成分支；隔离项目主分支工作区仍干净、主目录未出现 drafts。调度进程在全部 merged 后正常退出并释放 runner.lock。个人会话 ID、认领令牌、原生快照、账号元数据、消息原文和完整证据仅保存在本地忽略目录，不写入公开材料。

## 现场发现与处理

- 规划器会先返回说明消息，再单独返回 JSON。直接拼接全部完成消息会导致 JSON 解析失败。现改为从最新完成消息中提取合法结构，保留并恢复原会话，现场未重派；对应回归已加入。
- 主持方独立复核时，ZCode readSession 曾返回 Session is not active；先 open 原工作区/原会话后读取成功。没有重建会话或改数据库。用户切换/关闭工作区导致原桥不可读时，仍保留 unknown 并要求 open/原会话恢复，不将此类错误当作停止证明。
- Windows 测试夹具受全局 autocrlf 影响而转换换行。测试临时仓库显式禁用转换，真实产物仍按原始字节独立比对。

## 验证边界

本轮真实覆盖 Windows ZCode 自动规划、同客户端两 agent 并发、三任务依赖、独立工作树、消息读取/上报、原生待办/可见性、独立验收和本地集成。跨客户端 team 调度采用模拟回归验证，当前离线的其他桌面没有新现场证据；v1.4.0 的五执行器证据仍属于旧模式历史基线。v1.7.0 当时未提供 macOS 真机、多机、team 主持方切换、Gitee API 或外部聊天现场验证。后续 v1.8.0 已新增 Gitee Issue/PR 同步，见 [独立验证记录](verification-1.8.0.md)，不能据本历史边界否认新版本能力。
