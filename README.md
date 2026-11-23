[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jekjeki/vice-palms/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jekjeki/vice-palms/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Vice Palms

An original open-world crime game in a neon coastal city at night, built for the make.fun bounty
gta6-01. Rico comes back to Vice Palms after six years away: steal cars, run six chained jobs for
old contacts, and shake a five-star police pursuit through a 40x40-block city with traffic,
pedestrians, a beach strip of palm hotels, parks, lots and one landmark plaza — all rendered on
one canvas with a two-layer night lighting pipeline and a fully synthesized soundtrack.

## Play

```
node serve.ts
```

then open http://localhost:8080 in desktop Chrome. Keyboard and mouse: WASD or arrows to walk or
drive, Shift to sprint, F to enter or steal the nearest car (again to bail out), Space for the
handbrake on wheels and punches on foot, E or left-click to shoot once a pistol is found, H for
the horn, Tab for the phone, R to spin the radio dial, P for photo mode, Esc to pause. Progress
autosaves to localStorage on every mission payout and pause (and on tab close); the title menu
can delete a save (press twice to confirm).

## Systems

- City: seeded generator — streets with two-way traffic and signals, sidewalk crowds (strollers,
  phone-gazers, sightseers frozen mid-photo, corner lingerers), parks, surface lots, neon signage
  (blades, marquees, rooftop billboards on every tall building, water tanks and antenna beacons
  notching the skyline), beach and ocean.
- Driving: arcade car physics with grip, engine braking on lift-off, handbrake slides that cook
  the rear tyres (smoke and screech), damage states (smoke, fire, blast) and ten stealable models
  plus the police cruiser.
- Traffic: kinematic lane AI — model-aware cruise speeds, gap keeping, red-light queueing,
  overtakes with blinking turn signals, indignant horns in long jams, turns at intersections.
- Police: five wanted stars (carjack +1, ped hit +1, shooting +2, cop kill +3). Cruisers spawn
  biased down the road you are driving, flank from three stars, fire from the window (faster
  triggers every star), try pit manoeuvres at four, and roadblock crews actually hold their post
  until you close in. Foot officers chase the sidewalks, back off a car driving at them, and a
  cornered player on foot gets BUSTED. Line-of-sight decay lets a clean escape bleed stars
  (downed officers spot nothing).
- Night lighting: base pass with full-strength emissives, an ambient multiply, and an additive
  glow pass — lamp pools, headlight cones (dark when parked), brake and reverse lamps, amber turn
  signals, wet-asphalt reflections, neon spill, sweeping police floodlights, antenna beacons,
  firelight, and an orange blast flash with camera shake.
- Missions: six chained story jobs (goto, steal-and-deliver, timed runs, collection, arson,
  a hot finale escape) with markers, fail/retry and cash payouts.
- HUD: circular minimap with a north tick and police blips, health/armor bars, a money counter
  that pulses on payout, wanted stars with an out-of-sight cooling cue, weapon readout, a
  speedometer dial with needle and gear, a hurt vignette at low health, and a backed objective
  plate with live metres-to-goal and mission banners.
- Sound: everything synthesized live with WebAudio behind a master compressor — engine with an
  idle lope, two-tone siren, two-tone horn, gunfire, explosions, tyre screech, blips and a
  looping synthwave pad (all of it ducks properly when the game pauses, and catching up after a
  pause skips the missed bars instead of stacking them).
- Deterministic staging: `?shot=start|play|end|chaos|docks&seed=N` builds a seeded scene and
  freezes one frame, which is how the four screenshots in `screenshots/` were taken (the cover
  is the docks at night). The title screen shows the world seed it is drifting across.

## New in this build

- **Palms Airfield** (north-west quarter of the grid): a working GA field laid over six
  claimed blocks — lit runway 09/27 with thresholds, touch-down zones and hold-short bars,
  a parallel taxiway with connectors, a three-stand apron with parked club aircraft and a
  fuel bowser on a real ramp loop, a terminal with lit glass frontage, a control tower with
  a rotating beacon and spinning radar, three hangars, a fuel depot, the Conch Cargo yard,
  windsocks that read the wind, a marshaller waving batons on stand 1, a perimeter fence
  with gates at every public-road crossing, and a full night-light set: edge lights, green
  and red thresholds, the approach "rabbit" strobe march, PAPI, taxiway teasers and apron
  floods.
- **Street races** (`E` at a checkered start line): three authored circuits on the public
  roads — the Airfield GP around the field fence, the Strip Sprint down the beachfront and
  the Downtown 500 through the older blocks. Countdown with beeps, three named rival
  drivers (REYES, KANTO, MOMO…) on a proper start grid, pure-pursuit AI with corner-blend
  racing lines, rubber-banding, soft separation, live standings plate, cash prizes by
  finishing place, driver barks on the results board and best-lap records in localStorage.
- **The Pit Below** (fight club, south side): a door and a ladder of five opponents from
  Tiny Bruno to Cinder Kalifa. Timed brawl — punch with the beat, dodge the telegraph
  flare, guard to soak, stamina economy, hit-stop and knockback, crowd of 52 with a roar
  that swells on big shots, corner-man advice after every fight, purse per win, door fee
  and the Coral Belt for clearing the card.
- **The Gilded Conch** (casino, east side): three games with real math — blackjack with a
  six-deck shoe, dealer stands on 17, double and 3:2 naturals; single-zero roulette with
  the European wheel order, straight bets at 35:1 and the outside rail; three-reel slots
  with weighted strips and a paytable. Chip cage buy-in and cash-out, posted table limits,
  rotating dealer patter, and the chips you leave with ride the save.
- **Boats**: four drivable hulls (Sunchaser Skiff, Wavecutter, Barracuda, Martini
  Royale) with keel-style water physics, reverse churn, mooring at the beach marina and
  the docks slip, a boat shop that berths your purchase at the pad, wake trails, bow/
  stern nav lights in the glow pass, and a Coast Guard patrol that hunts three-star heat
  on the water and shoots back.
- **Taxi shifts** (`E` at a rank, in any car): three ranks, fares waiting at kerbs with a
  destination arrow, a running meter, tips for smooth fast driving, penalties for scuffs,
  fare variety (Fare Dash with a soft clock, long hauls, big-tipping talkers), passenger
  quips and an end-of-shift grade.
- **The sky**: a real time-of-day pass — dusk-to-dawn gradient loop, 170-star wheel with
  twinkle, an arcing moon with halo and maria, drifting parallax clouds that catch fire at
  dusk, occasional shooting stars, a slow satellite, and a two-tier distant city
  silhouette ring on the northern horizon with lit windows, blinking beacons, harbor
  running lights and the airfield's glow dome.
- **New cover shot** (`?shot=race`): the Airfield GP grid at dusk — four cars staged on
  the start line, the runway lights burning and the approach strobe mid-march.
- **North Docks** (`?shot=docks`): a whole second district north of the grid — five piers on
  pilings reaching into the bay, three container yards with stacked colored boxes and rolling
  gantry cranes, warehouses with ribbed roll-up doors, a mooring-bollard promenade, a fish
  market on Pier B, oil drums, security fences, sodium lamps and floodlight masts, rain
  puddles that shine when the weather soaks the apron, a rail spur with a loaded flatcar, the
  moored MV Coral Crown rolling on the swell, a rotating lighthouse on the breakwater and
  the Bay Marina island across the water. The district is wired into collision (the seawall,
  pier rails and yard fences all stop you; the security gate lifts as you approach), into the
  minimap (stamped landmarks, turf tints, live blips) and into its own staged night scene.
- **Gangs**: The Tides hold the west water, The Cinders the east yards. Turf heat per block
  rises with trouble and cools over time; skirmishes erupt near the boundary — join one with
  `E` and your side's loyalty (and wallet) grows, pick the wrong side and it doesn't. Drive-bys
  strafe rival blocks with real bullets, gang members wear crew colors in the crowd, and each
  hideout door opens to a loyal friend (free patch-up, quiet cash, and a pistol at high
  loyalty). Loyalty rides the save.
- **Phone** (`Tab`): contacts with scripted mission calls, the property ledger (buy, banked
  income, garages), the FM dial, a camera shortcut and a message inbox with toast
  notifications. The pocket world keeps stepping while you text; nobody walks or shoots.
- **Property**: two businesses bank passive income on a tick you collect from the phone, and
  three safehouses (including a Pier B walk-up) hold garage slots — and take you in when you
  get wasted, instead of the hospital.
- **Ferry**: a working ferry crosses the bay from the North Docks slip to the Bay Marina
  landing on a schedule. Board with `E` at the slip, ride the deck while she sails (horn and
  wake included), and step off on the island. The schedule board at the slip tells you when.
- **Weather**: the sky cycles clear → rain → storm → fog on a weighted clock. Rain streaks
  slant with the wind, storms flash lightning with delayed thunder and camera shake, fog banks
  swallow the coast and fog-of-war on the minimap, wet roads steal the player's grip and make
  every driver in town brake earlier, and the docks' puddles mirror the sodium light.
- **Heists**: "The Coral Crown Job" — a four-stage score out of the docks (case the harbormaster
  office, lift the contraband off the Pier C skiff, outrun harbor security through coast-road
  checkpoints, hand off at Pier A) with per-stage timers, police response that scales with the
  noise you make, a time-bonus/heat-penalty payout, a Marla thread on your phone, and death
  ending the job for real.
- **HUD**: the minimap now covers the docks with stamped landmarks and turf, live blips for the
  ferry, skirmishes and hideouts, weather fog-of-war, an interaction prompt plate, toast
  notifications and the pocket phone panel.
- **Radio** (`R` to spin the dial): four stations — Flamingo FM, Pulse 103, Coral Classics and
  Nightwire — each with its own chord palette, tempo, swing and DJ persona. Songs rotate through
  a per-station play list, the DJ drops patter lines between tracks, a burst of static covers
  every switch, a station wheel rides the right edge of the screen while you drive, and a live
  ducking rule pulls the whole mix down under a closing siren. The dial state rides the save.
- **Cutscenes**: every job now opens and closes with a letterboxed scene — a staged camera pan
  across the actual city, cast silhouettes on their marks, timed subtitle beats, and Space to
  skip. The world keeps stepping behind the letterbox.
- **Dialog**: the streets talk. Ambient pedestrian barks keyed to the mood (calm, uneasy,
  gunfire), dispatcher chatter keyed to the pursuit state machine, mission control lines on
  begin/pass/fail — all on one subtitle strip with speaker names and priority preemption.
- **Interiors**: four venues are open — Club Riviera, the Coral Diner, Rosa's garage bay and the
  24-hour pawn shop. Walk to the door marker on foot, press `G`, and the room takes over the
  screen: animated furniture, patrons, interior pickups on their own respawn clocks, and an exit
  pad back to the street. Dying inside an interior no longer strands the room around you.
- **Photo mode** (`P`): the shutter parks the night. Free pan and zoom (wheel or `Q`/`E`), five
  colour filters on `F`, corner brackets with rule-of-thirds ticks, a fake focal-length readout,
  and Space captures a watermarked frame into an in-memory reel of twelve. Shots live as data
  URLs — nothing leaves the page.

## Plumbing

- `main.ts` copies `game/` and `screenshots/` to the output directory and writes `dossier.json`
  with the vendored make.fun library (`vendor/makefun-game.ts`, byte-identical to the kit).
  Outside the grader: `mkdir out; $env:MAKEFUN_OUTPUT_DIR="out"; node main.ts`.
- `shots.json` lists the four staged screenshot URLs; `serve.ts` serves `game/` locally
  (Ctrl+C shuts it down, a busy port tells you the next one to try).
