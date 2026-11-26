# best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Usogakie/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Usogakie/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Kestrel Ridge — Canyon Courier.** A chase-view flight game in plain canvas 2D, no build step and no network: fly the dawn mail run out of a mountain valley, thread every glowing ring of the sortie, watch your fuel, then bring the Kestrel home to land on the strip and refuel. Three sorties with tighter rings and longer legs, stall speed and canyon walls that punish careless flying, and a lit instrument panel — attitude indicator, altimeter, airspeed and vertical-speed tapes, fuel and throttle bars, compass strip, and a next-ring bearing readout.

## Run it

```sh
cd game && python3 -m http.server 8080
```

Then open http://localhost:8080 in desktop Chrome. W/S throttle, arrow keys or mouse to steer, Space airbrake, Enter to start, R to restart.

## How it is built

- `game/index.html` — the page; everything else is an ES module under `game/src/`.
- `game/src/main.js` — game states, flight model, missions, screenshot poses.
- `game/src/world.js` — the seeded valley: terrain height, runway, rings, sorties.
- `game/src/render.js` — perspective projection, terrain, runway, rings, aircraft, HUD.
- `game/src/input.js` — keyboard and mouse.
- `game/src/audio.js` — synthesised engine, wind and chimes (Web Audio, no files).
- `game/src/rng.js` — seeded random numbers and angle helpers.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library.
- `screenshots/` — real renders of the game: `1-play.jpg` (cover, mid-flight through the rings), `2-start.jpg` (title on the strip), `3-end.jpg` (sortie complete).

---

<sub>Entered on [make.fun](https://make.fun/?ref=nc97zkkt&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
