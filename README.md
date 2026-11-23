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

- **Night city, deterministic** — seeded road grid with neon-signed blocks, an old-town
  brick quarter, glass-tower downtown, a central palm park with fountain plaza, a beach
  strip (boardwalk, volleyball court, lifeguard towers), NORTH DOCKS (piers, container
  stacks, cranes, a cargo ship, fishing boats) and PALM AIRFIELD (runway, hangars,
  control tower, windsock, fuel drums).
- **8 vehicles** with arcade drift physics: handbrake slides, skidmarks, nitro boost
  (SHIFT), engine misfire at low health, damage smoke, fire, and proper explosions
  with radius damage.
- **Carjack anything** with F — drivers bail and bolt.
- **Wanted system 1–5**: cruiser pursuit with ramming, foot cops that shoot, roadblocks
  at 3+ stars, spike strips and a searchlight helicopter at 4+, out-of-sight decay,
  WASTED/BUSTED cards with respawn fees.
- **6 chained story missions** (Rico returns to Vice Palms) plus 6 repeatable side
  missions (Palm Delivery, Taxi Fare, Street Sweep, Heat Run, Pilot Run, Vice GP),
  timers, speed bonuses, payouts, subtitles.
- **Living city**: traffic AI with lane keeping, traffic lights, queueing, turn signals
  and horn abuse; pedestrians (joggers, dog walkers, tourists, umbrellas in the rain)
  that wander, cross at crosswalks and flee gunfire; dynamic city events (neon parade,
  docks raid, night market, squalls, dragnets); a looping Palm Line bus you can ride.
- **Services & secrets**: Pay 'n' Spray (clears wanted), Octane Fuel, Ammu-Nation,
  Palm Dogs, 8 stunt ramps with airtime payouts, 12 hidden packages, ammo/health/armor
  pickups.
- **Synthesized audio** — engine, gunshots, sirens, explosions, thunder, rain loop and a
  station-aware synthwave music engine (WebAudio only, M to mute).
- **Full city map** on TAB, pause-menu stats panel, save/delete-save via localStorage.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | walk / drive |
| SHIFT | sprint / nitro boost |
| SPACE | handbrake |
| F | enter / exit / carjack (or ride the bus at a Palm Line stop) |
| Mouse | aim, click to shoot (drive-bys work from cars) |
| E | punch / buy at counters |
| H | siren (in a cruiser) |
| R | next radio station (in a car) |
| TAB | city map |
| M | mute audio |
| ESC / P | pause (save / controls / delete-save / quit) |

## Staged screenshots

The four entry shots are deterministic scenes: `?shot=start|play|end|chaos&seed=N`
(mapped in `shots.json`), rendered at 1280×720 into `screenshots/`.

## Layout

- `game/` — the whole game (`index.html` + `src/*.js`, ES modules):
  `world` (city gen) · `cars`/`traffic` (physics + AI) · `player`/`peds` · `police` ·
  `missions` · `render`/`hud`/`screens`/`mapscreen` · `audio`/`radio` · `weather` ·
  `shops` · `jumps` · `transit` · `events` · `dialogue` · `shots` (staged scenes) ·
  `game` (state machine) · `main` (boot/loop)
- `serve.ts` — stdlib static server for `game/`
- `main.ts` — builds the make.fun dossier into `out/` via `vendor/makefun-game.ts`
- `screenshots/` — the 4 staged shots; `shots.json` describes them
