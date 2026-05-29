param(
    [switch]$HelpersOnly
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$runtimeDir = Join-Path $apiRoot ".runtime_demo"
$statePath = Join-Path $runtimeDir "ben_arous_demo_state.json"
$backendUrl = "http://127.0.0.1:8000"
$simulatorStopUrl = "$backendUrl/simulator/stop"

function Stop-ProcessTree {
    param(
        [int]$ProcessId,
        [string]$Label
    )

    try {
        $null = Get-Process -Id $ProcessId -ErrorAction Stop
    }
    catch {
        return
    }

    & taskkill.exe /PID $ProcessId /T /F | Out-Null
    Write-Host "Stopped $Label (PID $ProcessId)."
}

function Get-ProcessesByPatterns {
    param([string[]]$Patterns)

    Get-CimInstance Win32_Process | Where-Object {
        $commandLine = $_.CommandLine
        if (-not $commandLine) {
            return $false
        }

        $matched = 0
        foreach ($pattern in $Patterns) {
            if ($commandLine -match [Regex]::Escape($pattern)) {
                $matched += 1
            }
        }

        return $matched -eq $Patterns.Count
    }
}

function Get-HttpStatusCode {
    param([System.Exception]$Exception)

    try {
        return [int]$Exception.Response.StatusCode.value__
    }
    catch {
        return $null
    }
}

function Stop-RemoteSimulatorIfRunning {
    param([string]$Url)

    try {
        Invoke-RestMethod `
            -Method Post `
            -Uri $Url `
            -ContentType "application/json" `
            -Body "{}" `
            -TimeoutSec 5 | Out-Null
        Write-Host "Stopped simulator replay."
    }
    catch {
        $statusCode = Get-HttpStatusCode -Exception $_.Exception
        if ($statusCode -in @(404, 409)) {
            return
        }
    }
}

$state = $null
if (Test-Path $statePath) {
    try {
        $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json
    }
    catch {
        $state = $null
    }
}

Stop-RemoteSimulatorIfRunning -Url $simulatorStopUrl

if ($state -and $state.bridge -and $state.bridge.pid) {
    Stop-ProcessTree -ProcessId ([int]$state.bridge.pid) -Label "Ben Arous bridge"
}
if ($state -and $state.replay -and $state.replay.pid) {
    Stop-ProcessTree -ProcessId ([int]$state.replay.pid) -Label "Ben Arous replay"
}

$helperPatterns = @(
    @("mqtt_bridge_sender.py", "ARO-01_labview_demo_healthy_live.csv", "http://127.0.0.1:8000/ingest/live"),
    @("replay_labview_demo_csv.py", "ARO-01_labview_demo_healthy_live.csv")
)

$seen = @{}
foreach ($patternSet in $helperPatterns) {
    foreach ($process in (Get-ProcessesByPatterns -Patterns $patternSet)) {
        if ($seen.ContainsKey($process.ProcessId)) {
            continue
        }
        $seen[$process.ProcessId] = $true
        Stop-ProcessTree -ProcessId $process.ProcessId -Label "Ben Arous helper"
    }
}

if (-not $HelpersOnly) {
    if ($state -and $state.frontend -and $state.frontend.pid) {
        Stop-ProcessTree -ProcessId ([int]$state.frontend.pid) -Label "Ben Arous frontend"
    }
    if ($state -and $state.backend -and $state.backend.pid) {
        Stop-ProcessTree -ProcessId ([int]$state.backend.pid) -Label "Ben Arous backend"
    }
}

if (Test-Path $statePath) {
    Remove-Item -LiteralPath $statePath -Force
}

Write-Host "Ben Arous demo stop complete."
