import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { LifeOSContext } from '@core/registry/context';
import { buildSmsDataset } from '@core/ingest/smsDataset';
import { Device } from '../../modules/lifeos-device';
import { access } from './sources';

const DAY = 86_400_000;

/**
 * You › Data sources › SMS › Export texts for the parser: the last `days` of
 * texts from banks, shops and services (no codes, no friends), each with what
 * the parser read and what the app filed, as one JSON file via the share sheet.
 */
export async function exportParserDataset(os: LifeOSContext, days = 365): Promise<{ included: number; bytes: number }> {
  if (Platform.OS !== 'android' || !Device) throw new Error('Needs the Android app');
  if ((await access('sms')) !== 'granted') throw new Error('SMS access is off — turn it on in Data sources first');
  const since = Date.now() - days * DAY;
  const inbox = await Device.readSms(since, 20000);
  const ds = buildSmsDataset(os, inbox as Array<{ from: string; body: string; at: number }>, { since });
  const text = JSON.stringify(ds, null, 1);
  const f = new File(Paths.cache, `lifeos-parser-dataset-${new Date().toISOString().slice(0, 10)}.json`);
  if (f.exists) f.delete();
  f.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this phone');
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: 'Send the parser dataset' });
  return { included: ds.sms.length, bytes: text.length };
}
