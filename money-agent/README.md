# money-agent

A small TypeScript command-line app that sends one message to the agent behind the Money section of LifeOS (it logs expenses and splits, picks a card, and checks whether you can afford something) and prints the reply as it streams in.

## Run

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm start -- "I spent ₹2,400 on groceries today..."
```

If you don't pass a message, it sends a built-in groceries/dinner example. You can set `AGENT_ID` and `ENVIRONMENT_ID` to point at a different agent or environment.

## What it does

1. Calls `client.beta.sessions.create` with the agent and environment IDs.
2. Opens `client.beta.sessions.events.stream` **before** sending, so it doesn't miss early events.
3. Sends the `user.message` with `client.beta.sessions.events.send`.
4. Prints the text of each `agent.message` event as it arrives.
5. Exits with code 0 on `session.status_idle` with `end_turn`. It exits non-zero on any other idle stop reason (`retries_exhausted`, `budget_reached`), on `session.status_terminated`, or if the stream closes early. `session.error` events are logged to stderr.

There is no one around to approve tool calls, so if a tool call pauses for approval the app answers `deny`. If the agent asks for a custom tool, the app replies with an error result instead of hanging. API errors (bad key, wrong IDs, rate limits, network) print a short message and exit with code 1.

Each run starts a new session. Sessions are not deleted afterwards and stay visible in the Console.

## Using it from the LifeOS app

Don't call this code from inside the Expo/web app. An API key bundled into the app ends up in every user's browser. Run the same session logic on a small backend (a serverless function or an API route) that holds `ANTHROPIC_API_KEY`. That backend relays the `agent.message` text to the Money screen over SSE or a WebSocket. `src/index.ts` is written so its `main` loop can be moved into that handler with few changes.
