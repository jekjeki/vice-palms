// input.js — keyboard + mouse state with edge detection
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressedSet = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.canvas = canvas;
    this.handlers = [];

    const codeMap = (e) => {
      let k = e.code;
      if (k.startsWith('Key')) k = k.slice(3);
      else if (k.startsWith('Digit')) k = 'D' + k.slice(5);
      else if (k === 'ArrowUp') k = 'UP';
      else if (k === 'ArrowDown') k = 'DOWN';
      else if (k === 'ArrowLeft') k = 'LEFT';
      else if (k === 'ArrowRight') k = 'RIGHT';
      else if (k === 'Space') k = 'SPACE';
      else if (k === 'Enter') k = 'ENTER';
      else if (k === 'Escape') k = 'ESC';
      else if (k === 'ShiftLeft' || k === 'ShiftRight') k = 'SHIFT';
      else if (k === 'ControlLeft' || k === 'ControlRight') k = 'CTRL';
      return k;
    };

    addEventListener('keydown', (e) => {
      const k = codeMap(e);
      if (['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'ENTER', 'ESC', 'TAB'].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) this.pressedSet.add(k);
      this.keys.add(k);
      for (const h of this.handlers) h('down', k, e);
    }, { passive: false });
    addEventListener('keyup', (e) => {
      const k = codeMap(e);
      this.keys.delete(k);
      for (const h of this.handlers) h('up', k, e);
    });
    addEventListener('blur', () => { this.keys.clear(); });

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      for (const h of this.handlers) h('down', 'MOUSE1', e);
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(name) { return this.keys.has(name); }
  pressed(name) { return this.pressedSet.has(name); }
  anyPressed(...names) { return names.some((n) => this.pressedSet.has(n)); }
  anyDown(...names) { return names.some((n) => this.keys.has(n)); }
  on(handler) { this.handlers.push(handler); }

  // call once per frame AFTER the game consumed edges
  endFrame() { this.pressedSet.clear(); this.mouse.clicked = false; }
}
