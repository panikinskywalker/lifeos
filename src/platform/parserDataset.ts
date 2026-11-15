import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { LifeOSContext } from '@core/registry/context';
import { buildDataset, queuedMessages, type DatasetMessage } from '@core/filing/dataset';
import { buildSampleFile, noteSample, sampleCount } from '@core/filing/samples';
import { Device } from '../../modules/lifeos-device';
import { isDemo } from './demo';
import { access } from './sources';

const DAY = 86_400_000;

/**
 * You › Data sources › SMS › Export texts for the parser: the last `days` of
 * texts from banks, shops and services (no codes, no friends), each with what
 * every parser read, what the app filed and what you corrected, plus the
 * payment notifications and mail the app kept — as one JSON file via the share sheet.
 */
export async function exportParserDataset(os: LifeOSContext, days = 365): Promise<{ included: number; bytes: number }> {
  if (Platform.OS !== 'android' || !Device) throw new Error('Needs the Android app');
  const since = Date.now() - days * DAY;
  const sms: DatasetMessage[] = (await access('sms')) === 'granted' ? ((await Device.readSms(since, 20000)) as Array<{ from: string; body: string; at: number }>).map((m) => ({ source: 'sms', from: m.from, body: m.body, at: m.at })) : [];
  const ds = buildDataset(os, [...sms, ...queuedMessages(os, since)], { since });
  const bytes = await shareJson('lifeos-parser-dataset', ds, 'Send the parser dataset');
  return { included: ds.messages.length, bytes };
}

async function shareJson(name: string, data: unknown, dialogTitle: string): Promise<number> {
  const text = JSON.stringify(data, null, 1);
  const f = new File(Paths.cache, `${name}-${new Date().toISOString().slice(0, 10)}.json`);
  if (f.exists) f.delete();
  f.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this phone');
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle });
  return text.length;
}

/** You › Data sources › Message samples: the last `days` of texts from the phone's inbox, added as masked samples. */
export async function collectTextSamples(os: LifeOSContext, days = 365): Promise<number> {
  if (isDemo()) throw new Error('The demo reads nothing from the phone');
  if (Platform.OS !== 'android' || !Device) throw new Error('Needs the Android app');
  if ((await access('sms')) !== 'granted') throw new Error('Turn on SMS in Data sources first');
  const before = sampleCount(os);
  const texts = (await Device.readSms(Date.now() - days * DAY, 20000)) as Array<{ from: string; body: string; at: number }>;
  os.db.transaction(() => {
    for (const m of [...texts].sort((a, b) => a.at - b.at)) noteSample(os, { source: 'sms', from: m.from, body: m.body, receivedAt: m.at });
  });
  return sampleCount(os) - before;
}

/** The samples as one JSON file through the share sheet: you choose where it goes. */
export async function exportMessageSamples(os: LifeOSContext): Promise<number> {
  if (Platform.OS !== 'android') throw new Error('Needs the Android app');
  const file = buildSampleFile(os);
  await shareJson('lifeos-message-samples', file, 'Send the message samples');
  return file.samples.length;
}
