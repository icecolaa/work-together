#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Desktop} from './cdp.mjs';
import {validatePlan,canStart,atomicJson,summarize,fingerprint,boundaryChanges} from './core.mjs';
const [cmd='help',...args]=process.argv.slice(2);
const root=fs.realpathSync(process.cwd()),dir=path.join(root,'.work-together');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const stateFile=path.join(dir,'state.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const visibilityFile=id=>path.join(dir,id+'.visibility.json');
async function showJob(desktop,job,marker='') {
  try {const proof=await desktop.focus(root,job.sessionId,marker);atomicJson(visibilityFile(job.id),proof);job.visibility=proof;return proof;}
  catch(error){job.visibility={sessionId:job.sessionId,workspace:root,confirmed:false,error:error.message,checkedAt:new Date().toISOString()};atomicJson(visibilityFile(job.id),job.visibility);return job.visibility;}
}
function render(state) {
  const jobs=Object.values(state.jobs),used=[...new Set(jobs.map(j=>j.engine).filter(Boolean))],mixed=used.length>1;
  const engineLabel=used.length>1?`${used.join(' + ')}（默认 ${state.engine}）`:used[0]||state.engine;
  const cols=['包','状态',...(mixed?['引擎']:[]),'桌面显示已确认','桌面会话'];
  const lines=['# 协作进度','',`主持方：${state.coordinator||'codex'} · 执行器：${engineLabel} · 更新：${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}`,`模型与权限：${JSON.stringify(state.modelPolicy||{})}`,'',`| ${cols.join(' | ')} |`,'|'+cols.map(()=>'---').join('|')+'|',...jobs.map(j=>`| ${j.id} | ${j.status} | ${mixed?`${j.engine||state.engine} | `:''}${j.visibility?.confirmed?'是':'未确认'} | ${j.sessionId||'待派发'} |`)];
  lines.push('','exec_done = 执行者交回，待主持方独立验收。needs_user = 到对应桌面会话处理权限/问题。');
  if(state.boundaryViolations?.length)lines.push('',`验收阻断：发现归属清单外的变更：${state.boundaryViolations.join('、')}。需主代理查明来源与修复。`);
  fs.writeFileSync(path.join(dir,'STATUS.md'),lines.join('\n')+'\n');
  for(const j of Object.values(state.jobs).filter(j=>['needs_user','failed','unknown'].includes(j.status)))fs.writeFileSync(path.join(dir,j.id+'.review.md'),`# 本轮回顾：${j.id}\n\n状态：${j.status}\n\n会话：${j.sessionId}\n\n已完成：${j.summary||'见会话过程'}\n\n需要介入：${j.error||JSON.stringify(j.pending||[]).slice(0,2000)}\n\n下一步：处理后继续查询原会话，不重新派发。\n`);
}
async function main(){
  if(cmd==='doctor') { const engines=args[0]?[args[0]]:['zcode','workbuddy'];for(const engine of engines){if(!['zcode','workbuddy'].includes(engine))throw Error('未知执行器');const d=new Desktop(engine);try{await d.connect();console.log(`${engine}: desktop bridge OK; ${JSON.stringify(await d.resolveModel())}`);}catch(e){console.log(`${engine}: ${e.message}`);process.exitCode=1;}finally{d.close();}}return; }
  if(cmd==='status'){const s=read(stateFile);console.log(JSON.stringify({engine:s.engine,modelPolicy:s.modelPolicy,jobs:Object.values(s.jobs).map(({id,status,sessionId,error,summary,visibility,engine})=>({id,status,sessionId,error,summary,visibility,engine}))},null,2));return;}
  if(cmd==='open'){const s=read(stateFile),j=s.jobs[args[0]];if(!j?.sessionId)throw Error('未知任务包，不能打开不存在的会话');const d=await new Desktop(j.engine||s.engine).connect();try{const proof=await showJob(d,j);console.log(JSON.stringify(proof,null,2));if(!proof.confirmed)process.exitCode=2;}finally{d.close();}return;}
  if(cmd==='watch'){let previous='';for(;;){const x=read(stateFile),signature=Object.values(x.jobs).map(j=>`${j.id}: ${j.status}`).join(' | ');if(signature!==previous){previous=signature;console.log(signature);}if(Object.values(x.jobs).every(j=>['exec_done','verified','failed','unknown','cancelled','blocked'].includes(j.status)))return;await sleep(3000);} }
  if(cmd==='verify'){
    const [id,evidence]=args,s=read(stateFile),j=s.jobs[id];if(!j||j.status!=='exec_done')throw Error('仅能验收 exec_done 的包');
    const visible=fs.existsSync(visibilityFile(id))?read(visibilityFile(id)):j.visibility;
    if(!visible?.confirmed||visible.sessionId!==j.sessionId||visible.workspace!==root)throw Error('尚未确认目标桌面会话可见；先执行 open '+id+'，核对执行过程后再验收');
    const currentViolations=s.baseline?boundaryChanges(s.baseline,fingerprint(root),read(s.planFile).tasks,root):s.boundaryViolations;
    if(currentViolations?.length)throw Error('存在归属清单外变更，必须先修复或重新明确 Spec：'+currentViolations.join(', '));
    const file=path.resolve(evidence||'');if(!evidence||!fs.statSync(file).isFile()||!fs.readFileSync(file,'utf8').trim())throw Error('必须提供主持方独立验收证据文件');
    j.visibility=visible;
    fs.mkdirSync(path.join(dir,'controls'),{recursive:true});atomicJson(path.join(dir,'controls',id+'.json'),{action:'verified',evidence:file,visibility:visible});
    // A process can remain alive after the runner released its lock. Wait for an
    // acknowledgement or apply offline only after the writer has finished.
    for(let attempt=0;attempt<21;attempt++){
      const current=read(stateFile);
      if(current.jobs[id].status==='verified'){console.log(`${id}: 已验收并记录证据`);return;}
      const lockFile=path.join(dir,'runner.lock');let alive=false;
      try{if(fs.existsSync(lockFile)){const owner=read(lockFile);process.kill(owner.pid,0);alive=true;}}catch{}
      if(!alive){current.jobs[id].status='verified';current.jobs[id].evidence=file;current.jobs[id].visibility=visible;atomicJson(stateFile,current);render(current);console.log(`${id}: 已验收并记录证据`);return;}
      await sleep(100);
    }
    console.log(`${id}: 验收证据已排队，等待调度器确认；用 status 查看结果`);return;
  }
  if(cmd==='cancel'){const s=read(stateFile),j=s.jobs[args[0]];if(!j?.sessionId)throw Error('未知会话');const d=await new Desktop(j.engine||s.engine).connect();try{await d.cancel(root,j.sessionId);fs.mkdirSync(path.join(dir,'controls'),{recursive:true});atomicJson(path.join(dir,'controls',j.id+'.json'),{action:'cancel'});console.log('停止请求已送到原会话；请检查桌面最终状态');}finally{d.close();}return;}
  if(cmd!=='run'){console.log('用法：workflow.mjs doctor [zcode|workbuddy] | run <plan.json> | open <包ID> | status | watch | verify <包ID> <验收证据文件> | cancel <包ID>');return;}
  const planFile=path.resolve(args[0]||'plan.json'),plan=validatePlan(read(planFile),root);
  const planHash=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(path.join(dir,'controls'),{recursive:true});
  const lock=path.join(dir,'runner.lock');
  if(fs.existsSync(lock)){const old=read(lock);let alive=false;try{process.kill(old.pid,0);alive=true;}catch{}if(alive)throw Error(`调度器 ${old.pid} 正在运行`);if(!args.includes('--resume'))throw Error('发现旧锁，请检查原桌面会话后用 run <plan> --resume 查询恢复');fs.unlinkSync(lock);}
  let state=fs.existsSync(stateFile)&&args.includes('--resume')?read(stateFile):{engine:plan.engine,coordinator:plan.coordinator,planFile,jobs:Object.fromEntries(plan.tasks.map(t=>[t.id,{id:t.id,status:'queued',engine:t.engine||plan.engine}]))};
  if(state.engine!==plan.engine||state.planFile!==planFile||(state.coordinator||'codex')!==plan.coordinator)throw Error('恢复时必须使用原 plan、engine 和主持方');
  if(state.planHash&&state.planHash!==planHash)throw Error('计划在运行后发生变化；恢复前须核对原计划，不允许静默更换文件归属或依赖');
  for(const t of plan.tasks)if(state.jobs[t.id])state.jobs[t.id].engine??=t.engine||plan.engine;
  state.planHash=planHash;
  if(args.includes('--resume'))for(const j of Object.values(state.jobs))if(['creating','dispatching'].includes(j.status))j.status='unknown';
  if(fs.existsSync(stateFile)&&!args.includes('--resume'))throw Error('此目录已有运行记录；用 --resume 恢复，或先归档整个 .work-together 后开始新任务');
  state.pid=process.pid;const lockFd=fs.openSync(lock,'wx');try{fs.writeFileSync(lockFd,JSON.stringify({pid:process.pid}));}finally{fs.closeSync(lockFd);}
  state.baseline??=fingerprint(root);
  const engines=[...new Set(plan.tasks.map(t=>t.engine||plan.engine))];
  const hostLabel={codex:'Codex',zcode:'ZCode',workbuddy:'WorkBuddy'}[plan.coordinator]||plan.coordinator;
  const desktops={},getDesktop=engine=>desktops[engine]??(desktops[engine]=new Desktop(engine,undefined,{model:plan.model,mode:plan.mode,permissionMode:plan.permissionMode})),desktopFor=j=>getDesktop(j.engine||state.engine);
  let clean=false;
  const save=()=>{state.updatedAt=new Date().toISOString();atomicJson(stateFile,state);render(state);};
  try{
    for(const engine of engines)await getDesktop(engine).connect();
    state.modelPolicy=engines.length===1?await getDesktop(engines[0]).resolveModel():Object.fromEntries(await Promise.all(engines.map(async engine=>[engine,await getDesktop(engine).resolveModel()])));
    save();console.log(`已连接 ${engines.join(' + ')}，共 ${plan.tasks.length} 包；${JSON.stringify(state.modelPolicy)}；详细日志写入 .work-together。`);
    for(;;){
      for(const task of plan.tasks){const j=state.jobs[task.id],ctl=path.join(dir,'controls',j.id+'.json');if(fs.existsSync(ctl)){const c=read(ctl);if(c.action==='verified'&&j.status==='exec_done'){j.status='verified';j.evidence=c.evidence;j.visibility=c.visibility;}if(c.action==='cancel'&&['running','needs_user'].includes(j.status))j.cancelRequested=true;}}
      for(const task of plan.tasks){const j=state.jobs[task.id];if(!['running','needs_user','unknown'].includes(j.status)||!j.sessionId)continue;
        try{const d=desktopFor(j),previous=j.status,snap=await d.snapshot(root,j.sessionId);fs.appendFileSync(path.join(dir,j.id+'.jsonl'),JSON.stringify({at:Date.now(),snapshot:snap})+'\n');const next=summarize(snap);j.status=j.cancelRequested&&['idle','completed'].includes(snap.state)&&!snap.pending?.length?'cancelled':next;j.summary=(snap.messages?.at(-1)?.text||'').slice(-6000);j.todos=snap.todos||[];j.pending=snap.pending||[];j.error=next==='failed'?JSON.stringify(snap.error||snap.run?.error||snap.messages?.find(m=>m.error)?.error):undefined;
          if(next==='needs_user'&&previous!=='needs_user')await showJob(d,j);
          if(fs.existsSync(visibilityFile(j.id)))j.visibility=read(visibilityFile(j.id));
        }catch(e){j.status='unknown';j.error=e.message;}
      }
      for(const task of plan.tasks){const j=state.jobs[task.id];if(j.status!=='queued')continue;
        if((task.dependsOn||[]).some(id=>['failed','cancelled','blocked'].includes(state.jobs[id].status))){j.status='blocked';j.error='前置包失败';continue;}
        if(!(task.dependsOn||[]).every(id=>state.jobs[id].status==='verified'))continue;
        const active=plan.tasks.filter(t=>['running','needs_user','unknown'].includes(state.jobs[t.id].status));
        if(active.length>=plan.concurrency||!canStart(task,active,root))continue;
        try{const d=desktopFor(j);j.status='creating';save();j.sessionId=await d.create(root,`[${hostLabel}/${task.id}] ${task.title||task.id}`);j.status='dispatching';save();
          const prompt=`协作任务包：${task.id}\n你是执行者，${hostLabel}（主持方）负责 Spec、Plan 和独立 Verify。工作目录：${root}\n先读 ${path.join(root,plan.spec||'SPEC.md')}。\n只修改归属文件/目录：${task.files.join('、')}。同目录还有其他执行者，禁止改动其他路径、Git index、提交、推送、发布、安装全局依赖或回退他人文件。特别禁止写 .workbuddy-ai/memory、MEMORY.md 或其他共享工作日志：本包不落盘记忆；需要记忆时在最终回复交给主持方统一整理。文件归属是协作约定，不是操作系统沙箱。\n任务：${task.prompt}\n验收条件：${task.acceptance.join('；')}\n用原生待办工具维护本包进度。现场与计划不符时在边界内判断；超出边界先提问。遇到需用户决定的问题用桌面原生提问/审批，等待回答。结束只交回：变更路径、结果、测试命令/退出码、证据路径、已知问题、下一步。不得把自测称为主持方验收通过。`;
          j.requestId=`wt-${j.id}-${randomUUID()}`;save();await d.send(root,j.sessionId,prompt,j.requestId);j.status='running';j.startedAt=Date.now();save();
          await showJob(d,j,`协作任务包：${task.id}`);save();
          if(!j.visibility.confirmed)console.log(`${j.id}: 任务已提交，桌面显示未确认；请 open ${j.id}，不要重新派发。`);
        }catch(e){j.status='unknown';j.error=e.message;save();}
      }
      save();const jobs=Object.values(state.jobs);
      if(jobs.every(j=>['exec_done','verified','failed','cancelled','blocked'].includes(j.status))){state.boundaryViolations=boundaryChanges(state.baseline,fingerprint(root),plan.tasks,root);clean=true;console.log(jobs.map(j=>`${j.id}: ${j.status}`).join(' | '));if(jobs.some(j=>['failed','blocked'].includes(j.status)))process.exitCode=1;if(state.boundaryViolations.length){console.log('验收阻断：'+state.boundaryViolations.join(', '));process.exitCode=2;}if(jobs.some(j=>j.sessionId&&!j.visibility?.confirmed)){console.log('验收阻断：部分会话尚未确认桌面可见；使用 open 修复。');process.exitCode=2;}break;}
      if(jobs.some(j=>['creating','dispatching','unknown'].includes(j.status))){console.log('执行结果未知，已保留原会话与锁；检查后 --resume，禁止重派。');break;}
      await sleep(3000);
    }
  }finally{save();for(const engine of engines)desktops[engine]?.close();if(clean)fs.unlinkSync(lock);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
