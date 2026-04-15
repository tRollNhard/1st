# Generates a 256x256 PNG icon with a neon gradient + stylized "N",
# then converts it to a multi-size .ico via System.Drawing.
# Run from the visualization/ folder: powershell -ExecutionPolicy Bypass -File build/make-icon.ps1
Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Black rounded-square background
$g.Clear([System.Drawing.Color]::Black)

# Radial neon gradient — magenta → cyan → yellow
$rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddEllipse($rect)
$brush = New-Object System.Drawing.Drawing2D.PathGradientBrush $path
$brush.CenterPoint = New-Object System.Drawing.PointF ($size / 2), ($size / 2)
$brush.CenterColor = [System.Drawing.Color]::FromArgb(255, 255, 0, 229)    # magenta
$brush.SurroundColors = @([System.Drawing.Color]::FromArgb(255, 0, 240, 255))  # cyan
$g.FillEllipse($brush, $rect)

# Outer dark ring
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 0, 0, 0)), 6
$g.DrawEllipse($pen, 4, 4, $size - 8, $size - 8)

# Stylized "N" — thick stroke, neon cyan glow
$fontFamily = New-Object System.Drawing.FontFamily "Segoe UI Black"
$font = New-Object System.Drawing.Font $fontFamily, 140, ([System.Drawing.FontStyle]::Bold)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$textRect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
# Glow halo
$halo = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(120, 0, 240, 255))
for ($o = 8; $o -ge 2; $o -= 2) {
    $r = New-Object System.Drawing.RectangleF ([float]$o), ([float]$o), ([float]($size - $o*2)), ([float]($size - $o*2))
    $g.DrawString("N", $font, $halo, $r, $sf)
}
# Core letter
$core = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$g.DrawString("N", $font, $core, $textRect, $sf)

# Save 256 PNG
$pngPath = Join-Path $PSScriptRoot "icon.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Build multi-size .ico (16, 32, 48, 64, 128, 256)
$icoPath = Join-Path $PSScriptRoot "icon.ico"
$sizes = 16, 32, 48, 64, 128, 256

$ms = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $ms
# ICONDIR
$writer.Write([uint16]0)           # reserved
$writer.Write([uint16]1)           # type = icon
$writer.Write([uint16]$sizes.Count) # count

$imageBlobs = @()
$offset = 6 + (16 * $sizes.Count) # header + entries
foreach ($s in $sizes) {
    $scaled = New-Object System.Drawing.Bitmap $bmp, $s, $s
    $imgStream = New-Object System.IO.MemoryStream
    $scaled.Save($imgStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $imgStream.ToArray()
    $imageBlobs += ,$bytes

    # ICONDIRENTRY
    $w = if ($s -eq 256) { 0 } else { $s }
    $h = if ($s -eq 256) { 0 } else { $s }
    $writer.Write([byte]$w)
    $writer.Write([byte]$h)
    $writer.Write([byte]0)           # color count
    $writer.Write([byte]0)           # reserved
    $writer.Write([uint16]1)         # planes
    $writer.Write([uint16]32)        # bpp
    $writer.Write([uint32]$bytes.Length)
    $writer.Write([uint32]$offset)
    $offset += $bytes.Length

    $scaled.Dispose()
    $imgStream.Dispose()
}
foreach ($bytes in $imageBlobs) { $writer.Write($bytes) }
$writer.Flush()

[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$writer.Dispose()
$ms.Dispose()
$g.Dispose()
$bmp.Dispose()

Write-Host "Icon written: $icoPath ($((Get-Item $icoPath).Length) bytes)"
Write-Host "Preview PNG: $pngPath"
