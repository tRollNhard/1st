# Creates "Neon Visualizer.lnk" on the desktop pointing at the VBS launcher.
# VBS launches Electron silently (no console window flash).
$WshShell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcut = $WshShell.CreateShortcut("$desktop\Neon Visualizer.lnk")
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = '"C:\Users\Jason W Clark\Desktop\claude projects\launch-visualizer.vbs"'
$shortcut.WorkingDirectory = "C:\Users\Jason W Clark\Desktop\claude projects"
$iconPath = "C:\Users\Jason W Clark\Desktop\claude projects\visualization\build\icon.ico"
if (Test-Path $iconPath) {
    $shortcut.IconLocation = $iconPath
} else {
    $shortcut.IconLocation = "C:\Windows\System32\shell32.dll,325"
}
$shortcut.Description = "Neon Visualizer - Mic + Spotify reactive"
$shortcut.Save()
Write-Host "Shortcut created: $desktop\Neon Visualizer.lnk"
