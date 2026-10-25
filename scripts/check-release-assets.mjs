import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { releaseAssets } from './release-assets.mjs';

export async function checkReleaseAssets(site) {
  const missing = [];
  await Promise.all([...releaseAssets].map(async path => {
    try { await access(join(site, path)); } catch { missing.push(path); }
  }));
  if (missing.length) throw new Error(`Release is missing ${missing.length} card/effect assets:\n${missing.sort().join('\n')}`);
  console.log(`PASS release assets: ${releaseAssets.size} registered card images, fusion icons and effect sheets`);
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/check-release-assets.mjs')) {
  const site = process.argv[2] ?? JSON.parse(await readFile('releases/latest.json', 'utf8')).site;
  await checkReleaseAssets(site);
}
