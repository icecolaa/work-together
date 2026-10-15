// Desktop adapters use the local application's own renderer bridge. No credentials copied.
export class Desktop {
  constructor(engine, port = engine === 'zcode' ? 19331 : 19332) { this.engine = engine; this.port = port; this.pending = new Map(); this.seq = 0; this.titles = new Map(); }
  async connect() {
    const pages = await (await fetch(`http://127.0.0.1:${this.port}/json/list`, {signal: AbortSignal.timeout(5000)})).json();
    const page = pages.find(p => p.type === 'page' && p.url.startsWith('file:') && (this.engine === 'zcode' ? /ZCode\/resources/i : /WorkBuddyAI\/resources/i).test(p.url));
    if (!page) throw Error(`未找到 ${this.engine} 主窗口`);
    this.ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = e => { const m = JSON.parse(e.data); const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
    this.ws.onclose = () => { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(Error('桌面连接断开，执行结果可能未知；先查询原会话，禁止自动重派')); } this.pending.clear(); };
    if (this.engine === 'zcode') await this.eval(`(()=>{const root=document.getElementById('root');const key=Object.keys(root).find(k=>k.startsWith('__reactContainer'));const q=[root[key]];let n=0;while(q.length&&n++<30000){const f=q.pop();if(!f)continue;if(f.memoizedProps?.services?.zcodeTaskService){window.__wtServices=f.memoizedProps.services;return true}q.push(f.child,f.sibling)}throw Error('ZCode 桌面接口已变化，需更新适配器')})()`);
    else await this.eval(`(()=>{if(!window.wb?.conversations?.create)throw Error('WorkBuddy 桌面 SDK 不可用');return true})()`);
    return this;
  }
  call(method, params) { return new Promise((resolve, reject) => { const id = ++this.seq; const timer = setTimeout(() => {this.pending.delete(id); reject(Error(`桌面调用超时 ${method}，结果未知`));}, 30000); this.pending.set(id,{resolve,reject,timer}); this.ws.send(JSON.stringify({id,method,params})); }); }
  async eval(expression) { const r = await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}); if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; }
  async create(cwd, title) {
    if(this.engine==='workbuddy') return this.eval(`(async()=>{const c=await wb.conversations.create(${JSON.stringify({cwd,title,mode:'craft',transport:'local'})});if(!c?.info?.id)throw Error(JSON.stringify(c));await c.rename(${JSON.stringify(title)});return c.info.id})()`);
    const ack = await this.command(cwd,null,'createSession',{workspaceId:cwd});
    if(ack.status!=='accepted'||!ack.result?.sessionId)throw Error(JSON.stringify(ack));
    const id=ack.result.sessionId; this.titles.set(id,title); await this.command(cwd,id,'renameSession',{title}); return id;
  }
  command(cwd,id,type,payload) { return this.eval(`__wtServices.zcodeAgentService.sendConversationCommandV4({workspacePath:${JSON.stringify(cwd)},envelope:{commandId:crypto.randomUUID(),clientId:localStorage.getItem('zcode-v4-client-id:v1')||'work-together',sessionId:${JSON.stringify(id)},type:${JSON.stringify(type)},payload:${JSON.stringify(payload)},issuedAt:Date.now()}})`); }
  async send(cwd,id,prompt) {
    if(this.engine==='zcode') { const a=await this.command(cwd,id,'sendText',{text:prompt,mode:'build',requestedDelivery:'startNow'}); if(a.status!=='accepted')throw Error(JSON.stringify(a)); if(this.titles.has(id))await this.eval(`__wtServices.zcodeTaskService.renameTask(${JSON.stringify({workspacePath:cwd,taskId:id,title:this.titles.get(id)})})`); return; }
    // Start the normal desktop request without keeping a 30-second CDP call open.
    return this.eval(`(async()=>{const c=await wb.conversations.get(${JSON.stringify(id)});window.__wtRuns??={};window.__wtRuns[${JSON.stringify(id)}]={state:'submitted'};c.runPrompt([{type:'text',text:${JSON.stringify(prompt)}}],{clientRequestId:${JSON.stringify('wt-'+id)}}).then(r=>window.__wtRuns[${JSON.stringify(id)}]={state:'settled',result:r},e=>window.__wtRuns[${JSON.stringify(id)}]={state:'error',error:String(e)});return true})()`);
  }
  async snapshot(cwd,id) {
    if(this.engine==='zcode') return this.eval(`(async()=>{const r=await __wtServices.zcodeSessionService.readSession({workspacePath:${JSON.stringify(cwd)},sessionId:${JSON.stringify(id)},messageLimit:30});return {state:r.session.status,pending:r.projection?.pendingPermissions||[],todos:r.todos||[],messages:(r.messages||[]).filter(m=>m.info.role==='assistant').map(m=>({complete:!!m.info.time?.completed,error:m.info.error,text:(m.parts||[]).filter(p=>p.type==='text').map(p=>p.text).join('')})),error:r.session.error}})()`);
    return this.eval(`(async()=>{const c=await wb.conversations.get(${JSON.stringify(id)});const r=await c.requests({page:1,size:10});const tools=(r.items||[]).flatMap(m=>(m.assistantMessage?.content||[]).filter(p=>p.type==='tool').map(p=>({name:p.title,status:p.status,input:p.rawInput})));return {state:c.info.state,pending:c.getPendingInfo()?[c.getPendingInfo()]:[],todos:tools.filter(t=>/^Task|Todo/.test(t.name)),tools,cancelled:r.items?.[0]?.state==='cancelled',messages:(r.items||[]).map(m=>({complete:m.state==='completed',error:m.state==='error'||m.state==='failed'?m.state:undefined,text:(m.assistantMessage?.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('')})),run:window.__wtRuns?.[${JSON.stringify(id)}]}})()`);
  }
  async cancel(cwd,id) { if(this.engine==='zcode')return this.command(cwd,id,'stop',{});return this.eval(`(async()=>{const c=await wb.conversations.get(${JSON.stringify(id)});return c.cancel()})()`); }
  async screenshot(path) { const {writeFile}=await import('node:fs/promises'); const r=await this.call('Page.captureScreenshot',{format:'png'});await writeFile(path,Buffer.from(r.data,'base64')); }
  close() { this.ws?.close(); }
}
