# Start every local gateway profile that should be running.
#
# One supervisor for both routes: the CodeBuddy profile (port 18792, `ck_` key)
# and the WorkBuddy profile (port 18791, desktop login state) run the same
# gateway-server.mjs; only the profile directory differs. A profile is started
# when a client points at its port, or when its settings say `alwaysStart`.
#
#   -Watch   stay resident and restart a profile whose process died. The
#            scheduled task runs this, because a task action's children are
#            killed when the action exits (ExecutionTimeLimit) — the gateway
#            must be a child that the supervisor keeps alive.
param([switch]$Watch)

$ErrorActionPreference = 'Stop'

# Hold one lock throughout startup and the supervisor lifetime.
$supervisorMutex = New-Object System.Threading.Mutex($false, 'Local\CodexWorkBuddyAdapterSupervisor')
$ownsSupervisor = $false
try {
    try { $ownsSupervisor = $supervisorMutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $ownsSupervisor = $true }
    if (-not $ownsSupervisor) { Write-Output 'Supervisor already running.'; return }

# A scheduled task runs hidden, so Write-Output would be discarded. Keep a
# small log; without it a failed restart is invisible (it looked like the
# supervisor simply ignored alwaysStart).
$logPath = Join-Path $env:USERPROFILE '.codex\integrations\deepseek-workbuddy\supervisor.log'
function Write-Log([string]$message) {
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
    # Diagnostics must never enter Start-Profile's success/output stream:
    # callers assign that stream to $child and expect only a Process or null.
    Write-Host $message
    try { Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8 } catch { }
}

$profiles = @(
    (Join-Path $env:USERPROFILE '.codex\integrations\deepseek-workbuddy'),
    (Join-Path $env:USERPROFILE '.codebuddy\integrations\ck-gateway')
)

# Node MUST be the system build: the managed one binds but is unreachable from
# any client (see notes/runtime-node.md). Prefer the known path, fall back to PATH.
$nodePath = 'F:\Program Files\nodejs\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) { $nodePath = (Get-Command node.exe).Source }

# Windows env names are case-insensitive; a sandbox/proxy shim may inject both
# HTTP_PROXY and https_proxy, which makes Start-Process fail with a duplicate
# key. Normalise once, before any launch.
foreach ($proxyName in @('http_proxy', 'https_proxy', 'all_proxy', 'no_proxy')) {
    $proxyValue = [Environment]::GetEnvironmentVariable($proxyName, 'Process')
    if ($null -ne $proxyValue) {
        [Environment]::SetEnvironmentVariable($proxyName, $null, 'Process')
        [Environment]::SetEnvironmentVariable($proxyName.ToUpperInvariant(), $proxyValue, 'Process')
    }
}
[System.Net.WebRequest]::DefaultWebProxy = $null

function Test-Port([int]$port) {
    return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

# Only the *active* provider counts: other [model_providers.*] blocks may also
# carry this address, so a whole-file grep would always match.
function Get-ActiveBaseUrl([string]$configText) {
    $providerId = 'custom'
    $providerMatch = [regex]::Match($configText, '(?m)^\s*model_provider\s*=\s*"([^"]+)"')
    if ($providerMatch.Success) { $providerId = $providerMatch.Groups[1].Value }
    $section = [regex]::Match($configText, '(?ms)^\[model_providers\.' + [regex]::Escape($providerId) + '\]\s*(.*?)(?=^\[|\Z)')
    if (-not $section.Success) { return '' }
    $url = [regex]::Match($section.Groups[1].Value, '(?m)^\s*base_url\s*=\s*"([^"]+)"')
    if ($url.Success) { return $url.Groups[1].Value }
    return ''
}

function Test-ClientTargets([int]$port) {
    # Windows PowerShell 5.1 is what Task Scheduler runs (powershell.exe), so
    # no `??`, no ternary: those are PowerShell 7 syntax and fail to parse.
    $codexHome = $env:CODEX_HOME
    if (-not $codexHome) { $codexHome = Join-Path $env:USERPROFILE '.codex' }
    $codexConfig = Join-Path $codexHome 'config.toml'
    if (Test-Path -LiteralPath $codexConfig) {
        $text = Get-Content -Raw -LiteralPath $codexConfig
        if ((Get-ActiveBaseUrl $text) -match "127\.0\.0\.1:$port") { return $true }
    }
    $claudeSettings = Join-Path $env:USERPROFILE '.claude\settings.json'
    if (Test-Path -LiteralPath $claudeSettings) {
        try {
            $json = Get-Content -Raw -LiteralPath $claudeSettings | ConvertFrom-Json
            if ($json.env.ANTHROPIC_BASE_URL -match "127\.0\.0\.1:$port") { return $true }
        } catch { }
    }
    return $false
}

function Start-Profile([string]$root) {
    $settingsPath = Join-Path $root 'local-settings.json'
    if (-not (Test-Path -LiteralPath $settingsPath)) { return $null }
    $settings = Get-Content -Raw -LiteralPath $settingsPath | ConvertFrom-Json
    $name = Split-Path -Leaf $root
    $port = [int]$settings.port
    $entry = 'workbuddy-server.mjs'
    if ($settings.entry) { $entry = $settings.entry }

    if (Test-Port $port) {
        Write-Log "$name already listening on 127.0.0.1:$port."
        return $null
    }
    if (-not ($settings.alwaysStart -eq $true) -and -not (Test-ClientTargets $port)) {
        Write-Log "$name ($port): no client points here and alwaysStart is off; left stopped."
        return $null
    }

    if (-not $env:IDLE_EXIT_MINUTES) { $env:IDLE_EXIT_MINUTES = '0' }
    if ($settings.electron) { $env:WORKBUDDY_ELECTRON_BIN = $settings.electron }
    if ($settings.mode -eq 'workbuddy') { $env:DSH_HOME = Join-Path $root 'dsh-state' }

    $process = Start-Process -FilePath $nodePath -ArgumentList @($entry) -WorkingDirectory $root `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $root 'server.stdout.log') `
        -RedirectStandardError (Join-Path $root 'server.stderr.log')
    $process.Id | Set-Content -LiteralPath (Join-Path $root 'server.pid')

    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 500
        if (Test-Port $port) {
            Write-Log "$name is listening on 127.0.0.1:$port (pid $($process.Id))."
            return $process
        }
        if ($process.HasExited) { break }
    }
    throw "$name did not become ready; inspect server.stderr.log."
}

$children = @{}
foreach ($root in $profiles) {
    try {
        $child = Start-Profile $root
        if ($child) { $children[$root] = $child }
    } catch { Write-Log "start failed: $($_.Exception.Message)" }
}
if ($children.Count -eq 0) {
    Write-Log 'Nothing to start.'
}

# Resident mode: the task keeps this process alive (ExecutionTimeLimit = 0).
# Recheck unowned or exited profiles, including profiles selected later.
if ($Watch) {
    Write-Log 'Watching gateway profiles.'
    while ($true) {
        Start-Sleep -Seconds 30
        foreach ($root in $profiles) {
            $child = $children[$root]
            $alive = $false
            if ($child -is [System.Diagnostics.Process]) {
                try {
                    $child.Refresh()
                    $settings = Get-Content -Raw -LiteralPath (Join-Path $root 'local-settings.json') | ConvertFrom-Json
                    $alive = (-not $child.HasExited) -and (Test-Port ([int]$settings.port))
                } catch { $alive = $false }
            }
            if (-not $alive) {
                try { $children[$root] = Start-Profile $root } catch { Write-Log "restart failed: $($_.Exception.Message)" }
            }
        }
    }
}
} finally {
    if ($ownsSupervisor) { $supervisorMutex.ReleaseMutex() }
    $supervisorMutex.Dispose()
}
