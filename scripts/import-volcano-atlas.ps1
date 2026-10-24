param(
  [string]$ProjectRoot = (Split-Path $PSScriptRoot -Parent)
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
# This deterministic importer copies original RGBA bytes, never redraws the sprites.
# Core alpha is used only for ownership seeds; every nonzero source-alpha pixel survives.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
public static class VolcanoPixelOwnership {
 public static int[] Assign(byte[] source,int w,int h,int stride,int[][] bodies) {
  var owner=new int[w*h];var queue=new int[w*h];int head=0,tail=0;
  for(int id=0;id<bodies.Length;id++) {
   var r=bodies[id];
   for(int y=r[1];y<r[3];y++)for(int x=r[0];x<r[2];x++) {
    int p=y*w+x;if(source[y*stride+x*4+3]<128)continue;
    if(owner[p]!=0)throw new Exception("Overlapping body seeds");
    owner[p]=id+1;queue[tail++]=p;
   }
  }
  while(head<tail) {
   int p=queue[head++],x=p%w,y=p/w;
   for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++) {
    int nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;
    int n=ny*w+nx;
    if(owner[n]!=0||source[ny*stride+nx*4+3]==0)continue;
    owner[n]=owner[p];queue[tail++]=n;
   }
  }
  // Detached sparks/pebbles stay whole; assign each component to its nearest body.
  for(int p=0;p<w*h;p++) {
   if(owner[p]!=0||source[p/w*stride+p%w*4+3]==0)continue;
   head=0;tail=1;queue[0]=p;owner[p]=-1;long sumX=0,sumY=0;
   while(head<tail) {
    int n=queue[head++],x=n%w,y=n/w;sumX+=x;sumY+=y;
    for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++) {
     int nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;
     int q=ny*w+nx;if(owner[q]!=0||source[ny*stride+nx*4+3]==0)continue;
     owner[q]=-1;queue[tail++]=q;
    }
   }
   double cx=(double)sumX/tail,cy=(double)sumY/tail,best=double.MaxValue;int chosen=0;
   for(int id=0;id<bodies.Length;id++) {
    var r=bodies[id];double dx=Math.Max(Math.Max(r[0]-cx,0),cx-(r[2]-1)),dy=Math.Max(Math.Max(r[1]-cy,0),cy-(r[3]-1));
    double distance=dx*dx+dy*dy;if(distance<best){best=distance;chosen=id+1;}
   }
   for(int j=0;j<tail;j++)owner[queue[j]]=chosen;
  }
  return owner;
 }
 public static int[][] Bounds(int[] owner,int w,int h,int count) {
  var result=new int[count][];for(int i=0;i<count;i++)result[i]=new int[]{w,h,0,0,0};
  for(int p=0;p<owner.Length;p++)if(owner[p]>0){var r=result[owner[p]-1];int x=p%w,y=p/w;r[0]=Math.Min(r[0],x);r[1]=Math.Min(r[1],y);r[2]=Math.Max(r[2],x+1);r[3]=Math.Max(r[3],y+1);r[4]++;}
  return result;
 }
 public static byte[] Extract(byte[] source,int stride,int w,int[] owner,int id,int[] r,int pad) {
  int cw=r[2]-r[0]+pad*2,ch=r[3]-r[1]+pad*2;var output=new byte[cw*ch*4];
  for(int y=r[1];y<r[3];y++)for(int x=r[0];x<r[2];x++)if(owner[y*w+x]==id){
   int from=y*stride+x*4,to=((y-r[1]+pad)*cw+x-r[0]+pad)*4;
   Array.Copy(source,from,output,to,4);
  }
  return output;
 }
 public static void Blit(byte[] source,int w,int h,byte[] target,int targetWidth,int x,int y) {
  for(int row=0;row<h;row++)Array.Copy(source,row*w*4,target,((y+row)*targetWidth+x)*4,w*4);
 }
 public static int Audit(byte[] source,int stride,int w,int h,int[] owner,int id,int[] r,int pad,byte[] decoded,int decodedStride) {
  int cw=r[2]-r[0]+pad*2,ch=r[3]-r[1]+pad*2,bad=0;
  for(int y=0;y<ch;y++)for(int x=0;x<cw;x++) {
   int sx=r[0]+x-pad,sy=r[1]+y-pad,to=y*decodedStride+x*4;
   bool belongs=sx>=0&&sy>=0&&sx<w&&sy<h&&owner[sy*w+sx]==id;
   if(!belongs){if(decoded[to+3]!=0)bad++;continue;}
   int from=sy*stride+sx*4;
   for(int c=0;c<4;c++)if(source[from+c]!=decoded[to+c]){bad++;break;}
  }
  return bad;
 }
}
'@
function Save-Rgba([byte[]]$Pixels,[int]$Width,[int]$Height,[string]$Path) {
  $bitmap=[Drawing.Bitmap]::new($Width,$Height,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $locked=$bitmap.LockBits([Drawing.Rectangle]::new(0,0,$Width,$Height),[Drawing.Imaging.ImageLockMode]::WriteOnly,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {[Runtime.InteropServices.Marshal]::Copy($Pixels,0,$locked.Scan0,$Pixels.Length)} finally {$bitmap.UnlockBits($locked)}
    $bitmap.Save($Path,[Drawing.Imaging.ImageFormat]::Png)
  } finally {$bitmap.Dispose()}
}
$inputFile=Join-Path $ProjectRoot 'docs/assets/lava-volcano/lava-volcano-reference.png'
$sourceHash=(Get-FileHash $inputFile -Algorithm SHA256).Hash
if($sourceHash -ne 'E9FCED25FC02B3901CC5D096B8E5A5D4F61060C484BF9BF8804D3E31713D92D4'){throw 'Source atlas changed; review the 22 ownership seeds before importing'}
$design=Get-Content -Raw (Join-Path $ProjectRoot 'docs/assets/lava-volcano/segmentation-design.json') | ConvertFrom-Json
$destination=Join-Path $ProjectRoot 'public/assets/scenery/volcano'
[IO.Directory]::CreateDirectory($destination) | Out-Null
$image=[Drawing.Bitmap]::new($inputFile)
try {
  $width=$image.Width;$height=$image.Height
  $locked=$image.LockBits([Drawing.Rectangle]::new(0,0,$width,$height),[Drawing.Imaging.ImageLockMode]::ReadOnly,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $pixels=[byte[]]::new($locked.Stride*$height);$stride=$locked.Stride
  try {[Runtime.InteropServices.Marshal]::Copy($locked.Scan0,$pixels,0,$pixels.Length)} finally {$image.UnlockBits($locked)}
} finally {$image.Dispose()}
$bodies=[int[][]]@($design.assets | ForEach-Object { ,[int[]]$_.bodyBounds })
$ownership=[VolcanoPixelOwnership]::Assign($pixels,$width,$height,$stride,$bodies)
$bounds=[VolcanoPixelOwnership]::Bounds($ownership,$width,$height,22)
$atlasWidth=2048;$pad=4;$x=0;$y=0;$rowHeight=0
$records=@();$images=@()
# Tallest-first shelves keep the 22 full-resolution sprites in a 2048x1024 atlas.
$order=0..21 | Sort-Object { -($bounds[$_][3]-$bounds[$_][1]) }
foreach($i in $order) {
  $asset=$design.assets[$i];$r=$bounds[$i]
  $cw=$r[2]-$r[0]+$pad*2;$ch=$r[3]-$r[1]+$pad*2
  if($x+$cw -gt $atlasWidth){$x=0;$y+=$rowHeight;$rowHeight=0}
  $data=[VolcanoPixelOwnership]::Extract($pixels,$stride,$width,$ownership,$i+1,$r,$pad)
  $filename='volcano-'+$asset.id+'.png'
  Save-Rgba $data $cw $ch (Join-Path $destination $filename)
  $decoded=[Drawing.Bitmap]::new((Join-Path $destination $filename))
  try {
    $locked=$decoded.LockBits([Drawing.Rectangle]::new(0,0,$cw,$ch),[Drawing.Imaging.ImageLockMode]::ReadOnly,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $decodedBytes=[byte[]]::new($locked.Stride*$ch);$decodedStride=$locked.Stride
    try {[Runtime.InteropServices.Marshal]::Copy($locked.Scan0,$decodedBytes,0,$decodedBytes.Length)} finally {$decoded.UnlockBits($locked)}
    if([VolcanoPixelOwnership]::Audit($pixels,$stride,$width,$height,$ownership,$i+1,$r,$pad,$decodedBytes,$decodedStride) -ne 0){throw "Exported RGBA mismatch: $filename"}
  } finally {$decoded.Dispose()}
  $anchor=@(($asset.proposedFootAnchor[0]-$r[0]+$pad),($asset.proposedFootAnchor[1]-$r[1]+$pad))
  $records+=@{id=$asset.id;name=$asset.name;file=$filename;sourceBounds=@($r[0],$r[1],$r[2],$r[3]);size=@($cw,$ch);rect=@($x,$y,($x+$cw),($y+$ch));anchor=$anchor;anchorNormalized=@(($anchor[0]/$cw),($anchor[1]/$ch));height=($asset.proposedWorldHeight*$ch/$asset.bodySize[1]);radius=$asset.proposedCollisionRadius;bright=($asset.brightLandmark -or $i -eq 10);pixelCount=$r[4]}
  $images+=@{data=$data;width=$cw;height=$ch;x=$x;y=$y}
  $x+=$cw;$rowHeight=[Math]::Max($rowHeight,$ch)
}
$atlasHeight=1;while($atlasHeight -lt $y+$rowHeight){$atlasHeight*=2}
$records=@($records | Sort-Object id)
$atlas=[byte[]]::new($atlasWidth*$atlasHeight*4)
foreach($sprite in $images){[VolcanoPixelOwnership]::Blit($sprite.data,$sprite.width,$sprite.height,$atlas,$atlasWidth,$sprite.x,$sprite.y)}
Save-Rgba $atlas $atlasWidth $atlasHeight (Join-Path $destination 'volcano-atlas.png')
# Save exact pixel ownership as a lossless byte map for reproducibility/auditing.
$mask=[byte[]]::new($ownership.Length)
for($i=0;$i -lt $mask.Length;$i++){$mask[$i]=[byte]$ownership[$i]}
[IO.File]::WriteAllBytes((Join-Path $destination 'source-ownership.bin'),$mask)
$sourceCount=0;for($i=0;$i -lt $width*$height;$i++){if($pixels[[int][Math]::Floor($i/$width)*$stride+($i%$width)*4+3] -gt 0){$sourceCount++}}
$ownedCount=($records | Measure-Object pixelCount -Sum).Sum
if($ownedCount -ne $sourceCount){throw 'Source pixel ownership coverage mismatch'}
$manifest=@{sourceSha256=$sourceHash;sourceSize=@($width,$height);atlasSize=@($atlasWidth,$atlasHeight);padding=$pad;method='Alpha128 body seeds; nonzero-alpha multi-source ownership; detached components assigned whole to nearest body; original BGRA bytes copied';sourceNonzeroPixels=$sourceCount;ownedPixels=$ownedCount;pngRgbaMismatches=0;assets=$records}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $destination 'manifest.json')
$definitions=@($records | ForEach-Object {
  $rect=$_.rect -join ',';$anchor=($_.anchorNormalized | ForEach-Object { $_.ToString('0.000000',[Globalization.CultureInfo]::InvariantCulture) }) -join ','
  $h=$_.height.ToString('0.000000',[Globalization.CultureInfo]::InvariantCulture)
  $r=$_.radius.ToString('0.00',[Globalization.CultureInfo]::InvariantCulture)
  '  { name: '+(ConvertTo-Json -Compress $_.name)+', rect: ['+$rect+'], anchor: ['+$anchor+'], height: '+$h+', radius: '+$r+', bright: '+$_.bright.ToString().ToLowerInvariant()+' },'
})
$typescript="/** Generated by scripts/import-volcano-atlas.ps1; source pixels and foot anchors preserved. */"+[Environment]::NewLine+
"export const VOLCANO_ATLAS_SIZE = { width: $atlasWidth, height: $atlasHeight };"+[Environment]::NewLine+
"export const VOLCANO_PROPS = ["+[Environment]::NewLine+($definitions -join [Environment]::NewLine)+[Environment]::NewLine+"] as const;"+[Environment]::NewLine
[IO.File]::WriteAllText((Join-Path $ProjectRoot 'src/volcano-art.ts'),$typescript)
[PSCustomObject]@{Sprites=22;AtlasWidth=$atlasWidth;AtlasHeight=$atlasHeight;SourcePixels=$sourceCount;OwnedPixels=$ownedCount;Output=$destination}
