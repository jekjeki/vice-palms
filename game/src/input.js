// Vice Palms — keyboard + mouse + gamepad input with per-frame edge detection.
// In staged-shot mode `enabled` is false and every query returns false, so the
// recorder's screenshots are deterministic.

import { KEYS } from './config.js';

const GAME_CODES = new Set([
  ...KEYS.up, ...KEYS.down, ...KEYS.left, ...KEYS.right, ...KEYS.sprint,
  ...KEYS.enter, ...KEYS.shoot, ...KEYS.handbrake, ...KEYS.weapon,
  ...KEYS.pause, ...KEYS.confirm, ...KEYS.mute, ...KEYS.radio, ...KEYS.map, 'Tab',
]);

// Standard-gamepad button indices.
const GP = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = true;
    this.keys = new Set();
    this.pressedSet = new Set();
    this.anyPressedFlag = false;
    this.mouse = { x: 640, y: 360, down: false, clicked: false };
    this.onAny = null;
    this.pad = null;          // last polled gamepad
    this.gpPrev = new Set();  // buttons held last frame (edge detection)
    this.gpPressed = new Set();
    this.gpVibeT = 0;

    window.addEventListener('keydown', (e) => {
      if (GAME_CODES.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (!this.enabled) return;
      this.keys.add(e.code);
      this.pressedSet.add(e.code);
      this.anyPressedFlag = true;
      if (this.onAny) this.onAny();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.enabled) {
        this.mouse.down = true;
        this.mouse.clicked = true;
        if (this.onAny) this.onAny();
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('gamepadconnected', (e) => {
      this.padIndex = e.gamepad.index;
    });
  }

  /** Poll the first connected gamepad and merge it with key state. */
  pollPad(dt) {
    this.gpPressed.clear();
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && (pads[this.padIndex] || pads[0]);
      this.pad = gp || null;
      if (!gp || !this.enabled) return;
      for (let i = 0; i < gp.buttons.length; i++) {
        const down = gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
        if (down && !this.gpPrev.has(i)) {
          this.gpPressed.add(i);
          this.anyPressedFlag = true;
          if (this.onAny) this.onAny();
        }
        if (down) this.gpPrev.add(i);
        else this.gpPrev.delete(i);
      }
      if (this.gpVibeT > 0) {
        this.gpVibeT -= dt;
        this.vibrate(Math.min(1, this.gpVibeT), 0.4);
      }
    } catch { /* no gamepad support */ }
  }

  /** Rumble if the pad supports it. */
  vibrate(strength, ms) {
    try {
      const a = this.pad && this.pad.vibrationActuator;
      if (a && a.playEffect) {
        a.playEffect('dual-rumble', {
          startDelay: 0, duration: ms,
          weakMagnitude: strength * 0.6, strongMagnitude: strength,
        });
      }
    } catch { /* ignore */ }
  }

  /** Gamepad-held state for a logical action. */
  gpDown(action) {
    if (!this.pad) return false;
    const b = this.pad.buttons;
    switch (action) {
      case 'up': return b[GP.UP] && b[GP.UP].pressed;
      case 'down': return b[GP.DOWN] && b[GP.DOWN].pressed;
      case 'left': return b[GP.LEFT] && b[GP.LEFT].pressed;
      case 'right': return b[GP.RIGHT] && b[GP.RIGHT].pressed;
      case 'sprint': return b[GP.L3] && b[GP.L3].pressed;
      case 'enter': return b[GP.A] && b[GP.A].pressed;
      case 'shoot': return (b[GP.X] && b[GP.X].pressed) || (b[GP.RT] && b[GP.RT].value > 0.5);
      case 'handbrake': return b[GP.B] && b[GP.B].pressed;
      case 'pause': return b[GP.START] && b[GP.START].pressed;
      default: return false;
    }
  }

  /** Left stick vector, deadzoned. */
  gpStick() {
    if (!this.pad) return null;
    const x = this.pad.axes[0] || 0;
    const y = this.pad.axes[1] || 0;
    const dead = 0.22;
    if (Math.abs(x) < dead && Math.abs(y) < dead) return { x: 0, y: 0 };
    return { x, y };
  }

  /** True while any of the given codes (or pad action) is held. */
  down(codes) {
    if (!this.enabled) return false;
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** True only on the frame the key went down (keys or pad edge). */
  pressed(codes) {
    if (!this.enabled) return false;
    for (const c of codes) if (this.pressedSet.has(c)) return true;
    return this.gpPressed.size > 0 && this.gpActionPressed(codes);
  }

  gpActionPressed(codes) {
    // map key codes to the pad edge set where a sensible analog exists
    if (codes === KEYS.enter) return this.gpPressed.has(GP.A);
    if (codes === KEYS.up) return this.gpPressed.has(GP.UP);
    if (codes === KEYS.down) return this.gpPressed.has(GP.DOWN);
    if (codes === KEYS.pause) return this.gpPressed.has(GP.START);
    if (codes === KEYS.weapon) return this.gpPressed.has(GP.Y);
    return false;
  }

  /** True on the frame any key/click/pad input happened (audio unlock). */
  anyPressed() {
    return this.anyPressedFlag || this.mouse.clicked;
  }

  /** Move axes in [-1, 1], y down — keys + left stick merged. */
  axis() {
    let x = 0, y = 0;
    if (this.down(KEYS.left) || this.gpDown('left')) x -= 1;
    if (this.down(KEYS.right) || this.gpDown('right')) x += 1;
    if (this.down(KEYS.up) || this.gpDown('up')) y -= 1;
    if (this.down(KEYS.down) || this.gpDown('down')) y += 1;
    const st = this.gpStick();
    if (st && (st.x || st.y)) { x = st.x; y = st.y; }
    if (x && y && Math.abs(x) > 0.5 && Math.abs(y) > 0.5) { x *= 0.8; y *= 0.8; }
    return { x, y };
  }

  /** Called at the very end of each frame. */
  endFrame() {
    this.pressedSet.clear();
    this.mouse.clicked = false;
    this.anyPressedFlag = false;
  }
}
