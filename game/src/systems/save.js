// localStorage saves under one key: the seed, money, mission progress, the player's vitals and
// the sound toggle. Everything is best-effort — private browsing may refuse storage.

import { SAVE_KEY } from '../config.js';

export function hasSave() {
  try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function writeSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage blocked */ }
}

export function wipeSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
