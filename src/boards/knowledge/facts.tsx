import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Fact } from '@core/repo/factRepo';
import type { LifeOSContext } from '@core/registry/context';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ActionSheet, Button, Chip, EmptyState, IconButton, RowItem, RowList, Section, Sheet, Text, TextField, useToast } from '@ui/kit';
import { EntityPicker } from '@ui/components/fields';
import { factGroups } from '@modules/knowledge';

/**
 * The Facts half of the Second Brain (R7f; replaces Memory): every fact by
 * what it is about, with add, forget (Undo) and *About…* to put one on a
 * record; then What you call things, the names Talk learned.
 */

const SOURCE: Record<Fact['source'], string> = { talk: 'from Talk', notification: 'from a notification', note: 'from a note', correction: 'a correction', user: 'added by you', dump: 'from a dump', automation: 'from an automation', notion: 'from Notion' };

export function when(ctx: LifeOSContext, at: number): string {
  return Date.now() - at < 60_000 ? 'just now' : ctx.format.date(at, 'relative');
}

/** One fact as a card row: the line, when and where from, and its menu. */
export function FactRow({ fact, ctx, about, onMenu }: { fact: Fact; ctx: LifeOSContext; about?: string | null; onMenu: (f: Fact) => void }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.card, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 8, backgroundColor: t.tints.memory.ink }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="body" selectable>
          {fact.text.replace(/\[\[|\]\]/g, '')}
        </Text>
        <Text variant="caption" color="secondary">
          {[about ? `about ${about}` : null, when(ctx, fact.statedAt), SOURCE[fact.source]].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <IconButton icon="more" accessibilityLabel={`Options for: ${fact.text}`} size={32} onPress={() => onMenu(fact)} />
    </View>
  );
}

/** The menu for a fact: open what it's about, put it on a record, forget. */
export function useFactMenu(ctx: LifeOSContext) {
  const router = useRouter();
  const toast = useToast();
  const [active, setActive] = useState<Fact | null>(null);
  const [moving, setMoving] = useState<Fact | null>(null);
  const [editing, setEditing] = useState<Fact | null>(null);
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
                { label: 'Edit', icon: 'edit' as const, onPress: () => setEditing(active) },
                { label: subject ? 'About something else…' : 'About a record…', icon: 'link' as const, onPress: () => setMoving(active) },
                { label: 'Forget this', icon: 'trash' as const, destructive: true, onPress: () => forget(active) },
              ]
            : []
        }
      />
      <EditFactSheet fact={editing} onClose={() => setEditing(null)} />
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
  return { open: setActive, sheets };
}

export function FactsList({ ctx, onAdd }: { ctx: LifeOSContext; onAdd: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const facts = useLive((os) => os.facts.list({ limit: 5000 }), []);
  const aliases = useLive((os) => os.aliases.all(), []);
  const groups = factGroups(ctx, facts);
  const menu = useFactMenu(ctx);
  if (!facts.length && !aliases.length) {
    return <EmptyState icon="sparkle" tint="memory" title="Nothing remembered yet" line="Tell LifeOS things worth keeping: “Dad hates surprises”, “the landlord is Suresh, rent on the 5th”. They live here and on the record they're about." action="Add one yourself" onAction={onAdd} />;
  }
  return (
    <View style={{ gap: 20 }}>
      {groups.map((g) => (
        <Section key={g.key} title={g.title} meta={String(g.facts.length)} action={g.record ? 'Open' : undefined} onAction={g.record ? () => router.push(`/entity/${g.record!.object}/${g.record!.id}` as never) : undefined}>
          <View style={{ gap: 8 }}>
            {g.facts.map((f) => (
              <FactRow key={f.id} fact={f} ctx={ctx} onMenu={menu.open} />
            ))}
          </View>
        </Section>
      ))}
      {aliases.length ? (
        <Section title="What you call things" meta={String(aliases.length)}>
          <Text variant="caption" color="tertiary" style={{ paddingHorizontal: 4 }}>
            Names learned in Talk. Hold one to forget it.
          </Text>
          <RowList>
            {aliases.map((a) => {
              const r = ctx.records.get(a.entityId);
              return (
                <RowItem
                  key={a.id}
                  icon="tag"
                  tint="memory"
                  title={`“${a.alias}”`}
                  subtitle={r ? `means ${r.title}` : null}
                  value={a.uses > 1 ? `${a.uses}×` : null}
                  valueTone="secondary"
                  onPress={r ? () => router.push(`/entity/${r.object}/${r.id}` as never) : undefined}
                  onLongPress={() => {
                    ctx.aliases.forget(a.id);
                    toast.show({ message: `Forgot “${a.alias}”`, icon: 'trash', undo: () => void ctx.aliases.learn(a.alias, a.entityId) });
                  }}
                />
              );
            })}
          </RowList>
        </Section>
      ) : null}
      {menu.sheets}
    </View>
  );
}

/** Change a fact's words (any fact; one from Notion goes back to its bullet on the next sync). */
export function EditFactSheet({ fact, onClose }: { fact: Fact | null; onClose: () => void }) {
  const os = useOS();
  const toast = useToast();
  const [text, setText] = useState('');
  const [for_, setFor] = useState<string | null>(null);
  if (fact && for_ !== fact.id) {
    setFor(fact.id);
    setText(fact.text);
  }
  const save = () => {
    if (!fact) return;
    const was = fact.text;
    os.facts.edit(fact.id, text);
    onClose();
    toast.show({ message: fact.source === 'notion' ? 'Changed here and in Notion' : 'Changed', icon: 'check', undo: () => void os.facts.edit(fact.id, was) });
  };
  return (
    <Sheet visible={!!fact} onClose={onClose} title="Edit fact" footer={<Button title="Save" icon="check" block disabled={text.trim().length < 3 || text.trim() === fact?.text} onPress={save} />}>
      <TextField label="What" value={text} onChange={setText} multiline />
      {fact?.source === 'notion' ? (
        <Text variant="caption" color="tertiary">
          From Notion: the bullet there changes too on the next sync.
        </Text>
      ) : null}
    </Sheet>
  );
}

export function AddFactSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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
