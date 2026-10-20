# Official Windows Desktop Code default. Does not change Cowork or permissions.
[CmdletBinding(SupportsShouldProcess=$true)]
param([ValidateSet('low','medium','high','xhigh','max')][string]$Effort = 'max')

$ErrorActionPreference = 'Stop'
$policyPath = 'HKCU:\SOFTWARE\Policies\Claude'
$previous = [ordered]@{ path=$policyPath; name='effortLevel'; existed=$false; value=$null; kind=$null }
if (Test-Path -LiteralPath $policyPath) {
    $item = Get-Item -LiteralPath $policyPath
    if ($item.GetValueNames() -contains 'effortLevel') {
        $previous.existed = $true
        $previous.value = $item.GetValue('effortLevel')
        $previous.kind = $item.GetValueKind('effortLevel').ToString()
    }
}
if (-not $PSCmdlet.ShouldProcess($policyPath, "Set effortLevel=$Effort for new Desktop Code sessions")) { return }

$backupDir = Join-Path $env:LOCALAPPDATA 'Claude-3p\code-effort-policy-backups'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$backupPath = Join-Path $backupDir ((Get-Date -Format 'yyyyMMdd-HHmmss-fffffff') + '.json')
$previous | ConvertTo-Json | Set-Content -LiteralPath $backupPath -Encoding UTF8
try {
    if (-not (Test-Path -LiteralPath $policyPath)) { New-Item -Path $policyPath -Force | Out-Null }
    New-ItemProperty -LiteralPath $policyPath -Name 'effortLevel' -PropertyType String -Value $Effort -Force | Out-Null
    $actual = Get-ItemPropertyValue -LiteralPath $policyPath -Name 'effortLevel'
    if ($actual -ne $Effort) { throw 'Policy readback did not match the requested effort.' }
} catch {
    throw "Could not set Desktop Code effort. If Windows denied registry access, rerun in an administrator PowerShell for the same user. Backup: $backupPath. $($_.Exception.Message)"
}
Write-Output "Desktop Code default effort: $actual. Restart Claude Desktop. Backup: $backupPath"
