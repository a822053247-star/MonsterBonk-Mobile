import { CHUNK_SIZE, TERRAIN_PIXELS_PER_UNIT, terrainSteps } from './infinite-terrain';
import type { TerrainRequest, TerrainReply } from './infinite-terrain-baker';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<TerrainRequest>) => void) | null;
  postMessage(message: TerrainReply, transfer: Transferable[]): void;
};

scope.onmessage = ({ data }) => {
  let bitmap: ImageBitmap | undefined;
  try {
    const size = CHUNK_SIZE * TERRAIN_PIXELS_PER_UNIT;
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Offscreen 2D canvas unavailable');
    // WebGL ignores UNPACK_FLIP_Y for ImageBitmap. Bake its orientation explicitly.
    context.translate(0, size); context.scale(1, -1);
    const steps = terrainSteps(data.seed, data.cx, data.cz, context);
    let result = steps.next();
    while (!result.done) result = steps.next();
    bitmap = canvas.transferToImageBitmap();
    scope.postMessage({ id: data.id, layout: result.value, image: bitmap }, [bitmap]);
  } catch (error) {
    bitmap?.close();
    scope.postMessage({ id: data.id, error: String(error) }, []);
  }
};
