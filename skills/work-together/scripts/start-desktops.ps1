param([ValidateSet('zcode','workbuddy','both')][string]$Engine='both', [string]$ZCodePath, [string]$WorkBuddyPath)
$ErrorActionPreference='Stop'
if (-not $ZCodePath) { $ZCodePath = "$env:LOCALAPPDATA/Programs/ZCode/ZCode.exe" }
if (-not $WorkBuddyPath) {
  $running = Get-Process WorkBuddyAI -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($running) { $WorkBuddyPath = $running.Path }
  elseif (Test-Path 'E:/workbuddy/WorkBuddyAI/WorkBuddyAI.exe') { $WorkBuddyPath='E:/workbuddy/WorkBuddyAI/WorkBuddyAI.exe' }
}
foreach ($name in @('zcode','workbuddy')) {
  if ($Engine -ne 'both' -and $Engine -ne $name) { continue }
  $port = if ($name -eq 'zcode') { 19331 } else { 19332 }
  try { $null=Invoke-RestMethod "http://127.0.0.1:$port/json/version" -TimeoutSec 2; Write-Output "$name bridge ready ($port)"; continue } catch {}
  $procName=if($name -eq 'zcode'){'ZCode'}else{'WorkBuddyAI'}
  if(Get-Process $procName -ErrorAction SilentlyContinue){throw "$name 已运行但未开启本地调试端口。请从托盘正常退出，再运行此脚本；脚本不会强制结束你的任务。"}
  if($name -eq 'zcode'){Start-Process -FilePath $ZCodePath -ArgumentList '--remote-debugging-address=127.0.0.1','--remote-debugging-port=19331' -WindowStyle Hidden}
  else {if(-not $WorkBuddyPath){throw '请用 -WorkBuddyPath 指定 WorkBuddyAI.exe'};$previous=$env:WORKBUDDY_REMOTE_DEBUGGING_PORT;try{$env:WORKBUDDY_REMOTE_DEBUGGING_PORT='19332';Start-Process -FilePath $WorkBuddyPath -WindowStyle Hidden}finally{$env:WORKBUDDY_REMOTE_DEBUGGING_PORT=$previous}}
  Write-Output "$name 已启动；等待桌面加载后运行 doctor。"
}
