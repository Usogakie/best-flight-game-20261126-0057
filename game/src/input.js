// Keyboard and mouse input for Kestrel Ridge.
// Keys: W/S throttle, arrows pitch and bank, Space airbrake, R restart.
// Mouse: moving the pointer steers (bank follows pointer x, pitch follows
// pointer y), holding the left button adds throttle. The game reads only
// this module's snapshot each frame, so input never leaks into the model.

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, active: false, down: false, inside: false };

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }
    keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }

  function onKeyUp(e) {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) / rect.width - 0.5;
    mouse.y = (e.clientY - rect.top) / rect.height - 0.5;
    mouse.active = true;
    mouse.inside = true;
  }

  function onMouseDown(e) {
    if (e.button === 0) mouse.down = true;
  }

  function onMouseUp(e) {
    if (e.button === 0) mouse.down = false;
  }

  function onMouseLeave() {
    mouse.inside = false;
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);

  // One-frame edge trigger: true only on the frame the key went down.
  const pressed = new Set();
  const queue = [];
  window.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!pressed.has(k)) queue.push(k);
    pressed.add(k);
  });
  window.addEventListener('keyup', (e) => {
    pressed.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  });

  return {
    keys,
    mouse,
    // Snapshot for this frame: -1..1 bank, -1..1 pitch, throttle delta.
    snapshot() {
      let bank = 0;
      let pitch = 0;
      if (keys.has('ArrowLeft') || keys.has('a')) bank -= 1;
      if (keys.has('ArrowRight') || keys.has('d')) bank += 1;
      if (keys.has('ArrowUp')) pitch -= 1;
      if (keys.has('ArrowDown')) pitch += 1;
      if (mouse.active && mouse.inside) {
        bank += mouse.x * 1.6;
        pitch += mouse.y * 1.4;
      }
      let throttle = 0;
      if (keys.has('w')) throttle += 1;
      if (keys.has('s')) throttle -= 1;
      if (mouse.down) throttle += 0.6;
      const brake = keys.has(' ') || keys.has('Shift');
      return {
        bank: Math.max(-1, Math.min(1, bank)),
        pitch: Math.max(-1, Math.min(1, pitch)),
        throttle,
        brake,
      };
    },
    // Keys pressed since the last call (consumed).
    consumePressed() {
      const out = queue.splice(0, queue.length);
      return out;
    },
    has(key) {
      return keys.has(key);
    },
  };
}
