import React, { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { Dump } from '@core/repo/dumpRepo';
import { useLive } from '@ui/hooks';
import { Button, EmptyState, RowItem, RowList, Screen, Section, TextField } from '@ui/kit';

const firstLine = (s: string) => s.trim().split('\n')[0]!;

/** Almanac › Mind › Dumps: every dump, word for word, by month — searchable. */
export default function DumpsScreen() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);
  const query = q.trim();
  const total = useLive((o) => o.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM dumps`)?.n ?? 0, []);
  const list = useLive(
    (o): Dump[] =>
      query
        ? o.entities.search
            .search(query, { types: ['dump'], limit: 100 })
            .map((h) => o.dumps.get(h.id))
            .filter((d): d is Dump => !!d)
        : o.dumps.list({ limit }),
    [query, limit],
  );
  const months = useMemo(() => {
    const by = new Map<string, Dump[]>();
    for (const d of list) {
      const k = format(new Date(d.createdAt), 'MMMM yyyy');
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(d);
    }
    return [...by.entries()];
  }, [list]);
  return (
    <Screen title="Dumps" subtitle={`${total} so far`} onBack={() => (router.canGoBack() ? router.back() : router.replace('/almanac/mind' as never))}>
      <TextField value={q} onChange={setQ} leading="search" placeholder="Search what you dumped…" autoCorrect={false} returnKeyType="search" />
      {!list.length ? <EmptyState icon="brain" tint="memory" line={query ? `No dump mentions “${query}”.` : 'Nothing dumped yet. The centre button takes anything you say.'} /> : null}
      {months.map(([month, ds]) => (
        <Section key={month} title={month} meta={String(ds.length)}>
          <RowList>
            {ds.map((d) => (
              <RowItem key={d.id} icon={d.source === 'voice' ? 'mic' : 'brain'} tint="memory" title={firstLine(d.body)} subtitle={format(new Date(d.createdAt), 'EEE d MMM, h:mm a')} chevron onPress={() => router.push(`/dump/${d.id}` as never)} />
            ))}
          </RowList>
        </Section>
      ))}
      {!query && list.length >= limit ? <Button title="Show more" variant="secondary" onPress={() => setLimit(limit + 100)} /> : null}
    </Screen>
  );
}
