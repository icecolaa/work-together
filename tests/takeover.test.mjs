import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const runner=fileURLToPath(new URL('../skills/work-together/scripts/workflow.mjs',import.meta.url));
const run=(args,dir)=>{try{return{ok:true,out:execFileSync(process.execPath,[runner,...args],{cwd:dir,timeout:20000,encoding:'utf8',stdio:['ignore','pipe','pipe']})};}catch(e){return{ok:false,stderr:String(e.stderr||''),stdout:String(e.stdout||''),message:String(e.message||'')};}};

function project(mutate) {
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'wt-takeover-')));
  const state={engine:'auto',coordinator:'codex',planFile:path.join(dir,'plan.json'),jobs:{a:{id:'a',status:'exec_done',engine:'zcode',sessionId:'s1'}}};
  if(mutate)mutate(state,dir);
  fs.mkdirSync(path.join(dir,'.work-together'),{recursive:true});
  fs.writeFileSync(path.join(dir,'.work-together/state.json'),JSON.stringify(state,null,1));
  return dir;
}

test('takeover 移交主持方、写入历史并提示自验风险',()=>{
  const dir=project();
  const r=run(['takeover','zcode'],dir);
  assert.ok(r.ok,r.stderr||r.message);
  const s=JSON.parse(fs.readFileSync(path.join(dir,'.work-together/state.json')));
  assert.equal(s.coordinator,'zcode');
  assert.equal(s.coordinatorHistory[0].from,'codex');
  assert.equal(s.coordinatorHistory[0].to,'zcode');
  assert.match(r.out,/主持方已从 codex 移交给 zcode/);
  assert.match(r.out,/自验风险：a/);
  const status=fs.readFileSync(path.join(dir,'.work-together/STATUS.md'),'utf8');
  assert.match(status,/接管自 codex/);
});

test('takeover 拒绝未知执行器、同族与运行中的调度器',()=>{
  const dir=project();
  let r=run(['takeover','xyz'],dir);
  assert.ok(!r.ok);assert.match(r.stderr,/未知执行器/);
  r=run(['takeover','qoder-cn'],dir);
  assert.ok(r.ok,r.stderr);
  r=run(['takeover','workbuddy-global'],dir);
  assert.ok(r.ok,r.stderr);
  r=run(['takeover','workbuddy-cn'],dir);
  assert.ok(!r.ok);assert.match(r.stderr,/同族/);
  fs.writeFileSync(path.join(dir,'.work-together/runner.lock'),JSON.stringify({pid:process.pid}));
  r=run(['takeover','qoder-global'],dir);
  assert.ok(!r.ok);assert.match(r.stderr,/仍在运行/);
  fs.rmSync(path.join(dir,'.work-together/runner.lock'));
  r=run(['takeover','qoder-global'],dir);
  assert.ok(r.ok,r.stderr);
  const s=JSON.parse(fs.readFileSync(path.join(dir,'.work-together/state.json')));
  assert.equal(s.coordinatorHistory.length,3);
});

test('接管后 resume 按初始主持方校验',()=>{
  const dir=project((s,dir)=>{s.coordinator='zcode';s.jobs={a:{id:'a',status:'unknown',engine:'auto',sessionId:'x',attempted:[],history:[]}};});
  fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify({engine:'auto',coordinator:'codex',concurrency:1,tasks:[{id:'a',files:['out/a.txt'],prompt:'p',acceptance:['x']}]},null,1));
  let r=run(['run','plan.json','--resume'],dir);
  assert.ok(!r.ok);
  assert.match(r.stderr,/初始主持方/);
  const s=JSON.parse(fs.readFileSync(path.join(dir,'.work-together/state.json')));
  s.coordinatorHistory=[{from:'codex',to:'zcode',at:new Date().toISOString()}];
  fs.writeFileSync(path.join(dir,'.work-together/state.json'),JSON.stringify(s,null,1));
  r=run(['run','plan.json','--resume'],dir);
  assert.doesNotMatch((r.stderr||'')+(r.stdout||''),/初始主持方/);
});

test('接管后同族包默认拒绝自验，--self-review 显式登记',()=>{
  const dir=project(s=>{s.coordinator='zcode';s.coordinatorHistory=[{from:'codex',to:'zcode',at:new Date().toISOString()}];});
  const evidence=path.join(dir,'evidence.md');fs.writeFileSync(evidence,'独立验收证据');
  let r=run(['verify','a',evidence],dir);
  assert.ok(!r.ok);assert.match(r.stderr,/自验不成立/);
  // The successful path needs a desktop-visibility proof, as written by `open a`.
  fs.writeFileSync(path.join(dir,'.work-together','a.visibility.json'),JSON.stringify({confirmed:true,sessionId:'s1',workspace:dir}));
  r=run(['verify','a',evidence,'--self-review'],dir);
  assert.ok(r.ok,r.stderr);
  const s=JSON.parse(fs.readFileSync(path.join(dir,'.work-together/state.json')));
  assert.equal(s.jobs.a.status,'verified');
  assert.equal(s.jobs.a.selfReviewed,true);
  assert.equal(s.jobs.a.reviewer,'zcode');
});
