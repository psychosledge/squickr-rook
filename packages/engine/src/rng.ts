/** Returns values in [0, 1). */
export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

export function makeXorshift32(seed: number): Rng {
  let s = seed >>> 0;
  if (s === 0) s = 1;
  return function (): number {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x1_0000_0000;
  };
}
