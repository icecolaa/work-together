import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Desktop} from '../skills/work-together/scripts/cdp.mjs';

function inspect({activeId='new-session',paneId='new-session',selected=true,workspace=true,projectName=null,text='协作任务包：new-task'}={}) {
  const item={classList:{contains:()=>selected}};
  const pane={getAttribute:()=>paneId,innerText:text,querySelector:()=>({getAttribute:()=>1})};
  const project=projectName?{getAttribute:()=>projectName,getClientRects:()=>[{}]}:null;
  const document={body:{innerText:text},querySelector:selector=>selector.includes('workspace-item-')?(workspace?{getClientRects:()=>[{}]}:null):selector.includes('section[data-project-name=')?project:selector.includes('v4-session-pane')?pane:item};
  const store={getWorkspaceState:()=>({activeTaskId:activeId})};
  const expression=new Desktop('zcode').visibilityExpression('E:\\real-project','new-session','协作任务包：new-task');
  return vm.runInNewContext(expression,{document,CSS:{escape:s=>s},window:{__wtSessionStore:{getState:()=>store}}});
}

test('旧 smoke 会话仍选中时，不能用后台消息冒充本次会话可见',()=>{
  assert.equal(inspect({activeId:'old-smoke-session',selected:false}).confirmed,false);
});
test('目标项目和会话均选中但正文尚未加载，不算桌面过程可见',()=>{
  assert.equal(inspect({text:'旧的任务内容'}).confirmed,false);
  assert.equal(inspect({workspace:false}).confirmed,false);
  assert.equal(inspect({paneId:'old-smoke-session'}).confirmed,false);
});
test('正确项目、session 与正文包标记共同确认可见性',()=>{
  const proof=inspect();assert.equal(proof.confirmed,true);assert.equal(proof.sessionId,'new-session');
});
test('ZCode 新版项目侧栏识别且拒绝错误项目',()=>{
  assert.equal(inspect({workspace:false,projectName:'real-project'}).confirmed,true);
  assert.equal(inspect({workspace:false,projectName:'different-project'}).confirmed,false);
  assert.equal(inspect({workspace:false,projectName:'real-project',activeId:'other-session'}).confirmed,false);
});

test('已受理消息后重命名失败，不重复发起模型执行',async()=>{
  const desktop=new Desktop('zcode');let sends=0;
  desktop.modelPolicy={providerId:'account:test',modelId:'GLM-5.3-Flash',mode:'yolo'};
  desktop.titles.set('session','title');
  desktop.command=async()=>{sends++;return {status:'accepted'}};
  desktop.eval=async()=>{throw Error('rename failed')};
  await desktop.send('E:\\project','session','task');
  assert.equal(sends,1);assert.equal(desktop.presentationWarning,'rename failed');
});

test('ZCode 创建时就绑定默认模型和思考级别，避免界面沿用旧模型',async()=>{
  const desktop=new Desktop('zcode');let payload;
  desktop.modelPolicy={providerId:'account:test',modelId:'GLM-5.3-Flash',mode:'yolo',options:{reasoningLevel:'max'}};
  desktop.command=async(_cwd,_id,type,p)=>{assert.equal(type,'createSession');payload=p;return {status:'accepted',result:{sessionId:'fresh'}}};
  assert.equal(await desktop.create('E:\\project','title'),'fresh');
  assert.equal(payload.config.mode,'yolo');assert.equal(payload.config.modelSelection.modelId,'GLM-5.3-Flash');
  assert.equal(payload.config.modelSelection.options.reasoningLevel,'max');
});

test('WorkBuddy 原会话的修正轮具有独立请求 ID，不被首轮缓存吞掉',async()=>{
  const desktop=new Desktop('workbuddy'),ids=[];
  desktop.modelPolicy={id:'step-5-preview',permissionMode:'bypassPermissions'};
  const window={};
  const context={window,wb:{conversations:{get:async()=>({runPrompt:async(_content,options)=>{ids.push(options.clientRequestId);return {state:'completed'}}})}}};
  desktop.eval=expression=>vm.runInNewContext(expression,context);
  await desktop.send('E:\\project','same-session','初稿');
  await desktop.send('E:\\project','same-session','修正初稿');
  assert.equal(ids.length,2);assert.notEqual(ids[0],ids[1]);
});
