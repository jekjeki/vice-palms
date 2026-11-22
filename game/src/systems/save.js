// localStorage saves under one key: the seed, money, mission progress, the player's vitals and
// the sound toggle. Everything is best-effort — private browsing may refuse storage, and a
// tampered or truncated save falls back to sane defaults instead of crashing the boot.

import { SAVE_KEY } from '../config.js';

export function hasSave() {
  try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
}

/** Parsed-and-clamped save, or null when nothing usable is stored. */
export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || s === null || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
    if (s.v !== 2) return null;   // a foreign or older schema falls back to a fresh night
    s.seed = Number.isFinite(s.seed) ? s.seed : 1337;
    s.money = Math.max(0, Math.floor(s.money) || 0);
    s.missionIndex = Math.min(6, Math.max(0, Math.floor(s.missionIndex) || 0));
    s.health = Math.min(100, Math.max(1, Math.floor(s.health) || 100));
    s.armor = Math.min(100, Math.max(0, Math.floor(s.armor) || 0));
    s.ammo = Math.max(0, Math.floor(s.ammo) || 0);
    s.weapon = s.weapon === 'pistol' ? 'pistol' : 'fist';
    if (typeof s.sound !== 'boolean') s.sound = null;
    return s;
  } catch { return null; }
}

export function writeSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, v: 2 })); } catch { /* storage blocked */ }
}

export function wipeSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
