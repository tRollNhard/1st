$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "Must run elevated." -ForegroundColor Red; exit 1 }

Write-Host "Re-enabling any disabled Bluetooth audio devices..." -ForegroundColor Yellow
$bt = Get-PnpDevice | Where-Object {
    ($_.Class -in @('MEDIA','AudioEndpoint','Bluetooth')) -and
    ($_.FriendlyName -match 'Troll|Galaxy|Vizio|VIZIO|Hands-Free|HF Audio|A2DP') -and
    ($_.Status -ne 'OK')
}
if (-not $bt) {
    Write-Host "  All BT audio devices already OK."
} else {
    foreach ($d in $bt) {
        Write-Host ("  Enabling: {0} (was {1})" -f $d.FriendlyName, $d.Status)
        Enable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
    }
}

Write-Host "`nState after restore:" -ForegroundColor Yellow
Get-PnpDevice | Where-Object {
    ($_.Class -in @('MEDIA','AudioEndpoint','Bluetooth')) -and
    ($_.FriendlyName -match 'Troll|Galaxy|Vizio|VIZIO|Hands-Free|HF Audio|A2DP')
} | Sort-Object Class,FriendlyName |
    Select-Object Status,Class,FriendlyName | Format-Table -AutoSize
