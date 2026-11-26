// Seeded random numbers and small math helpers for Kestrel Ridge.
// Every value the world draws from comes from here, so a seed rebuilds
// the same valley, the same rings and the same weather every time.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(min, max) {
      return min + (max - min) * next();
    },
    int(min, max) {
      return Math.floor(min + (max - min + 1) * next());
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
  };
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, rate, dt) {
  const t = 1 - Math.exp(-rate * dt);
  return current + (target - current) * t;
}

// Smoothstep between two edges, 0 below lo and 1 above hi.
export function smoothstep(lo, hi, v) {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

// Wrap an angle to (-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

// Compass heading in degrees, 0 = north (+z), clockwise.
export function headingDeg(yaw) {
  let d = (yaw * 180) / Math.PI;
  d = ((d % 360) + 360) % 360;
  return d;
}

export const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
