# Creates "Claude Sandbox.lnk" on the desktop. Double-click the shortcut
# to spin up an ephemeral Windows Sandbox with Edge pointed at claude.ai.
$WshShell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcut = $WshShell.CreateShortcut("$desktop\Claude Sandbox.lnk")
# .wsb files are handled by WindowsSandbox.exe; pointing the shortcut at the
# .wsb directly lets Windows route it correctly.
$shortcut.TargetPath = "C:\Users\Jason W Clark\Desktop\claude projects\claude-sandbox.wsb"
$shortcut.WorkingDirectory = "C:\Users\Jason W Clark\Desktop\claude projects"
$shortcut.IconLocation = "C:\Windows\System32\WindowsSandbox.exe,0"
$shortcut.Description = "Launch claude.ai in an ephemeral Windows Sandbox"
$shortcut.Save()
Write-Host "Shortcut created: $desktop\Claude Sandbox.lnk"
