// stats.js — the night's ledger: everything the player broke, stole, dodged
// and drove. Rendered in the pause menu and the end credits.

import { G } from './util.js';

export const stats = {
  wrecks: 0,        // cars destroyed
  pedsBumped: 0,    // pedestrians flattened or punched
  copsDowned: 0,    // officers put out of action
  missions: 0,      // story jobs passed
  sideJobs: 0,      // side hustles passed
  shots: 0,         // bullets fired
  jacked: 0,        // cars jacked
  distance: 0,      // meters driven (speed*dt*k)
  evaded: 0,        // times the heat fully cooled
  sprayed: 0,       // Pay 'n' Spray visits
  spikesHit: 0,     // spike strips rolled over
  maxStars: 0,      // highest wanted level tonight
  fees: 0,          // total paid in bribes and bills
  earned: 0,        // total payouts collected
};

export function addStat(key, n = 1) {
  if (key in stats) stats[key] += n;
}

export function setMaxStars(s) {
  if (s > stats.maxStars) stats.maxStars = s;
}

export function resetStats() {
  for (const k of Object.keys(stats)) stats[k] = 0;
}

const LABELS = [
  ['missions', 'Story jobs passed'],
  ['sideJobs', 'Side hustles passed'],
  ['earned', 'Earned tonight'],
  ['distance', 'Driven (km)'],
  ['wrecks', 'Vehicles wrecked'],
  ['jacked', 'Cars jacked'],
  ['pedsBumped', 'Pedestrians inconvenienced'],
  ['copsDowned', 'Officers benched'],
  ['evaded', 'Times the heat cooled'],
  ['maxStars', 'Highest wanted level'],
  ['sprayed', 'Resprays bought'],
  ['spikesHit', 'Spike strips eaten'],
  ['shots', 'Rounds fired'],
  ['fees', 'Paid in bills & bribes'],
];

export function statLines() {
  const out = [];
  for (const [k, label] of LABELS) {
    let v = stats[k];
    if (k === 'earned' || k === 'fees') v = '$' + Math.floor(v).toLocaleString();
    else if (k === 'distance') v = (v / 1000).toFixed(1) + ' km';
    else v = String(Math.floor(v));
    out.push([label, v]);
  }
  return out;
}

export function drawStats(c, x, y, w, title = 'THE NIGHT SO FAR') {
  c.save();
  c.textAlign = 'left';
  c.font = 'bold 13px "Consolas", monospace';
  c.fillStyle = 'rgba(0,229,255,0.85)';
  c.fillText(title, x, y);
  c.font = '13px "Consolas", monospace';
  let ly = y + 22;
  for (const [label, val] of statLines()) {
    c.fillStyle = 'rgba(232,230,227,0.62)';
    c.fillText(label, x, ly);
    c.textAlign = 'right';
    c.fillStyle = 'rgba(255,210,74,0.9)';
    c.fillText(val, x + w, ly);
    c.textAlign = 'left';
    ly += 19;
  }
  c.restore();
}
