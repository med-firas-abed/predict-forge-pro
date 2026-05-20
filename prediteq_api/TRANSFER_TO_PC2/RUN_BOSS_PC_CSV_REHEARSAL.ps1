param(
    [string]$MachineId = "ARO-01",
    [string]$SourceLabel = "site_bridge_pc_csv_rehearsal",
    [string]$BrokerHost = "broker.emqx.io",
    [int]$BrokerPort = 8883,
    [bool]$UseSsl = $true,
    [switch]$Once
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptsDir = Join-Path $root "scripts"
$requirementsPath = Join-Path $scriptsDir "requirements_bridge.txt"
$senderPath = Join-Path $scriptsDir "mqtt_bridge_sender.py"
$configPath = Join-Path $scriptsDir ".env.bridge"
$csvPath = Join-Path $root "labview_mock_output.csv"

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

function Write-CsvHeader {
    "machine_id,observed_at,rms_mms,power_kw,temp_c,humidity_rh,current_a,load_kg,status" | Set-Content -Path $csvPath -Encoding Ascii
}

function Add-CsvRow {
    param(
        [double]$Rms,
        [double]$Power,
        [double]$Temp,
        [double]$Humidity
    )

    $timestamp = [DateTime]::UtcNow.ToString("o")
    $current = [Math]::Round($Power * 1.8, 3)
    $load = if ($Power -gt 0.9) { 180.0 } else { 0.0 }
    $status = if ($Power -gt 0.6) { "running" } else { "idle" }
    "$MachineId,$timestamp,$([Math]::Round($Rms, 3)),$([Math]::Round($Power, 3)),$([Math]::Round($Temp, 1)),$([Math]::Round($Humidity, 1)),$current,$load,$status" | Add-Content -Path $csvPath -Encoding Ascii
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

Write-Host "Creating rehearsal CSV file: $csvPath"
Write-CsvHeader
Add-CsvRow -Rms 1.02 -Power 0.82 -Temp 23.4 -Humidity 54.0

Write-Host "Writing scripts/.env.bridge for CSV rehearsal mode..."
@"
MACHINE_ID=$MachineId
PUBLISH_TRANSPORT=mqtt
MQTT_HOST=$BrokerHost
MQTT_PORT=$BrokerPort
MQTT_USER=
MQTT_PASSWORD=
MQTT_USE_SSL=$UseSsl
MQTT_TOPIC=prediteq/{machine_id}/sensors
PUBLISH_INTERVAL_S=1.0
SOURCE_MODE=csv-last-row
SOURCE_CSV_PATH=$csvPath
SOURCE_LABEL=$SourceLabel
"@ | Set-Content -Path $configPath -Encoding Ascii

$writerJob = $null

if (-not $Once) {
    $writerJob = Start-Job -ScriptBlock {
        param($OutputPath, $CurrentMachineId)

        $rms = 1.02
        $power = 0.82
        $temp = 23.4
        $humidity = 54.0

        while ($true) {
            $rms = [Math]::Max(0.75, [Math]::Min(2.30, $rms + (Get-Random -Minimum -0.04 -Maximum 0.04)))
            $power = [Math]::Max(0.20, [Math]::Min(1.80, $power + (Get-Random -Minimum -0.07 -Maximum 0.07)))
            $temp = [Math]::Max(20.0, [Math]::Min(36.0, $temp + (Get-Random -Minimum -0.2 -Maximum 0.2)))
            $humidity = [Math]::Max(40.0, [Math]::Min(75.0, $humidity + (Get-Random -Minimum -0.4 -Maximum 0.4)))

            $timestamp = [DateTime]::UtcNow.ToString("o")
            $current = [Math]::Round($power * 1.8, 3)
            $load = if ($power -gt 0.9) { 180.0 } else { 0.0 }
            $status = if ($power -gt 0.6) { "running" } else { "idle" }

            "$CurrentMachineId,$timestamp,$([Math]::Round($rms, 3)),$([Math]::Round($power, 3)),$([Math]::Round($temp, 1)),$([Math]::Round($humidity, 1)),$current,$load,$status" | Add-Content -Path $OutputPath -Encoding Ascii
            Start-Sleep -Seconds 1
        }
    } -ArgumentList $csvPath, $MachineId
}

Write-Host ""
Write-Host "Starting relay-PC CSV rehearsal..."
Write-Host "This simulates the future LabVIEW / PLC CSV path on this same relay PC."
Write-Host "CSV file: $csvPath"
Write-Host "Watch the PrediTeq app on PC1 for machine $MachineId."
Write-Host ""

try {
    $senderArgs = @($senderPath)
    if ($Once) {
        $senderArgs += "--once"
    }
    & $pythonCmd @senderArgs
}
finally {
    if ($writerJob) {
        Stop-Job -Job $writerJob -Force -ErrorAction SilentlyContinue | Out-Null
        Remove-Job -Job $writerJob -Force -ErrorAction SilentlyContinue | Out-Null
    }
}
