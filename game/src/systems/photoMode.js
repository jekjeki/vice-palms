// Photo mode: the P key parks the night, hands you the camera, and lets you frame the city.
// Free pan and zoom, five colour filters, corner brackets, and a capture that stamps the
// Vice Palms watermark before folding the frame into an in-memory gallery. Shots live as
// data URLs — nothing leaves the page, no network, no files.
//
// Integration: Game constructs one PhotoMode; main.js pauses the world while `active`, feeds
// update(input, dt) for camera control, calls maybeCapture(canvas) right after the world render
// (so HUD never leaks into a shot), and draws the viewfinder with draw(ctx, W, H) last.

import { clamp, lerp } from '../util.js';

/** Camera travel speed, world units per second, at zoom 1. */
const PAN_SPEED = 620;
/** Zoom bounds. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.6;
/** Gallery cap. */
const SHOTS_MAX = 12;

/** The filter deck. `css` rides ctx.filter; `swatch` paints the viewfinder chip. */
const FILTERS = [
  { id: 'clear', name: 'CLEAR', css: 'none', swatch: '#e8ecf4' },
  { id: 'noir', name: 'NOIR', css: 'grayscale(1) contrast(1.25) brightness(0.92)', swatch: '#9aa3b8' },
  { id: 'vice', name: 'VICE', css: 'saturate(1.7) hue-rotate(-18deg) contrast(1.08)', swatch: '#ff3fa4' },
  { id: 'sunburn', name: 'SUNBURN', css: 'sepia(0.55) saturate(1.4) contrast(1.05)', swatch: '#ffc042' },
  { id: 'deep', name: 'DEEP', css: 'saturate(0.8) brightness(0.82) contrast(1.3) hue-rotate(200deg)', swatch: '#33e7ff' },
];

export class PhotoMode {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.cam = null;            // { x, y, zoom } while active
    this.filter = 0;
    this.wantShot = false;
    this.shots = [];            // { url, canvas, filter, t }
    this.hint = 0;              // seconds left on the current toast line
    this.toast = '';
    this.wheelK = 1;            // accumulated wheel zoom
    this.boundWheel = null;     // the lazy wheel listener
    this.flashT = 0;            // shutter flash overlay
    this.savedOnce = false;
  }

  // ---------------------------------------------------------------- enter / exit

  toggle() {
    if (this.active) this.exit();
    else this.enter();
  }

  enter() {
    if (this.active) return;
    const g = this.game;
    // Interiors are staged scenes; the camera stays honest there. Ask again outside.
    if (g.interiors.inside) {
      this.sayToast('PHOTO MODE: STEP OUTSIDE FIRST');
      return;
    }
    this.active = true;
    const c = g.camera;
    this.cam = { x: c.x, y: c.y, zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, c.zoom)) };
    this.flashT = 0;
    this.bindWheel();
    this.sayToast('PHOTO MODE — P TO EXIT · SPACE TO SHOOT');
    g.audio.blip(660);
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.cam = null;
    const g = this.game;
    g.audio.blip(440);
    if (!this.savedOnce && this.shots.length === 0) this.sayToast('');
  }

  /** The camera override the painter uses while the shutter is up. */
  camera() { return this.active ? this.cam : null; }

  sayToast(text) {
    this.toast = text;
    this.hint = text ? 3.4 : 0;
  }

  /** Wheel zoom binds lazily on first enter; never at import time. */
  bindWheel() {
    if (this.boundWheel) return;
    this.boundWheel = (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.wheelK *= Math.exp(-e.deltaY * 0.0011);
    };
    window.addEventListener('wheel', this.boundWheel, { passive: false });
  }

  // ---------------------------------------------------------------- per frame

  /** Driven with real frame dt while active: camera controls, filter cycling, shutter. */
  update(input, dt) {
    if (!this.active) return;
    const g = this.game;
    this.hint = Math.max(0, this.hint - dt);
    this.flashT = Math.max(0, this.flashT - dt * 3.4);

    // Pan: axis at a speed scaled by inverse zoom so a wide shot pans faster in world terms.
    const ax = input.axis();
    const speed = PAN_SPEED / this.cam.zoom * dt;
    this.cam.x += ax.x * speed;
    this.cam.y += ax.y * speed;
    // Sprint pan with shift.
    if (input.held('ShiftLeft') || input.held('ShiftRight')) {
      this.cam.x += ax.x * speed * 1.2;
      this.cam.y += ax.y * speed * 1.2;
    }
    // Zoom: keys and the wheel both feed a smoothed target.
    const zoomKeys = (input.held('KeyE') || input.held('Equal') ? -1 : 0) + (input.held('KeyQ') || input.held('Minus') ? 1 : 0);
    if (zoomKeys !== 0) this.wheelK *= Math.exp(zoomKeys * dt * 1.6);
    this.wheelK = clamp(this.wheelK, 0.2, 5);
    const target = clamp(this.cam.zoom * this.wheelK, ZOOM_MIN, ZOOM_MAX);
    this.cam.zoom = lerp(this.cam.zoom, target, Math.min(1, dt * 9));
    // Keep the wheel factor from compounding past the clamped zoom forever.
    if (this.cam.zoom === ZOOM_MIN || this.cam.zoom === ZOOM_MAX) this.wheelK = 1;
    else this.wheelK = target / this.cam.zoom;

    // Filter cycling.
    if (input.tap('KeyF')) {
      this.filter = (this.filter + 1) % FILTERS.length;
      this.sayToast(`FILTER: ${FILTERS[this.filter].name}`);
      g.audio.blip(520);
    }
    // Frame a shot: consumed by maybeCapture after the next world render.
    if (input.tap('Space')) this.wantShot = true;
  }

  /** Copy the just-rendered world frame through the filter, stamp the watermark, store it. */
  maybeCapture(canvas) {
    if (!this.active || !this.wantShot) return;
    this.wantShot = false;
    const src = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cap = document.createElement('canvas');
    cap.width = W; cap.height = H;
    const c = cap.getContext('2d');
    const css = FILTERS[this.filter].css;
    try { c.filter = css; } catch { /* filters unsupported: the clear frame is still a photo */ }
    c.drawImage(canvas, 0, 0);
    c.filter = 'none';
    // Watermark: wordmark in pink, mode line in cyan, both bottom-right.
    stampWatermark(c, W, H);
    let url = '';
    try { url = cap.toDataURL('image/jpeg', 0.88); } catch { /* tainted canvases cannot encode; keep the preview */ }
    this.shots.push({ url, canvas: cap, filter: FILTERS[this.filter].name, t: this.game.time });
    while (this.shots.length > SHOTS_MAX) this.shots.shift();
    this.flashT = 1;
    this.savedOnce = true;
    this.sayToast(`SHOT SAVED — ${this.shots.length}/${SHOTS_MAX}`);
    this.game.audio.blip(880);
    this.game.audio.shot(0.5);
    this.game.dialog?.push('ambient', 'CAMERA', 'Frame saved to the reel.', 2, 1);
  }

  // ---------------------------------------------------------------- viewfinder

  /** The viewfinder HUD: brackets, filter chip, controls line, reel strip, shutter flash. */
  draw(ctx, W, H) {
    if (!this.active) return;
    const f = FILTERS[this.filter];
    // Corner brackets framing the live frame.
    this.brackets(ctx, W, H);
    // Top strip: mode + filter chip + zoom readout.
    ctx.textAlign = 'left';
    ctx.font = 'bold 17px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#33e7ff';
    ctx.fillText('PHOTO MODE', 28, 34);
    ctx.font = '13px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#9aa3b8';
    ctx.fillText(`WASD/ARROWS pan · Q/E zoom · [F] filter · SPACE shoot · P exit`, 28, 56);
    // Filter chip.
    const chipX = 28, chipY = 70;
    ctx.fillStyle = f.swatch;
    ctx.fillRect(chipX, chipY, 14, 14);
    ctx.fillStyle = f.swatch;
    ctx.font = 'bold 14px Consolas, "Courier New", monospace';
    ctx.fillText(`${f.name}`, chipX + 22, chipY + 12);
    // Zoom readout as a fake focal length.
    const mm = Math.round(24 * this.cam.zoom);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9aa3b8';
    ctx.fillText(`${mm}mm`, W - 28, 34);
    // Reel strip along the bottom: recent shots as framed thumbnails.
    this.reel(ctx, W, H);
    // Toast line under the brackets.
    if (this.hint > 0 && this.toast) {
      ctx.globalAlpha = Math.min(1, this.hint / 0.5);
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px Consolas, "Courier New", monospace';
      ctx.fillStyle = '#e8ecf4';
      ctx.fillText(this.toast, W / 2, H - 74);
      ctx.globalAlpha = 1;
    }
    // Shutter flash: a quick white bloom when a shot lands.
    if (this.flashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(this.flashT * 0.35).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  brackets(ctx, W, H) {
    const inset = 24, L = 34;
    ctx.strokeStyle = 'rgba(232,236,244,0.6)';
    ctx.lineWidth = 2;
    const corner = (x, y, dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * L, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * L);
      ctx.stroke();
    };
    corner(inset, inset, 1, 1);
    corner(W - inset, inset, -1, 1);
    corner(inset, H - inset, 1, -1);
    corner(W - inset, H - inset, -1, -1);
    // Rule-of-thirds ticks, faint.
    ctx.strokeStyle = 'rgba(232,236,244,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 3, inset); ctx.lineTo(W / 3, H - inset);
    ctx.moveTo(W * 2 / 3, inset); ctx.lineTo(W * 2 / 3, H - inset);
    ctx.moveTo(inset, H / 3); ctx.lineTo(W - inset, H / 3);
    ctx.moveTo(inset, H * 2 / 3); ctx.lineTo(W - inset, H * 2 / 3);
    ctx.stroke();
  }

  reel(ctx, W, H) {
    const n = this.shots.length;
    if (n === 0) return;
    const tw = 74, th = 46, gap = 8;
    const maxShow = Math.min(n, 6);
    const total = maxShow * tw + (maxShow - 1) * gap;
    let x = W - 28 - total;
    const y = H - 28 - th;
    ctx.textAlign = 'left';
    for (let i = n - maxShow; i < n; i++) {
      const shot = this.shots[i];
      const newest = i === n - 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = newest ? 'rgba(255,63,164,0.9)' : 'rgba(232,236,244,0.3)';
      ctx.lineWidth = newest ? 2 : 1;
      ctx.strokeRect(0, 0, tw, th);
      if (shot.canvas) {
        ctx.drawImage(shot.canvas, 0, 0, shot.canvas.width, shot.canvas.height, 1, 1, tw - 2, th - 2);
      }
      ctx.restore();
      x += tw + gap;
    }
    ctx.font = '11px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(232,236,244,0.6)';
    ctx.fillText(`REEL ${n}/${SHOTS_MAX}`, W - 28 - total, y - 6);
  }

  /** What a save would persist: the reel's metadata, not the pixels. */
  snapshot() {
    return { filter: this.filter, count: this.shots.length };
  }
}

/** The watermark, drawn straight onto a capture canvas. */
function stampWatermark(c, W, H) {
  const pad = 18;
  c.textAlign = 'right';
  c.font = 'bold 22px Consolas, "Courier New", monospace';
  c.fillStyle = 'rgba(2,3,9,0.7)';
  c.fillText('VICE PALMS', W - pad + 1, H - pad + 1);
  c.fillStyle = 'rgba(255,63,164,0.9)';
  c.fillText('VICE PALMS', W - pad, H - pad);
  c.font = '11px Consolas, "Courier New", monospace';
  c.fillStyle = 'rgba(51,231,255,0.85)';
  c.fillText('PHOTO MODE · NO NETWORK, NO ROCKSTAR, ALL NIGHT', W - pad, H - pad - 26);
}
