import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { selectTools } from './assistant';
import type { AiToolDef } from '../registry/types';

const tool = (name: string) => ({ name, description: name, input: z.object({}), run: async () => ({}) }) as unknown as AiToolDef;
const all = ['resolve_entity', 'search', 'query_entities', 'create_entity', 'aggregate', 'split_transaction', 'create_automation', 'mark_cycle_done', 'remember_fact', 'module_new_tool'].map(tool);
const names = (text: string, history: Parameters<typeof selectTools>[2] = []) => selectTools(text, all, history).map((t) => t.name);

describe('selectTools', () => {
  it('sends only what a message needs, plus the core record tools', () => {
    expect(names('add my Honda City 2019')).toEqual(['resolve_entity', 'search', 'query_entities', 'create_entity', 'module_new_tool']);
    expect(names('how much did I spend on food this month?')).toContain('aggregate');
    expect(names('split dinner with Arjun')).toContain('split_transaction');
    expect(names('washed the car')).toContain('mark_cycle_done');
    expect(names('washed the car')).not.toContain('create_automation');
  });
  it('keeps tools the conversation already used', () => {
    expect(names('and the other one', [{ role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'create_automation', input: {} }] }])).toContain('create_automation');
  });
});
