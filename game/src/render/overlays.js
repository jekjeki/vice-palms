// Shared screen-space overlays: letterbox bars, the subtitle strip, toast plates, key prompts
// and the photo-mode furniture. One place so every system's UI reads from the same visual
// language — same fonts, same plate styles, same fades — and the HUD never disagrees with
// itself about how a caption looks.
//
// Every function is pure canvas drawing: take a context, draw, return. No state lives here.

const MONO = 'Consolas, "Courier New", monospace';
const PLATE_BG = 'rgba(5,7,15,0.62)';
const PLATE_EDGE = 'rgba(255,217,119,0.35)';

/** A rounded plate behind text, the same silhouette the objective banner uses. */
export function plate(ctx, x, y, w, h, r = 8) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draw a plate: fill, thin rim, ready for text on top. */
export function plateDraw(ctx, x, y, w, h, r = 8, edge = PLATE_EDGE) {
  ctx.fillStyle = PLATE_BG;
  plate(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  plate(ctx, x, y, w, h, r);
  ctx.stroke();
}

/** Wrap text into lines no wider than maxW; returns them. */
export function wrapLines(ctx, text, maxW) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** The cutscene letterbox: two black bars whose height follows `amount` (0..1). */
export function letterbox(ctx, W, H, amount) {
  if (amount <= 0.001) return;
  const h = H * 0.12 * amount;
  ctx.fillStyle = '#02030a';
  ctx.fillRect(0, 0, W, h);
  ctx.fillRect(0, H - h, W, h);
  // A hairline neon edge keeps the bars from reading as a rendering bug.
  ctx.fillStyle = 'rgba(255,63,164,0.25)';
  ctx.fillRect(0, h, W, 1);
  ctx.fillRect(0, H - h - 1, W, 1);
}

/** A subtitle line, centered, on a plate sized to the wrapped text. */
export function subtitle(ctx, W, H, speaker, text, alpha, color = '#ffd977') {
  if (alpha <= 0.01 || !text) return;
  ctx.globalAlpha = alpha;
  ctx.font = `17px ${MONO}`;
  const maxW = W * 0.62;
  const lines = wrapLines(ctx, text, maxW);
  const lineH = 24;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const h = lines.length * lineH + 16;
  const x = W / 2 - w / 2 - 16;
  const y = H * 0.78;
  plateDraw(ctx, x, y, w + 32, h, 8, `${color}59`);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = `bold 13px ${MONO}`;
  if (speaker) ctx.fillText(speaker, W / 2, y + 16);
  ctx.font = `17px ${MONO}`;
  ctx.fillStyle = '#e8ecf4';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 36 + i * lineH));
  ctx.globalAlpha = 1;
}

/** A toast: small right-aligned plate that fades in, holds, and fades out. */
export function toast(ctx, W, y, text, t, total, color = '#33e7ff') {
  if (!text || t <= 0) return;
  const fade = Math.min(1, t / 0.35, (total - t) / 0.35);
  ctx.globalAlpha = Math.max(0, Math.min(1, fade));
  ctx.font = `bold 15px ${MONO}`;
  const w = ctx.measureText(text).width;
  plateDraw(ctx, W - w - 56, y, w + 32, 32, 7, `${color}66`);
  ctx.textAlign = 'right';
  ctx.fillStyle = color;
  ctx.fillText(text, W - 40, y + 21);
  ctx.globalAlpha = 1;
}

/** A key prompt: `[E] ENTER THE PALMS` style, centered near the bottom. */
export function prompt(ctx, W, H, key, text, alpha = 1) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = alpha;
  const label = `[${key}] ${text}`;
  ctx.font = `bold 15px ${MONO}`;
  const w = ctx.measureText(label).width;
  const y = H * 0.72;
  plateDraw(ctx, W / 2 - w / 2 - 18, y, w + 36, 30, 7, 'rgba(125,255,164,0.4)');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7dffa4';
  ctx.fillText(label, W / 2, y + 20);
  ctx.globalAlpha = 1;
}

/** A standing silhouette: head, body, legs; `car` draws a low wedge instead. */
export function silhouette(ctx, x, y, opts = {}) {
  const h = opts.h ?? 30;
  ctx.save();
  if (opts.car) {
    ctx.fillStyle = opts.color ?? '#8a8f9e';
    ctx.fillRect(x - 26, y - 12, 52, 12);
    ctx.fillRect(x - 16, y - 18, 30, 8);
    ctx.fillStyle = 'rgba(200,230,255,0.7)';
    ctx.fillRect(x - 12, y - 16, 10, 5);
  } else {
    ctx.fillStyle = opts.color ?? '#dfe4ee';
    // Head
    ctx.beginPath();
    ctx.arc(x, y - h, 4.4, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillRect(x - 4.6, y - h + 6, 9.2, h * 0.52);
    // Legs, one stepped so the pose is not a mannequin
    ctx.fillRect(x - 4.6, y - h * 0.42, 4, h * 0.42);
    ctx.fillRect(x + 1, y - h * 0.42, 4, h * 0.34);
  }
  ctx.restore();
}

/** A skip hint in the top-right of the letterbox zone. */
export function skipHint(ctx, W, alpha) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = alpha;
  ctx.font = `13px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(200,210,230,0.75)';
  ctx.fillText('SPACE — skip', W - 24, 44);
  ctx.globalAlpha = 1;
}

/** Photo-mode corner brackets framing the shot. */
export function brackets(ctx, W, H, inset = 26, color = 'rgba(255,255,255,0.55)') {
  const L = 30;
  ctx.strokeStyle = color;
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
}

/** The watermark stamped on captured photos: wordmark + a date line. */
export function watermark(ctx, W, H, label = 'VICE PALMS') {
  ctx.save();
  ctx.font = `bold 22px ${MONO}`;
  ctx.textAlign = 'right';
  const x = W - 22, y = H - 22;
  ctx.fillStyle = 'rgba(2,3,9,0.65)';
  ctx.fillText(label, x + 1, y + 1);
  ctx.fillStyle = 'rgba(255,63,164,0.85)';
  ctx.fillText(label, x, y);
  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = 'rgba(51,231,255,0.8)';
  ctx.fillText('PHOTO MODE', x, y - 26);
  ctx.restore();
}

/** A vertical stack of chips (station wheel): the tuned one lit. */
export function stationWheel(ctx, W, H, names, index, colors) {
  const x = W - 40;
  let y = H * 0.42;
  ctx.font = `bold 12px ${MONO}`;
  for (let i = 0; i < names.length; i++) {
    const on = i === index;
    const label = names[i];
    const w = ctx.measureText(label).width + (on ? 26 : 16);
    ctx.globalAlpha = on ? 1 : 0.45;
    plateDraw(ctx, x - w, y - 14, w, 22, 5, on ? `${colors[i]}aa` : 'rgba(120,130,150,0.3)');
    ctx.textAlign = 'right';
    ctx.fillStyle = on ? colors[i] : '#9aa3b8';
    ctx.fillText(label, x - 10, y + 2);
    y += 30;
  }
  ctx.globalAlpha = 1;
}
