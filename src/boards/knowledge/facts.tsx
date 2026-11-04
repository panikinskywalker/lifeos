import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Fact } from '@core/repo/factRepo';
import type { LifeOSContext } from '@core/registry/context';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ActionSheet, Button, Chip, EmptyState, Icon, Screen, Sheet, Text, TextField, useToast } from '@ui/kit';
import { EntityPicker } from '@ui/components/fields';
import { factGroups, searchBrain } from '@modules/knowledge';
import { FactRow, JOURNAL_COLOR, RoundButton, RowCard, SearchBox, SectionHead, TopBar } from './parts';
import { aboutOf, factGuesses, photoOf } from './read';

/**
 * Facts, Journal's other half (replaces Memory; no artboard of its own, so
 * drawn from NR-Journal-Home's Facts rows): every fact by what it is about,
 * with add, forget (Undo) and *About…* to put one on a record; then What you
 * call things, the names Talk learned.
 */

/** The menu for a fact, and forget with Undo. */
export function useFactMenu(ctx: LifeOSContext) {
  const router = useRouter();
  const toast = useToast();
  const [active, setActive] = useState<Fact | null>(null);
  const [moving, setMoving] = useState<Fact | null>(null);
  const forget = (f: Fact) => {
    ctx.facts.forget(f.id);
    toast.show({ message: 'Forgotten', icon: 'trash', undo: () => ctx.facts.restore(f.id) });
  };
  const subject = active?.subjectId ? ctx.records.get(active.subjectId) : null;
  const sheets = (
    <>
      <ActionSheet
        visible={!!active}
        onClose={() => setActive(null)}
        title={active?.text.replace(/\[\[|\]\]/g, '')}
        actions={
          active
            ? [
                ...(subject ? [{ label: `Open ${subject.title}`, icon: 'chevron-right' as const, onPress: () => router.push(`/entity/${subject.object}/${subject.id}` as never) }] : []),
                { label: subject ? 'About something else…' : 'About a record…', icon: 'link' as const, onPress: () => setMoving(active) },
                { label: 'Forget this', icon: 'trash' as const, destructive: true, onPress: () => forget(active) },
              ]
            : []
        }
      />
      <EntityPicker
        visible={!!moving}
        onClose={() => setMoving(null)}
        types={[]}
        title="About"
        onSelect={(id) => {
          if (!moving) return;
          const was = { subjectId: moving.subjectId, subjectKey: moving.subjectKey };
          ctx.facts.setSubject(moving.id, { subjectId: id, subjectKey: moving.subjectKey });
          toast.show({ message: `About ${ctx.records.get(id)?.title ?? 'it'} now`, icon: 'check', undo: () => ctx.facts.setSubject(moving.id, was) });
          setMoving(null);
        }}
      />
    </>
  );
  return { open: setActive, forget, sheets };
}

/** One fact with what it's about worked out: the row Home and Facts share. */
export function FactLine({ fact, ctx, guesses, menu }: { fact: Fact; ctx: LifeOSContext; guesses: Map<string, string>; menu: Pick<ReturnType<typeof useFactMenu>, 'open' | 'forget'> }) {
  const about = aboutOf(ctx, fact);
  const source = fact.source === 'note' && fact.sourceRef ? ctx.records.get(fact.sourceRef) : null;
  return <FactRow fact={fact} about={about.title} record={about.record} photo={about.record ? photoOf(ctx, about.record.id) : null} fromNote={source?.title} guess={guesses.has(fact.id)} onPress={() => menu.open(fact)} onForget={() => menu.forget(fact)} />;
}

/** /board/knowledge/facts (and /memory): every fact, searchable, by what it is about. */
export function FactsScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const toast = useToast();
  const [q, setQ] = useState(params.q ?? '');
  const [adding, setAdding] = useState(false);
  const facts = useLive((os) => (q.trim() ? searchBrain(os, q).facts : os.facts.list({ limit: 5000 })), [q]);
  const total = useLive((os) => os.facts.list({ limit: 100000 }).length, []);
  const aliases = useLive((os) => os.aliases.all(), []);
  const guesses = useLive((os) => factGuesses(os), []);
  const menu = useFactMenu(ctx);
  const groups = factGroups(ctx, facts);
  return (
    <Screen contentStyle={{ gap: 22 }}>
      <TopBar caption={`${total} ${total === 1 ? 'fact' : 'facts'} · one line each`} title="Facts" onBack={() => (router.canGoBack() ? router.back() : router.replace('/board/knowledge' as never))} right={<RoundButton icon="plus" label="Remember something" lime onPress={() => setAdding(true)} />} />
      {!total && !aliases.length ? (
        <EmptyState icon="sparkle" tint="memory" title="Nothing remembered yet" line="Tell LifeOS things worth keeping: “Dad hates surprises”, “the landlord is Suresh, rent on the 5th”. They live here and on the record they're about." action="Add one yourself" onAction={() => setAdding(true)} />
      ) : (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="Words, people or places" />
          {q.trim() && !facts.length ? <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary, paddingHorizontal: 4 }}>{`No fact says “${q.trim()}”.`}</Text> : null}
          {groups.map((g) => (
            <View key={g.key} style={{ gap: 10 }}>
              <SectionHead title={g.title} sub={`${g.facts.length} ${g.facts.length === 1 ? 'fact' : 'facts'}`} action={g.record ? 'Open' : undefined} onAction={g.record ? () => router.push(`/entity/${g.record!.object}/${g.record!.id}` as never) : undefined} />
              <RowCard>
                {g.facts.map((f) => (
                  <FactLine key={f.id} fact={f} ctx={ctx} guesses={guesses} menu={menu} />
                ))}
              </RowCard>
            </View>
          ))}
          {aliases.length && !q.trim() ? (
            <View style={{ gap: 10 }}>
              <SectionHead title="What you call things" sub="Names learned in Talk. Hold one to forget it." />
              <RowCard>
                {aliases.map((a) => {
                  const r = ctx.records.get(a.entityId);
                  return (
                    <Pressable
                      key={a.id}
                      accessibilityRole="button"
                      accessibilityHint="Hold to forget it"
                      onPress={r ? () => router.push(`/entity/${r.object}/${r.id}` as never) : undefined}
                      onLongPress={() => {
                        ctx.aliases.forget(a.id);
                        toast.show({ message: `Forgot “${a.alias}”`, icon: 'trash', undo: () => void ctx.aliases.learn(a.alias, a.entityId) });
                      }}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.7 : 1 })}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="tag" size={18} color={JOURNAL_COLOR} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{`“${a.alias}”`}</Text>
                        {r ? <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{`means ${r.title}`}</Text> : null}
                      </View>
                      {a.uses > 1 ? <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary }}>{`${a.uses}×`}</Text> : null}
                    </Pressable>
                  );
                })}
              </RowCard>
            </View>
          ) : null}
        </>
      )}
      <AddFactSheet visible={adding} onClose={() => setAdding(false)} />
      {menu.sheets}
    </Screen>
  );
}

function AddFactSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const os = useOS();
  const toast = useToast();
  const [text, setText] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const save = () => {
    const f = os.facts.add({ text, subjectId: subject, source: 'user' });
    setText('');
    setSubject(null);
    onClose();
    toast.show({ message: 'Remembered', icon: 'sparkle', undo: () => os.facts.forget(f.id) });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Remember something" footer={<Button title="Remember" icon="check" block disabled={text.trim().length < 3} onPress={save} />}>
      <TextField label="What" value={text} onChange={setText} placeholder="Dad hates surprises" multiline />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {subject ? <Chip label={`About ${os.records.get(subject)?.title ?? ''}`} icon="x" onPress={() => setSubject(null)} /> : <Chip label="About a person or thing" icon="plus" onPress={() => setPicking(true)} />}
      </View>
      <EntityPicker visible={picking} onClose={() => setPicking(false)} types={[]} title="About" onSelect={(id) => setSubject(id)} />
    </Sheet>
  );
}
