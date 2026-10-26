# v1.8.0 Gitee Issue / PR 自动化验证

验证日期：2026-10-26（Asia/Shanghai）。基于本地 team 模式，新增 Gitee OpenAPI 适配器及独立 sync/watch；不依赖外部聊天平台或公网 WebHook。

## 接口与认证

现场读取 Gitee 官方 Swagger JSON，版本 **5.4.93**。Issue 创建使用 owner 级接口、repo 作为 form 参数；Issue 编号保持字符串，PR 编号为整数。请求使用 Bearer header，不将令牌写入 URL、数据库或配置文件。

复用现有 GITEE_OPEN_API 环境变量，预检确认 ice-colaa 身份、ice-colaa/work-together 仓库、main 基线及 Issue/PR 开关有效。没有新建令牌或更改账号权限。

官方依据：[Gitee OpenAPI](https://gitee.com/api/v5/swagger)、[Swagger JSON](https://gitee.com/api/v5/swagger_doc.json)。接口快照仅保存在 .local，不随代码发布。

## 自动化回归

npm test **65/65 通过**（旧模式 38、team 15、Gitee 12），0 fail、0 skip。Gitee 测试使用真实临时 Git 仓库/工作树和模拟远程 API，覆盖：

- 官方路径、form/Bearer 格式、字符串 Issue 编号、凭据不进入 URL/异常。
- 完整分页及扫描上限、配置拒绝令牌明文/自定义 API 主机。
- 未完成任务只建 Issue，重复同步不重复创建，人工正文与终态保留。
- Issue/PR 创建应答丢失后按标记接回，尚未对账到对象时不盲目 POST；显式证据释放重试。
- 重复管理标记和目标绑定冲突时拒绝猜测。
- 全部任务已验收集成才发布团队 PR；精确远程合并后关闭相应 Issue，本地状态独立。
- 人工关闭 PR 不重开，远程 head 被改动不关 Issue、不强推；未登记集成提交不能发布。
- 新增任务使用下一发布轮次，旧 PR 不关闭新增任务 Issue；dry-run 不需要令牌且没有远程副作用。

专用发布分支与目标分支同名的误配置另有断言，避免直接推送目标分支；操作恢复后清除已解决的历史错误。

## 真实 Gitee 写入、对账与清理

使用现有公开仓库的独立克隆 .local/gitee-smoke-v171（历史测试目录名），从 main 的 6d683f0 基线生成一份隔离验证文档 docs/team-gitee-smoke.md。此任务由本地测试控制器生成并独立比较内容/单文件 diff，没有伪造桌面会话或声称本轮运行了 coding agent。

1. 预览准确列出一个任务 Issue、一个团队 PR，以及即将发布的集成 SHA。
2. gitee sync 创建 [测试 Issue IKQIKS](https://gitee.com/ice-colaa/work-together/issues/IKQIKS)，推送专用 codex/team-a1bc7789-gitee-1 分支，并创建 [测试 PR #1](https://gitee.com/ice-colaa/work-together/pulls/1)。
3. 多次运行同步，远程同一管理标记始终各有一个 Issue 和 PR，编号不变；来源 head 与已登记集成 SHA 一致。
4. 在 Issue 管理区块外追加备注，重新同步后备注仍存在。
5. 通过 Gitee PR 文件接口独立确认变更只有 docs/team-gitee-smoke.md，没有产品代码或其他文件。
6. 检查远程正文不含本机绝对路径或令牌。测试结束显式关闭 Issue 和 PR；再次同步保持关闭，没有重开或新建。
7. PR **未合并**。main 前后 SHA 均为 6d683f0424fe238b8eb8f3064c33e7882fe44651。远程验证分支保留作追溯，没有 force、main 推送或 GitHub 镜像推送。

详细 proof、映射和预览留在忽略目录内。公开记录只包含验证所需的远程编号、分支与提交，不包含令牌、原生会话或私人消息。

本机安装包已同步 28 个源文件，SHA256 差异为 0；安装版 gitee watch --once 再次对账通过，已关闭对象保持关闭。Skill 核心字段临时投影校验、版本一致性及入口文档链接检查通过。

## 边界

真实验证覆盖 API 认证、Issue/PR 创建/更新、Git 单分支推送、重复对账、人工内容保留及测试单关闭。远程 PR 合并后自动关 Issue、新发布轮次和网络故障注入由模拟回归覆盖；本轮没有合并测试 PR 来冒充这些现场结果。

当前不提供远程 PR 自动合并、CI 检查写入、分支保护配置、WebHook 服务器或企业私有域名。sync/watch 需要显式启动，不会因普通 team run/collect 而静默发布。
