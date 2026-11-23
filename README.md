[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jekjeki/vice-palms/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jekjeki/vice-palms/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Vice Palms

A top-down open-world crime sandbox for the night streets of a neon coastal city — built
from scratch for the make.fun `gta6-01` bounty. Pure vanilla JavaScript + Canvas 2D,
no libraries, no network. Everything runs locally in the browser.

## Play

```sh
node serve.ts            # http://localhost:8080/  (or --port N)
```

Then open http://localhost:8080 and press ENTER.

## Features

- **Night city, deterministic** — seeded road grid with neon-signed blocks, a central palm
  park, a beach strip, NORTH DOCKS (piers, container stacks, cranes, a cargo ship) and
  PALM AIRFIELD (runway, hangars, control tower, fence).
- **8 vehicles** with arcade drift physics: handbrake slides, skidmarks, damage smoke,
  fire, and proper explosions with radius damage.
- **Carjack anything** with F — drivers bail and bolt.
- **Wanted system 1–5**: cruiser pursuit with ramming, foot cops that shoot, roadblocks
  at 3+ stars, out-of-sight decay, WASTED/BUSTED cards with respawn fees.
- **6 chained story missions** (Rico returns to Vice Palms) plus 3 repeatable side
  missions (Palm Delivery, Taxi Fare, Street Sweep), timers, payouts, subtitles.
- **Traffic AI** with lane keeping, traffic lights, queueing and horn abuse; pedestrians
  wander sidewalks and flee gunfire.
- **Synthesized audio** — engine, gunshots, sirens, explosions and a synthwave loop
  (WebAudio only, M to mute).
- **Save/delete-save** via the pause menu (localStorage), plus a circular minimap,
  speedometer, and full HUD.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | walk / drive |
| SHIFT | sprint |
| SPACE | handbrake |
| F | enter / exit / carjack |
| Mouse | aim, click to shoot |
| E | punch |
| M | mute audio |
| ESC / P | pause (save / delete-save / quit) |

## Staged screenshots

The four entry shots are deterministic scenes: `?shot=start|play|end|chaos&seed=N`
(mapped in `shots.json`), rendered at 1280×720 into `screenshots/`.

## Layout

- `game/` — the whole game (`index.html` + `src/*.js`, ES modules)
- `serve.ts` — stdlib static server for `game/`
- `main.ts` — builds the make.fun dossier into `out/` via `vendor/makefun-game.ts`
- `screenshots/` — the 4 staged shots; `shots.json` describes them
