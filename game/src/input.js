// Keyboard state. Movement reads a held-key map; discrete actions (enter car, horn, pause, shoot)
// read pressed-this-frame edges that the game clears after consuming them.

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); });
  }
  axis() {
    const x = (this.down.has('KeyD') || this.down.has('ArrowRight') ? 1 : 0) - (this.down.has('KeyA') || this.down.has('ArrowLeft') ? 1 : 0);
    const y = (this.down.has('KeyS') || this.down.has('ArrowDown') ? 1 : 0) - (this.down.has('KeyW') || this.down.has('ArrowUp') ? 1 : 0);
    return { x, y };
  }
  held(code) { return this.down.has(code); }
  hit(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); }
}
