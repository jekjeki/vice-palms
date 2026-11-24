[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jekjeki/vice-palms/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jekjeki/vice-palms/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Vice Palms

A neon night-coast crime sandbox in one HTML page — no libraries, no network, no build step.
Top-down 2.5D city, arcade cars with drift and handbrakes, a five-star VCPD, pedestrians with
survival instincts, and six chained story jobs for Rico Vargas plus three side hustles.

## Play

```bash
node serve.ts            # http://localhost:8080
# or any static server pointed at game/
```

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | walk / drive |
| Shift | sprint |
| F | enter, jack or leave a car |
| Space | handbrake |
| Left mouse / Ctrl | shoot (pistol, ammo limited) |
| R | reload |
| V | throw a punch |
| Esc | pause |
| M | mute |

## The city

Seeded and deterministic: a road-grid downtown with neon towers, Palm Park, a south beach
boardwalk, the North Docks (container yards, cranes, piers and the *Coral Maid*), and Palm
Airfield with runway, hangars and control tower. Traffic follows lanes, obeys lights and
queues; cops ram, set roadblocks at three stars, and shoot on foot. WASTED and BUSTED cost
money. Progress saves to `localStorage` from the pause menu.

## Staged screenshots

`?shot=start|play|end|chaos&seed=N&mute=1` builds the four deterministic scenes captured in
`screenshots/` (see `shots.json`). `node main.ts` assembles the make.fun dossier into
`$MAKEFUN_OUTPUT_DIR` (default `/output`).

## Structure

```
game/index.html        shell
game/src/*.js          config, util(+RNG), input, audio (all WebAudio-synthesized),
                       world, cars, traffic, peds, player, police, missions,
                       render, hud, screens, shots, game, main
serve.ts               stdlib static server (Node 22)
main.ts                dossier builder (Node 22 type stripping)
```
