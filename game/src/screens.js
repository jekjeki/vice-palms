// ---------------------------------------------------------------------------
// screens.js — title, pause, WASTED/BUSTED overlays and the localStorage
// save slot (save / continue / delete).
// ---------------------------------------------------------------------------

import { CFG } from './config.js';
import { VIEW } from './view.js';
import { fmtMoney } from './util.js';

const FONT = '"Segoe UI", Arial, sans-serif';

// ------------------------------------------------------------- save helpers
export function saveGameState(game) {
  const p = game.player;
  const data = {
    v: 1,
    money: p.money,
    health: p.health,
    armor: p.armor,
    ammo: p.ammo,
    x: p.x, y: p.y,
    mission: game.missions.storyIndex,
    sides: game.missions.sidesDone,
    savedAt: Date.now(),
  };
  try { localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
}

export function loadSaveState() {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

export function deleteSave() {
  try { localStorage.removeItem(CFG.SAVE_KEY); } catch (e) { /* ignore */ }
}

export function hasSave() {
  return !!loadSaveState();
}

// ------------------------------------------------------------------- screens
export class Screens {
  constructor(game) {
    this.game = game;
    this.pauseChoice = 0;
  }

  /** returns an action string if the title screen consumed the input */
  updateTitle(input) {
    const g = this.game;
    if (input.wasPressed('Enter', 'Space', 'KeyE')) {
      if (this.titleChoice === 1 && hasSave()) {
        deleteSave();
        g.refreshTitleChoices();
      } else {
        return this.titleChoice === 0 && hasSave() ? 'continue' : 'new';
      }
    }
    if (input.wasPressed('KeyW', 'ArrowUp')) {
      this.titleChoice = Math.max(0, this.titleChoice - 1);
    }
    if (input.wasPressed('KeyS', 'ArrowDown')) {
      this.titleChoice = Math.min(this.titleMax(), this.titleChoice + 1);
    }
    // mouse
    const items = this.titleItems();
    for (let i = 0; i < items.length; i++) {
      if (input.mouse.clicked && this._hitItem(input, items, i)) {
        if (items[i].action === 'delete') { deleteSave(); g.refreshTitleChoices(); return null; }
        return items[i].action;
      }
    }
    return null;
  }

  titleItems() {
    const items = [{ label: 'NEW GAME', action: 'new' }];
    if (hasSave()) items.unshift({ label: 'CONTINUE', action: 'continue' });
    items.push({ label: 'DELETE SAVE', action: 'delete' });
    return items;
  }

  titleMax() { return this.titleItems().length - 1; }

  _hitItem(input, items, i) {
    const y0 = 380 + i * 46;
    return input.mouse.x > VIEW.w / 2 - 140 && input.mouse.x < VIEW.w / 2 + 140
      && input.mouse.y > y0 && input.mouse.y < y0 + 38;
  }

  drawTitle(g, game) {
    const items = this.titleItems();
    // backdrop: the game world darkened (camera drifts over the city)
    g.fillStyle = 'rgba(6,8,14,0.78)';
    g.fillRect(0, 0, VIEW.w, VIEW.h);

    // save-slot card (bottom-left) — what you'd continue into
    const save = loadSaveState();
    if (save) {
      g.save();
      g.globalAlpha = 0.8;
      g.fillStyle = 'rgba(10,14,20,0.6)';
      g.fillRect(26, VIEW.h - 130, 250, 78);
      g.strokeStyle = 'rgba(124,232,160,0.5)';
      g.strokeRect(26, VIEW.h - 130, 250, 78);
      g.textAlign = 'left';
      g.font = `bold 12px ${FONT}`;
      g.fillStyle = '#7ce8a0';
      g.fillText('SAVE SLOT', 38, VIEW.h - 110);
      g.font = `12px ${FONT}`;
      g.fillStyle = 'rgba(225,232,245,0.85)';
      g.fillText(`cash ${fmtMoney(save.money || 0)} · mission ${1 + (save.mission || 0)}/6`, 38, VIEW.h - 90);
      g.fillStyle = 'rgba(200,215,235,0.5)';
      const ago = Math.max(0, Math.round((Date.now() - (save.savedAt || Date.now())) / 60000));
      g.fillText(`saved ${ago === 0 ? 'just now' : ago + ' min ago'}`, 38, VIEW.h - 72);
      g.restore();
    }

    // big logo
    g.textAlign = 'center';
    g.font = `bold 92px ${FONT}`;
    g.fillStyle = '#ff4d9d';
    g.shadowColor = '#ff4d9d';
    g.shadowBlur = 34;
    g.fillText('VICE PALMS', VIEW.w / 2, 208);
    g.shadowColor = '#3fd9ff';
    g.shadowBlur = 22;
    g.fillStyle = '#3fd9ff';
    g.font = `bold 30px ${FONT}`;
    g.fillText('a night in the neon city', VIEW.w / 2, 254);
    g.shadowBlur = 0;

    g.font = `14px ${FONT}`;
    g.fillStyle = 'rgba(200,215,235,0.55)';
    g.fillText('make.fun bounty gta6-01 · fresh rebuild v2', VIEW.w / 2, 296);

    // menu
    g.font = `bold 24px ${FONT}`;
    items.forEach((it, i) => {
      const y = 380 + i * 46;
      const sel = this.titleChoice === i;
      g.fillStyle = sel ? '#ffd23e' : 'rgba(225,232,245,0.75)';
      g.fillText((sel ? '▶ ' : '') + it.label, VIEW.w / 2, y + 26);
    });

    g.font = `12px ${FONT}`;
    g.fillStyle = 'rgba(200,215,235,0.4)';
    g.fillText('W/S or mouse to choose · ENTER to play · M mutes audio', VIEW.w / 2, VIEW.h - 24);
    // build credit, bottom-left
    g.textAlign = 'left';
    g.fillStyle = 'rgba(200,215,235,0.3)';
    g.font = `11px ${FONT}`;
    g.fillText('VICE PALMS v2.0 · fresh rebuild · rico says hi', 16, VIEW.h - 16);
    // twin palm silhouettes framing the logo (pure canvas, cheap and proud)
    for (const side of [{ x: 150, f: 1 }, { x: VIEW.w - 150, f: -1 }]) {
      const sway = Math.sin(performance.now() / 900 + side.x) * 3;
      g.strokeStyle = 'rgba(90,70,50,0.85)';
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(side.x, VIEW.h);
      g.quadraticCurveTo(side.x + 12 * side.f, VIEW.h - 160, side.x + sway * side.f, VIEW.h - 250);
      g.stroke();
      g.strokeStyle = 'rgba(60,140,80,0.9)';
      g.lineWidth = 7;
      const tx = side.x + sway * side.f, ty = VIEW.h - 250;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.6 * side.f;
        g.beginPath();
        g.moveTo(tx, ty);
        g.quadraticCurveTo(tx + Math.cos(a) * 55 * side.f, ty + Math.sin(a) * 55, tx + Math.cos(a) * 95 * side.f, ty + Math.sin(a) * 95 + 22);
        g.stroke();
      }
    }
    g.textAlign = 'center';
  }

  drawPause(g, game) {
    g.fillStyle = 'rgba(6,8,14,0.72)';
    g.fillRect(0, 0, VIEW.w, VIEW.h);
    g.textAlign = 'center';
    g.font = `bold 54px ${FONT}`;
    g.fillStyle = '#3fd9ff';
    g.fillText('PAUSED', VIEW.w / 2, 240);

    const items = ['RESUME', 'SAVE GAME', 'DELETE SAVE', 'QUIT TO TITLE'];
    g.font = `bold 20px ${FONT}`;
    items.forEach((label, i) => {
      const y = 330 + i * 44;
      const sel = this.pauseChoice === i;
      g.fillStyle = sel ? '#ffd23e' : 'rgba(225,232,245,0.72)';
      g.fillText((sel ? '▶ ' : '') + label, VIEW.w / 2, y);
    });

    // stats sidebar
    const s = game.stats || {};
    const rows = [
      ['Cash earned', fmtMoney(s.earned || 0)],
      ['Missions passed', String(s.missions || 0)],
      ['Cars wrecked', String(s.wrecks || 0)],
      ['Cars jacked', String(s.jacks || 0)],
      ['Pedestrians down', String(s.kills || 0)],
      ['Distance driven', (s.distance || 0).toFixed(1) + ' km'],
      ['District', game.lastArea || '—'],
    ];
    g.textAlign = 'left';
    g.font = `bold 13px ${FONT}`;
    g.fillStyle = '#3fd9ff';
    g.fillText('RAP SHEET', 72, 300);
    g.font = `13px ${FONT}`;
    rows.forEach(([k, v], i) => {
      g.fillStyle = 'rgba(200,212,230,0.55)';
      g.fillText(k, 72, 326 + i * 22);
      g.fillStyle = 'rgba(240,244,250,0.9)';
      g.textAlign = 'right';
      g.fillText(v, 300, 326 + i * 22);
      g.textAlign = 'left';
    });

    g.textAlign = 'center';
    g.font = `12px ${FONT}`;
    g.fillStyle = 'rgba(200,215,235,0.4)';
    g.fillText('W/S select · ENTER confirm · ESC resume', VIEW.w / 2, VIEW.h - 30);
    g.textAlign = 'left';
  }

  /** returns 'resume' | 'save' | 'delete' | 'quit' | null */
  updatePause(input) {
    if (input.wasPressed('Escape')) return 'resume';
    if (input.wasPressed('KeyW', 'ArrowUp')) this.pauseChoice = (this.pauseChoice + 3) % 4;
    if (input.wasPressed('KeyS', 'ArrowDown')) this.pauseChoice = (this.pauseChoice + 1) % 4;
    if (input.wasPressed('Enter', 'Space')) {
      return ['resume', 'save', 'delete', 'quit'][this.pauseChoice];
    }
    return null;
  }

  /** mugshot caption under BUSTED — the desk sergeant's booking log */
  static MUGLINES = [
    'Booked: OCN-114. Charge: "general vibes".',
    'Booked: OCN-207. Property returned in worse shape.',
    'Booked: OCN-311. Prints match three other nights.',
    'Booked: OCN-404. Lawyer not found.',
  ];

  drawDeath(g, game, kind) {
    // grayscale wash + big text
    g.fillStyle = kind === 'WASTED' ? 'rgba(30,4,8,0.62)' : 'rgba(6,10,30,0.62)';
    g.fillRect(0, 0, VIEW.w, VIEW.h);
    g.textAlign = 'center';
    g.font = `bold 96px ${FONT}`;
    const t = game.deathT || 0;
    const scale = 1 + Math.min(t * 0.4, 0.35);
    g.save();
    g.translate(VIEW.w / 2, VIEW.h / 2);
    g.scale(scale, scale);
    g.fillStyle = kind === 'WASTED' ? '#c23b4e' : '#4d6bff';
    g.shadowColor = '#000';
    g.shadowBlur = 26;
    g.fillText(kind, 0, 20);
    g.restore();
    g.shadowBlur = 0;
    g.font = `16px ${FONT}`;
    g.fillStyle = 'rgba(230,236,245,0.75)';
    if (kind === 'WASTED') {
      const fee = CFG.RESPAWN_FEE * Math.max(1, game.police.wanted);
      const causes = {
        explosion: 'Cooked in your own ride.',
        drowned: 'The Atlantic wins again.',
        shot: 'Outgunned on the street.',
        hurt: 'The night caught up with you.',
      };
      const line = causes[game.deathCause] || 'The night caught up with you.';
      g.fillText(line + `  Fee: ${fmtMoney(fee)}`, VIEW.w / 2, VIEW.h / 2 + 80);
    } else {
      const mug = Screens.MUGLINES[Math.floor(game.time * 0.31) % Screens.MUGLINES.length];
      g.fillText(`Busted. Bail: ${fmtMoney(CFG.RESPAWN_FEE * Math.max(1, game.police.wanted))} — ${mug}`, VIEW.w / 2, VIEW.h / 2 + 80);
    }
    if (t > 1.4) {
      g.fillStyle = 'rgba(255,220,120,0.9)';
      g.font = `bold 15px ${FONT}`;
      g.fillText('press ENTER', VIEW.w / 2, VIEW.h / 2 + 130);
    }
    g.textAlign = 'left';
  }

  drawHelp(g, game) {
    g.font = `13px ${FONT}`;
    g.textAlign = 'left';
    g.fillStyle = 'rgba(200,215,235,0.5)';
    g.fillText('F jack/exit · SHIFT sprint · 1 fists · 2 pistol · M mute · ESC pause', 20, VIEW.h - 34);
  }

  /** F1 overlay — page 1: controls, page 2: survival tips */
  drawHelpOverlay(g, page = 1) {
    g.fillStyle = 'rgba(6,8,14,0.82)';
    g.fillRect(0, 0, VIEW.w, VIEW.h);
    const cx = VIEW.w / 2;
    g.textAlign = 'center';
    g.font = `bold 30px ${FONT}`;
    g.fillStyle = '#3fd9ff';
    g.fillText('STREET MANUAL — 1/2', cx, 92);
    g.font = `14px ${FONT}`;
    g.fillStyle = 'rgba(225,232,245,0.9)';
    const lines = [
      '',
      'ON FOOT',
      'WASD move · SHIFT sprint (stamina) · mouse aims · click / SPACE attacks',
      '1 fists · 2 pistol · F enter nearest car (or jack its driver)',
      '',
      'DRIVING',
      'W/S gas & brake/reverse · A/D steer · SPACE handbrake (drifts!)',
      'F exit · H horn (or siren in a cruiser) · R radio station',
      'engine damage saps top speed — wrecks burn, then blow',
      '',
      'THE HEAT',
      'Crimes raise stars; cruisers ram at 1+, foot cops shoot at 2+,',
      'roadblocks at 3+, the air unit at 4+. Break line of sight to cool off.',
      'Cops who reach you on foot BUST you. Dying is WASTED. Both cost money.',
    ];
    let y = 140;
    for (const line of lines) {
      const isHead = line === line.toUpperCase() && line.length > 3;
      g.fillStyle = isHead ? '#ffd23e' : 'rgba(225,232,245,0.88)';
      g.font = isHead ? `bold 15px ${FONT}` : `14px ${FONT}`;
      g.fillText(line, cx, y);
      y += line === '' ? 12 : 24;
    }
    g.fillStyle = 'rgba(200,215,235,0.4)';
    g.font = `12px ${FONT}`;
    g.fillText('F1 close · see TAB for the city chart', cx, VIEW.h - 28);
    g.textAlign = 'left';
  }

  /** page 2 — how to actually get rich in Vice Palms */
  drawTipsOverlay(g) {
    g.fillStyle = 'rgba(6,8,14,0.82)';
    g.fillRect(0, 0, VIEW.w, VIEW.h);
    const cx = VIEW.w / 2;
    g.textAlign = 'center';
    g.font = `bold 30px ${FONT}`;
    g.fillStyle = '#ffd23e';
    g.fillText('STREET MANUAL — 2/2', cx, 92);
    g.font = `14px ${FONT}`;
    const lines = [
      '',
      'MAKING ENDS MEET',
      'Story missions (cyan markers) pay the big money and save automatically.',
      'Side hustles (green markers) repeat forever: taxi fares, rampages, parcels.',
      'Cash pickups glow on the sidewalk. The garage pads your ride for free.',
      '',
      'STAYING ALIVE',
      'A respray at the safehouse cools the heat — if nobody saw you drive in.',
      'Rain makes the streets slick: longer stops, wider drifts.',
      'The air unit counts as eyes. Break the beam, then break line of sight.',
      '',
      'CIVICS',
      'Traffic lights: north-south goes first, then east-west. Crosswalks: paint.',
      'The park pond is not a shortcut. The sea is not a shortcut either.',
      'Seagulls cannot be run over. Do not feel bad about trying.',
    ];
    let y = 140;
    for (const line of lines) {
      const isHead = line === line.toUpperCase() && line.length > 3;
      g.fillStyle = isHead ? '#3fd9ff' : 'rgba(225,232,245,0.88)';
      g.font = isHead ? `bold 15px ${FONT}` : `14px ${FONT}`;
      g.fillText(line, cx, y);
      y += line === '' ? 12 : 24;
    }
    g.fillStyle = 'rgba(200,215,235,0.4)';
    g.font = `12px ${FONT}`;
    g.fillText('F1 close', cx, VIEW.h - 28);
    g.textAlign = 'left';
  }
}
