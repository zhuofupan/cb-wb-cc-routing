$ErrorActionPreference = 'Stop'
$providerRoot = $PSScriptRoot
$settings = Get-Content -Raw -LiteralPath (Join-Path $providerRoot 'local-settings.json') | ConvertFrom-Json

# Fast path: already listening -> nothing to decide, no HTTP round trip.
# (A health request could stall for seconds behind a proxy; the listener cannot lie.)
if (Get-NetTCPConnection -LocalPort $settings.port -State Listen -ErrorAction SilentlyContinue) {
    Write-Output "WorkBuddy adapter already listening on 127.0.0.1:$($settings.port)."
    exit 0
}

# Start only while Codex is actually pointed at this adapter. CC Switch has no
# switch hook, so the provider written into config.toml is the source of truth.
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$codexConfig = Join-Path $codexHome 'config.toml'
if (-not (Test-Path -LiteralPath $codexConfig)) {
    Write-Output "Codex config not found at $codexConfig; adapter left stopped."
    exit 0
}
# Read the *active* provider only: other [model_providers.*] blocks may also carry
# this address, so a whole-file grep would always match.
$configText = Get-Content -Raw -LiteralPath $codexConfig
$providerId = 'custom'
$providerMatch = [regex]::Match($configText, '(?m)^\s*model_provider\s*=\s*"([^"]+)"')
if ($providerMatch.Success) { $providerId = $providerMatch.Groups[1].Value }
$baseUrl = ''
$sectionMatch = [regex]::Match($configText, '(?ms)^\[model_providers\.' + [regex]::Escape($providerId) + '\]\s*(.*?)(?=^\[|\Z)')
if ($sectionMatch.Success) {
    $urlMatch = [regex]::Match($sectionMatch.Groups[1].Value, '(?m)^\s*base_url\s*=\s*"([^"]+)"')
    if ($urlMatch.Success) { $baseUrl = $urlMatch.Groups[1].Value }
}
if ($baseUrl -notmatch '127\.0\.0\.1:18791') {
    # Claude Code makes the same choice in ~/.claude/settings.json; either client
    # pointing here is enough to keep the adapter alive.
    $claudeTargets = $false
    $claudeSettings = Join-Path $env:USERPROFILE '.claude\settings.json'
    if (Test-Path -LiteralPath $claudeSettings) {
        try {
            $claudeJson = Get-Content -Raw -LiteralPath $claudeSettings | ConvertFrom-Json
            if ($claudeJson.env.ANTHROPIC_BASE_URL -match '127\.0\.0\.1:18791') { $claudeTargets = $true }
        } catch { }
    }
    if (-not $claudeTargets) {
        Write-Output "Neither Codex ($baseUrl) nor Claude Code points at this adapter; adapter left stopped."
        exit 0
    }
}

# Only the launch path pays for proxy normalisation.
# Windows env names are case-insensitive; a sandbox/proxy shim may inject both
# HTTP_PROXY and https_proxy, which makes Start-Process fail with a duplicate key.
foreach ($proxyName in @('http_proxy','https_proxy','all_proxy','no_proxy')) {
    $proxyValue = [Environment]::GetEnvironmentVariable($proxyName, 'Process')
    if ($null -ne $proxyValue) {
        [Environment]::SetEnvironmentVariable($proxyName, $null, 'Process')
        [Environment]::SetEnvironmentVariable($proxyName.ToUpperInvariant(), $proxyValue, 'Process')
    }
}
# The adapter listens on loopback only; a global system proxy must not intercept it.
[System.Net.WebRequest]::DefaultWebProxy = $null

$nodePath = (Get-Command node.exe).Source
# Resident by default; set IDLE_EXIT_MINUTES to a positive number to self-exit when idle.
if (-not $env:IDLE_EXIT_MINUTES) { $env:IDLE_EXIT_MINUTES = '0' }
$env:WORKBUDDY_ELECTRON_BIN = $settings.electron
$env:DSH_HOME = Join-Path $providerRoot 'dsh-state'
$process = Start-Process -FilePath $nodePath -ArgumentList @('workbuddy-server.mjs') -WorkingDirectory $providerRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $providerRoot 'server.stdout.log') -RedirectStandardError (Join-Path $providerRoot 'server.stderr.log')
$process.Id | Set-Content -LiteralPath (Join-Path $providerRoot 'server.pid')
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (Get-NetTCPConnection -LocalPort $settings.port -State Listen -ErrorAction SilentlyContinue) {
        Write-Output "WorkBuddy adapter is listening on 127.0.0.1:$($settings.port)."
        exit 0
    }
    if ($process.HasExited) { throw 'WorkBuddy adapter exited; inspect server.stderr.log.' }
}
throw 'WorkBuddy adapter did not become ready.'
