[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jekjeki/vice-palms/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jekjeki/vice-palms/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Vice Palms

An original open-world crime game in a neon coastal city at night, built for the make.fun bounty
gta6-01. Rico comes back to Vice Palms after six years away: steal cars, run six chained jobs for
old contacts, and shake a five-star police pursuit through a 40x40-block city with traffic,
pedestrians, a beach strip of palm hotels, parks, lots and one landmark plaza — all rendered on
one canvas with a two-layer night lighting pipeline and a fully synthesized soundtrack.

## Play

```
node serve.ts
```

then open http://localhost:8080 in desktop Chrome. Keyboard and mouse: WASD or arrows to walk or
drive, Shift to sprint, F to enter or steal the nearest car (again to bail out), Space for the
handbrake on wheels and punches on foot, E or left-click to shoot once a pistol is found, H for
the horn, Esc to pause. Progress autosaves to localStorage on every mission payout and pause;
the title menu can delete a save (press twice to confirm).

## Systems

- City: seeded generator — streets with two-way traffic and signals, sidewalk crowds (strollers,
  phone-gazers, sightseers frozen mid-photo), parks, surface lots, neon signage (blades,
  marquees, rooftop billboards on every tall building, water tanks notching the skyline), beach
  and ocean.
- Driving: arcade car physics with grip, handbrake slides that cook the rear tyres (smoke and
  screech), damage states (smoke, fire, blast) and ten stealable models plus the police cruiser.
- Traffic: kinematic lane AI — model-aware cruise speeds, gap keeping, red-light queueing,
  overtakes with blinkers, turns at intersections.
- Police: five wanted stars (carjack +1, ped hit +1, shooting +2, cop kill +3). Cruisers spawn
  biased down the road you are driving, flank from three stars, fire from the window, try pit
  manoeuvres at four, and roadblock crews actually hold their post until you close in. Foot
  officers chase the sidewalks and a cornered player on foot gets BUSTED. Line-of-sight decay
  lets a clean escape bleed stars (downed officers spot nothing).
- Night lighting: base pass with full-strength emissives, an ambient multiply, and an additive
  glow pass — lamp pools, headlight cones (dark when parked), brake and reverse lamps, wet-asphalt
  reflections, neon spill, sweeping police floodlights, firelight, and an orange blast flash
  with camera shake.
- Missions: six chained story jobs (goto, steal-and-deliver, timed runs, collection, arson,
  a hot finale escape) with markers, fail/retry and cash payouts.
- HUD: circular minimap with a north tick and police blips, health/armor bars, a money counter
  that pulses on payout, wanted stars with an out-of-sight cooling cue, weapon readout,
  speedometer with gear, backed objective plate and mission banners.
- Sound: everything synthesized live with WebAudio — engine, siren, gunfire, explosions, tyre
  screech, blips and a looping synthwave pad (all of it ducks properly when the game pauses,
  and catching up after a pause skips the missed bars instead of stacking them).
- Deterministic staging: `?shot=start|play|end|chaos&seed=N` builds a seeded scene and freezes
  one frame, which is how the four screenshots in `screenshots/` were taken. The title screen
  shows the world seed it is drifting across.

## Plumbing

- `main.ts` copies `game/` and `screenshots/` to the output directory and writes `dossier.json`
  with the vendored make.fun library (`vendor/makefun-game.ts`, byte-identical to the kit).
  Outside the grader: `mkdir out; $env:MAKEFUN_OUTPUT_DIR="out"; node main.ts`.
- `shots.json` lists the four staged screenshot URLs; `serve.ts` serves `game/` locally.
