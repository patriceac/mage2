Option Explicit

Const APP_NAME = "MAGE2 Editor"
Const WINDOW_HIDDEN = 0
Const WINDOW_NORMAL = 1

Dim shell, fileSystem, repoRoot
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
repoRoot = fileSystem.GetParentFolderName(WScript.ScriptFullName)

Dim electronExe, mainEntry, preloadEntry, rendererEntry
electronExe = repoRoot & "\node_modules\electron\dist\electron.exe"
mainEntry = repoRoot & "\apps\editor\dist-electron\main.cjs"
preloadEntry = repoRoot & "\apps\editor\dist-electron\preload.cjs"
rendererEntry = repoRoot & "\apps\editor\dist\index.html"

If Not fileSystem.FileExists(electronExe) Then
  MsgBox "Electron is not installed for this workspace. Run 'npm install' in the repo root first.", vbCritical, APP_NAME
  WScript.Quit 1
End If

If BuildRequired(mainEntry, preloadEntry, rendererEntry) Then
  Dim buildExitCode
  buildExitCode = RunHidden("cmd.exe /c cd /d " & Quote(repoRoot) & " && npm run build:packages && npm run build --workspace @mage2/editor")

  If buildExitCode <> 0 Then
    MsgBox "The editor build failed. Run launch-editor.cmd from a terminal to see the error details.", vbCritical, APP_NAME
    WScript.Quit buildExitCode
  End If
End If

shell.CurrentDirectory = repoRoot
shell.Run Quote(electronExe) & " " & Quote(mainEntry), WINDOW_NORMAL, False

Function BuildRequired(mainPath, preloadPath, rendererPath)
  BuildRequired = (Not fileSystem.FileExists(mainPath)) _
    Or (Not fileSystem.FileExists(preloadPath)) _
    Or (Not fileSystem.FileExists(rendererPath))
End Function

Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function

Function RunHidden(command)
  RunHidden = shell.Run(command, WINDOW_HIDDEN, True)
End Function
