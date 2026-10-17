Set shell = CreateObject("Wscript.Shell")
project = "C:\Users\lebon\Documents\Documents Loulou\code\Choregraphe"

Function IsListening()
  IsListening = (shell.Run("cmd /c netstat -ano | findstr /R /C:"":3000 .*LISTENING"" >nul", 0, True) = 0)
End Function

If Not IsListening() Then
  shell.Run "cmd /k cd /d """ & project & """ & npm start", 1, False
  For i = 1 To 40
    WScript.Sleep 500
    If IsListening() Then Exit For
  Next
End If

shell.Run "cmd /c start """" http://localhost:3000", 0, False
