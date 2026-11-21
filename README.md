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
the horn, Esc to pause. Progress autosaves to localStorage on every mission payout and pause.

## Systems

- City: seeded generator — streets with two-way traffic and signals, sidewalk crowds, parks,
  surface lots, neon signage (blades, marquees, rooftop billboards), beach and ocean.
- Driving: arcade car physics with grip, handbrake slides, damage states (smoke, fire, blast)
  and ten stealable models plus the police cruiser.
- Traffic: kinematic lane AI — gap keeping, red-light queueing, overtakes with blinkers, turns.
- Police: five wanted stars (carjack +1, ped hit +1, shooting +2, cop kill +3), pursuit with
  flanking, window fire at three stars, pit attempts at four, roadblocks, foot officers,
  and a line-of-sight decay when you slip away.
- Missions: six chained story jobs (goto, steal-and-deliver, timed runs, collection, arson,
  a hot finale escape) with markers, fail/retry and cash payouts.
- HUD: circular minimap, health/armor, money, wanted stars, speedometer, objectives and banners.
- Sound: everything synthesized live with WebAudio — engine, siren, gunfire, explosions,
  blips and a looping synthwave pad.
- Deterministic staging: `?shot=start|play|end|chaos&seed=N` builds a seeded scene and freezes
  one frame, which is how the four screenshots in `screenshots/` were taken.

## Plumbing

- `main.ts` copies `game/` and `screenshots/` to the output directory and writes `dossier.json`
  with the vendored make.fun library (`vendor/makefun-game.ts`, byte-identical to the kit).
  Outside the grader: `mkdir out; $env:MAKEFUN_OUTPUT_DIR="out"; node main.ts`.
- `shots.json` lists the four staged screenshot URLs; `serve.ts` serves `game/` locally.
