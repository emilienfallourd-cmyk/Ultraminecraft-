// Constantes globales du moteur
export const CHUNK = 16;
export const HEIGHT = 128;
export const SECTIONS = HEIGHT / 16;
export const SEA_LEVEL = 62;
export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;
export const DAY_LENGTH = 24000; // ticks par jour (comme Minecraft)

export const DIM = { OVERWORLD: 0, NETHER: 1, END: 2 };
export const DIM_NAMES = ['overworld', 'nether', 'end'];
export const DIM_LABELS = ['Surface', 'Nether', 'L\'End'];

export const FACE = { PX: 0, NX: 1, PY: 2, NY: 3, PZ: 4, NZ: 5 };
export const FACE_DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
export const OPPOSITE = [1, 0, 3, 2, 5, 4];

export const GAMEMODE = { SURVIVAL: 0, CREATIVE: 1, SPECTATOR: 3 };

export function chunkKey(cx, cz) { return cx + ',' + cz; }
export function blockIndex(x, y, z) { return x | (z << 4) | (y << 8); }
