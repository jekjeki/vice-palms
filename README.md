[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jekjeki/vice-palms/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jekjeki/vice-palms/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Vice Palms

A neon-soaked, top-down open-world driving game in the spirit of the classics —
built from scratch in vanilla JavaScript on canvas 2D. No libraries, no network,
no build step. One `game/` folder of ES modules, a static server, and you are
cruising Ocean Drive at 2 a.m.

## The city

Vice Palms is a seeded, deterministic night city:

- **Downtown** — a road grid of pseudo-3D towers with lit windows, neon trim and
  rooftop signs (PALMS, CASINO, LIQUOR…).
- **North Docks** — piers over black water, container stacks, two gantry
  cranes and a moored cargo ship.
- **Palm Airfield** — a fenced runway with hangars, a control tower and a
  parked cargo plane behind Gate 2.
- **Flamingo Park** — grass, a pond, a fountain, and trees you can crash into.
- **Palm Beach** — sand, palms, umbrellas and the Ocean Drive strip.

## What you do

- Drive 8 vehicle types with arcade physics: grip, drift, handbrake slides,
  crash damage, smoke, fire and explosions. Steal one of five moored boats
  for the harbor cruise instead.
- Walk, sprint, punch, and shoot a pistol with ammo. Aim with the mouse.
  Stock up at the two Ammu-Nation storefronts.
- Jack cars (F), run from the VCPD through a 5-star wanted system: pursuit
  cruisers that ram, Enforcer SUVs and a searchlight chopper at four stars,
  roadblocks at three, spike strips at five, foot cops that chase and shoot,
  and heat that decays when you slip out of sight. Get busted or wasted, pay
  the fee, respawn.
- Play the 6-chapter story: **Rico returns to Vice Palms** — Homecoming,
  Container Run, Palm Beach Pickup, Airfield Run, Dock Wars, The Last Palm —
  plus 4 side jobs (Taxi Rush, Vigilante, Beach Dash, Bank Run), endless
  courier runs, and 10 hidden palm tokens with a completion bonus.
- Weather rolls in: rain slicks the roads, lightning cracks, puddles pool.
- Pay 'n' Spray garages fix your car and cool the heat for $300.
- Save and continue via localStorage; progress autosaves after every mission.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | walk · drive |
| Shift | sprint |
| Mouse | aim (on foot) |
| Left click / Ctrl | punch · shoot |
| 1 / 2 | fists / pistol |
| E | enter / exit car or boat |
| F | carjack |
| Space | handbrake |
| R | radio station (Shift-R back) |
| M | city map |
| V / P | camera zoom / photo mode |
| F | fps meter |
| Esc | pause |

## Run it

```
node serve.ts            # http://localhost:8080  (--port N to change)
node main.ts             # builds out/dossier.json (MAKEFUN_OUTPUT_DIR to override)
```

Requires Node 22+. Everything runs locally; the game never touches the network.

## Staged screenshots

`?shot=start|play|end|chaos&seed=N` renders the four deterministic scenes that
live in `screenshots/` — audio muted, camera staged, sim stepped to settle.

## Layout

```
game/index.html        entry page
game/src/*.js          config, rng, util, input, audio, world, cars, traffic,
                       peds, player, police, missions, render, hud, screens,
                       shots, game, main, weather, radio, helicopter, tokens,
                       mapscreen, barks, stats, boats, pigeons, gunshops,
                       delivery
serve.ts               static file server
main.ts                dossier builder
shots.json             the 4 staged shot entries
vendor/                makefun kit (untouched)
```
