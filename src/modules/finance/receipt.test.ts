import { createClaudeBrain } from '@core/ai/brainModel';
import { parseReceipt, receiptQuestion, receiptShares, RECEIPT_SCHEMA } from './bills';

/** Claude's structured answers take only closed objects with every field required. */
function strictProblems(schema: Record<string, unknown>, at = '$'): string[] {
  const out: string[] = [];
  if (schema.type === 'object') {
    const props = Object.keys((schema.properties as Record<string, unknown>) ?? {});
    if (schema.additionalProperties !== false) out.push(`${at}: additionalProperties is not false`);
    const req = (schema.required as string[] | undefined) ?? [];
    for (const p of props) if (!req.includes(p)) out.push(`${at}.${p}: not required`);
    for (const [k, v] of Object.entries((schema.properties as Record<string, Record<string, unknown>>) ?? {})) out.push(...strictProblems(v, `${at}.${k}`));
  }
  if (schema.type === 'array' && schema.items) out.push(...strictProblems(schema.items as Record<string, unknown>, `${at}[]`));
  return out;
}

describe('Split a receipt: the question Claude is asked', () => {
  it('asks for an answer format the API accepts (closed objects, every field required)', () => {
    expect(strictProblems(RECEIPT_SCHEMA as unknown as Record<string, unknown>)).toEqual([]);
    expect(receiptQuestion(['You', 'Ana']).schema).toBe(RECEIPT_SCHEMA);
    expect(receiptQuestion([]).maxTokens).toBeGreaterThanOrEqual(3000);
  });

  it('sends the photo and the format, and reads the answer into lines', async () => {
    let sent: Record<string, unknown> | null = null;
    const answer = { shop: 'Corner Izakaya', currency: 'JPY', total: 3300, items: [{ name: '生ビール', en: 'Draft beer', price: 1200, qty: 2 }, { name: 'Edamame', en: '', price: 900, qty: 1 }, { name: '焼き鳥', en: 'Yakitori', price: 1200, qty: 1 }] };
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 } }) };
    }) as unknown as typeof fetch;
    const brain = createClaudeBrain({ apiKey: 'test', fetchImpl });
    const q = receiptQuestion(['You', 'Ana']);
    const r = await brain.complete({ system: q.system, user: q.prompt, maxTokens: q.maxTokens, schema: q.schema, image: { mediaType: 'image/jpeg', data: 'AAAA' } });
    const body = sent as unknown as { messages: Array<{ content: Array<{ type: string }> }>; output_config: { format: { schema: unknown } } };
    expect(body.messages[0]!.content[0]!.type).toBe('image');
    expect(body.output_config.format.schema).toEqual(RECEIPT_SCHEMA);
    const read = parseReceipt(JSON.parse(r.text))!;
    expect(read.items).toHaveLength(3);
    expect(read.items[1]).toEqual({ name: 'Edamame', en: undefined, price: 900, qty: 1 });
    expect(receiptShares(read.items, [['me', 'ana'], [], ['ana']], ['me', 'ana'])).toEqual({ me: 1050, ana: 2250 });
  });
});
