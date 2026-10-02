// Fabrique de générateurs par dimension
import { OverworldGen } from './overworld.js';
import { NetherGen } from './nether.js';
import { EndGen } from './end.js';

export function makeGenerator(dim, seed) {
  if (dim === 1) return new NetherGen(seed);
  if (dim === 2) return new EndGen(seed);
  return new OverworldGen(seed);
}
