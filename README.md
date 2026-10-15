# Lantern Lake (Blombo)

A cosy fishing game for the Blombo workspace "UDM5XLO". The workspace holds the playable game; this
repository keeps its source and everything that makes it.

- `game/`: a mirror of the workspace's own files (`src/`, `server/`, `locales/`, `tests/`,
  `remotes.json`, `commerce.json`, `NOTES.md`). Platform-owned files (engine, tools) are not copied.
- `pipeline/blender/`: Blender Python that models every prop, fish, character, rod, boat and zone,
  bakes ambient occlusion into vertex colours and exports GLB. `compress.mjs` Draco-compresses the
  packs into `pipeline/out/up/` (what the workspace serves from `public/models/`); `gen.mjs` turns
  a zone's JSON into `server/world.gen.ts` and `src/world/colliders.gen.ts`; `sync.mjs` bundles
  changed game files for upload to the workspace.
- `harness/`: the real client and server code in a local headless browser with a mocked engine, for
  HUD screenshots in desktop, phone-portrait and phone-landscape shapes (`node shots.mjs` while
  `npx vite` runs).
