param(
  [ValidateSet('auto','all','zcode','qoder-global','qoder-cn','workbuddy-global','workbuddy-cn','workbuddy','both')][string]$Engine = 'auto',
  [string]$ZCodePath,
  [string]$QoderGlobalPath = 'E:/Qoder/Qoder.exe',
  [string]$QoderCNPath = 'E:/Qoder CN/Qoder CN.exe',
  [string]$WorkBuddyGlobalPath,
  [string]$WorkBuddyCNPath = 'E:/workbuddyCN/WorkBuddy.exe',
  [string]$WorkBuddyPath,
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
$desktops = @(
  @{Engine='zcode'; Path=$ZCodePath; Port=19331},
  @{Engine='qoder-global'; Path=$QoderGlobalPath; Port=19333},
  @{Engine='qoder-cn'; Path=$QoderCNPath; Port=19334},
  @{Engine='workbuddy-global'; Path=$WorkBuddyGlobalPath; Port=19332},
  @{Engine='workbuddy-cn'; Path=$WorkBuddyCNPath; Port=19335}
)
$selected = if ($Engine -in @('auto','all')) { @($desktops.Engine) }
  elseif ($Engine -eq 'both') { @('zcode','workbuddy-global') }
  else { @(ConvertTo-WtEngine $Engine) }
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
