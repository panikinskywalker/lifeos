import type { DatabaseAdapter } from '../db/adapter';
import type { Registry } from './registry';
import type { RecordRepo } from '../repo/recordRepo';
import type { AttachmentRepo, CustomFieldRepo, ModuleRepo, LinkRepo, ReminderRepo, SettingsRepo, TagRepo, ViewRepo } from '../repo/sideRepos';
import type { AutomationEngine } from '../automation/engine';
import type { CycleRepo } from '../cycles/cycleRepo';
import type { GroupRepo } from '../repo/groupRepo';
import type { AliasRepo } from '../repo/aliasRepo';
import type { FactRepo } from '../repo/factRepo';
import type { DumpRepo } from '../repo/dumpRepo';
import type { FilingRepo } from '../repo/filingRepo';
import type { QuestionRepo } from '../repo/questionRepo';
import type { OutboxRepo } from '../repo/outboxRepo';
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
  /** What filing wrote, with provenance; the To check list. */
  filings: FilingRepo;
  questions: QuestionRepo;
  /** Changes waiting to be sent to a source that also writes (Turf web); shown as *sending*. */
  outbox: OutboxRepo;
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
  /**
   * The phone, as modules may use it (docs/MODEL.md §4, the Source contract):
   * platform fills this at boot; absent on the web and in tests. A module's
   * SourceDef.sync reads through it and never imports platform code.
   */
  device?: DeviceBridge;
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

export type Access = 'granted' | 'needed' | 'unavailable';

export interface DeviceBridge {
  sms?: {
    access(): Promise<Access>;
    /** Texts received since `since`, newest first. */
    read(since: number, limit: number): Promise<Array<{ from: string; body: string; at: number }>>;
    /** Texts the receiver queued while the app was closed. */
    drain(): Array<{ from: string; body: string; at: number }>;
  };
  notifications?: {
    access(): boolean;
    setAllowlist(packages: string[]): void;
    drain(): Array<{ package: string; title: string; text: string; at: number }>;
  };
  mail?: {
    /** Runs the mailbox sync (IMAP, cursors, passwords live in platform); files through core; returns how many it filed. */
    sync(): Promise<number>;
  };
  /** The phone's secure store (keys a source needs, e.g. Turf web's): never in settings, never in a backup. */
  secrets?: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string | null): Promise<void>;
  };
}
