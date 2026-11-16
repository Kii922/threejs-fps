# threejs-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Kii922/threejs-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Kii922/threejs-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**Solar Foundry** — a round-based tactical FPS in three.js. Two teams of three fight over an industrial yard at dusk: plant the charge at site A (reactor hall) or site B (storage yard), or eliminate the enemy team. First to 5 rounds takes the match.

- **3v3 with bot teammates and enemies** — waypoint routing, hold angles, line-of-sight engagements with reaction times and burst fire, hearing (gunfire pulls nearby bots), and bots that plant and defuse.
- **Economy + buy menu** — earn money for round wins, kills and plants; buy the P9 Sidearm, VK-9 SMG, AR-77 Rifle, Kevlar armour and HE grenades between rounds (B, or keys 1–5).
- **Gunplay that rewards accuracy** — hitscan raycast weapons with headshot ×2 damage, falloff, recoil, spread bloom while moving, ADS, crouch and jump, all resolved against the map's AABB colliders.
- **A real objective** — hold E to plant (3 s) or defuse (5 s); the charge detonates 35 s after planting. 100 s rounds, round banners, kill feed, damage direction flash.
- **Offline by design** — vendored three.js 0.187.0, no build step, no network requests, WebAudio-synthesised sound only.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. Click to play — W/A/S/D to move, mouse to look, click to fire, R to reload, G to throw a grenade, E (hold) to plant/defuse near a site, B for the buy menu.

---

<sub>Entered on [make.fun](https://make.fun/?ref=53bycfj7&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
