// The valley of Kestrel Ridge: terrain height, the home runway, the ring
// course and the three sorties. Nothing here draws anything; it only answers
// questions about the world (how high is the ground here, where is the next
// ring) so the renderer and the flight model can share one truth.

import { clamp, makeRng, smoothstep } from './rng.js';

export const RUNWAY = {
  x0: -16,
  x1: 16,
  z0: -320,
  z1: 320,
  // centreline of the strip, used for landing checks.
  cx: 0,
};

export const SORTIES = [
  { name: 'Sortie 1 · Dawn Patrol', rings: 6, ringRadius: 26, fuel: 100, parSeconds: 150 },
  { name: 'Sortie 2 · Canyon Slalom', rings: 8, ringRadius: 22, fuel: 100, parSeconds: 170 },
  { name: 'Sortie 3 · Ridge Runner', rings: 10, ringRadius: 19, fuel: 110, parSeconds: 200 },
];

// Build one valley from a seed: ridge phases, river bend, tree fields.
export function buildWorld(seed) {
  const rng = makeRng(seed);
  const ridges = [];
  for (let i = 0; i < 5; i++) {
    ridges.push({
      fx: rng.range(0.004, 0.011),
      fz: rng.range(0.002, 0.007),
      px: rng.range(0, Math.PI * 2),
      pz: rng.range(0, Math.PI * 2),
      amp: rng.range(6, 13),
    });
  }
  const riverPhase = rng.range(0, Math.PI * 2);
  const riverAmp = rng.range(90, 150);
  const riverFreq = rng.range(0.0016, 0.0026);

  // Tree copses: deterministic scatter, kept off the runway and the river.
  const trees = [];
  for (let i = 0; i < 260; i++) {
    const x = rng.range(-560, 560);
    const z = rng.range(-300, 3400);
    if (Math.abs(x) < 34 && z > RUNWAY.z0 - 40 && z < RUNWAY.z1 + 40) continue;
    if (Math.abs(x - riverX(z, riverPhase, riverAmp, riverFreq)) < 26) continue;
    trees.push({ x, z, s: rng.range(0.7, 1.5), hue: rng.range(0, 1) });
  }
  // Farm fields: flat coloured patches in the valley floor.
  const fields = [];
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-420, 420);
    const z = rng.range(-240, 3200);
    if (Math.abs(x) < 40 && z > RUNWAY.z0 - 20 && z < RUNWAY.z1 + 20) continue;
    fields.push({ x, z, w: rng.range(70, 170), d: rng.range(60, 140), tone: rng.range(0, 1) });
  }

  function riverX(z, phase, amp, freq) {
    return amp * Math.sin(z * freq + phase) + 130 * Math.sin(z * 0.0007 + phase * 2);
  }

  // Height of the ground at (x, z). The runway strip is flattened to 0.
  function heightAt(x, z) {
    let h = 0;
    for (const r of ridges) {
      h += r.amp * Math.sin(x * r.fx + r.px) * Math.sin(z * r.fz + r.pz);
      h += 0.3 * r.amp * Math.sin(x * r.fx * 2.7 + r.px * 1.3 + z * 0.004);
    }
    h = h * 0.55 + 3;
    // Canyon walls rise steeply outside the valley.
    const wall = smoothstep(280, 600, Math.abs(x));
    h += wall * wall * 110;
    // A second ridge line far out, for the horizon silhouette.
    h += smoothstep(600, 950, Math.abs(x)) * 90;
    // River bed carves a shallow channel.
    const rx = riverX(z, riverPhase, riverAmp, riverFreq);
    const dRiver = Math.abs(x - rx);
    if (dRiver < 34) h -= (1 - dRiver / 34) * 5;
    // Runway plateau: blend the ground down to flat 0 across the strip.
    // d is how far outside the strip the point sits: 0 on the strip, so
    // the strip itself is dead flat and the blend starts at its edge.
    if (x > RUNWAY.x0 - 26 && x < RUNWAY.x1 + 26 && z > RUNWAY.z0 - 26 && z < RUNWAY.z1 + 26) {
      const dx = Math.max(RUNWAY.x0 - x, 0, x - RUNWAY.x1);
      const dz = Math.max(RUNWAY.z0 - z, 0, z - RUNWAY.z1);
      const edge = smoothstep(0, 26, Math.max(dx, dz));
      h = h * edge;
    }
    return Math.max(h, 0);
  }

  function isOnRunway(x, z) {
    return x >= RUNWAY.x0 && x <= RUNWAY.x1 && z >= RUNWAY.z0 && z <= RUNWAY.z1;
  }

  return { seed, ridges, riverPhase, riverAmp, riverFreq, trees, fields, heightAt, isOnRunway, riverX: (z) => riverX(z, riverPhase, riverAmp, riverFreq) };
}

// Lay out a sortie's rings along the valley: out through the canyon, then
// a turn home. Each ring faces the course direction (a vertical hoop).
export function buildRings(sortieIndex, seed) {
  const def = SORTIES[sortieIndex % SORTIES.length];
  const rng = makeRng(seed * 31 + sortieIndex * 101 + 7);
  const rings = [];
  const n = def.rings;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(n - 1, 1);
    // Out leg: z grows, x weaves; last rings swing back toward the strip.
    let z;
    let x;
    if (t < 0.62) {
      z = 420 + t * 2900;
      x = Math.sin(t * 9.1 + seed) * 150 * (0.4 + t);
    } else {
      const u = (t - 0.62) / 0.38;
      z = 420 + 0.62 * 2900 - u * 900;
      x = Math.sin(t * 9.1 + seed) * 150 * (0.4 + t) * (1 - u * 0.7);
    }
    const y = 55 + rng.range(0, 70) + Math.sin(i * 1.7) * 18;
    rings.push({
      index: i,
      x: clamp(x, -210, 210),
      y: clamp(y, 34, 150),
      z,
      r: def.ringRadius,
      passed: false,
    });
  }
  return rings;
}

// Distance from a point to the centre of a ring, and whether the point is
// inside the hoop's disc (used for the fly-through check).
export function ringGap(plane, ring) {
  const dx = plane.x - ring.x;
  const dy = plane.y - ring.y;
  const dz = plane.z - ring.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function passedThroughRing(plane, prev, ring) {
  // Crossed the ring's plane this step and inside the hoop.
  const crossed = (prev.z - ring.z) * (plane.z - ring.z) <= 0 && Math.abs(plane.z - ring.z) < 60;
  if (!crossed) return false;
  const dx = plane.x - ring.x;
  const dy = plane.y - ring.y;
  return Math.sqrt(dx * dx + dy * dy) < ring.r;
}
