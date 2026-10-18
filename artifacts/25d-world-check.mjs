import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createWorld } from '../src/world.ts';

// Construction-only CanvasTexture stub. Rendering is verified separately in browsers.
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
const source = execFileSync('git', ['show', 'b68418f:src/world.ts'], { encoding: 'utf8' });
const js = stripTypeScriptTypes(source).replace("from 'three'", 'from ' + JSON.stringify(import.meta.resolve('three')));
const original = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const before = original.createWorld(), after = createWorld();
const hash = world => createHash('sha256').update(JSON.stringify(world.obstacles)).digest('hex');
if (hash(before) !== hash(after)) throw Error('Obstacle layout changed');
const result = { baseline: 'b68418f', obstaclesUnchanged: true, count: after.obstacles.length, sha256: hash(after) };
await writeFile('artifacts/25d-world-check.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
