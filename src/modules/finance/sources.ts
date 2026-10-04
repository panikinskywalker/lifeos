import type { SourceDef } from '@core/registry/types';
import { PAYMENT_APPS } from './filing/bankSms';

/**
 * The sources that feed finance (docs/MODEL.md §4; R1). Each reads the phone
 * through the device bridge core exposes (os.device) — never platform code —
 * and hands messages to core, which files them through every module's parsers.
 * SMS and Gmail feed deliveries and travel too; declared once, here.
 */

export const smsSource: SourceDef = {
  id: 'sms',
  label: 'Bank SMS',
  modules: ['finance', 'deliveries'],
  permission: 'SMS',
  kind: 'messages',
  messageSource: 'sms',
  history: true,
  available: async (os) => (await os.device?.sms?.access()) === 'granted',
  sync: async (os, since, { mode }) => {
    const sms = os.device?.sms;
    if (!sms) return { messages: [] };
    // Anything that arrived while the app was closed: the receiver's queue, then the inbox since the last sync.
    const queued = mode === 'live' ? sms.drain() : [];
    const inbox = await sms.read(since ?? Date.now() - 86_400_000, mode === 'import' ? 5000 : 500);
    return { messages: [...queued, ...inbox].map((m) => ({ from: m.from, text: m.body, at: m.at })), cursor: String(Date.now()) };
  },
};

export const notificationsSource: SourceDef = {
  id: 'notifications',
  label: 'Payment notifications',
  modules: ['finance'],
  permission: 'Notification access',
  kind: 'messages',
  messageSource: 'notification',
  available: async (os) => !!os.device?.notifications?.access(),
  sync: async (os) => {
    const n = os.device?.notifications;
    if (!n) return { messages: [] };
    n.setAllowlist(Object.keys(PAYMENT_APPS));
    return { messages: n.drain().map((m) => ({ from: m.package, title: m.title, text: m.text, at: m.at })) };
  },
};

export const gmailSource: SourceDef = {
  id: 'gmail',
  label: 'Gmail',
  modules: ['finance', 'deliveries', 'travel'],
  permission: 'App password',
  kind: 'messages',
  messageSource: 'email',
  available: async (os) => !!os.device?.mail,
  // IMAP, cursors and passwords live in platform; it files through core and reports the count.
  sync: async (os) => ({ filed: (await os.device?.mail?.sync()) ?? 0 }),
};

export const financeSources: SourceDef[] = [smsSource, notificationsSource, gmailSource];
