param([string]$Source='C:\Users\Administrator\Downloads\四象元素魔法技能图标.png')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$iconRoot=Join-Path $PSScriptRoot '../public/assets/ui/upgrade/illustrations/skills'
$sourceImage=[System.Drawing.Bitmap]::new($Source)
try {
  # The footprints and vortex overlap equal-width cells. Follow the transparent
  # valley between their contours per row instead of importing a neighbor's rim.
  $seam=New-Object int[] $sourceImage.Height
  for($y=0;$y -lt $sourceImage.Height;$y++){
    $best=1e9;$seam[$y]=558
    for($x=540;$x -lt 576;$x++){
      $score=$sourceImage.GetPixel($x,$y).A+[Math]::Abs($x-558)*0.01
      if($score -lt $best){$best=$score;$seam[$y]=$x}
    }
  }
  $entries=@(@{Name='undertow-pyre';Left=0;Right=576},@{Name='deep-collapse';Left=540;Right=1076},@{Name='frost-prism';Left=1076;Right=1607},@{Name='all-tides';Left=1607;Right=2172})
  for($i=0;$i -lt $entries.Count;$i++){
    $entry=$entries[$i];$rect=[Drawing.Rectangle]::new($entry.Left,0,$entry.Right-$entry.Left,$sourceImage.Height)
    $crop=$sourceImage.Clone($rect,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      if($i -lt 2){for($y=0;$y -lt $crop.Height;$y++){for($x=0;$x -lt $crop.Width;$x++){
        $globalX=$x+$entry.Left
        if(($i -eq 0 -and $globalX -ge $seam[$y]) -or ($i -eq 1 -and $globalX -lt $seam[$y])){$crop.SetPixel($x,$y,[Drawing.Color]::Transparent)}
      }}}
      $left=$crop.Width;$right=0;$top=$crop.Height;$bottom=0
      for($y=0;$y -lt $crop.Height;$y+=2){for($x=0;$x -lt $crop.Width;$x+=2){
        if($crop.GetPixel($x,$y).A -gt 24){$left=[Math]::Min($left,$x);$right=[Math]::Max($right,$x);$top=[Math]::Min($top,$y);$bottom=[Math]::Max($bottom,$y)}
      }}
      $left=[Math]::Max(0,$left-3);$right=[Math]::Min($crop.Width,$right+4);$top=[Math]::Max(0,$top-3);$bottom=[Math]::Min($crop.Height,$bottom+4)
      $width=$right-$left;$height=$bottom-$top;$scale=480/[Math]::Max($width,$height)
      $bitmap=[Drawing.Bitmap]::new(512,512,[Drawing.Imaging.PixelFormat]::Format32bppArgb);$g=[Drawing.Graphics]::FromImage($bitmap)
      try {
        $g.Clear([Drawing.Color]::Transparent);$g.CompositingMode=[Drawing.Drawing2D.CompositingMode]::SourceCopy
        $g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $w=[int]($width*$scale);$h=[int]($height*$scale)
        $g.DrawImage($crop,([Drawing.Rectangle]::new([int]((512-$w)/2),[int]((512-$h)/2),$w,$h)),$left,$top,$width,$height,[Drawing.GraphicsUnit]::Pixel)
        $bitmap.Save((Join-Path $iconRoot ($entry.Name+'.png')),[Drawing.Imaging.ImageFormat]::Png)
      } finally {$g.Dispose();$bitmap.Dispose()}
    } finally {$crop.Dispose()}
  }
} finally {$sourceImage.Dispose()}
Write-Output 'Prepared four transparent elemental combination icons.'
