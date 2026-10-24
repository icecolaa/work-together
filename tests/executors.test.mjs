import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EXECUTOR_ORDER,candidates,selectExecutor,confirmStopped,stopped} from '../skills/work-together/scripts/executors.mjs';

test('默认五级顺序、显式起点、已尝试和主持工具过滤',()=>{
  assert.deepEqual(candidates(),['zcode','qoder-global','qoder-cn','workbuddy-global','workbuddy-cn']);
  assert.deepEqual(candidates('qoder-cn'),EXECUTOR_ORDER.slice(2));
  assert.deepEqual(candidates('workbuddy'),EXECUTOR_ORDER.slice(3));
  assert.deepEqual(candidates('auto','qoder-cn',['zcode']),['workbuddy-global','workbuddy-cn']);
});
test('无模型、未登录、无免费额度时依次跳过并保留原因，选择后停止探测',async()=>{
  const called=[];
  const result=await selectExecutor({probe:async engine=>{called.push(engine);if(engine!=='workbuddy-global')throw Error('无可用免费模型');return {model:{id:'deepseek',rate:0}};}});
  assert.deepEqual(called,EXECUTOR_ORDER.slice(0,4));
  assert.equal(result.engine,'workbuddy-global');assert.equal(result.failures.length,3);
});
test('全部不可用时有界结束，结果包含每项失败原因',async()=>{
  let calls=0;
  await assert.rejects(()=>selectExecutor({probe:async()=>{calls++;throw Error('offline')}}),e=>e.failures.length===5);
  assert.equal(calls,5);
});
test('执行中报错必须取消并确认停止才允许交接',async()=>{
  const events=[];
  const result=await confirmStopped({cancel:async()=>events.push('cancel'),snapshot:async()=>{events.push('snapshot');return {state:'idle'}}},'cwd','original',{state:'working'},async()=>{});
  assert.deepEqual(events,['cancel','snapshot']);assert.equal(result.state,'idle');
});
test('未知结果、断连和仍在执行的原会话不能释放归属',async()=>{
  assert.equal(stopped({state:'idle',pending:[{}]}),false);
  let polls=0;
  await assert.rejects(()=>confirmStopped({cancel:async()=>{},snapshot:async()=>{polls++;return {state:'working'}}},'cwd','original',{state:'working'},async()=>{}),/未切换/);
  assert.equal(polls,15);
  await assert.rejects(()=>confirmStopped({cancel:async()=>{throw Error('连接断开')},snapshot:async()=>assert.fail()},'cwd','original',{state:'working'},async()=>{}),/连接断开/);
});
