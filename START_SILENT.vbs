' JHCIS Drug Stock - Silent Launcher
' Runs the Node.js server without a console window.
' The server opens the browser by itself once it is ready (server.js --open).
Option Explicit

Dim WshShell, fso, currentDir, nodeBin, serverScript
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

nodeBin = currentDir & "\bin\node.exe"
If Not fso.FileExists(nodeBin) Then
    nodeBin = "node"
End If

serverScript = currentDir & "\backend\src\server.js"

WshShell.Run """" & nodeBin & """ """ & serverScript & """ --open", 0, False
