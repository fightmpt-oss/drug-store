' ========================================================================
' JHCIS Drug Stock — Windowless Silent Launcher (No CMD Window)
' Starts the Node.js server hidden in the background and opens the browser
' ========================================================================
Option Explicit

Dim WshShell, fso, currentDir, nodeBin, serverScript, i
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

Function IsServerReady()
    On Error Resume Next
    IsServerReady = False
    Dim http, statusCode
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number <> 0 Then
        Err.Clear
        Set http = CreateObject("MSXML2.XMLHTTP")
    End If
    If Err.Number <> 0 Then
        On Error GoTo 0
        Exit Function
    End If
    http.setTimeouts 500, 500, 500, 500
    Err.Clear
    http.Open "GET", "http://127.0.0.1:5000/api/health", False
    http.Send
    If Err.Number = 0 Then
        statusCode = 0
        statusCode = http.Status
        If Err.Number = 0 Then
            If statusCode = 200 Then
                IsServerReady = True
            End If
        End If
    End If
    On Error GoTo 0
End Function

' 1. If server is already running, open browser immediately
If IsServerReady() Then
    WshShell.Run "http://localhost:5000", 1, False
    WScript.Quit 0
End If

' 2. Locate portable node.exe (or fallback to system node)
nodeBin = currentDir & "\bin\node.exe"
If Not fso.FileExists(nodeBin) Then
    nodeBin = "node"
End If

serverScript = currentDir & "\backend\src\server.js"

' 3. Start Node.js server completely hidden (WindowStyle = 0 -> No black CMD window)
WshShell.Run """" & nodeBin & """ """ & serverScript & """", 0, False

' 4. Wait up to 20 seconds for server to listen on port 5000, then open browser
For i = 1 To 40
    WScript.Sleep 500
    If IsServerReady() Then
        Exit For
    End If
Next

WshShell.Run "http://localhost:5000", 1, False
