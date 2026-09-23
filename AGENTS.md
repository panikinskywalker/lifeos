# LifeOS — notes for coding agents

- Expo SDK 57 / React Native 0.86 / TypeScript 6. Check versions in `node_modules/expo/bundledNativeModules.json` before adding Expo packages (`npx expo install` may not have network access).
- `src/core` must stay free of React Native imports; it is unit-tested with vitest + better-sqlite3 (`npm test`).
- Never edit a shipped migration in `src/core/db/migrations.ts`; append a new version.
- Modules are plain `ModuleManifest` objects under `src/modules/<name>`; register in `src/modules/index.ts`. See `docs/PLUGINS.md`.
- Routes live in `app/`; `src/platform` is app-shell glue (do not name a folder `src/app` — expo-router would treat it as routes).
- Verify with `npm run typecheck`, `npm test`, and `npx expo export --platform web`.
- Product, scope, milestones and design system live in `docs/PRODUCT.md`, `docs/SCOPE.md`, `docs/MILESTONES.md`, `docs/DESIGN.md`; start from `docs/HANDOFF.md`. UI: inline SVG icons only (no icon fonts), tokens from `docs/DESIGN.md`.
