// input.js — keyboard + mouse, with one-frame "pressed" edges.

export const keys = new Set();     // currently held (KeyboardEvent.code)
const pressed = new Set();         // pressed this frame
export const mouse = { x: 640, y: 360, down: false, clicked: false };
let anyKeyCb = null;

export function onAnyKey(cb) { anyKeyCb = cb; }

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (anyKeyCb) anyKeyCb(e.code);
    // stop the page from scrolling on arrows / space
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });

  const toLocal = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
    mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
  };
  canvas.addEventListener('mousemove', toLocal);
  canvas.addEventListener('mousedown', (e) => {
    toLocal(e);
    if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function key(code) { return keys.has(code); }
export function hit(code) { return pressed.has(code); }

// axes for the player on foot: -1..1
export function moveAxis() {
  let x = 0, y = 0;
  if (key('KeyW') || key('ArrowUp')) y -= 1;
  if (key('KeyS') || key('ArrowDown')) y += 1;
  if (key('KeyA') || key('ArrowLeft')) x -= 1;
  if (key('KeyD') || key('ArrowRight')) x += 1;
  return { x, y };
}

// called at the end of every sim frame
export function endFrame() {
  pressed.clear();
  mouse.clicked = false;
}
