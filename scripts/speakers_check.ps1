$base = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render'
Get-ChildItem $base | ForEach-Object {
    $props = $_.PSPath + '\Properties'
    try {
        $fn = (Get-ItemProperty $props -ErrorAction SilentlyContinue).'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
        $state = $_.GetValue('DeviceState')
        if ($fn -match 'Speakers' -or $fn -match 'Realtek') {
            Write-Host "GUID: $($_.PSChildName)"
            Write-Host "FriendlyName: $fn"
            Write-Host "DeviceState: $state (1=Active, 2=Disabled, 4=NotPresent, 8=Unplugged)"
            # Dump all property keys for this endpoint
            $propBag = Get-ItemProperty $props -ErrorAction SilentlyContinue
            $propBag.PSObject.Properties | Where-Object { $_.Name -match '^\{' } | ForEach-Object {
                Write-Host "  $($_.Name) = $($_.Value)"
            }
            Write-Host "---"
        }
    } catch {}
}
