import {randomUUID} from 'node:crypto';
import {Desktop,matchesDesktopPage} from './cdp.mjs';
import {selectQoderModel} from './model-policy.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export function qoderSnapshot(session) {
  const summary=session.summary||{};
  const pending=session.pendingInteractions||[];
  const all=session.messages||[];
  const latestUser=[...all].reverse().find(m=>m.role==='user');
  const messages=all.filter(m=>m.role==='assistant'&&(!latestUser||m.turnId===latestUser.turnId));
  const tools=messages.flatMap(m=>m.tools||[]).map(t=>({name:t.name,status:t.status,input:t.input}));
  const failed=['failed','error'].includes(summary.latestTurnStatus)||messages.some(m=>['failed','error'].includes(m.status));
  const active=!!session.activeTurn||(session.queuedTurns||[]).length>0;
  const cancelled=!active&&summary.latestTurnStatus==='cancelled';
  const state=pending.length?'waiting_input':active?'working':failed?'error':cancelled?'cancelled':summary.latestTurnStatus==='completed'?'idle':session.runtimeState==='error'?'error':'working';
  return {state,model:summary.model,mode:summary.permissionMode,pending,cancelled,
    messages:messages.map(m=>({complete:m.status==='completed',error:['failed','error'].includes(m.status)?(m.text||m.status):undefined,text:m.text||''})),
    tools,todos:tools.filter(t=>/Todo|Task/.test(t.name)),
    error:failed?(messages.find(m=>['failed','error'].includes(m.status))?.text||summary.latestTurnStatus):undefined};
}

export class QoderDesktop extends Desktop {
  isTargetPage(url){return matchesDesktopPage(this.engine,url);}
  async bootstrap(){
    for(let i=0;i<40;i++){
      if(await this.eval(`!!window.qoderDesktop?.sendChatMessage&&!!window.qoderDesktop?.openChatSession&&!!window.qoderDesktop?.listChatModels`))return;
      await sleep(500);
    }
    throw Error('Qoder 桌面桥未就绪或接口已变化');
  }
  async resolveModel(){
    if(this.modelPolicy)return this.modelPolicy;
    const request={workspaceDirectories:[this.cwd||process.cwd()],executionHostKind:'local'};
    const models=await this.eval(`(async()=>{const models=await qoderDesktop.listChatModels(${JSON.stringify(request)});return models.map(m=>({key:m.key,displayName:m.displayName,enabled:m.enabled,priceFactor:m.priceFactor,defaultEffort:m.defaultEffort}))})()`);
    return this.modelPolicy={...selectQoderModel(models,this.options.model),permissionMode:this.options.permissionMode||'bypassPermissions'};
  }
  async create(cwd,title){
    this.cwd=cwd;await this.resolveModel();
    // Qoder creates on first send. Persist this reserved native ID in the
    // scheduler before dispatch, so an interrupted call is never duplicated.
    const id=randomUUID();this.titles.set(id,title);return id;
  }
  async send(cwd,id,prompt,requestId=randomUUID()){
    const model=await this.resolveModel();
    const payload={sessionId:id,inputId:requestId,agentId:'agent:default',cwd,prompt,model:model.id,permissionMode:model.permissionMode,executionKind:'local',createWorkspaceMode:{type:'local'},productMode:'coding'};
    const response=await this.eval(`qoderDesktop.sendChatMessage(${JSON.stringify(payload)})`);
    if(response?.inputId!==requestId||!['queued','started','accepted'].includes(response.disposition))throw Error(`Qoder 未确认受理，保留原会话查明结果：${JSON.stringify(response)}`);
    try{if(this.titles.has(id))await this.eval(`qoderDesktop.renameChatSession(${JSON.stringify(id)},${JSON.stringify(this.titles.get(id))})`);}catch(error){this.presentationWarning=error.message;}
  }
  async focus(cwd,id,marker=''){
    await this.eval(`location.hash=${JSON.stringify('#/chat/'+id+'?surface=conversation')}`);
    let proof;
    for(let i=0;i<100;i++){
      proof=await this.eval(this.visibilityExpression(cwd,id,marker));
      if(proof.confirmed)return {...proof,checkedAt:new Date().toISOString()};
      await sleep(250);
    }
    throw Error(`Qoder 桌面可见性未确认：${JSON.stringify(proof)}；仅打开原会话，不得重新派发`);
  }
  visibilityExpression(cwd,id,marker=''){
    return `(async()=>{const id=${JSON.stringify(id)},cwd=${JSON.stringify(cwd)},marker=${JSON.stringify(marker)};
      const normalize=p=>p.split(String.fromCharCode(92)).join('/').split('/').filter(Boolean).join('/').toLowerCase();
      const result=await qoderDesktop.openChatSession(id,cwd);
      const workspaceValid=normalize(result.summary?.cwd||'')===normalize(cwd);
      const item=[...document.querySelectorAll('[data-session-id]')].find(e=>e.getAttribute('data-session-id')===id);
      const selected=location.hash.split('?')[0]==='#/chat/'+id&&item?.getAttribute('data-active')==='true';
      const transcriptVisible=[...document.querySelectorAll('[data-chat-message-text]')].some(e=>marker?e.textContent.includes(marker):!!e.textContent);
      return {sessionId:id,workspace:cwd,selected:!!selected,workspaceValid,transcriptVisible,confirmed:!!selected&&workspaceValid&&transcriptVisible};})()`;
  }
  async snapshot(cwd,id){
    const session=await this.eval(`(async()=>{const s=await qoderDesktop.openChatSession(${JSON.stringify(id)},${JSON.stringify(cwd)});return {summary:{model:s.summary?.model,permissionMode:s.summary?.permissionMode,latestTurnStatus:s.summary?.latestTurnStatus},runtimeState:s.runtimeState,activeTurn:s.activeTurn,queuedTurns:s.queuedTurns,pendingInteractions:s.pendingInteractions,messages:(s.messages||[]).map(m=>({role:m.role,turnId:m.turnId,status:m.status,text:m.text,tools:(m.tools||[]).map(t=>({name:t.name,status:t.status,input:t.input}))}))}})()`);
    return qoderSnapshot(session);
  }
  async cancel(cwd,id){return this.eval(`qoderDesktop.interruptChatSession(${JSON.stringify(id)})`);}
}
