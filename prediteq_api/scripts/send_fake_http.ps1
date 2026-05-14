param(
    [Parameter(Mandatory = $true)]
    [string]$BackendUrl,

    [Parameter(Mandatory = $true)]
    [string]$Token,

    [string]$MachineId = "ARO-01",
    [string]$SourceLabel = "second_pc_fake_test",
    [double]$IntervalSeconds = 1.0,
    [switch]$Once
)

$ErrorActionPreference = "Stop"

function Get-HealthUrl([string]$Url) {
    if ($Url -match "/ingest/live/?$") {
        return ($Url -replace "/ingest/live/?$", "/health")
    }
    return $null
}

function New-FakePayload {
    param(
        [string]$MachineId,
        [string]$SourceLabel
    )

    $power = [math]::Round((0.82 + (Get-Random -Minimum 0 -Maximum 10) / 100), 3)
    $rms = [math]::Round((1.18 + (Get-Random -Minimum 0 -Maximum 12) / 100), 3)
    $temp = [math]::Round((26.0 + (Get-Random -Minimum 0 -Maximum 8) / 10), 1)
    $humidity = [math]::Round((56.0 + (Get-Random -Minimum 0 -Maximum 12) / 10), 1)
    $current = [math]::Round(($power * 1.8), 3)

    return @{
        machine_id  = $MachineId
        observed_at = (Get-Date).ToUniversalTime().ToString("o")
        rms_mms     = $rms
        power_kw    = $power
        temp_c      = $temp
        humidity_rh = $humidity
        current_a   = $current
        load_kg     = 180.0
        status      = "running"
        source      = $SourceLabel
    }
}

$healthUrl = Get-HealthUrl $BackendUrl
if ($healthUrl) {
    Write-Host "Checking backend: $healthUrl"
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 5
        Write-Host "Backend reachable. Health status: $($health.status)"
    }
    catch {
        Write-Host "Cannot reach backend health endpoint."
        Write-Host $_.Exception.Message
        exit 1
    }
}

Write-Host "Starting fake sender"
Write-Host "BackendUrl: $BackendUrl"
Write-Host "MachineId : $MachineId"
Write-Host "Press Ctrl + C to stop"

while ($true) {
    $payload = New-FakePayload -MachineId $MachineId -SourceLabel $SourceLabel
    $json = $payload | ConvertTo-Json -Depth 4

    try {
        $response = Invoke-RestMethod `
            -Uri $BackendUrl `
            -Method Post `
            -Headers @{ Authorization = "Bearer $Token" } `
            -ContentType "application/json" `
            -Body $json `
            -TimeoutSec 10

        Write-Host "OK sent to $($response.machine_code) at $($payload.observed_at) | HI=$($response.hi) | zone=$($response.zone)"
    }
    catch {
        Write-Host "Send failed:"
        Write-Host $_.Exception.Message
        exit 1
    }

    if ($Once) {
        break
    }

    Start-Sleep -Milliseconds ([int]($IntervalSeconds * 1000))
}
