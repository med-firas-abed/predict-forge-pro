param(
    [string]$MachineId = "ARO-01",
    [string]$SourceLabel = "site_bridge_pc_csv_rehearsal",
    [string]$BrokerHost = "broker.emqx.io",
    [int]$BrokerPort = 8883,
    [bool]$UseSsl = $true,
    [switch]$Once
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $root "RUN_BOSS_PC_CSV_REHEARSAL.ps1"

& $target `
    -MachineId $MachineId `
    -SourceLabel $SourceLabel `
    -BrokerHost $BrokerHost `
    -BrokerPort $BrokerPort `
    -UseSsl:$UseSsl `
    -Once:$Once
