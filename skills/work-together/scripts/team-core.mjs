import path from 'node:path';
import {validatePlan, ownedPath, overlap} from './core.mjs';
import {EXECUTOR_ORDER, normalizeEngine, family, candidates, lockedCandidate} from './executors.mjs';

export const ACTIVE = ['claimed', 'creating', 'dispatching', 'running', 'needs_user', 'unknown'];
export const idPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
export function validateTeamPlan(input, root) {
  const plan = structuredClone(input);
  plan.schemaVersion = 2;
  plan.coordinator ??= 'codex';
  plan.concurrency ??= 2;
  plan.strategy ??= 'balanced';
  plan.maxTasks ??= 24;
  plan.leaseMs ??= 120000;
  plan.checks ??= [];
  plan.agents ??= EXECUTOR_ORDER.filter(e => family(e) !== family(plan.coordinator)).map(engine => ({id: engine + '-01', engine, capacity: 1}));
  if (!['balanced', 'priority', 'claim'].includes(plan.strategy)) throw Error('strategy 必须为 balanced / priority / claim');
  if (!Number.isInteger(plan.maxTasks) || plan.maxTasks < 1 || plan.maxTasks > 100) throw Error('maxTasks 必须为 1..100');
  if (!Number.isInteger(plan.leaseMs) || plan.leaseMs < 10000 || plan.leaseMs > 3600000) throw Error('leaseMs 必须为 10000..3600000');
  if (!Array.isArray(plan.agents) || !plan.agents.length) throw Error('至少配置一个 agent');
  const ids = new Set();
  for (const agent of plan.agents) {
    agent.engine = normalizeEngine(agent.engine);
    agent.capacity ??= 1;
    agent.capabilities ??= [];
    if (!idPattern.test(agent.id) || ids.has(agent.id)) throw Error('agent ID 非法或重复');
    ids.add(agent.id);
    if (!EXECUTOR_ORDER.includes(agent.engine) || family(agent.engine) === family(plan.coordinator)) throw Error('agent 必须是非主持方同族桌面执行器');
    if (!Number.isInteger(agent.capacity) || agent.capacity < 1 || agent.capacity > 4) throw Error('agent capacity 必须为 1..4，须按实际桌面能力设置');
    if (!Array.isArray(agent.capabilities) || agent.capabilities.some(x => typeof x !== 'string')) throw Error('capabilities 必须是字符串数组');
  }
  if (!Array.isArray(plan.tasks) || plan.tasks.length > plan.maxTasks) throw Error('任务数超过 maxTasks 或 tasks 非数组');
  if (plan.scope !== undefined && (!Array.isArray(plan.scope) || !plan.scope.length || plan.scope.some(s => typeof s !== 'string'))) throw Error('scope 必须为非空路径数组');
  for (const scope of plan.scope || []) ownedPath(root, scope);
  // Reuse v1's path/link, dependency, coordinator and global capacity guards.
  validatePlan(plan, root);
  for (const task of plan.tasks) {
    if (!idPattern.test(task.id)) throw Error('任务 ID 最长 64 字符');
    if (task.files.some(f => /^(\.git|\.work-together)(\/|\\|$)/i.test(path.relative(root, path.resolve(root, f))))) throw Error('任务不能拥有调度器或 Git 管理目录');
    if (!Array.isArray(task.acceptance) || task.acceptance.some(x => typeof x !== 'string' || !x.trim())) throw Error('acceptance 必须为非空字符串数组');
    task.requires ??= [];
    if (!Array.isArray(task.requires) || task.requires.some(x => typeof x !== 'string')) throw Error('requires 必须为字符串数组');
    if (task.agentId && !ids.has(task.agentId)) throw Error('未知 agentId：' + task.agentId);
    if (plan.scope) for (const file of task.files) {
      const full = ownedPath(root, file);
      if (!plan.scope.some(s => { const base = ownedPath(root, s); return full === base || full.startsWith(base + path.sep); })) throw Error('任务超出 scope：' + file);
    }
    if (!plan.agents.some(a => agentMatches(plan, task, a))) throw Error('没有满足任务能力/执行器约束的 agent：' + task.id);
    if (task.parentId && !plan.tasks.some(t => t.id === task.parentId && t.id !== task.id)) throw Error('未知或自身 parentId');
    const seen = new Set([task.id]); let current = task;
    while (current.parentId) {
      if (seen.has(current.parentId) || seen.size >= 8) throw Error('parentId 循环或拆分超过 8 层');
      seen.add(current.parentId); current = plan.tasks.find(t => t.id === current.parentId);
      if (!current) throw Error('未知 parentId');
    }
  }
  for (const check of plan.checks) {
    if (!check || typeof check.command !== 'string' || !check.command || !Array.isArray(check.args) || check.args.some(a => typeof a !== 'string')) throw Error('checks 使用 {command,args}，不接受 shell 字符串');
    if (/\.(cmd|bat)$/i.test(check.command)) throw Error('checks 请直接调用 node 或可执行文件，不执行 .cmd/.bat');
    if (check.timeoutMs !== undefined && (!Number.isInteger(check.timeoutMs) || check.timeoutMs < 1 || check.timeoutMs > 300000)) throw Error('check timeoutMs 必须为 1..300000');
  }
  return plan;
}

export function agentMatches(plan, task, agent) {
  return family(agent.engine) !== family(plan.coordinator)
    && (!task.agentId || task.agentId === agent.id)
    && (task.requires || []).every(c => agent.capabilities.includes(c))
    && (plan.fallback === false ? [lockedCandidate(task.engine || plan.engine || 'auto', plan.coordinator)] : candidates(task.engine || plan.engine || 'auto', plan.coordinator)).includes(agent.engine);
}

export function eligibleTasks(state, agentId, root) {
  const agent = state.plan.agents.find(a => a.id === agentId);
  if (!agent) throw Error('未知 agent：' + agentId);
  const jobs = Object.values(state.jobs), busy = jobs.filter(j => ACTIVE.includes(j.status));
  if (busy.length >= state.plan.concurrency || busy.filter(j => j.agentId === agentId).length >= agent.capacity) return [];
  return state.plan.tasks.filter(task => state.jobs[task.id].status === 'queued'
    && (task.dependsOn || []).every(id => state.jobs[id].status === 'merged')
    && agentMatches(state.plan, task, agent)
    // Worktrees isolate writes, but shared contracts/resource ownership remain serial.
    && busy.every(j => state.plan.tasks.find(t => t.id === j.id).files.every(f => task.files.every(p => !overlap(ownedPath(root, f), ownedPath(root, p))))));
}

export function rankAgents(state) {
  const load = a => Object.values(state.jobs).filter(j => j.agentId === a.id && ACTIVE.includes(j.status)).length / a.capacity;
  return [...state.plan.agents].sort((a, b) => state.plan.strategy === 'priority'
    ? EXECUTOR_ORDER.indexOf(a.engine) - EXECUTOR_ORDER.indexOf(b.engine)
    : load(a) - load(b) || EXECUTOR_ORDER.indexOf(a.engine) - EXECUTOR_ORDER.indexOf(b.engine));
}

export function parseProposal(text) {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m => m[1]);
  for (const source of [text.trim(), ...fenced]) {
    try { const result = JSON.parse(source); if (Array.isArray(result.tasks)) return result.tasks; } catch {}
  }
  throw Error('规划器必须返回 {"tasks":[...]} JSON，未找到合法结果');
}

export function teamView(state) {
  const jobs = Object.values(state.jobs);
  return {
    runId: state.runId, revision: state.revision, coordinator: state.plan.coordinator,
    integration: state.integration, stopRequested: state.stopRequested || false,
    gitee: state.gitee ? {binding: state.gitee.binding, issues: state.gitee.issues, pulls: state.gitee.pulls, lastSyncAt: state.gitee.lastSyncAt, error: state.gitee.error} : undefined,
    counts: Object.fromEntries([...new Set(jobs.map(j => j.status))].map(s => [s, jobs.filter(j => j.status === s).length])),
    agents: state.plan.agents.map(a => ({...a,
      current: jobs.filter(j => j.agentId === a.id && ACTIVE.includes(j.status)).map(j => j.id),
      queue: state.plan.tasks.filter(t => t.agentId === a.id && state.jobs[t.id].status === 'queued').map(t => t.id),
      lastSeen: state.agentHealth?.[a.id]?.lastSeen, error: state.agentHealth?.[a.id]?.error})),
    jobs: jobs.map(({claimToken, baseline, requestId, handoff, ...j}) => ({...j, gitee: state.gitee?.issues[j.id]}))
  };
}
