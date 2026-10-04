import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { LifeOSContext } from '@core/registry/context';
import { buildDataset, queuedMessages, type DatasetMessage } from '@core/filing/dataset';
import { Device } from '../../modules/lifeos-device';
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
  const text = JSON.stringify(ds, null, 1);
  const f = new File(Paths.cache, `lifeos-parser-dataset-${new Date().toISOString().slice(0, 10)}.json`);
  if (f.exists) f.delete();
  f.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this phone');
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: 'Send the parser dataset' });
  return { included: ds.messages.length, bytes: text.length };
}
