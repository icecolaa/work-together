export const EXECUTOR_ORDER = ['zcode', 'qoder-global', 'qoder-cn', 'workbuddy-global', 'workbuddy-cn'];
export const EXECUTOR_PORTS = {zcode:19331, 'qoder-global':19333, 'qoder-cn':19334, 'workbuddy-global':19332, 'workbuddy-cn':19335};
export const normalizeEngine = engine => engine === 'workbuddy' ? 'workbuddy-global' : engine === 'qoder' ? 'qoder-global' : engine;
export const validEngine = engine => engine === 'auto' || EXECUTOR_ORDER.includes(normalizeEngine(engine));
export const family = engine => normalizeEngine(engine)?.split('-')[0];

export function candidates(engine = 'auto', coordinator = 'codex', attempted = []) {
  const start = engine === 'auto' ? 0 : EXECUTOR_ORDER.indexOf(normalizeEngine(engine));
  if (start < 0) throw Error(`未知执行器：${engine}`);
  return EXECUTOR_ORDER.slice(start).filter(e => family(e) !== family(coordinator) && !attempted.includes(e));
}

export function lockedCandidate(engine = 'auto', coordinator = 'codex') {
  const candidate = engine === 'auto' ? candidates('auto', coordinator)[0] : normalizeEngine(engine);
  if (!EXECUTOR_ORDER.includes(candidate) || family(candidate) === family(coordinator)) throw Error('锁定执行器不能与现任主持方同族');
  return candidate;
}

export function stopped(snapshot) {
  return !snapshot.pending?.length && ['idle','completed','error','failed','cancelled','stopped'].includes(snapshot.state);
}

export async function confirmStopped(desktop,cwd,id,snapshot,wait=ms=>new Promise(r=>setTimeout(r,ms))) {
  if(stopped(snapshot))return snapshot;
  await desktop.cancel(cwd,id);
  for(let i=0;i<15;i++) {
    await wait(500);
    const current=await desktop.snapshot(cwd,id);
    if(stopped(current))return current;
  }
  throw Error('故障后尚未确认原会话停止，未切换执行器');
}

export async function selectExecutor({engine='auto',coordinator='codex',attempted=[],probe}) {
  const failures=[];
  for(const candidate of candidates(engine,coordinator,attempted)) {
    try { return {engine:candidate,...await probe(candidate),failures}; }
    catch(error) { failures.push({engine:candidate,reason:String(error.message||error),at:new Date().toISOString()}); }
  }
  const error=Error(`无可用执行器：${failures.map(f=>`${f.engine}: ${f.reason}`).join('；')}`);
  error.failures=failures;throw error;
}
