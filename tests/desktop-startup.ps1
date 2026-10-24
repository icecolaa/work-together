param([string]$LifecyclePath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$script:results = New-Object System.Collections.Generic.List[object]
$script:target = Join-Path $PSHOME $(if (Test-Path (Join-Path $PSHOME 'pwsh.exe')) { 'pwsh.exe' } else { 'powershell.exe' })

function Assert-WtTest {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}
function Invoke-WtTest {
  param([string]$Name, [scriptblock]$Body)
  . $LifecyclePath
  try { & $Body; $script:results.Add(@{name=$Name;passed=$true}) }
  catch { $script:results.Add(@{name=$Name;passed=$false;error=$_.Exception.Message}) }
}

Invoke-WtTest 'JSON array response accepts the matching desktop page' {
  function Invoke-RestMethod {
    param($Uri,$TimeoutSec)
    if ($Uri.EndsWith('/json/version')) { return [pscustomobject]@{webSocketDebuggerUrl='ws://127.0.0.1/test'} }
    $resourceFile = Join-Path (Split-Path $script:target -Parent) 'resources/index.html'
    $items = @([pscustomobject]@{type='page';url=(([uri]$resourceFile).AbsoluteUri + '?restoreSession=true&marks=%7B%22createdAt%22%3A1%7D')},[pscustomobject]@{type='worker';url=''})
    Write-Output -NoEnumerate $items
  }
  Assert-WtTest (Test-WtDebugBridge -Port 19331 -ExecutablePath $script:target) 'matching page rejected'
}

Invoke-WtTest 'unrelated debug pages are rejected' {
  function Invoke-RestMethod {
    param($Uri,$TimeoutSec)
    if ($Uri.EndsWith('/json/version')) { return [pscustomobject]@{webSocketDebuggerUrl='ws://127.0.0.1/test'} }
    Write-Output -NoEnumerate @([pscustomobject]@{type='page';url='file:///C:/unrelated/resources/index.html'})
  }
  Assert-WtTest (-not (Test-WtDebugBridge -Port 19331 -ExecutablePath $script:target)) 'unrelated page accepted'
}

Invoke-WtTest 'healthy bridge is reused' {
  function Test-WtDebugBridge { param($Port,$ExecutablePath) return $true }
  function Stop-WtDesktop { throw 'healthy app was stopped' }
  function Invoke-WtDesktopLaunch { throw 'healthy app was relaunched' }
  $null = Start-WtDesktop -Engine zcode -ExecutablePath $script:target -Port 19331
}

Invoke-WtTest 'missing bridge restarts the existing app before waiting' {
  $script:trace = New-Object System.Collections.Generic.List[string]
  function Test-WtDebugBridge { param($Port,$ExecutablePath) return $false }
  function Get-WtAppProcesses { param($ExecutablePath) return [pscustomobject]@{Id=123} }
  function Test-WtActiveWorkflow { param($Engine) return $false }
  function Stop-WtDesktop { param($ExecutablePath,$GraceSeconds) $script:trace.Add('stop') }
  function Invoke-WtDesktopLaunch { param($Engine,$ExecutablePath,$Port) $script:trace.Add('launch') }
  function Wait-WtDebugBridge { param($Port,$ExecutablePath,$TimeoutSeconds) $script:trace.Add('wait') }
  $null = Start-WtDesktop -Engine zcode -ExecutablePath $script:target -Port 19331
  Assert-WtTest (($script:trace -join ',') -eq 'stop,launch,wait') 'incorrect lifecycle order'
}

Invoke-WtTest 'stopped app is started without stopping anything' {
  $script:launched = $false
  function Test-WtDebugBridge { param($Port,$ExecutablePath) return $false }
  function Get-WtAppProcesses { param($ExecutablePath) return @() }
  function Stop-WtDesktop { throw 'stopped app was stopped again' }
  function Invoke-WtDesktopLaunch { param($Engine,$ExecutablePath,$Port) $script:launched=$true }
  function Wait-WtDebugBridge { param($Port,$ExecutablePath,$TimeoutSeconds) }
  $null = Start-WtDesktop -Engine workbuddy -ExecutablePath $script:target -Port 19332
  Assert-WtTest $script:launched 'launch not called'
}

Invoke-WtTest 'active workflow prevents an implicit restart' {
  function Test-WtDebugBridge { param($Port,$ExecutablePath) return $false }
  function Get-WtAppProcesses { param($ExecutablePath) return [pscustomobject]@{Id=123} }
  function Test-WtActiveWorkflow { param($Engine) return $true }
  function Stop-WtDesktop { throw 'active task was interrupted' }
  $caught = $false
  try { $null = Start-WtDesktop -Engine zcode -ExecutablePath $script:target -Port 19331 }
  catch { $caught = $_.Exception.Message.Contains('-ForceRestart') }
  Assert-WtTest $caught 'active workflow was not protected'
}

Invoke-WtTest 'explicit ForceRestart restarts even a healthy instance' {
  $script:trace = New-Object System.Collections.Generic.List[string]
  function Test-WtDebugBridge { param($Port,$ExecutablePath) return $true }
  function Get-WtAppProcesses { param($ExecutablePath) return [pscustomobject]@{Id=123} }
  function Test-WtActiveWorkflow { throw 'explicit restart checked the implicit task gate' }
  function Stop-WtDesktop { param($ExecutablePath,$GraceSeconds) $script:trace.Add('stop') }
  function Invoke-WtDesktopLaunch { param($Engine,$ExecutablePath,$Port) $script:trace.Add('launch') }
  function Wait-WtDebugBridge { param($Port,$ExecutablePath,$TimeoutSeconds) }
  $null = Start-WtDesktop -Engine workbuddy -ExecutablePath $script:target -Port 19332 -ForceRestart
  Assert-WtTest (($script:trace -join ',') -eq 'stop,launch') 'explicit restart was not executed'
}

Invoke-WtTest 'graceful exit does not force-stop processes' {
  $script:running=$true
  $script:fake=[pscustomobject]@{Id=123;MainWindowHandle=1;Path=$script:target}
  $script:fake | Add-Member ScriptMethod CloseMainWindow { $script:running=$false;return $true }
  function Get-WtAppProcesses { param($ExecutablePath) if($script:running){return $script:fake} }
  function Stop-Process { throw 'graceful exit forced a stop' }
  $null = Stop-WtDesktop -ExecutablePath $script:target -GraceSeconds 0
  Assert-WtTest (-not $script:running) 'window close was not requested'
}

Invoke-WtTest 'tray processes are stopped after the graceful timeout' {
  $script:running=$true
  $script:trace=New-Object System.Collections.Generic.List[string]
  $script:fake=[pscustomobject]@{Id=123;MainWindowHandle=1;Path=$script:target}
  $script:fake | Add-Member ScriptMethod CloseMainWindow { $script:trace.Add('close');return $true }
  function Get-WtAppProcesses { param($ExecutablePath) if($script:running){return $script:fake} }
  function Get-Process { param($Id,$ErrorAction) if($script:running){return $script:fake} }
  function Stop-Process { param($InputObject,[switch]$Force,$ErrorAction) $script:trace.Add('stop');$script:running=$false }
  $null = Stop-WtDesktop -ExecutablePath $script:target -GraceSeconds 0
  Assert-WtTest (($script:trace -join ',') -eq 'close,stop') 'tray fallback was not bounded and ordered'
}

Invoke-WtTest 'processes with a different executable path are excluded' {
  function Get-Process {
    param($Name,$ErrorAction)
    @([pscustomobject]@{Path=$script:target},[pscustomobject]@{Path='C:\unrelated\app.exe'})
  }
  $matched=@(Get-WtAppProcesses -ExecutablePath $script:target)
  Assert-WtTest ($matched.Count -eq 1 -and $matched[0].Path -eq $script:target) 'wrong installation was selected'
}

Invoke-WtTest 'startup timeout is reported instead of claiming readiness' {
  function Test-WtDebugBridge { param($Port,$ExecutablePath) return $false }
  $caught=$false
  try { Wait-WtDebugBridge -Port 19331 -ExecutablePath $script:target -TimeoutSeconds 0 }
  catch { $caught=$_.Exception.Message.Contains('19331') }
  Assert-WtTest $caught 'startup timeout was not reported'
}

function New-WtRuntime {
  param([string]$StateJson)
  $dir = Join-Path ([IO.Path]::GetTempPath()) ('wt-lifecycle-' + [guid]::NewGuid().ToString('N'))
  $runtime = Join-Path $dir '.work-together'
  New-Item -ItemType Directory -Force $runtime | Out-Null
  Set-Content -LiteralPath (Join-Path $runtime 'runner.lock') -Value '{"pid":4321}'
  Set-Content -LiteralPath (Join-Path $runtime 'state.json') -Value $StateJson
  return $dir
}

Invoke-WtTest 'alive scheduler with a running job blocks the restart' {
  $dir = New-WtRuntime '{"engine":"zcode","jobs":{"a":{"status":"running"}}}'
  Push-Location $dir
  try {
    function Get-Process { param($Id,$ErrorAction) return [pscustomobject]@{Id=4321} }
    Assert-WtTest (Test-WtActiveWorkflow -Engine 'zcode') 'running job did not block the restart'
  } finally { Pop-Location; Remove-Item -LiteralPath $dir -Recurse -Force }
}

Invoke-WtTest 'dead scheduler lock does not block the restart' {
  $dir = New-WtRuntime '{"engine":"zcode","jobs":{"a":{"status":"running"}}}'
  Push-Location $dir
  try {
    function Get-Process { param($Id,$ErrorAction) }
    Assert-WtTest (-not (Test-WtActiveWorkflow -Engine 'zcode')) 'dead lock owner blocked the restart'
  } finally { Pop-Location; Remove-Item -LiteralPath $dir -Recurse -Force }
}

Invoke-WtTest 'scheduler for another engine does not block the restart' {
  $dir = New-WtRuntime '{"engine":"workbuddy","jobs":{"a":{"status":"running"}}}'
  Push-Location $dir
  try {
    function Get-Process { param($Id,$ErrorAction) return [pscustomobject]@{Id=4321} }
    Assert-WtTest (-not (Test-WtActiveWorkflow -Engine 'zcode')) 'engine mismatch blocked the restart'
  } finally { Pop-Location; Remove-Item -LiteralPath $dir -Recurse -Force }
}

Invoke-WtTest 'queued-only jobs do not block the restart' {
  $dir = New-WtRuntime '{"engine":"zcode","jobs":{"a":{"status":"queued"}}}'
  Push-Location $dir
  try {
    function Get-Process { param($Id,$ErrorAction) return [pscustomobject]@{Id=4321} }
    Assert-WtTest (-not (Test-WtActiveWorkflow -Engine 'zcode')) 'queued job blocked the restart'
  } finally { Pop-Location; Remove-Item -LiteralPath $dir -Recurse -Force }
}

Invoke-WtTest 'unreadable scheduler state fails closed with restart guidance' {
  $dir = New-WtRuntime 'not-json{{'
  Push-Location $dir
  try {
    function Get-Process { param($Id,$ErrorAction) return [pscustomobject]@{Id=4321} }
    $caught = $false
    try { $null = Test-WtActiveWorkflow -Engine 'zcode' } catch { $caught = $_.Exception.Message.Contains('-ForceRestart') }
    Assert-WtTest $caught 'unreadable state did not fail closed with guidance'
  } finally { Pop-Location; Remove-Item -LiteralPath $dir -Recurse -Force }
}

Invoke-WtTest 'ZCode launch passes the debug port arguments' {
  $script:launchArgs = $null
  function Start-Process { param($FilePath,$ArgumentList,$WindowStyle) $script:launchArgs = @($ArgumentList) }
  Invoke-WtDesktopLaunch -Engine 'zcode' -ExecutablePath $script:target -Port 19331
  Assert-WtTest ($script:launchArgs.Contains('--remote-debugging-port=19331') -and $script:launchArgs.Contains('--remote-debugging-address=127.0.0.1')) 'debug arguments missing'
}

Invoke-WtTest 'WorkBuddy launch restores the port env when the app fails to start' {
  $env:WORKBUDDY_REMOTE_DEBUGGING_PORT = 'keep-me'
  try {
    function Start-Process { param($FilePath,$WindowStyle) throw 'simulated launch failure' }
    $caught = $false
    try { Invoke-WtDesktopLaunch -Engine 'workbuddy' -ExecutablePath $script:target -Port 19332 } catch { $caught = $true }
    Assert-WtTest ($caught -and $env:WORKBUDDY_REMOTE_DEBUGGING_PORT -eq 'keep-me') 'env var was not restored'
  } finally { Remove-Item Env:WORKBUDDY_REMOTE_DEBUGGING_PORT -ErrorAction SilentlyContinue }
}

Invoke-WtTest 'mixed-engine plan protects only the matching desktop restart' {
  $dir = New-WtRuntime '{"engine":"zcode","jobs":{"a":{"status":"running","engine":"workbuddy"}}}'
  Push-Location $dir
  try {
    function Get-Process { param($Id,$ErrorAction) return [pscustomobject]@{Id=4321} }
    Assert-WtTest (Test-WtActiveWorkflow -Engine 'workbuddy') 'workbuddy running job did not block its restart'
    Assert-WtTest (-not (Test-WtActiveWorkflow -Engine 'zcode')) 'idle zcode engine blocked the restart'
  } finally { Pop-Location; Remove-Item -LiteralPath $dir -Recurse -Force }
}

Invoke-WtTest 'coordinator app is protected while its scheduler holds the lock' {
  $dir = New-WtRuntime '{"engine":"workbuddy","coordinator":"zcode","jobs":{"a":{"status":"exec_done","engine":"workbuddy"}}}'
  Push-Location $dir
  try {
    function Get-Process { param($Id,$ErrorAction) return [pscustomobject]@{Id=4321} }
    Assert-WtTest (Test-WtActiveWorkflow -Engine 'zcode') 'coordinator app was not protected'
    Assert-WtTest (-not (Test-WtActiveWorkflow -Engine 'workbuddy')) 'executor app was blocked without active jobs'
  } finally { Pop-Location; Remove-Item -LiteralPath $dir -Recurse -Force }
}

Invoke-WtTest 'Qoder vscode-file page from the selected installation is accepted' {
  function Invoke-RestMethod {
    param($Uri,$TimeoutSec)
    if ($Uri.EndsWith('/json/version')) { return [pscustomobject]@{webSocketDebuggerUrl='ws://127.0.0.1/test'} }
    $resourceFile = Join-Path (Split-Path $script:target -Parent) 'resources/app/out/vs/code/electron-sandbox/workbench/workbench.html'
    $url = ([uri]$resourceFile).AbsoluteUri -replace '^file:///', 'vscode-file://vscode-app/'
    Write-Output -NoEnumerate @([pscustomobject]@{type='page';url=$url})
  }
  Assert-WtTest (Test-WtDebugBridge -Port 19333 -ExecutablePath $script:target) 'Qoder resource page rejected'
}

Invoke-WtTest 'Qoder launch supplies local debug arguments and stays hidden' {
  $script:launchArgs = $null
  $script:launchStyle = $null
  function Start-Process { param($FilePath,$ArgumentList,$WindowStyle) $script:launchArgs = @($ArgumentList); $script:launchStyle = $WindowStyle }
  foreach ($engine in @('qoder-global','qoder-cn')) {
    Invoke-WtDesktopLaunch -Engine $engine -ExecutablePath $script:target -Port 19334
    Assert-WtTest ($script:launchArgs.Contains('--remote-debugging-port=19334') -and $script:launchArgs.Contains('--remote-debugging-address=127.0.0.1') -and $script:launchStyle -eq 'Hidden') 'Qoder launch arguments or visibility incorrect'
  }
}

Invoke-WtTest 'WorkBuddy regions use their port and restore the host environment' {
  $previous = $env:WORKBUDDY_REMOTE_DEBUGGING_PORT
  try {
    $env:WORKBUDDY_REMOTE_DEBUGGING_PORT = 'keep-regional'
    $script:seenPort = $null
    $script:launchStyle = $null
    function Start-Process { param($FilePath,$WindowStyle) $script:seenPort=$env:WORKBUDDY_REMOTE_DEBUGGING_PORT; $script:launchStyle=$WindowStyle }
    foreach ($engine in @('workbuddy-global','workbuddy-cn')) {
      Invoke-WtDesktopLaunch -Engine $engine -ExecutablePath $script:target -Port 19335
      Assert-WtTest ($script:seenPort -eq '19335' -and $env:WORKBUDDY_REMOTE_DEBUGGING_PORT -eq 'keep-regional' -and $script:launchStyle -eq 'Hidden') 'regional WorkBuddy port/environment/visibility incorrect'
    }
  } finally { $env:WORKBUDDY_REMOTE_DEBUGGING_PORT = $previous }
}

Invoke-WtTest 'legacy WorkBuddy active state protects international alias only' {
  $dir = New-WtRuntime '{"engine":"workbuddy","jobs":{"a":{"status":"running"}}}'
  Push-Location $dir
  try {
    function Get-Process { param($Id,$ErrorAction) return [pscustomobject]@{Id=4321} }
    Assert-WtTest (Test-WtActiveWorkflow -Engine 'workbuddy-global') 'legacy WorkBuddy job did not protect global alias'
    Assert-WtTest (-not (Test-WtActiveWorkflow -Engine 'workbuddy-cn')) 'legacy WorkBuddy job blocked unrelated regional app'
  } finally { Pop-Location; Remove-Item -LiteralPath $dir -Recurse -Force }
}

Invoke-WtTest 'Qoder custom protocols accept only the matching regional installation' {
  function Invoke-RestMethod {
    param($Uri,$TimeoutSec)
    if ($Uri.EndsWith('/json/version')) { return [pscustomobject]@{webSocketDebuggerUrl='ws://127.0.0.1/test'} }
    Write-Output -NoEnumerate @([pscustomobject]@{type='page';url=$script:pageUrl})
  }
  $globalExe = Join-Path (Split-Path $script:target -Parent) 'Qoder.exe'
  $cnExe = Join-Path (Split-Path $script:target -Parent) 'Qoder CN.exe'
  $script:pageUrl = 'qoder-app://renderer/index.html'
  Assert-WtTest (Test-WtDebugBridge -Port 19333 -ExecutablePath $globalExe) 'global custom protocol rejected'
  Assert-WtTest (-not (Test-WtDebugBridge -Port 19333 -ExecutablePath $cnExe)) 'global page accepted for CN app'
  $script:pageUrl = 'qoder-cn-app://renderer/index.html'
  Assert-WtTest (Test-WtDebugBridge -Port 19334 -ExecutablePath $cnExe) 'CN custom protocol rejected'
  Assert-WtTest (-not (Test-WtDebugBridge -Port 19334 -ExecutablePath $globalExe)) 'CN page accepted for global app'
}

Invoke-WtTest 'coordinator family is skipped from auto/all/both selections' {
  $all=@('zcode','qoder-global','qoder-cn','workbuddy-global','workbuddy-cn')
  Assert-WtTest (((Get-WtDesktopSelection -Engine auto -AllEngines $all -Coordinator 'zcode') -join ',') -eq 'qoder-global,qoder-cn,workbuddy-global,workbuddy-cn') 'auto did not skip coordinator family'
  Assert-WtTest (((Get-WtDesktopSelection -Engine all -AllEngines $all -Coordinator 'workbuddy-cn') -join ',') -eq 'zcode,qoder-global,qoder-cn') 'all did not skip workbuddy family'
  Assert-WtTest (((Get-WtDesktopSelection -Engine both -AllEngines $all -Coordinator 'zcode') -join ',') -eq 'workbuddy-global') 'both did not skip zcode'
  Assert-WtTest (((Get-WtDesktopSelection -Engine zcode -AllEngines $all -Coordinator 'zcode') -join ',') -eq 'zcode') 'explicit single engine must not be overridden'
  Assert-WtTest (((Get-WtDesktopSelection -Engine auto -AllEngines $all) -join ',') -eq ($all -join ',')) 'no coordinator should keep all engines'
}

Invoke-WtTest 'workbuddy alias resolves to the global family when skipping' {
  $all=@('zcode','workbuddy-global','workbuddy-cn')
  Assert-WtTest (((Get-WtDesktopSelection -Engine auto -AllEngines $all -Coordinator 'workbuddy') -join ',') -eq 'zcode') 'workbuddy alias family skip failed'
  Assert-WtTest (((Get-WtDesktopSelection -Engine auto -AllEngines $all -Coordinator 'workbuddy-global') -join ',') -eq 'zcode') 'workbuddy-global family skip failed'
}

ConvertTo-Json -InputObject @($script:results.ToArray()) -Depth 4 -Compress
if (@($script:results | Where-Object { -not $_.passed }).Count) { exit 1 }
