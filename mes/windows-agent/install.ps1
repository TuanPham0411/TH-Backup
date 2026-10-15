# Run from an elevated PowerShell window after downloading device.json from MES admin.
param([Parameter(Mandatory=$true)][string]$DeviceConfig)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run PowerShell as administrator.' }
$pythonPath = (& python -c 'import sys; print(sys.executable)')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $pythonPath)) { throw 'Install a trusted Python 3.11+ runtime first.' }
& $pythonPath -I -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)'
if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 or newer is required.' }
$config = Get-Content -Raw -LiteralPath $DeviceConfig | ConvertFrom-Json
if (-not $config.deviceId -or -not $config.secret) { throw 'Invalid device.json.' }
$agentDirectory = Join-Path $env:ProgramData 'THMES'
New-Item -ItemType Directory -Force $agentDirectory | Out-Null
$existingConfigPath = Join-Path $agentDirectory 'device.json'
if (Test-Path $existingConfigPath) {
    $existingConfig = Get-Content -Raw -LiteralPath $existingConfigPath | ConvertFrom-Json
    if ($existingConfig.deviceId -ne $config.deviceId -or $existingConfig.secret -ne $config.secret) {
        throw 'A different device configuration already exists. Revoke/uninstall it deliberately before replacing it.'
    }
}
# The task runs only in the current user's interactive session, never as SYSTEM.
# Restrict the device credential to the installer account, SYSTEM and local administrators.
& icacls $agentDirectory /inheritance:r /grant:r "$($identity.Name):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect the agent configuration.' }
$existingTask = Get-ScheduledTask -TaskName 'TH MES Verification Agent' -ErrorAction SilentlyContinue
if ($existingTask) { Stop-ScheduledTask -TaskName 'TH MES Verification Agent' -ErrorAction SilentlyContinue }
$existingAgent = Join-Path $agentDirectory 'agent.py'
if (Test-Path $existingAgent) { Copy-Item -LiteralPath $existingAgent -Destination (Join-Path $agentDirectory 'agent.previous.py') -Force }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'agent.py') -Destination (Join-Path $agentDirectory 'agent.py')
if ((Resolve-Path -LiteralPath $DeviceConfig).Path -ne $existingConfigPath) { Copy-Item -LiteralPath $DeviceConfig -Destination $existingConfigPath }
$action = New-ScheduledTaskAction -Execute $pythonPath -Argument "-I `"$(Join-Path $agentDirectory 'agent.py')`"" -WorkingDirectory $agentDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'TH MES Verification Agent' -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'TH MES Verification Agent'
Write-Host 'TH MES agent installed for this Windows account. Never share device.json. Allow local-network access in the browser when requested.'
