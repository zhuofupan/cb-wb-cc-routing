# Run with Windows PowerShell 5.1, matching Task Scheduler.
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '../scripts/start-workbuddy.ps1'
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($source, [ref]$null, [ref]$errors)
if ($errors) { throw ($errors | Out-String) }
foreach ($name in @('Write-Log', 'Start-Profile')) {
    $definition = $ast.Find({ param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
    }, $true)
    . ([scriptblock]::Create($definition.Extent.Text))
}
$fixture = Join-Path $PSScriptRoot '../work/supervisor-test'
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
$logPath = Join-Path $fixture 'supervisor.log'
'{"port":18791,"alwaysStart":false}' | Set-Content (Join-Path $fixture 'local-settings.json')
function Test-Port([int]$port) { return $true }
$result = @(Start-Profile $fixture)
if (@($result | Where-Object { $null -ne $_ }).Count) {
    throw 'An existing listener must return null, never diagnostic text masquerading as a child process.'
}
function Test-Port([int]$port) { return $false }
function Test-ClientTargets([int]$port) { return $false }
$result = @(Start-Profile $fixture)
if (@($result | Where-Object { $null -ne $_ }).Count) {
    throw 'An idle profile must return null, never diagnostic text.'
}
if (-not (Test-Path $logPath)) { throw 'Diagnostics must still be written to disk.' }
Write-Host 'PASS: supervisor diagnostics do not contaminate child-process return values.'
