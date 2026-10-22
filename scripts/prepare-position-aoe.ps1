param([Parameter(Mandatory=$true)][string]$SourceDirectory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$assetRoot=Join-Path $PSScriptRoot '../public/assets/position-aoe'
$iconRoot=Join-Path $PSScriptRoot '../public/assets/ui/upgrade/illustrations/skills'
New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null
function Ink($image,$rect){
  $left=$rect.Right;$top=$rect.Bottom;$right=$rect.Left;$bottom=$rect.Top
  for($y=$rect.Top;$y -lt $rect.Bottom;$y+=3){for($x=$rect.Left;$x -lt $rect.Right;$x+=3){
    if($image.GetPixel($x,$y).A -gt 24){$left=[Math]::Min($left,$x);$right=[Math]::Max($right,$x);$top=[Math]::Min($top,$y);$bottom=[Math]::Max($bottom,$y)}
  }}
  if($right -lt $left){return $rect}
  $left=[Math]::Max($rect.Left,$left-4);$top=[Math]::Max($rect.Top,$top-4)
  $right=[Math]::Min($rect.Right,$right+5);$bottom=[Math]::Min($rect.Bottom,$bottom+5)
  return [System.Drawing.Rectangle]::new($left,$top,$right-$left,$bottom-$top)
}
function Graphics($bitmap){
  $g=[System.Drawing.Graphics]::FromImage($bitmap)
  $g.CompositingMode=[System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g.Clear([System.Drawing.Color]::Transparent)
  return $g
}
foreach($entry in @(@{File='07-1.png';Name='abyss-vortex'},@{File='09-3.png';Name='recall-impact'},@{File='11-4.png';Name='spore-trail'})){
  $source=[System.Drawing.Bitmap]::new((Join-Path $SourceDirectory $entry.File))
  $atlas=[System.Drawing.Bitmap]::new(1024,512,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb);$g=Graphics $atlas
  try {
    for($i=0;$i -lt 8;$i++){
      $row=[int][Math]::Floor($i/4);$column=$i%4
      $top=if($row -eq 0){0}else{590};$height=if($row -eq 0){590}else{$source.Height-590}
      $rect=[System.Drawing.Rectangle]::new($column*362,$top,362,$height);$ink=Ink $source $rect
      $scale=240/[Math]::Max($ink.Width,$ink.Height);$w=[int]($ink.Width*$scale);$h=[int]($ink.Height*$scale)
      $target=[System.Drawing.Rectangle]::new($column*256+[int]((256-$w)/2),$row*256+[int]((256-$h)/2),$w,$h)
      $g.DrawImage($source,$target,$ink.X,$ink.Y,$ink.Width,$ink.Height,[System.Drawing.GraphicsUnit]::Pixel)
    }
    $atlas.Save((Join-Path $assetRoot ($entry.Name+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
  } finally {$g.Dispose();$atlas.Dispose();$source.Dispose()}
}
$source=[System.Drawing.Bitmap]::new((Join-Path $SourceDirectory '08-2.png'))
$atlas=[System.Drawing.Bitmap]::new(1536,512,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb);$g=Graphics $atlas
try {
  $rects=@(@(0,0,400,500),@(400,0,580,500),@(980,0,692,500),@(0,500,620,441),@(620,500,500,441),@(1120,500,552,441))
  for($i=0;$i -lt 6;$i++){
    $r=$rects[$i];$ink=Ink $source ([System.Drawing.Rectangle]::new($r[0],$r[1],$r[2],$r[3]))
    $scale=[Math]::Min(480/$ink.Width,232/$ink.Height);$w=[int]($ink.Width*$scale);$h=[int]($ink.Height*$scale)
    # Left-anchored beam: its bright emitter remains near the start of every frame.
    $target=[System.Drawing.Rectangle]::new(($i%3)*512+8,[int][Math]::Floor($i/3)*256+[int]((256-$h)/2),$w,$h)
    $g.DrawImage($source,$target,$ink.X,$ink.Y,$ink.Width,$ink.Height,[System.Drawing.GraphicsUnit]::Pixel)
  }
  $atlas.Save((Join-Path $assetRoot 'ice-radiance.png'),[System.Drawing.Imaging.ImageFormat]::Png)
} finally {$g.Dispose();$atlas.Dispose();$source.Dispose()}
$source=[System.Drawing.Bitmap]::new((Join-Path $SourceDirectory '四种绚彩魔法技能图标.png'))
try {
  for($i=0;$i -lt 4;$i++){
    $name=@('abyss-vortex','ice-radiance','spore-trail','tidal-recall')[$i]
    $ink=Ink $source ([System.Drawing.Rectangle]::new($i*543,0,543,724))
    $icon=[System.Drawing.Bitmap]::new(512,512,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb);$g=Graphics $icon
    try {
      $scale=480/[Math]::Max($ink.Width,$ink.Height);$w=[int]($ink.Width*$scale);$h=[int]($ink.Height*$scale)
      $g.DrawImage($source,([System.Drawing.Rectangle]::new([int]((512-$w)/2),[int]((512-$h)/2),$w,$h)),$ink.X,$ink.Y,$ink.Width,$ink.Height,[System.Drawing.GraphicsUnit]::Pixel)
      $icon.Save((Join-Path $iconRoot ($name+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
    } finally {$g.Dispose();$icon.Dispose()}
  }
} finally {$source.Dispose()}
Write-Output 'Prepared four movement-skill atlases and four skill icons.'
