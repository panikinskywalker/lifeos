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
import type { BrainStore } from '../brain/store';

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
  /** The brain (docs/MODEL.md layer 8): nudges, what it learned, Skills, the Sent to Claude log. */
  brain: BrainStore;
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

/** One phone contact, as the device bridge hands it over. */
export interface DeviceContact {
  id: string;
  name: string;
  phones: string[];
  emails: string[];
  birthday?: { day: number; month: number; year?: number } | null;
  company?: string | null;
  jobTitle?: string | null;
  /** The contact's photo (a content:// or file:// uri). */
  photo?: string | null;
}

/** One call from the call log. */
export interface CallEntry {
  number: string;
  name?: string | null;
  at: number;
  seconds: number;
  type: 'incoming' | 'outgoing' | 'missed' | 'other';
}

/** One event from the phone's calendar, as the device bridge hands it over (R4: projects' calendar source). */
export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end?: number | null;
  allDay?: boolean;
  location?: string | null;
  notes?: string | null;
  attendees?: Array<{ name?: string | null; email?: string | null }>;
  /** Which calendar(s) it's on ("Work · you@company.com"). */
  calendars?: string[];
}

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
  /** The phone's contacts (R2: crm's contacts source and the picker). Only the contacts you pick become People. */
  contacts?: {
    access(): Promise<Access>;
    /** Every contact with a name, sorted by name (asks for access when it has none). */
    read(): Promise<DeviceContact[]>;
  };
  /** The call log (R2: crm's call log source moves "last spoke"). */
  callLog?: {
    access(): Promise<Access>;
    /** Calls since `since`, newest first. */
    read(since: number, limit: number): Promise<CallEntry[]>;
  };
  /** The phone's calendars (R4: projects' calendar source files Events from them). */
  calendar?: {
    access(): Promise<Access>;
    /** Every event on a visible calendar between `from` and `to`, with its attendees. */
    read(from: number, to: number): Promise<CalendarEvent[]>;
  };
  /**
   * The text of a PDF shared into LifeOS (Home: a Blinkit invoice), or null
   * when it has none (a scan). Not filled yet: the app has no PDF reader
   * (docs/MODEL.md R7e), so shared invoices wait for it.
   */
  pdfText?: (uri: string) => Promise<string | null>;
  /** The phone's secure store (keys a source needs, e.g. Turf web's): never in settings, never in a backup. */
  secrets?: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string | null): Promise<void>;
  };
}
