import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GiteeClient, GiteeError, parseGiteeRemote, validateGiteeConfig} from '../skills/work-together/scripts/gitee-client.mjs';
import {GiteeSync} from '../skills/work-together/scripts/team-gitee.mjs';
import {TeamStore} from '../skills/work-together/scripts/team-store.mjs';
import {validateTeamPlan} from '../skills/work-together/scripts/team-core.mjs';
import {Workspaces, git} from '../skills/work-together/scripts/team-workspace.mjs';

const config = {owner: 'team-test', repo: 'sandbox', base: 'main'};
const task = id => ({id, prompt: 'write ' + id, files: ['out/' + id], acceptance: ['正确'], dependsOn: []});
const clone = x => structuredClone(x);
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-gitee-')));
  git(root, ['init', '-b', 'main']); git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['config', 'user.name', 'Gitee Test']); git(root, ['config', 'user.email', 'test@example.invalid']);
  fs.writeFileSync(path.join(root, '.gitignore'), '.work-together/\n'); git(root, ['add', '.']); git(root, ['commit', '-m', 'baseline']);
  const store = new TeamStore(root), workspaces = new Workspaces(root);
  const plan = validateTeamPlan({concurrency: 2, scope: ['out'], agents: [{id: 'z-1', engine: 'zcode'}], tasks: [task('a')]}, root);
  store.init(plan, workspaces.init());
  return {root, store, workspaces};
}
function complete(f, id) {
  const job = f.store.claim('z-1', id), task = f.store.read().plan.tasks.find(t => t.id === id);
  Object.assign(job, f.workspaces.prepare(task, job, f.store.read().integration, 'Spec'));
  fs.mkdirSync(path.join(job.workspace, 'out'), {recursive: true}); fs.writeFileSync(path.join(job.workspace, 'out', id), id);
  Object.assign(job, f.workspaces.seal(task, job));
  const candidate = f.workspaces.lock(() => f.workspaces.stageMerge(task, job, f.store.read().integration, []));
  f.workspaces.lock(() => f.workspaces.finishMerge(candidate, f.store.read().integration));
  f.store.transaction('test.completed', s => { Object.assign(s.jobs[id], job, {status: 'merged', verification: {commit: job.commit}, mergedCommit: candidate.head}); });
}
class Remote {
  constructor() { this.issueRows = []; this.pullRows = []; this.branches = new Map(); this.count = {issues: 0, pulls: 0, pushes: 0, issuePatches: 0}; }
  async repository() { return {full_name: 'team-test/sandbox', has_issues: true, pull_requests_enabled: true}; }
  async issues() { return clone(this.issueRows); }
  async pulls() { return clone(this.pullRows); }
  async issue(n) { return clone(this.issueRows.find(i => i.number === n)); }
  async createIssue(data) {
    this.count.issues++;
    if (this.failBeforeIssue) { this.failBeforeIssue = false; throw new GiteeError('uncertain', {uncertain: true}); }
    const row = {number: 'I' + this.issueRows.length, state: 'open', ...data}; this.issueRows.push(row);
    if (this.loseIssueAck) { this.loseIssueAck = false; throw new GiteeError('uncertain', {uncertain: true}); }
    return clone(row);
  }
  async updateIssue(n, data) { this.count.issuePatches++; const row = this.issueRows.find(i => i.number === n); Object.assign(row, data); return clone(row); }
  async branchOrNull(branch) { return this.branches.has(branch) ? {commit: {sha: this.branches.get(branch)}} : null; }
  async branch(branch) { const b = await this.branchOrNull(branch); if (!b) throw new GiteeError('not found', {status: 404}); return b; }
  async publish({commit, branch}) { this.count.pushes++; this.branches.set(branch, commit); }
  async createPull(data) {
    this.count.pulls++;
    const row = {...data, number: this.pullRows.length + 1, state: 'open', head: {ref: data.head, sha: this.branches.get(data.head)}, base: {ref: data.base}};
    this.pullRows.push(row);
    if (this.losePullAck) { this.losePullAck = false; throw new GiteeError('uncertain', {uncertain: true}); }
    return clone(row);
  }
  async pull(n) {
    const row = this.pullRows.find(p => p.number === n);
    if (row.state === 'open') row.head.sha = this.branches.get(row.head.ref);
    return clone(row);
  }
  async updatePull(n, data) { const row = this.pullRows.find(p => p.number === n); Object.assign(row, data); return clone(row); }
}
function service(f, remote) { return new GiteeSync(f.store, config, {client: remote, publish: data => remote.publish(data)}); }

test('Gitee 官方接口格式：Bearer 认证、owner 级 Issue、字符串编号及 form body', async () => {
  const requests = [];
  const client = new GiteeClient({...config, token: 'unit-secret', fetchImpl: async (url, init) => {
    requests.push({url: String(url), ...init}); return new Response(JSON.stringify({number: 'IABC', body: 'test'}), {status: 201});
  }});
  await client.createIssue({title: '任务', body: 'test'}); await client.updateIssue('IABC', {state: 'progressing'});
  await client.createPull({title: 'PR', head: 'codex/test', base: 'main', close_related_issue: false});
  assert.equal(new URL(requests[0].url).pathname, '/api/v5/repos/team-test/issues');
  assert.equal(new URLSearchParams(requests[0].body).get('repo'), 'sandbox');
  assert.equal(new URL(requests[1].url).pathname, '/api/v5/repos/team-test/issues/IABC');
  assert.equal(new URLSearchParams(requests[2].body).get('close_related_issue'), 'false');
  for (const request of requests) { assert.equal(request.headers.Authorization, 'Bearer unit-secret'); assert.equal(request.redirect, 'error'); assert.ok(!request.url.includes('unit-secret')); }
  const bad = new GiteeClient({...config, token: 'unit-secret', fetchImpl: async () => { throw Error('unit-secret'); }});
  await assert.rejects(bad.createIssue({title: 'x'}), e => e.uncertain && !e.message.includes('unit-secret'));
});

test('列表完整分页，扫描不完整拒绝继续；配置拒绝令牌明文和其他 API 主机', async () => {
  let calls = 0;
  const client = new GiteeClient({...config, token: 'test', fetchImpl: async () => { calls++; return new Response(JSON.stringify(calls < 3 ? Array(100).fill({}) : [{number: 'last'}])); }});
  assert.equal((await client.issues()).length, 201); assert.equal(calls, 3);
  client.fetch = async () => new Response(JSON.stringify(Array(100).fill({})));
  await assert.rejects(client.issues(), /扫描上限/);
  assert.deepEqual(parseGiteeRemote('https://gitee.com/ice-colaa/work-together.git'), {owner: 'ice-colaa', repo: 'work-together'});
  assert.deepEqual(parseGiteeRemote('git@gitee.com:ice-colaa/work-together.git'), {owner: 'ice-colaa', repo: 'work-together'});
  assert.equal(parseGiteeRemote('https://evil.example/owner/repo.git'), null);
  assert.throws(() => validateGiteeConfig({...config, token: 'secret'}), /未知字段/);
  assert.throws(() => validateGiteeConfig({...config, apiBase: 'https://evil.example'}), /未知字段/);
});

test('未完成任务只同步 Issue，重复不建单，保留人工正文和关闭状态', async () => {
  const f = fixture(), remote = new Remote(), sync = service(f, remote);
  await sync.sync(); assert.equal(remote.count.issues, 1); assert.equal(remote.count.pulls, 0); assert.equal(remote.count.pushes, 0);
  remote.issueRows[0].body = '人工备注\n' + remote.issueRows[0].body + '\n请保留'; remote.issueRows[0].state = 'closed';
  await sync.sync(); assert.equal(remote.count.issues, 1); assert.ok(remote.issueRows[0].body.startsWith('人工备注')); assert.equal(remote.issueRows[0].state, 'closed');
  assert.equal(f.store.read().jobs.a.status, 'queued'); assert.ok(!JSON.stringify(f.store.read()).includes('Bearer'));
  f.store.close();
});

test('Issue 创建应答丢失可通过管理标记对账，不重复 POST', async () => {
  const f = fixture(), remote = new Remote(); remote.loseIssueAck = true;
  await assert.rejects(service(f, remote).sync(), /uncertain/); assert.equal(f.store.read().gitee.ops['issue-a'].status, 'unknown');
  await service(f, remote).sync(); assert.equal(remote.count.issues, 1); assert.equal(f.store.read().gitee.issues.a.number, 'I0'); f.store.close();
});

test('远程未知且未查到对象时禁止重建，独立确认未执行后才释放重试', async () => {
  const f = fixture(), remote = new Remote(), sync = service(f, remote); remote.failBeforeIssue = true;
  await assert.rejects(sync.sync()); await assert.rejects(sync.sync(), /不重复创建/); assert.equal(remote.count.issues, 1);
  assert.throws(() => sync.retry('issue-a', ''), /证据/);
  sync.retry('issue-a', '检查完整仓库列表，确认上次未创建'); await sync.sync(); assert.equal(remote.count.issues, 2); f.store.close();
});

test('同一标记出现多对象时不猜测关联；不同目标不能静默复用映射', async () => {
  const f = fixture(), remote = new Remote(), sync = service(f, remote); await sync.sync();
  f.store.transaction('test.mapping_lost', s => { s.gitee.issues = {}; }); remote.issueRows.push({...remote.issueRows[0], number: 'IDUP'});
  await assert.rejects(sync.sync(), /多个相同/);
  await assert.rejects(new GiteeSync(f.store, {...config, repo: 'other'}, {client: remote}).sync(), /禁止静默换目标/);
  assert.equal(remote.count.issues, 1); f.store.close();
});

test('已验收集成成果创建一个团队 PR；重复同步不重复推送或创建，精确合并后关 Issue', async () => {
  const f = fixture(); complete(f, 'a'); const remote = new Remote(), sync = service(f, remote);
  await sync.sync(); await sync.sync(); assert.deepEqual([remote.count.issues, remote.count.pulls, remote.count.pushes], [1, 1, 1]);
  assert.equal(remote.issueRows[0].state, 'progressing'); assert.equal(remote.pullRows[0].close_related_issue, false);
  remote.pullRows[0].state = 'merged'; remote.pullRows[0].merged_at = '2026-10-26T00:00:00Z';
  await sync.sync(); assert.equal(remote.issueRows[0].state, 'closed'); assert.equal(f.store.read().jobs.a.status, 'merged');
  assert.ok(!remote.pullRows[0].body.includes(f.root)); assert.ok(!remote.pullRows[0].body.includes(f.store.read().jobs.a.claimToken)); f.store.close();
});

test('PR 创建应答丢失保留发布记录，下一次恢复不重复建 PR', async () => {
  const f = fixture(); complete(f, 'a'); const remote = new Remote(); remote.losePullAck = true;
  await assert.rejects(service(f, remote).sync()); await service(f, remote).sync();
  assert.equal(remote.count.pulls, 1); assert.equal(remote.count.pushes, 1); assert.equal(f.store.read().gitee.pulls[0].number, 1); f.store.close();
});

test('手工关闭 PR 不重开；被修改的远程 head 不关闭 Issue或强推覆盖', async () => {
  const f = fixture(); complete(f, 'a'); const remote = new Remote(), sync = service(f, remote); await sync.sync();
  remote.pullRows[0].state = 'closed'; await sync.sync(); assert.equal(remote.count.pulls, 1); assert.equal(remote.issueRows[0].state, 'progressing');
  remote.pullRows[0].state = 'merged'; remote.pullRows[0].merged_at = '2026-10-26'; remote.pullRows[0].head.sha = 'f'.repeat(40);
  await sync.sync(); assert.equal(remote.issueRows[0].state, 'progressing'); assert.equal(remote.count.pushes, 1); f.store.close();
});

test('发布分支被他人更新时拒绝覆盖，未登记的集成提交也不能发布', async () => {
  const f = fixture(); complete(f, 'a'); const remote = new Remote(), sync = service(f, remote); await sync.sync();
  remote.branches.set(remote.pullRows[0].head.ref, 'f'.repeat(40));
  await assert.rejects(sync.sync(), /其他人更新/); assert.equal(remote.count.pushes, 1);
  f.store.transaction('test.reset_remote_projection', s => { delete s.gitee; });
  const collision = {...config, base: `codex/team-${f.store.read().runId}-gitee-1`};
  await assert.rejects(new GiteeSync(f.store, collision, {client: remote, publish: data => remote.publish(data)}).sync(), /目标分支相同/);
  assert.equal(remote.count.pushes, 1);
  const integration = f.store.read().integration.workspace;
  fs.writeFileSync(path.join(integration, 'unreviewed.txt'), 'not reviewed'); git(integration, ['add', '.']); git(integration, ['commit', '-m', 'unreviewed']);
  assert.throws(() => sync.preview(), /未登记提交/); f.store.close();
});

test('前一轮 PR 合并后新增任务创建独立发布轮次，旧 PR 不关闭新任务 Issue', async () => {
  const f = fixture(); complete(f, 'a'); const remote = new Remote(), sync = service(f, remote); await sync.sync();
  remote.pullRows[0].state = 'merged'; remote.pullRows[0].merged_at = '2026-10-26';
  f.store.append([task('b')]); complete(f, 'b'); await sync.sync();
  assert.equal(remote.count.pulls, 2); assert.notEqual(remote.pullRows[0].head.ref, remote.pullRows[1].head.ref);
  assert.equal(remote.issueRows[0].state, 'closed'); assert.equal(remote.issueRows[1].state, 'progressing'); f.store.close();
});

test('CLI dry-run 不需要令牌、不写远程映射或创建远程对象', () => {
  const f = fixture(); fs.writeFileSync(path.join(f.root, '.work-together/gitee.json'), JSON.stringify(config));
  const cli = fileURLToPath(new URL('../skills/work-together/scripts/team.mjs', import.meta.url));
  const env = {...process.env}; delete env.GITEE_OPEN_API; delete env.GITEE_ACCESS_TOKEN;
  const out = execFileSync(process.execPath, [cli, '--root', f.root, 'gitee', 'sync', '--dry-run'], {env, encoding: 'utf8', windowsHide: true});
  assert.equal(JSON.parse(out).issues.length, 1); assert.equal(f.store.read().gitee, undefined); f.store.close();
});
