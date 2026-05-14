$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $root

$sourceScripts = Join-Path $projectRoot "scripts"
$targetScripts = Join-Path $root "scripts"

Copy-Item (Join-Path $sourceScripts "mqtt_bridge_sender.py") (Join-Path $targetScripts "mqtt_bridge_sender.py") -Force
Copy-Item (Join-Path $sourceScripts "requirements_bridge.txt") (Join-Path $targetScripts "requirements_bridge.txt") -Force
Copy-Item (Join-Path $sourceScripts ".env.bridge.example") (Join-Path $targetScripts ".env.bridge.example") -Force

Write-Host "TRANSFER_TO_PC2 was refreshed from prediteq_api/scripts"
