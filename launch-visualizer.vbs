' Silent launcher for Neon Visualizer — Electron build.
' Derives paths from the script's own location so the shortcut keeps
' working if the project folder is moved or renamed.
Set objShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir   = fso.GetParentFolderName(WScript.ScriptFullName)
electronExe = scriptDir & "\visualization\node_modules\electron\dist\electron.exe"
appDir      = scriptDir & "\visualization"

If Not fso.FileExists(electronExe) Then
    MsgBox "Neon Visualizer: could not find Electron binary." & vbCrLf & vbCrLf & _
           "Expected at: " & electronExe & vbCrLf & vbCrLf & _
           "Run 'npm install' in the visualization folder.", _
           vbCritical, "Launch failed"
    WScript.Quit 1
End If

' 0 = hidden wscript window, False = don't wait. Electron opens its own window.
cmd = """" & electronExe & """ """ & appDir & """"
objShell.Run cmd, 0, False
