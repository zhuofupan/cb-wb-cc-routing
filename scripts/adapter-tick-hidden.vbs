' Scheduled-task entry point for adapter-tick.cmd.
' wscript.exe is a GUI-subsystem host: no console window is ever allocated.
' (A .cmd launched directly by Task Scheduler always flashes a conhost window.)
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
tick = fso.GetParentFolderName(WScript.ScriptFullName) & "\adapter-tick.cmd"
sh.Run """" & tick & """", 0, False
