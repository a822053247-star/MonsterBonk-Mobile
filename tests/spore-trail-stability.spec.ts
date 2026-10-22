import { test, expect } from '@playwright/test';

test('spore trail remains steady across animation boundaries and quality changes', async ({ page }) => {
  await page.route('**/spore-stability-harness', route => route.fulfill({
    contentType: 'text/html', body: '<html><body></body></html>',
  }));
  await page.goto('/spore-stability-harness');
  const result = await page.evaluate(async () => {
    // @ts-ignore Browser imports are served by Vite.
    const THREE = await import('/node_modules/three/build/three.module.js');
    // @ts-ignore Browser imports are served by Vite.
    const { PositionAoeView } = await import('/src/position-aoe-view.ts');
    // @ts-ignore Browser imports are served by Vite.
    const { WaterAtlas } = await import('/src/water-aoe-view.ts');
    const tide = new WaterAtlas('star-tide', 4, 2), field = new WaterAtlas('still-sea', 1, 1);
    const view = new PositionAoeView(tide, field);
    await new Promise<void>((resolve, reject) => {
      const poll = () => view.spores.failed ? reject(new Error('Trail atlas failed'))
        : view.spores.loaded ? resolve() : setTimeout(poll, 10);
      poll();
    });
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(256, 256); document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.add(view.group);
    const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, .1, 20);
    camera.position.set(0, 10, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
    const cast = { active: true, kind: 'spore-trail', age: .59, duration: 3,
      x: 0, z: 0, radius: 2, castId: 1 };
    const samples: number[][] = [], frames: number[] = [];
    for (const [age, detail] of [[.59, 4], [.61, 4], [1.19, 4], [1.21, 4], [1.21, 2]]) {
      cast.age = age; view.render({ casts: [cast] }, detail); renderer.render(scene, camera);
      const gl = renderer.getContext(), pixels = new Uint8Array(256 * 256 * 4);
      gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      samples.push(Array.from(pixels)); frames.push(view.spores.inspect().frames[0]);
    }
    const change = (a: number[], b: number[]) => {
      let delta = 0, signal = 0;
      for (let i = 0; i < a.length; i++) if (i % 4 !== 3) {
        delta += Math.abs(a[i] - b[i]); signal += Math.max(a[i], b[i]);
      }
      return delta / Math.max(1, signal);
    };
    const changes = [change(samples[0], samples[1]), change(samples[2], samples[3]), change(samples[3], samples[4])];
    const visible = samples[0].some((v, i) => i % 4 !== 3 && v > 20);
    view.dispose(); tide.dispose(); field.dispose(); renderer.dispose();
    return { changes, frames, visible };
  });
  expect(result.visible).toBe(true);
  for (const change of result.changes) expect(change).toBeLessThan(.08);
  expect(new Set(result.frames).size).toBe(1);
});
