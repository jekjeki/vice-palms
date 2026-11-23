// The map screen: M takes the whole frame. The HUD's baked underlay map goes
// full-bleed under a zoom-and-pan camera — wheel or +/- to zoom, WASD or the
// arrows to pan, and a click drops a waypoint crosshair (a click on empty map,
// C or Backspace takes it back). The legend carries every icon the city owns:
// story markers, stunt ramps, vendors, the pawn curb, race starts, the casino,
// the pit, the boat shop, taxi ranks, and the district names written where the
// districts are. The world keeps stepping under the map; nobody in it waits.
//
// The screen owns its own mouse listeners — the Input module is keyboard-only —
// and converts clicks back to world coordinates through the same kx/ky/north
// mapping the HUD bakes, so a waypoint dropped here is exact in the world.

import { GRID, PITCH, SAND } from '../config.js';
import { clamp, TAU } from '../util.js';

const ZOOM_MIN = 0.55;
const ZOOM_MAX = 4.5;
const ZOOM_STEP = 0.85;        // wheel notches zoom geometrically
const PAN_SPEED = 1400;        // world units per second at 1x, scaled by 1/zoom
const WAYPOINT_RAD = 42;       // world radius of the waypoint's capture circle

const LABELS = [
  { text: 'VICE PALMS', x: 8 * PITCH, y: 14 * PITCH, size: 44, color: 'rgba(232,236,244,0.6)' },
  { text: 'THE STRIP', x: 38 * PITCH, y: 9 * PITCH, size: 22, color: 'rgba(255,192,66,0.55)' },
  { text: 'OLD DOWNTOWN', x: 14 * PITCH, y: 22 * PITCH, size: 22, color: 'rgba(232,236,244,0.45)' },
  { text: 'NORTH DOCKS', x: 8400, y: -1100, size: 26, color: 'rgba(122,162,255,0.6)' },
  { text: 'PALMS AIRFIELD', x: 2100, y: 1300, size: 20, color: 'rgba(123,255,212,0.5)' },
  { text: 'THE BAY', x: 12200, y: -3200, size: 30, color: 'rgba(80,140,200,0.5)' },
  { text: 'BAY MARINA', x: 9800, y: -3400, size: 18, color: 'rgba(123,255,212,0.55)' },
];

// ------------------------------------------------------------
export function createMapScreen(game) {
  const S = {
    game,
    open: false,
    zoom: 1.15,
    cx: 8400,            // world point under the screen center
    cy: 8400,
    waypoint: null,      // { x, y } or null
    flash: 0,            // the open/close fade
  };

  // ------------------------------------------------------------ mouse
  // Click → world: the inverse of the render transform, done with the HUD's
  // baked map scale. A right-click or the C key clears the waypoint.

  const canvas = document.getElementById('game');

  function screenToWorld(px, py, W, H) {
    const kx = game.hud?.kx ?? 1, ky = game.hud?.ky ?? 1;
    const north = game.hud?.north ?? 0;
    const wx = S.cx + (px - W / 2) / (kx * S.zoom);
    const wy = S.cy + (py - H / 2) / (ky * S.zoom) - north;
    return { x: wx, y: wy };
  }

  function onDown(e) {
    if (!S.open || !game.hud) return;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const w = screenToWorld(px, py, r.width, r.height);
    if (e.button === 2) { S.waypoint = null; game.toast('WAYPOINT CLEARED', '#9aa3b8'); return; }
    S.waypoint = { x: w.x, y: w.y };
    game.audio?.blip?.(560);
    game.toast('WAYPOINT SET', '#ffd977');
    e.preventDefault();
  }

  function onWheel(e) {
    if (!S.open) return;
    S.zoom = clamp(S.zoom * (e.deltaY < 0 ? 1 / ZOOM_STEP : ZOOM_STEP), ZOOM_MIN, ZOOM_MAX);
    e.preventDefault();
  }

  canvas?.addEventListener('mousedown', onDown);
  canvas?.addEventListener('wheel', onWheel, { passive: false });
  canvas?.addEventListener('contextmenu', (e) => { if (S.open) e.preventDefault(); });

  // ------------------------------------------------------------ open / close

  function toggle(force) {
    S.open = force ?? !S.open;
    S.flash = 1;
    if (S.open) {
      // Opening centers on Rico at a comfortable street-reading zoom.
      const p = game.player;
      S.cx = p.x; S.cy = p.y;
      S.zoom = Math.max(S.zoom, 1.1);
      game.audio?.blip?.(420);
    }
  }

  // ------------------------------------------------------------ update

  function update(input, dt) {
    S.flash = Math.max(0, S.flash - dt * 3);
    if (input.tap('KeyM') || input.tap('Escape')) { toggle(false); return; }
    if (input.tap('KeyC') || input.tap('Backspace')) {
      S.waypoint = null;
      game.toast('WAYPOINT CLEARED', '#9aa3b8');
      return;
    }

    // Pan: the arrows and WASD, scaled by zoom so the map never outruns its read.
    const pan = PAN_SPEED * dt / S.zoom;
    let dx = 0, dy = 0;
    if (input.held('ArrowLeft') || input.held('KeyA')) dx -= pan;
    if (input.held('ArrowRight') || input.held('KeyD')) dx += pan;
    if (input.held('ArrowUp') || input.held('KeyW')) dy -= pan;
    if (input.held('ArrowDown') || input.held('KeyS')) dy += pan;
    S.cx = clamp(S.cx + dx, 0, GRID * PITCH + SAND);
    S.cy = clamp(S.cy + dy, -5200, GRID * PITCH);

    // Zoom keys sit beside the wheel for the keyboard-only players.
    if (input.tap('Equal') || input.tap('NumpadAdd')) S.zoom = clamp(S.zoom / ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
    if (input.tap('Minus') || input.tap('NumpadSubtract')) S.zoom = clamp(S.zoom * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
  }

  // ------------------------------------------------------------ render

  /** All the live markers the map knows about, one list, colored by owner. */
  function markers() {
    const out = [];
    const m = game.missions?.marker?.();
    if (m) out.push({ ...m, icon: 'mission' });
    const s2 = game.story2?.marker?.();
    if (s2) out.push({ ...s2, icon: 'story' });
    const h = game.heists?.marker?.();
    if (h) out.push({ ...h, icon: 'heist' });
    for (const [x, y, color] of game.stunts?.blips?.() ?? []) out.push({ x, y, color, icon: 'stunt' });
    for (const [x, y, color] of game.vendors?.blips?.() ?? []) out.push({ x, y, color, icon: 'vendor' });
    for (const c of game.races?.circuits ?? []) out.push({ x: c.start.x, y: c.start.y, color: '#ffd977', icon: 'race' });
    if (game.casino) out.push({ x: game.casino.door.x, y: game.casino.door.y, color: '#a86bff', icon: 'casino' });
    if (game.fightClub) out.push({ x: game.fightClub.door.x, y: game.fightClub.door.y, color: '#ff5a6e', icon: 'pit' });
    if (game.boats) out.push({ x: game.boats.shop.x, y: game.boats.shop.y, color: '#33e7ff', icon: 'boats' });
    for (const rk of game.taxi?.ranks ?? []) out.push({ x: rk.x, y: rk.y, color: '#f2cf47', icon: 'taxi' });
    return out;
  }

  function render(ctx, W, H) {
    const kx = game.hud?.kx ?? 1, ky = game.hud?.ky ?? 1;
    const north = game.hud?.north ?? 0;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // The plate: the night behind the map, then the map itself under the pan.
    ctx.fillStyle = 'rgba(5,8,16,0.94)';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 - S.cx * kx * S.zoom, H / 2 - (S.cy + north) * ky * S.zoom);
    ctx.scale(S.zoom, S.zoom);
    if (game.hud?.underlay) ctx.drawImage(game.hud.underlay, 0, 0);
    const inv = 1 / S.zoom;

    // District names, written where the districts are.
    ctx.textAlign = 'center';
    for (const l of LABELS) {
      ctx.font = `bold ${l.size * inv}px Consolas, "Courier New", monospace`;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, l.x * kx, (l.y + north) * ky);
    }

    // Every marker in the city, sized to read at any zoom.
    for (const mk of markers()) {
      const x = mk.x * kx, y = (mk.y + north) * ky;
      const r = 7 * inv;
      ctx.fillStyle = mk.color ?? '#ffd977';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1.6 * inv;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill(); ctx.stroke();
      if (mk.icon === 'stunt') {
        // Cleared jumps get a tick, pending ones a dash.
        ctx.strokeStyle = mk.color === '#7dffa4' ? '#052012' : '#4a3a10';
        ctx.lineWidth = 2.2 * inv;
        ctx.beginPath();
        if (mk.color === '#7dffa4') { ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x - r * 0.1, y + r * 0.45); ctx.lineTo(x + r * 0.6, y - r * 0.5); }
        else { ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x + r * 0.5, y); }
        ctx.stroke();
      }
      if (mk.icon === 'vendor') {
        ctx.fillStyle = '#0b0e1e';
        ctx.font = `bold ${8 * inv}px Consolas, "Courier New", monospace`;
        ctx.fillText('$', x, y + 3 * inv);
      }
    }

    // The waypoint: a gold crosshair with a ring, drawn over everything.
    if (S.waypoint) {
      const x = S.waypoint.x * kx, y = (S.waypoint.y + north) * ky;
      const r = 16 * inv;
      ctx.strokeStyle = '#ffd977';
      ctx.lineWidth = 2.4 * inv;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r * 1.6, y); ctx.lineTo(x - r * 0.5, y);
      ctx.moveTo(x + r * 0.5, y); ctx.lineTo(x + r * 1.6, y);
      ctx.moveTo(x, y - r * 1.6); ctx.lineTo(x, y - r * 0.5);
      ctx.moveTo(x, y + r * 0.5); ctx.lineTo(x, y + r * 1.6);
      ctx.stroke();
    }

    // Rico: the same arrow the minimap flies, at the map's own scale.
    const p = game.player;
    ctx.save();
    ctx.translate(p.x * kx, (p.y + north) * ky);
    ctx.rotate(p.heading + Math.PI / 2);
    ctx.scale(inv, inv);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(7, 9); ctx.lineTo(0, 5); ctx.lineTo(-7, 9);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();

    // ---- screen-space chrome: title, legend, hints.
    ctx.textAlign = 'left';
    ctx.font = 'bold 26px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#e8ecf4';
    ctx.fillText('VICE PALMS', 34, 52);
    ctx.font = '13px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#9aa3b8';
    ctx.fillText(`zoom ${S.zoom.toFixed(2)}x`, 34, 74);

    // The legend: every icon with its name, plus the stunt and market readouts.
    const legend = [
      ['#ffd977', 'mission / race'],
      [null, 'story (second arc)'],
      ['#7dffa4', 'cleared stunt / vendor food'],
      ['#ff7a3c', 'liquor'],
      ['#a86bff', 'casino / pawn'],
      ['#ff5a6e', 'the pit'],
      ['#33e7ff', 'boats / checkpoint'],
      ['#f2cf47', 'taxi rank'],
    ];
    legend[1][0] = '#ff9de0';
    let ly = 108;
    for (const [color, label] of legend) {
      ctx.fillStyle = color ?? '#ff9de0';
      ctx.beginPath(); ctx.arc(44, ly - 4, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c8cede';
      ctx.fillText(label, 60, ly);
      ly += 24;
    }
    const st = game.stunts?.stats?.();
    if (st) {
      ctx.fillStyle = '#7bffd4';
      ctx.fillText(`stunts: ${st.cleared}/${st.total} cleared — $${st.pot.toLocaleString()} on the table`, 34, ly + 14);
    }
    const mk = game.vendors?.marketLine?.();
    if (mk) {
      ctx.fillStyle = '#9aa3b8';
      ctx.fillText(mk, 34, ly + 38);
    }

    // Hints + the waypoint readout, bottom bar.
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6f7788';
    ctx.fillText('M / ESC close · wheel or ± zoom · WASD pan · click set waypoint · C clear', W / 2, H - 26);
    if (S.waypoint) {
      const d = Math.hypot(S.waypoint.x - p.x, S.waypoint.y - p.y);
      ctx.fillStyle = '#ffd977';
      ctx.fillText(`WAYPOINT — ${Math.round(d / 8)}m ${S.waypoint.x < p.x ? 'W' : 'E'}·${S.waypoint.y < p.y ? 'N' : 'S'}`, W / 2, H - 50);
    }
    ctx.restore();
  }

  /** The minimap reads the waypoint too, once it exists. */
  function waypointPoint() {
    return S.waypoint ? { ...S.waypoint, color: '#ffd977' } : null;
  }

  function serialize() {
    return { waypoint: S.waypoint };
  }

  function restore(data) {
    if (data && typeof data === 'object' && data.waypoint) S.waypoint = data.waypoint;
  }

  S.toggle = toggle;
  S.update = update;
  S.render = render;
  S.markers = markers;
  S.waypointPoint = waypointPoint;
  S.serialize = serialize;
  S.restore = restore;
  return S;
}
