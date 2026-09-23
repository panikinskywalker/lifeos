# LifeOS — handoff to Claude Code

Read in this order: `docs/PRODUCT.md` → `docs/SCOPE.md` → `docs/MILESTONES.md` → `docs/DESIGN.md` → `docs/ARCHITECTURE.md` → `docs/PLUGINS.md`. Keep the core (`src/core`) — it is tested and sound. The UI layer is being rebuilt against `docs/DESIGN.md`; reuse what fits, replace what doesn't.

## Ground rules
1. **Design first.** No new screen without its components existing in `/dev/components`. Every icon is an inline SVG from `src/ui/icons/`. Never an icon font, emoji, gradient or shadow.
2. **Core stays pure.** `src/core` has no React Native imports; every core feature ships with a vitest test. Migrations are append-only.
3. **The agent is the primary input.** For every feature, the first question is "what does the user *say* to make this happen?" and there is an agent tool for it before there is a form.
4. **Money and people confirm; everything else auto-files with Undo.**
5. **Cycles are universal.** Anything recurring is a cycle on an object, never a bespoke field.
6. **Everything indexed.** Records, notes, facts go into the same FTS index; the agent retrieves before it answers.
7. Verify before claiming done: `npm run typecheck`, `npm test`, run on a real Android device via `npx expo run:android`. No web preview sign-off for native screens.
8. Commit per checklist item in `docs/MILESTONES.md`; tick the box in the same commit.

## Setup on the Mac
```
git clone https://github.com/panikinskywalker/lifeos.git && cd lifeos
npm install            # runs patch-package
npm test && npm run typecheck
# Android: install Android Studio + SDK 35, a device with USB debugging, then
npx expo prebuild --platform android
npx expo run:android
```
Put the Claude API key in You › Agent inside the app (SecureStore), never in the repo.

## Opening prompt for Claude Code
Paste this as the first message:

> You are building LifeOS, a personal life OS for Android (Expo SDK 57 / RN 0.86 / TS). Read `docs/HANDOFF.md`, then `docs/PRODUCT.md`, `docs/SCOPE.md`, `docs/MILESTONES.md`, `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`. Then start **M1** in `docs/MILESTONES.md`: first the token file and the inline SVG icon set, then the component library with a `/dev/components` gallery screen, then the five-tab bottom bar, then rebuild the generic list/record/form screens on it. Work one checklist item at a time; after each, run typecheck and tests, commit with the item text as the message, and tick the box. Ask me only when a decision isn't covered by the docs. Do not start M2 until I've reviewed M1 on my phone.

## Per-milestone kickoff prompts
- **M2:** "Start M2. Build `src/core/cycles/` first with tests for every kind (interval, fixed date, meter, whichever-first), then the Routine type, then Upkeep. Splits/groups last."
- **M3:** "Start M3. Begin with the tool contracts and golden tests using the fake provider (sentences in PRODUCT.md §7), then the Talk UI, then facts + retrieval, then share-sheet."
- **M4:** "Start M4. Today bento first, brief job second, habits/health third, lock + backup last."
- **M5:** "Start M5. Config plugin for NotificationListenerService first; parse fixtures for GPay/PhonePe/Paytm/HDFC/Amex in tests before any UI."

## When the Claude Design canvas is shared
Ask Claude Code to: extract exact hex/type/radius values from the canvas export into `docs/DESIGN.md` and `src/ui/theme/tokens.ts`, then diff `/dev/components` against the canvas screen by screen.
