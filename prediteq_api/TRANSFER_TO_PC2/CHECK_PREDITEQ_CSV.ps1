param(
    [Parameter(Mandatory = $true)]
    [string]$CsvPath
)

$ErrorActionPreference = "Stop"

function Normalize-Header([string]$Text) {
    return (($Text.ToLowerInvariant() -replace '[^a-z0-9]+', '_') -replace '_+', '_').Trim('_')
}

$aliases = @{
    machine_id  = @("machine_id", "machine", "machineid", "machine_code", "machinecode", "code", "asset_id")
    observed_at = @("observed_at", "timestamp", "time", "datetime", "date_time", "time_utc", "datetime_utc")
    rms_mms     = @("rms_mms", "rms", "vibration", "vibration_rms", "vibration_mm_s", "rms_mm_s")
    power_kw    = @("power_kw", "power", "kw", "active_power", "motor_power", "power_k_w")
    temp_c      = @("temp_c", "temp", "temperature", "temperature_c", "motor_temp", "temp_motor")
    humidity_rh = @("humidity_rh", "humidity", "hum", "relative_humidity", "humidity_percent", "humidity_pct")
}

if (-not (Test-Path -LiteralPath $CsvPath)) {
    throw "CSV file not found: $CsvPath"
}

$headerLine = Get-Content -LiteralPath $CsvPath -TotalCount 1
if (-not $headerLine) {
    throw "CSV file is empty: $CsvPath"
}

$headers = $headerLine.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
if ($headers.Count -eq 0) {
    throw "CSV header is empty: $CsvPath"
}

$normalizedHeaders = @{}
foreach ($header in $headers) {
    $normalizedHeaders[(Normalize-Header $header)] = $header
}

$missing = @()
$mapping = [ordered]@{}

foreach ($field in @("machine_id", "observed_at", "rms_mms", "power_kw", "temp_c", "humidity_rh")) {
    $found = $null
    foreach ($alias in $aliases[$field]) {
        $normalizedAlias = Normalize-Header $alias
        if ($normalizedHeaders.ContainsKey($normalizedAlias)) {
            $found = $normalizedHeaders[$normalizedAlias]
            break
        }
    }

    if ($found) {
        $mapping[$field] = $found
    }
    else {
        $missing += $field
    }
}

if ($missing.Count -gt 0) {
    Write-Host "CSV header check failed." -ForegroundColor Red
    Write-Host "Missing required PrediTeq fields:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Preferred header is:" -ForegroundColor Yellow
    Write-Host "machine_id,observed_at,rms_mms,power_kw,temp_c,humidity_rh,current_a,load_kg,status" -ForegroundColor Yellow
    exit 1
}

Write-Host "CSV header OK." -ForegroundColor Green
Write-Host "Detected mapping:"
foreach ($item in $mapping.GetEnumerator()) {
    Write-Host " - $($item.Key) <- $($item.Value)"
}

$lastRow = Import-Csv -LiteralPath $CsvPath | Select-Object -Last 1
if ($lastRow) {
    Write-Host ""
    Write-Host "Last row preview:"
    foreach ($field in $mapping.Keys) {
        $sourceColumn = $mapping[$field]
        Write-Host " - $field = $($lastRow.$sourceColumn)"
    }
}

exit 0
