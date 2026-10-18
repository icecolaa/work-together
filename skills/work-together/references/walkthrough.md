# 端到端实战样例：两包混排从规划到验收

以下流程取自一次真实现场验收（dual-executor 混排，主持方=Codex CLI，执行器=ZCode + WorkBuddy 各一包），含一次真实的失败恢复。所有命令与输出形态均为实录摘要。

## 0. 现场

项目目录 `my-project/`，目标：两个独立小任务（各写一个标记文件）分派给两款工具并行执行。主持方是 Codex，因此 `coordinator=codex`，两包分别指给 zcode 与 workbuddy。

## 1. 写 SPEC 与 plan（主持方职责）

`SPEC.md` 写清目标/边界/交付物/逐条验收/回退入口（模板见 `examples/SPEC.template.md`）；`plan.json` 拷贝 `examples/plan.example.json` 修改。要点：每包 `files` 唯一归属；执行器 engine ≠ coordinator；包间无依赖才并行。

## 2. 预检（两台桌面都要过）

```
$ node <runner>/workflow.mjs doctor zcode
zcode: desktop bridge OK; {"providerId":"account:...","modelId":"GLM-5.3-Flash","options":{"reasoningLevel":"max"},"mode":"yolo"}
$ node <runner>/workflow.mjs doctor workbuddy
workbuddy: desktop bridge OK; {"id":"step-5-preview","rate":0,"policy":"free-first",...,"permissionMode":"bypassPermissions"}
```

doctor 同时暴露逐引擎模型策略——这就是执行时将使用的模型与权限。

## 3. 启动调度器

交互式主持（Codex 聊天 / ZCode 聊天）可由主持会话自己后台启动；headless 主持（codex exec、WorkBuddy 沙箱）**必须由调用方启动**（见 FAQ）。启动后第一行输出确认连接与策略：

```
已连接 zcode + workbuddy，共 2 包；{"zcode":{...},"workbuddy":{...}}；详细日志写入 .work-together。
```

混排时 modelPolicy 是按引擎分键的结构；单引擎计划则保持原有单对象结构。

## 4. 派发与可见性确认

每包派发后调度器自动打开项目并选中会话，确认侧栏标题（`[Codex/zside]`）与正文标记（`协作任务包：zside`）后写 `visibility.json`。`status` 中每包 `visibility.confirmed=true` 才算"桌面过程可见"。未确认时执行 `open <包ID>` 修复显示——**不要重派**。

## 5. 真实失败支线：模型请求 error → 同会话修复

首次现场运行时，两包先后出现 `status=failed`，快照显示执行器已完成原生待办创建后模型请求报错（`state=error`）。正确处置：

1. 不重派。读 `<包ID>.jsonl` 确认卡点（待办已建、产物未写）。
2. 向**原 sessionId** 发修正指令，用**全新请求 ID**（如 `wt-fix-<包ID>-<uuid>`），内容一句话："上一轮模型请求中断，请继续：写出归属文件 → 核对字节数 → 待办标记完成 → 回报结果"。
3. 轮询快照至 `state=idle`、消息 complete，产物落盘。
4. 主持方把状态修复过程记入验收证据，包回到可验收状态后走 `verify`。

复用首轮请求 ID 会让修正轮被缓存吞掉——这是实测教训。

## 6. 独立验收（主持方，不看执行者脸色）

对每个 `exec_done` 的包：

```
$ node -e "const fs=require('fs');
  const a=fs.readFileSync('zcode-side.txt');
  console.log(a.equals(Buffer.from('MIXED_ZCODE_OK\n'))? 'PASS':'FAIL', a.length+'B')"
PASS 15B
```

同时核对：`<包ID>.jsonl` 里有执行器原生待办记录（ZCode Todo / WorkBuddy TaskCreate·TaskUpdate）、`<包ID>.visibility.json` 的 `confirmed=true`。把逐项证据写进 `.work-together/<包ID>.verification.md`。

注意：证据文件放 `.work-together/`（不参与归属指纹）。调度器启动**之后**才在项目根目录创建的任何文件——包括主持方自己的笔记——都会被归属门拦下（verify 退出码 2），这是设计行为。

## 7. verify 与收尾

```
$ node <runner>/workflow.mjs verify zside .work-together/zside.verification.md
zside: 已验收并记录证据
$ node <runner>/workflow.mjs verify wbside .work-together/wbside.verification.md
wbside: 已验收并记录证据
$ node <runner>/workflow.mjs status
{ "engine": "zcode", "coordinator": "codex", "modelPolicy": {...按引擎分键...},
  "jobs": [ {"id":"zside","status":"verified","engine":"zcode",...},
            {"id":"wbside","status":"verified","engine":"workbuddy",...} ] }
```

调度器随后输出边界检测结论（`boundaryViolations` 应为空）并退出。两包 verified 后更新 PLAN.md 勾选项，交付总报告：产物路径、结果、证据、遗留问题。

## 中断与恢复速记

- 调度器意外退出：检查原桌面会话 → `run plan.json --resume`（复用原 sessionId，`creating/dispatching` 转为 `unknown` 待查明）。
- 单包卡住需停止：`cancel <包ID>` → 到桌面确认最终状态 → 再释放归属。
- 新一轮任务：先把旧 `.work-together` 归档到别处，再开新计划（同目录不重置状态）。
