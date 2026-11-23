[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jekjeki/vice-palms/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jekjeki/vice-palms/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Vice Palms

A top-down open-world crime sandbox in the spirit of the classic GTA era — built from
scratch in vanilla JavaScript (Canvas 2D, WebAudio, zero libraries, zero network calls).
Night-time neon coastal city, drivable traffic, carjacking, a 5-star wanted system,
6 chained story missions ("Rico returns to Vice Palms"), 3 side missions, and a
synthwave radio — all in one `game/` folder of static files.

## Play

```sh
node serve.ts            # serves game/ at http://localhost:8080
node serve.ts --port 8090
```

Then open <http://localhost:8080>.

## Controls

| Key | Action |
| --- | --- |
| `W A S D` | Walk / drive |
| `Shift` | Sprint |
| `F` | Carjack / enter / exit vehicle |
| `Mouse` | Aim |
| `Left click` | Punch / shoot |
| `1 / 2` | Fists / pistol |
| `Space` | Handbrake |
| `M` | Mute audio |
| `Esc` | Pause menu (save / load / quit) |
| `Tab` | Big map |

## Features

- **World** — a deterministic, seeded 6400×4800 night city: downtown high-rises with lit
  windows and neon signs, residential blocks, a palm park, an Ocean Drive beach strip,
  the **North Docks** (container yard, gantry cranes, cargo ship) and **Palm Airfield**
  (runway, hangars, control tower).
- **Driving** — 8 vehicle types with arcade drift physics, handbrake, damage model
  (scratches → smoke → fire → explosion), headlights, and traffic that obeys lights
  and queues behind you.
- **Wanted system** — 1–5 stars, cruiser pursuit and ramming, foot cops that shoot,
  roadblocks at 3★+, out-of-sight decay, WASTED / BUSTED with respawn fees.
- **Missions** — 6 chained story missions plus 3 repeatable side gigs (Fare Rush,
  Express Post, Beach Rampage) with markers, timers, checkpoints, fail/retry and payouts.
- **Presentation** — neon glow, headlight cones, wet-road sheen, explosion flash and
  camera shake, circular minimap, speedometer, synthesized synthwave radio, engine,
  sirens, gunshots and explosions — all generated in WebAudio.

## Staged screenshots

`shots.json` lists the four deterministic staged scenes used for `screenshots/`
(`?shot=start|play|end|chaos&seed=1337`).

## Repo layout

```
game/            the game (index.html + src/*.js, no dependencies)
screenshots/     4 rendered screenshots (≤256 KiB each)
serve.ts         static server for game/
main.ts          builds out/dossier.json via vendor/makefun-game.ts
vendor/          make.fun kit (untouched)
```

## License

MIT — see [LICENSE](LICENSE).
