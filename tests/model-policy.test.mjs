import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditRate, selectWorkBuddyModel, selectZCodeModel, ZCODE_DEFAULTS } from '../skills/work-together/scripts/model-policy.mjs';

test('Auto 和未知费率不是免费；只把明确的零费率解析为零', () => {
  assert.equal(creditRate({credits:''}), null);
  assert.equal(creditRate({credits:'unknown'}), null);
  assert.equal(creditRate({credits:'x0.00'}), 0);
  assert.equal(creditRate({credits:'x0.03 credits'}), 0.03);
});

test('免费工具模型优先；不误选相同名称的收费区域版本', () => {
  const result=selectWorkBuddyModel([
    {id:'default-model',supportsToolCall:true,credits:''},
    {id:'deepseek-v4.1-flash-sg',supportsToolCall:true,credits:'x0.03'},
    {id:'deepseek-v4.1-flash',supportsToolCall:true,credits:'x0.00'},
    {id:'image-model',supportsToolCall:false,credits:'x0.00'}
  ]);
  assert.equal(result.id,'deepseek-v4.1-flash');assert.equal(result.policy,'free-first');
});

test('无免费选项时选最低已知费率，并明确标为收费回退', () => {
  const result=selectWorkBuddyModel([{id:'auto',supportsToolCall:true,credits:''},{id:'b',supportsToolCall:true,credits:'x1.20'},{id:'a',supportsToolCall:true,credits:'x0.03'}]);
  assert.equal(result.id,'a');assert.equal(result.policy,'lowest-known-rate');
  assert.throws(()=>selectWorkBuddyModel([{id:'auto',supportsToolCall:true,credits:''}]));
});

test('ZCode 默认完全访问 + 精确 Flash 模型，不静默换成普通版', () => {
  assert.equal(ZCODE_DEFAULTS.mode,'yolo');
  const view={providers:[{providerId:'account:bigmodel',models:[{modelId:'GLM-5.3',config:{enabled:true}},{modelId:'GLM-5.3-Flash',config:{enabled:true,reasoningLevels:['low','high','max']}}]}]};
  assert.equal(selectZCodeModel(view).modelId,'GLM-5.3-Flash');
  assert.equal(selectZCodeModel(view).options.reasoningLevel,'max');
  assert.throws(()=>selectZCodeModel({providers:[{providerId:'x',models:[{modelId:'GLM-5.3'}]}]}));
});
