# Start the requested profile explicitly; works for Desktop-only users too.
param([string]$SettingsPath = (Join-Path $PSScriptRoot 'local-settings.json'))
$ErrorActionPreference = 'Stop'
$SettingsPath = (Resolve-Path -LiteralPath $SettingsPath).Path
$settings = Get-Content -Raw -LiteralPath $SettingsPath | ConvertFrom-Json
$port = [int]$settings.port
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    Write-Output "A listener already exists on port $port; check its /health endpoint."
    exit 0
}
foreach ($proxyName in @('http_proxy','https_proxy','all_proxy','no_proxy')) {
    $proxyValue = [Environment]::GetEnvironmentVariable($proxyName, 'Process')
    if ($null -ne $proxyValue) {
        [Environment]::SetEnvironmentVariable($proxyName, $null, 'Process')
        [Environment]::SetEnvironmentVariable($proxyName.ToUpperInvariant(), $proxyValue, 'Process')
    }
}
$nodePath = (Get-Command node.exe).Source
$profileRoot = Split-Path -Parent $SettingsPath
if (-not $env:IDLE_EXIT_MINUTES) { $env:IDLE_EXIT_MINUTES = '0' }
$entry = Join-Path $PSScriptRoot 'gateway-server.mjs'
$arguments = @('--experimental-strip-types', ('"' + $entry + '"'), '--settings', ('"' + $SettingsPath + '"'))
$process = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $profileRoot "server-$port.stdout.log") -RedirectStandardError (Join-Path $profileRoot "server-$port.stderr.log")
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        Write-Output "Gateway listening on 127.0.0.1:$port (pid $($process.Id))."
        exit 0
    }
    if ($process.HasExited) { throw "Gateway exited; inspect server-$port.stderr.log." }
}
throw 'Gateway did not become ready.'
