$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $root
$sourceScripts = Join-Path $projectRoot "scripts"

Copy-Item (Join-Path $sourceScripts "mqtt_bridge_sender.py") (Join-Path $root "mqtt_bridge_sender.py") -Force
Copy-Item (Join-Path $sourceScripts "fake_csv_writer.py") (Join-Path $root "fake_csv_writer.py") -Force
Copy-Item (Join-Path $sourceScripts "check_prediteq_csv.py") (Join-Path $root "check_prediteq_csv.py") -Force
Copy-Item (Join-Path $sourceScripts "requirements_bridge.txt") (Join-Path $root "requirements_bridge.txt") -Force
Copy-Item (Join-Path $sourceScripts "run_mac_fake_csv_rehearsal.sh") (Join-Path $root "run_mac_fake_csv_rehearsal.sh") -Force
Copy-Item (Join-Path $sourceScripts "run_mac_real_csv.sh") (Join-Path $root "run_mac_real_csv.sh") -Force
Copy-Item (Join-Path $sourceScripts ".env.bridge.example") (Join-Path $root "BRIDGE_CONFIG_EXAMPLE.txt") -Force
Copy-Item (Join-Path $projectRoot "TRANSFER_TO_PC2\PREFERRED_LABVIEW_CSV_TEMPLATE.csv") (Join-Path $root "PREFERRED_LABVIEW_CSV_TEMPLATE.csv") -Force

Write-Host "PrediTeq_Bridge_Kit was refreshed from prediteq_api/scripts"
