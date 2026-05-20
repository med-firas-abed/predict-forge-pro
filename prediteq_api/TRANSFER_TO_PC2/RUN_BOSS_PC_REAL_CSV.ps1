param(
    [Parameter(Mandatory = $true)]
    [string]$CsvPath,
    [string]$MachineId = "ARO-01",
    [string]$SourceLabel = "site_bridge_pc_real_csv",
    [string]$BrokerHost = "broker.emqx.io",
    [int]$BrokerPort = 8883,
    [string]$BrokerUser = "",
    [string]$BrokerPassword = "",
    [bool]$UseSsl = $true,
    [switch]$Once
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptsDir = Join-Path $root "scripts"
$requirementsPath = Join-Path $scriptsDir "requirements_bridge.txt"
$senderPath = Join-Path $scriptsDir "mqtt_bridge_sender.py"
$configPath = Join-Path $scriptsDir ".env.bridge"
$checkPath = Join-Path $root "CHECK_PREDITEQ_CSV.ps1"

function Get-PythonCommand {
    foreach ($candidate in @("python", "py")) {
        try {
            & $candidate --version *> $null
            return $candidate
        }
        catch {
        }
    }

    throw "Python is not installed. Install Python, reopen PowerShell, then run this script again."
}

$pythonCmd = Get-PythonCommand

Write-Host "Using Python command: $pythonCmd"

try {
    & $pythonCmd -m pip --version *> $null
}
catch {
    Write-Host "pip not found. Trying to enable it..."
    & $pythonCmd -m ensurepip --upgrade
}

Write-Host "Installing sender packages..."
& $pythonCmd -m pip install -r $requirementsPath

Write-Host "Checking CSV format..."
& powershell -ExecutionPolicy Bypass -File $checkPath -CsvPath $CsvPath
if ($LASTEXITCODE -ne 0) {
    throw "CSV check failed. Fix the CSV header before starting PrediTeq."
}

Write-Host "Writing scripts/.env.bridge for real CSV mode..."
@"
MACHINE_ID=$MachineId
PUBLISH_TRANSPORT=mqtt
MQTT_HOST=$BrokerHost
MQTT_PORT=$BrokerPort
MQTT_USER=$BrokerUser
MQTT_PASSWORD=$BrokerPassword
MQTT_USE_SSL=$UseSsl
MQTT_TOPIC=prediteq/{machine_id}/sensors
PUBLISH_INTERVAL_S=1.0
SOURCE_MODE=csv-last-row
SOURCE_CSV_PATH=$CsvPath
SOURCE_LABEL=$SourceLabel
"@ | Set-Content -Path $configPath -Encoding Ascii

Write-Host ""
Write-Host "Starting CSV MQTT sender..."
Write-Host "Machine: $MachineId"
Write-Host "CSV: $CsvPath"
Write-Host "Broker: $BrokerHost`:$BrokerPort"
Write-Host ""

$senderArgs = @($senderPath)
if ($Once) {
    $senderArgs += "--once"
}

& $pythonCmd @senderArgs
