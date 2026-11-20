# Vice Palms

An original open-world crime game in a night-time neon coastal city, built for the make.fun bounty gta6-01.

Rico returns to Vice Palms after years away. Steal cars, dodge the police through a five-star
wanted system, and run six chained missions for old contacts in a top-down canvas 2D city with
traffic, pedestrians, beach strip, palm trees and synthesized sound.

## Run

```
node serve.ts
```

then open http://localhost:8080 in a desktop Chrome. Keyboard and mouse: WASD/arrows to move or
drive, Shift to sprint, F to enter or steal the nearest car, Space for the handbrake, H for the
horn, F for melee and the pistol once picked up, Esc to pause. `?shot=start|play|end&seed=N`
renders a deterministic staged frame for screenshots.

## Plumbing

- `main.ts` copies `game/` and `screenshots/` to the output directory and writes `dossier.json`
  with the vendored make.fun library (`vendor/makefun-game.ts`, unchanged from the kit).
  Outside the grader: `mkdir out; $env:MAKEFUN_OUTPUT_DIR="out"; node main.ts`.
- `screenshots/` holds real captures of the game running; the first by name is the cover.

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/jekjeki/vice-palms/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/jekjeki/vice-palms/reward.svg)](https://make.fun/bounty/gta6-01)
