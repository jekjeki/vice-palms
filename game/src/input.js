// input.js — keyboard + mouse. All handlers no-op safe before canvas focus.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = Object.create(null);      // held, by KeyboardEvent.code
    this.hits = Object.create(null);      // edge triggers, cleared each frame
    this.mouse = { x: 0, y: 0, wx: 0, wy: 0, down: false, rdown: false };
    this.anyHit = false;                  // any key/mouse this frame
    this._lastAny = false;

    const kd = (e) => {
      if (e.repeat) {
        // still mark held
        this.keys[e.code] = true;
        return;
      }
      this.keys[e.code] = true;
      this.hits[e.code] = true;
      this.anyHit = true;
      if (PREVENT.has(e.code)) e.preventDefault();
      if (this.onGesture) this.onGesture();
    };
    const ku = (e) => { this.keys[e.code] = false; };
    const blur = () => { for (const k in this.keys) this.keys[k] = false; this.mouse.down = false; };

    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);

    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    };
    canvas.addEventListener('mousemove', (e) => { toLocal(e); });
    canvas.addEventListener('mousedown', (e) => {
      toLocal(e);
      if (e.button === 0) { this.mouse.down = true; this.hits['MouseL'] = true; }
      if (e.button === 2) { this.mouse.rdown = true; this.hits['MouseR'] = true; }
      this.anyHit = true;
      if (this.onGesture) this.onGesture();
      e.preventDefault();
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rdown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // touch acts as a virtual joystick-ish: move toward tap, tap = action
    canvas.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (t.clientX - r.left) * (canvas.width / r.width);
      this.mouse.y = (t.clientY - r.top) * (canvas.height / r.height);
      this.mouse.down = true;
      this.hits['MouseL'] = true;
      this.keys['Touch'] = true;
      this.anyHit = true;
      if (this.onGesture) this.onGesture();
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (t.clientX - r.left) * (canvas.width / r.width);
      this.mouse.y = (t.clientY - r.top) * (canvas.height / r.height);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      this.mouse.down = false;
      this.keys['Touch'] = false;
      e.preventDefault();
    }, { passive: false });
  }

  // held?
  key(code) { return !!this.keys[code]; }

  // edge-triggered since last endFrame()
  hit(code) { return !!this.hits[code]; }

  // Called once per frame BEFORE systems read edges (wires gamepad → keys).
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && (pads[0] || pads[1]);
    this.pad = pad || null;
    if (!pad) return;
    const dz = (v) => Math.abs(v) < 0.22 ? 0 : v;
    const lx = dz(pad.axes[0] || 0), ly = dz(pad.axes[1] || 0);
    // synthesize key states (do not clobber real keys)
    this.padState = this.padState || {};
    const set = (code, on, edge) => {
      if (on && !this.padState[code]) { this.keys[code] = true; if (edge) this.hits[code] = true; }
      else if (!on && this.padState[code]) { this.keys[code] = false; }
      this.padState[code] = on;
    };
    const rt = pad.buttons[7] ? pad.buttons[7].value : 0;
    const lt = pad.buttons[6] ? pad.buttons[6].value : 0;
    set('padRight', lx > 0.4 || rt > 0.3 && false, false);
    // movement mapped to the same codes the KEYMAP expects
    if (this._gpMode === 'foot') {
      set('KeyD', lx > 0.35, false);
      set('KeyA', lx < -0.35, false);
      set('KeyW', ly < -0.35 || rt > 0.25, false);
      set('KeyS', ly > 0.35, false);
    } else {
      set('KeyD', lx > 0.35 || rt > 0.25, false);
      set('KeyA', lx < -0.35 || lt > 0.25, false);
      set('KeyW', ly < -0.35, false);
      set('KeyS', ly > 0.35, false);
    }
    set('Space', !!pad.buttons[0] && pad.buttons[0].pressed, false);
    set('KeyF', !!pad.buttons[2] && pad.buttons[2].pressed, true);
    set('ShiftLeft', !!pad.buttons[10] && pad.buttons[10].pressed, false);
    set('Escape', !!pad.buttons[9] && pad.buttons[9].pressed, true);
    set('Enter', !!pad.buttons[0] && pad.buttons[0].pressed, true);
    set('KeyM', !!pad.buttons[3] && pad.buttons[3].pressed, true);
  }

  // Called once per frame AFTER all systems read edges.
  endFrame() {
    for (const k in this.hits) delete this.hits[k];
    this.anyHit = false;
  }

  // world-space mouse using the camera transform (set by renderer each frame)
  updateWorldMouse(cam) {
    this.mouse.wx = cam.x + (this.mouse.x - CFG_VIEW_W / 2) / cam.zoom;
    this.mouse.wy = cam.y + (this.mouse.y - CFG_VIEW_H / 2) / cam.zoom;
  }
}

// avoid importing config here to keep input dependency-free; the view size is
// a fixed compile-time constant of the game (see CFG.viewW/viewH).
const CFG_VIEW_W = 1280;
const CFG_VIEW_H = 720;

const PREVENT = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'Tab', 'Enter', 'Escape',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyE', 'KeyM',
]);

export const KEYMAP = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  horn: ['KeyH'],
  mute: ['KeyM'],
  pause: ['Escape', 'KeyP'],
};
