import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {TeamStore} from '../skills/work-together/scripts/team-store.mjs';
import {validateTeamPlan, parseProposal, teamView} from '../skills/work-together/scripts/team-core.mjs';
import {Workspaces, git} from '../skills/work-together/scripts/team-workspace.mjs';
import {TeamRuntime, planWithDesktop} from '../skills/work-together/scripts/team-runtime.mjs';
import {lockedCandidate, candidates} from '../skills/work-together/scripts/executors.mjs';

const scripts = fileURLToPath(new URL('../skills/work-together/scripts/', import.meta.url));
function project() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-team-')));
  git(root, ['init', '-b', 'main']); git(root, ['config', 'core.autocrlf', 'false']); git(root, ['config', 'user.name', 'Team Test']); git(root, ['config', 'user.email', 'team@example.invalid']);
  fs.writeFileSync(path.join(root, '.gitignore'), '.work-together/\n'); fs.writeFileSync(path.join(root, 'SPEC.md'), '写三个独立产物。\n');
  git(root, ['add', '.']); git(root, ['commit', '-m', 'baseline']); return root;
}
const task = (id, extra = {}) => ({id, prompt: 'write ' + id, files: ['out/' + id + '.txt'], acceptance: ['正确产物'], dependsOn: [], ...extra});
function setup(tasks = [task('a'), task('b')], extra = {}) {
  const root = project();
  const plan = validateTeamPlan({concurrency: 2, scope: ['out'],
    agents: [{id: 'z-1', engine: 'zcode', capacity: 1}, {id: 'q-1', engine: 'qoder-global', capacity: 1}], tasks, ...extra}, root);
  const store = new TeamStore(root), workspaces = new Workspaces(root);
  store.init(plan, workspaces.init()); store.transaction('spec.loaded', s => { s.spec = '写产物'; });
  return {root, plan, store, workspaces};
}
function fakeDesktops({fail = new Set(), writes = {}, observations = []} = {}) {
  const sessions = new Map(); let next = 0;
  return async engine => {
    if (fail.has(engine)) throw Error('offline ' + engine);
    return {
      resolveModel: async () => ({id: 'free-test', rate: 0}),
      create: async cwd => { const id = 's' + ++next; sessions.set(id, {cwd}); return id; },
      send: async (cwd, id, prompt) => { sessions.get(id).task = prompt.match(/协作任务包：(\S+)/)[1]; observations.push({engine, cwd, prompt}); },
      focus: async (cwd, id) => ({workspace: cwd, sessionId: id, confirmed: true}),
      snapshot: async (cwd, id) => {
        const session = sessions.get(id);
        const file = writes[session.task] || 'out/' + session.task + '.txt';
        fs.mkdirSync(path.dirname(path.join(cwd, file)), {recursive: true}); fs.writeFileSync(path.join(cwd, file), session.task + '\n');
        return {state: 'idle', messages: [{complete: true, text: 'done ' + session.task}]};
      }, close() {}, cancel: async () => {}
    };
  };
}

test('team 协议校验：旧任务结构、scope、能力、重复 agent、保留目录与拆分预算', () => {
  const {root, store} = setup();
  const base = store.read().plan;
  assert.equal(base.schemaVersion, 2);
  assert.throws(() => validateTeamPlan({...base, tasks: [task('x', {files: ['other/x']})]}, root), /scope/);
  assert.throws(() => validateTeamPlan({...base, tasks: [task('x', {requires: ['browser']})]}, root), /没有满足/);
  assert.throws(() => validateTeamPlan({...base, agents: [base.agents[0], base.agents[0]]}, root), /重复/);
  assert.throws(() => validateTeamPlan({...base, tasks: [task('x', {files: ['.work-together/state']})]}, root), /调度器/);
  assert.throws(() => validateTeamPlan({...base, tasks: [task('x', {files: ['out/../.work-together/state']})]}, root), /调度器/);
  assert.throws(() => validateTeamPlan({...base, maxTasks: 1}, root), /maxTasks/);
  assert.throws(() => lockedCandidate('qoder-cn', 'qoder-global'), /同族/);
  assert.ok(candidates('auto', 'workbuddy-cn').every(e => !e.startsWith('workbuddy')));
  assert.deepEqual(parseProposal('```json\n{"tasks":[]}\n```'), []);
  store.close();
});

test('真实多进程争抢同一任务，只能有一个认领成功', async () => {
  const {root, store} = setup([task('a')]); store.close();
  const moduleUrl = new URL('../skills/work-together/scripts/team-store.mjs', import.meta.url).href;
  const source = `import {TeamStore} from ${JSON.stringify(moduleUrl)}; const s=new TeamStore(process.argv[1]); try{s.claim(process.argv[2],'a');console.log('won')}catch(e){console.log('lost')}finally{s.close()}`;
  const run = agent => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source, root, agent], {windowsHide: true});
    let out = '', err = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(out.trim()) : reject(Error(err)));
  });
  const result = await Promise.all([run('z-1'), run('q-1'), run('z-1'), run('q-1')]);
  assert.equal(result.filter(x => x === 'won').length, 1);
});

test('认领容量、过期不重派、消息幂等与游标、旧令牌和动态任务图', () => {
  const {root, store} = setup([task('a'), task('b'), task('c', {dependsOn: ['a']})]);
  const a = store.claim('z-1', 'a', 1);
  assert.throws(() => store.claim('z-1', 'b'), /没有可认领/);
  store.expire(200000);
  assert.equal(store.read().jobs.a.status, 'unknown');
  assert.throws(() => store.claim('q-1', 'a'), /没有可认领/);
  assert.throws(() => store.updateAttempt('a', 'old', 'bad', () => {}), /失效/);
  assert.throws(() => store.report(a.claimToken, {body: 'expired'}), /失效/);
  const message = {id: 'once', recipient: 'q-1', kind: 'finding', body: {text: '接口约定', evidence: 'SPEC.md'}};
  const seq = store.post(message); assert.equal(store.post(message), seq);
  assert.throws(() => store.post({...message, body: 'other'}), /幂等键/);
  assert.equal(store.inbox('q-1', 0).length, 1); assert.equal(store.inbox('q-1', seq).length, 0); assert.equal(store.inbox('z-1', 0).length, 0);
  assert.equal(store.context('q-1').messages.length, 1); assert.equal(store.context('q-1', 1).truncated, true);
  store.append([task('d', {dependsOn: ['b']})]); assert.equal(store.read().revision, 2);
  assert.throws(() => store.append([task('b')]), /重复/);
  assert.throws(() => store.append([task('loop', {dependsOn: ['missing']})]), /未知任务/);
  assert.equal(store.read().revision, 2);
  assert.ok(!JSON.stringify(teamView(store.read())).includes(a.claimToken));
  store.close();
});

test('自动拆分使用桌面规划器，重复恢复复用已生成计划，非法图不被接纳', async () => {
  const root = project(); let creates = 0;
  const connect = async () => ({resolveModel: async () => ({}), create: async () => { creates++; return 'planner'; }, send: async () => {},
    snapshot: async () => ({state: 'idle', messages: [{complete: true, text: '我先查看目录，再输出 JSON。'}, {complete: true, text: JSON.stringify({tasks: [task('a')]})}]}), focus: async () => ({confirmed: true}), close() {}});
  const config = {scope: ['out'], agents: [{id: 'z-1', engine: 'zcode'}]};
  const plan = await planWithDesktop(root, config, '目标', {connect}); assert.equal(plan.tasks.length, 1);
  assert.equal((await planWithDesktop(root, config, '目标', {connect, resume: true})).tasks[0].id, 'a'); assert.equal(creates, 1);
  await assert.rejects(planWithDesktop(root, config, '不同目标', {connect, resume: true}), /相同输入/);
});

test('端到端：均衡派发、独立工作区、共享发现、验证与集成、依赖获得真实成果', async () => {
  const {root, store} = setup([task('a'), task('b'), task('c', {dependsOn: ['a', 'b']})]);
  const observations = [], runtime = new TeamRuntime(store, {connect: fakeDesktops({observations})});
  await runtime.tick();
  let state = store.read(); assert.equal(state.jobs.a.agentId, 'z-1'); assert.equal(state.jobs.b.agentId, 'q-1');
  assert.notEqual(state.jobs.a.workspace, state.jobs.b.workspace); assert.equal(state.jobs.c.status, 'queued');
  const token = state.jobs.a.claimToken;
  store.report(token, {id: 'discovery', recipient: '*', kind: 'finding', body: {text: '接口稳定', evidence: 'SPEC.md'}});
  assert.equal(store.inbox('q-1').length, 1);
  await runtime.tick(); state = store.read(); assert.equal(state.jobs.a.status, 'exec_done');
  assert.throws(() => runtime.collect('a'), /尚未独立验收/);
  const evidence = path.join(root, '.work-together', 'review.md'); fs.writeFileSync(evidence, '独立读取产物并比对。');
  runtime.verify('a', evidence); runtime.verify('b', evidence);
  assert.deepEqual(runtime.collect(), ['a', 'b']); assert.deepEqual(runtime.collect(), []);
  assert.equal(fs.existsSync(path.join(root, 'out/a.txt')), false, '主工作目录保持原样');
  assert.equal(fs.readFileSync(path.join(store.read().integration.workspace, 'out/a.txt'), 'utf8'), 'a\n');
  await runtime.tick(); state = store.read(); assert.equal(state.jobs.c.status, 'running');
  assert.equal(fs.readFileSync(path.join(state.jobs.c.workspace, 'out/b.txt'), 'utf8'), 'b\n');
  assert.ok(observations.at(-1).prompt.includes('接口稳定'));
  await runtime.tick(); runtime.verify('c', evidence); runtime.collect('c'); assert.equal(store.read().jobs.c.status, 'merged');
  const projection = JSON.parse(fs.readFileSync(path.join(root, '.work-together', 'state.json'))); assert.equal(projection.mode, 'team');
  runtime.close(); store.close();
});

test('归属逐包检查：甲不能借乙的归属越界，其他健康任务仍能完成', async () => {
  const {store} = setup();
  const runtime = new TeamRuntime(store, {connect: fakeDesktops({writes: {a: 'out/b.txt'}})});
  await runtime.tick(); await runtime.tick();
  assert.equal(store.read().jobs.a.status, 'unknown'); assert.match(store.read().jobs.a.error, /归属外/);
  assert.equal(store.read().jobs.b.status, 'exec_done'); runtime.close(); store.close();
});

test('验收后产物变化使合并失效；集成测试失败不修改集成分支', async () => {
  const {root, store} = setup([task('a'), task('b')]);
  const runtime = new TeamRuntime(store, {connect: fakeDesktops()});
  await runtime.tick(); await runtime.tick();
  const evidence = path.join(root, '.work-together/review.md'); fs.writeFileSync(evidence, '已检查');
  runtime.verify('a', evidence);
  fs.writeFileSync(path.join(store.read().jobs.a.workspace, 'out/a.txt'), 'tampered');
  assert.throws(() => runtime.collect('a'), /已改变/);
  runtime.verify('b', evidence);
  store.transaction('checks.updated', s => { s.plan.checks = [{command: process.execPath, args: ['-e', 'process.exit(9)']}]; });
  const before = git(store.read().integration.workspace, ['rev-parse', 'HEAD']);
  assert.throws(() => runtime.collect('b'), /集成失败/);
  assert.equal(git(store.read().integration.workspace, ['rev-parse', 'HEAD']), before);
  assert.equal(store.read().jobs.b.status, 'verified');
  runtime.close(); store.close();
});

test('claim 模式仅执行显式认领的任务；离线执行器不会导致同轮无限重试', async () => {
  const {store} = setup([task('a')], {strategy: 'claim'});
  const runtime = new TeamRuntime(store, {connect: fakeDesktops()});
  await runtime.tick(); assert.equal(store.read().jobs.a.status, 'queued');
  store.claim('q-1', 'a'); await runtime.tick(); assert.equal(store.read().jobs.a.status, 'running');
  runtime.close(); store.close();
  const other = setup([task('a')]); let calls = 0;
  const offline = new TeamRuntime(other.store, {connect: async () => { calls++; throw Error('offline'); }});
  await offline.tick(); assert.equal(calls, 2); assert.equal(other.store.read().jobs.a.status, 'queued'); offline.close(); other.store.close();
});

test('CLI 可读持久团队状态，旧 workflow 拒绝改写 team 投影', () => {
  const {root, store} = setup();
  // Generate the projection without connecting to any desktop.
  const runtime = new TeamRuntime(store); const state = store.read();
  fs.writeFileSync(path.join(root, '.work-together/state.json'), JSON.stringify({mode: 'team', jobs: state.jobs})); store.close();
  const output = execFileSync(process.execPath, [path.join(scripts, 'team.mjs'), '--root', root, 'status'], {encoding: 'utf8', windowsHide: true});
  assert.equal(JSON.parse(output).jobs.length, 2);
  assert.throws(() => execFileSync(process.execPath, [path.join(scripts, 'workflow.mjs'), 'takeover', 'zcode'], {cwd: root, windowsHide: true, stdio: 'pipe'}), error => String(error.stderr).includes('team'));
  runtime.close();
});

test('发送受理后应答丢失：恢复查原会话，不创建或发送第二次', async () => {
  const {store} = setup([task('a')]); let creates = 0, sends = 0;
  const connect = async () => ({resolveModel: async () => ({}), create: async () => { creates++; return 'native'; },
    send: async () => { sends++; throw Error('ack lost'); }, snapshot: async () => ({state: 'working', messages: []}),
    close() {}, focus: async () => ({confirmed: true})});
  const first = new TeamRuntime(store, {connect}); await first.tick(); assert.equal(store.read().jobs.a.status, 'unknown'); first.close();
  const second = new TeamRuntime(store, {connect}); await second.tick(); assert.equal(store.read().jobs.a.status, 'running');
  assert.equal(creates, 1); assert.equal(sends, 1); second.close(); store.close();
});

test('确认取消后重试保留旧产物，新尝试拒绝旧 token，冲突基线不覆盖', async () => {
  const {store} = setup([task('a')]);
  const runtime = new TeamRuntime(store, {connect: fakeDesktops()}); await runtime.tick();
  const first = store.read().jobs.a;
  // fake snapshot writes the partial output while confirming stopped.
  await runtime.cancel('a'); store.retry('a'); await runtime.tick();
  const second = store.read().jobs.a;
  assert.notEqual(second.attemptId, first.attemptId); assert.equal(second.generation, 2);
  assert.equal(fs.readFileSync(path.join(second.workspace, 'out/a.txt'), 'utf8'), 'a\n');
  assert.throws(() => store.updateAttempt('a', first.claimToken, 'old.result', () => {}), /失效/);
  runtime.close(); store.close();
});

test('agent 在范围内提议后续任务，附加父依赖；超范围/重复/超预算事务回滚', async () => {
  const {store} = setup([task('a')]); const runtime = new TeamRuntime(store, {connect: fakeDesktops()}); await runtime.tick();
  const token = store.read().jobs.a.claimToken;
  store.propose(token, [task('follow-up')]);
  assert.deepEqual(store.read().plan.tasks.at(-1).dependsOn, ['a']); assert.equal(store.read().plan.tasks.at(-1).parentId, 'a');
  assert.throws(() => store.propose(token, [task('outside', {files: ['secret.txt']})]), /scope/);
  assert.equal(store.read().revision, 2); assert.equal(store.read().jobs.outside, undefined);
  runtime.close(); store.close();
});

test('集成快进成功但状态写入前中断，collect 可恢复且不重复合并', async () => {
  const {root, store, workspaces} = setup([task('a')]); const runtime = new TeamRuntime(store, {connect: fakeDesktops()});
  await runtime.tick(); await runtime.tick(); const evidence = path.join(root, '.work-together/review.md'); fs.writeFileSync(evidence, '独立验收'); runtime.verify('a', evidence);
  const state = store.read(), candidate = workspaces.lock(() => workspaces.stageMerge(state.plan.tasks[0], state.jobs.a, state.integration, []));
  store.transaction('integration.prepared', s => { s.jobs.a.status = 'integrating'; s.jobs.a.mergeCandidate = candidate; });
  workspaces.lock(() => workspaces.finishMerge(candidate, state.integration));
  assert.deepEqual(runtime.collect('a'), ['a']); assert.equal(store.read().jobs.a.status, 'merged');
  assert.equal(git(state.integration.workspace, ['rev-parse', 'HEAD']), candidate.head); runtime.close(); store.close();
});

test('planner 非法依赖图被拒，保留原会话，不重发或静默换计划', async () => {
  const root = project(); let sends = 0;
  const connect = async () => ({resolveModel: async () => ({}), create: async () => 'p', send: async () => { sends++; },
    snapshot: async () => ({state: 'idle', messages: [{complete: true, text: JSON.stringify({tasks: [task('a', {dependsOn: ['missing']})]})}]}), close() {}});
  const config = {scope: ['out'], agents: [{id: 'z-1', engine: 'zcode'}]};
  await assert.rejects(planWithDesktop(root, config, '目标', {connect}), /未知任务/);
  await assert.rejects(planWithDesktop(root, config, '目标', {connect, resume: true}), /未知任务/);
  assert.equal(sends, 1);
});

test('集成目标变化会废弃旧候选重新测试；未集成产物可修订并撤销旧验收', async () => {
  const {root, store, workspaces} = setup([task('a'), task('b')]); const runtime = new TeamRuntime(store, {connect: fakeDesktops()});
  await runtime.tick(); await runtime.tick(); const evidence = path.join(root, '.work-together/review.md'); fs.writeFileSync(evidence, '独立验收');
  runtime.verify('a', evidence); runtime.verify('b', evidence);
  const state = store.read(), candidate = workspaces.lock(() => workspaces.stageMerge(state.plan.tasks[0], state.jobs.a, state.integration, []));
  store.transaction('candidate.prepared', s => { s.jobs.a.status = 'integrating'; s.jobs.a.mergeCandidate = candidate; });
  runtime.collect('b'); const target = git(state.integration.workspace, ['rev-parse', 'HEAD']);
  runtime.collect('a'); assert.equal(store.read().jobs.a.mergeCandidate.base, target); assert.notEqual(store.read().jobs.a.mergeCandidate.workspace, candidate.workspace);
  assert.throws(() => store.retry('a', '修复'), /未集成/);
  runtime.close(); store.close();
  const other = setup([task('a')]), repair = new TeamRuntime(other.store, {connect: fakeDesktops()}); await repair.tick(); await repair.tick();
  const old = other.store.read().jobs.a; other.store.retry('a', '调整实现并重新测试'); await repair.tick();
  assert.equal(other.store.read().jobs.a.generation, 2); assert.equal(other.store.read().jobs.a.verification, undefined);
  assert.notEqual(other.store.read().jobs.a.attemptId, old.attemptId);
  assert.ok(other.store.read().plan.tasks[0].prompt.includes('调整实现')); repair.close(); other.store.close();
});
