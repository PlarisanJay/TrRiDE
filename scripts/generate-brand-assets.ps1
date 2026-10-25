# Generates every TriRide icon/splash asset from the master tricycle mark.
#
# The source artwork (assets/tricycle-icon.png) is a pure-white tricycle
# silhouette on a transparent canvas. White-on-transparent is invisible on a
# white launcher / splash background, which is why the built APK looked blank.
# This script re-tints the mark and composites it onto the brand blue so the
# icon is always visible.
#
# Run from the project root:
#   powershell -ExecutionPolicy Bypass -File scripts/generate-brand-assets.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $projectRoot 'assets'
$sourcePath = Join-Path $assetsDir 'tricycle-icon.png'

$brandDark = [System.Drawing.Color]::FromArgb(255, 10, 61, 145)   # #0A3D91
$brandLight = [System.Drawing.Color]::FromArgb(255, 47, 95, 224)  # #2F5FE0
$white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)

function Set-HighQuality([System.Drawing.Graphics]$g) {
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
}

function Get-AlphaBounds([System.Drawing.Bitmap]$bmp) {
  $rect = New-Object System.Drawing.Rectangle 0, 0, $bmp.Width, $bmp.Height
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $bmp.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $bmp.UnlockBits($data)

  $minX = $bmp.Width; $minY = $bmp.Height; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $bmp.Height; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $bmp.Width; $x++) {
      if ($bytes[$row + ($x * 4) + 3] -gt 8) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  return New-Object System.Drawing.Rectangle $minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1)
}

function New-TintedBitmap([System.Drawing.Bitmap]$bmp, [System.Drawing.Color]$color) {
  $copy = [System.Drawing.Bitmap]::new($bmp.Width, $bmp.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($copy)
  $g.Clear([System.Drawing.Color]::Transparent)
  Set-HighQuality $g
  $g.DrawImage($bmp, 0, 0, $bmp.Width, $bmp.Height)
  $g.Dispose()

  $rect = New-Object System.Drawing.Rectangle 0, 0, $copy.Width, $copy.Height
  $data = $copy.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $copy.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)

  for ($y = 0; $y -lt $copy.Height; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $copy.Width; $x++) {
      $i = $row + ($x * 4)
      if ($bytes[$i + 3] -gt 0) {
        # BGRA order.
        $bytes[$i] = $color.B
        $bytes[$i + 1] = $color.G
        $bytes[$i + 2] = $color.R
      }
    }
  }

  [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
  $copy.UnlockBits($data)
  return $copy
}

function New-Canvas([int]$width, [int]$height) {
  $bmp = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  Set-HighQuality $g
  return @{ Bitmap = $bmp; Graphics = $g }
}

function Add-BrandGradient([System.Drawing.Graphics]$g, [int]$x, [int]$y, [int]$w, [int]$h, $clipPath) {
  $rect = New-Object System.Drawing.Rectangle $x, $y, $w, $h
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $brandDark, $brandLight, 45.0
  if ($clipPath) {
    $g.SetClip($clipPath)
    $g.FillRectangle($brush, $rect)
    $g.ResetClip()
  } else {
    $g.FillRectangle($brush, $rect)
  }
  $brush.Dispose()
}

function New-RoundedPath([int]$x, [int]$y, [int]$w, [int]$h, [int]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Add-Artwork([System.Drawing.Graphics]$g, [System.Drawing.Bitmap]$art, [System.Drawing.Rectangle]$bounds, [int]$canvasW, [int]$canvasH, [double]$widthRatio, [double]$offsetY = 0, [int]$areaX = 0, [int]$areaY = 0, [int]$areaW = 0, [int]$areaH = 0) {
  if ($areaW -le 0) { $areaW = $canvasW; $areaX = 0 }
  if ($areaH -le 0) { $areaH = $canvasH; $areaY = 0 }

  $targetW = [int]($areaW * $widthRatio)
  $targetH = [int]($targetW * $bounds.Height / $bounds.Width)
  $x = [int]($areaX + (($areaW - $targetW) / 2))
  $y = [int]($areaY + (($areaH - $targetH) / 2) + $offsetY)
  $dest = New-Object System.Drawing.Rectangle $x, $y, $targetW, $targetH
  $g.DrawImage($art, $dest, $bounds, [System.Drawing.GraphicsUnit]::Pixel)
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$name) {
  $path = Join-Path $assetsDir $name
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host ("wrote {0} ({1}x{2})" -f $name, $bmp.Width, $bmp.Height)
}

if (-not (Test-Path $sourcePath)) { throw "Missing source artwork: $sourcePath" }

$source = [System.Drawing.Bitmap]::FromFile($sourcePath)
$sourceBounds = Get-AlphaBounds $source
$whiteArt = New-TintedBitmap $source $white
$source.Dispose()

# ---------------------------------------------------------------- app icon
# Full-bleed 1024px launcher icon: brand gradient + white tricycle.
$c = New-Canvas 1024 1024
Add-BrandGradient $c.Graphics 0 0 1024 1024 $null
Add-Artwork $c.Graphics $whiteArt $sourceBounds 1024 1024 0.74 6
$c.Graphics.Dispose()
Save-Png $c.Bitmap 'icon.png'
Save-Png $c.Bitmap 'tricycle-logo.png'
$c.Bitmap.Dispose()

# ------------------------------------------------------- android adaptive icon
$c = New-Canvas 512 512
Add-BrandGradient $c.Graphics 0 0 512 512 $null
$c.Graphics.Dispose()
Save-Png $c.Bitmap 'android-icon-background.png'
$c.Bitmap.Dispose()

$c = New-Canvas 512 512
Add-Artwork $c.Graphics $whiteArt $sourceBounds 512 512 0.63 2
$c.Graphics.Dispose()
Save-Png $c.Bitmap 'android-icon-foreground.png'
$c.Bitmap.Dispose()

$c = New-Canvas 432 432
Add-Artwork $c.Graphics $whiteArt $sourceBounds 432 432 0.63 2
$c.Graphics.Dispose()
Save-Png $c.Bitmap 'android-icon-monochrome.png'
$c.Bitmap.Dispose()

# ------------------------------------------------------------- splash screen
# Rounded brand tile with the white tricycle, on a transparent canvas so the
# native splash background colour shows around it.
$c = New-Canvas 1024 1024
$tile = New-RoundedPath 72 72 880 880 200
Add-BrandGradient $c.Graphics 72 72 880 880 $tile
Add-Artwork $c.Graphics $whiteArt $sourceBounds 1024 1024 0.70 4 72 72 880 880
$tile.Dispose()
$c.Graphics.Dispose()
Save-Png $c.Bitmap 'splash-icon.png'
$c.Bitmap.Dispose()

# ------------------------------------------------------------ notification icon
# Android status-bar icons must be white-on-transparent.
$c = New-Canvas 96 96
Add-Artwork $c.Graphics $whiteArt $sourceBounds 96 96 0.88 0
$c.Graphics.Dispose()
Save-Png $c.Bitmap 'notification-icon.png'
$c.Bitmap.Dispose()

# ------------------------------------------------------------------- favicon
$c = New-Canvas 48 48
Add-BrandGradient $c.Graphics 0 0 48 48 $null
Add-Artwork $c.Graphics $whiteArt $sourceBounds 48 48 0.84 0
$c.Graphics.Dispose()
Save-Png $c.Bitmap 'favicon.png'
$c.Bitmap.Dispose()

$whiteArt.Dispose()
Write-Host 'Done.'
