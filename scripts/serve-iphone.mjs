import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const { site } = JSON.parse(await readFile('releases/latest.json','utf8'));
const prefix = '/MonsterBonk-Mobile/';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ogg':'audio/ogg','.glb':'model/gltf-binary','.webmanifest':'application/manifest+json'};
const server=createServer(async (request,response)=>{
 try {
  const url=new URL(request.url,'http://localhost');
  if(!url.pathname.startsWith(prefix)){response.writeHead(302,{Location:prefix});response.end();return;}
  const relative=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html';
  const path=resolve(site,relative);
  if(!path.startsWith(resolve(site)+sep)){response.writeHead(403);response.end();return;}
  const content=await readFile(path);
  response.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream','Cache-Control':'no-cache'});response.end(content);
 }catch{response.writeHead(404);response.end('Not found');}
});
const port=Number(process.env.IPHONE_PREVIEW_PORT??5181);
server.listen(port,'0.0.0.0',()=>console.log(`iPhone release preview: http://localhost:${port}${prefix}`));
