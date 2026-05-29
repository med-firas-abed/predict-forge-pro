param(
    [string]$MachineId = "ARO-01",
    [ValidateSet("healthy", "surveillance", "critical")]
    [string]$Scenario = "healthy",
    [string]$Profile = "A_linear",
    [int]$Seed = 99,
    [double]$CyclesPerDay = 160.0,
    [double]$PowerAvg30jKw = 1.24,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$repoRoot = (Resolve-Path (Join-Path $apiRoot "..")).Path
$frontendRoot = Join-Path $repoRoot "prediteq_frontend"
$runtimeDir = Join-Path $apiRoot ".runtime_demo"
$logsDir = Join-Path $runtimeDir "logs"
$statePath = Join-Path $runtimeDir "ben_arous_demo_state.json"

$backendUrl = "http://127.0.0.1:8000"
$frontendUrl = "http://127.0.0.1:8080"
$backendHealthUrl = "$backendUrl/health"
$backendResilienceUrl = "$backendUrl/health/resilience"
$simulatorStatusUrl = "$backendUrl/simulator/status"
$simulatorStartUrl = "$backendUrl/simulator/start?speed=60&reset=true&demo_mode=true&email_notifications=false"
$simulatorStopUrl = "$backendUrl/simulator/stop"

$fleetSeedScript = Join-Path $scriptDir "ensure_soutenance_fleet.py"
$templatePath = Join-Path $scriptDir "sample_data\ARO-01_labview_demo_healthy_template.csv"
$liveCsvPath = Join-Path $scriptDir "sample_data\ARO-01_labview_demo_healthy_live.csv"

New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

function Get-PythonCommand {
    $venvPython = Join-Path $apiRoot ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        return (Resolve-Path $venvPython).Path
    }

    foreach ($candidate in @("python.exe", "python", "py.exe", "py")) {
        try {
            $command = Get-Command $candidate -ErrorAction Stop
            return $command.Source
        }
        catch {
        }
    }

    throw "Python was not found. Install Python 3 or recreate prediteq_api/.venv first."
}

function Get-NpmCommand {
    foreach ($candidate in @("npm.cmd", "npm")) {
        try {
            $command = Get-Command $candidate -ErrorAction Stop
            return $command.Source
        }
        catch {
        }
    }

    throw "npm was not found. Install Node.js first."
}

function Ensure-BackendDependencies {
    param([string]$PythonCommand)

    if (Test-Path (Join-Path $apiRoot ".venv\Scripts\python.exe")) {
        return
    }

    Write-Host "No backend virtualenv detected. Installing prediteq_api requirements with $PythonCommand ..."
    & $PythonCommand -m pip install -r (Join-Path $apiRoot "requirements.txt")
}

function Ensure-FrontendDependencies {
    param([string]$NpmCommand)

    if (Test-Path (Join-Path $frontendRoot "node_modules")) {
        return
    }

    Write-Host "Frontend node_modules missing. Running npm install ..."
    & $NpmCommand install
}

function Test-Url {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 3
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

function Wait-ForUrl {
    param(
        [string]$Url,
        [string]$Label,
        [int]$TimeoutSec = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Url -Url $Url) {
            Write-Host "$Label ready: $Url"
            return
        }
        Start-Sleep -Seconds 1
    }

    throw "$Label did not become ready within $TimeoutSec seconds: $Url"
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

function Invoke-JsonPost {
    param(
        [string]$Url,
        [int]$TimeoutSec = 20
    )

    return Invoke-RestMethod `
        -Method Post `
        -Uri $Url `
        -ContentType "application/json" `
        -Body "{}" `
        -TimeoutSec $TimeoutSec
}

function Stop-RemoteSimulatorIfRunning {
    param([string]$Url)

    try {
        Invoke-JsonPost -Url $Url | Out-Null
        Write-Host "Stopped existing simulator replay."
    }
    catch {
        $statusCode = Get-HttpStatusCode -Exception $_.Exception
        if ($statusCode -in @(404, 409)) {
            return
        }
        throw
    }
}

function Wait-ForSimulatorRunning {
    param(
        [string]$Url,
        [int]$TimeoutSec = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $status = Invoke-RestMethod -Uri $Url -TimeoutSec 3
            if ($status.running) {
                Write-Host "Simulator ready: $Url"
                return
            }
        }
        catch {
        }
        Start-Sleep -Milliseconds 500
    }

    throw "Simulator did not become ready within $TimeoutSec seconds: $Url"
}

function Wait-ForCsvData {
    param(
        [string]$Path,
        [int]$TimeoutSec = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $Path) {
            try {
                $lineCount = (Get-Content -Path $Path | Measure-Object -Line).Lines
                if ($lineCount -ge 2) {
                    return
                }
            }
            catch {
            }
        }
        Start-Sleep -Milliseconds 500
    }

    throw "Live CSV did not become ready within $TimeoutSec seconds: $Path"
}

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

        foreach ($pattern in $Patterns) {
            if ($commandLine -match [Regex]::Escape($pattern)) {
                return $true
            }
        }

        return $false
    }
}

function Stop-ExistingDemoHelpers {
    $replayPatterns = @(
        "replay_labview_demo_csv.py",
        "ARO-01_labview_demo_healthy_live.csv"
    )
    $bridgePatterns = @(
        "mqtt_bridge_sender.py",
        "ARO-01_labview_demo_healthy_live.csv",
        "http://127.0.0.1:8000/ingest/live"
    )

    $processes = @()
    $processes += Get-ProcessesByPatterns -Patterns $replayPatterns
    $processes += Get-ProcessesByPatterns -Patterns $bridgePatterns

    $seen = @{}
    foreach ($process in $processes) {
        if ($seen.ContainsKey($process.ProcessId)) {
            continue
        }
        $seen[$process.ProcessId] = $true
        Stop-ProcessTree -ProcessId $process.ProcessId -Label "old Ben Arous helper"
    }
}

function Start-ManagedProcess {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory,
        [string]$LogPrefix
    )

    $stdoutLog = Join-Path $logsDir "$LogPrefix.out.log"
    $stderrLog = Join-Path $logsDir "$LogPrefix.err.log"

    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog

    return [pscustomobject]@{
        Process = $process
        StdOut = $stdoutLog
        StdErr = $stderrLog
    }
}

$pythonCommand = Get-PythonCommand
$npmCommand = Get-NpmCommand

Ensure-BackendDependencies -PythonCommand $pythonCommand
Push-Location $frontendRoot
try {
    Ensure-FrontendDependencies -NpmCommand $npmCommand
}
finally {
    Pop-Location
}

if (-not (Test-Path $fleetSeedScript)) {
    throw "Missing fleet seed helper: $fleetSeedScript"
}

Stop-ExistingDemoHelpers

$backendStarted = $false
$frontendStarted = $false
$backendProcess = $null
$frontendProcess = $null
$replayProcess = $null
$bridgeProcess = $null

if (-not (Test-Url -Url $backendHealthUrl)) {
    Write-Host "Starting backend ..."
    $backendProcess = Start-ManagedProcess `
        -FilePath $pythonCommand `
        -ArgumentList @("-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000") `
        -WorkingDirectory $apiRoot `
        -LogPrefix "backend"
    $backendStarted = $true
}
else {
    Write-Host "Backend already running at $backendUrl"
}

Wait-ForUrl -Url $backendHealthUrl -Label "Backend"
Wait-ForUrl -Url $backendResilienceUrl -Label "Backend resilience"

Write-Host "Ensuring the canonical soutenance fleet ..."
& $pythonCommand $fleetSeedScript

Write-Host "Resetting simulator story machines ..."
Stop-RemoteSimulatorIfRunning -Url $simulatorStopUrl
try {
    Invoke-JsonPost -Url $simulatorStartUrl | Out-Null
}
catch {
    $statusCode = Get-HttpStatusCode -Exception $_.Exception
    if ($statusCode -eq 401) {
        throw "Local simulator control is unavailable on the current backend. Stop the old backend and rerun START_SOUTENANCE.ps1."
    }
    throw
}
Wait-ForSimulatorRunning -Url $simulatorStatusUrl

if (-not (Test-Url -Url $frontendUrl)) {
    Write-Host "Starting frontend ..."
    $frontendProcess = Start-ManagedProcess `
        -FilePath $npmCommand `
        -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "8080") `
        -WorkingDirectory $frontendRoot `
        -LogPrefix "frontend"
    $frontendStarted = $true
}
else {
    Write-Host "Frontend already running at $frontendUrl"
}

Wait-ForUrl -Url $frontendUrl -Label "Frontend"

Write-Host "Generating healthy Ben Arous template CSV ..."
& $pythonCommand `
    (Join-Path $scriptDir "generate_labview_demo_csv.py") `
    --machine-id $MachineId `
    --scenario $Scenario `
    --profile $Profile `
    --seed $Seed `
    --output $templatePath

Write-Host "Preparing machine runtime ..."
& $pythonCommand `
    (Join-Path $scriptDir "setup_real_machine_demo.py") `
    --machine-id $MachineId `
    --name "Machine AroTeq" `
    --region "Ben Arous" `
    --location "Usine Aroteq - Ben Arous" `
    --lat 36.7537 `
    --lon 10.2189 `
    --scenario $Scenario `
    --profile $Profile `
    --cycles-per-day $CyclesPerDay `
    --power-avg-30j-kw $PowerAvg30jKw `
    --seed $Seed `
    --backend-base-url $backendUrl

Write-Host "Starting live CSV replay ..."
$replayProcess = Start-ManagedProcess `
    -FilePath $pythonCommand `
    -ArgumentList @(
        (Join-Path $scriptDir "replay_labview_demo_csv.py"),
        "--input", $templatePath,
        "--output", $liveCsvPath,
        "--interval", "1.0",
        "--loop",
        "--machine-id", $MachineId,
        "--source-label", "labview_bridge"
    ) `
    -WorkingDirectory $apiRoot `
    -LogPrefix "replay"

Wait-ForCsvData -Path $liveCsvPath

Write-Host "Starting HTTP bridge toward local backend ..."
$bridgeProcess = Start-ManagedProcess `
    -FilePath $pythonCommand `
    -ArgumentList @(
        (Join-Path $scriptDir "mqtt_bridge_sender.py"),
        "--transport", "http",
        "--http-url", "$backendUrl/ingest/live",
        "--mode", "csv-last-row",
        "--machine-id", $MachineId,
        "--csv-path", $liveCsvPath,
        "--interval", "1.0",
        "--source-label", "labview_bridge"
    ) `
    -WorkingDirectory $apiRoot `
    -LogPrefix "bridge"

Start-Sleep -Seconds 3

$state = [ordered]@{
    generated_at_utc = (Get-Date).ToUniversalTime().ToString("o")
    machine_id = $MachineId.ToUpper()
    scenario = $Scenario
    profile = $Profile
    seed = $Seed
    cycles_per_day = $CyclesPerDay
    power_avg_30j_kw = $PowerAvg30jKw
    backend = [ordered]@{
        url = $backendUrl
        pid = if ($backendStarted) { $backendProcess.Process.Id } else { $null }
        reused = (-not $backendStarted)
        stdout_log = if ($backendStarted) { $backendProcess.StdOut } else { $null }
        stderr_log = if ($backendStarted) { $backendProcess.StdErr } else { $null }
    }
    frontend = [ordered]@{
        url = $frontendUrl
        pid = if ($frontendStarted) { $frontendProcess.Process.Id } else { $null }
        reused = (-not $frontendStarted)
        stdout_log = if ($frontendStarted) { $frontendProcess.StdOut } else { $null }
        stderr_log = if ($frontendStarted) { $frontendProcess.StdErr } else { $null }
    }
    simulator = [ordered]@{
        status_url = $simulatorStatusUrl
        start_url = $simulatorStartUrl
        reset = $true
        demo_mode = $true
        speed = 60
    }
    replay = [ordered]@{
        pid = $replayProcess.Process.Id
        stdout_log = $replayProcess.StdOut
        stderr_log = $replayProcess.StdErr
        csv_path = $liveCsvPath
    }
    bridge = [ordered]@{
        pid = $bridgeProcess.Process.Id
        stdout_log = $bridgeProcess.StdOut
        stderr_log = $bridgeProcess.StdErr
    }
}

$state | ConvertTo-Json -Depth 6 | Set-Content -Path $statePath -Encoding Ascii

if (-not $NoBrowser) {
    Start-Process $frontendUrl | Out-Null
}

Write-Host ""
Write-Host "Soutenance demo ready."
Write-Host "  Frontend : $frontendUrl"
Write-Host "  Backend  : $backendUrl"
Write-Host "  Fleet    : ASC-A1, ASC-B2, ASC-C3, ARO-01"
Write-Host "  Machine  : $($MachineId.ToUpper())"
Write-Host "  Scenario : $Scenario / $Profile / seed $Seed"
Write-Host "  Duty     : $CyclesPerDay cycles/day / $PowerAvg30jKw kW"
Write-Host "  State    : $statePath"
Write-Host ""
Write-Host "To stop the managed demo helpers later:"
Write-Host "  powershell -ExecutionPolicy Bypass -File .\prediteq_api\scripts\stop_ben_arous_demo.ps1"
