import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('调度器已释放锁但 PID 仍存活时，验收立即落盘，不能只排入无人处理的队列',()=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'wt-verify-'))),dir=path.join(root,'.work-together');
  fs.mkdirSync(dir);
  const evidence=path.join(dir,'evidence.md');fs.writeFileSync(evidence,'独立验收证据');
  const visibility={sessionId:'session',workspace:root,confirmed:true};
  const state={engine:'zcode',pid:process.pid,jobs:{draft:{id:'draft',sessionId:'session',status:'exec_done',visibility}}};
  fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(state));
  const runner=fileURLToPath(new URL('../skills/work-together/scripts/workflow.mjs',import.meta.url));
  execFileSync(process.execPath,[runner,'verify','draft',evidence],{cwd:root,timeout:5000});
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'state.json'))).jobs.draft.status,'verified');
});
