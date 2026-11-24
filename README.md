[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jekjeki/vice-palms/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jekjeki/vice-palms/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Vice Palms

A neon-soaked, top-down open-city crime sandbox for the night — built from
scratch with zero dependencies (pure Canvas 2D + WebAudio, no libraries, no
network).

## The city

- **6400×6400** seeded night city: downtown towers with neon trims, residential
  pastel blocks, a central park with a pond, a beach with palms and lifeguard
  huts, **north docks** (piers, container stacks, cranes, cargo ships) and
  **Palm Airfield** (runway, taxiway, hangars, control tower, parked planes).
- Full road grid with right-hand traffic, working **red lights**, queueing,
  and a live traffic AI that turns at intersections.

## Play

- **8 vehicle types** (Sentinel, Banshee, Cabbie, Moonbeam, Bobcat, Coach,
  Cruiser, Stretch) with arcade drift physics, handbrake slides, damage →
  smoke → fire → explosion chains, headlight cones and tail lights.
- **On foot**: walk/sprint, mouse aiming, **4 weapons** (fists, pistol with
  ammo, shotgun spread, full-auto SMG), carjacking (F), health/armor/weapon
  pickups.
- **Story**: 6 chained missions as **Rico returns to Vice Palms** (diner →
  docks → airfield → beach → tower → the finale), plus **6 side missions**
  (Beach Sweep, Dock Sweep, Airfield Sprint, Neon Run, Pier Prowler, Ferry
  Flare). Markers, timers, payouts, fail-and-retry.
- **Wanted 1–5★**: cruisers pursue and ram, foot cops shoot and arrest,
  roadblocks at 3★+, a searchlight **helicopter at 4★**, out-of-sight decay,
  WASTED / BUSTED with hospital and bail fees.
- **Living city**: ambient events (gang drive-bys, street racers, patrol
  sweeps, crowds), bus stops, phone booths, dumpsters, neon billboards,
  pedestrians on phones, skidmarks from every drift.
- **Weather**: drifting rain storms with screen-space rain, lightning +
  thunder, wet-road sheen that reacts to the storm.
- **HUD**: money, health/armor bars, stars, speedometer, subtitles, mission
  banner and a circular minimap with blips.
- **Audio**: fully synthesized — engine pitch, gunfire (per weapon), crashes,
  explosions, sirens, rain ambience, thunder, pickups, and a looping synthwave
  bed (M to mute).

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | move / drive |
| SHIFT | sprint |
| SPACE | handbrake / shoot alternative |
| F | jack / enter / exit car |
| 1–4 / Q | weapon select / cycle |
| MOUSE | aim |
| LMB | shoot / punch |
| M | mute |
| ESC | pause (save / delete save) |
| F1 | controls overlay |
| GAMEPAD | stick move · A handbrake · X jack · Y mute · start pause |

## Run

```
node serve.ts            # http://localhost:8080
node serve.ts --port 8090
node main.ts             # build dossier into $MAKEFUN_OUTPUT_DIR (default /output)
```

Deterministic staged scenes for screenshots: `?shot=start|play|end|chaos&seed=N`
(mute with `&mute=1`). Saves live in `localStorage` under `vp_save1`.
