import { rolldown } from 'rolldown';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'monsterbonk-content-'));
try {
  const bundle = await rolldown({ input: 'scripts/content-check.ts', platform: 'node' });
  const output = join(directory, 'check.mjs');
  await bundle.write({ file: output, format: 'esm' }); await bundle.close();
  const { checkContent } = await import(pathToFileURL(output).href);
  const inputIndex = process.argv.indexOf('--file');
  const input = inputIndex >= 0 ? JSON.parse(await readFile(process.argv[inputIndex + 1], 'utf8')) : undefined;
  if (input !== undefined && !Array.isArray(input)) throw new Error('Content input must be an array');
  const icons = checkContent(input);
  await mkdir('public/assets/generated/relics', { recursive: true });
  for (const icon of icons) await writeFile(`public/assets/generated/relics/${icon.id}.svg`, icon.svg + '\n');
  console.log(`Content valid: ${icons.length} factory relic(s); legacy IDs reserved; generated icons ready.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
} finally { await rm(directory, { recursive: true, force: true }); }
