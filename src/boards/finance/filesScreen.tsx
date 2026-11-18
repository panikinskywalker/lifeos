import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { Button, ChipRow, FilterChip, Screen, Section, Text, useToast } from '@ui/kit';
import { monthRange } from '@modules/finance/lib';
import { guessMapping, importStatement, parseCsv, paymentsCsv, readStatement, undoImport, type CsvMapping } from '@modules/finance/csv';

const PERIODS = [
  { key: 'month', label: 'This month' },
  { key: 'last', label: 'Last month' },
  { key: '3m', label: '3 months' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All' },
] as const;

function range(key: (typeof PERIODS)[number]['key']): { start: string; end: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (key === 'month') return { start: monthRange(0).start, end: today };
  if (key === 'last') return monthRange(-1);
  if (key === '3m') return { start: monthRange(-2).start, end: today };
  if (key === 'year') return { start: `${new Date().getFullYear()}-01-01`, end: today };
  return { start: '1970-01-01', end: today };
}

/** Money › Import & export (docs/MODEL.md, Import and export): payments out as CSV; a bank's CSV statement in, columns matched, previewed, with Undo. */
export function FilesScreen({ ctx }: { ctx: LifeOSContext }) {
  const router = useRouter();
  const toast = useToast();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('month');
  const [rows, setRows] = useState<string[][] | null>(null);
  const [name, setName] = useState('');
  const [map, setMap] = useState<CsvMapping | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const accounts = useLive((o) => o.records.query('account', {}, { limit: 200 }).map((a) => ({ id: a.id, title: a.title })), []);
  const header = rows && map ? rows[map.header] ?? [] : [];
  const preview = useMemo(() => (rows && map ? readStatement(rows, map) : null), [rows, map]);

  const exportCsv = async () => {
    try {
      const r = range(period);
      const { csv, count } = paymentsCsv(ctx, r.start, r.end);
      const f = new File(Paths.cache, `lifeos-payments-${r.start}-to-${r.end}.csv`);
      if (f.exists) f.delete();
      f.write(csv);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available here');
      await Sharing.shareAsync(f.uri, { mimeType: 'text/csv', dialogTitle: `${count} payments` });
    } catch (e) {
      toast.show({ message: `Couldn’t export: ${(e as Error).message.slice(0, 80)}`, icon: 'alert' });
    }
  };

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    try {
      const parsed = parseCsv(await new File(r.assets[0].uri).text());
      const m = guessMapping(parsed);
      setRows(parsed);
      setName(r.assets[0].name);
      setMap(m ?? { header: 0, date: 0, description: 1, amount: 2 });
      if (!m) toast.show({ message: 'Couldn’t tell the columns: pick them below', icon: 'info' });
    } catch {
      toast.show({ message: 'Couldn’t read that file', icon: 'alert' });
    }
  };

  const run = () => {
    if (!preview || !accountId) return;
    const r = importStatement(ctx, accountId, preview.rows);
    toast.show({ message: `Imported ${r.created.length} payments${r.already ? ` · ${r.already} were already here` : ''}`, icon: 'check', undo: () => undoImport(ctx, r.created) });
    setRows(null);
    setMap(null);
  };

  const pickCol = (label: string, value: number | undefined, set: (i: number) => void) => (
    <View style={{ gap: 6 }}>
      <Text variant="caption" color="secondary">{label}</Text>
      <ChipRow>
        {header.map((h, i) => (
          <FilterChip key={`${label}-${i}`} label={h || `Column ${i + 1}`} selected={value === i} onPress={() => set(i)} />
        ))}
      </ChipRow>
    </View>
  );

  return (
    <Screen title="Import & export" subtitle="Money" onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/finance' as never))}>
      <Section title="Export payments">
        <ChipRow>
          {PERIODS.map((p) => (
            <FilterChip key={p.key} label={p.label} selected={period === p.key} onPress={() => setPeriod(p.key)} />
          ))}
        </ChipRow>
        <Button title="Export as CSV" icon="share" onPress={() => void exportCsv()} />
        <Text variant="caption" color="secondary">Date, payee, category, kind, amount (money out is negative), account and note, for a spreadsheet.</Text>
      </Section>

      <Section title="Import a bank statement">
        <Text variant="caption" color="secondary">A CSV from your bank’s website. Payments already here are skipped, and Undo takes the whole import back.</Text>
        <Button title={rows ? `Pick another file` : 'Pick a CSV file'} icon="file" variant={rows ? 'secondary' : 'primary'} onPress={() => void pick()} />
        {rows && map ? (
          <View style={{ gap: 14 }}>
            <Text variant="rowTitle" numberOfLines={1}>{name}</Text>
            {pickCol('Date', map.date, (i) => setMap({ ...map, date: i }))}
            {pickCol('Description', map.description, (i) => setMap({ ...map, description: i }))}
            <ChipRow>
              <FilterChip label="One amount column" selected={map.amount != null} onPress={() => setMap({ header: map.header, date: map.date, description: map.description, amount: map.amount ?? 2 })} />
              <FilterChip label="Money out and in apart" selected={map.amount == null} onPress={() => setMap({ header: map.header, date: map.date, description: map.description, out: map.out ?? 2, in: map.in ?? 3 })} />
            </ChipRow>
            {map.amount != null ? pickCol('Amount (money out negative)', map.amount, (i) => setMap({ ...map, amount: i })) : (
              <>
                {pickCol('Money out', map.out, (i) => setMap({ ...map, out: i }))}
                {pickCol('Money in', map.in, (i) => setMap({ ...map, in: i }))}
              </>
            )}
            <View style={{ gap: 6 }}>
              <Text variant="caption" color="secondary">Into which account</Text>
              <ChipRow>
                {accounts.map((a) => (
                  <FilterChip key={a.id} label={a.title} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
                ))}
              </ChipRow>
            </View>
            {preview ? (
              <Text variant="body">
                {preview.rows.length} payments · {preview.rows.filter((r) => r.kind === 'expense').length} out, {preview.rows.filter((r) => r.kind === 'income').length} in{preview.skipped ? ` · ${preview.skipped} rows could not be read` : ''}
              </Text>
            ) : null}
            {preview?.rows.slice(0, 4).map((r, i) => (
              <Text key={i} variant="caption" color="secondary" numberOfLines={1}>
                {r.date} · {r.description} · {r.kind === 'expense' ? '−' : '+'}
                {ctx.format.currency(r.amount)}
              </Text>
            ))}
            <Button title={accountId ? `Import ${preview?.rows.length ?? 0} payments` : 'Pick an account first'} icon="check" disabled={!accountId || !preview?.rows.length} onPress={run} />
          </View>
        ) : null}
      </Section>
    </Screen>
  );
}
