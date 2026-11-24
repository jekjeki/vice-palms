// input.js — keyboard + mouse. Edge-detect via pressed sets cleared each frame.

import { CFG } from './config.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { x: 640, y: 360, down: false, pressed: false };
    this.ignored = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.add(k);
      this.pressed.add(k);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const sx = CFG.VIEW_W / r.width, sy = CFG.VIEW_H / r.height;
      this.mouse.x = (e.clientX - r.left) * sx;
      this.mouse.y = (e.clientY - r.top) * sy;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.down = true; this.mouse.pressed = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** continuous action values */
  axis() {
    let x = 0, y = 0;
    if (this.keys.has('a') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('w') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('s') || this.keys.has('ArrowDown')) y += 1;
    return { x, y };
  }

  carControls() {
    return {
      throttle: (this.keys.has('w') || this.keys.has('ArrowUp')) ? 1 : 0,
      brake: (this.keys.has('s') || this.keys.has('ArrowDown')) ? 1 : 0,
      steer: ((this.keys.has('a') || this.keys.has('ArrowLeft')) ? -1 : 0) + ((this.keys.has('d') || this.keys.has('ArrowRight')) ? 1 : 0),
      handbrake: this.keys.has(' '),
      horn: this.keys.has('h'),
    };
  }

  /** consume one edge */
  took(k) {
    if (this.pressed.has(k)) {
      this.pressed.delete(k);
      return true;
    }
    return false;
  }

  /** true while held */
  held(k) {
    return this.keys.has(k);
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.pressed = false;
  }
}
