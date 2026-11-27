param([switch]$Stop, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serverFile = Join-Path $project 'scripts\serve-local.mjs'
$siteUrl = 'http://127.0.0.1:4187/'
$identity = 'hexamotion-studio'
function Get-V2Health {
  try { return Invoke-RestMethod -Uri ($siteUrl + '__stewart_health') -TimeoutSec 2 } catch { return $null }
}
try {
  $health = Get-V2Health
  if ($Stop) {
    if (-not $health) { Write-Output 'HEXAMOTION is already stopped.'; exit 0 }
    if ($health.app -ne $identity) { throw 'Port 4187 belongs to another application. No process was stopped.' }
    $running = Get-CimInstance Win32_Process -Filter "ProcessId = $($health.pid)"
    if ($running.Name -ne 'node.exe' -or -not $running.CommandLine.Contains($serverFile)) {
      throw 'The running process does not match this 2.0 launcher. No process was stopped.'
    }
    Stop-Process -Id $health.pid
    Write-Output 'HEXAMOTION stopped. Version 1.0 was not affected.'
    exit 0
  }
  if ($health -and ($health.app -ne $identity -or $health.root -ne (Join-Path $project 'dist'))) {
    throw 'Port 4187 is occupied by a different application or checkout.'
  }
  if (-not $health) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodePath = if ($nodeCommand) { $nodeCommand.Source } else {
      $runtime = Get-AppxPackage -Name 'OpenAI.CodexPrimaryRuntime*' -ErrorAction SilentlyContinue | Sort-Object Version -Descending | Select-Object -First 1
      if ($runtime) { Join-Path $runtime.InstallLocation 'dependencies\node\bin\node.exe' }
    }
    if (-not $nodePath -or -not (Test-Path -LiteralPath $nodePath)) { throw 'Install Node.js 22.13 or later to run the offline edition.' }
    if (-not (Test-Path -LiteralPath (Join-Path $project 'dist\index.html'))) { throw 'The 2.0 build is missing. Run pnpm build inside hexamotion first.' }
    $logDir = Join-Path $project 'work\launcher-v2'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $previousPort = $env:HEXAMOTION_PORT
    try {
      $env:HEXAMOTION_PORT = '4187'
      $service = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverFile + '"') -WorkingDirectory $project -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log')
    } finally { $env:HEXAMOTION_PORT = $previousPort }
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      $health = Get-V2Health
      if ($health) { break }
      $service.Refresh()
      if ($service.HasExited) { throw 'The 2.0 server failed. See hexamotion\work\launcher-v2\server-error.log.' }
      Start-Sleep -Milliseconds 200
    }
  }
  if (-not $health -or $health.app -ne $identity) { throw 'HEXAMOTION could not start on port 4187.' }
  if (-not $NoBrowser) { Start-Process $siteUrl }
  Write-Output ('HEXAMOTION ready: ' + $siteUrl)
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
