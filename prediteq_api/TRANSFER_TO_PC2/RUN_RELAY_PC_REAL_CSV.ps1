param(
    [Parameter(Mandatory = $true)]
    [string]$CsvPath,
    [string]$MachineId = "ARO-01",
    [string]$SourceLabel = "site_bridge_pc_real_csv",
    [string]$BrokerHost = "broker.emqx.io",
    [int]$BrokerPort = 8883,
    [string]$BrokerUser = "",
    [string]$BrokerPassword = "",
    [bool]$UseSsl = $true,
    [switch]$Once
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $root "RUN_BOSS_PC_REAL_CSV.ps1"

& $target `
    -CsvPath $CsvPath `
    -MachineId $MachineId `
    -SourceLabel $SourceLabel `
    -BrokerHost $BrokerHost `
    -BrokerPort $BrokerPort `
    -BrokerUser $BrokerUser `
    -BrokerPassword $BrokerPassword `
    -UseSsl:$UseSsl `
    -Once:$Once
