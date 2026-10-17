param(
  [ValidateSet('zcode','workbuddy','both')][string]$Engine = 'both',
  [string]$ZCodePath,
  [string]$WorkBuddyPath,
  [switch]$ForceRestart,
  [ValidateRange(0,60)][int]$GraceSeconds = 5,
  [ValidateRange(1,120)][int]$StartupTimeoutSeconds = 45
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'desktop-lifecycle.ps1')
if (-not $ZCodePath) { $ZCodePath = "$env:LOCALAPPDATA/Programs/ZCode/ZCode.exe" }
if (-not $WorkBuddyPath) {
  $running = Get-Process WorkBuddyAI -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($running -and $running.Path) { $WorkBuddyPath = $running.Path }
  elseif (Test-Path 'E:/workbuddy/WorkBuddyAI/WorkBuddyAI.exe') { $WorkBuddyPath='E:/workbuddy/WorkBuddyAI/WorkBuddyAI.exe' }
}
foreach ($name in @('zcode','workbuddy')) {
  if ($Engine -ne 'both' -and $Engine -ne $name) { continue }
  $port = if ($name -eq 'zcode') { 19331 } else { 19332 }
  $executablePath = if ($name -eq 'zcode') { $ZCodePath } else { $WorkBuddyPath }
  if (-not $executablePath) { throw '请用 -WorkBuddyPath 指定 WorkBuddyAI.exe' }
  Start-WtDesktop -Engine $name -ExecutablePath $executablePath -Port $port -ForceRestart:$ForceRestart -GraceSeconds $GraceSeconds -StartupTimeoutSeconds $StartupTimeoutSeconds
}
