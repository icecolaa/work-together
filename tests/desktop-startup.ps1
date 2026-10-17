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

ConvertTo-Json -InputObject @($script:results.ToArray()) -Depth 4 -Compress
if (@($script:results | Where-Object { -not $_.passed }).Count) { exit 1 }
