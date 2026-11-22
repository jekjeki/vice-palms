// Keys and mouse. Held keys drive movement; single-press edges (steal a car, punch, pause)
// are consumed by the frame that reads them. The mouse position is tracked too, so the HUD
// and any future aim-assist know where the cursor rides.

export class Input {
  constructor() {
    this.heldKeys = new Set();
    this.taps = new Set();
    this.mx = 0; this.my = 0;
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.heldKeys.add(e.code);
      this.taps.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.heldKeys.delete(e.code));
    window.addEventListener('blur', () => { this.heldKeys.clear(); });
    window.addEventListener('mousemove', (e) => { this.mx = e.clientX; this.my = e.clientY; });
    window.addEventListener('mousedown', (e) => {
      this.mx = e.clientX; this.my = e.clientY;
      if (e.button === 0) this.taps.add('MouseLeft');
    });
    // The right button belongs to the game during a chase, not to the browser menu.
    window.addEventListener('contextmenu', (e) => e.preventDefault());
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
