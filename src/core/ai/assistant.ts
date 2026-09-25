import { z } from 'zod';
import type { LifeOSContext } from '../registry/context';
import type { AiToolDef } from '../registry/types';
import { newId } from '../domain/ids';
import type { ChatMessage, ContentBlock, LLMProvider, ToolSpec } from './provider';
import { extrasOf, type ReplyCard } from './cards';
import { mineFacts } from './factMiner';
import type { Fact } from '../repo/factRepo';

export interface AssistantTurn {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  createdAt: number;
  pending?: boolean;
  /** Reply card for the Talk screen (record / cycle / list / number / chart). */
  card?: ReplyCard;
  /** Undo for what this tool did (auto-run actions). */
  undo?: () => void;
  isError?: boolean;
}

export interface AssistantOptions {
  provider: LLMProvider;
  /** Money & people: shown as an inline confirm card with `summary`; resolve false to refuse. */
  confirm?: (tool: AiToolDef, input: unknown, summary: string) => Promise<boolean>;
  onTurn?: (turn: AssistantTurn) => void;
  maxToolRounds?: number;
  /** Cheap model for fact mining after every user message (Haiku); off when absent. */
  factProvider?: LLMProvider;
  /** Facts saved from the last message (for a quiet "Remembered …" line). */
  onFacts?: (facts: Fact[]) => void;
}

function toolSpec(t: AiToolDef): ToolSpec {
  const schema = z.toJSONSchema(t.input, { target: 'draft-7' }) as Record<string, unknown>;
  delete schema.$schema;
  return { name: t.name, description: t.description, input_schema: schema };
}

/**
 * The assistant is a plain tool-use loop over the registry's AI tools. It
 * never sees the database; every read/write goes through the same repos the
 * UI uses, so validation, timeline, automation and search all apply.
 */
export class Assistant {
  private history: ChatMessage[] = [];
  readonly conversationId: string;
  /** The fact-mining run for the last message; it runs beside the reply, never blocking it. */
  lastMining: Promise<Fact[]> = Promise.resolve([]);

  constructor(private os: LifeOSContext, private opts: AssistantOptions, conversationId?: string) {
    this.conversationId = conversationId ?? newId();
    if (conversationId) this.loadHistory();
  }

  private loadHistory() {
    const rows = this.os.db.all<{ role: string; content: string }>(`SELECT role, content FROM ai_messages WHERE conversation_id=? ORDER BY created_at`, [this.conversationId]);
    this.history = rows.map((r) => ({ role: r.role as 'user' | 'assistant', content: JSON.parse(r.content) as string | ContentBlock[] }));
  }
  private persist(m: ChatMessage) {
    this.os.db.run(`INSERT INTO ai_messages(id,conversation_id,role,content,created_at) VALUES (?,?,?,?,?)`, [newId(), this.conversationId, m.role, JSON.stringify(m.content), Date.now()]);
  }

  systemPrompt(): string {
    const os = this.os;
    const types = [...os.registry.entityTypes.values()].map((t) => `- ${t.type} (${t.module}): ${t.fields.map((f) => f.key + (f.options ? `[${f.options.map((o) => o.value).join('|')}]` : '')).join(', ')}${t.statuses ? ` | statuses: ${t.statuses.map((s) => s.value).join('|')}` : ''}${t.relations?.length ? ` | relations: ${t.relations.map((r) => `${r.kind}→${Array.isArray(r.to) ? r.to.join('/') : r.to}`).join(', ')}` : ''}`).join('\n');
    const counts = os.entities.countsByType();
    const now = new Date();
    return `You are the LifeOS assistant — a personal operating system the user runs on their phone. All data is the user's own, stored locally.
Today is ${now.toISOString()} (${now.toLocaleDateString('en-IN', { weekday: 'long' })}). Default currency ${os.format.defaultCurrency()}. Timestamps in tool inputs/outputs are epoch milliseconds unless labelled ISO.

Record types available (data fields in parentheses):
${types}

Record counts: ${JSON.stringify(counts)}

Guidelines:
- Use tools to look at real data before answering questions about it; never guess figures.
- For "how much / how many" questions prefer the aggregate tool.
- When creating or updating records, use the exact field keys and option values above. Amounts are numbers. Dates in data are ISO strings unless the field is a datetime (epoch ms).
- Link records when it's obviously useful (a transaction to a trip or person, a task to a project).
- Be concise. Answer in plain prose; use short bullet lists only for multiple items. Mention record titles, not ids.
- If something is ambiguous (which account? which project?), ask one short question instead of guessing.`;
  }

  tools(): AiToolDef[] {
    return [...this.os.registry.aiTools.values()];
  }

  async send(userText: string, signal?: AbortSignal): Promise<AssistantTurn[]> {
    const turns: AssistantTurn[] = [];
    const emit = (t: AssistantTurn) => {
      turns.push(t);
      this.opts.onTurn?.(t);
    };
    const userMsg: ChatMessage = { role: 'user', content: userText };
    this.history.push(userMsg);
    this.persist(userMsg);
    emit({ id: newId(), role: 'user', text: userText, createdAt: Date.now() });
    if (this.opts.factProvider) {
      this.lastMining = mineFacts(this.os, this.opts.factProvider, userText, this.conversationId).then((facts) => {
        if (facts.length) this.opts.onFacts?.(facts);
        return facts;
      });
    }

    const tools = this.tools();
    const specs = tools.map(toolSpec);
    const byName = new Map(tools.map((t) => [t.name, t]));
    const maxRounds = this.opts.maxToolRounds ?? 8;

    for (let round = 0; round <= maxRounds; round++) {
      const result = await this.opts.provider.complete({ system: this.systemPrompt(), messages: this.history, tools: specs, signal });
      const assistantMsg: ChatMessage = { role: 'assistant', content: result.content };
      this.history.push(assistantMsg);
      this.persist(assistantMsg);

      const text = result.content.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (text) emit({ id: newId(), role: 'assistant', text, createdAt: Date.now() });

      const calls = result.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
      if (!calls.length || result.stopReason !== 'tool_use') break;

      const results: ContentBlock[] = [];
      for (const call of calls) {
        const def = byName.get(call.name);
        let output: unknown;
        let isError = false;
        if (!def) {
          output = { error: `unknown tool ${call.name}` };
          isError = true;
        } else {
          try {
            const parsed = def.input.parse(call.input);
            const ask = typeof def.confirm === 'function' ? def.confirm(parsed, this.os) : !!def.confirm;
            if (ask && this.opts.confirm && !(await this.opts.confirm(def, parsed, confirmSummary(def, parsed, this.os)))) {
              output = { error: 'User declined this action.' };
              isError = true;
            } else {
              output = await def.run(parsed, this.os);
            }
          } catch (e) {
            output = { error: (e as Error).message };
            isError = true;
          }
        }
        const extras = isError ? {} : extrasOf(output);
        emit({ id: newId(), role: 'tool', text: summarizeTool(call.name, call.input, output), toolName: call.name, toolInput: call.input, toolResult: output, createdAt: Date.now(), card: extras.card, undo: extras.undo, isError });
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(output ?? null).slice(0, 20000), is_error: isError });
      }
      const toolMsg: ChatMessage = { role: 'user', content: results };
      this.history.push(toolMsg);
      this.persist(toolMsg);
    }
    return turns;
  }

  reset() {
    this.history = [];
  }
}

/** The confirm card's line: the tool's own describe(), else its name and the key inputs. */
export function confirmSummary(def: AiToolDef, input: unknown, os: LifeOSContext): string {
  try {
    if (def.describe) return def.describe(input, os);
  } catch {
    /* fall through */
  }
  const i = (input ?? {}) as Record<string, unknown>;
  const title = (i.title as string) ?? (i.id ? os.entities.get(String(i.id))?.title : undefined);
  const type = i.type ? os.registry.entityTypes.get(String(i.type))?.label : undefined;
  return [def.name.replace(/_/g, ' '), type, title].filter(Boolean).join(' · ');
}

function summarizeTool(name: string, input: unknown, output: unknown): string {
  const i = input as Record<string, unknown>;
  switch (name) {
    case 'search':
      return `Searched "${i.query}"`;
    case 'query_entities':
      return `Looked up ${i.type} records`;
    case 'aggregate':
      return `Calculated over ${i.type}`;
    case 'create_entity':
      return `Created ${i.type}: ${(output as { title?: string })?.title ?? ''}`;
    case 'update_entity':
      return `Updated ${(output as { title?: string })?.title ?? 'record'}`;
    case 'link_entities':
      return `Linked records`;
    case 'create_reminder':
      return `Reminder: ${i.title}`;
    case 'create_automation':
      return `Automation: ${i.name}`;
    default:
      return name.replace(/_/g, ' ');
  }
}

export function listConversations(os: LifeOSContext, limit = 20): Array<{ id: string; preview: string; at: number }> {
  return os.db
    .all<{ conversation_id: string; content: string; at: number }>(
      `SELECT conversation_id, MIN(content) AS content, MAX(created_at) AS at FROM ai_messages WHERE role='user' GROUP BY conversation_id ORDER BY at DESC LIMIT ?`,
      [limit],
    )
    .map((r) => {
      let preview = '';
      try {
        const c = JSON.parse(r.content) as string | ContentBlock[];
        preview = typeof c === 'string' ? c : '';
      } catch {
        /* ignore */
      }
      return { id: r.conversation_id, preview: preview.slice(0, 80), at: r.at };
    });
}
