import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('Windows 启动生命周期：复用、自动重启、退出回退、运行中保护与超时', {skip:process.platform!=='win32'}, () => {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const bundled=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe');
  const shell=process.env.WT_TEST_POWERSHELL || (fs.existsSync(bundled)?bundled:'powershell.exe');
  const output=execFileSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'tests/desktop-startup.ps1'),'-LifecyclePath',path.join(root,'skills/work-together/scripts/desktop-lifecycle.ps1')],{encoding:'utf8',timeout:15000});
  const results=JSON.parse(output.replace(/^\uFEFF/,''));
  assert.equal(results.length,18);
  assert.deepEqual(results.filter(r=>!r.passed),[]);
});
