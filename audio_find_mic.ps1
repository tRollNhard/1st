$paths = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged'
)
foreach ($p in $paths) {
    $exists = Test-Path $p
    Write-Host ("{0}  {1}" -f ($(if($exists){'[YES]'}else{'[no ]'}), $p))
    if ($exists) {
        $val = (Get-ItemProperty -Path $p -Name Value -ErrorAction SilentlyContinue).Value
        if ($val) { Write-Host ("        Value = {0}" -f $val) }
        $kids = Get-ChildItem $p -ErrorAction SilentlyContinue
        foreach ($k in $kids) {
            $v = (Get-ItemProperty -Path $k.PSPath -Name Value -ErrorAction SilentlyContinue).Value
            if ([string]::IsNullOrEmpty($v)) { $v = '(blank)' }
            Write-Host ("        {0,-8} {1}" -f $v, ($k.PSChildName -replace '#','\'))
        }
    }
}
