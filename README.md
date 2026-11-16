# NEON BREACH — a three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/guoyonglong96/threejs-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/guoyonglong96/threejs-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical first-person shooter in the style Counter-Strike made
famous, built on three.js 0.187.0 with no build step and no network request.
Single-player against bots, from plain static files.

**The game.** Two teams of five fight over the YARD-7 container terminal at
dusk. VANGUARD attacks, EMBER defends two bombsites, A and B. Short rounds
are won by eliminating the other team, detonating the planted spike, or
defusing it before it blows. Money earned between rounds buys rifles, SMGs,
a sniper and armour; gunfire rewards accuracy over speed — moving and
spraying opens your spread, standing still and tapping keeps it tight.

**How to play.** Serve `game/` and open it in desktop Chrome:

```sh
node serve.ts
# open http://localhost:8080
```

Click to lock the mouse. `WASD` move, `Shift` walk, `Space` jump, `Ctrl`/`C`
crouch, mouse to aim, click to fire, `R` reload, `E` plant / defuse the
spike, `B` buy between rounds, `1`/`2`/`3` switch weapons, right-click to
scope the LONGSHOT.

**Contents.**

- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `/output/dossier.json`.
- `game/` — the playable game: `index.html` plus ES modules under `src/`,
  with three.js 0.187.0 vendored under `game/vendor/three/`.
- `screenshots/` — real renders of the game's own code.
- `serve.ts` — a tiny static server for local play-testing.

**Shots.** Deterministic captures for screenshots:
`?shot=start|play|buy|end&seed=N` stages a frame, renders it twice, freezes
it and sets `window.__shotReady`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=mv53hp7j&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
