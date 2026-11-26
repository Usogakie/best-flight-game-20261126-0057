// Everything Kestrel Ridge shows: the dawn sky, the valley floor, the home
// runway, the rings, the Kestrel herself and the lit instruments. The camera
// sits behind the aircraft and looks along her nose; the world is projected
// with a plain perspective divide, far things first, so nearer ground covers
// farther ground.

import { clamp, headingDeg, lerp, smoothstep, COMPASS_POINTS } from './rng.js';
import { RUNWAY } from './world.js';

const FOV = 68;

function makeCamera(plane, parked) {
  const yaw = plane.yaw;
  // Parked (title, landed, complete): raise the camera and tip the view
  // down a little so the strip ahead reads as a runway, not a grey band
  // on the horizon.
  const pitch = plane.pitch - (parked ? 0.12 : 0);
  const cp = Math.cos(pitch);
  const fwd = { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp };
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  // up = fwd cross right (world up is +y; right is world-up cross fwd).
  const up = {
    x: fwd.y * right.z - fwd.z * right.y,
    y: fwd.z * right.x - fwd.x * right.z,
    z: fwd.x * right.y - fwd.y * right.x,
  };
  const cam = {
    x: plane.x - fwd.x * 15,
    y: plane.y - fwd.y * 15 + 4.5 + (parked ? 8 : 0),
    z: plane.z - fwd.z * 15,
    fwd,
    right,
    up,
  };
  return cam;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const CX = W / 2;
  const CY = H * 0.52;
  const focal = (H * 0.5) / Math.tan(((FOV / 2) * Math.PI) / 180);

  function project(cam, roll, px, py, pz) {
    const dx = px - cam.x;
    const dy = py - cam.y;
    const dz = pz - cam.z;
    const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
    const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
    const cz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
    if (cz < 2) return null;
    const s = focal / cz;
    let sx = CX + cx * s;
    let sy = CY - cy * s;
    if (roll !== 0) {
      const c = Math.cos(roll);
      const sn = Math.sin(roll);
      const rx = sx - CX;
      const ry = sy - CY;
      sx = CX + rx * c - ry * sn;
      sy = CY + rx * sn + ry * c;
    }
    return { x: sx, y: sy, d: cz };
  }

  function groundColor(h, ix, iz, fieldTone) {
    let base;
    if (h > 120) base = [226, 232, 238]; // snow
    else if (h > 78) base = [122, 110, 96]; // rock
    else if (h > 42) base = [96, 110, 62]; // scrub
    else if (fieldTone !== null) {
      base = fieldTone > 0.5 ? [168, 158, 74] : [112, 140, 66]; // farmland
    } else base = [74, 128, 58]; // meadow
    const shade = (ix + iz) % 2 === 0 ? 1 : 0.965;
    const dist = clamp(1 - iz * 0.012, 0.55, 1);
    return `rgb(${Math.round(base[0] * shade * dist)},${Math.round(base[1] * shade * dist)},${Math.round(base[2] * shade * dist)})`;
  }

  function drawSky(state, time) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.62);
    g.addColorStop(0, '#1d3a63');
    g.addColorStop(0.45, '#4d7aa8');
    g.addColorStop(0.8, '#e8a56b');
    g.addColorStop(1, '#f2c98d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.66);
    // Low sun, fixed to the east so heading changes swing it across.
    const sunX = CX + Math.sin(state.plane.yaw + 1.1) * W * 0.42;
    const sunY = H * 0.30 + Math.sin(time * 0.0001) * 4;
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
    glow.addColorStop(0, 'rgba(255, 236, 180, 0.95)');
    glow.addColorStop(0.25, 'rgba(255, 196, 110, 0.55)');
    glow.addColorStop(1, 'rgba(255, 196, 110, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 140, sunY - 140, 280, 280);
    ctx.fillStyle = '#ffedbe';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();
    // Drifting cloud bands, parallaxed by heading.
    ctx.fillStyle = 'rgba(255, 244, 224, 0.75)';
    for (let i = 0; i < 9; i++) {
      const seedX = i * 373 + 80;
      let x = (seedX - state.plane.yaw * 260 - time * 0.004 * (1 + (i % 3))) % (W + 320);
      if (x < -160) x += W + 320;
      const y = 60 + (i % 4) * 52 + Math.sin(i * 2.3) * 14;
      const w = 120 + (i % 3) * 60;
      ctx.beginPath();
      ctx.ellipse(x, y, w, 13 + (i % 3) * 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + w * 0.28, y - 9, w * 0.5, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMountains(state) {
    // Two silhouette layers: near ridge, far ridge with snow.
    const layers = [
      { amp: 90, base: H * 0.52, color: '#5d6f8e', parallax: 320, seed: 11 },
      { amp: 150, base: H * 0.56, color: '#7d8aa8', parallax: 170, seed: 47 },
    ];
    for (const layer of layers) {
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.62);
      for (let x = 0; x <= W; x += 16) {
        const t = (x + state.plane.yaw * layer.parallax + layer.seed * 57) * 0.004;
        const y = layer.base - (Math.abs(Math.sin(t * 1.7)) * 0.6 + Math.abs(Math.sin(t * 0.9 + 2)) * 0.4) * layer.amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H * 0.62);
      ctx.closePath();
      ctx.fill();
    }
    // Snow caps on the far ridge.
    ctx.fillStyle = 'rgba(238, 242, 248, 0.85)';
    for (let x = 40; x < W; x += 130) {
      const t = (x + state.plane.yaw * 170 + 47 * 57) * 0.004;
      const peak = H * 0.56 - (Math.abs(Math.sin(t * 1.7)) * 0.6 + Math.abs(Math.sin(t * 0.9 + 2)) * 0.4) * 150;
      ctx.beginPath();
      ctx.moveTo(x - 26, peak + 34);
      ctx.lineTo(x, peak);
      ctx.lineTo(x + 26, peak + 34);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGround(state) {
    const { world, plane } = state;
    const parked = state.phase !== 'fly';
    const cam = makeCamera(plane, parked);
    const roll = plane.roll;
    // Base valley colour from the horizon down, so near ground the camera
    // cannot see (behind it) never shows the page background.
    const base = ctx.createLinearGradient(0, H * 0.45, 0, H);
    base.addColorStop(0, '#5d7a44');
    base.addColorStop(1, '#3d5230');
    ctx.fillStyle = base;
    ctx.fillRect(0, H * 0.45, W, H * 0.55);
    const zStart = Math.floor((plane.z - 300) / 70) * 70;
    const zEnd = plane.z + 1150;
    const xStep = 80;
    // Far rows first so near ground paints over them.
    for (let z = zEnd; z >= zStart; z -= 70) {
      const iz = Math.round(z / 70);
      for (let x = -640; x < 640; x += xStep) {
        const ix = Math.round(x / xStep);
        const h00 = world.heightAt(x, z);
        const h10 = world.heightAt(x + xStep, z);
        const h01 = world.heightAt(x, z + 70);
        const h11 = world.heightAt(x + xStep, z + 70);
        const p00 = project(cam, roll, x, h00, z);
        const p10 = project(cam, roll, x + xStep, h10, z);
        const p01 = project(cam, roll, x, h01, z + 70);
        const p11 = project(cam, roll, x + xStep, h11, z + 70);
        if (!p00 || !p10 || !p01 || !p11) continue;
        const cxCell = x + xStep / 2;
        const czCell = z + 35;
        let fieldTone = null;
        for (const f of world.fields) {
          if (Math.abs(cxCell - f.x) < f.w / 2 && Math.abs(czCell - f.z) < f.d / 2) {
            fieldTone = f.tone;
            break;
          }
        }
        const hAvg = (h00 + h10 + h01 + h11) / 4;
        ctx.fillStyle = groundColor(hAvg, ix, iz, fieldTone);
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.fill();
      }
      // River ribbon for this row.
      const rx = world.riverX(z);
      const ry = world.heightAt(rx, z) + 0.6;
      const r0 = project(cam, roll, rx - 13, ry, z);
      const r1 = project(cam, roll, rx + 13, ry, z);
      const r2 = project(cam, roll, world.riverX(z + 70) + 13, world.heightAt(world.riverX(z + 70), z + 70) + 0.6, z + 70);
      const r3 = project(cam, roll, world.riverX(z + 70) - 13, world.heightAt(world.riverX(z + 70), z + 70) + 0.6, z + 70);
      if (r0 && r1 && r2 && r3) {
        ctx.fillStyle = '#3f7fb8';
        ctx.beginPath();
        ctx.moveTo(r0.x, r0.y);
        ctx.lineTo(r1.x, r1.y);
        ctx.lineTo(r2.x, r2.y);
        ctx.lineTo(r3.x, r3.y);
        ctx.closePath();
        ctx.fill();
      }
      // Trees for this row: small billboards, near ones bigger.
      for (const tree of world.trees) {
        if (tree.z < z || tree.z >= z + 70) continue;
        const th = world.heightAt(tree.x, tree.z);
        const base = project(cam, roll, tree.x, th, tree.z);
        const top = project(cam, roll, tree.x, th + 14 * tree.s, tree.z);
        if (!base || !top) continue;
        const hPx = Math.abs(base.y - top.y);
        if (hPx < 2 || hPx > 120) continue;
        ctx.fillStyle = tree.hue > 0.5 ? '#2f5d2a' : '#3a6b32';
        ctx.beginPath();
        ctx.moveTo(base.x, top.y);
        ctx.lineTo(base.x - hPx * 0.45, base.y);
        ctx.lineTo(base.x + hPx * 0.45, base.y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#5a4028';
        ctx.fillRect(base.x - 1, base.y - hPx * 0.18, 2, hPx * 0.18);
      }
    }
    // The runway is drawn in its own pass after all ground cells, so the
    // grass cells that share its columns never paint over the asphalt.
    drawRunway(cam, roll);
  }

  function drawRunway(cam, roll) {
    for (let z = RUNWAY.z1; z >= RUNWAY.z0; z -= 70) {
      const za = z - 70;
      const zb = z;
      if (zb < RUNWAY.z0 || za > RUNWAY.z1) continue;
      const a = project(cam, roll, RUNWAY.x0, 0.5, Math.max(za, RUNWAY.z0));
      const b = project(cam, roll, RUNWAY.x1, 0.5, Math.max(za, RUNWAY.z0));
      const c = project(cam, roll, RUNWAY.x1, 0.5, Math.min(zb, RUNWAY.z1));
      const d = project(cam, roll, RUNWAY.x0, 0.5, Math.min(zb, RUNWAY.z1));
      if (!a || !b || !c || !d) continue;
      ctx.fillStyle = '#3a3f47';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      // White edge lines so the strip reads at a glance.
      ctx.strokeStyle = 'rgba(245, 245, 235, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(d.x, d.y);
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      // Centreline dashes on every other segment.
      if ((Math.floor(z / 70) % 2) === 0) {
        const m1 = project(cam, roll, -1.5, 0.7, Math.max(za, RUNWAY.z0));
        const m2 = project(cam, roll, 1.5, 0.7, Math.max(za, RUNWAY.z0));
        const m3 = project(cam, roll, 1.5, 0.7, Math.min(zb, RUNWAY.z1));
        const m4 = project(cam, roll, -1.5, 0.7, Math.min(zb, RUNWAY.z1));
        if (m1 && m2 && m3 && m4) {
          ctx.fillStyle = 'rgba(240, 240, 230, 0.9)';
          ctx.beginPath();
          ctx.moveTo(m1.x, m1.y);
          ctx.lineTo(m2.x, m2.y);
          ctx.lineTo(m3.x, m3.y);
          ctx.lineTo(m4.x, m4.y);
          ctx.closePath();
          ctx.fill();
        }
      }
      // Threshold bars at both ends.
      for (const tz of [RUNWAY.z0 + 6, RUNWAY.z1 - 6]) {
        if (tz < Math.max(za, RUNWAY.z0) || tz > Math.min(zb, RUNWAY.z1)) continue;
        const t1 = project(cam, roll, RUNWAY.x0 + 3, 0.7, tz);
        const t2 = project(cam, roll, RUNWAY.x1 - 3, 0.7, tz);
        const t3 = project(cam, roll, RUNWAY.x1 - 3, 0.7, tz + 8);
        const t4 = project(cam, roll, RUNWAY.x0 + 3, 0.7, tz + 8);
        if (t1 && t2 && t3 && t4) {
          ctx.fillStyle = 'rgba(250, 250, 240, 0.95)';
          ctx.beginPath();
          ctx.moveTo(t1.x, t1.y);
          ctx.lineTo(t2.x, t2.y);
          ctx.lineTo(t3.x, t3.y);
          ctx.lineTo(t4.x, t4.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  function drawRings(state) {
    const { plane, rings, nextRing } = state;
    const cam = makeCamera(plane, state.phase !== 'fly');
    const roll = plane.roll;
    const sorted = [...rings].sort((a, b) => b.z - a.z);
    for (const ring of sorted) {
      if (ring.z < plane.z - 40) continue;
      const isNext = ring.index === nextRing;
      const color = ring.passed ? '#39d98a' : isNext ? '#ffc94d' : '#4dd2ff';
      const pts = [];
      let any = false;
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const p = project(cam, roll, ring.x + Math.cos(a) * ring.r, ring.y + Math.sin(a) * ring.r, ring.z);
        if (p) {
          pts.push(p);
          any = true;
        }
      }
      if (!any || pts.length < 4) continue;
      ctx.save();
      ctx.globalAlpha = ring.passed ? 0.45 : 0.95;
      ctx.strokeStyle = color;
      ctx.lineWidth = isNext ? 6 : 4;
      ctx.shadowColor = color;
      ctx.shadowBlur = isNext ? 18 : 8;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      // Guide post from the ring's underside down to the ground, and a
      // distance tag on the next ring.
      if (isNext) {
        const bottom = project(cam, roll, ring.x, ring.y - ring.r, ring.z);
        const gnd = project(cam, roll, ring.x, state.world.heightAt(ring.x, ring.z), ring.z);
        if (bottom && gnd && gnd.y > bottom.y) {
          ctx.strokeStyle = 'rgba(255, 201, 77, 0.5)';
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(bottom.x, bottom.y);
          ctx.lineTo(gnd.x, gnd.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const top = project(cam, roll, ring.x, ring.y + ring.r, ring.z);
        const dist = Math.max(0, Math.round(ring.z - plane.z));
        if (top) {
          ctx.fillStyle = '#ffc94d';
          ctx.font = 'bold 15px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${dist} m`, top.x, top.y - 12);
        }
      }
    }
  }

  function drawPlane(state) {
    const { plane, throttle } = state;
    const px = CX + plane.roll * 46;
    const py = H * 0.66 - plane.pitch * 26;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(plane.roll * 0.9);
    const scale = 1 + clamp((plane.speed - 40) / 220, 0, 0.12);
    ctx.scale(scale, scale);
    // Exhaust glow when the throttle is open.
    if (throttle > 0.25 && state.phase === 'fly') {
      const glow = ctx.createRadialGradient(0, 92, 2, 0, 92, 34 + throttle * 26);
      glow.addColorStop(0, 'rgba(255, 190, 90, 0.9)');
      glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 92, 34 + throttle * 26, 0, Math.PI * 2);
      ctx.fill();
    }
    // Main wings, swept back, seen from behind and above.
    ctx.fillStyle = '#c8ccd4';
    ctx.strokeStyle = '#7d838e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, 18);
    ctx.lineTo(-172, 52);
    ctx.lineTo(-178, 66);
    ctx.lineTo(-16, 44);
    ctx.lineTo(16, 44);
    ctx.lineTo(178, 66);
    ctx.lineTo(172, 52);
    ctx.lineTo(14, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Wing roundels.
    ctx.fillStyle = '#d84a35';
    ctx.beginPath();
    ctx.arc(-108, 50, 9, 0, Math.PI * 2);
    ctx.arc(108, 50, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2f4f7';
    ctx.beginPath();
    ctx.arc(-108, 50, 4, 0, Math.PI * 2);
    ctx.arc(108, 50, 4, 0, Math.PI * 2);
    ctx.fill();
    // Fuselage: nose away from us, tail toward us.
    const body = ctx.createLinearGradient(-16, 0, 16, 0);
    body.addColorStop(0, '#8f959e');
    body.addColorStop(0.5, '#e8ebef');
    body.addColorStop(1, '#8f959e');
    ctx.fillStyle = body;
    ctx.strokeStyle = '#6d727b';
    ctx.beginPath();
    ctx.moveTo(0, -118);
    ctx.quadraticCurveTo(13, -70, 15, -20);
    ctx.quadraticCurveTo(17, 40, 12, 88);
    ctx.quadraticCurveTo(8, 102, 0, 102);
    ctx.quadraticCurveTo(-8, 102, -12, 88);
    ctx.quadraticCurveTo(-17, 40, -15, -20);
    ctx.quadraticCurveTo(-13, -70, 0, -118);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Canopy.
    ctx.fillStyle = '#2b4a68';
    ctx.beginPath();
    ctx.ellipse(0, -58, 9, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(180, 220, 255, 0.7)';
    ctx.beginPath();
    ctx.ellipse(-3, -66, 3.5, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail fin and stabilisers.
    ctx.fillStyle = '#d84a35';
    ctx.beginPath();
    ctx.moveTo(-4, 78);
    ctx.lineTo(-4, 108);
    ctx.lineTo(4, 108);
    ctx.lineTo(4, 78);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c8ccd4';
    ctx.beginPath();
    ctx.moveTo(-10, 84);
    ctx.lineTo(-52, 100);
    ctx.lineTo(-50, 108);
    ctx.lineTo(-8, 96);
    ctx.lineTo(8, 96);
    ctx.lineTo(50, 108);
    ctx.lineTo(52, 100);
    ctx.lineTo(10, 84);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Navigation lights: red port, green starboard.
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-178, 58, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#34d17b';
    ctx.beginPath();
    ctx.arc(178, 58, 4, 0, Math.PI * 2);
    ctx.fill();
    // Registration on the tail.
    ctx.fillStyle = '#f2f4f7';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KESTREL', 0, 100);
    ctx.restore();
    // Speed lines at high speed.
    if (state.phase === 'fly' && plane.speed > 72) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) {
        const lx = ((i * 173 + 40) % W);
        const ly = ((i * 97 + 120) % (H - 200)) + 60;
        const len = 20 + ((plane.speed - 72) / 3);
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx, ly + len);
        ctx.stroke();
      }
    }
  }

  function drawHud(state) {
    const { plane, throttle, fuel, score, sortie, rings, nextRing, timeLeft, message, messageAt, now } = state;
    const hdg = headingDeg(plane.yaw);
    const alt = Math.max(0, Math.round(plane.y * 3.28));
    const spd = Math.round(plane.speed * 1.9);
    // Top bar: mission, score, clock.
    ctx.fillStyle = 'rgba(8, 16, 30, 0.55)';
    ctx.fillRect(0, 0, W, 46);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f2f4f7';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(sortie.name, 16, 20);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#ffc94d';
    ctx.fillText(`RINGS ${rings.filter((r) => r.passed).length}/${rings.length}   SCORE ${score}`, 16, 39);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f2f4f7';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(`ALT ${alt} ft`, W - 300, 20);
    ctx.fillText(`SPD ${spd} kt`, W - 170, 20);
    ctx.fillText(`HDG ${String(Math.round(hdg)).padStart(3, '0')}°`, W - 16, 20);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = timeLeft < 30 ? '#ff6b5e' : '#9fb4d8';
    ctx.fillText(`TIME ${Math.max(0, Math.ceil(timeLeft))}s`, W - 16, 39);
    // Compass strip under the top bar.
    const stripY = 62;
    ctx.fillStyle = 'rgba(8, 16, 30, 0.45)';
    ctx.fillRect(CX - 190, stripY - 14, 380, 26);
    ctx.fillStyle = '#f2f4f7';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let off = -60; off <= 60; off += 15) {
      const d = Math.round(((hdg + off) % 360 + 360) % 360);
      const x = CX + off * 3;
      const label = d % 45 === 0 ? COMPASS_POINTS[Math.round(d / 45) % 8] : String(d);
      ctx.fillText(label, x, stripY + 4);
      ctx.fillRect(x, stripY - 12, 1, off % 45 === 0 ? 7 : 4);
    }
    ctx.fillStyle = '#ffc94d';
    ctx.beginPath();
    ctx.moveTo(CX, stripY - 16);
    ctx.lineTo(CX - 6, stripY - 26);
    ctx.lineTo(CX + 6, stripY - 26);
    ctx.closePath();
    ctx.fill();
    // Centre flight-path marker.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CX, CY, 12, 0, Math.PI * 2);
    ctx.moveTo(CX - 22, CY);
    ctx.lineTo(CX - 12, CY);
    ctx.moveTo(CX + 12, CY);
    ctx.lineTo(CX + 22, CY);
    ctx.moveTo(CX, CY - 22);
    ctx.lineTo(CX, CY - 12);
    ctx.stroke();
    drawInstruments(state);
    // Flash message.
    if (message && now - messageAt < 2600) {
      const alpha = clamp(1 - (now - messageAt - 1800) / 800, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffc94d';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillText(message, CX, H * 0.3);
      ctx.restore();
    }
    // Warnings.
    const groundH = state.world.heightAt(plane.x, plane.z);
    const agl = plane.y - groundH;
    let warn = null;
    if (state.phase === 'fly' && agl < 14 && plane.speed > 30) warn = 'PULL UP';
    else if (state.phase === 'fly' && fuel < 18) warn = 'LOW FUEL — LAND ON THE STRIP';
    else if (state.phase === 'fly' && plane.speed < 30 && plane.y > groundH + 8) warn = 'STALL — THROTTLE UP';
    if (warn && Math.floor(now / 450) % 2 === 0) {
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff6b5e';
      ctx.fillText(warn, CX, H * 0.38);
    }
  }

  function drawInstruments(state) {
    const { plane, throttle, fuel } = state;
    const panelY = H - 118;
    ctx.fillStyle = 'rgba(8, 16, 30, 0.72)';
    ctx.beginPath();
    ctx.roundRect(0, panelY, W, 118, [18, 18, 0, 0]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 190, 230, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const cx0 = 92;
    const cy0 = panelY + 58;
    // Attitude indicator.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx0, cy0, 44, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx0, cy0);
    ctx.rotate(-plane.roll);
    ctx.translate(0, clamp(plane.pitch, -0.6, 0.6) * 60);
    ctx.fillStyle = '#3f7fb8';
    ctx.fillRect(-50, -60, 100, 60);
    ctx.fillStyle = '#8a6b46';
    ctx.fillRect(-50, 0, 100, 60);
    ctx.fillStyle = '#f2f4f7';
    ctx.fillRect(-50, -1.5, 100, 3);
    ctx.restore();
    ctx.strokeStyle = '#c8ccd4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx0, cy0, 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffc94d';
    ctx.beginPath();
    ctx.moveTo(cx0 - 18, cy0);
    ctx.lineTo(cx0 - 6, cy0);
    ctx.lineTo(cx0, cy0 - 4);
    ctx.lineTo(cx0 + 6, cy0);
    ctx.lineTo(cx0 + 18, cy0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9fb4d8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', cx0, panelY + 112);
    // Altimeter tape.
    drawTape(220, panelY, 90, 96, 'ALT ft', Math.round(plane.y * 3.28), 100, '#4dd2ff');
    // Airspeed tape.
    drawTape(330, panelY, 90, 96, 'SPD kt', Math.round(plane.speed * 1.9), 20, '#39d98a');
    // Vertical speed.
    const vsi = Math.round(plane.vy * 196);
    drawTape(440, panelY, 90, 96, 'V/S fpm', vsi, 200, '#e8a56b', true);
    // Fuel gauge.
    const fx = 570;
    ctx.fillStyle = '#101c30';
    ctx.fillRect(fx, panelY + 18, 150, 18);
    ctx.fillStyle = fuel < 20 ? '#ff6b5e' : '#39d98a';
    ctx.fillRect(fx, panelY + 18, 150 * clamp(fuel / 110, 0, 1), 18);
    ctx.strokeStyle = '#c8ccd4';
    ctx.strokeRect(fx, panelY + 18, 150, 18);
    ctx.fillStyle = '#f2f4f7';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`FUEL ${Math.round(fuel)}%`, fx, panelY + 52);
    // Throttle bar.
    ctx.fillStyle = '#101c30';
    ctx.fillRect(fx, panelY + 62, 150, 18);
    ctx.fillStyle = '#ffc94d';
    ctx.fillRect(fx, panelY + 62, 150 * clamp(throttle, 0, 1), 18);
    ctx.strokeStyle = '#c8ccd4';
    ctx.strokeRect(fx, panelY + 62, 150, 18);
    ctx.fillText(`THR ${Math.round(throttle * 100)}%`, fx, panelY + 96);
    // Next-ring readout.
    const ring = state.rings[state.nextRing];
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f2f4f7';
    ctx.font = 'bold 15px system-ui, sans-serif';
    if (state.phase === 'complete' || state.phase === 'win') {
      ctx.fillText('SORTIE COMPLETE — PRESS ENTER', 780, panelY + 30);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = '#9fb4d8';
      ctx.fillText(`Final score ${state.score} · Time bonus +${state.lastBonus}`, 780, panelY + 52);
    } else if (ring) {
      const dist = Math.max(0, Math.round(Math.hypot(ring.x - plane.x, ring.y - plane.y, ring.z - plane.z)));
      ctx.fillText(`NEXT RING ${state.nextRing + 1}/${state.rings.length}`, 780, panelY + 30);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = '#9fb4d8';
      ctx.fillText(`${dist} m ahead · ${Math.round(ring.y * 3.28)} ft up`, 780, panelY + 52);
      const bearing = Math.atan2(ring.x - plane.x, ring.z - plane.z);
      const rel = Math.round(((bearing - plane.yaw) * 180) / Math.PI);
      ctx.fillText(rel === 0 ? 'dead ahead' : rel > 0 ? `bear ${rel}° right` : `bear ${-rel}° left`, 780, panelY + 74);
    } else {
      ctx.fillText('ALL RINGS FLOWN — LAND ON THE STRIP', 780, panelY + 30);
    }
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#9fb4d8';
    ctx.fillText('W/S throttle · arrows / mouse steer · Space brake · R restart', 780, panelY + 100);
  }

  function drawTape(x, panelY, w, h, label, value, step, color, signed = false) {
    const y0 = panelY + 12;
    ctx.fillStyle = '#101c30';
    ctx.fillRect(x, y0, w, h);
    ctx.strokeStyle = '#c8ccd4';
    ctx.strokeRect(x, y0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y0, w, h);
    ctx.clip();
    const mid = y0 + h / 2;
    ctx.fillStyle = '#9fb4d8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let k = -2; k <= 2; k++) {
      const v = Math.round((value + k * step) / step) * step;
      if (signed && v === 0 && value < 0) continue;
      const y = mid + ((value - v) / step) * 18;
      if (y < y0 + 4 || y > y0 + h - 4) continue;
      ctx.fillText(String(v), x + w - 8, y + 4);
      ctx.fillRect(x + w - 24, y, 16, 1);
    }
    ctx.restore();
    ctx.fillStyle = color;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(value), x + w / 2, y0 + h / 2 + 5);
    ctx.fillStyle = '#9fb4d8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(label, x + w / 2, panelY + 112);
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(6, 12, 24, 0.42)';
    ctx.fillRect(0, 0, W, H);
    const pw = 640;
    const ph = 150 + lines.length * 30;
    const px = CX - pw / 2;
    const py = H * 0.5 - ph / 2 - 90;
    ctx.fillStyle = 'rgba(10, 20, 38, 0.94)';
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 18);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillText(title, CX, py + 62);
    ctx.fillStyle = '#f2f4f7';
    ctx.font = '17px system-ui, sans-serif';
    lines.forEach((line, i) => {
      ctx.fillText(line, CX, py + 104 + i * 30);
    });
  }

  function render(state, time) {
    ctx.clearRect(0, 0, W, H);
    drawSky(state, time);
    drawMountains(state);
    drawGround(state);
    drawRings(state);
    drawPlane(state);
    if (state.phase !== 'title') drawHud(state);
    if (state.phase === 'title') {
      overlay('KESTREL RIDGE', [
        'Canyon Courier — fly the dawn mail run through the rings,',
        'then bring her home to the strip. Mind the fuel and the rocks.',
        'W/S throttle · arrow keys or mouse to steer · Space airbrake',
        'Click or press Enter to fly',
      ], '#ffc94d');
    } else if (state.phase === 'crashed') {
      overlay('CRASHED', [
        state.crashCause || 'The ridge claims another courier.',
        `Score ${state.score} · Rings ${state.rings.filter((r) => r.passed).length}/${state.rings.length}`,
        'Press R or Enter to fly again',
      ], '#ff6b5e');
    } else if (state.phase === 'landed') {
      overlay('TOUCHDOWN', [
        'Wheels down on the strip — tanks refilled, mail delivered.',
        `Score ${state.score} · Rings ${state.rings.filter((r) => r.passed).length}/${state.rings.length}`,
        'Press Enter to take off for the next leg',
      ], '#39d98a');
    } else if (state.phase === 'complete') {
      overlay('SORTIE COMPLETE', [
        `${state.sortie.name} — every ring flown.`,
        `Score ${state.score} · Time bonus +${state.lastBonus}`,
        'Press Enter for the next sortie',
      ], '#ffc94d');
    } else if (state.phase === 'win') {
      overlay('COURIER LEGEND', [
        'All three sorties flown. The valley knows your name now.',
        `Final score ${state.score}`,
        'Press R to fly the valley again',
      ], '#ffc94d');
    }
  }

  return { render };
}
