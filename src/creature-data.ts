export type OrganSlot = 'head' | 'back' | 'tail';
export type OrganId = 'charge-horns' | 'sensor-antennae' | 'light-wings' | 'hardened-shell' | 'blaze-tail' | 'piercing-tail';
export type SocketPose = { position: readonly [number, number, number]; scale: number };
export type SocketLayout = Record<OrganSlot, SocketPose>;

/** Visual metadata only: no damage, skill or progression changes. */
export const ORGAN_DEFINITIONS: Record<OrganId, { slot: OrganSlot; name: string; placeholder?: 'horns' | 'shell' }> = {
  'charge-horns': { slot: 'head', name: '冲锋犄角', placeholder: 'horns' },
  'sensor-antennae': { slot: 'head', name: '感知触角' },
  'light-wings': { slot: 'back', name: '轻羽双翼' },
  'hardened-shell': { slot: 'back', name: '硬化甲壳', placeholder: 'shell' },
  'blaze-tail': { slot: 'tail', name: '爆燃尾巴' },
  'piercing-tail': { slot: 'tail', name: '穿刺尾巴' },
};

export const YANRONG_SOCKETS: SocketLayout = {
  head: { position: [0, 2.02, 0.52], scale: 1 },
  back: { position: [0, 1.4, -0.8], scale: 1 },
  tail: { position: [0, 0.72, -0.87], scale: 1 },
};
