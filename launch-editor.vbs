Option Explicit

Dim shell
Dim fileSystem
Dim repoDir
Dim command

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

repoDir = fileSystem.GetParentFolderName(WScript.ScriptFullName)
command = "cmd.exe /c """ & repoDir & "\launch-editor.cmd"""

shell.Run command, 0, False
