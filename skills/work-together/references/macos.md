# macOS 适配状态（实验性，未现场验证）

> 诚实边界：本适配在 Windows 机器上开发，**未在任何 macOS 真机上运行过**。
> 已做的是：平台感知的核心逻辑（有跨平台单测覆盖）+ darwin 启动器（语法已校验）
> + 明确的失败门。首次在 Mac 上使用时，请先完整执行下文验证清单，
> 并把结果（尤其失败点）反馈到仓库 issues。Windows 是唯一已验证平台。

## 已适配（有单测覆盖纯逻辑）

| 部分 | 说明 |
|---|---|
| 桌面页匹配 | `cdp.mjs matchesDesktopPage`：同时接受 Windows `<install>/ZCode/resources/...` 与 macOS `/Applications/<Name>.app/Contents/Resources/...` 两种渲染页 URL 形态，兼容大小写与 `%20` 转义 |
| ZCode 可执行文件推导 | `cdp.mjs deriveZCodeExecutable`：darwin 从渲染页 URL 解析 `.app` 边界 → `<App>.app/Contents/MacOS/<Name>`（大小写混合后缀已处理）；解析不出返回空串并由 focus() 统一明确报错 |
| focus 重新打开项目 | darwin 分支 spawn `.app` 内的二进制并传 `--open-workspace`（该参数在 macOS 二进制上是否生效属待验证项，见下） |
| 调度器与核心 | `workflow.mjs` / `core.mjs` / `model-policy.mjs` 本就是纯 Node，无平台分支；端口、状态机、归属检测、边界指纹全部一致 |
| 启动器 | `scripts/start-desktops.sh`：复用/退出/重启三态 + `runner.lock` 活跃保护（与 Windows 端 Test-WtActiveWorkflow 等价的最小实现）；仅语法校验，运行时未验证 |

## 明确未做 / 未验证（不要假设可用）

1. **真机桌面桥连通性**：macOS 上 ZCode/WorkBuddy 桌面应用是否存在、`--remote-debugging-port` 启动参数是否被接受、渲染页 URL 的真实形态——全部未知。`doctor` 是唯一入口：连不上会明确失败，不会假报成功。
2. **WorkBuddy 桌面 SDK**（`wb.*`）：`wb.conversations.create/models.list/navigation.goto` 等在 macOS 渲染进程中是否存在、行为是否一致——未知。
3. **React fiber 结构**（`bootstrapZCode`）：依赖 ZCode 渲染层的内部结构，macOS 版本可能不同——`doctor` 会明确报"ZCode 桌面接口已变化"。
4. **`--open-workspace` 命令行参数**：macOS 二进制是否支持——未知；不支持时 `open` 命令会失败（可见性三要素过不去），不影响调度本身。
5. **默认应用路径**：启动器猜测 `/Applications/ZCode.app` 与 `/Applications/WorkBuddyAI.app`；WorkBuddy 的 bundle 名可能是 `WorkBuddy.app`——用 `--workbuddy-path` 显式指定。
6. **归属检测的大小写语义**：APFS 默认大小写不敏感，与 Windows 行为一致；若磁盘为大小写敏感格式，边界比对更严格，不会放松。
7. **PowerShell 生命周期**（`desktop-lifecycle.ps1` 的启动保护全套）：macOS 无等价物；启动器只做了 `runner.lock` 最小保护。不要依赖 `-ForceRestart` 等语义在 macOS 存在。

## macOS 真机验证清单（首次使用请逐项执行并记录）

```bash
# 0. 前置：Node >= 22；已登录 ZCode / WorkBuddy 桌面端
# 1. 启动（如默认路径不对，用 --zcode-path/--workbuddy-path 指定 .app）
bash <skill>/scripts/start-desktops.sh --engine zcode
# 期望：zcode bridge ready (19331)。失败时如实报错即符合预期，把输出发回。
# 2. 预检——这是第一道诚实门
node <skill>/scripts/workflow.mjs doctor zcode
# 期望输出含 "desktop bridge OK"；报"ZCode 桌面接口已变化"说明渲染层结构不同，需适配
# 3. WorkBuddy 同理
bash <skill>/scripts/start-desktops.sh --engine workbuddy
node <skill>/scripts/workflow.mjs doctor workbuddy
# 4. 单包冒烟（examples/plan.example.json 删到只剩一包，engine=该工具）
node <skill>/scripts/workflow.mjs run plan.json
# 5. 核对 status 的 visibility.confirmed=true → 逐字节验收 → verify
# 6. 通过后再试混排与两款并行
```

每一步的实际行为都应反馈到 `docs/verification.md`（照既有格式补 macOS 一节），通过前不要在任何正式任务里使用 macOS 路径。
