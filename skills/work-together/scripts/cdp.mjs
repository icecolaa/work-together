// Local desktop bridges; credentials stay inside the applications.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ZCODE_DEFAULTS, selectZCodeModel, selectWorkBuddyModel } from './model-policy.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Renderer page URLs differ by platform: Windows installs use
// "<install>/ZCode/resources/..." while macOS bundles look like
// "/Applications/ZCode.app/Contents/Resources/app.asar/...". Match the app
// name followed by a resources segment, case-insensitive, both separators.
export function matchesDesktopPage(engine, url) {
  if (typeof url !== 'string' || !url.startsWith('file:')) return false;
  return engine === 'zcode'
    ? /zcode[^\s]*?[/\\]resources/i.test(url)
    : /workbuddy[^\s]*?[/\\]resources/i.test(url);
}

// Derive the ZCode desktop executable from the renderer page URL so focus()
// can reopen the project in the same installation. Windows keeps the legacy
// "<install>/ZCode.exe" derivation; macOS resolves the .app bundle boundary.
// Parsing is host-independent (manual decode + explicit path.win32/posix) so
// the darwin branch stays unit-testable on any platform. An empty string
// means the shape was unrecognized; focus() reports it.
export function deriveZCodeExecutable(pageUrl, platform = process.platform) {
  let decoded;
  try { decoded = decodeURIComponent(pageUrl.split('?')[0].split('#')[0]); } catch { return ''; }
  const body = decoded.match(/^file:\/\/\/(.*)$/)?.[1];
  if (typeof body !== 'string') return '';
  if (platform === 'darwin') {
    const posix = '/' + body;
    const i = posix.toLowerCase().indexOf('.app/');
    if (i < 0) return '';
    const appPath = posix.slice(0, i + 4);
    const name = path.posix.basename(appPath).replace(/\.app$/i, '');
    return path.posix.join(appPath, 'Contents', 'MacOS', name);
  }
  const rendererPath = body.replace(/\//g, '\\');
  const install = rendererPath.slice(0, rendererPath.toLowerCase().indexOf(`${path.win32.sep}resources${path.win32.sep}`));
  return path.win32.join(install, 'ZCode.exe');
}

export class Desktop {
  constructor(engine, port = engine === 'zcode' ? 19331 : 19332, options = {}) {
    this.engine = engine;
    this.port = port;
    this.options = options;
    this.pending = new Map();
    this.seq = 0;
    this.titles = new Map();
  }

  async connect() {
    const pages = await (await fetch(`http://127.0.0.1:${this.port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
    const page = pages.find(p => p.type === 'page' && matchesDesktopPage(this.engine, p.url));
    if (!page) throw Error(`未找到 ${this.engine} 主窗口`);
    this.pageUrl = page.url;
    this.ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = e => {
      const message = JSON.parse(e.data), pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      message.error ? pending.reject(Error(message.error.message)) : pending.resolve(message.result);
    };
    this.ws.onclose = () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(Error('桌面连接断开，执行结果可能未知；先查询原会话，禁止自动重派'));
      }
      this.pending.clear();
    };
    if (this.engine === 'zcode') await this.bootstrapZCode();
    else await this.eval(`(()=>{if(!window.wb?.conversations?.create)throw Error('WorkBuddy 桌面 SDK 不可用');return true})()`);
    return this;
  }

  async bootstrapZCode() {
    await this.eval(`(async()=>{
      const root=document.getElementById('root');
      const key=Object.keys(root).find(k=>k.startsWith('__reactContainer'));
      const queue=[root[key]];let count=0,services;
      while(queue.length&&count++<30000){const fiber=queue.pop();if(!fiber)continue;
        if(fiber.memoizedProps?.services?.zcodeTaskService){services=fiber.memoizedProps.services;break}
        queue.push(fiber.child,fiber.sibling)}
      if(!services)throw Error('ZCode 桌面接口已变化，需更新适配器');
      window.__wtServices=services;
      const src=[...document.scripts].map(s=>s.src).find(s=>/\\/assets\\/index-/.test(s));
      const source=await(await fetch(src)).text();
      const filename=source.match(/skillStore-[A-Za-z0-9_-]+\\.js/)?.[0];
      if(!filename)throw Error('找不到 ZCode 会话导航模块');
      const module=await import(new URL(filename,src).href);
      const store=Object.values(module).find(s=>typeof s?.getState==='function'&&typeof s.getState().setActiveTaskId==='function');
      if(!store)throw Error('ZCode 会话导航接口已变化');
      window.__wtSessionStore=store;return true;
    })()`);
  }

  call(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error(`桌面调用超时 ${method}，结果未知`)); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }

  async resolveModel() {
    if (this.modelPolicy) return this.modelPolicy;
    if (this.engine === 'zcode') {
      // Whitelist metadata: a full provider view can contain credentials.
      const view = await this.eval(`(async()=>{const v=await __wtServices.modelSelectionService.getView();return {
        preferredSelection:v.preferredSelection?{providerId:v.preferredSelection.providerId}:undefined,
        providers:v.providers.map(p=>({providerId:p.providerId,models:p.models.map(m=>({modelId:m.modelId,config:{enabled:m.config?.enabled,reasoningLevels:m.config?.optionSpecs?.reasoningLevel?.values}}))}))}})()`);
      this.modelPolicy = { ...selectZCodeModel(view, this.options.model), mode: this.options.mode || ZCODE_DEFAULTS.mode };
    } else {
      const models = await this.eval(`(async()=>{const r=await wb.models.list();return (r.items||[]).map(m=>({id:m.id,credits:m.credits,supportsToolCall:m.supportsToolCall,disabled:m.disabled}))})()`);
      this.modelPolicy = { ...selectWorkBuddyModel(models, this.options.model), permissionMode: this.options.permissionMode || 'bypassPermissions' };
    }
    return this.modelPolicy;
  }

  async create(cwd, title) {
    const model = await this.resolveModel();
    let id;
    if (this.engine === 'workbuddy') {
      id = await this.eval(`(async()=>{const c=await wb.conversations.create(${JSON.stringify({ cwd, title, mode: 'craft', transport: 'local' })});
        if(!c?.info?.id)throw Error(JSON.stringify(c));
        for(const result of [await c.configManager.setPermissionMode(${JSON.stringify(model.permissionMode)}),await c.configManager.setModel(${JSON.stringify(model.id)})]){
          if(result?.errorCode)throw Error(result.errorCode+': '+result.message)}
        await c.rename(${JSON.stringify(title)});return c.info.id})()`);
    } else {
      const ack = await this.command(cwd, null, 'createSession', { workspaceId: cwd, config: {
        mode: model.mode, modelSelection: { providerId: model.providerId, modelId: model.modelId, ...(model.options ? { options: model.options } : {}) }
      } });
      if (ack.status !== 'accepted' || !ack.result?.sessionId) throw Error(JSON.stringify(ack));
      id = ack.result.sessionId;
    }
    this.titles.set(id, title);
    return id;
  }

  command(cwd, id, type, payload) {
    return this.eval(`__wtServices.zcodeAgentService.sendConversationCommandV4({workspacePath:${JSON.stringify(cwd)},envelope:{
      commandId:crypto.randomUUID(),clientId:localStorage.getItem('zcode-v4-client-id:v1')||'work-together',
      sessionId:${JSON.stringify(id)},type:${JSON.stringify(type)},payload:${JSON.stringify(payload)},issuedAt:Date.now()}})`);
  }

  async send(cwd, id, prompt, requestId = `wt-${id}-${randomUUID()}`) {
    const model = await this.resolveModel();
    if (this.engine === 'zcode') {
      const ack = await this.command(cwd, id, 'sendText', { text: prompt, mode: model.mode,
        modelSelection: { providerId: model.providerId, modelId: model.modelId, ...(model.options ? { options: model.options } : {}) }, requestedDelivery: 'startNow' });
      if (ack.status !== 'accepted') throw Error(JSON.stringify(ack));
      // Renaming is presentation work. Failure must never resend an accepted prompt.
      try {
        if (this.titles.has(id)) await this.eval(`__wtServices.zcodeTaskService.renameTask(${JSON.stringify({ workspacePath: cwd, taskId: id, title: this.titles.get(id) })})`);
      } catch (error) { this.presentationWarning = error.message; }
      return;
    }
    await this.eval(`(async()=>{const c=await wb.conversations.get(${JSON.stringify(id)});window.__wtRuns??={};
      window.__wtRuns[${JSON.stringify(id)}]={state:'submitted'};
      c.runPrompt([{type:'text',text:${JSON.stringify(prompt)}}],{clientRequestId:${JSON.stringify(requestId)}})
        .then(r=>window.__wtRuns[${JSON.stringify(id)}]={state:'settled',result:r},e=>window.__wtRuns[${JSON.stringify(id)}]={state:'error',error:String(e)});return true})()`);
  }

  async focus(cwd, id, marker = '') {
    if (this.engine === 'zcode') {
      const executable = deriveZCodeExecutable(this.pageUrl, process.platform);
      if (!executable || !existsSync(executable)) throw Error('找不到当前 ZCode 窗口的桌面程序，无法打开项目');
      await new Promise((resolve, reject) => {
        const child = spawn(executable, ['--open-workspace', cwd], { windowsHide: true, stdio: 'ignore' });
        child.once('spawn', () => { child.unref(); resolve(); });
        child.once('error', reject);
      });
    } else await this.eval(`wb.navigation.goto(${JSON.stringify('/conversation/' + id)})`);

    let proof;
    for (let attempt = 0; attempt < 100; attempt++) {
      proof = await this.eval(this.visibilityExpression(cwd, id, marker, true));
      if (proof.confirmed) return { ...proof, checkedAt: new Date().toISOString() };
      await sleep(250);
    }
    throw Error(`桌面可见性未确认：${JSON.stringify(proof)}。保留原会话，可用 open 命令重开，禁止重复派发。`);
  }

  visibilityExpression(cwd, id, marker = '', select = false) {
    if (this.engine === 'workbuddy') return `(()=>{const route=wb.navigation.route;const text=document.body.innerText;
      const selected=typeof route==='string'&&route.split('?')[0]===${JSON.stringify('/conversation/' + id)}&&wb.conversations.currentId===${JSON.stringify(id)};
      const transcriptVisible=${JSON.stringify(marker)}?text.includes(${JSON.stringify(marker)}):text.includes('今天帮你做些什么');
      return {sessionId:${JSON.stringify(id)},workspace:${JSON.stringify(cwd)},selected,transcriptVisible,confirmed:selected&&transcriptVisible}})()`;
    return `(()=>{const cwd=${JSON.stringify(cwd)},id=${JSON.stringify(id)},marker=${JSON.stringify(marker)};
      const store=window.__wtSessionStore?.getState();
      const workspace=document.querySelector('[data-testid='+CSS.escape('workspace-item-'+cwd)+']');
      if(${select}&&workspace){store.setActiveTaskId(cwd,id);store.requestTimelineBottom(cwd,id)}
      const item=document.querySelector('[data-testid='+CSS.escape('task-item-'+id)+']');
      if(${select}&&item){item.scrollIntoView({block:'nearest'});if(!item.classList.contains('bg-selected'))item.click()}
      const selected=!!item&&item.classList.contains('bg-selected')&&store?.getWorkspaceState(cwd)?.activeTaskId===id;
      const workspaceVisible=!!workspace&&workspace.getClientRects().length>0;
      const pane=document.querySelector('[data-testid=v4-session-pane-workspace-main]');
      const paneBound=!!pane&&pane.getAttribute('data-session-id')===id;
      const timeline=pane?.querySelector('[data-testid=v4-timeline]');
      const transcriptVisible=paneBound&&(marker?pane.innerText.includes(marker):Number(timeline?.getAttribute('data-total-row-count')||0)>0);
      return {sessionId:id,workspace:cwd,selected,workspaceVisible,paneBound,transcriptVisible,confirmed:selected&&workspaceVisible&&transcriptVisible};})()`;
  }

  async snapshot(cwd, id) {
    if (this.engine === 'zcode') return this.eval(`(async()=>{const r=await __wtServices.zcodeSessionService.readSession({workspacePath:${JSON.stringify(cwd)},sessionId:${JSON.stringify(id)},messageLimit:30});
      return {state:r.session.status,model:r.session.model,mode:r.session.mode,pending:r.projection?.pendingPermissions||[],todos:r.todos||[],
        messages:(r.messages||[]).filter(m=>m.info.role==='assistant').map(m=>({complete:!!m.info.time?.completed,error:m.info.error,
          text:(m.parts||[]).filter(p=>p.type==='text').map(p=>p.text).join('')})),error:r.projection?.lastError||r.session.error}})()`);
    return this.eval(`(async()=>{const c=await wb.conversations.get(${JSON.stringify(id)});const r=await c.requests({page:1,size:10});
      const tools=(r.items||[]).flatMap(m=>(m.assistantMessage?.content||[]).filter(p=>p.type==='tool').map(p=>({name:p.title,status:p.status,input:p.rawInput})));
      return {state:c.info.state,model:c.configManager.model,mode:c.configManager.permissionMode,pending:c.getPendingInfo()?[c.getPendingInfo()]:[],
        todos:tools.filter(t=>/^Task|Todo/.test(t.name)),tools,cancelled:r.items?.[0]?.state==='cancelled',
        messages:(r.items||[]).map(m=>({complete:m.state==='completed',error:m.state==='error'||m.state==='failed'?m.state:undefined,
          text:(m.assistantMessage?.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('')})),run:window.__wtRuns?.[${JSON.stringify(id)}]}})()`);
  }

  async cancel(cwd, id) {
    if (this.engine === 'zcode') return this.command(cwd, id, 'stop', {});
    return this.eval(`(async()=>{const c=await wb.conversations.get(${JSON.stringify(id)});return c.cancel()})()`);
  }

  async screenshot(file) {
    const { writeFile } = await import('node:fs/promises');
    const result = await this.call('Page.captureScreenshot', { format: 'png' });
    await writeFile(file, Buffer.from(result.data, 'base64'));
  }

  close() { this.ws?.close(); }
}
