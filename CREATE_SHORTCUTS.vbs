' ========================================================================
' Create Desktop & Start Menu Shortcuts with Modern Green Drug Store Icon
' ========================================================================
Option Explicit
Dim WshShell, fso, appDir, icoPath, wscriptExe, vbsPath, desktopDir, startProgramsDir, startMenuFolder, scDesktop, scStart
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
icoPath = appDir & "\drug-store.ico,0"
wscriptExe = WshShell.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")
vbsPath = appDir & "\START_SILENT.vbs"

' 1. Create Desktop Shortcut
desktopDir = WshShell.SpecialFolders("Desktop")
Set scDesktop = WshShell.CreateShortcut(desktopDir & "\JHCIS Drug Stock.lnk")
scDesktop.TargetPath = wscriptExe
scDesktop.Arguments = "//nologo """ & vbsPath & """"
scDesktop.WorkingDirectory = appDir
scDesktop.IconLocation = icoPath
scDesktop.WindowStyle = 1
scDesktop.Description = "JHCIS Drug Stock & Stock Card"
scDesktop.Save

' 2. Create Start Menu Shortcut
On Error Resume Next
startProgramsDir = WshShell.SpecialFolders("Programs")
startMenuFolder = startProgramsDir & "\JHCIS Drug Stock"
If Not fso.FolderExists(startMenuFolder) Then
    fso.CreateFolder startMenuFolder
End If
Set scStart = WshShell.CreateShortcut(startMenuFolder & "\JHCIS Drug Stock.lnk")
scStart.TargetPath = wscriptExe
scStart.Arguments = "//nologo """ & vbsPath & """"
scStart.WorkingDirectory = appDir
scStart.IconLocation = icoPath
scStart.WindowStyle = 1
scStart.Description = "JHCIS Drug Stock & Stock Card"
scStart.Save
On Error GoTo 0
