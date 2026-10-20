import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {matchesDesktopPage,deriveZCodeExecutable} from '../skills/work-together/scripts/cdp.mjs';

function testBash(){
  if(process.env.WT_TEST_BASH) return process.env.WT_TEST_BASH;
  if(process.platform!=='win32') return 'bash';
  // 不使用 System32/WindowsApps 的 WSL 入口：它可能等待发行版初始化。
  const roots=[process.env.ProgramFiles,process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs')].filter(Boolean);
  const candidates=roots.map(root=>path.join(root,'Git','bin','bash.exe'));
  const windows=path.resolve(process.env.SystemRoot||'C:\\Windows').toLowerCase();
  for(const dir of (process.env.PATH||'').split(path.delimiter).filter(Boolean)){
    const resolved=path.resolve(dir.replace(/^"|"$/g,'')).toLowerCase();
    if(resolved===windows || resolved.startsWith(windows+path.sep) ||
      resolved.split(path.sep).includes('windowsapps')) continue;
    candidates.push(path.join(dir.replace(/^"|"$/g,''),'bash.exe'));
    // Git 的 PATH 常常只有 cmd 目录。
    candidates.push(path.resolve(dir.replace(/^"|"$/g,''),'../bin/bash.exe'));
  }
  const shell=candidates.find(candidate=>fs.existsSync(candidate));
  assert.ok(shell,'需要 Git Bash；请安装 Git for Windows 或设置 WT_TEST_BASH 为 bash 可执行文件路径');
  return shell;
}

test('页面匹配同时接受 Windows 安装形态与 macOS .app 形态',()=>{
  // Windows: <install>/ZCode/resources/... 与 .../WorkBuddyAI/resources/...
  assert.equal(matchesDesktopPage('zcode','file:///C:/Users/u/AppData/Local/Programs/ZCode/resources/index.html?restoreSession=1'),true);
  assert.equal(matchesDesktopPage('workbuddy','file:///E:/workbuddy/WorkBuddyAI/resources/index.html'),true);
  // macOS: /Applications/<Name>.app/Contents/Resources/...
  assert.equal(matchesDesktopPage('zcode','file:///Applications/ZCode.app/Contents/Resources/app.asar/index.html?marks=%7B%7D'),true);
  assert.equal(matchesDesktopPage('workbuddy','file:///Applications/WorkBuddy.app/Contents/Resources/app.asar/index.html'),true);
  // 非 file: 页面与不相关路径被拒
  assert.equal(matchesDesktopPage('zcode','devtools://devtools/bundled/inspector.html'),false);
  assert.equal(matchesDesktopPage('zcode','file:///C:/unrelated/resources/index.html'),false);
  assert.equal(matchesDesktopPage('workbuddy','file:///Applications/ZCode.app/Contents/Resources/app.asar/index.html'),false);
  assert.equal(matchesDesktopPage('zcode',undefined),false);
});

test('ZCode 可执行文件推导：Windows 保持旧路径，macOS 解析 .app 边界',()=>{
  const win=deriveZCodeExecutable('file:///C:/Users/u/AppData/Local/Programs/ZCode/resources/index.html?x=1','win32');
  assert.equal(win.toLowerCase().replace(/\//g,'\\'), 'c:\\users\\u\\appdata\\local\\programs\\zcode\\zcode.exe');
  const mac=deriveZCodeExecutable('file:///Applications/ZCode.app/Contents/Resources/app.asar/index.html','darwin');
  assert.equal(mac,path.posix.join('/Applications','ZCode.app','Contents','MacOS','ZCode'));
  // 大小写混合、空格转义与查询串剥离
  const macMixed=deriveZCodeExecutable('file:///Applications/zcode.App/Contents/Resources/app/index.html?restoreSession=true','darwin');
  assert.equal(macMixed,path.posix.join('/Applications','zcode.App','Contents','MacOS','zcode'));
  const macSpace=deriveZCodeExecutable('file:///Applications/My%20Apps/ZCode.app/Contents/Resources/app/index.html','darwin');
  assert.equal(macSpace,path.posix.join('/Applications','My Apps','ZCode.app','Contents','MacOS','ZCode'));
  // 无法识别形态返回空串，由 focus() 统一报错
  assert.equal(deriveZCodeExecutable('file:///opt/weird/index.html','darwin'),'');
  assert.equal(deriveZCodeExecutable('not-a-url','win32'),'');
});

test('macOS 启动器通过 bash 语法校验',()=>{
  const shell=path.join(fileURLToPath(new URL('../',import.meta.url)),'skills/work-together/scripts/start-desktops.sh');
  assert.ok(fs.existsSync(shell),'start-desktops.sh 缺失');
  execFileSync(testBash(),['-n',shell],{timeout:15000});
});

test('macOS 启动器对非 darwin 平台明确拒绝',{skip:process.platform==='darwin'},()=>{
  const shell=fileURLToPath(new URL('../skills/work-together/scripts/start-desktops.sh',import.meta.url));
  let err=null;
  try { execFileSync(testBash(),[shell],{timeout:15000,encoding:'utf8',stdio:['ignore','pipe','pipe']}); }
  catch(e){ err=e; }
  assert.ok(err,'非 darwin 平台应当拒绝执行');
  assert.equal(err.status,2);
  const text=((err&&err.stderr)||'')+((err&&err.stdout)||'');
  assert.match(text,/仅支持 macOS/);
});
