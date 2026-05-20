param(
    [string]$MachineId = "ARO-01",
    [string]$CsvPath = "",
    [string]$SourceLabel = "",
    [string]$BrokerHost = "",
    [int]$BrokerPort = 0,
    [string]$BrokerUser = "",
    [string]$BrokerPassword = "",
    [bool]$UseSsl = $true
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$requirementsPath = Join-Path $root "requirements_bridge.txt"
$writerPath = Join-Path $root "labview_demo_writer.py"
$senderPath = Join-Path $root "mqtt_bridge_sender.py"
$configPath = Join-Path $root ".env.bridge"
$bridgeConfigPath = Join-Path $root "BRIDGE_CONFIG.txt"

function Get-PythonCommand {
    foreach ($candidate in @("python", "py")) {
        try {
            & $candidate --version *> $null
            return $candidate
        }
        catch {
        }
    }

    throw "Python is not installed. Install Python 3, reopen PowerShell, then run this script again."
}

function Import-KeyValueFile {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path $Path)) {
        return $values
    }

    foreach ($line in Get-Content -Path $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
            continue
        }
        $parts = $trimmed -split "=", 2
        $values[$parts[0].Trim()] = $parts[1].Trim()
    }
    return $values
}

$cfg = Import-KeyValueFile -Path $bridgeConfigPath

if (-not $CsvPath) {
    if ($cfg.ContainsKey("SOURCE_CSV_PATH") -and $cfg["SOURCE_CSV_PATH"]) {
        $CsvPath = $cfg["SOURCE_CSV_PATH"]
    }
    else {
        $CsvPath = Join-Path $root "labview_mock_output.csv"
    }
}
if (-not $SourceLabel) {
    $SourceLabel = if ($cfg.ContainsKey("SOURCE_LABEL") -and $cfg["SOURCE_LABEL"]) { $cfg["SOURCE_LABEL"] } else { "site_bridge_pc_labview_demo" }
}
if (-not $BrokerHost) {
    $BrokerHost = if ($cfg.ContainsKey("MQTT_HOST") -and $cfg["MQTT_HOST"]) { $cfg["MQTT_HOST"] } else { "broker.emqx.io" }
}
if ($BrokerPort -le 0) {
    $BrokerPort = if ($cfg.ContainsKey("MQTT_PORT") -and $cfg["MQTT_PORT"]) { [int]$cfg["MQTT_PORT"] } else { 8883 }
}
if (-not $BrokerUser -and $cfg.ContainsKey("MQTT_USER")) { $BrokerUser = $cfg["MQTT_USER"] }
if (-not $BrokerPassword -and $cfg.ContainsKey("MQTT_PASSWORD")) { $BrokerPassword = $cfg["MQTT_PASSWORD"] }
if ($cfg.ContainsKey("MQTT_USE_SSL") -and $cfg["MQTT_USE_SSL"]) { $UseSsl = $cfg["MQTT_USE_SSL"].ToLower() -in @("1","true","yes","y","on") }

$pythonCmd = Get-PythonCommand

Write-Host "Using Python command: $pythonCmd"
& $pythonCmd -m pip install -r $requirementsPath

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

Write-Host "Starting LabVIEW demo CSV writer..."
$writerJob = Start-Job -ScriptBlock {
    param($PythonCmd, $WriterPath, $OutputPath, $CurrentMachineId)
    & $PythonCmd $WriterPath --output $OutputPath --machine-id $CurrentMachineId --reset
} -ArgumentList $pythonCmd, $writerPath, $CsvPath, $MachineId

Start-Sleep -Seconds 1

Write-Host "Starting relay-PC sender..."
Write-Host "Machine: $MachineId"
Write-Host "CSV: $CsvPath"
Write-Host "Broker: $BrokerHost`:$BrokerPort"

try {
    & $pythonCmd $senderPath
}
finally {
    if ($writerJob) {
        Stop-Job -Job $writerJob -ErrorAction SilentlyContinue | Out-Null
        Remove-Job -Job $writerJob -Force -ErrorAction SilentlyContinue | Out-Null
    }
}
