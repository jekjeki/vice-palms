# Vice Palms

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jekjeki/vice-palms/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jekjeki/vice-palms/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A compact top-down open-world crime sandbox in the GTA style, built from scratch for the
make.fun bounty **gta6-01**. Seeded neon night city (downtown grid, park, beach boardwalk,
container docks), 8 drivable car types with arcade physics, lane traffic and pedestrians,
carjacking, a 5-star wanted system with cruisers and roadblocks, 6 chained story missions
for Rico, synth audio, save/load, and deterministic screenshot states.

## Run

```bash
node serve.ts
# → http://localhost:8080
```

No build step, no dependencies — plain ES modules and Canvas 2D. Set `PORT` to override the default port `8080`.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move / drive |
| Shift | Sprint |
| F | Enter / exit / carjack |
| J or Left Click | Punch / shoot |
| K | Swap weapon (fists ↔ pistol) |
| Space | Handbrake |
| P / Esc | Pause (save: O, load: I) |
| M | Mute audio |

## Deterministic screenshots

```bash
# ?shot=start|play|end|chaos&seed=N
http://localhost:8080/?shot=play&seed=1337
```

The page sets `window.__shotReady` once the staged state is on screen — handy for automated
capture (1280×720 renders live in `screenshots/`).
