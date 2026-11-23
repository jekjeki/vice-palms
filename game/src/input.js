// ============================================================================
// VICE PALMS — input.js
// Keyboard + mouse. Edge-triggered presses via wasPressed(); callers must call
// endFrame() once per tick. Prevents scrolling / context menu on game keys.
// ============================================================================

import { clamp } from './util.js';

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'KeyF', 'KeyE', 'KeyH', 'KeyQ', 'Enter',
  'Escape', 'Digit1', 'Digit2', 'KeyM', 'Tab',
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();       // currently held
    this.pressed = new Set();    // pressed this tick (cleared on endFrame)
    this.mouse = { x: 640, y: 360, down: false, pressed: false, rdown: false };
    this.anyKey = false;         // set on any keypress (title advance)
    this.gesture = false;        // set on first real input (audio unlock)
    this.enabled = true;

    this._kd = (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.keys.add(e.code);
        this.pressed.add(e.code);
        this.anyKey = true;
        this.gesture = true;
      }
    };
    this._ku = (e) => {
      this.keys.delete(e.code);
    };
    this._blur = () => {
      this.keys.clear();
      this.mouse.down = false;
    };
    this._mm = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = clamp(((e.clientX - r.left) / r.width) * canvas.width, 0, canvas.width);
      this.mouse.y = clamp(((e.clientY - r.top) / r.height) * canvas.height, 0, canvas.height);
    };
    this._md = (e) => {
      if (e.button === 0) { this.mouse.down = true; this.mouse.pressed = true; }
      if (e.button === 2) this.mouse.rdown = true;
      this.gesture = true;
      e.preventDefault();
    };
    this._mu = (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rdown = false;
    };
    this._ctx = (e) => e.preventDefault();

    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
    window.addEventListener('mousemove', this._mm);
    canvas.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    canvas.addEventListener('contextmenu', this._ctx);
  }

  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('blur', this._blur);
    window.removeEventListener('mousemove', this._mm);
    window.removeEventListener('mouseup', this._mu);
    this.canvas.removeEventListener('mousedown', this._md);
    this.canvas.removeEventListener('contextmenu', this._ctx);
  }

  isDown(code) {
    return this.enabled && this.keys.has(code);
  }

  wasPressed(code) {
    return this.enabled && this.pressed.has(code);
  }

  wasPressedAny(codes) {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  // WASD / arrows / left stick as a normalized vector, y down (screen space).
  moveVec() {
    let x = 0, y = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1;
    if (!x && this._padLX) x = this._padLX;
    if (!y && this._padLY) y = this._padLY;
    if (x !== 0 && y !== 0) {
      const k = Math.SQRT1_2;
      x *= k; y *= k;
    }
    return { x, y };
  }

  throttleAxis() {
    let a = (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) -
            (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
    if (!a && this._padLY) a = -this._padLY;
    return a;
  }

  steerAxis() {
    let s = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) -
            (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    if (!s && this._padLX) s = this._padLX;
    return s;
  }

  sprinting() {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  handbrake() {
    return this.isDown('Space');
  }

  firing() {
    return this.mouse.down || this.isDown('ControlLeft') || this.isDown('ControlRight') || !!this._padFire;
  }

  // Menu confirm: Enter or Space or left click or pad A.
  confirm() {
    return this.pressed.has('Enter') || this.pressed.has('Space') || this.pressed.has('PadA') || this.mouse.pressed;
  }

  // Menu cancel.
  cancel() {
    return this.pressed.has('Escape') || this.pressed.has('Backspace');
  }

  // Menu up/down edges (single-step).
  menuDir() {
    let d = 0;
    if (this.pressed.has('ArrowUp') || this.pressed.has('KeyW')) d -= 1;
    if (this.pressed.has('ArrowDown') || this.pressed.has('KeyS')) d += 1;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.pressed = false;
    this.anyKey = false;
    this.pollGamepad();
  }

  // Minimal gamepad polling: left stick moves, A confirms, RT fires,
  // X enters/exits cars, RB cycles weapons. Silent when absent.
  pollGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let pad = null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) return;
    if (!this._padState) this._padState = {};
    const dead = (v) => (Math.abs(v) < 0.22 ? 0 : v);
    this._padLX = dead(pad.axes[0] || 0);
    this._padLY = dead(pad.axes[1] || 0);
    if (this._padLX || this._padLY) this.gesture = true;
    const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const edge = (name, i) => {
      const v = btn(i);
      if (v && !this._padState[name]) this.pressed.add(name);
      this._padState[name] = v;
    };
    if (btn(0)) { this.mouse.down = true; this.mouse.pressed = true; this.gesture = true; }
    edge('PadX', 2);
    if (this._padState['PadX']) {
      if (!this._padXSent) { this.pressed.add('KeyF'); this._padXSent = true; }
    } else this._padXSent = false;
    edge('PadRB', 5);
    if (this._padState['PadRB']) {
      if (!this._padRBSent) { this.pressed.add('KeyQ'); this._padRBSent = true; }
    } else this._padRBSent = false;
    this._padFire = btn(7);
    if (this._padFire) this.gesture = true;
    edge('PadStart', 9);
  }

  // world position of the cursor given camera (used for aiming)
  aimWorld(cam) {
    const sx = this.mouse.x - 640;
    const sy = this.mouse.y - 360;
    return {
      x: cam.x + sx / (cam.z * 7.2),
      y: cam.y + sy / (cam.z * 7.2),
    };
  }
}
