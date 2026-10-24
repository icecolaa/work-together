import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {QoderDesktop,qoderSnapshot} from '../skills/work-together/scripts/qoder.mjs';
import {matchesDesktopPage} from '../skills/work-together/scripts/cdp.mjs';
test('Qoder 区域使用独立协议页面与端口',()=>{
  assert.equal(matchesDesktopPage('qoder-global','qoder-app://renderer/index.html'),true);
  assert.equal(matchesDesktopPage('qoder-cn','qoder-app://renderer/index.html'),false);
  assert.equal(new QoderDesktop('qoder-cn').port,19334);
  assert.doesNotThrow(()=>new vm.Script(new QoderDesktop('qoder-cn').visibilityExpression('E:/test','id','marker')));
});
test('Qoder 只在send创建任务，受理后重命名失败不重派',async()=>{
  const d=new QoderDesktop('qoder-global');d.modelPolicy={id:'dfmodel',permissionMode:'bypassPermissions'};
  let sends=0;d.eval=async expression=>{if(expression.includes('sendChatMessage')){sends++;return {inputId:'request',disposition:'queued'};}throw Error('rename failed');};
  const id=await d.create('E:/test','title');assert.equal(sends,0);
  await d.send('E:/test',id,'test','request');assert.equal(sends,1);assert.equal(d.presentationWarning,'rename failed');
});
test('Qoder 活跃回合不能被早先的完成消息误判为空闲',()=>{
  assert.equal(qoderSnapshot({summary:{latestTurnStatus:'completed'},activeTurn:{},messages:[{role:'assistant',status:'completed'}]}).state,'working');
  assert.equal(qoderSnapshot({summary:{latestTurnStatus:'completed'},messages:[{role:'assistant',status:'completed',text:'done'}]}).state,'idle');
  assert.equal(qoderSnapshot({summary:{latestTurnStatus:'failed'},messages:[{role:'assistant',status:'failed',text:'quota exhausted'}]}).state,'error');
  assert.equal(qoderSnapshot({summary:{latestTurnStatus:'completed'},pendingInteractions:[{}]}).state,'waiting_input');
});
