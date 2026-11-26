// Kestrel Ridge — Canyon Courier: the game itself.
// A chase-view flight game in plain canvas 2D. Fly the dawn mail run: take
// off from the strip, thread every ring of the sortie, then bring the
// Kestrel home to land and refuel. Fuel, stall speed and the canyon walls
// make every leg a decision; the instruments make it readable.
//
// Boot: the page loads this module, it builds the world from a seed, reads
// ?shot=start|play|end for maker screenshots, and runs the loop.
// Controls: W/S throttle, arrow keys or mouse to steer, Space airbrake,
// Enter to start / continue, R to restart.

import { clamp, damp, wrapAngle } from './rng.js';
import { buildRings, buildWorld, passedThroughRing, RUNWAY, SORTIES } from './world.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('game');
// Size the drawing buffer to the real viewport: a desktop window's
// viewport is shorter than its window (browser chrome), so a fixed
// 1280x800 buffer would squash and leave a bare strip at the bottom.
function fitCanvas() {
  canvas.width = Math.max(640, window.innerWidth || 1280);
  canvas.height = Math.max(480, window.innerHeight || 800);
}
fitCanvas();
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || '20261126');
const shot = params.get('shot') || '';

const world = buildWorld(seed);
let renderer = createRenderer(canvas);
window.addEventListener('resize', () => {
  fitCanvas();
  renderer = createRenderer(canvas);
});
const input = createInput(canvas);
const audio = createAudio();

const STALL_SPEED = 26;
const MAX_SPEED = 95;
const CRUISE_CLIMB = 0.42;

function freshPlane() {
  return {
    x: 0,
    y: 2,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    bank: 0,
    speed: 0,
    vy: 0,
    throttle: 0,
  };
}

const state = {
  world,
  plane: freshPlane(),
  phase: 'title',
  sortieIndex: 0,
  sortie: SORTIES[0],
  rings: buildRings(0, seed),
  nextRing: 0,
  score: 0,
  fuel: 100,
  throttle: 0,
  timeLeft: SORTIES[0].parSeconds,
  elapsed: 0,
  message: '',
  messageAt: 0,
  lastBonus: 0,
  crashCause: '',
  now: 0,
  prevZ: 0,
};

function say(text) {
  state.message = text;
  state.messageAt = state.now;
}

function startSortie(index) {
  state.sortieIndex = index;
  state.sortie = SORTIES[index % SORTIES.length];
  state.rings = buildRings(index, seed);
  state.nextRing = 0;
  state.plane = freshPlane();
  state.fuel = state.sortie.fuel;
  state.timeLeft = state.sortie.parSeconds;
  state.elapsed = 0;
  state.phase = 'fly';
  state.crashCause = '';
  say(state.sortie.name);
  audio.resume();
  audio.click();
}

function crash(cause) {
  if (state.phase !== 'fly') return;
  state.phase = 'crashed';
  state.crashCause = cause;
  state.plane.speed = 0;
  audio.crash();
}

function land() {
  state.phase = 'landed';
  state.plane.speed = 0;
  state.plane.throttle = 0;
  state.throttle = 0;
  state.fuel = state.sortie.fuel;
  state.score += 50;
  audio.land();
  say('TOUCHDOWN +50');
}

function completeSortie() {
  const bonus = Math.max(0, Math.round(state.timeLeft)) * 2;
  state.lastBonus = bonus;
  state.score += bonus;
  state.phase = 'complete';
  audio.ring();
}

function step(dt) {
  const p = state.plane;
  const snap = input.snapshot();
  const flying = state.phase === 'fly';

  if (flying) {
    // Throttle: keys and mouse, eased so the engine feels weighty.
    let target = p.throttle + snap.throttle * dt * 0.9;
    if (snap.brake) target -= dt * 1.4;
    if (state.fuel <= 0) target = 0;
    p.throttle = clamp(target, 0, 1);
    state.throttle = p.throttle;
    // Speed chases the throttle; drag grows with the square of speed.
    const targetSpeed = p.throttle * MAX_SPEED;
    const drag = 0.25 + (p.speed * p.speed) / (MAX_SPEED * MAX_SPEED) * 0.55;
    p.speed = damp(p.speed, targetSpeed, drag, dt);
    if (snap.brake) p.speed = damp(p.speed, p.speed * 0.55, 2.2, dt);
    // Bank and pitch ease toward the stick; the nose follows the bank.
    const bankTarget = clamp(snap.bank * 0.85, -0.85, 0.85);
    p.bank = damp(p.bank, bankTarget, 3.2, dt);
    p.roll = damp(p.roll, p.bank, 4.5, dt);
    const pitchTarget = clamp(-snap.pitch * 0.38, -0.38, 0.38);
    p.pitch = damp(p.pitch, pitchTarget, 2.6, dt);
    const turnRate = p.bank * 0.55 * clamp(p.speed / 45, 0.25, 1);
    p.yaw += turnRate * dt;
    // Climb from pitch and lift; below stall speed she sinks.
    const lift = clamp((p.speed - STALL_SPEED) / 22, 0, 1);
    const climb = Math.sin(p.pitch) * p.speed * (0.35 + 0.65 * lift);
    p.vy = damp(p.vy, climb, 2.0, dt);
    if (p.speed < STALL_SPEED && p.y > world.heightAt(p.x, p.z) + 2) {
      p.vy -= (STALL_SPEED - p.speed) * 0.35 * dt * 10;
    }
    p.x += Math.sin(p.yaw) * Math.cos(p.pitch) * p.speed * dt;
    p.z += Math.cos(p.yaw) * Math.cos(p.pitch) * p.speed * dt;
    p.y += p.vy * dt;
    p.x = clamp(p.x, -640, 640);
    // Fuel burns with throttle; a gentle glide sips it.
    state.fuel -= (0.55 + p.throttle * 1.5) * dt;
    state.elapsed += dt;
    state.timeLeft -= dt;
    if (state.timeLeft <= 0 && state.nextRing < state.rings.length) {
      crash('Out of time — the dawn mail run closed.');
      return;
    }
    if (state.fuel <= 0) {
      state.fuel = 0;
      if (Math.floor(state.now / 900) % 2 === 0) say('FUEL EMPTY — GLIDE TO THE STRIP');
    }
    // Rings: crossing the hoop's plane inside its disc scores.
    const ring = state.rings[state.nextRing];
    if (ring && passedThroughRing(p, { z: state.prevZ }, ring)) {
      ring.passed = true;
      state.nextRing += 1;
      state.score += 100;
      state.fuel = Math.min(state.sortie.fuel, state.fuel + 6);
      audio.ring();
      say(state.nextRing >= state.rings.length ? 'ALL RINGS FLOWN — LAND HER HOME' : `RING ${state.nextRing}/${state.rings.length}  +100`);
      if (state.nextRing >= state.rings.length) {
        // The sortie is won by landing, not by the last ring alone.
        say('ALL RINGS FLOWN — LAND ON THE STRIP');
      }
    }
    state.prevZ = p.z;
    // Ground: a gentle touchdown on the strip lands; anywhere else crashes.
    const ground = world.heightAt(p.x, p.z);
    if (p.y <= ground + 0.6) {
      const onStrip = world.isOnRunway(p.x, p.z);
      const gentle = Math.abs(p.vy) < 7 && p.speed < 62 && Math.abs(p.bank) < 0.45;
      const aligned = Math.abs(wrapAngle(p.yaw)) < 0.5;
      if (onStrip && gentle && aligned) {
        p.y = 1.2;
        if (state.nextRing >= state.rings.length) completeSortie();
        else land();
      } else if (onStrip && p.speed < 20 && Math.abs(p.vy) < 9) {
        p.y = 1.2;
        land();
      } else {
        p.y = ground + 0.6;
        crash(onStrip ? 'Hard landing — she came down too fast.' : 'Into the ridge. The valley keeps what it takes.');
      }
    }
    // Ceiling and the far end of the valley turn her around gently.
    if (p.y > 210) {
      p.y = 210;
      p.vy = Math.min(p.vy, 0);
    }
    if (p.z > 3400 || p.z < -420) {
      p.yaw += Math.PI * dt * 0.4;
      say('END OF THE VALLEY — TURNING BACK');
    }
    audio.engine(p.throttle, p.speed, true);
  } else {
    audio.engine(0, 0, false);
    if (state.phase === 'title' || state.phase === 'landed') {
      // Parked on the strip: idle bob, prop turning in the mind's eye.
      p.y = 1.2;
      p.speed = 0;
    }
  }
}

function onPress(key) {
  audio.resume();
  if (key === 'Enter' || key === ' ') {
    if (state.phase === 'title') startSortie(0);
    else if (state.phase === 'landed') {
      // Take off again from the strip, same sortie, rings kept.
      state.phase = 'fly';
      state.plane.y = 2;
      state.plane.speed = 12;
      state.plane.throttle = 0.55;
      state.throttle = 0.55;
      say('CLEARED FOR TAKEOFF');
    } else if (state.phase === 'complete') {
      const next = state.sortieIndex + 1;
      if (next >= SORTIES.length) {
        state.phase = 'win';
      } else {
        startSortie(next);
      }
    } else if (state.phase === 'crashed') {
      startSortie(state.sortieIndex);
    } else if (state.phase === 'win') {
      state.score = 0;
      startSortie(0);
    }
  }
  if (key === 'r' || key === 'R') {
    if (state.phase !== 'title') startSortie(state.sortieIndex);
  }
}

// Screenshot hooks: the maker drives the game to a pose with a query
// string (?shot=start|play|end) and takes a real render of the live game.
function applyShot() {
  if (shot === 'start') {
    state.phase = 'title';
    state.plane = freshPlane();
    state.plane.y = 1.2;
  } else if (shot === 'play') {
    state.phase = 'fly';
    state.plane = freshPlane();
    state.plane.x = -40;
    state.plane.y = 118;
    state.plane.z = 880;
    state.plane.yaw = 0.12;
    state.plane.pitch = 0.02;
    state.plane.roll = -0.22;
    state.plane.bank = -0.22;
    state.plane.speed = 68;
    state.plane.throttle = 0.82;
    state.throttle = 0.82;
    state.prevZ = 878;
    state.nextRing = 1;
    state.rings[0].passed = true;
    state.score = 100;
    state.fuel = 82;
    state.timeLeft = 118;
    say('RING 1/6  +100');
  } else if (shot === 'end') {
    state.phase = 'complete';
    state.sortieIndex = 0;
    state.sortie = SORTIES[0];
    state.rings = buildRings(0, seed);
    for (const r of state.rings) r.passed = true;
    state.nextRing = state.rings.length;
    state.plane = freshPlane();
    state.plane.y = 1.2;
    state.plane.z = 60;
    state.score = 650;
    state.lastBonus = 150;
    state.fuel = 100;
    state.timeLeft = 75;
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  state.now = now;
  for (const key of input.consumePressed()) onPress(key);
  if (shot === 'play' || shot === 'end') {
    // Hold the posed frame still for the screenshot; the world is live
    // underneath, the pose is the maker's chosen moment.
  } else {
    step(dt);
  }
  renderer.render(state, now);
  requestAnimationFrame(frame);
}

canvas.addEventListener('mousedown', () => {
  audio.resume();
  onPress('Enter');
});

applyShot();
requestAnimationFrame(frame);
