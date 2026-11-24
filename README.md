[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jekjeki/vice-palms/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jekjeki/vice-palms/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# VICE PALMS

A neon-coastal top-down crime story for the make.fun **gta6-01** bounty. Pure
Canvas 2D + WebAudio, zero libraries, zero network — everything is synthesized
in the browser.

## Play

```bash
node serve.ts            # http://localhost:8080  (--port N for another port)
```

## The city

- **Vice Palms strip** — a road-grid night city with neon signs, street lamps
  and a wet-asphalt sheen.
- **Ocean Drive & the beach** — sand, boardwalk, palms, umbrellas and piers.
- **Palm Park** — grass, paths, a pond, palm groves.
- **The North Docks** — piers, container stacks, cranes and the cargo ship
  *Palm Star*.
- **Palm Airfield** — runway, hangars and an ATC tower.

## Features

- 8 vehicle types with arcade physics: drift, handbrake, skid marks,
  progressive damage (smoke → fire → explosion), headlights, water sinking.
- Lane-following traffic that obeys the two-phase lights and queues.
- Pedestrians that stroll, sunbathe and flee gunfire; gang lookouts that shoot.
- Wanted system 1–5 stars: cruiser pursuit with ramming, roadblocks at 3+,
  foot cops that shoot, line-of-sight decay, WASTED and BUSTED respawns with fees.
- Player: walk / sprint, fists + pistol (with soft auto-aim), carjacking (F),
  health / armor / money.
- 6 chained story missions (Rico is back in Vice Palms) + 3 repeatable side
  gigs (taxi fares, vigilante, hot delivery) with markers, timers, payouts,
  fail/retry and subtitles.
- HUD with circular minimap, speedo, wanted stars, objective text and toasts.
- Full synthesized audio: engine, sirens, gunshots, explosions and a
  synthwave bass loop.
- Save / continue via `localStorage` (title menu and pause menu).

## Controls

| key | action |
| --- | --- |
| WASD / arrows | drive / walk |
| SPACE | attack on foot / handbrake in a car |
| SHIFT | sprint |
| F | enter or jack the nearest car |
| Q | switch weapon (fists ↔ pistol) |
| H | horn |
| ESC / P | pause |

## Staged scenes

`?shot=start|play|end|chaos&seed=N` renders the four deterministic scenes used
for `screenshots/` (also with `&mute=1` to silence audio).

## Build the dossier

```bash
node main.ts   # copies game/ + screenshots/ into $MAKEFUN_OUTPUT_DIR (or /output)
               # and writes dossier.json via the vendored makefun kit
```
