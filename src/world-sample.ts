import * as THREE from 'three';
import type { Obstacle } from './world';
import { fixedWorldLayout, SAMPLE_PATHS, ROAD_WIDTH, sampleObstacles, type WorldLayout } from './world-layout';

const SIZE = 128;
const PIXELS_PER_UNIT = 16;

function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    new THREE.ImageLoader().load(`${import.meta.env.BASE_URL}assets/world/${path}`, resolve, undefined, reject);
  });
}

function pixelTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** Ground is baked once; no per-tile meshes or per-frame terrain work. */
function makeGround(images: HTMLImageElement[], layout: WorldLayout) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE * PIXELS_PER_UNIT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(PIXELS_PER_UNIT, PIXELS_PER_UNIT);
  const pattern = (image: HTMLImageElement) => {
    const value = ctx.createPattern(image, 'repeat')!;
    value.setTransform(new DOMMatrix().scale(1 / PIXELS_PER_UNIT));
    return value;
  };
  ctx.fillStyle = pattern(images[0]);
  ctx.fillRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE);

  for (const region of layout.regions) {
    if (region.kind === 'pond') continue;
    ctx.fillStyle = region.kind === 'grove' ? 'rgba(39, 86, 51, .14)' : region.kind === 'rocky' ? 'rgba(164, 146, 112, .17)' : 'rgba(201, 215, 134, .15)';
    ctx.beginPath(); ctx.ellipse(region.x, region.z, 7.5, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Lower ground contrast so experience, projectiles and creature silhouettes win.
  ctx.fillStyle = 'rgba(103, 144, 87, .48)';
  ctx.fillRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE);

  const path = new Path2D();
  for (const road of SAMPLE_PATHS) {
    path.moveTo(road.start[0], road.start[1]);
    for (const c of road.curves) path.bezierCurveTo(c[0], c[1], c[2], c[3], c[4], c[5]);
  }
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.strokeStyle = '#789653'; ctx.lineWidth = ROAD_WIDTH + .6; ctx.stroke(path);
  ctx.strokeStyle = pattern(images[1]); ctx.lineWidth = ROAD_WIDTH; ctx.stroke(path);
  ctx.strokeStyle = 'rgba(185, 159, 111, .42)'; ctx.lineWidth = ROAD_WIDTH; ctx.stroke(path);

  // Rasterise circular shores in pixel rows. The water edge and its collider use
  // the same circle, with less than one texture pixel of disagreement.
  const disk = (p: Obstacle, radius: number, fill: string | CanvasPattern) => {
    ctx.fillStyle = fill;
    for (let row = Math.floor((p.z - radius) * PIXELS_PER_UNIT); row < (p.z + radius) * PIXELS_PER_UNIT; row++) {
      const dz = (row + .5) / PIXELS_PER_UNIT - p.z;
      const half = Math.sqrt(Math.max(0, radius * radius - dz * dz));
      const left = Math.ceil((p.x - half) * PIXELS_PER_UNIT);
      const right = Math.floor((p.x + half) * PIXELS_PER_UNIT);
      ctx.fillRect(left / PIXELS_PER_UNIT, row / PIXELS_PER_UNIT, (right - left) / PIXELS_PER_UNIT, 1 / PIXELS_PER_UNIT);
    }
  };
  // Paint each complete layer before the next, so overlapping lobes have no seams.
  for (const p of layout.water) disk(p, p.radius + .7, pattern(images[2]));
  for (const p of layout.water) disk(p, p.radius + .7, 'rgba(116, 139, 102, .46)');
  for (const p of layout.water) disk(p, p.radius + .14, '#588779');
  for (const p of layout.water) disk(p, p.radius, pattern(images[3]));
  for (const p of layout.water) disk(p, p.radius, 'rgba(67, 130, 151, .42)');
  return pixelTexture(canvas);
}

/** Retain the main eight-connected sprite; atlas cells can contain stray pixels. */
function crop(image: HTMLImageElement, x: number, y: number, size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, x, y, size, size, 0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size), pixels = imageData.data;
  const seen = new Uint8Array(size * size);
  let body: number[] = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || pixels[start * 4 + 3] < 24) continue;
    const pending = [start], component: number[] = [];
    seen[start] = 1;
    while (pending.length) {
      const index = pending.pop()!;
      component.push(index);
      const x = index % size, y = Math.floor(index / size);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * size + nx;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || seen[next] || pixels[next * 4 + 3] < 24) continue;
        seen[next] = 1; pending.push(next);
      }
    }
    if (component.length > body.length) body = component;
  }
  if (!body.length) throw new Error('Empty world sprite atlas cell');
  const keep = new Uint8Array(size * size);
  for (const index of body) keep[index] = 1;
  for (let i = 0; i < keep.length; i++) if (!keep[i]) pixels[i * 4 + 3] = 0;
  ctx.putImageData(imageData, 0, 0);
  let left = size, top = size, right = 0, bottom = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (pixels[(y * size + x) * 4 + 3] < 24) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  const result = document.createElement('canvas');
  result.width = right - left + 1; result.height = bottom - top + 1;
  result.getContext('2d')!.drawImage(canvas, left, top, result.width, result.height, 0, 0, result.width, result.height);
  return { texture: pixelTexture(result), aspect: result.width / result.height };
}

export function createSampleWorld(initialLayout = fixedWorldLayout()) {
  let layout = initialLayout;
  const group = new THREE.Group();
  group.name = '像素草场';
  const obstacles = sampleObstacles(layout);
  const groundMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), groundMaterial);
  ground.name = '样板草地与泥路'; ground.rotation.x = -Math.PI / 2;
  const props = new THREE.Group();
  group.add(ground, props);
  const geometry = new THREE.PlaneGeometry(1, 1);
  // Same fixed pitch as the orthographic camera; all props anchor at their feet.
  geometry.translate(0, .5, 0);
  const trees: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  let disposed = false;
  const ownedTextures: THREE.Texture[] = [];
  let images: HTMLImageElement[] | undefined;
  let art: { trees: ReturnType<typeof crop>[]; rock: ReturnType<typeof crop> } | undefined;
  const rebuild = () => {
    if (disposed || !images || !art) return;
    groundMaterial.map?.dispose();
    groundMaterial.map = makeGround(images, layout); groundMaterial.needsUpdate = true;
    for (const child of props.children) if (child instanceof THREE.Mesh) child.material.dispose();
    props.clear(); trees.length = 0;
    const prop = (art: ReturnType<typeof crop>, x: number, z: number, height: number, name: string) => {
      const material = new THREE.MeshBasicMaterial({ map: art.texture, transparent: true, alphaTest: .1, toneMapped: false, fog: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name; mesh.rotation.x = -Math.PI / 4;
      mesh.position.set(x, .025, z); mesh.scale.set(height * art.aspect, height, 1);
      props.add(mesh);
      return mesh;
    };
    layout.trees.forEach(([x, z, variant]) => {
      trees.push(prop(art!.trees[variant], x, z, variant === 2 ? 4.6 : 4.2, '像素树'));
    });
    layout.rocks.forEach(([x, z]) => {
      prop(art!.rock, x, z, 1.25, '岸边岩石');
    });
  };
  const ready = Promise.all([
    loadImage('Original Textures/Grass.png'), loadImage('Original Textures/Dirt .png'),
    loadImage('Original Textures/Sand.png'), loadImage('Original Textures/Water.png'),
    loadImage('Tileset/Decorations/trees.png'),
  ]).then(loaded => {
    if (disposed) return;
    images = loaded;
    art = { trees: [[0, 0], [32, 32], [32, 64]].map(([x, y]) => crop(loaded[4], x, y, 32)),
      rock: crop(loaded[4], 64, 32, 32) };
    ownedTextures.push(...art.trees.map(a => a.texture), art.rock.texture);
    rebuild();
  });
  return {
    group, obstacles, ready,
    setLayout(next: WorldLayout) {
      if (disposed) return;
      layout = next;
      obstacles.splice(0, obstacles.length, ...sampleObstacles(layout));
      rebuild();
    },
    update(x: number, z: number) {
      for (const tree of trees) {
        const dz = (tree.position.z - z) * Math.SQRT1_2;
        tree.material.opacity = dz > -.5 && dz < tree.scale.y + 1.5 && Math.abs(tree.position.x - x) < tree.scale.x / 2 + 2 ? .35 : 1;
        // Faded trees must not write an opaque silhouette into the depth buffer.
        tree.material.depthWrite = tree.material.opacity === 1;
      }
    },
    dispose() { disposed = true; groundMaterial.map?.dispose(); ownedTextures.forEach(texture => texture.dispose()); },
  };
}
