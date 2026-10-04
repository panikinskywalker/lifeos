import type { DatabaseAdapter } from '../db/adapter';
import type { Registry } from './registry';
import type { RecordRepo } from '../repo/entityRepo';
import type { AttachmentRepo, CommentRepo, CustomFieldRepo, ModuleRepo, LinkRepo, ReminderRepo, SettingsRepo, TagRepo, ViewRepo } from '../repo/sideRepos';
import type { AutomationEngine } from '../automation/engine';
import type { CycleRepo } from '../cycles/cycleRepo';
import type { GroupRepo } from '../repo/groupRepo';
import type { AliasRepo } from '../repo/aliasRepo';
import type { FactRepo } from '../repo/factRepo';
import type { DumpRepo } from '../repo/dumpRepo';
import type { QuestionRepo } from '../repo/questionRepo';
import type { Scheduler } from '../automation/scheduler';

/**
 * The "os" object handed to every module, widget, action and AI tool.
 * It is the whole surface area a plugin gets — nothing imports core internals.
 */
export interface LifeOSContext {
  db: DatabaseAdapter;
  registry: Registry;
  records: RecordRepo;
  links: LinkRepo;
  tags: TagRepo;
  attachments: AttachmentRepo;
  cycles: CycleRepo;
  groups: GroupRepo;
  aliases: AliasRepo;
  facts: FactRepo;
  dumps: DumpRepo;
  questions: QuestionRepo;
  comments: CommentRepo;
  reminders: ReminderRepo;
  customFields: CustomFieldRepo;
  views: ViewRepo;
  settings: SettingsRepo;
  modules: ModuleRepo;
  automation: AutomationEngine;
  scheduler: Scheduler;
  format: Formatters;
  /** Navigation is injected by the app shell; core stays UI-agnostic. */
  navigate: (path: string) => void;
  /** Notification bridge injected by the app shell (no-op in tests). */
  notify: (n: { title: string; body?: string; at?: number; data?: Record<string, unknown> }) => Promise<string | null>;
  cancelNotification: (id: string) => Promise<void>;
}

export interface Formatters {
  currency: (amount: number, currency?: string) => string;
  number: (n: number, digits?: number) => string;
  date: (ts: number | string | Date, style?: 'short' | 'medium' | 'long' | 'relative') => string;
  time: (ts: number | string | Date) => string;
  dateTime: (ts: number | string | Date) => string;
  defaultCurrency: () => string;
}
