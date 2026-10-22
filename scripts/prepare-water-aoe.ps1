param(
  [Parameter(Mandatory=$true)][string]$Pack,
  [Parameter(Mandatory=$true)][string]$Icons
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem
$assetRoot=Join-Path $PSScriptRoot '../public/assets/water-aoe'
$iconRoot=Join-Path $PSScriptRoot '../public/assets/ui/upgrade/illustrations/skills'
New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null
function Draw-Cell($graphics,$image,$source,$target) {
  $graphics.DrawImage($image,$target,$source.X,$source.Y,$source.Width,$source.Height,[System.Drawing.GraphicsUnit]::Pixel)
}
function New-Graphics($bitmap) {
  $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CompositingMode=[System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
  return $graphics
}
function Get-InkBounds($image,$rect) {
  $left=$rect.Right;$top=$rect.Bottom;$right=$rect.Left;$bottom=$rect.Top
  for($y=$rect.Top;$y -lt $rect.Bottom;$y+=3){for($x=$rect.Left;$x -lt $rect.Right;$x+=3){
    if($image.GetPixel($x,$y).A -gt 24){$left=[Math]::Min($left,$x);$right=[Math]::Max($right,$x);$top=[Math]::Min($top,$y);$bottom=[Math]::Max($bottom,$y)}
  }}
  if($right -lt $left){return $rect}
  $left=[Math]::Max($rect.Left,$left-4);$top=[Math]::Max($rect.Top,$top-4)
  $right=[Math]::Min($rect.Right,$right+5);$bottom=[Math]::Min($rect.Bottom,$bottom+5)
  return [System.Drawing.Rectangle]::new($left,$top,$right-$left,$bottom-$top)
}
$layouts=@(
  @{Name='azure-burst';Columns=4;Rows=4},
  @{Name='star-tide';Columns=4;Rows=2},
  @{Name='still-sea';Columns=1;Rows=1},
  @{Name='sea-sparkles';Columns=4;Rows=2},
  @{Name='returning-ring';Columns=4;Rows=2}
)
$archive=[System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Pack))
try {
  $entries=@($archive.Entries | Where-Object {$_.Name.EndsWith('.png')})
  if($entries.Count -ne 5){throw 'Expected five PNG assets.'}
  for($index=0;$index -lt $layouts.Count;$index++) {
    $layout=$layouts[$index];$stream=$entries[$index].Open()
    $source=[System.Drawing.Bitmap]::new($stream)
    $cell=if($layout.Columns -eq 1){512}else{256}
    $atlas=[System.Drawing.Bitmap]::new($cell*$layout.Columns,$cell*$layout.Rows,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics=New-Graphics $atlas
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      for($row=0;$row -lt $layout.Rows;$row++){for($column=0;$column -lt $layout.Columns;$column++){
        $left=[int][Math]::Round($column*$source.Width/$layout.Columns)
        $top=[int][Math]::Round($row*$source.Height/$layout.Rows)
        $right=[int][Math]::Round(($column+1)*$source.Width/$layout.Columns)
        $bottom=[int][Math]::Round(($row+1)*$source.Height/$layout.Rows)
        $rect=[System.Drawing.Rectangle]::new($left,$top,$right-$left,$bottom-$top)
        # Center the visible pixels, while keeping one scale across the sheet so growth is preserved.
        $ink=Get-InkBounds $source $rect
        $scale=($cell-16)/[Math]::Max($rect.Width,$rect.Height)
        $width=[int][Math]::Round($ink.Width*$scale);$height=[int][Math]::Round($ink.Height*$scale)
        Draw-Cell $graphics $source $ink ([System.Drawing.Rectangle]::new($column*$cell+[int](($cell-$width)/2),$row*$cell+[int](($cell-$height)/2),$width,$height))
      }}
      $atlas.Save((Join-Path $assetRoot ($layout.Name+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
    } finally {$graphics.Dispose();$atlas.Dispose();$source.Dispose();$stream.Dispose()}
  }
} finally {$archive.Dispose()}
$source=[System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $Icons).Path)
try {
  foreach($index in 0..3){
    $name=@('azure-burst','star-tide','still-sea','returning-ring')[$index]
    $icon=[System.Drawing.Bitmap]::new(512,512,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics=New-Graphics $icon
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      # Discard the source's large empty top/bottom margins without cutting the visible glows.
      Draw-Cell $graphics $source ([System.Drawing.Rectangle]::new($index*418,230,418,470)) ([System.Drawing.Rectangle]::new(47,21,418,470))
      $icon.Save((Join-Path $iconRoot ($name+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
    } finally {$graphics.Dispose();$icon.Dispose()}
  }
} finally {$source.Dispose()}
Write-Output 'Prepared five atlases and four transparent skill icons.'
