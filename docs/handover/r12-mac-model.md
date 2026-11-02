# R12 Mac model first: hand-over (code side)

Branch `claude/r12-mac-model`, from `m1-design-system` at 0c3a9b3 (LifeOS v0.0.17).
No version bump, no CHANGELOG edit, **no migration**. `npm run typecheck`, `npm test`
(508 tests, 61 files) and `npx expo export --platform web` are green. The run on the
Mac is yours (steps below); R12 stays open in layer 6 until it is green.

## What was built

- **Decisions first**, in `docs/MODEL.md` layer 7, *The provider chain (agreed 2 Nov, R12)*.
- **The Mac provider** (`src/core/ai/ollama.ts`): Ollama's own `POST /api/chat`, not its
  `/v1` copy, because only there can the context be set: `num_ctx` 16k, `think: false`,
  `keep_alive` 30 minutes, `stream: false`. Tool calls and results in Ollama's format
  (results carry `tool_name`); a call written as text (`<tool_call>{…}</tool_call>`) and
  `<think>` blocks are handled. An Ollama that refuses the `think` switch is asked again
  without it. Usage comes from `prompt_eval_count` / `eval_count`.
- **How a failure is judged** (each throws a retryable `ProviderError`, so the chain moves
  that call to the cloud): no answer to a 3 s `/api/version` check (then the Mac is skipped
  for 2 minutes, so nothing waits on a sleeping Mac; the check runs only when the Mac has
  not answered for a minute), no answer within 2 minutes, an Ollama error (404 not pulled,
  500 out of memory, 400 passed on as 500), or an unusable reply: empty, a tool that was
  not offered, arguments that are not an object.
- **First in the chain**: `buildAgentProviders` puts local providers (`isLocalProvider`,
  only `ollama`) before the cloud, whatever their place in settings. The Ollama preset now
  has no address by default (so it is skipped until you set one) and uses `qwen3:8b` for
  both roles (one pull).
- **Budget cloud only**: `meterProvider` never caps the Mac (its tokens are still written to
  `ai_usage`, shown as free); the "low on free budget" rule in `src/platform/filing.ts` looks
  at the first cloud provider.
- **You › Agent**: a *Your Mac* section above a *Cloud* section ("when the Mac can't, in
  order"; up / down reorders the cloud only): Use the Mac, Address (IP or Tailscale name,
  port 11434 assumed; old `…/v1` addresses still work), Model, **Test the Mac** (reaches it,
  checks the model is pulled, makes one tool call and times it; each step on its own line,
  the last saying what to fix), tokens this month, free.
- **Golden sentences** (`scripts/golden-sentences.ts`): seven dumps (Kendal's birthday,
  details on her page, the flight and dinner day, the Dyson on the HDFC card, the rant with
  one task, Karan at Zomato, the Creta's service) and one question ("where does Karan
  work?"), each judged by what was filed, loosely enough for a real model's wording. A lazy
  model fails every one (checked); the ideal calls pass every one.
- **Tests**: `src/modules/mac.golden.test.ts` (13) runs every golden sentence and the
  question through a fake Ollama on the stubbed `fetch`, end to end through the real
  provider, chain and filing, and checks the request (`num_ctx`, `think`, tools, tool
  names), that the cloud is never asked, that a bad reply or a down Mac goes to the cloud
  (and a down Mac is not even pinged on the next dump), that the Mac goes first, and that a
  cap stops the cloud but never the Mac. `src/core/ai/ollama.test.ts` (9): addresses,
  parsing, the think retry, failures, the ping, Test the Mac.
- **`scripts/golden-mac.ts`**: the golden sentences against a real Ollama, the Mac alone
  with no cloud behind it; runs Test the Mac first; exits 1 when any fails.

## Decisions taken where the model did not say (check them)

1. **`qwen3:8b`** as the model, the same for every job (filing, questions, fact mining):
   the strongest tool caller in 7 to 9B on Ollama, one 5 GB pull. Change it in You › Agent.
2. **No retry on the Mac**: a bad reply goes straight to the cloud. A second try would save
   cloud tokens but double the wait.
3. **A reply in words is not a failure** (filing already nudges once and accepts "done").
4. **Harder asks** (the Claude switch for plans) unchanged: an explicit choice to pay.
5. **The golden car sentence is reworded** ("Took the Creta in for its service at Hyundai
   today, paid 6,400"): PRODUCT §5's "Did the car service…" is filed by the phone parser and
   never reaches a model, so it could not test one.
6. **Tool names unchanged.** Layer 6 R0 carried renaming the AI tools (`create_entity`,
   `connections`…) to R12. Filing uses the graph tools (`upsert_node`, `log_done`…), which
   already speak the vocabulary; the Talk tools' rename touches every module's tools and the
   recorded golden fixtures, so it is left for its own change. Say if you want it here.

## Steps for you (on the Mac, then the phone)

1. Install Ollama: <https://ollama.com/download> (or `brew install ollama`), open it once.
2. Pull the model:
   ```bash
   ollama pull qwen3:8b
   ```
3. Let the phone reach it: Ollama listens on localhost only by default. Set it to listen on
   every interface, then quit and reopen the Ollama app:
   ```bash
   launchctl setenv OLLAMA_HOST 0.0.0.0
   ```
   (If you run `ollama serve` yourself instead: `OLLAMA_HOST=0.0.0.0 ollama serve`.)
4. Tailscale on the Mac and the S22, same account; note the Mac's address (`100.x.y.z`) or
   name from the Tailscale app, or:
   ```bash
   tailscale ip -4
   ```
   Keep the Mac awake while you want it used (System Settings › Battery › Options: prevent
   sleeping when the display is off, on power).
5. Run the golden sentences on the Mac, in a clone of this branch:
   ```bash
   npm install
   ```
   ```bash
   npx tsx scripts/golden-mac.ts localhost qwen3:8b
   ```
   All 8 green means the model can go first. A red line names what was filed wrong; try
   another model with the same script (`npx tsx scripts/golden-mac.ts localhost llama3.1:8b`).
6. On the S22: You › Agent › Your Mac: switch on, type the Tailscale address, **Test the
   Mac**. Three lines ending "The Mac is ready." Then dump a sentence and check To check.
7. Tick *The run on the Mac* in layer 6 R12 (and R12 itself) when 5 and 6 are green.

## Shared core edits (small, listed for the merge)

- `src/core/ai/provider.ts`: `isLocalProvider` (one line).
- `src/core/ai/providers.ts`: Ollama preset (no default address, `qwen3:8b` for both roles,
  label *Your Mac*), `createProvider` builds the Mac provider, the chain puts local first.
- `src/core/ai/routing.ts`: `meterProvider` skips the cap for local providers.
- `src/core/ai/index.ts`: exports `./ollama`.
- `src/platform/filing.ts`: the free-budget rule reads the first cloud provider.
- `app/settings/ai.tsx`: Your Mac and Cloud sections; the address field left on Custom only.
- `docs/MODEL.md`: layer 7 *The provider chain*; layer 6 R12 code side ticked. The layer 3
  module list is untouched.

## Patch notes (for the version this merges as)

- **Your Mac first.** Talk and filing now try a model on your Mac (Ollama over Tailscale)
  before any cloud provider; the cloud is used only when the Mac is off or gets it wrong.
- **You › Agent › Your Mac**: the Mac's address and model, and a Test the Mac button that
  says what to fix.
- **Budgets are cloud only**: the Mac is free, never capped, shown as free in usage.
- Your Mac's old `…/v1` address keeps working.
