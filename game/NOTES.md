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

## Performance budget (creator's request)

At most ~300k triangles and ~120 draw calls from the spawn camera on phones. Measured with
`node harness/bench.mjs` (phone portrait 390x844 and landscape 844x390, DPR 2, spawn camera):

| | draw calls | triangles | software frame |
|---|---|---|---|
| before (portrait / landscape) | 84 / 105 | 401k / 409k | 528 / 593 ms |
| high (portrait / landscape) | 67 / 89 | 220k / 265k | 444 / 469 ms |
| low (portrait / landscape) | 59 / 79 | 187k / 217k | 285 / 284 ms |

The harness renders in software (SwiftShader), so its frame times only compare runs with each other;
it has no shadow pass. Engine sight overview of the whole island (shadows included): 1.1M tris / ~220
draws before, 430k / 137 after.

How: props are baked per chunk and material (`src/world/zones.ts`, `merge.ts`): clutter on a 32 m grid
drawn only near the player, detail/far on a 48 m grid (far = Blender-decimated `__lod` copies, no
medium props, no lamp glow; halos stand in). Medium props always use their LOD. Terrain is 3x3 chunks
with a half-resolution `__lod` and skirts. Only large land props cast sun shadows. `src/world/quality.ts`:
auto mode starts high and switches to low (shorter distances, no prop shadows, render scale 0.75,
no fireflies) after two 4-second windows under 42 fps, and remembers it per device; Profile card has
Graphics Auto / High / Low.

## Screen shape

Landscape only (the creator's decision): buildWorld does not call game.enablePortrait(), so phones held
upright are asked to rotate. The harness checks desktop and phone landscape.

## Status

- M1 core loop + first minute: done (tests + harness, all three screen shapes).
- Performance budget: done (see above).
- All six waters are built (pipeline/blender/zone_<key>.py; shared harbour/town/ice/lava helpers in
  zonelib.py). Travel between them works (test: sailing to Willow River and selling there).
- Blogem shop tab (src/paidClient.ts + example src/paid.ts), rewarded videos only where useful: Lucky
  Bait (bait tab), Double Sale (bag at a market, bag worth 50+), Re-hook (10 s after a Rare+ escape).
- Home aquariums with the owner's fish and name board, champion crown (src/world/homes.ts).
- Fish icon atlas (pipeline/blender/fish_icons.py -> public/models/fish_icons.webp; src/ui/FishIcon.vue) in
  the Index, bag/aquarium, catch card and tournament board. Weather visuals (src/world/weather.ts: rain,
  storm + lightning, snow on Frost Lake, night aurora). Tournament stage show (src/world/stage.ts
  scoreboard + src/world/fireworks.ts).
- Later (creator: "build later"): richer decoration for the five new islands, a review pass.
