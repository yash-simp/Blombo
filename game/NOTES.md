# Notes

Agent notes go here. This file is the creator's: it is archived with the workspace, comes back on
every restart, and is never replaced by the platform (unlike `AGENTS.md`, which is). Use it for
what the next session needs to know — what was tried, what the creator asked for, what is left.

## Lantern Lake — what the creator asked for

A cosy, high-quality fishing game (full brief in PLAN.md). Hard rules: never publish (the creator
publishes after testing); never move/control the creator's avatar or open a second tab on their
account; never print their token; do not touch their other games; 13+ all-ages, original IP only;
no paid random items; rewarded videos only when useful (never on a timer or at join, ~20/day).

## How the game is built

- Visuals are Blender-made Draco GLB packs in `public/models/` (props, items, chars, fish,
  zone_<key>.glb + .json). The Blender scripts live outside the workspace, in the creator's git repo
  (`pipeline/blender/*.py`; `pipeline/gen.mjs` regenerates `server/world.gen.ts` and
  `src/world/colliders.gen.ts` from the zone JSON). buildWorld only places invisible colliders.
- `server/rules.ts` is the one place for numbers (fish, rarities, gear, zones, quests, tournament).
  The client imports it too. `server/world.ts` reads the water mask for cast checks.
- Client: `src/world/zones.ts` draws zones (instanced props, water shader, halos, fireflies, NPCs),
  `src/fishing/controller.ts` runs cast/bite/fight/showcase, `src/App.vue` is the HUD (goal pill,
  one message line, corners, ActionDock, cards, Celebrate banners/confetti/coins).
- Paid: `server/paid.ts` + `src/paid.ts` are examples/blogem-purchase copied as-is (M4 wires the
  client half and the shop tab).

## Testing

- `yarn test`: tests/firstminute.test.ts plays join → rod → first catch → gift → sell on the real
  script runtime, plus cast rules, shop/zone gates, saves and a 24-player tick budget (p95 < 1 ms).
  tests/rules.test.ts checks fish pools, odds, prices, levels, sky, tournaments, quests, and that
  every shown name has text in locales/en.json.
- Sight cannot show the HUD, so the repo also has `harness/`: the real client + real server/ code in
  a local headless Chromium with a mocked engine. `node harness/shots.mjs` plays the first minute and
  opens every card in desktop, phone-portrait and phone-landscape shapes.

## Status

- M1 (core loop in Lantern Lake + first minute): done and played end to end in tests + harness.
  Other waters are not built yet (travel to them does nothing until M2 adds their zone files).
- Next: M2 — Willow River, Coral Bay, Frost Lake, Ember Lagoon, Moon Pond (+ anchors: arrive,
  captain, market, tackle per zone), fish icon atlas for Index/bag, weather visuals.
