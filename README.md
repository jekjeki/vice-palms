[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jekjeki/vice-palms/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jekjeki/vice-palms/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Vice Palms

A top-down, open-world night-drive fable built with raw Canvas 2D — no libraries, no network, everything synthesized (graphics, physics, audio). Rico returns to Vice Palms: six chained story missions, three side hustles, five stars of heat, and one neon-soaked coastal city with a port district and a palm-fringed airfield.

## Run it

```sh
node serve.ts            # http://localhost:8080  (or --port N)
```

## Play

| Key | Action |
|---|---|
| `W A S D` / arrows | walk / drive |
| `SHIFT` | sprint |
| `F` | enter / exit / jack a car |
| `LMB` / `CTRL` | punch · shoot (mouse aims) |
| `SPACE` | handbrake |
| `H` | horn |
| `ESC` | pause (save game here) |
| `M` | mute |

## The city

- **Downtown grid** — parallax 2.5D towers with neon trim, wet asphalt after the rain.
- **North Docks** — piers, container stacks, gantry cranes, a moored freighter.
- **Palm Airfield** — runway, hangars, control tower, and one suspicious crate.
- **Ocean Drive** — beach, palms, and three race gates.
- Traffic obeys the lights until it panics. Peds wander, then run. The VP Metro PD escalates from one star to roadblocks.

## Missions

Six story missions start at **Rico's Diner** (yellow marker). Side hustles (blue markers): **Cab Duty** at the taxi stand, **Beach Run** on Ocean Drive, **Vigilante** at the police station. Fail a mission and the giver marker reappears — walk back in to retry.

## Determinism

`?seed=N` reseeds the world and traffic. `?shot=start|play|end|chaos` stages the four dossier screenshots deterministically. `?mute=1` keeps every test silent.

## Layout

```
game/            the whole game (index.html + ES modules)
serve.ts         stdlib static server for game/
main.ts          builds out/dossier.json via vendor/makefun-game.ts
screenshots/     the four staged renders
vendor/, LICENSE make.fun kit (untouched)
```
