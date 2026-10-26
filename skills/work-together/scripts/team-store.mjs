import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {ACTIVE, eligibleTasks, validateTeamPlan} from './team-core.mjs';

export class TeamStore {
  constructor(root) {
    this.root = fs.realpathSync(root);
    this.dir = path.join(this.root, '.work-together', 'team');
    fs.mkdirSync(this.dir, {recursive: true});
    this.db = new DatabaseSync(path.join(this.dir, 'state.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
        sender TEXT NOT NULL, recipient TEXT NOT NULL, task TEXT, kind TEXT NOT NULL, body TEXT NOT NULL, at TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  read() { const row = this.db.prepare('SELECT body FROM state WHERE id=1').get(); if (!row) throw Error('team 尚未初始化，先 plan/run'); return JSON.parse(row.body); }
  exists() { return !!this.db.prepare('SELECT id FROM state WHERE id=1').get(); }
  transaction(type, fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = this.read();
      const result = fn(state);
      state.updatedAt = new Date().toISOString();
      this.db.prepare('UPDATE state SET body=? WHERE id=1').run(JSON.stringify(state));
      this.db.prepare('INSERT INTO events(body) VALUES(?)').run(JSON.stringify({eventId: randomUUID(), type, at: state.updatedAt, revision: state.revision, result}));
      this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  init(plan, integration, metadata = {}) {
    const state = {schemaVersion: 2, runId: randomUUID().slice(0, 8), revision: 1, plan,
      integration, agentHealth: {}, jobs: Object.fromEntries(plan.tasks.map(t => [t.id, {id: t.id, status: 'queued', generation: 0}])), ...metadata};
    this.db.prepare('INSERT INTO state(id,body) VALUES(1,?)').run(JSON.stringify(state));
    return state;
  }
  claim(agentId, taskId, now = Date.now()) {
    return this.transaction('task.claimed', state => {
      const eligible = eligibleTasks(state, agentId, this.root);
      const task = taskId ? eligible.find(t => t.id === taskId) : eligible[0];
      if (!task) throw Error('没有可认领任务（依赖、归属、容量或状态不满足）');
      const job = state.jobs[task.id];
      Object.assign(job, {status: 'claimed', agentId, engine: state.plan.agents.find(a => a.id === agentId).engine,
        attemptId: randomUUID(), claimToken: randomUUID(), generation: job.generation + 1, leaseUntil: now + state.plan.leaseMs});
      return structuredClone(job);
    });
  }
  updateAttempt(id, token, type, fn) {
    return this.transaction(type, state => {
      const job = state.jobs[id];
      if (!job || job.claimToken !== token || !ACTIVE.includes(job.status)) throw Error('过期或失效的任务认领');
      fn(job, state); return {id, status: job.status, attemptId: job.attemptId};
    });
  }
  expire(now = Date.now()) {
    return this.transaction('leases.checked', state => {
      const expired = [];
      for (const job of Object.values(state.jobs)) if (ACTIVE.includes(job.status) && job.leaseUntil < now && job.status !== 'unknown') {
        job.status = 'unknown'; job.error = '租约过期，保留原会话/归属，禁止自动重派'; expired.push(job.id);
      }
      return expired;
    });
  }
  append(tasks) {
    return this.transaction('plan.revised', state => {
      const plan = validateTeamPlan({...state.plan, tasks: [...state.plan.tasks, ...tasks]}, this.root);
      state.plan = plan; state.revision++;
      for (const task of tasks) state.jobs[task.id] = {id: task.id, status: 'queued', generation: 0};
      return {revision: state.revision, added: tasks.map(t => t.id)};
    });
  }
  propose(token, tasks) {
    return this.transaction('plan.proposed_by_agent', state => {
      const parent = Object.values(state.jobs).find(j => j.claimToken === token && ['running', 'needs_user'].includes(j.status) && j.leaseUntil >= Date.now());
      if (!parent) throw Error('失效的提议令牌');
      if (!state.plan.scope) throw Error('自主新增任务需要显式 scope');
      const additions = tasks.map(t => ({...t, parentId: parent.id, dependsOn: [...new Set([...(t.dependsOn || []), parent.id])]}));
      state.plan = validateTeamPlan({...state.plan, tasks: [...state.plan.tasks, ...additions]}, this.root);
      state.revision++;
      for (const task of additions) state.jobs[task.id] = {id: task.id, status: 'queued', generation: 0, proposedBy: parent.agentId};
      return {revision: state.revision, added: additions.map(t => t.id), parent: parent.id};
    });
  }
  post({id = randomUUID(), sender = 'coordinator', recipient = '*', task = null, kind = 'message', body}) {
    if (!['message', 'finding', 'help', 'decision'].includes(kind) || !body || JSON.stringify(body).length > 16000) throw Error('消息类型/长度不合法');
    const encoded = JSON.stringify(body);
    const existing = this.db.prepare('SELECT * FROM messages WHERE id=?').get(id);
    if (existing) {
      if (existing.sender !== sender || existing.recipient !== recipient || existing.task !== task || existing.kind !== kind || existing.body !== encoded) throw Error('消息幂等键已用于不同内容');
      return existing.seq;
    }
    this.db.prepare('INSERT INTO messages(id,sender,recipient,task,kind,body,at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
      .run(id, sender, recipient, task, kind, encoded, new Date().toISOString());
    const inserted = this.db.prepare('SELECT * FROM messages WHERE id=?').get(id);
    if (inserted.sender !== sender || inserted.recipient !== recipient || inserted.task !== task || inserted.kind !== kind || inserted.body !== encoded) throw Error('消息幂等键已用于不同内容');
    return inserted.seq;
  }
  report(token, message) {
    return this.transaction('finding.published', state => {
      const job = Object.values(state.jobs).find(j => j.claimToken === token && ['running', 'needs_user'].includes(j.status) && j.leaseUntil >= Date.now());
      if (!job) throw Error('失效的报告令牌');
      return {seq: this.post({...message, sender: job.agentId, task: job.id}), task: job.id};
    });
  }
  inbox(agent, after = 0) {
    if (!Number.isSafeInteger(after) || after < 0) throw Error('after 必须为非负整数游标');
    return this.db.prepare("SELECT * FROM messages WHERE seq>? AND (recipient=? OR recipient='*') ORDER BY seq LIMIT 100")
      .all(after, agent).map(row => ({...row, body: JSON.parse(row.body)}));
  }
  context(agent, budget = 24000) {
    const rows = this.db.prepare("SELECT * FROM messages WHERE recipient=? OR recipient='*' ORDER BY seq DESC LIMIT 100").all(agent);
    const selected = []; let used = 0;
    for (const row of rows) {
      const message = {...row, body: JSON.parse(row.body)}, size = JSON.stringify(message).length;
      if (used + size > budget) break;
      used += size; selected.push(message);
    }
    return {messages: selected.reverse(), latestSeq: rows[0]?.seq || 0, truncated: selected.length < rows.length};
  }
  retry(id, correction) {
    return this.transaction(correction ? 'task.revised' : 'task.retried', state => {
      const job = state.jobs[id];
      const statuses = correction ? ['exec_done', 'verified'] : ['failed', 'cancelled', 'blocked'];
      if (!job || !statuses.includes(job.status)) throw Error(correction ? '仅能修订未集成的 exec_done/verified' : '仅能重试已确认停止的 failed/cancelled/blocked，unknown 先 cancel 或 abandon');
      if (correction) {
        if (typeof correction !== 'string' || !correction.trim() || correction.length > 16000) throw Error('修订说明必须为非空文本，最长 16000 字符');
        state.plan.tasks.find(t => t.id === id).prompt += '\n主持方验收修订：\n' + correction;
        state.revision++;
      }
      state.jobs[id] = {id, generation: job.generation, status: 'queued',
        history: [...(job.history || []), {attemptId: job.attemptId, workspace: job.workspace, sessionId: job.sessionId, error: job.error}],
        handoff: job.workspace ? {workspace: job.workspace, branch: job.branch, base: job.base, baseline: job.baseline} : job.handoff};
      for (const j of Object.values(state.jobs)) if (j.status === 'blocked') { j.status = 'queued'; j.error = undefined; }
      return {id, status: 'queued'};
    });
  }
}
