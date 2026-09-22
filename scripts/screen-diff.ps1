# Captures the primary screen twice and reports how much changed between the
# two frames, plus how colourful the second frame is.
#
# Used to verify that mpv is actually painting video into its window: moving
# video changes a large share of pixels between captures, while a black or
# static window changes almost none.

param(
    [int]$DelayMs = 1200,
    [string]$OutDir = $env:TEMP
)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

function Get-Shot {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $gfx.Dispose()
    return $bmp
}

$a = Get-Shot
Start-Sleep -Milliseconds $DelayMs
$b = Get-Shot

$w = $a.Width
$h = $a.Height
$step = 8
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

$shotPath = Join-Path $OutDir 'mnf-screen.png'
$b.Save($shotPath, [System.Drawing.Imaging.ImageFormat]::Png)

$a.Dispose()
$b.Dispose()

$pct = [Math]::Round(100.0 * $changed / $total, 2)
$lum = [Math]::Round($sumLum / $total, 1)

Write-Output "SAMPLED=$total"
Write-Output "CHANGED_PCT=$pct"
Write-Output "DISTINCT_COLORS=$($colors.Count)"
Write-Output "MEAN_LUMINANCE=$lum"
Write-Output "SCREENSHOT=$shotPath"
