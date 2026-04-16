$p = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone'
$master = (Get-ItemProperty -Path $p -Name Value -ErrorAction SilentlyContinue).Value
Write-Host ("Master desktop-mic toggle: {0}" -f $master)

$np = Join-Path $p 'NonPackaged'
Write-Host ("NonPackaged key exists: {0}" -f (Test-Path $np))

if (Test-Path $np) {
    Write-Host "`nPer-app desktop mic consent:"
    Get-ChildItem $np | ForEach-Object {
        $v = (Get-ItemProperty -Path $_.PSPath -Name Value -ErrorAction SilentlyContinue).Value
        if ([string]::IsNullOrEmpty($v)) { $v = '(blank)' }
        $name = $_.PSChildName -replace '#','\'
        Write-Host ("  {0,-8} {1}" -f $v, $name)
    }
}
