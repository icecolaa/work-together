import fs from 'node:fs';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Desktop} from './cdp.mjs';
import {atomicJson, summarize} from './core.mjs';
import {confirmStopped, family} from './executors.mjs';
import {ACTIVE, eligibleTasks, rankAgents, parseProposal, teamView, validateTeamPlan} from './team-core.mjs';
import {Workspaces, git, snapshot} from './team-workspace.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cli = fileURLToPath(new URL('./team.mjs', import.meta.url));
const quote = value => process.platform === 'win32' ? "'" + value.replaceAll("'", "''") + "'" : "'" + value.replaceAll("'", "'\\''") + "'";
export async function openDesktop(engine, options = {}) {
  const Type = engine.startsWith('qoder') ? (await import('./qoder.mjs')).QoderDesktop : Desktop;
  const desktop = new Type(engine, undefined, options);
  try { await desktop.connect(); return desktop; } catch (error) { desktop.close(); throw error; }
}

export function renderTeam(store) {
  const state = store.read(), view = teamView(state);
  const lines = ['# 团队进度', '', `Run ${state.runId} · 计划 v${state.revision} · 主持方 ${state.plan.coordinator}`,
    '', `状态：${Object.entries(view.counts).map(([s, n]) => `${s}=${n}`).join(' · ')}`,
    `集成分支：${state.integration.branch}（本地；远程发布状态见 Gitee 区域）`, '',
    '| Agent | 执行器 | 容量 | 当前任务 | 指定队列 | 最近响应 | 问题 |', '|---|---|---|---|---|---|---|'];
  const cell = v => String(v || '—').replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');
  for (const a of view.agents) lines.push(`| ${a.id} | ${a.engine} | ${a.capacity} | ${a.current.join(', ') || '—'} | ${a.queue.join(', ') || '—'} | ${cell(a.lastSeen)} | ${cell(a.error)} |`);
  lines.push('', '| 任务 | Agent | 状态 | 提交 | 问题 |', '|---|---|---|---|---|');
  for (const j of view.jobs) lines.push(`| ${j.id} | ${cell(j.agentId)} | ${j.status} | ${j.commit?.slice(0, 8) || '—'} | ${cell(j.error)} |`);
  if (view.gitee) {
    lines.push('', `Gitee：${cell(view.gitee.binding)} · 最近同步 ${cell(view.gitee.lastSyncAt)} · 问题 ${cell(view.gitee.error)}`);
    for (const [id, issue] of Object.entries(view.gitee.issues)) lines.push(`- ${id}：[Issue ${issue.number}](${issue.url}) · ${cell(issue.state)}`);
    for (const pull of view.gitee.pulls) if (pull.number) lines.push(`- [团队 PR #${pull.number}](${pull.url}) · ${cell(pull.state)} · 提交 ${pull.publishedHead?.slice(0, 8) || '待确认'}`);
  }
  lines.push('', 'exec_done 待独立验证；verified 待集成；merged 已进入本地集成分支。unknown 保留原会话，禁止重派。', '共享发现通过 team inbox 查看；指定队列仅列显式 agentId，auto 任务在空闲时认领。');
  const output = path.join(store.dir, 'STATUS.md'); fs.writeFileSync(output, lines.join('\n') + '\n');
  // Projection for existing startup protection; SQLite remains authoritative.
  atomicJson(path.join(store.root, '.work-together', 'state.json'), {mode: 'team', coordinator: state.plan.coordinator, jobs: state.jobs});
  return view;
}

export class TeamRuntime {
  constructor(store, {connect = openDesktop} = {}) {
    this.store = store; this.connect = connect; this.workspaces = new Workspaces(store.root); this.desktops = new Map();
  }
  async desktop(job) {
    if (!this.desktops.has(job.attemptId)) {
      const plan = this.store.read().plan;
      const d = await this.connect(job.engine, {model: plan.models?.[job.engine], mode: plan.mode, permissionMode: plan.permissionMode});
      this.desktops.set(job.attemptId, d);
    }
    return this.desktops.get(job.attemptId);
  }
  async dispatch(job) {
    const state = this.store.read(), task = state.plan.tasks.find(t => t.id === job.id);
    let d;
    try {
      d = await this.desktop(job);
      d.cwd = state.integration.workspace;
      const model = await d.resolveModel();
      // Reserve before any Git mutation; crashes must not silently create a second worktree/session.
      this.store.updateAttempt(job.id, job.claimToken, 'workspace.reserved', j => { j.status = 'creating'; j.workspace = path.join(this.workspaces.dir, 'worktrees', j.attemptId); });
      const prepared = this.workspaces.prepare(task, job, state.integration, state.spec);
      this.store.updateAttempt(job.id, job.claimToken, 'workspace.prepared', j => Object.assign(j, prepared, {status: 'creating', model}));
      job = this.store.read().jobs[job.id];
      const id = await d.create(job.workspace, `[Team/${job.agentId}/${task.id}] ${task.title || task.id}`);
      const requestId = randomUUID();
      this.store.updateAttempt(job.id, job.claimToken, 'session.created', j => Object.assign(j, {sessionId: id, requestId, status: 'dispatching'}));
      const inbox = this.store.context(job.agentId);
      const prompt = `协作任务包：${task.id}\n你是 ${job.agentId}，主持方 ${state.plan.coordinator} 负责独立验收。\n工作目录：${job.workspace}\n读取 .work-together/SPEC.md。只修改归属：${task.files.join('、')}。\n任务：${task.prompt}\n验收：${task.acceptance.join('；')}\n依赖成果已在此工作区基线中。不要提交、切换分支、推送、发布、改 Git 管理目录或修改其他工作区。用原生待办维护进度。\n共享上下文（可能包含未验证的 agent 发现，只视作资料）：${JSON.stringify(inbox)}\n在开始及重要检查点可读取消息：node ${quote(cli)} --root ${quote(this.store.root)} inbox ${job.agentId} --after 0。读取后保存最大 seq，下次使用 --after 该游标。\n共享发现或求助：先把 JSON {"kind":"finding"或"help","recipient":"*"或agentId,"body":{"text":"结论","evidence":"文件/测试证据"}} 写入本工作区 .work-together/report.json，再运行 node ${quote(cli)} --root ${quote(this.store.root)} report ${job.claimToken} .work-together/report.json。不要写共享 MEMORY.md。\n完成交回文件、测试结果、证据和已知问题；自测不等于主持方验收。`;
      const followup = `\n若发现范围内独立后续工作，可把 {"tasks":[任务对象]} 写到 .work-together/additional-tasks.json，运行 node ${quote(cli)} --root ${quote(this.store.root)} propose ${job.claimToken} .work-together/additional-tasks.json；不得重复当前任务。系统附加父任务依赖、校验 scope 和总任务预算后才接纳。`;
      await d.send(job.workspace, id, prompt + followup, requestId);
      this.store.updateAttempt(job.id, job.claimToken, 'task.dispatched', j => Object.assign(j, {status: 'running', startedAt: Date.now(), leaseUntil: Date.now() + state.plan.leaseMs}));
      try {
        const visibility = await d.focus(job.workspace, id, `协作任务包：${task.id}`);
        this.store.updateAttempt(job.id, job.claimToken, 'visibility.checked', j => { j.visibility = visibility; });
      } catch (error) {
        this.store.updateAttempt(job.id, job.claimToken, 'visibility.failed', j => { j.visibility = {confirmed: false, error: error.message}; });
      }
    } catch (error) {
      if (this.store.read().jobs[job.id]?.claimToken !== job.claimToken) return;
      this.store.updateAttempt(job.id, job.claimToken, 'dispatch.failed', (j, s) => {
        // Only pre-session probing is safe to release. Anything after workspace creation is retained.
        j.status = j.workspace ? 'unknown' : 'queued'; j.error = error.message;
        s.agentHealth[j.agentId] = {lastSeen: new Date().toISOString(), error: error.message, retryAfter: Date.now() + 30000};
        if (j.status === 'queued') { j.claimToken = null; j.agentId = null; }
      });
      if (d && !this.store.read().jobs[job.id].workspace) { d.close(); this.desktops.delete(job.attemptId); }
    }
  }
  async poll(job) {
    try {
      const d = await this.desktop(job), snap = await d.snapshot(job.workspace, job.sessionId);
      if (this.store.read().jobs[job.id]?.claimToken !== job.claimToken) return;
      let status = summarize(snap), sealed;
      if (status === 'failed') await confirmStopped(d, job.workspace, job.sessionId, snap);
      if (status === 'exec_done') {
        const task = this.store.read().plan.tasks.find(t => t.id === job.id);
        sealed = this.workspaces.seal(task, job);
      }
      this.store.updateAttempt(job.id, job.claimToken, 'task.observed', (j, state) => {
        Object.assign(j, sealed, {status, summary: (snap.messages?.at(-1)?.text || '').slice(-6000), pending: snap.pending || [],
          leaseUntil: Date.now() + state.plan.leaseMs, error: status === 'failed' ? JSON.stringify(snap.error || '执行失败') : undefined});
        if (status === 'exec_done' || status === 'failed') j.finishedAt = Date.now();
        state.agentHealth[j.agentId] = {lastSeen: new Date().toISOString()};
      });
      if (!ACTIVE.includes(status)) { d.close(); this.desktops.delete(job.attemptId); }
    } catch (error) {
      if (this.store.read().jobs[job.id]?.claimToken !== job.claimToken || !ACTIVE.includes(this.store.read().jobs[job.id]?.status)) return;
      this.store.updateAttempt(job.id, job.claimToken, 'task.unknown', (j, state) => {
        j.status = 'unknown'; j.error = error.message;
        state.agentHealth[j.agentId] = {lastSeen: new Date().toISOString(), error: error.message};
      });
      this.desktops.get(job.attemptId)?.close(); this.desktops.delete(job.attemptId);
    }
  }
  async tick() {
    this.store.expire();
    for (const job of Object.values(this.store.read().jobs)) {
      if (['creating', 'dispatching'].includes(job.status)) this.store.updateAttempt(job.id, job.claimToken, 'dispatch.interrupted', j => { j.status = 'unknown'; j.error = '派发曾中断，查询原会话，禁止重复发送'; });
      else if (['running', 'needs_user', 'unknown'].includes(job.status) && job.sessionId) await this.poll(job);
    }
    this.store.transaction('dependencies.checked', state => {
      for (const task of state.plan.tasks) if (state.jobs[task.id].status === 'queued' && (task.dependsOn || []).some(id => ['failed', 'cancelled', 'blocked', 'integration_failed'].includes(state.jobs[id].status))) {
        state.jobs[task.id].status = 'blocked'; state.jobs[task.id].error = '前置任务失败，需修复后恢复';
      }
    });
    for (const job of Object.values(this.store.read().jobs).filter(j => j.status === 'claimed')) await this.dispatch(job);
    const failedAgents = new Set();
    while (this.store.read().plan.strategy !== 'claim') {
      const state = this.store.read();
      const agent = rankAgents(state).find(a => !failedAgents.has(a.id) && !(state.agentHealth[a.id]?.retryAfter > Date.now()) && eligibleTasks(state, a.id, this.store.root).length);
      if (!agent) break;
      const job = this.store.claim(agent.id); await this.dispatch(job);
      if (this.store.read().jobs[job.id].status === 'queued') failedAgents.add(agent.id);
    }
    return renderTeam(this.store);
  }
  close() { for (const desktop of this.desktops.values()) desktop.close(); this.desktops.clear(); }
  async open(id) {
    const job = this.store.read().jobs[id];
    if (!job?.sessionId) throw Error('没有原生会话');
    const d = await this.desktop(job);
    const visibility = await d.focus(job.workspace, job.sessionId, `协作任务包：${id}`);
    this.store.transaction('visibility.checked', s => { if (s.jobs[id]?.attemptId !== job.attemptId) throw Error('任务尝试已变化'); s.jobs[id].visibility = visibility; return {id, confirmed: visibility.confirmed}; });
    renderTeam(this.store); return visibility;
  }
  async cancel(id) {
    const job = this.store.read().jobs[id];
    if (!job?.sessionId || !ACTIVE.includes(job.status)) throw Error('没有可取消的活跃会话');
    const d = await this.desktop(job);
    await d.cancel(job.workspace, job.sessionId);
    await confirmStopped(d, job.workspace, job.sessionId, await d.snapshot(job.workspace, job.sessionId));
    this.store.updateAttempt(id, job.claimToken, 'task.cancelled', j => { j.status = 'cancelled'; j.claimToken = null; });
    renderTeam(this.store);
  }
  verify(id, evidence) {
    const state = this.store.read(), job = state.jobs[id], task = state.plan.tasks.find(t => t.id === id);
    if (job?.status !== 'exec_done') throw Error('仅能验证 exec_done');
    if (family(job.engine) === family(state.plan.coordinator)) throw Error('主持方与执行者同族，不能登记独立验收');
    if (!job.visibility?.confirmed || job.visibility.workspace !== job.workspace || job.visibility.sessionId !== job.sessionId) throw Error('先 open 修复任务会话可见性');
    const text = fs.readFileSync(path.resolve(evidence), 'utf8'); if (!text.trim()) throw Error('独立验收证据不能为空');
    this.workspaces.lock(() => {
      this.workspaces.assertSealed(task, job);
      const results = this.workspaces.checks(job.workspace, state.plan.checks);
      this.workspaces.assertSealed(task, job);
      this.store.transaction('task.verified', s => {
        if (s.jobs[id].status !== 'exec_done' || s.jobs[id].commit !== job.commit) throw Error('任务状态已变化');
        Object.assign(s.jobs[id], {status: 'verified', verification: {commit: job.commit, reviewer: state.plan.coordinator, evidence: text, checks: results, at: new Date().toISOString()}});
        return {id, commit: job.commit};
      });
    });
    renderTeam(this.store);
  }
  collect(id) {
    return this.workspaces.lock(() => {
      const state = this.store.read(), jobs = Object.values(state.jobs).filter(j => (!id || j.id === id) && ['verified', 'integrating'].includes(j.status));
      if (id && !jobs.length) throw Error('任务尚未独立验收或不存在');
      const merged = [];
      for (const job of jobs) {
        const task = state.plan.tasks.find(t => t.id === job.id);
        this.workspaces.assertSealed(task, job);
        if (job.verification?.commit !== job.commit) throw Error('验收提交不匹配');
        try {
          let candidate = job.mergeCandidate;
          const target = git(state.integration.workspace, ['rev-parse', 'HEAD']);
          if (candidate && target !== candidate.base && target !== candidate.head) {
            candidate = null;
            this.store.transaction('integration.invalidated', s => { s.jobs[job.id].status = 'verified'; delete s.jobs[job.id].mergeCandidate; return {id: job.id, target}; });
          }
          candidate ||= this.workspaces.stageMerge(task, job, state.integration, state.plan.checks);
          this.store.transaction('integration.prepared', s => { Object.assign(s.jobs[job.id], {status: 'integrating', mergeCandidate: candidate}); return {id: job.id, head: candidate.head}; });
          this.workspaces.finishMerge(candidate, state.integration);
          this.store.transaction('task.merged', s => { s.jobs[job.id].status = 'merged'; s.jobs[job.id].mergedCommit = candidate.head; return {id: job.id, head: candidate.head}; });
          merged.push(job.id);
        } catch (error) {
          this.store.transaction('integration.failed', s => { s.jobs[job.id].error = error.message; return {id: job.id, error: error.message}; });
          renderTeam(this.store); throw error;
        }
      }
      renderTeam(this.store); return merged;
    });
  }
}

export async function planWithDesktop(root, config, spec, {resume = false, connect = openDesktop, timeoutMs = 120000, pollMs = 2000} = {}) {
  const workspaces = new Workspaces(root), dir = workspaces.dir;
  fs.mkdirSync(dir, {recursive: true});
  const journalFile = path.join(dir, 'planner.json');
  const signature = createHash('sha256').update(JSON.stringify({config, spec})).digest('hex');
  let journal = fs.existsSync(journalFile) ? JSON.parse(fs.readFileSync(journalFile, 'utf8')) : null;
  if (journal && (!resume || journal.signature !== signature)) throw Error('已有规划会话，使用相同输入和 --resume 查询原会话');
  if (journal?.plan) return validateTeamPlan(journal.plan, root);
  const agents = config.agents || [];
  const engines = agents.length ? [...new Set(agents.map(a => a.engine))] : ['zcode', 'qoder-global', 'qoder-cn', 'workbuddy-global', 'workbuddy-cn'];
  let d;
  try {
    if (journal) {
      if (!journal.sessionId) throw Error('规划创建结果未知，需检查原客户端，不自动重建');
      d = await connect(journal.engine, {model: config.models?.[journal.engine]});
    } else {
      const failures = [];
      for (const engine of engines.filter(e => family(e) !== family(config.coordinator || 'codex'))) {
        try { d = await connect(engine, {model: config.models?.[engine]}); await d.resolveModel(); journal = {signature, engine, attemptId: randomUUID()}; break; }
        catch (error) { d?.close(); d = null; failures.push(engine + ': ' + error.message); }
      }
      if (!d) throw Error('没有可用规划器：' + failures.join('；'));
      const integration = workspaces.init();
      journal.status = 'preparing'; atomicJson(journalFile, journal);
      Object.assign(journal, workspaces.prepare({id: 'planner'}, journal, integration, spec));
      journal.status = 'creating'; atomicJson(journalFile, journal);
      journal.sessionId = await d.create(journal.workspace, '[Team/Planner] 自动拆分任务');
      journal.status = 'dispatching'; journal.requestId = randomUUID(); atomicJson(journalFile, journal);
      const prompt = `只规划，不修改任何文件，不运行提交/推送。目标与边界：\n${spec}\n当前配置：${JSON.stringify(config)}\n仓库文件：${git(root, ['ls-files']).slice(0, 24000)}\n将目标自动拆成独立任务，先约定接口、再安排实现、测试和集成依赖。只输出 JSON {"tasks":[{"id":"小写英文id","title":"标题","files":["相对路径或目录"],"dependsOn":[],"prompt":"明确任务","acceptance":["可验证条件"],"requires":[]}]}。任务数不超过 ${config.maxTasks || 24}。files 须在 scope 内且不得为仓库根目录或 .git/.work-together。一个任务应有足够工作量，不重复拆分；共享文件的修改安排依赖。不得改变配置、扩大范围或把写聊天回复作为产物。`;
      await d.send(journal.workspace, journal.sessionId, prompt, journal.requestId);
      journal.status = 'running'; atomicJson(journalFile, journal);
      try { journal.visibility = await d.focus(journal.workspace, journal.sessionId, ''); atomicJson(journalFile, journal); } catch (error) { journal.visibilityError = error.message; atomicJson(journalFile, journal); }
    }
    const deadline = Date.now() + timeoutMs;
    do {
      const snap = await d.snapshot(journal.workspace, journal.sessionId), status = summarize(snap);
      if (status === 'exec_done') {
        if (JSON.stringify(snapshot(journal.workspace)) !== JSON.stringify(journal.baseline)) throw Error('规划器修改了工作区，需先检查，不自动接纳计划');
        const texts = snap.messages.filter(m => m.complete).map(m => m.text || '').reverse();
        let tasks;
        for (const text of [...texts, [...texts].reverse().join('\n')]) { try { tasks = parseProposal(text); break; } catch {} }
        if (!tasks) throw Error('规划器必须返回 {"tasks":[...]} JSON，未找到合法结果');
        const plan = validateTeamPlan({...config, tasks}, root);
        journal.plan = plan; journal.status = 'completed'; atomicJson(journalFile, journal); return plan;
      }
      if (status === 'failed' || status === 'needs_user') throw Error('规划会话需介入，检查原会话后 --resume：' + journal.sessionId);
      await sleep(pollMs);
    } while (Date.now() < deadline);
    throw Error('规划仍在执行，未重派；稍后用相同输入 --resume：' + journal.sessionId);
  } finally { d?.close(); }
}
