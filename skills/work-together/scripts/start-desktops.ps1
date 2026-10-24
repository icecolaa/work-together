param(
  [ValidateSet('auto','all','zcode','qoder-global','qoder-cn','workbuddy-global','workbuddy-cn','workbuddy','both')][string]$Engine = 'auto',
  [string]$ZCodePath,
  [string]$QoderGlobalPath = 'E:/Qoder/Qoder.exe',
  [string]$QoderCNPath = 'E:/Qoder CN/Qoder CN.exe',
  [string]$WorkBuddyGlobalPath,
  [string]$WorkBuddyCNPath = 'E:/workbuddyCN/WorkBuddy.exe',
  [string]$WorkBuddyPath,
  [string]$Coordinator,
  [switch]$ForceRestart,
  [ValidateRange(0,60)][int]$GraceSeconds = 5,
  [ValidateRange(1,120)][int]$StartupTimeoutSeconds = 45
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'desktop-lifecycle.ps1')
if (-not $ZCodePath) { $ZCodePath = "$env:LOCALAPPDATA/Programs/ZCode/ZCode.exe" }
if (-not $WorkBuddyGlobalPath) { $WorkBuddyGlobalPath = $WorkBuddyPath }
if (-not $WorkBuddyGlobalPath) {
  $running = Get-Process WorkBuddyAI -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($running -and $running.Path) { $WorkBuddyGlobalPath = $running.Path }
  else { $WorkBuddyGlobalPath = 'E:/workbuddy/WorkBuddyAI/WorkBuddyAI.exe' }
}
# 主持方自己的桌面承载着协调聊天，重启会杀掉会话：默认跳过同族桌面。
# 未显式指定时从当前目录 plan.json 的 coordinator 自动检测。
if (-not $Coordinator) {
  $planFile = Join-Path (Get-Location).Path 'plan.json'
  if (Test-Path -LiteralPath $planFile) {
    try { $plan = Get-Content -LiteralPath $planFile -Raw -ErrorAction Stop | ConvertFrom-Json; if ($plan.coordinator) { $Coordinator = $plan.coordinator } } catch {}
  }
}
$desktops = @(
  @{Engine='zcode'; Path=$ZCodePath; Port=19331},
  @{Engine='qoder-global'; Path=$QoderGlobalPath; Port=19333},
  @{Engine='qoder-cn'; Path=$QoderCNPath; Port=19334},
  @{Engine='workbuddy-global'; Path=$WorkBuddyGlobalPath; Port=19332},
  @{Engine='workbuddy-cn'; Path=$WorkBuddyCNPath; Port=19335}
)
$unfiltered = if ($Engine -in @('auto','all')) { @($desktops.Engine) }
  elseif ($Engine -eq 'both') { @('zcode','workbuddy-global') }
  else { @(ConvertTo-WtEngine $Engine) }
$selected = Get-WtDesktopSelection -Engine $Engine -AllEngines @($desktops.Engine) -Coordinator $Coordinator
foreach ($skipped in $unfiltered) {
  if ($skipped -notin $selected) {
    Write-Output "$skipped 是当前主持方（coordinator=$Coordinator）同族桌面，跳过启动以保护主持会话；如需强制启动用 -Engine $skipped。"
  }
}
$failures = @()
foreach ($desktop in $desktops) {
  if ($desktop.Engine -notin $selected) { continue }
  try {
    Start-WtDesktop -Engine $desktop.Engine -ExecutablePath $desktop.Path -Port $desktop.Port -ForceRestart:$ForceRestart -GraceSeconds $GraceSeconds -StartupTimeoutSeconds $StartupTimeoutSeconds
  } catch {
    if ($selected.Count -eq 1) { throw }
    $failures += "$($desktop.Engine): $($_.Exception.Message)"
    Write-Warning $failures[-1]
  }
}
if ($failures.Count) { throw "部分候选桌面未就绪；已继续检查其他候选。$($failures -join ' | ')" }
