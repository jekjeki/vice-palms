// Keys and mouse. Held keys drive movement; single-press edges (steal a car, punch, pause)
// are consumed by the frame that reads them.

export class Input {
  constructor() {
    this.heldKeys = new Set();
    this.taps = new Set();
    this.pointerX = 0;
    this.pointerY = 0;
    this.pointerDown = false;
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.heldKeys.add(e.code);
      this.taps.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.heldKeys.delete(e.code));
    window.addEventListener('blur', () => { this.heldKeys.clear(); });
    window.addEventListener('mousemove', (e) => { this.pointerX = e.clientX; this.pointerY = e.clientY; });
    window.addEventListener('mousedown', (e) => { if (e.button === 0) this.taps.add('MouseLeft'); });
  }

  /** Normalised walk/drive axis from WASD or the arrows. */
  axis() {
    const right = this.held('KeyD') || this.held('ArrowRight');
    const left = this.held('KeyA') || this.held('ArrowLeft');
    const down = this.held('KeyS') || this.held('ArrowDown');
    const up = this.held('KeyW') || this.held('ArrowUp');
    return { x: (right ? 1 : 0) - (left ? 1 : 0), y: (down ? 1 : 0) - (up ? 1 : 0) };
  }

  held(code) { return this.heldKeys.has(code); }
  tap(code) { return this.taps.has(code); }
  endFrame() { this.taps.clear(); }
}
