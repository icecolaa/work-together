#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {TeamStore} from './team-store.mjs';
import {validateTeamPlan, teamView} from './team-core.mjs';
import {Workspaces} from './team-workspace.mjs';
import {TeamRuntime, planWithDesktop, renderTeam} from './team-runtime.mjs';

const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const value = args[i + 1]; if (value === undefined || value.startsWith('--')) throw Error('参数缺值：' + name);
  args.splice(i, 2); return value;
}
const root = fs.realpathSync(option('--root', process.cwd()));
const after = Number(option('--after', '0'));
const resume = args.includes('--resume'); if (resume) args.splice(args.indexOf('--resume'), 1);
const once = args.includes('--once'); if (once) args.splice(args.indexOf('--once'), 1);
const dryRun = args.includes('--dry-run'); if (dryRun) args.splice(args.indexOf('--dry-run'), 1);
const issuesOnly = args.includes('--issues-only'); if (issuesOnly) args.splice(args.indexOf('--issues-only'), 1);
const interval = Number(option('--interval', '60'));
const [command = 'help', ...pos] = args;
const read = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const defaultConfig = () => ({schemaVersion: 2, coordinator: 'codex', strategy: 'balanced', concurrency: 2, maxTasks: 24,
  spec: 'SPEC.md', scope: ['src', 'tests', 'docs'],
  agents: [{id: 'zcode-01', engine: 'zcode', capacity: 1}, {id: 'qoder-01', engine: 'qoder-global', capacity: 1}],
  checks: []});
function lockRunner(dir) {
  const file = path.join(dir, 'runner.lock');
  if (fs.existsSync(file)) {
    const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
    let alive = true; try { process.kill(previous.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
    if (alive) throw Error('已有调度器运行：' + previous.pid);
    if (!resume) throw Error('发现旧调度锁，检查原会话后 --resume');
    fs.unlinkSync(file);
  }
  const fd = fs.openSync(file, 'wx'); fs.writeFileSync(fd, JSON.stringify({pid: process.pid, mode: 'team'})); fs.closeSync(fd);
  return () => { if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).pid === process.pid) fs.unlinkSync(file); };
}

async function main() {
  const dir = path.join(root, '.work-together');
  if (command === 'help') {
    console.log('Gitee：gitee init [配置JSON] | doctor | plan | sync [--dry-run] [--issues-only] | watch [--interval 秒] [--once] | status | retry <未知操作键> <确认未执行的证据文件>');
    console.log('验收需修复时：revise <任务> <修订说明文件>（保留旧尝试，重新执行/验证）；collect 仅更新本地集成分支。');
    console.log('team.mjs [--root 仓库根] init | plan <Spec> [配置JSON] [--resume] | run [计划JSON] [--resume] [--once] | status | watch | claim <agent> [任务] | append <任务JSON> | propose <认领令牌> <任务JSON> | message <接收者|*> <消息JSON> | report <认领令牌> <消息JSON> | inbox <agent> [--after 游标] | open <任务> | cancel <任务> | abandon <任务> <已停止证据> | retry <任务> | verify <任务> <证据文件> | collect [任务] | stop'); return;
  }
  fs.mkdirSync(dir, {recursive: true});
  const projection = path.join(dir, 'state.json');
  if (fs.existsSync(projection) && JSON.parse(fs.readFileSync(projection, 'utf8')).mode !== 'team') throw Error('此目录已有旧模式运行记录，先验收/归档，不混用 team');
  if (command === 'init') {
    const file = path.join(dir, 'team.config.json');
    fs.writeFileSync(file, JSON.stringify(defaultConfig(), null, 2) + '\n', {flag: 'wx'});
    console.log(`已创建 ${file}，按项目编辑 scope、agent 容量、Spec 和 checks`); return;
  }
  if (command === 'gitee') {
    const {GiteeClient} = await import('./gitee-client.mjs');
    const {GiteeSync, initGitee, loadGiteeConfig, doctorGitee} = await import('./team-gitee.mjs');
    const subcommand = pos[0] || 'status';
    if (subcommand === 'init') { console.log(JSON.stringify(await initGitee(root, pos[1] ? read(pos[1]) : undefined), null, 2)); return; }
    const config = loadGiteeConfig(root);
    if (subcommand === 'doctor') { console.log(JSON.stringify(await doctorGitee(config, new GiteeClient({...config, token: process.env[config.tokenEnv]})), null, 2)); return; }
    const local = new TeamStore(root);
    const summary = () => {
      const g = local.read().gitee;
      return {repository: `${config.owner}/${config.repo}`, lastSyncAt: g?.lastSyncAt, issues: g?.issues || {}, pulls: g?.pulls || [],
        error: g?.error, operations: Object.entries(g?.ops || {}).map(([key, op]) => ({key, status: op.status, error: op.error}))};
    };
    try {
      if (subcommand === 'status') { console.log(JSON.stringify(summary(), null, 2)); return; }
      const service = new GiteeSync(local, config, ['plan', 'retry'].includes(subcommand) || dryRun ? {client: {}} : {});
      if (subcommand === 'plan' || dryRun) { console.log(JSON.stringify(service.preview(), null, 2)); return; }
      if (subcommand === 'retry') { console.log(JSON.stringify(service.retry(pos[1], fs.readFileSync(path.resolve(pos[2]), 'utf8')))); return; }
      if (!['sync', 'watch'].includes(subcommand)) throw Error('未知 gitee 命令');
      if (!Number.isInteger(interval) || interval < 15 || interval > 3600) throw Error('interval 必须为 15..3600 秒');
      let stopped = false;
      const onStop = () => { stopped = true; };
      process.on('SIGINT', onStop); process.on('SIGTERM', onStop);
      try {
        do {
          try { await service.sync({issuesOnly}); renderTeam(local); console.log(JSON.stringify(summary())); }
          catch (error) { renderTeam(local); if (subcommand === 'sync' || once) throw error; console.error(error.message); }
          if (subcommand === 'sync' || once || stopped) break;
          // Short sleeps allow a prompt shutdown without leaving a network operation half-recorded.
          for (let elapsed = 0; elapsed < interval && !stopped; elapsed++) await new Promise(r => setTimeout(r, 1000));
        } while (!stopped);
      } finally { process.off('SIGINT', onStop); process.off('SIGTERM', onStop); }
    } finally { local.close(); }
    return;
  }
  if (command === 'plan') {
    if (!pos[0]) throw Error('plan 需要 Spec 文件');
    const specFile = path.resolve(pos[0]), spec = fs.readFileSync(specFile, 'utf8');
    const configFile = pos[1] || path.join(dir, 'team.config.json');
    const config = {...read(configFile), spec: specFile};
    const existing = new TeamStore(root);
    try { if (existing.exists()) throw Error('运行已初始化，增加任务用 append/propose，不覆盖原计划'); }
    finally { existing.close(); }
    const unlock = lockRunner(dir);
    try {
      // Protect selected applications during read-only planning too.
      const coordinator = config.coordinator || 'codex';
      const engines = config.agents || [];
      fs.writeFileSync(projection, JSON.stringify({mode: 'team', coordinator, jobs: Object.fromEntries(engines.map(a => [a.id, {engine: a.engine, status: 'running'}]))}));
      const plan = await planWithDesktop(root, config, spec, {resume});
      const file = path.join(dir, 'team', 'plan.json');
      fs.writeFileSync(file, JSON.stringify(plan, null, 2) + '\n'); console.log(`已自动拆分 ${plan.tasks.length} 项任务：${file}`);
    } finally { unlock(); }
    return;
  }
  const store = new TeamStore(root), runtime = new TeamRuntime(store);
  try {
    if (command === 'run') {
      const planFile = path.resolve(pos[0] || path.join(store.dir, 'plan.json'));
      const plan = validateTeamPlan(read(planFile), root);
      const hash = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
      const unlock = lockRunner(dir);
      try {
        if (!store.exists()) {
          const spec = fs.readFileSync(path.resolve(root, plan.spec || 'SPEC.md'), 'utf8');
          const integration = new Workspaces(root).init();
          store.init(plan, integration, {initialPlanHash: hash, planFile, spec});
        } else {
          if (!resume) throw Error('已有 team 状态，使用 --resume，不重复派发');
          if (store.read().initialPlanHash !== hash || store.read().planFile !== planFile) throw Error('恢复必须使用原计划；新增任务用 append');
        }
        store.transaction('run.resumed', s => { s.stopRequested = false; return {pid: process.pid}; });
        let stop = false;
        const onStop = () => { stop = true; };
        process.on('SIGINT', onStop); process.on('SIGTERM', onStop);
        try {
          let last = '';
          do {
            const view = await runtime.tick();
            const signature = JSON.stringify(view.counts);
            if (signature !== last) { last = signature; console.log(JSON.stringify({counts: view.counts, status: path.join(store.dir, 'STATUS.md')})); }
            if (once || stop || store.read().stopRequested || Object.values(store.read().jobs).every(j => j.status === 'merged')) break;
            await new Promise(r => setTimeout(r, 3000));
          } while (true);
        } finally { process.off('SIGINT', onStop); process.off('SIGTERM', onStop); }
      } finally { unlock(); }
    } else if (command === 'status') console.log(JSON.stringify(teamView(store.read()), null, 2));
    else if (command === 'watch') {
      let previous = '';
      for (;;) {
        const view = teamView(store.read()), signature = JSON.stringify(view);
        if (signature !== previous) { previous = signature; console.log(JSON.stringify(view, null, 2)); }
        if (Object.values(store.read().jobs).every(j => j.status === 'merged') || store.read().stopRequested) break;
        await new Promise(r => setTimeout(r, 3000));
      }
    } else if (command === 'claim') { const job = store.claim(pos[0], pos[1]); console.log(JSON.stringify({id: job.id, agentId: job.agentId, status: job.status})); renderTeam(store); }
    else if (command === 'append') { const proposal = read(pos[0]); console.log(JSON.stringify(store.append(proposal.tasks))); renderTeam(store); }
    else if (command === 'propose') { console.log(JSON.stringify(store.propose(pos[0], read(pos[1]).tasks))); renderTeam(store); }
    else if (command === 'message') {
      if (pos[0] !== '*' && !store.read().plan.agents.some(a => a.id === pos[0])) throw Error('未知接收 agent');
      const {id, kind, body} = read(pos[1]); console.log(JSON.stringify({seq: store.post({id, kind, body, recipient: pos[0]})}));
    } else if (command === 'report') console.log(JSON.stringify(store.report(pos[0], read(pos[1]))));
    else if (command === 'inbox') console.log(JSON.stringify(store.inbox(pos[0], after), null, 2));
    else if (command === 'open') console.log(JSON.stringify(await runtime.open(pos[0]), null, 2));
    else if (command === 'cancel') { await runtime.cancel(pos[0]); console.log('原会话确认停止，任务已取消'); }
    else if (command === 'abandon') {
      const evidence = fs.readFileSync(path.resolve(pos[1]), 'utf8'); if (!evidence.trim()) throw Error('需独立确认原会话/进程已停止的证据');
      store.transaction('task.abandoned', s => {
        const job = s.jobs[pos[0]]; if (job?.status !== 'unknown') throw Error('abandon 仅处理 unknown，不能替代取消活跃会话');
        Object.assign(job, {status: 'failed', claimToken: null, stopEvidence: evidence}); return {id: job.id};
      });
      renderTeam(store); console.log('已按独立停止证据关闭未知尝试，原工作区保留');
    } else if (command === 'retry') { console.log(JSON.stringify(store.retry(pos[0]))); renderTeam(store); }
    else if (command === 'revise') {
      const correction = fs.readFileSync(path.resolve(pos[1]), 'utf8');
      console.log(JSON.stringify(runtime.workspaces.lock(() => store.retry(pos[0], correction)))); renderTeam(store);
    }
    else if (command === 'verify') { runtime.verify(pos[0], pos[1]); console.log('已独立验收，等待 collect'); }
    else if (command === 'collect') console.log(JSON.stringify({merged: runtime.collect(pos[0]), integration: store.read().integration}));
    else if (command === 'stop') { store.transaction('run.stop_requested', s => { s.stopRequested = true; }); console.log('已请求停止调度；桌面会话保持原状，恢复使用 --resume'); }
    else throw Error('未知 team 命令：' + command);
  } finally { runtime.close(); store.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
