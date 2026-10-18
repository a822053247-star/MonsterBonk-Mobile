import * as THREE from 'three';

export const VIEW_25D = { pitch: Math.PI / 4, height: 17, minWidth: 28, distance: 24 } as const;

/** Fixed azimuth: screen right = +X; screen down = +Z. No orbit controls. */
export function resize25DCamera(camera: THREE.OrthographicCamera, aspect: number, menu = false) {
  const height = menu ? Math.max(8, 15 / aspect) : Math.max(VIEW_25D.height, VIEW_25D.minWidth / aspect);
  if (camera.top === height / 2 && camera.right === height * aspect / 2) return;
  camera.left = -height * aspect / 2;
  camera.right = height * aspect / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}

/** Undo ground foreshortening, preserving analog strength and world speed. */
export function screenToGround(x: number, y: number, target: THREE.Vector2) {
  const strength = Math.min(1, Math.hypot(x, y));
  target.set(x, y / Math.sin(VIEW_25D.pitch));
  if (strength > 0) target.setLength(strength);
  return target;
}
