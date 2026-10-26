import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {GiteeClient, detectGitee, validateGiteeConfig, branchSha, pullSha, isMerged} from './gitee-client.mjs';
import {Workspaces, git} from './team-workspace.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const marker = (run, type, id) => `<!-- work-together:${run}:${type}:${id} -->`;
const webRepo = config => `https://gitee.com/${config.owner}/${config.repo}`;
const issueLink = (config, number) => `${webRepo(config)}/issues/${encodeURIComponent(number)}`;
function managed(markerText, content, previous = '') {
  const start = markerText + '\n<!-- work-together:begin -->', end = '<!-- work-together:end -->';
  const block = start + '\n' + content + '\n' + end;
  if (!previous) return block;
  const from = previous.indexOf(start), to = previous.indexOf(end, from);
  if (from < 0 || to < 0) throw Error('远程描述的管理标记已改变，保留人工编辑，不自动覆盖');
  return previous.slice(0, from) + block + previous.slice(to + end.length);
}
function uniqueRemote(objects, key) {
  const matches = objects.filter(o => typeof o.body === 'string' && o.body.includes(key));
  if (matches.length > 1) throw Error('远程发现多个相同管理标记，停止同步以免错误关联');
  return matches[0];
}
function issueSummary(state, task, links) {
  const job = state.jobs[task.id];
  return [`任务：${task.title || task.id}`, `本地状态：${job.status}`, `执行方：${job.agentId || '待分配'}`,
    '', '归属：', ...task.files.map(f => '- ' + f), '', '验收条件：', ...task.acceptance.map(a => '- ' + a),
    '', `依赖：${(task.dependsOn || []).map(id => links[id] ? `[${id}](${links[id].url})` : id).join('、') || '无'}`,
    `已验收提交：${job.verification?.commit || '尚未验收'}`,
    '', '本地 merged 表示已集成；本 Issue 只在对应 Gitee PR 确认合并后自动关闭。',
    '任务执行与验收由本地调度器管理，远程 Issue 状态不会触发执行或替代验收。'].join('\n');
}

export function loadGiteeConfig(root) {
  const file = path.join(root, '.work-together', 'gitee.json');
  return validateGiteeConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
}
export async function initGitee(root, input, clientFactory = config => new GiteeClient({...config, token: process.env[config.tokenEnv]})) {
  let config = input || {...detectGitee(root), tokenEnv: process.env.GITEE_OPEN_API ? 'GITEE_OPEN_API' : 'GITEE_ACCESS_TOKEN'};
  if (!config.base) {
    const api = clientFactory({...config, tokenEnv: config.tokenEnv || 'GITEE_OPEN_API'});
    config = {...config, base: (await api.repository()).default_branch};
  }
  config = validateGiteeConfig(config);
  const dir = path.join(root, '.work-together'); fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'gitee.json'), JSON.stringify(config, null, 2) + '\n', {flag: 'wx'});
  return config;
}
export async function doctorGitee(config, client) {
  const user = await client.user(), repo = await client.repository(), base = await client.branch(config.base);
  if (repo.full_name?.toLowerCase() !== `${config.owner}/${config.repo}`.toLowerCase()) throw Error('Gitee 仓库身份不匹配');
  if (!branchSha(base)) throw Error('Gitee 基线分支未返回提交 SHA');
  return {login: user.login, repository: repo.full_name, base: config.base, baseSha: branchSha(base),
    issuesEnabled: repo.has_issues === true, pullsEnabled: repo.pull_requests_enabled !== false};
}

export class GiteeSync {
  constructor(store, config, {client, publish} = {}) {
    this.store = store; this.config = validateGiteeConfig(config);
    this.client = client || new GiteeClient({...this.config, token: process.env[this.config.tokenEnv]});
    this.workspaces = new Workspaces(store.root);
    this.publish = publish || ((data) => this.push(data));
  }
  approved(state) {
    const jobs = Object.values(state.jobs);
    if (!jobs.every(j => j.status === 'merged')) return null;
    return this.workspaces.lock(() => {
      this.workspaces.check(state.integration);
      const head = git(state.integration.workspace, ['rev-parse', 'HEAD']);
      if (!jobs.some(j => j.mergedCommit === head)) throw Error('集成分支有未登记提交，不能发布为已验收成果');
      if (git(state.integration.workspace, ['branch', '--show-current']) !== state.integration.branch || git(state.integration.workspace, ['status', '--porcelain'])) throw Error('集成工作树/分支已变化');
      for (const task of state.plan.tasks) {
        const job = state.jobs[task.id];
        if (job.verification?.commit !== job.commit) throw Error('任务验收提交不匹配：' + task.id);
        this.workspaces.assertSealed(task, job);
        git(state.integration.workspace, ['merge-base', '--is-ancestor', job.commit, head]);
      }
      const manifest = Object.fromEntries(jobs.map(j => [j.id, j.commit]));
      return {head, manifest, digest: hash(manifest)};
    });
  }
  preview() {
    const state = this.store.read(), approved = this.approved(state);
    return {repository: `${this.config.owner}/${this.config.repo}`, base: this.config.base,
      issues: state.plan.tasks.map(t => ({task: t.id, title: `[work-together/${state.runId}] ${t.title || t.id}`,
        body: issueSummary(state, t, state.gitee?.issues || {}), localState: state.jobs[t.id].status})),
      pull: approved ? {head: approved.head, tasks: Object.keys(approved.manifest), base: this.config.base, action: '推送独立团队分支并创建/更新一个团队 PR，不合并目标分支'} : {waiting: '全部任务独立验收并本地集成后才发布 PR'}};
  }
  async lock(fn) {
    const file = path.join(this.store.dir, 'gitee.lock');
    if (fs.existsSync(file)) {
      const owner = JSON.parse(fs.readFileSync(file, 'utf8'));
      let alive = true; try { process.kill(owner.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
      if (alive) throw Error('另一 Gitee 同步正在运行');
      fs.unlinkSync(file);
    }
    const fd = fs.openSync(file, 'wx'); fs.writeFileSync(fd, JSON.stringify({pid: process.pid})); fs.closeSync(fd);
    try { return await fn(); } finally { fs.unlinkSync(file); }
  }
  bind() {
    this.store.transaction('gitee.bound', state => {
      const binding = `${this.config.owner}/${this.config.repo}:${this.config.base}`;
      if (state.gitee && state.gitee.binding !== binding) throw Error('此运行已绑定其他 Gitee 仓库/目标分支，禁止静默换目标');
      state.gitee ||= {binding, issues: {}, pulls: [], ops: {}};
      return {binding};
    });
  }
  op(key, update) {
    return this.store.transaction('gitee.operation', s => {
      s.gitee.ops[key] = {...s.gitee.ops[key], ...update};
      if (update.status === 'done') delete s.gitee.ops[key].error;
      return {key, status: s.gitee.ops[key].status};
    });
  }
  async create(key, mark, existing, call, adopt) {
    const previous = this.store.read().gitee.ops[key];
    if (existing) { adopt(existing); this.op(key, {status: 'done'}); return existing; }
    if (['pending', 'unknown'].includes(previous?.status)) throw Error(`远程操作 ${key} 结果仍未知，尚未对账到对象，不重复创建；确认未创建后用 gitee retry`);
    this.op(key, {status: 'pending', marker: mark, startedAt: new Date().toISOString()});
    let remote;
    try {
      remote = await call();
      if (!remote?.number || !remote.body?.includes(mark)) throw Object.assign(Error('创建响应缺少编号/标记，需对账'), {uncertain: true});
    } catch (error) { this.op(key, {status: error.uncertain ? 'unknown' : 'failed', error: error.message}); throw error; }
    // Persist association before declaring the outbox operation complete.
    adopt(remote); this.op(key, {status: 'done'}); return remote;
  }
  rememberIssue(taskId, remote) {
    this.store.transaction('gitee.issue_linked', s => {
      s.gitee.issues[taskId] = {number: String(remote.number), url: issueLink(this.config, remote.number), state: remote.state};
      return {taskId, number: String(remote.number)};
    });
  }
  rememberPull(round, remote, extra = {}) {
    this.store.transaction('gitee.pull_linked', s => {
      const entry = s.gitee.pulls.find(p => p.round === round);
      if (!entry) throw Error('缺少 PR 发布记录');
      Object.assign(entry, {number: remote.number, url: `${webRepo(this.config)}/pulls/${remote.number}`, state: remote.state,
        remoteHead: pullSha(remote), merged: isMerged(remote)}, extra);
      return {round, number: remote.number, state: remote.state};
    });
  }
  async syncIssues(remoteIssues, closedTasks) {
    let state = this.store.read();
    for (const task of state.plan.tasks) {
      const mark = marker(state.runId, 'issue', task.id), known = this.store.read().gitee.issues[task.id];
      let remote = known ? await this.client.issue(known.number) : uniqueRemote(remoteIssues, mark);
      if (!remote) remote = await this.create('issue-' + task.id, mark, null,
        () => this.client.createIssue({title: `[work-together/${state.runId}] ${task.title || task.id}`.slice(0, 240), body: managed(mark, issueSummary(state, task, this.store.read().gitee.issues))}),
        value => this.rememberIssue(task.id, value));
      else if (!known) { this.rememberIssue(task.id, remote); this.op('issue-' + task.id, {status: 'done'}); }
      if (!remote.body?.includes(mark)) throw Error('Issue 标记不匹配，未更新：' + task.id);
      state = this.store.read();
      const body = managed(mark, issueSummary(state, task, state.gitee.issues), remote.body);
      const terminal = ['closed', 'rejected'].includes(remote.state);
      const desired = closedTasks.has(task.id) ? 'closed' : state.jobs[task.id].status === 'queued' ? 'open' : 'progressing';
      const patch = {};
      if (body !== remote.body) patch.body = body;
      if (!terminal && remote.state !== desired) patch.state = desired;
      if (Object.keys(patch).length) remote = await this.client.updateIssue(remote.number, patch);
      this.rememberIssue(task.id, remote);
    }
  }
  async observePulls() {
    const closed = new Set(), state = this.store.read();
    for (const entry of state.gitee.pulls.filter(p => p.number)) {
      const remote = await this.client.pull(entry.number);
      if (!remote.body?.includes(marker(state.runId, 'pull', entry.round))) throw Error('PR 标记不匹配，未同步');
      this.rememberPull(entry.round, remote);
      // A remote state never substitutes for local verification. Close only exact published task commits.
      if (isMerged(remote) && entry.publishedHead && pullSha(remote) === entry.publishedHead && this.config.closeIssuesOnMerge) {
        for (const [id, commit] of Object.entries(entry.manifest || {})) if (state.jobs[id]?.commit === commit && state.jobs[id]?.verification?.commit === commit) closed.add(id);
      }
    }
    return closed;
  }
  push({commit, branch}) {
    const target = `${webRepo(this.config)}.git`, ref = `refs/work-together/gitee-${this.store.read().runId}`;
    const run = args => execFileSync('git', ['--literal-pathspecs', ...args], {cwd: this.store.root, encoding: 'utf8', timeout: 60000,
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never'}});
    try {
      // Check shared history before publishing into the configured repository. Never touch local main.
      run(['fetch', '--no-tags', target, `refs/heads/${this.config.base}:${ref}`]);
      git(this.store.root, ['merge-base', commit, ref]);
      run(['push', '--porcelain', target, `${commit}:refs/heads/${branch}`]);
    } catch { throw Object.assign(Error('Gitee 单分支推送未确认成功；检查 Git 凭据/网络，下一次先核对远程 SHA，不强推'), {uncertain: true}); }
  }
  async syncPull(remotePulls) {
    let state = this.store.read(), approved = this.approved(state);
    if (!approved) return;
    let entry = state.gitee.pulls.at(-1);
    if (entry?.merged && entry.digest === approved.digest) return;
    if (!entry || entry.merged) {
      const round = (entry?.round || 0) + 1;
      this.store.transaction('gitee.publication_prepared', s => {
        s.gitee.pulls.push({round, branch: `codex/team-${s.runId}-gitee-${round}`}); return {round};
      });
      entry = this.store.read().gitee.pulls.at(-1);
    }
    if (entry.branch === this.config.base) throw Error('专用发布分支不能与目标分支相同');
    if (entry.number && entry.state === 'closed') return; // Respect a manually closed, unmerged PR.
    const remoteBranch = await this.client.branchOrNull(entry.branch), current = branchSha(remoteBranch);
    if (remoteBranch && !current) throw Error('远程分支未返回 SHA，停止发布');
    if (current && current !== entry.publishedHead && current !== approved.head) throw Error('远程团队分支被其他人更新，未覆盖');
    const pushKey = 'push-' + entry.round;
    if (current !== approved.head) {
      const previous = state.gitee.ops[pushKey];
      if (['pending', 'unknown'].includes(previous?.status) && previous.commit === approved.head) throw Error('推送结果未知且远程 SHA 尚未匹配，不重复推送；检查后 gitee retry');
      this.op(pushKey, {status: 'pending', commit: approved.head});
      try {
        await this.publish({commit: approved.head, branch: entry.branch, previous: current || null});
        const proof = branchSha(await this.client.branch(entry.branch));
        if (proof !== approved.head) throw Object.assign(Error('推送后远程 SHA 未匹配'), {uncertain: true});
      } catch (error) { this.op(pushKey, {status: 'unknown', error: error.message}); throw error; }
    }
    this.op(pushKey, {status: 'done', commit: approved.head});
    const mark = marker(state.runId, 'pull', entry.round);
    const issueLinks = this.store.read().gitee.issues;
    const content = [`团队成果：${state.runId}，发布轮次 ${entry.round}`, `独立验收并集成的提交：${approved.head}`,
      `本地验证基线：${state.integration.base}`, '', '关联任务：',
      ...state.plan.tasks.map(t => `- [${t.id}](${issueLinks[t.id]?.url || webRepo(this.config)})：${approved.manifest[t.id]}`),
      '', '每个任务已本地独立验收，集成候选已执行配置检查；远程目标变化仍需仓库评审/CI。',
      '此 PR 不由调度器自动合并；不上传原生会话、认领令牌、消息原文或本地验收全文。'].join('\n');
    let remote = entry.number ? await this.client.pull(entry.number) : uniqueRemote(remotePulls, mark);
    if (remote && (!remote.body?.includes(mark) || (typeof remote.head === 'object' && remote.head.ref !== entry.branch) || (typeof remote.base === 'object' && remote.base.ref !== this.config.base))) throw Error('PR 来源/目标或标记不匹配');
    if (!remote) remote = await this.create('pull-' + entry.round, mark, null,
      () => this.client.createPull({title: `[work-together] 团队成果 ${state.runId}（${state.plan.tasks.length} 项任务）`, head: entry.branch, base: this.config.base,
        body: managed(mark, content), close_related_issue: false, prune_source_branch: false}),
      value => this.rememberPull(entry.round, value, {publishedHead: approved.head, manifest: approved.manifest, digest: approved.digest}));
    else {
      if (!entry.number) this.rememberPull(entry.round, remote);
      this.op('pull-' + entry.round, {status: 'done'});
      if (remote.state === 'open') {
        const body = managed(mark, content, remote.body);
        if (body !== remote.body) remote = await this.client.updatePull(remote.number, {body, close_related_issue: false});
      }
    }
    if (pullSha(remote) && pullSha(remote) !== approved.head) throw Error('PR head 与已验收提交不一致，未登记为有效发布');
    this.rememberPull(entry.round, remote, {publishedHead: approved.head, manifest: approved.manifest, digest: approved.digest});
  }
  async sync({issuesOnly = false} = {}) {
    return this.lock(async () => {
      this.bind();
      try {
        const repo = await this.client.repository();
        if (repo.full_name?.toLowerCase() !== `${this.config.owner}/${this.config.repo}`.toLowerCase()) throw Error('Gitee 仓库身份不匹配');
        if (repo.has_issues !== true) throw Error('Gitee 仓库未开启 Issue，不自动更改仓库设置');
        const [issues, pulls] = await Promise.all([this.client.issues(), this.client.pulls()]);
        const closed = await this.observePulls();
        await this.syncIssues(issues, closed);
        if (!issuesOnly) { if (repo.pull_requests_enabled === false) throw Error('仓库未开启 PR'); await this.syncPull(pulls); }
        this.store.transaction('gitee.synced', s => { s.gitee.lastSyncAt = new Date().toISOString(); s.gitee.error = null; });
      } catch (error) {
        this.store.transaction('gitee.sync_failed', s => { s.gitee.error = error.message; }); throw error;
      }
      return this.store.read().gitee;
    });
  }
  retry(key, evidence) {
    if (typeof evidence !== 'string' || !evidence.trim()) throw Error('需提供已确认上次未执行的对账证据');
    return this.store.transaction('gitee.operation_released', s => {
      const op = s.gitee?.ops[key];
      if (!op || !['pending', 'unknown'].includes(op.status)) throw Error('只有未知操作可以经证据释放');
      op.status = 'failed'; op.reconcileEvidence = evidence; return {key, status: op.status};
    });
  }
}
