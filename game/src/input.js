// input.js — keyboard + mouse handling with edge detection.
// The game reads held state for driving and one-shot state for actions.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();       // currently held (KeyboardEvent.code)
    this.pressedSet = new Set(); // went down since last endFrame()
    this.releasedSet = new Set();
    this.mouse = { x: 0, y: 0, wx: 0, wy: 0, down: false, clicked: false, rdown: false };
    this.anyKeyPresses = 0;
    this.onAnyKey = null;        // title screens use this to dismiss

    this._kd = (e) => {
      if (e.repeat) { e.preventDefault(); return; }
      const code = e.code;
      if (!this.keys.has(code)) {
        this.keys.add(code);
        this.pressedSet.add(code);
        this.anyKeyPresses++;
        if (this.onAnyKey) this.onAnyKey(code);
      }
      // stop the page from scrolling around while playing
      if (PREVENT.has(code)) e.preventDefault();
    };
    this._ku = (e) => {
      const code = e.code;
      if (this.keys.has(code)) {
        this.keys.delete(code);
        this.releasedSet.add(code);
      }
    };
    this._mm = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    };
    this._md = (e) => {
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      if (e.button === 2) this.mouse.rdown = true;
      this._mm(e);
    };
    this._mu = (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rdown = false;
    };
    this._ctx = (e) => e.preventDefault();
    this._blur = () => { this.keys.clear(); this.mouse.down = false; };

    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('mousemove', this._mm);
    window.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    window.addEventListener('contextmenu', this._ctx);
    window.addEventListener('blur', this._blur);
  }

  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('mousemove', this._mm);
    window.removeEventListener('mousedown', this._md);
    window.removeEventListener('mouseup', this._mu);
    window.removeEventListener('contextmenu', this._ctx);
    window.removeEventListener('blur', this._blur);
  }

  /** Held key. Accepts 'KeyW' style codes or the alias map keys below. */
  key(code) { return this.keys.has(code); }

  /** Went down this frame (cleared by endFrame). */
  pressed(code) { return this.pressedSet.has(code); }

  /** Went up this frame. */
  released(code) { return this.releasedSet.has(code); }

  /** Consume a press: true once, then cleared. */
  consume(code) {
    if (this.pressedSet.has(code)) {
      this.pressedSet.delete(code);
      return true;
    }
    return false;
  }

  /** Axis helper for driving: -1..1 from A/D or arrows. */
  steerAxis() {
    let s = 0;
    if (this.key('KeyA') || this.key('ArrowLeft')) s -= 1;
    if (this.key('KeyD') || this.key('ArrowRight')) s += 1;
    return s;
  }

  /** Throttle axis: 1 accel, -1 brake/reverse. */
  throttleAxis() {
    if (this.key('KeyW') || this.key('ArrowUp')) return 1;
    if (this.key('KeyS') || this.key('ArrowDown')) return -1;
    return 0;
  }

  /** Movement vector for on-foot walking, normalized-ish. */
  moveVec() {
    let x = 0, y = 0;
    if (this.key('KeyW') || this.key('ArrowUp')) y -= 1;
    if (this.key('KeyS') || this.key('ArrowDown')) y += 1;
    if (this.key('KeyA') || this.key('ArrowLeft')) x -= 1;
    if (this.key('KeyD') || this.key('ArrowRight')) x += 1;
    return { x, y };
  }

  sprinting() {
    return this.key('ShiftLeft') || this.key('ShiftRight');
  }

  handbrake() {
    return this.key('Space');
  }

  firing() {
    return this.mouse.down || this.key('ControlLeft') || this.key('ControlRight');
  }

  /** Fire pressed this frame (edge). */
  fired() {
    return this.mouse.clicked || this.pressed('ControlLeft') || this.pressed('ControlRight');
  }

  /** Call at the very end of each frame. */
  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.mouse.clicked = false;
  }

  /** Test hooks: simulate a key press without a real event. */
  fakePress(code) {
    this.keys.add(code);
    this.pressedSet.add(code);
    this.anyKeyPresses++;
    if (this.onAnyKey) this.onAnyKey(code);
  }

  fakeRelease(code) {
    this.keys.delete(code);
    this.releasedSet.add(code);
  }

  fakeClick(x, y) {
    this.mouse.x = x;
    this.mouse.y = y;
    this.mouse.down = true;
    this.mouse.clicked = true;
  }
}

// Keys that would scroll or interfere with the page.
const PREVENT = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Tab', 'PageUp', 'PageDown', 'Home', 'End',
]);

/** Human-readable control sheet, shown on the title and pause screens. */
export const CONTROLS = [
  ['W A S D / Arrows', 'walk · drive'],
  ['Shift', 'sprint'],
  ['Mouse', 'aim (on foot)'],
  ['Left click / Ctrl', 'punch · shoot'],
  ['1 / 2', 'fists / pistol'],
  ['E', 'enter / exit car or boat'],
  ['F', 'carjack'],
  ['Space', 'handbrake'],
  ['R', 'radio station (Shift-R back)'],
  ['M', 'city map'],
  ['V / P', 'camera zoom / photo mode'],
  ['Esc', 'pause'],
];
