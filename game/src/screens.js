// Vice Palms — title, pause, save/load UI, WASTED / BUSTED overlays

const VW = 1280, VH = 720;

export function drawScreens(s, ctx) {
  if (!s) return;
  if (s.mode === 'title') drawTitle(ctx, s);
  else if (s.mode === 'pause') drawPause(ctx, s);
  else if (s.mode === 'wasted' || s.mode === 'busted') drawEnd(ctx, s);
}

function neonText(ctx, text, x, y, size, c) {
  ctx.save();
  ctx.font = `900 ${size}px Arial Black, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.shadowColor = c; ctx.shadowBlur = 34;
  ctx.fillStyle = c;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#fff8f2';
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawTitle(ctx, s) {
  neonText(ctx, 'VICE PALMS', VW / 2, 268, 96, '#ff2e88');
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'italic 22px Arial';
  ctx.fillStyle = '#22e6ff';
  ctx.shadowColor = '#22e6ff'; ctx.shadowBlur = 14;
  ctx.fillText('a neon crime sandbox for make.fun gta6-01', VW / 2, 312);
  ctx.restore();

  const t = s.time;
  const blink = Math.sin(t * 3) > -0.4;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = '#fff';
  if (blink) ctx.fillText('PRESS ENTER TO PLAY', VW / 2, 420);
  ctx.font = '16px Arial';
  ctx.fillStyle = 'rgba(232,236,242,0.8)';
  ctx.fillText('I — load saved game', VW / 2, 462);
  ctx.fillStyle = 'rgba(232,236,242,0.66)';
  const lines = [
    'WASD / ARROWS — move & drive      SHIFT — sprint      SPACE — handbrake',
    'F — enter / exit / carjack        K — swap weapon     J or CLICK — attack / shoot',
    'P — pause (save / load there)     M — mute',
  ];
  lines.forEach((l, i) => ctx.fillText(l, VW / 2, 540 + i * 26));
  ctx.restore();
}

function drawPause(ctx, s) {
  ctx.fillStyle = 'rgba(6,8,14,0.72)';
  ctx.fillRect(0, 0, VW, VH);
  neonText(ctx, 'PAUSED', VW / 2, 280, 64, '#22e6ff');
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px Arial';
  ctx.fillStyle = '#e8ecf2';
  const lines = [
    'P / ESC — resume',
    'O — save game (localStorage)',
    'I — load game',
    'M — toggle audio',
  ];
  lines.forEach((l, i) => ctx.fillText(l, VW / 2, 360 + i * 30));
  ctx.font = '14px Arial';
  ctx.fillStyle = 'rgba(232,236,242,0.55)';
  ctx.fillText(`seed ${s.seed}  ·  missions done ${s.stats.missions}  ·  jackings ${s.stats.jack}  ·  kills ${s.stats.kills}`, VW / 2, 530);
  ctx.restore();
}

function drawEnd(ctx, s) {
  const a = Math.min(0.85, s.endT / 1.6);
  ctx.fillStyle = `rgba(4,4,10,${a})`;
  ctx.fillRect(0, 0, VW, VH);
  if (s.endT > 0.5) {
    const c = s.mode === 'wasted' ? '#d02a3a' : '#3a6bd0';
    neonText(ctx, s.endKind, VW / 2, VH / 2 - 10, 110, c);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = 'rgba(232,236,242,0.85)';
    const msg = s.mode === 'wasted'
      ? `Hospital fees: $${Math.min(200, s.money)}   ·   Press ENTER to wake up`
      : `Bail & fines: $${Math.min(800, Math.floor(s.money * 0.2))}   ·   Press ENTER to walk free`;
    ctx.fillText(msg, VW / 2, VH / 2 + 60);
    ctx.restore();
  }
}
