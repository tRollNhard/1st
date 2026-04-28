Write-Host "=== BT audio-profile devices (media + HFP only) ===" -ForegroundColor Yellow
Get-PnpDevice | Where-Object {
    ($_.Class -in @('MEDIA','AudioEndpoint','Bluetooth')) -and
    ($_.FriendlyName -match 'Troll|Galaxy|Vizio|VIZIO|Hands-Free|HF Audio|A2DP')
} | Sort-Object Class,FriendlyName |
    Select-Object Status,Class,FriendlyName |
    Format-Table -AutoSize -Wrap
