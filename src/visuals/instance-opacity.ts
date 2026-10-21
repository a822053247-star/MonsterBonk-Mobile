import * as THREE from 'three';

/** A bounded per-instance alpha buffer; no materials or objects per event. */
export function instanceOpacity(mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>, capacity: number) {
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1);
  alpha.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('vfxAlpha', alpha);
  mesh.material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float vfxAlpha; varying float vfxOpacity;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vfxOpacity = vfxAlpha;');
    shader.fragmentShader = 'varying float vfxOpacity;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vfxOpacity;');
  };
  mesh.material.customProgramCacheKey = () => 'vfx-instance-opacity-v1';
  return alpha;
}
