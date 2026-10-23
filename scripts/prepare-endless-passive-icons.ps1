param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$iconRoot=Join-Path $PSScriptRoot '../public/assets/ui/upgrade/illustrations/relics'
$names=@('steady-cannon','fleet-contract','far-lens','heavy-ammo','last-stand','elite-hunter','rest-supply','vital-contract')
$sourceImage=[Drawing.Bitmap]::new((Resolve-Path -LiteralPath $Source).Path)
try {
  # Extract the supplied 4x2 atlas without recoloring, background removal or resampling.
  for($i=0;$i -lt $names.Count;$i++){
    $col=$i%4;$row=[int][Math]::Floor($i/4)
    $left=[int][Math]::Floor($col*$sourceImage.Width/4);$right=[int][Math]::Floor(($col+1)*$sourceImage.Width/4)
    $top=[int][Math]::Floor($row*$sourceImage.Height/2);$bottom=[int][Math]::Floor(($row+1)*$sourceImage.Height/2)
    $rect=[Drawing.Rectangle]::new($left,$top,$right-$left,$bottom-$top)
    $crop=$sourceImage.Clone($rect,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {$crop.Save((Join-Path $iconRoot ($names[$i]+'.png')),[Drawing.Imaging.ImageFormat]::Png)}finally{$crop.Dispose()}
  }
}finally{$sourceImage.Dispose()}
Write-Output 'Extracted eight transparent Endless icons from the supplied atlas.'
