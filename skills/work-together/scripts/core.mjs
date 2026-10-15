import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function fingerprint(root) {
  const result={};
  function walk(dir,relative='') { for(const item of fs.readdirSync(dir,{withFileTypes:true})) {
    const rel=relative?relative+'/'+item.name:item.name;
    if(!relative&&['.git','.work-together'].includes(item.name))continue;
    const full=path.join(dir,item.name);
    if(item.isSymbolicLink())result[rel]='link:'+fs.readlinkSync(full);
    else if(item.isDirectory())walk(full,rel);
    else if(item.isFile())result[rel]=createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  }}
  walk(root);return result;
}
export function boundaryChanges(before,after,tasks,root) {
  const owned=tasks.flatMap(t=>t.files.map(f=>ownedPath(root,f)));
  return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(f=>before[f]!==after[f]).filter(f=>{
    const full=path.resolve(root,f).toLowerCase();return !owned.some(o=>full===o||full.startsWith(o+path.sep));
  });
}
export function ownedPath(root, relative) {
  if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.includes(':'))throw Error('文件归属必须是相对路径');
  const full=path.resolve(root,relative),base=fs.realpathSync(root);
  if(!full.toLowerCase().startsWith(path.resolve(root).toLowerCase()+path.sep))throw Error('文件归属越界');
  let ancestor=full;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
  const real=fs.realpathSync(ancestor).toLowerCase();
  if(real!==base.toLowerCase()&&!real.startsWith(base.toLowerCase()+path.sep))throw Error('文件归属穿过工作区外的链接');
  return path.resolve(fs.realpathSync(ancestor),path.relative(ancestor,full)).toLowerCase();
}
export function overlap(a,b) { return a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep); }
export function validatePlan(plan,root) {
  if(!['zcode','workbuddy'].includes(plan.engine))throw Error('engine 必须为 zcode 或 workbuddy');
  if(!Array.isArray(plan.tasks)||!plan.tasks.length)throw Error('任务包为空');
  if(!Number.isInteger(plan.concurrency)||plan.concurrency<1||plan.concurrency>4)throw Error('concurrency 必须为 1..4');
  const ids=new Set();for(const t of plan.tasks){if(!/^[a-z0-9-]+$/.test(t.id)||ids.has(t.id))throw Error('任务 ID 非法或重复');ids.add(t.id);if(!t.prompt||!t.files?.length||!t.acceptance?.length)throw Error('每包需要 prompt/files/acceptance');t.files.forEach(f=>ownedPath(root,f));}
  const done=new Set();while(done.size<ids.size){const next=plan.tasks.filter(t=>!done.has(t.id)&&(t.dependsOn||[]).every(d=>done.has(d)));if(!next.length)throw Error('依赖存在环或未知任务');next.forEach(t=>done.add(t.id));} return plan;
}
export function canStart(task,active,root) { const files=task.files.map(f=>ownedPath(root,f));return active.every(a=>a.files.every(f=>files.every(p=>!overlap(p,ownedPath(root,f))))); }
export function atomicJson(file,data) { const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n');fs.renameSync(tmp,file); }
export function summarize(snapshot) {
  if(snapshot.pending?.length)return 'needs_user';
  if(['waiting_permission','waiting_input','awaiting_permission','awaiting_input'].includes(snapshot.state))return 'needs_user';
  if(snapshot.cancelled)return 'cancelled';
  if(['error','failed'].includes(snapshot.state)||snapshot.error||snapshot.run?.state==='error'||snapshot.messages?.some(m=>m.error))return 'failed';
  if(snapshot.messages?.some(m=>m.complete)&&['idle','completed'].includes(snapshot.state))return 'exec_done';
  return 'running';
}
