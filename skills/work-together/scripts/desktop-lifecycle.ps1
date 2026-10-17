function Get-WtAppProcesses {
  param([string]$ExecutablePath)
  $processName = [IO.Path]::GetFileNameWithoutExtension($ExecutablePath)
  @(Get-Process -Name $processName -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -and [IO.Path]::GetFullPath($_.Path) -eq $ExecutablePath } catch { $false }
  })
}

function Test-WtDebugBridge {
  param([int]$Port, [string]$ExecutablePath)
  try {
    $version = Invoke-RestMethod "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
    if (-not $version.webSocketDebuggerUrl) { return $false }
    # Assign directly: Windows PowerShell returns the JSON array as one pipeline
    # object; wrapping the command in @() would create a nested array.
    $pages = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
    $resourceRoot = (Join-Path (Split-Path $ExecutablePath -Parent) 'resources') + [IO.Path]::DirectorySeparatorChar
    foreach ($page in $pages) {
      if ($page.type -ne 'page' -or -not $page.url -or -not $page.url.StartsWith('file:')) { continue }
      # .NET Framework treats file URL queries as part of LocalPath; strip the
      # URL query/fragment before decoding to keep PowerShell 5.1 compatible.
      $fileUrl = ($page.url -split '[?#]', 2)[0]
      $pagePath = [IO.Path]::GetFullPath(([uri]$fileUrl).LocalPath)
      if ($pagePath.StartsWith($resourceRoot, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
  } catch {}
  return $false
}

function Test-WtActiveWorkflow {
  param([string]$Engine)
  $runtimeDir = Join-Path (Get-Location).Path '.work-together'
  $lockFile = Join-Path $runtimeDir 'runner.lock'
  if (-not (Test-Path -LiteralPath $lockFile)) { return $false }
  try {
    $owner = Get-Content -LiteralPath $lockFile -Raw -ErrorAction Stop | ConvertFrom-Json
    if (-not $owner.pid) { return $false }
    if (-not (Get-Process -Id $owner.pid -ErrorAction SilentlyContinue)) { return $false }
    $state = Get-Content -LiteralPath (Join-Path $runtimeDir 'state.json') -Raw -ErrorAction Stop | ConvertFrom-Json
  } catch {
    throw "无法读取 .work-together 调度状态，为保护可能仍在运行的任务，未重启。确认无运行中任务后再用 -ForceRestart 重启。"
  }
  if ($state.engine -ne $Engine) { return $false }
  $active = @('running', 'needs_user', 'unknown', 'creating', 'dispatching')
  return @($state.jobs.PSObject.Properties.Value | Where-Object { $_.status -in $active }).Count -gt 0
}

function Stop-WtDesktop {
  param([string]$ExecutablePath, [int]$GraceSeconds = 5)
  $processes = @(Get-WtAppProcesses -ExecutablePath $ExecutablePath)
  if (-not $processes.Count) { return }
  foreach ($appProcess in $processes) {
    if ($appProcess.MainWindowHandle -ne 0) {
      try { $null = $appProcess.CloseMainWindow() } catch {}
    }
  }
  $deadline = [DateTime]::UtcNow.AddSeconds($GraceSeconds)
  do {
    $remaining = @(Get-WtAppProcesses -ExecutablePath $ExecutablePath)
    if (-not $remaining.Count) { return }
    if ([DateTime]::UtcNow -ge $deadline) { break }
    Start-Sleep -Milliseconds 200
  } while ($true)

  Write-Output '正常关闭后仍有托盘或后台进程，正在终止该应用的剩余进程。'
  foreach ($appProcess in $remaining) {
    # Re-check the executable path before stopping a process; do not kill by name.
    try {
      $current = Get-Process -Id $appProcess.Id -ErrorAction SilentlyContinue
      if ($current -and $current.Path -and [IO.Path]::GetFullPath($current.Path) -eq $ExecutablePath) {
        Stop-Process -InputObject $current -Force -ErrorAction Stop
      }
    } catch {
      if (Get-Process -Id $appProcess.Id -ErrorAction SilentlyContinue) { throw }
    }
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(5)
  while (@(Get-WtAppProcesses -ExecutablePath $ExecutablePath).Count) {
    if ([DateTime]::UtcNow -ge $deadline) { throw '应用进程尚未退出，已停止重启，避免产生重复实例。' }
    Start-Sleep -Milliseconds 200
  }
}

function Invoke-WtDesktopLaunch {
  param([string]$Engine, [string]$ExecutablePath, [int]$Port)
  if ($Engine -eq 'zcode') {
    Start-Process -FilePath $ExecutablePath -ArgumentList "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=$Port" -WindowStyle Hidden
  } else {
    $previous = $env:WORKBUDDY_REMOTE_DEBUGGING_PORT
    try {
      $env:WORKBUDDY_REMOTE_DEBUGGING_PORT = [string]$Port
      Start-Process -FilePath $ExecutablePath -WindowStyle Hidden
    } finally { $env:WORKBUDDY_REMOTE_DEBUGGING_PORT = $previous }
  }
}

function Wait-WtDebugBridge {
  param([int]$Port, [string]$ExecutablePath, [int]$TimeoutSeconds = 45)
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    if (Test-WtDebugBridge -Port $Port -ExecutablePath $ExecutablePath) { return }
    if ([DateTime]::UtcNow -ge $deadline) { throw "启动超时：端口 $Port 未出现目标应用的桌面会话。请检查应用启动提示或端口占用。" }
    Start-Sleep -Milliseconds 300
  } while ($true)
}

function Start-WtDesktop {
  param([string]$Engine, [string]$ExecutablePath, [int]$Port,
    [switch]$ForceRestart, [int]$GraceSeconds = 5, [int]$StartupTimeoutSeconds = 45)
  if (-not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) { throw "找不到 $Engine 应用：$ExecutablePath" }
  $ExecutablePath = (Resolve-Path -LiteralPath $ExecutablePath).Path
  if (-not $ForceRestart -and (Test-WtDebugBridge -Port $Port -ExecutablePath $ExecutablePath)) {
    Write-Output "$Engine bridge ready ($Port)，复用现有实例。"
    return
  }
  $running = @(Get-WtAppProcesses -ExecutablePath $ExecutablePath)
  if ($running.Count) {
    if (-not $ForceRestart -and (Test-WtActiveWorkflow -Engine $Engine)) {
      throw "$Engine 当前项目的协作任务仍在执行，未重启。若需要中断并重启，使用 -ForceRestart；重启后查询原会话恢复。"
    }
    Write-Output "$Engine 正在运行，正在自动退出并以调试端口重启……"
    Stop-WtDesktop -ExecutablePath $ExecutablePath -GraceSeconds $GraceSeconds
  }
  Invoke-WtDesktopLaunch -Engine $Engine -ExecutablePath $ExecutablePath -Port $Port
  Write-Output "$Engine 已启动，等待桌面会话就绪……"
  Wait-WtDebugBridge -Port $Port -ExecutablePath $ExecutablePath -TimeoutSeconds $StartupTimeoutSeconds
  Write-Output "$Engine bridge ready ($Port)。"
}
