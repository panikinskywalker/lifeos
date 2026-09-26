import type { LifeOSContext } from '../registry/context';
import type { LLMProvider } from './provider';
import { Assistant, READ_ONLY_TOOLS } from './assistant';
import { classifyFailure } from './limits';

/** Answer questions queued while no model was free (read-only tools, a fresh conversation each). */
export async function answerQueued(os: LifeOSContext, provider: LLMProvider | null | undefined, opts: { smart?: LLMProvider; max?: number } = {}): Promise<number> {
  if (!provider) return 0;
  let answered = 0;
  for (const q of os.questions.due().slice(0, opts.max ?? 5)) {
    try {
      const a = new Assistant(os, { provider, smartProvider: opts.smart, parser: false, metered: true, toolFilter: (t) => READ_ONLY_TOOLS.has(t.name), confirm: async () => true });
      const turns = await a.send(q.text);
      const text = turns.filter((t) => t.role === 'assistant').map((t) => t.text).join('\n\n').trim();
      os.questions.answer(q.id, text || 'Nothing on that yet.');
      answered++;
    } catch (e) {
      const f = classifyFailure(e);
      if (f.kind === 'wait') {
        os.questions.wait(q.id, f.until);
        break; // the others would wait too
      }
      os.questions.fail(q.id);
    }
  }
  return answered;
}
