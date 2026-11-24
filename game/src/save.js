// save.js — localStorage persistence for the single story slot.

import { CFG } from './config.js';

export function hasSave() {
  try {
    return localStorage.getItem(CFG.SAVE_KEY) !== null;
  } catch (e) {
    return false;
  }
}

export function saveGame(g) {
  try {
    const p = g.player;
    const data = {
      v: 1,
      money: p.money,
      hp: p.hp,
      armor: p.armor,
      ammo: p.ammo,
      x: p.x,
      y: p.y,
      storyIdx: g.missions.storyIdx,
      sideDone: g.missions.sideDone.slice(),
      stats: g.missions.stats,
    };
    localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame(g) {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return false;
    const p = g.player;
    p.money = d.money ?? CFG.START_MONEY;
    p.hp = d.hp ?? CFG.PLAYER_HP;
    p.armor = d.armor ?? 0;
    p.ammo = d.ammo ?? CFG.START_AMMO;
    p.x = d.x ?? CFG.WORLD_W / 2;
    p.y = d.y ?? CFG.WORLD_H / 2;
    g.missions.storyIdx = d.storyIdx ?? 0;
    g.missions.sideDone = Array.isArray(d.sideDone) ? d.sideDone : [];
    if (d.stats) g.missions.stats = d.stats;
    return true;
  } catch (e) {
    return false;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(CFG.SAVE_KEY);
  } catch (e) { /* nothing to delete */ }
}
