# makefun-best-game-01

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/gongdewei98-design/makefun-best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/gongdewei98-design/makefun-best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Emberdeep** — an original roguelike dungeon crawler: descend five torch-lit floors, fight monsters, gather relics that change how the run plays, and defeat the Ember King on floor 5.

## How to play

- **Move** with WASD or the arrow keys.
- **Sword**: click or hold Space to swing toward the mouse.
- **Ember bolt**: right-click (or F) to fire a bolt — three charges, recharging over time.
- **Dash**: Shift bursts through danger with brief invulnerability.
- **Pause**: P or Esc. **Mute**: M. **Restart**: R.
- Walk over gold to collect it, claim the relic on its pedestal on each floor, and stand on the glowing stairs to descend. Slay the Ember King to win; fall to zero health and the run ends.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. The game is plain static files under `game/` — no build step, no network requests, no libraries; art is procedural canvas and sound is synthesized WebAudio.

## Screenshots

The four screenshots in `screenshots/` are staged by the game itself: `?shot=title|combat|boss|victory` (see `shots.json`) plays the real rules forward with an autopilot and freezes the frame.

---

<sub>Entered on [make.fun](https://make.fun/?ref=5t4wfmsa&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
