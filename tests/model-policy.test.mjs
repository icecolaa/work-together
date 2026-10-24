import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creditRate,selectWorkBuddyModel,selectZCodeModel,selectQoderModel,ZCODE_DEFAULTS} from '../skills/work-together/scripts/model-policy.mjs';
test('空费率和 Auto 不视为免费',()=>{
  assert.equal(creditRate({credits:''}),null);assert.equal(creditRate({credits:'unknown'}),null);
  assert.equal(creditRate({credits:'x0.00'}),0);assert.equal(creditRate({credits:'x0.03 credits'}),0.03);
});
test('WorkBuddy 国际版只选择明确零费率 DeepSeek 工具模型',()=>{
  const models=[{id:'auto',supportsToolCall:true,credits:''},{id:'deepseek-sg',supportsToolCall:true,credits:'x0.03'},{id:'step-5',supportsToolCall:true,credits:'x0.00'},{id:'deepseek-flash',supportsToolCall:true,credits:'x0.00'}];
  assert.equal(selectWorkBuddyModel(models,undefined,{deepseekOnly:true}).id,'deepseek-flash');
  assert.throws(()=>selectWorkBuddyModel(models.slice(0,3),undefined,{deepseekOnly:true}));
});
test('免费选项不可用时拒绝收费回退，国内版可选其他零费工具模型',()=>{
  assert.throws(()=>selectWorkBuddyModel([{id:'a',supportsToolCall:true,credits:'x0.03'}]));
  assert.throws(()=>selectWorkBuddyModel([{id:'a',supportsToolCall:true,credits:'x0.03'}],'a'));
  assert.equal(selectWorkBuddyModel([{id:'hy3',supportsToolCall:true,credits:'x0.00'}]).id,'hy3');
});
test('Qoder 两版读取实际 priceFactor，免费标签不能盖过收费或禁用',()=>{
  const models=[{key:'paid',displayName:'DeepSeek-Pro',priceFactor:0.5,tags:['free']},{key:'no',displayName:'DeepSeek',priceFactor:0,enabled:false},{key:'dfmodel',displayName:'DeepSeek-Flash',priceFactor:0,enabled:true,defaultEffort:'max'}];
  assert.equal(selectQoderModel(models).id,'dfmodel');
  assert.throws(()=>selectQoderModel(models.slice(0,2)));
  assert.throws(()=>selectQoderModel([{key:'auto',displayName:'Auto',priceFactor:0}]));
});
test('ZCode 精确选择 FlashX，不能静默替换为 Flash',()=>{
  assert.equal(ZCODE_DEFAULTS.model,'GLM-5.3-FlashX');assert.equal(ZCODE_DEFAULTS.mode,'yolo');
  const view={providers:[{providerId:'account:bigmodel',models:[{modelId:'GLM-5.3-Flash',config:{enabled:true}},{modelId:'GLM-5.3-FlashX',config:{enabled:true,reasoningLevels:['high','max']}}]}]};
  assert.equal(selectZCodeModel(view).modelId,'GLM-5.3-FlashX');assert.equal(selectZCodeModel(view).options.reasoningLevel,'max');
  assert.throws(()=>selectZCodeModel({providers:[{providerId:'x',models:[{modelId:'GLM-5.3-Flash'}]}]}));
});
