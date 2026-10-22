param([string]$Source='C:\Users\Administrator\Downloads\三重冰蓝魔法图标.png', [ValidateSet('all','tsunami-sanctuary','astral-wheel','abyss-crown')][string]$Only='all')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$iconRoot=Join-Path $PSScriptRoot '../public/assets/ui/upgrade/illustrations/skills'
$sourceImage=[System.Drawing.Bitmap]::new($Source)
try {
  $names=@('tsunami-sanctuary','astral-wheel','abyss-crown')
  for($i=0;$i -lt 3;$i++){
    if($Only -ne 'all' -and $Only -ne $names[$i]){continue}
    # The center illustration is not confined to an equal-width cell. Exclude
    # the left illustration's bright rim while retaining the wheel's right tip.
    $left=if($i -eq 1){742}else{$i*700}
    $limit=if($i -eq 1){1408}else{$left+700}
    $top=$sourceImage.Height;$right=$left;$bottom=0;$first=$limit
    for($y=0;$y -lt $sourceImage.Height;$y+=2){for($x=$left;$x -lt $limit;$x+=2){
      if($sourceImage.GetPixel($x,$y).A -gt 24){$first=[Math]::Min($first,$x);$right=[Math]::Max($right,$x);$top=[Math]::Min($top,$y);$bottom=[Math]::Max($bottom,$y)}
    }}
    $first=[Math]::Max($left,$first-3);$right=[Math]::Min($limit,$right+4)
    $top=[Math]::Max(0,$top-3);$bottom=[Math]::Min($sourceImage.Height,$bottom+4)
    $width=$right-$first;$height=$bottom-$top;$scale=480/[Math]::Max($width,$height)
    $bitmap=[System.Drawing.Bitmap]::new(512,512,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g=[System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $g.Clear([System.Drawing.Color]::Transparent)
      $g.CompositingMode=[System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $w=[int]($width*$scale);$h=[int]($height*$scale)
      $g.DrawImage($sourceImage,([System.Drawing.Rectangle]::new([int]((512-$w)/2),[int]((512-$h)/2),$w,$h)),$first,$top,$width,$height,[System.Drawing.GraphicsUnit]::Pixel)
      $bitmap.Save((Join-Path $iconRoot ($names[$i]+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
    } finally {$g.Dispose();$bitmap.Dispose()}
  }
} finally {$sourceImage.Dispose()}
Write-Output "Prepared transparent water evolution icons: $Only."
