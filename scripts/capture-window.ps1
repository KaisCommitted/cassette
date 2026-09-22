# Brings the Cassette window to the front and captures only its rectangle,
# twice, reporting how much changed between the two frames.
#
# Scoped to the app window on purpose: a full-screen grab would capture
# whatever else the user has open.

param(
    [string]$Title = 'Cassette',
    [int]$DelayMs = 1200,
    [string]$OutPath = (Join-Path $env:TEMP 'cassette-window.png')
)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll", CharSet=CharSet.Unicode)]
    public static extern IntPtr FindWindow(string cls, string name);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    public struct RECT { public int Left, Top, Right, Bottom; }
}
'@

# Resolved through the process list rather than FindWindow: Electron's window
# class and exact title are not reliable to match on.
$proc = Get-Process -Name electron -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$Title*" } |
    Select-Object -First 1

if ($null -eq $proc) {
    Write-Output "ERROR=window '$Title' not found"
    exit 1
}
$hwnd = $proc.MainWindowHandle

[void][Win32]::ShowWindow($hwnd, 9)   # SW_RESTORE
[void][Win32]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 700

$rect = New-Object Win32+RECT
[void][Win32]::GetWindowRect($hwnd, [ref]$rect)
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
if ($w -le 0 -or $h -le 0) {
    Write-Output "ERROR=bad window rect"
    exit 1
}

function Get-Shot($x, $y, $w, $h) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size $w, $h))
    $gfx.Dispose()
    return $bmp
}

$a = Get-Shot $rect.Left $rect.Top $w $h
Start-Sleep -Milliseconds $DelayMs
$b = Get-Shot $rect.Left $rect.Top $w $h

$step = 6
$total = 0
$changed = 0
$colors = New-Object 'System.Collections.Generic.HashSet[int]'
$sumLum = 0.0

for ($y = 0; $y -lt $h; $y += $step) {
    for ($x = 0; $x -lt $w; $x += $step) {
        $pa = $a.GetPixel($x, $y)
        $pb = $b.GetPixel($x, $y)
        $total++
        $d = [Math]::Abs($pa.R - $pb.R) + [Math]::Abs($pa.G - $pb.G) + [Math]::Abs($pa.B - $pb.B)
        if ($d -gt 24) { $changed++ }
        [void]$colors.Add(($pb.R -shr 3) * 1024 + ($pb.G -shr 3) * 32 + ($pb.B -shr 3))
        $sumLum += (0.2126 * $pb.R + 0.7152 * $pb.G + 0.0722 * $pb.B)
    }
}

$b.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$a.Dispose()
$b.Dispose()

Write-Output "WINDOW_RECT=$($rect.Left),$($rect.Top) ${w}x${h}"
Write-Output "SAMPLED=$total"
Write-Output "CHANGED_PCT=$([Math]::Round(100.0 * $changed / $total, 2))"
Write-Output "DISTINCT_COLORS=$($colors.Count)"
Write-Output "MEAN_LUMINANCE=$([Math]::Round($sumLum / $total, 1))"
Write-Output "SCREENSHOT=$OutPath"
