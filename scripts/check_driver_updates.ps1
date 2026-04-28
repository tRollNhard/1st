$ErrorActionPreference = 'Continue'
Write-Host 'Scanning Windows Update for pending driver updates...' -ForegroundColor Yellow

try {
    $session  = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $result   = $searcher.Search("IsInstalled=0 and Type='Driver'")
    $count    = $result.Updates.Count
    Write-Host ("Found $count pending driver update(s)") -ForegroundColor Cyan

    $result.Updates | ForEach-Object {
        $driverClass   = $_.DriverClass
        $driverVersion = $_.DriverVersion
        $title         = $_.Title
        $size          = [math]::Round($_.MaxDownloadSize / 1MB, 1)
        Write-Host ("  [{0}] {1} v{2}  ({3} MB)" -f $driverClass, $title, $driverVersion, $size)
    }

    # Highlight Realtek specifically
    $realtekUpdates = $result.Updates | Where-Object { $_.Title -match 'Realtek' }
    if ($realtekUpdates.Count -gt 0) {
        Write-Host "`nRealtek updates available:" -ForegroundColor Yellow
        $realtekUpdates | ForEach-Object {
            Write-Host ("  $($_.Title) v$($_.DriverVersion)") -ForegroundColor Yellow
        }
    } else {
        Write-Host "`nNo Realtek driver updates found via Windows Update." -ForegroundColor Green
        Write-Host "Current Realtek audio driver 6.0.9885.1 (2025-09-08) may already be latest." -ForegroundColor DarkGray
    }
} catch {
    Write-Host "Windows Update COM scan failed: $_" -ForegroundColor Red
    Write-Host "Trying pnputil driver store check instead..." -ForegroundColor Yellow
    pnputil /enum-drivers | Select-String -Pattern 'Realtek|10EC' -Context 0,5
}
