import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {ownedPath} from './core.mjs';

export function git(cwd, args) {
  return execFileSync('git', ['--literal-pathspecs', ...args], {cwd, encoding: 'utf8', timeout: 60000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']}).trim();
}
export function gitFiles(cwd) {
  return git(cwd, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(f => f && !/^\.work-together(\/|$)/.test(f));
}
export function snapshot(cwd) {
  return Object.fromEntries([...new Set(gitFiles(cwd))].map(file => {
    const full = path.join(cwd, file);
    if (!fs.existsSync(full) && !fs.lstatSync(full, {throwIfNoEntry: false})) return [file, null];
    const stat = fs.lstatSync(full);
    const value = stat.isSymbolicLink() ? 'link:' + fs.readlinkSync(full) : stat.isFile() ? createHash('sha256').update(fs.readFileSync(full)).digest('hex') : 'directory';
    return [file, value];
  }));
}
function dirty(cwd) {
  return git(cwd, ['status', '--porcelain=v1', '--untracked-files=all']).split('\n').filter(s => s && !s.slice(3).replace(/^"|"$/g, '').startsWith('.work-together/'));
}
function assertClean(cwd) { if (dirty(cwd).length) throw Error('工作树不干净，先检查：' + cwd); }

export class Workspaces {
  constructor(root) { this.root = fs.realpathSync(root); this.dir = path.join(this.root, '.work-together', 'team'); }
  lock(fn) {
    const lock = path.join(this.dir, 'workspace.lock');
    fs.mkdirSync(this.dir, {recursive: true});
    if (fs.existsSync(lock)) {
      const owner = JSON.parse(fs.readFileSync(lock, 'utf8'));
      let alive = true; try { process.kill(owner.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
      if (alive) throw Error('另一工作区操作仍在执行');
      fs.unlinkSync(lock);
    }
    const fd = fs.openSync(lock, 'wx'); fs.writeFileSync(fd, JSON.stringify({pid: process.pid})); fs.closeSync(fd);
    try { return fn(); } finally { fs.unlinkSync(lock); }
  }
  init() {
    return this.lock(() => {
      if (path.resolve(git(this.root, ['rev-parse', '--show-toplevel'])).toLowerCase() !== this.root.toLowerCase()) throw Error('team 必须从 Git 仓库根目录运行');
      assertClean(this.root);
      const marker = path.join(this.dir, 'integration.json');
      if (fs.existsSync(marker)) {
        const prior = JSON.parse(fs.readFileSync(marker, 'utf8'));
        this.check(prior); return prior;
      }
      const integration = {workspace: path.join(this.dir, 'integration'), branch: 'codex/team-' + randomUUID().slice(0, 8), base: git(this.root, ['rev-parse', 'HEAD'])};
      git(this.root, ['worktree', 'add', '-b', integration.branch, integration.workspace, integration.base]);
      fs.writeFileSync(marker, JSON.stringify(integration, null, 2)); return integration;
    });
  }
  check(job) {
    const resolved = fs.realpathSync(job.workspace);
    if (!resolved.toLowerCase().startsWith(fs.realpathSync(this.dir).toLowerCase() + path.sep)) throw Error('工作区越界');
    const common = git(resolved, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    const expected = git(this.root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    if (fs.realpathSync(common).toLowerCase() !== fs.realpathSync(expected).toLowerCase()) throw Error('工作区不是当前仓库的 worktree');
    return resolved;
  }
  prepare(task, job, integration, spec) {
    return this.lock(() => {
      this.check(integration);
      const workspace = path.join(this.dir, 'worktrees', job.attemptId);
      const branch = 'codex/task-' + task.id + '-' + job.attemptId.slice(0, 8);
      const base = git(integration.workspace, ['rev-parse', 'HEAD']);
      if (fs.existsSync(workspace)) throw Error('执行尝试工作区已存在，需检查原尝试，不重复创建');
      git(this.root, ['worktree', 'add', '-b', branch, workspace, base]);
      fs.mkdirSync(path.join(workspace, '.work-together'), {recursive: true});
      fs.writeFileSync(path.join(workspace, '.work-together', 'SPEC.md'), spec);
      const baseline = snapshot(workspace);
      if (job.handoff) {
        const changes = this.inspect(task, job.handoff);
        for (const file of changes) {
          if (baseline[file] !== job.handoff.baseline[file]) throw Error('交接路径的集成基线已变化，需人工解决：' + file);
          const source = path.join(job.handoff.workspace, file), target = path.join(workspace, file);
          const stat = fs.lstatSync(source, {throwIfNoEntry: false});
          if (!stat) { if (fs.existsSync(target)) fs.unlinkSync(target); }
          else if (stat.isFile()) { fs.mkdirSync(path.dirname(target), {recursive: true}); fs.copyFileSync(source, target); }
          else throw Error('交接不自动复制链接/目录：' + file);
        }
      }
      return {workspace, branch, base, baseline};
    });
  }
  inspect(task, job) {
    const cwd = this.check(job), after = snapshot(cwd);
    const changes = [...new Set([...Object.keys(job.baseline), ...Object.keys(after)])].filter(f => job.baseline[f] !== after[f]);
    const owned = task.files.map(f => ownedPath(cwd, f));
    const violations = changes.filter(f => {
      const full = ownedPath(cwd, f);
      return !owned.some(base => full === base || full.startsWith(base + path.sep));
    });
    // Existing committed changes must also belong to the task (including deletions).
    const committed = git(cwd, ['diff', '--name-only', '--no-renames', '-z', job.base, 'HEAD']).split('\0').filter(Boolean);
    for (const f of committed) if (!changes.includes(f)) violations.push(f);
    if (violations.length) throw Error('任务归属外变更：' + [...new Set(violations)].join(', '));
    if (git(cwd, ['branch', '--show-current']) !== job.branch) throw Error('任务分支被改变');
    return changes;
  }
  seal(task, job) {
    return this.lock(() => {
      const changes = this.inspect(task, job), cwd = job.workspace;
      const head = git(cwd, ['rev-parse', 'HEAD']);
      const message = `work-together: ${task.id} [${job.attemptId}]`;
      if (head !== job.base) {
        if (git(cwd, ['log', '-1', '--format=%s']) !== message || git(cwd, ['rev-parse', 'HEAD^']) !== job.base || dirty(cwd).length) throw Error('执行者改变了提交历史，需独立检查，未自动接纳');
        return {commit: head, changes}; // Recover a controller commit made before a process crash.
      }
      if (changes.length) {
        git(cwd, ['add', '--all', '--', ...changes]);
        git(cwd, ['commit', '-m', message]);
      }
      assertClean(cwd);
      return {commit: git(cwd, ['rev-parse', 'HEAD']), changes};
    });
  }
  assertSealed(task, job) {
    this.inspect(task, job);
    if (git(job.workspace, ['rev-parse', 'HEAD']) !== job.commit || dirty(job.workspace).length) throw Error('交回后代码已改变，旧验收失效');
  }
  checks(cwd, checks) {
    return checks.map(check => {
      const started = Date.now();
      const output = execFileSync(check.command, check.args, {cwd, encoding: 'utf8', windowsHide: true, timeout: check.timeoutMs || 60000, maxBuffer: 4 * 1024 * 1024});
      return {command: check.command, args: check.args, exitCode: 0, durationMs: Date.now() - started, output: output.slice(-16000)};
    });
  }
  stageMerge(task, job, integration, checks) {
    this.assertSealed(task, job); this.check(integration); assertClean(integration.workspace);
    const base = git(integration.workspace, ['rev-parse', 'HEAD']);
    const workspace = path.join(this.dir, 'candidates', randomUUID());
    git(this.root, ['worktree', 'add', '--detach', workspace, base]);
    try {
      git(workspace, ['merge', '--no-ff', '--no-edit', job.commit]);
      const head = git(workspace, ['rev-parse', 'HEAD']);
      const results = this.checks(workspace, checks);
      if (git(workspace, ['rev-parse', 'HEAD']) !== head) throw Error('测试改变了候选提交');
      assertClean(workspace);
      return {base, head, workspace, checks: results};
    } catch (error) { throw Error(`集成失败，主工作区未改变，候选保留在 ${workspace}：${error.message}`); }
  }
  finishMerge(candidate, integration) {
    this.check(integration); this.check(candidate); assertClean(integration.workspace); assertClean(candidate.workspace);
    if (git(candidate.workspace, ['rev-parse', 'HEAD']) !== candidate.head) throw Error('候选提交已改变');
    const current = git(integration.workspace, ['rev-parse', 'HEAD']);
    if (current === candidate.head) return; // Resume after ff succeeded but before state was stored.
    if (current !== candidate.base) throw Error('集成基线已变化，需重新验证候选');
    git(integration.workspace, ['merge', '--ff-only', candidate.head]);
  }
}
