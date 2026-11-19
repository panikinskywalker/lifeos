import { describe, expect, it } from 'vitest';
import { createClaudeBrain } from './brainModel';

/** Web research over the Messages API: the web tools are sent, a paused search is continued, and the pages come back. */
describe('Claude web research', () => {
  it('sends web search and fetch, continues a paused turn, and returns the final text with its pages', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const replies = [
      { stop_reason: 'pause_turn', content: [{ type: 'text', text: 'Searching.' }, { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://example.org/a', title: 'Page A' }] }], usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 1 } } },
      { stop_reason: 'end_turn', content: [{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://example.org/b', title: 'Page B' }] }, { type: 'text', text: '- Closed 29 Dec to 3 Jan.', citations: [{ type: 'web_search_result_location', url: 'https://example.org/b', title: 'Page B' }] }], usage: { input_tokens: 200, output_tokens: 20, server_tool_use: { web_search_requests: 1 } } },
    ];
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      const r = replies.shift()!;
      return { ok: true, status: 200, json: async () => r, text: async () => JSON.stringify(r) };
    }) as unknown as typeof fetch;
    const brain = createClaudeBrain({ apiKey: 'test', fetchImpl });
    const r = await brain.research!({ system: 'research', user: 'Is it open?', maxTokens: 1000 });
    expect((bodies[0]!.tools as Array<{ type: string }>).map((t) => t.type)).toEqual(['web_search_20260209', 'web_fetch_20260209']);
    expect(bodies[0]!.output_config).toEqual({ effort: 'medium' });
    expect((bodies[1]!.messages as unknown[]).length).toBe(2);
    expect(r.text).toBe('- Closed 29 Dec to 3 Jan.');
    expect(r.sources).toEqual([{ url: 'https://example.org/b', title: 'Page B' }, { url: 'https://example.org/a', title: 'Page A' }]);
    expect(r.searches).toBe(2);
    expect(r.usage).toMatchObject({ input: 300, output: 30 });
  });
});
