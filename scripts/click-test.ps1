# Drives a real mouse click on the player's seek bar and reports the window
# before and after, to verify the overlay accepts clicks instead of letting
# them fall through to whatever is behind it.

param(
    [double]$SeekRatio = 0.6,
    [string]$Title = 'Cassette'
)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class M {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, IntPtr e);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    public struct RECT { public int Left, Top, Right, Bottom; }
    public const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004;
}
'@

$proc = Get-Process -Name electron -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$Title*" } |
    Select-Object -First 1
if ($null -eq $proc) { Write-Output "ERROR=window not found"; exit 1 }

[void][M]::SetForegroundWindow($proc.MainWindowHandle)
Start-Sleep -Milliseconds 500

$r = New-Object M+RECT
[void][M]::GetWindowRect($proc.MainWindowHandle, [ref]$r)
$w = $r.Right - $r.Left
$h = $r.Bottom - $r.Top

# Wake the controls: they auto-hide after a couple of idle seconds.
[void][M]::SetCursorPos(($r.Left + [int]($w * 0.5)), ($r.Top + $h - 120))
Start-Sleep -Milliseconds 300
[void][M]::SetCursorPos(($r.Left + [int]($w * 0.5)), ($r.Top + $h - 90))
Start-Sleep -Milliseconds 600

# The seek bar sits just above the button row, roughly 82px from the bottom.
$x = $r.Left + [int]($w * $SeekRatio)
$y = $r.Top + $h - 82

[void][M]::SetCursorPos($x, $y)
Start-Sleep -Milliseconds 400
Write-Output "CLICK_AT=$x,$y  (window $($r.Left),$($r.Top) ${w}x${h})"

[M]::mouse_event([M]::LEFTDOWN, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 90
[M]::mouse_event([M]::LEFTUP, 0, 0, 0, [IntPtr]::Zero)

Start-Sleep -Milliseconds 1500

# Capture the bottom strip so the timestamp is legible in the result.
$stripH = 150
$bmp = New-Object System.Drawing.Bitmap $w, $stripH
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, ($r.Top + $h - $stripH), 0, 0, (New-Object System.Drawing.Size $w, $stripH))
$g.Dispose()
$out = Join-Path $env:TEMP 'cassette-click.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output "SCREENSHOT=$out"
