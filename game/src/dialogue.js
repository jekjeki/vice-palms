// dialogue.js — character voice: Rico's calls, dispatcher chatter, cop barks, ped lines.
// Dialogue sets play as queued subtitles; ambient barks fire during play.
const SETS = {
  intro: [
    { who: 'RICO', text: 'Baby! Six years, two prisons, one beach hut — and you still owe me a rematch.', dur: 4.5 },
    { who: 'RICO', text: 'Vice Palms changed, kid. Neon got brighter. Cops got meaner. We got richer. In theory.', dur: 5 },
    { who: 'RICO', text: 'Grab something with wheels. The strip waits for nobody.', dur: 4 },
  ],
  m1: [
    { who: 'RICO', text: 'Marina, north end. I left a little welcome gift floating there.', dur: 4.5 },
  ],
  m1_done: [
    { who: 'RICO', text: 'Still the fastest thing on sand, kid.', dur: 3.5 },
  ],
  m2: [
    { who: 'RICO', text: 'One cab, freshly borrowed. The cabbie will disagree. Ignore him, he is a professional.', dur: 5 },
  ],
  m2_done: [
    { who: 'RICO', text: 'Both bumpers. I am genuinely moved.', dur: 3 },
  ],
  m3: [
    { who: 'RICO', text: 'Four crates on the piers. Dock security has zero sense of humor.', dur: 4.5 },
  ],
  m3_done: [
    { who: 'RICO', text: 'You smell like diesel and destiny.', dur: 3 },
  ],
  m4: [
    { who: 'RICO', text: 'Laundered plates, rolling east. Wreck them before the strip, or we are lunch.', dur: 5 },
  ],
  m4_done: [
    { who: 'RICO', text: 'Crispy. I love crispy.', dur: 3 },
  ],
  m5: [
    { who: 'RICO', text: 'Hangar 2. Grab the case. Do NOT open it. That is how last time went.', dur: 5 },
  ],
  m5_done: [
    { who: 'RICO', text: 'Congratulations. You are officially a Vice Palms problem.', dur: 4 },
  ],
  m6: [
    { who: 'RICO', text: 'Marco skimmed TWO YEARS of our cut. His coupe idles at the marina.', dur: 5 },
  ],
  m6_done: [
    { who: 'RICO', text: 'And THAT is why you never skim, kids.', dur: 3.5 },
    { who: 'RICO', text: 'The town is ours, baby. Palm trees and probable cause.', dur: 4.5 },
  ],
  wasted: [
    { who: 'MEDIC', text: 'Sir, you cannot park here. Also, you were clinically dead for a minute.', dur: 4.5 },
  ],
  busted: [
    { who: 'VPD', text: 'Anything you say will be misquoted in our favor.', dur: 4 },
  ],
  delivery: [
    { who: 'DISPATCH', text: 'Five drops. The tips are fictional, the rent is not.', dur: 4 },
  ],
  taxi: [
    { who: 'DISPATCH', text: 'Three fares. Tips optional, silence mandatory.', dur: 4 },
  ],
  sweep: [
    { who: 'DISPATCH', text: 'Three gang coupes. Consider them a driving exam.', dur: 4 },
  ],
  heatrun: [
    { who: 'DISPATCH', text: 'Forty-five seconds of being extremely famous. Try to survive it.', dur: 4.5 },
  ],
  pilotrun: [
    { who: 'DISPATCH', text: 'The pilot tips in flight hours. Conversion rate unclear.', dur: 4 },
  ],
  vicegp: [
    { who: 'ORGANIZER', text: 'Eight checkpoints. The stopwatch is a lie, the money is not.', dur: 4.5 },
  ],
  shop_spray: [
    { who: 'SPRAY GUY', text: 'New paint, old sins. That will be a hundred.', dur: 3.5 },
  ],
  shop_guns: [
    { who: 'BURT', text: 'Ammu-Nation: we slogan responsibly later.', dur: 3 },
  ],
};

const BARKS = {
  cop: [
    'All units, suspect is... extremely fast.',
    'Dispatch, he is driving like a movie. Send backup and popcorn.',
    'Suspect refused to pull over. Suspect also refuses everything else.',
    'Requesting air support AND a raise.',
    'He is heading for the beach. AGAIN. Beach patrol, earn your money.',
    'I went to college for this. Four years. For this.',
  ],
  ped_flee: [
    'Not again! I JUST got this laundry!',
    'Is that a gun or a phone?! IT IS A GUN.',
    'I am speed-walking for my LIFE.',
    'This town used to be so quiet!',
    'My therapist said visualization. I did not picture THIS.',
    'I only came out for empanadas!',
  ],
  rico: [
    'The tide waits for nobody, kid.',
    'Neon burns brightest before the sweep teams show up.',
    'You know what pairs well with crime? Breakfast.',
    'Marco used to skim. Then he skied. Into the harbor. Figure it out.',
    'Buy a cab one day. Honest work builds character. So I hear.',
  ],
  peds_idle: [
    'Palms need trimming. City says "aesthetic".',
    'The bus is FREE if you run alongside it. Kidding. Mostly.',
    'Heard the airfield land deal is back on.',
    'That pink coupe has been circling for an hour.',
    'Rain again? The reef sends regards.',
  ],
};

export class Dialogue {
  constructor(game) {
    this.game = game;
    this.queue = [];
    this.current = null;
    this.barkCd = 8;
  }

  play(setName, interrupt = false) {
    const set = SETS[setName];
    if (!set) return;
    if (interrupt) this.queue.length = 0;
    for (const line of set) this.queue.push({ ...line });
  }

  update(dt) {
    const g = this.game;
    if (g.shotMode) return; // staged screenshots keep their scripted subtitles
    if (this.current) {
      this.current.t -= dt;
      if (this.current.t <= 0) this.current = null;
    }
    if (!this.current && this.queue.length > 0) {
      const line = this.queue.shift();
      const text = line.who ? line.who + ': "' + line.text + '"' : line.text;
      g.hud.subtitle(text, line.dur ?? 3.5);
      this.current = { t: (line.dur ?? 3.5) + 0.4 };
    }
    // ambient barks during play
    this.barkCd -= dt;
    if (this.barkCd <= 0 && g.state === 'play') {
      this.barkCd = 9 + Math.random() * 10;
      const r = Math.random();
      if (g.police.wanted > 0 && r < 0.5) {
        this.bark('cop', 'VPD radio: ');
      } else if (g.wanted >= 2) {
        this.bark('ped_flee', '');
      } else if (r < 0.25) {
        this.bark('rico', 'RICO (phone): ');
      } else if (r < 0.55) {
        this.bark('peds_idle', 'Overheard: ');
      }
    }
  }

  bark(kind, prefix) {
    const lines = BARKS[kind];
    if (!lines || !lines.length) return;
    const line = lines[(Math.random() * lines.length) | 0];
    this.game.hud.subtitle(prefix + line, 3);
  }

  onWasted() { this.play('wasted', true); }
  onBusted() { this.play('busted', true); }
}
