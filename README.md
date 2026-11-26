# Nusantara Skies — Make the best flight game

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/hacker-beep/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/hacker-beep/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

**Nusantara Skies** is an original flat-cartoon flight game: fly a island-hopper
from Jakarta (CGK) to Denpasar (DPS) across the Indonesian archipelago. Chase
view over recognisable island terrain, a live cockpit gauge panel, rings to fly
through, a storm front to thread, fuel to manage, and a runway landing to stick.

## Play

Open `game/index.html` in desktop Chrome (or run `node serve.ts` and open
http://localhost:8080). No network requests, no build step.

- **← → / A D** — steer (bank the wings)
- **↑ ↓ / W S** — climb / descend
- **SPACE / SHIFT** — boost (burns fuel faster)
- **P** — pause, **M** — sound on/off, **R** — restart, **ENTER** — start

## The flight

1. **Stage 1 — Kepulauan Seribu:** fly through 6 sky rings over the islands.
2. **Stage 2 — Badai Merapi:** thread the storm front, dodge lightning cells.
3. **Stage 3 — Final Approach:** line up with the DPS runway and land.

Win by landing on the runway with fuel to spare. Lose by running out of fuel
or shredding the hull in the storm. Score comes from rings, combos, near
misses, and the landing bonus.

## Tech

- Pure canvas 2D, zero dependencies, all art drawn in code, all sound
  synthesised with WebAudio.
- Deterministic: a seeded RNG drives every island, ring and gust, and the
  simulation steps on a fixed 1/60 s clock, so two runs with the same seed
  play out byte-identically.
- Screenshots in `screenshots/` are real renders of the game in Chrome.

## License

MIT — see `LICENSE`.
