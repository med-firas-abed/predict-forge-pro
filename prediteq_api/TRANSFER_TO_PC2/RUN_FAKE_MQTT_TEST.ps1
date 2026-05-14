param(
    [string]$MachineId = "ARO-01",
    [string]$SourceLabel = "pc2_fake_test"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptsDir = Join-Path $root "scripts"
$requirementsPath = Join-Path $scriptsDir "requirements_bridge.txt"
$senderPath = Join-Path $scriptsDir "mqtt_bridge_sender.py"
$configPath = Join-Path $scriptsDir ".env.bridge"

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

Write-Host "Writing scripts/.env.bridge with the safe fake MQTT test settings..."
@"
MACHINE_ID=$MachineId
PUBLISH_TRANSPORT=mqtt
MQTT_HOST=broker.emqx.io
MQTT_PORT=8883
MQTT_USER=
MQTT_PASSWORD=
MQTT_USE_SSL=true
MQTT_TOPIC=prediteq/{machine_id}/sensors
PUBLISH_INTERVAL_S=1.0
SOURCE_MODE=mock
SOURCE_LABEL=$SourceLabel
"@ | Set-Content -Path $configPath -Encoding Ascii

Write-Host ""
Write-Host "Starting fake MQTT sender..."
Write-Host "This is for demo/testing only and uses the public EMQX test broker."
Write-Host "Watch the PrediTeq app on PC1 for machine $MachineId."
Write-Host ""

& $pythonCmd $senderPath
