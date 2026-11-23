[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jekjeki/vice-palms/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jekjeki/vice-palms/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# VICE PALMS

A neon-night open-world driving game — one seeded city, built from scratch as
plain static ES modules (Canvas 2D + WebAudio, zero libraries, zero network
requests, zero external assets). Rico is back in Vice Palms and the blue
marker has work for you.

## What's inside

- **One deterministic night city** — road grid, downtown neon towers, a
  south beach with a ferris wheel, a park, the **North Docks** (piers,
  containers, cranes, a moored ship) and the **Palm Airfield** (runway,
  hangars, tower). Same seed → same city.
- **8 vehicle types** with arcade physics: accel, drift, handbrake, damage
  that smokes, then burns, then explodes with radius damage. Headlights,
  brake lights, turn signals, sirens.
- **Traffic AI** that follows lanes, obeys the lights, queues, yields on
  left turns and panics at gunfire. **Pedestrians** that wander, bake on the
  beach, wobble, phone-walk and flee.
- **The VCPD**: a 1–5 star heat system — pursuit, ramming, roadblocks at 3
  stars, foot cops that shoot, a helicopter searchlight at 4, sight-based
  decay, WASTED/BUSTED with fees.
- **6 chained story missions** (Rico returns to Vice Palms) + **3 side
  hustles** (cab fares, a rampage, a checkpoint race), with markers, timers,
  fail/retry, payouts and subtitles.
- **Night lighting pipeline**: ambient lightmap, neon/headlight glow, bloom,
  wet-road sheen, explosion flash + camera shake, weather (fog, storms,
  lightning), circular minimap and a full city map on `TAB`.
- **Synthwave radio** (3 stations), engine, skids, sirens, thunder — all
  synthesized in WebAudio.

## Run it

```sh
node serve.ts
```

then open <http://localhost:8080>. (Serves `game/` with no build step.)

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrows / stick | move / drive |
| `Shift` | sprint |
| `F` / `E` | enter / exit / carjack |
| `Space` | handbrake |
| Mouse / `Ctrl` | aim & fire (drive-by works too) |
| `1` `2` / `Q` | weapons |
| `H` / `R` | horn / radio station |
| `Tab` | city map |
| `Esc` | pause (save / restart mission / quit) |
| `M` | mute |

## Deterministic staged shots

The four screenshots in `screenshots/` are real renders of staged scenes:

```
/?shot=start&seed=1337    # title cover
/?shot=play&seed=4242     # cruising Ocean Drive
/?shot=end&seed=4242      # mission passed
/?shot=chaos&seed=777     # 4 stars, a car cooking off
```

`?mute=1` silences audio (the shot URLs are always muted); `?seed=N` pins the
city; `?fps=1` shows the frame counter.

## Build the dossier

```sh
$env:MAKEFUN_OUTPUT_DIR="out"; node main.ts
```

copies `game/` + `screenshots/` into `out/` and writes `out/dossier.json`
under the bounty caps (text 163,840 B; ≤4 screenshots @ 262,144 B; ≤993 game
files @ 50,331,648 B; paths ≤1,000 B).

---

*All code in this repo was written from scratch for the make.fun gta6-01
bounty. No Rockstar assets, code, or trademarks are used; "Vice Palms" is an
original homage to the genre.*
