// ---------------------------------------------------------------------------
// input.js — keyboard + mouse. One instance, wired to the canvas/window.
// `wasPressed` is edge-triggered and cleared at end of frame.
// ---------------------------------------------------------------------------

import { VIEW } from './view.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, rdown: false, clicked: false, rclicked: false, moved: false, dx: 0, dy: 0 };
    this.wheelDelta = 0;
    this.anyKey = false;

    window.addEventListener('wheel', (e) => {
      this.wheelDelta = e.deltaY < 0 ? 1 : -1;
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) { return; }
      // keep the page from scrolling on gameplay keys
      const game = e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab';
      if (game) e.preventDefault();
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.anyKey = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
      this.mouse.rdown = false;
    });

    const rectPos = (e) => {
      const r = canvas.getBoundingClientRect();
      const nx = (e.clientX - r.left) * (VIEW.w / r.width);
      const ny = (e.clientY - r.top) * (VIEW.h / r.height);
      this.mouse.dx = nx - this.mouse.x;
      this.mouse.dy = ny - this.mouse.y;
      this.mouse.x = nx;
      this.mouse.y = ny;
    };
    canvas.addEventListener('mousemove', (e) => { rectPos(e); this.mouse.moved = true; });
    canvas.addEventListener('mousedown', (e) => {
      rectPos(e);
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      if (e.button === 2) { this.mouse.rdown = true; this.mouse.rclicked = true; }
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rdown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // gamepad (poll lazily each frame; optional hardware)
    this.pad = { axes: [0, 0], buttons: [], connected: false };
  }

  /** poll the first gamepad; exposes left stick + A/B/X + triggers */
  pollPad() {
    if (!navigator.getGamepads) return this.pad;
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (!p) continue;
      this.pad.connected = true;
      this.pad.axes = [p.axes[0] || 0, p.axes[1] || 0];
      this.pad.buttons = p.buttons.map((b) => b.pressed);
      // merge pad stick into keys as synthetic arrows
      const [ax, ay] = this.pad.axes;
      const dead = 0.22;
      this._synthetic('KeyA', ax < -dead);
      this._synthetic('KeyD', ax > dead);
      this._synthetic('KeyW', ay < -dead);
      this._synthetic('KeyS', ay > dead);
      if (p.buttons[0]) this._synthetic('Space', p.buttons[0].pressed);
      if (p.buttons[2]) this._synthetic('KeyF', p.buttons[2].pressed);
      return this.pad;
    }
    this.pad.connected = false;
    return this.pad;
  }

  _synthetic(code, down) {
    if (down && !this.keys.has(code)) this.pressed.add(code);
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  isDown(...codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  wasPressed(...codes) {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  /** call at the very end of the frame */
  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
    this.mouse.rclicked = false;
    this.mouse.moved = false;
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.wheelDelta = 0;
    this.anyKey = false;
  }
}
