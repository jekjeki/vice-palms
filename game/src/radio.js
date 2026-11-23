// radio.js — in-car radio: stations, rotating tracks, R to surf the dial
export const STATIONS = [
  {
    id: 'wave', name: 'WAVE 101.3', flavor: 'synthwave', color: '#ff5da2',
    tracks: [
      'Neon Overpass — Chrome Palms',
      'Vice Line — Midnight Convertible',
      'Palm Mall — After Hours',
      'Rosetta Boulevard — Wet Asphalt',
      'Sunset Grade — Ember Engine',
    ],
  },
  {
    id: 'jazz', name: 'SLOW JAMZ 88.9', flavor: 'late-night rnb', color: '#c77dff',
    tracks: [
      'Dorian Dunes — Slow Tide',
      'Marina Soule — Golden Hour Graffiti',
      'The Boardwalkers — Velvet Traffic',
      'Kiko Marsh — Palm Smoke',
    ],
  },
  {
    id: 'talk', name: 'VP TALK 1220', flavor: 'talk radio', color: '#00e5ff',
    tracks: [
      '"Are Cop Chases Out of Control?" — caller marathon',
      'Mayor on the Airfield Land Deal',
      'Conspiracy Hour: The Cargo Ship That Never Docks',
      'Traffic Watch: The 8th Street Forever Jam',
    ],
  },
  {
    id: 'pulse', name: 'PULSE FM 104.7', flavor: 'electro', color: '#8cff5d',
    tracks: [
      'Grid Kid — Polygon Fever',
      'Ana Logue — Dockside Bass',
      'Runway Two — Afterburner',
      'Circuit Reef — Strobe Bazaar',
    ],
  },
  {
    id: 'off', name: 'RADIO OFF', flavor: 'silence', color: '#8a93a2',
    tracks: ['—'],
  },
];

export class Radio {
  constructor(game) {
    this.game = game;
    this.stationIndex = 0;
    this.trackIndex = 0;
    this.trackT = 0;
    this.cool = 0;
    this.lastShown = '';
    this.stationId = 'wave';
  }

  get station() { return STATIONS[this.stationIndex]; }
  get track() { const t = this.station.tracks; return t[this.trackIndex % t.length]; }

  update(dt, inCar) {
    this.cool = Math.max(0, this.cool - dt);
    if (!inCar) return;
    this.trackT += dt;
    if (this.trackT > 90) {
      this.trackT = 0;
      this.trackIndex++;
      this.show(true);
    }
    // R: next station
    if (this.game.input.pressed('R') && this.cool <= 0) {
      this.cool = 0.4;
      this.stationIndex = (this.stationIndex + 1) % STATIONS.length;
      this.trackIndex = 0;
      this.trackT = 0;
      this.show(true);
      this.game.audio?.missionTick?.();
    }
  }

  // toast the current station + track when it changes or the player gets in
  show(force = false) {
    if (!this.station) return;
    const key = this.station.id + ':' + this.track;
    if (!force && key === this.lastShown) return;
    this.lastShown = key;
    this.stationId = this.station.id;
    if (this.game.audio) this.game.audio.stationId = this.station.id;
    if (this.station.id === 'off') {
      this.game.hud.toast('Radio off');
    } else {
      this.game.hud.toast(this.station.name + ' · ' + this.track);
    }
  }

  onEnterCar() { this.trackT = 0; this.show(true); }
  onExitCar() { /* keeps playing softly */ }

  serialize() { return { stationIndex: this.stationIndex, trackIndex: this.trackIndex }; }
  deserialize(d) { if (d) { this.stationIndex = d.stationIndex ?? 0; this.trackIndex = d.trackIndex ?? 0; } }
}
