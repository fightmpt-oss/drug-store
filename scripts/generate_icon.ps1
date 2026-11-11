Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $projectRoot "assets"
if (-not (Test-Path $assetsDir)) {
    New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
}

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Draw-DrugStoreIcon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $s = [float]$size / 256.0

    # 1. Outer soft shadow for squircle
    $shadowPath = New-RoundedRectPath (14 * $s) (18 * $s) (228 * $s) (228 * $s) (54 * $s)
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(55, 6, 78, 59))
    $g.FillPath($shadowBrush, $shadowPath)
    $shadowBrush.Dispose()
    $shadowPath.Dispose()

    # 2. Main squircle background (Emerald -> Teal vibrant gradient)
    $bgRect = New-Object System.Drawing.RectangleF((12 * $s), (12 * $s), (232 * $s), (232 * $s))
    $bgPath = New-RoundedRectPath (12 * $s) (12 * $s) (232 * $s) (232 * $s) (54 * $s)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bgRect,
        [System.Drawing.Color]::FromArgb(255, 16, 185, 129), # #10B981 Emerald 500
        [System.Drawing.Color]::FromArgb(255, 4, 120, 87),   # #047857 Emerald 700
        45.0
    )
    $g.FillPath($bgBrush, $bgPath)

    # Subtle top glossy highlight on squircle
    $glossRect = New-Object System.Drawing.RectangleF((12 * $s), (12 * $s), (232 * $s), (120 * $s))
    $glossBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $glossRect,
        [System.Drawing.Color]::FromArgb(75, 255, 255, 255),
        [System.Drawing.Color]::FromArgb(0, 255, 255, 255),
        90.0
    )
    $g.SetClip($bgPath)
    $g.FillRectangle($glossBrush, $glossRect)
    $g.ResetClip()

    # Crisp inner border
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 167, 243, 208), (3.5 * $s))
    $g.DrawPath($borderPen, $bgPath)

    # 3. Modern Warehouse Roof / Isometric Cube Silhouette in White
    $roofPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(245, 255, 255, 255), (14 * $s))
    $roofPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $roofPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $roofPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $roofPoints = @(
        (New-Object System.Drawing.PointF((46 * $s), (112 * $s))),
        (New-Object System.Drawing.PointF((128 * $s), (52 * $s))),
        (New-Object System.Drawing.PointF((210 * $s), (112 * $s)))
    )
    $g.DrawLines($roofPen, $roofPoints)

    # Warehouse body card (white rounded card under the roof)
    $cardPath = New-RoundedRectPath (58 * $s) (102 * $s) (140 * $s) (108 * $s) (24 * $s)
    $cardShadowPath = New-RoundedRectPath (58 * $s) (107 * $s) (140 * $s) (108 * $s) (24 * $s)
    $cardShadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(45, 0, 0, 0))
    $g.FillPath($cardShadowBrush, $cardShadowPath)

    $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(250, 255, 255, 255))
    $g.FillPath($cardBrush, $cardPath)

    # 4. Bold Emerald Medical Cross inside the warehouse card
    $crossColor1 = [System.Drawing.Color]::FromArgb(255, 5, 150, 105)
    $crossColor2 = [System.Drawing.Color]::FromArgb(255, 13, 148, 136)
    $crossRect = New-Object System.Drawing.RectangleF((78 * $s), (118 * $s), (76 * $s), (76 * $s))
    $crossBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($crossRect, $crossColor1, $crossColor2, 45.0)

    $vBar = New-RoundedRectPath (103 * $s) (120 * $s) (26 * $s) (72 * $s) (8 * $s)
    $hBar = New-RoundedRectPath (80 * $s) (143 * $s) (72 * $s) (26 * $s) (8 * $s)
    $g.FillPath($crossBrush, $vBar)
    $g.FillPath($crossBrush, $hBar)

    # 5. Vibrant Capsule Pill Badge overlapping bottom-right
    $state = $g.Save()
    $g.TranslateTransform((176 * $s), (176 * $s))
    $g.RotateTransform(-35.0)

    # Pill outer shadow
    $pillShadow = New-RoundedRectPath (-28 * $s) (-50 * $s) (56 * $s) (104 * $s) (28 * $s)
    $pillShadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(65, 6, 78, 59))
    $g.FillPath($pillShadowBrush, $pillShadow)

    # Pill white base
    $pillOutline = New-RoundedRectPath (-26 * $s) (-52 * $s) (52 * $s) (100 * $s) (26 * $s)
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPath($whiteBrush, $pillOutline)

    # Top half of pill: bright lime-emerald
    $g.SetClip($pillOutline)
    $topHalfRect = New-Object System.Drawing.RectangleF((-28 * $s), (-54 * $s), (56 * $s), (52 * $s))
    $topPillBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $topHalfRect,
        [System.Drawing.Color]::FromArgb(255, 52, 211, 153),
        [System.Drawing.Color]::FromArgb(255, 5, 150, 105),
        90.0
    )
    $g.FillRectangle($topPillBrush, $topHalfRect)

    # Bottom half of pill: soft mint/white
    $botHalfRect = New-Object System.Drawing.RectangleF((-28 * $s), (-2 * $s), (56 * $s), (54 * $s))
    $botPillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 236, 253, 245))
    $g.FillRectangle($botPillBrush, $botHalfRect)
    $g.ResetClip()

    # Pill border
    $pillPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 4, 120, 87), (4.5 * $s))
    $g.DrawPath($pillPen, $pillOutline)

    # Pill specular highlight
    $specPath = New-RoundedRectPath (-15 * $s) (-40 * $s) (8 * $s) (28 * $s) (4 * $s)
    $specBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(140, 255, 255, 255))
    $g.FillPath($specBrush, $specPath)

    $g.Restore($state)

    $g.Dispose()
    return $bmp
}

function Convert-BitmapToIcoDib([System.Drawing.Bitmap]$bmp) {
    $w = $bmp.Width
    $h = $bmp.Height
    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)

    $andStride = [int][Math]::Ceiling($w / 32.0) * 4
    $xorSize = $w * $h * 4
    $andSize = $andStride * $h

    # BITMAPINFOHEADER (40 bytes)
    $bw.Write([uint32]40)           # biSize
    $bw.Write([int32]$w)            # biWidth
    $bw.Write([int32]($h * 2))      # biHeight (XOR + AND combined height)
    $bw.Write([uint16]1)            # biPlanes
    $bw.Write([uint16]32)           # biBitCount
    $bw.Write([uint32]0)            # biCompression (BI_RGB)
    $bw.Write([uint32]($xorSize + $andSize)) # biSizeImage
    $bw.Write([int32]0)             # biXPelsPerMeter
    $bw.Write([int32]0)             # biYPelsPerMeter
    $bw.Write([uint32]0)            # biClrUsed
    $bw.Write([uint32]0)            # biClrImportant

    # XOR Mask: bottom-up BGRA pixels
    for ($y = $h - 1; $y -ge 0; $y--) {
        for ($x = 0; $x -lt $w; $x++) {
            $c = $bmp.GetPixel($x, $y)
            $bw.Write([byte]$c.B)
            $bw.Write([byte]$c.G)
            $bw.Write([byte]$c.R)
            $bw.Write([byte]$c.A)
        }
    }

    # AND Mask: bottom-up 1bpp transparency mask padded to 32-bit boundaries
    for ($y = $h - 1; $y -ge 0; $y--) {
        $rowBytes = New-Object byte[] $andStride
        for ($x = 0; $x -lt $w; $x++) {
            $c = $bmp.GetPixel($x, $y)
            if ($c.A -lt 128) {
                $byteIndex = [int][Math]::Floor($x / 8)
                $bitIndex = 7 - ($x % 8)
                $rowBytes[$byteIndex] = $rowBytes[$byteIndex] -bor (1 -shl $bitIndex)
            }
        }
        $bw.Write($rowBytes)
    }

    $bw.Flush()
    $arr = $ms.ToArray()
    $bw.Close()
    $ms.Dispose()
    return $arr
}

$sizes = @(256, 64, 48, 32, 16)
$frameBuffers = @()

foreach ($sz in $sizes) {
    $bmp = Draw-DrugStoreIcon $sz
    if ($sz -eq 256) {
        $previewPath = Join-Path $assetsDir "drug-store-preview.png"
        $bmp.Save($previewPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $frameBuffers += ,($ms.ToArray())
        $ms.Dispose()
    } else {
        $dib = Convert-BitmapToIcoDib $bmp
        $frameBuffers += ,$dib
    }
    $bmp.Dispose()
}

function Write-MultiSizeIco([string]$icoPath, [int[]]$sizes, [byte[][]]$buffers) {
    $fs = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
    $bw = New-Object System.IO.BinaryWriter($fs)

    # ICONDIR Header (6 bytes)
    $bw.Write([uint16]0)             # Reserved
    $bw.Write([uint16]1)             # Type: 1 = ICO
    $bw.Write([uint16]$sizes.Count)  # Count

    $offset = 6 + (16 * $sizes.Count)

    # ICONDIRENTRY (16 bytes each)
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $sz = $sizes[$i]
        $buf = $buffers[$i]
        $wByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }
        $hByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }

        $bw.Write($wByte)                 # Width
        $bw.Write($hByte)                 # Height
        $bw.Write([byte]0)                # ColorCount
        $bw.Write([byte]0)                # Reserved
        $bw.Write([uint16]1)              # Planes
        $bw.Write([uint16]32)             # BitCount
        $bw.Write([uint32]$buf.Length)    # BytesInRes
        $bw.Write([uint32]$offset)        # ImageOffset
        $offset += $buf.Length
    }

    # Image data
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $bw.Write($buffers[$i])
    }

    $bw.Flush()
    $bw.Close()
    $fs.Close()
}

$icoAssetPath = Join-Path $assetsDir "drug-store.ico"
$icoRootPath = Join-Path $projectRoot "drug-store.ico"
$icoPublicPath = Join-Path $projectRoot "frontend\public\drug-store.ico"

Write-MultiSizeIco $icoAssetPath $sizes $frameBuffers
Copy-Item $icoAssetPath $icoRootPath -Force
if (Test-Path (Join-Path $projectRoot "frontend\public")) {
    Copy-Item $icoAssetPath $icoPublicPath -Force
}

Write-Output "Generated DIB+PNG Windows ICO successfully: $icoRootPath"
