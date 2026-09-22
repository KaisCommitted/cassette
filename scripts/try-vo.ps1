# Launches the app once per mpv video-output configuration, captures the app
# window, and reports whether the picture actually reached the screen.
#
# Playback is muted and placed on a non-primary display (CASSETTE_TEST=1).

param(
    [string[]]$Modes = @('noflip', 'direct3d', 'opengl', 'angle', 'sw'),
    [int]$WarmupSeconds = 12
)

$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$capture = Join-Path $PSScriptRoot 'capture-window.ps1'

if (Test-Path Env:ELECTRON_RUN_AS_NODE) { Remove-Item Env:ELECTRON_RUN_AS_NODE }
$env:CASSETTE_TEST = '1'
$env:CASSETTE_AUTOPLAY = '1'

foreach ($mode in $Modes) {
    Get-Process -Name electron, mpv -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1

    $env:CASSETTE_MPV_VO = $mode
    # The project path contains spaces, so the argument must be quoted or
    # Electron never starts and every capture finds no window.
    Start-Process -FilePath $electron -ArgumentList "`"$root`"" -WorkingDirectory $root
    Start-Sleep -Seconds $WarmupSeconds

    $out = Join-Path $env:TEMP "cassette-vo-$mode.png"
    $result = (& $capture -OutPath $out 2>&1) -join "`n"

    function Field($name, $text) {
        $m = [regex]::Match($text, "$name=(.*)")
        if ($m.Success) { return $m.Groups[1].Value.Trim() } else { return 'n/a' }
    }

    Write-Output ("VO={0} CHANGED={1} LUM={2} COLORS={3} SHOT={4}" -f `
        $mode, (Field 'CHANGED_PCT' $result), (Field 'MEAN_LUMINANCE' $result), `
        (Field 'DISTINCT_COLORS' $result), $out)
}

Get-Process -Name electron, mpv -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Output 'DONE'
