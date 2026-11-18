// A small seeded random number generator (sfc32): the same seed gives the same dungeon,
// the same monster placement and the same screenshot scenes, which is what makes the
// staged shots repeatable. The helpers below are the only randomness the game uses.

export function createRandom(seed) {
  let a = seed >>> 0;
  let b = (seed ^ 0x9e3779b9) >>> 0;
  let c = (seed * 0x9e3779b1) >>> 0;
  let d = (seed ^ 0x85ebca6b) >>> 0;
  for (let warm = 0; warm < 12; warm += 1) {
    const t = (a + b + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c + t) >>> 0;
    c = (c << 21) | (c >>> 11);
  }
  return function random() {
    const t = (a + b + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c + t) >>> 0;
    c = (c << 21) | (c >>> 11);
    return t / 4294967296;
  };
}

/** A float in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** An integer in [min, max]. */
export function int(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of `items`, at random. */
export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

/** True with probability `p`. */
export function chance(random, p) {
  return random() < p;
}

/** A new array with `items` in a random order. */
export function shuffled(random, items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
