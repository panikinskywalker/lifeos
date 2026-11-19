import Anthropic from "@anthropic-ai/sdk";

const AGENT_ID = process.env.AGENT_ID ?? "agent_01VfLS7jqmXhH7nZvzMFyTRm";
const ENVIRONMENT_ID = process.env.ENVIRONMENT_ID ?? "env_019eMP3dG9c79LRNA99FzpD9";

const DEFAULT_PROMPT =
  "I spent ₹2,400 on groceries today and ₹1,200 on dinner split between me and 3 friends. " +
  "Log both, and tell me which card I should use for groceries going forward. will I be able to afford it?";

// Resolves credentials from the environment (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN,
// or an `ant auth login` profile). The SDK adds the managed-agents beta header itself.
const client = new Anthropic();

/** Runs one turn. Returns the process exit code. */
async function main(): Promise<number> {
  const prompt = process.argv.slice(2).join(" ").trim() || DEFAULT_PROMPT;

  const session = await client.beta.sessions.create({
    agent: { type: "agent", id: AGENT_ID },
    environment_id: ENVIRONMENT_ID,
  });
  console.error(`[session ${session.id}]`);

  // Open the stream before sending, so no early events are missed.
  const stream = await client.beta.sessions.events.stream(session.id);
  await client.beta.sessions.events.send(session.id, {
    events: [{ type: "user.message", content: [{ type: "text", text: prompt }] }],
  });

  let sawError = false;

  for await (const event of stream) {
    switch (event.type) {
      case "agent.message":
        for (const block of event.content) {
          if (block.type === "text") process.stdout.write(block.text);
        }
        break;

      case "agent.tool_use":
      case "agent.mcp_tool_use":
        // Nobody is here to approve a paused tool call, so decline it and let the agent carry on.
        if (event.evaluated_permission === "ask") {
          console.error(`\n[denying unattended tool call: ${event.name}]`);
          await client.beta.sessions.events.send(session.id, {
            events: [
              {
                type: "user.tool_confirmation",
                tool_use_id: event.id,
                result: "deny",
                deny_message: "No human is available to approve this call.",
              },
            ],
          });
        }
        break;

      case "agent.custom_tool_use":
        // This client implements no custom tools; report that instead of hanging.
        await client.beta.sessions.events.send(session.id, {
          events: [
            {
              type: "user.custom_tool_result",
              custom_tool_use_id: event.id,
              content: [{ type: "text", text: `Tool "${event.name}" is not available in this client.` }],
              is_error: true,
            },
          ],
        });
        break;

      case "session.error":
        // Some errors are retried by the platform, so keep streaming until idle or terminated.
        sawError = true;
        console.error(`\n[session error: ${event.error.type}: ${event.error.message}]`);
        break;

      case "session.status_idle": {
        const reason = event.stop_reason.type;
        if (reason === "requires_action") break; // waiting on an answer sent above
        process.stdout.write("\n");
        if (reason !== "end_turn") {
          console.error(`[stopped: ${reason}]`);
          return 1;
        }
        return 0;
      }

      case "session.status_terminated":
        process.stdout.write("\n");
        console.error("[session terminated]");
        return 1;
    }
  }

  // Stream closed without a terminal event.
  process.stdout.write("\n");
  console.error("[stream ended before the session went idle]");
  return sawError ? 1 : 2;
}

function describe(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Authentication failed. Set ANTHROPIC_API_KEY (or run `ant auth login`).";
  }
  if (err instanceof Anthropic.NotFoundError) {
    return `Not found: check the agent (${AGENT_ID}) and environment (${ENVIRONMENT_ID}) IDs. ${err.message}`;
  }
  if (err instanceof Anthropic.RateLimitError) return `Rate limited: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return `Connection error: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `API error ${err.status ?? ""}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

process.on("SIGINT", () => {
  console.error("\n[interrupted]");
  process.exit(130);
});

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`\n${describe(err)}`);
    process.exit(1);
  },
);
