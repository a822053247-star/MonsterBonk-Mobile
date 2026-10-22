import * as THREE from 'three';
import type { Combat } from './combat';
import { WaterAtlas } from './water-aoe-view';

/** UV selection from the supplied 1254px crystal cluster; source PNG stays unchanged. */
const CRYSTAL_RECT = { x: 337, y: 280, width: 132, height: 260, sheet: 1254 } as const;
export class FrostView {
  readonly group = new THREE.Group();
  readonly crystals = new WaterAtlas('crystal', 1, 1, 'frost', 24, false);
  readonly shells = new WaterAtlas('freeze-shell', 1, 1, 'frost', 256, false);
  private shards = new WaterAtlas('crystal', 1, 1, 'frost', 240, false);
  private atlases = [this.crystals, this.shells, this.shards];
  constructor() {
    this.group.name = 'FrostCrystalAndFreeze';
    for (const atlas of this.atlases) { atlas.mesh.material.color.setScalar(1); this.group.add(atlas.mesh); }
    for (const atlas of [this.crystals, this.shards]) {
      const uv = atlas.mesh.geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (CRYSTAL_RECT.x + uv.getX(i) * CRYSTAL_RECT.width) / CRYSTAL_RECT.sheet,
        1 - (CRYSTAL_RECT.y + CRYSTAL_RECT.height - uv.getY(i) * CRYSTAL_RECT.height) / CRYSTAL_RECT.sheet);
      uv.needsUpdate = true;
    }
  }
  render(combat: Combat, alpha: number, detail: number) {
    this.clear();
    for (const shot of combat.projectiles) {
      if (!shot.active || shot.attackId !== 'frost-crystal' || shot.vfxPresetId) continue;
      const x = THREE.MathUtils.lerp(shot.previousX, shot.x, alpha), z = THREE.MathUtils.lerp(shot.previousZ, shot.z, alpha);
      this.crystals.putRect(0, x, z, .65, 1.28, .98, Math.atan2(shot.vx, shot.vz) + Math.PI, .3);
    }
    for (const enemy of combat.enemies) {
      if (!enemy.active || enemy.spawnTime > 0 || !(enemy.freezeTime! > 0)) continue;
      const fade = Math.min(1, enemy.freezeTime! / .18, (enemy.freezeDuration! - enemy.freezeTime!) / .08 + .35);
      const radius = combat.enemyRadius(enemy) * (enemy.rank === 'elite' ? 1.35 : 1);
      this.shells.put(0, THREE.MathUtils.lerp(enemy.previousX, enemy.x, alpha),
        THREE.MathUtils.lerp(enemy.previousZ, enemy.z, alpha), radius * 2 + .85, .94 * fade, enemy.id * .37, .2);
    }
    for (const event of combat.frost.events) {
      if (!event.active) continue;
      const t = event.age / .4, count = detail <= 2 ? 2 : event.kind === 'impact' ? 3 : 5;
      for (let i = 0; i < count; i++) {
        const angle = event.seed * 1.7 + i / count * Math.PI * 2, distance = .12 + t * (event.kind === 'thaw' ? .85 : .5);
        this.shards.putRect(0, event.x + Math.cos(angle) * distance, event.z + Math.sin(angle) * distance,
          .13 * (1 - t), .3 * (1 - t), .85 * (1 - t), -angle + t * 2, .25);
      }
    }
    for (const atlas of this.atlases) atlas.finish();
  }
  clear() { for (const atlas of this.atlases) atlas.begin(); }
  inspect() { return { plane: 'xz', crystalRect: CRYSTAL_RECT, atlases: this.atlases.map(a => ({ name: a.mesh.name, ...a.inspect() })) }; }
  dispose() { this.clear(); this.group.removeFromParent(); for (const atlas of this.atlases) atlas.dispose(); }
}
