import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import { addLink, changeLinkWord, linkInfo, removeLink, setLinkDates, type LinkRef } from '@core/links';
import { SYMMETRIC_EDGES } from '@core/graph/edges';
import { Button, DateField, FilterChip, Sheet, SwitchField, Text, TextField, useToast } from '../kit';
import { useLive, useOS } from '../hooks';
import { useTheme } from '../theme/ThemeProvider';
import { monoFonts } from '../theme/tokens';
import { LinkDisc } from './LinkMap';

const MONO = monoFonts[700];

/** The words offered when you link by hand or change a link's word (the L5 artboard), with the stored word each makes. */
export const HAND_WORDS: Array<[label: string, kind: string]> = [
  ['knows', 'knows'],
  ['family of', 'family_of'],
  ['works with', 'works_with'],
  ['with', 'with'],
  ['at', 'at'],
  ['part of', 'part_of'],
  ['owns', 'owns'],
  ['paid for', 'paid_for'],
  ['about', 'about'],
];

const month = (t: number) => new Date(t).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
const when = (t: number) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function Caps({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontFamily: MONO, fontSize: 9, lineHeight: 12, letterSpacing: 0.5, color: t.c.fg.tertiary, textTransform: 'uppercase' }}>{children}</Text>;
}

/** Two records and the word between them, as on the L3 and L5 artboards. */
type End = { id: string; object: string; title: string; module: string | null; photo?: string | null; icon?: string };
function Pair({ a, b, word, guessed }: { a: End; b: End | null; word: string; guessed?: boolean }) {
  const t = useTheme();
  const end = (r: NonNullable<typeof b>) => (
    <View style={{ alignItems: 'center', gap: 6, width: 100 }}>
      <LinkDisc node={{ id: r.id, type: r.object, title: r.title, module: r.module, photo: r.photo, icon: r.icon }} size={48} ring />
      <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: t.c.fg.primary }}>{r.title}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 }}>
      {end(a)}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ height: 1, alignSelf: 'stretch', backgroundColor: 'rgba(245,245,247,0.22)', position: 'absolute', top: 10 }} />
        <View style={{ height: 22, paddingHorizontal: 9, borderRadius: 999, backgroundColor: t.c.bg.ground, borderWidth: 1, borderStyle: guessed ? 'dashed' : 'solid', borderColor: 'rgba(245,245,247,0.22)', justifyContent: 'center' }}>
          <Text style={{ fontFamily: MONO, fontSize: 9, lineHeight: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: t.c.fg.secondary }}>{guessed ? `${word}?` : word}</Text>
        </View>
      </View>
      {b ? end(b) : <View style={{ width: 100 }} />}
    </View>
  );
}

const refOf = (os: ReturnType<typeof useOS>, id: string) => {
  const r = os.records.get(id);
  if (!r) return null;
  const def = os.registry.objects.get(r.object);
  return { id: r.id, object: r.object, title: r.title, module: def?.module ?? null, icon: def?.icon, photo: r.object === 'person' ? ((r.data as { photo?: { uri?: string } }).photo?.uri ?? null) : null };
};

/** What a tapped link shows: from the record you are on to the other end, by its word. */
export interface HeldLink {
  fromId: string;
  otherId: string;
  word: string;
  guessed: boolean;
  ref: LinkRef | null;
  via: { id: string; type: string; title: string } | null;
}

/**
 * A link, tapped (the L3 artboard): the two records and the word, since when,
 * where it came from (the dump's sentence while the dump is kept, a message,
 * the agent, a Field, you), how sure it is (Right, when only guessed), its
 * word to change (not for a Field's link), Open the other end, Remove this
 * link with Undo. A link through a meeting (Priya in a game) opens that
 * record instead of being removed here.
 */
export function LinkDetailSheet({ held, onClose }: { held: HeldLink | null; onClose: () => void }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const info = useLive((o) => (held?.ref?.linkId ? linkInfo(o, held.ref.linkId) : null), [held?.ref?.linkId]);
  const [dating, setDating] = useState(false);
  const [since, setSince] = useState<string | number | undefined>(undefined);
  const [until, setUntil] = useState<string | number | undefined>(undefined);
  const ms = (v: string | number | undefined) => (v == null || v === '' ? null : typeof v === 'number' ? v : Number.isFinite(Date.parse(String(v))) ? Date.parse(String(v)) : null);
  const a = held ? refOf(os, held.fromId) : null;
  const b = held ? refOf(os, held.otherId) : null;
  if (!held || !a || !b) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const open = (type: string, id: string) => (onClose(), router.push(`/entity/${type}/${id}` as never));
  const word = info ? (HAND_WORDS.find(([, k]) => k === info.kind)?.[0] ?? held.word) : held.word;
  const sure = info ? info.confidence : held.guessed ? 0.6 : 1;
  return (
    <Sheet
      visible
      onClose={onClose}
      title="A link"
      footer={
        <View style={{ gap: 8 }}>
          <Button title={`Open ${b.title}`} icon="arrow-right" block onPress={() => open(b.object, b.id)} />
          {held.via ? <Button title={`Open the ${(os.registry.objects.get(held.via.type)?.label ?? 'record').toLowerCase()}`} icon="file" variant="secondary" block onPress={() => open(held.via!.type, held.via!.id)} /> : null}
          {held.ref ? (
            <Button
              title="Remove this link"
              icon="trash"
              variant="ghost"
              block
              onPress={() => {
                const undo = removeLink(os, held.ref!);
                onClose();
                toast.show({ message: `Removed the link to ${b.title}. The records stay.`, icon: 'link', undo });
              }}
            />
          ) : null}
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <Text variant="caption" color="secondary">
          {a.title} → {b.title}
        </Text>
        <Pair a={a} b={b} word={held.word} guessed={sure < 1} />
        {held.via ? (
          <View style={{ gap: 4 }}>
            <Caps>Through</Caps>
            <Text variant="body">{held.via.title}</Text>
            <Text variant="caption" color="secondary">One record joins them up, so it is changed or removed there.</Text>
          </View>
        ) : null}
        {info ? (
          <>
            <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-end' }}>
              <View style={{ gap: 4 }}>
                <Caps>Since</Caps>
                <Text variant="body">{month(info.since ?? info.createdAt)}</Text>
              </View>
              <View style={{ gap: 4, flex: 1 }}>
                <Caps>{info.until ? 'Until' : 'Now'}</Caps>
                <Text variant="body">{info.until ? month(info.until) : 'still true'}</Text>
              </View>
              <Button
                title={dating ? 'Cancel' : 'Set dates'}
                size="sm"
                variant="secondary"
                onPress={() => {
                  setSince(info.since ?? undefined);
                  setUntil(info.until ?? undefined);
                  setDating(!dating);
                }}
              />
            </View>
            {dating ? (
              <View style={{ gap: 10 }}>
                <DateField label="Since" value={since} onChange={setSince} quick={false} />
                <DateField label="Until" hint="leave empty while it is still true" value={until} onChange={setUntil} quick={false} />
                <Button
                  title="Save dates"
                  icon="check"
                  size="sm"
                  onPress={() => {
                    const undo = setLinkDates(os, info.id, ms(since), ms(until));
                    setDating(false);
                    toast.show({ message: 'Dates saved', icon: 'calendar', undo });
                  }}
                />
              </View>
            ) : null}
            <View style={{ gap: 6 }}>
              <Caps>Where it came from</Caps>
              <Text variant="body" style={{ fontWeight: '700' }}>{info.origin.line}</Text>
              <Text variant="caption" color="secondary">{when(info.origin.at)}</Text>
              {info.origin.quote ? (
                <View style={{ padding: 12, borderRadius: 16, backgroundColor: t.c.bg.tileRaised }}>
                  <Text variant="body" style={{ fontStyle: 'italic' }}>“{info.origin.quote}”</Text>
                </View>
              ) : info.origin.by === 'dump' ? (
                <Text variant="caption" color="tertiary">The dump itself is cleared after 15 days; the link stays.</Text>
              ) : null}
            </View>
            <View style={{ gap: 6 }}>
              <Caps>Confidence</Caps>
              <Text style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', color: sure < 0.7 ? t.c.alert.coralText : t.c.fg.primary }}>{Math.round(sure * 100)}%</Text>
              <Text variant="caption" color="secondary">Under 70% a link is drawn dashed with a “?” and waits in To check.</Text>
              {sure < 1 ? <Button title="Right" icon="check" size="sm" variant="secondary" onPress={() => os.links.setConfidence(info.id, 1)} /> : null}
            </View>
            <View style={{ gap: 8 }}>
              <Caps>Link word</Caps>
              {info.field ? (
                <Text variant="caption" color="secondary">Set by the {info.field} field: change it on the record.</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[[word, info.kind] as [string, string], ...HAND_WORDS.filter(([, k]) => k !== info.kind)].map(([label, kind]) => (
                    <FilterChip
                      key={kind}
                      label={label}
                      selected={kind === info.kind}
                      onPress={() => {
                        if (kind === info.kind) return;
                        const undo = changeLinkWord(os, info.id, kind);
                        onClose();
                        toast.show({ message: `Now “${label}”`, icon: 'link', undo });
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

/**
 * Add a link by hand (the L5 artboard): find the record (or start a new one,
 * linked once it is saved), pick the word (this record's own link Fields,
 * which fill the Field, then the everyday words or your own), since when if
 * you know, and Link. Saved as yours, so it never lands in To check.
 */
export function AddLinkSheet({ visible, onClose, entity }: { visible: boolean; onClose: () => void; entity: ObjectRecord }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [kind, setKind] = useState<string>('knows');
  const [own, setOwn] = useState<string | null>(null);
  const [since, setSince] = useState<string | number | undefined>(undefined);
  const [making, setMaking] = useState(false);
  const [both, setBoth] = useState(false);
  const def = os.registry.object(entity.object);
  const first = entity.title.trim().split(/\s+/)[0] ?? entity.title;
  const hits = useLive(
    (o) => {
      // Not a face or a meeting of something (a Player profile, a Venue, an Appearance): link the thing itself.
      const skip = (object: string) => object === 'fact' || object === 'dump' || !!o.registry.objects.get(object)?.hidden || !!o.registry.objects.get(object)?.linkRole;
      const list = q.trim() ? o.records.search.search(q.trim(), { limit: 12 }).map((h) => ({ id: h.id, object: h.object, title: h.title })) : o.records.recent(8).map((r) => ({ id: r.id, object: r.object, title: r.title }));
      return list.filter((h) => h.id !== entity.id && !skip(h.object)).slice(0, 6);
    },
    [q, entity.id],
  );
  const target = picked ? refOf(os, picked) : null;
  const fits = (to: unknown, object: string) => to === undefined || to === 'any' || (Array.isArray(to) ? to.includes(object) : to === object);
  const fieldWords = def.fields.filter((f) => f.type === 'link' && f.linkWord && (!target || fits(f.linkTo, target.object))).map((f) => [f.label.toLowerCase(), f.linkWord!] as [string, string]);
  const words = [...new Map([...fieldWords, ...HAND_WORDS].map(([l, k]) => [k, l])).entries()];
  const finalKind = (own ?? '').trim() || kind;
  const label = (own ?? '').trim() || words.find(([k]) => k === kind)?.[1] || kind;
  const reset = () => (setQ(''), setPicked(null), setKind('knows'), setOwn(null), setSince(undefined), setMaking(false), setBoth(false));
  // Both ways: a word no Field makes and core doesn't already keep for both (knows, family of), read from the other record too.
  const canBoth = !own?.trim() ? !fieldWords.some(([, k]) => k === kind) && !SYMMETRIC_EDGES.has(kind) : true;
  const close = () => (reset(), onClose());
  const creatable = [...os.registry.objects.values()].filter((d) => !d.hidden && ['person', 'place', 'org', 'event', 'task', 'note'].includes(d.id));
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="New link"
      footer={
        <View style={{ gap: 8 }}>
          <Button
            title="Link"
            icon="link"
            block
            disabled={!picked}
            onPress={() => {
              const at = since == null ? null : typeof since === 'number' ? since : Date.parse(String(since));
              const undo = addLink(os, entity.id, picked!, finalKind, 'user', Number.isFinite(at as number) ? (at as number) : null, both && canBoth);
              const name = target?.title ?? 'it';
              close();
              toast.show({ message: `Linked to ${name} as ${label}`, icon: 'link', undo });
            }}
          />
          <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>Saved as yours (source: manual), so it never lands in To check.</Text>
        </View>
      }
    >
      <View style={{ gap: 14 }}>
        <Text variant="caption" color="secondary">from {entity.title}</Text>
        <TextField label={`Link ${first} to`} value={q} onChange={(v) => (setQ(v), setPicked(null))} leading="search" placeholder="A person, place, payment…" autoFocus />
        <View style={{ gap: 6 }}>
          {hits.map((h) => {
            const r = refOf(os, h.id)!;
            const on = picked === h.id;
            return (
              <Pressable key={h.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setPicked(on ? null : h.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 10, borderRadius: 18, backgroundColor: on ? t.c.bg.tileRaised : pressed ? t.c.bg.pressed : 'transparent' })}>
                <LinkDisc node={{ id: r.id, type: r.object, title: r.title, module: r.module, photo: r.photo, icon: os.registry.objects.get(r.object)?.icon }} size={36} ring />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 19, fontWeight: '700', color: t.c.fg.primary }}>{h.title}</Text>
                  <Text numberOfLines={1} variant="caption" color="secondary">{os.registry.objects.get(h.object)?.label ?? h.object}</Text>
                </View>
                {on ? <Text style={{ fontSize: 12, fontWeight: '700', color: t.c.accent.mustard }}>picked</Text> : null}
              </Pressable>
            );
          })}
          {q.trim() ? (
            <Pressable accessibilityRole="button" onPress={() => setMaking(!making)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 10, borderRadius: 18, backgroundColor: pressed ? t.c.bg.pressed : 'transparent' })}>
              <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.fg.tertiary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, lineHeight: 20, color: t.c.fg.secondary }}>+</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 19, fontWeight: '700', color: t.c.fg.primary }}>New record “{q.trim()}”</Text>
                <Text variant="caption" color="secondary">{creatable.map((d) => d.label).slice(0, 3).join(', ')}…</Text>
              </View>
            </Pressable>
          ) : null}
          {making ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {creatable.map((d) => (
                <FilterChip
                  key={d.id}
                  label={d.label}
                  icon={d.icon}
                  selected={false}
                  onPress={() => {
                    const title = q.trim();
                    close();
                    router.push(`/entity/${d.id}/new?title=${encodeURIComponent(title)}&linkId=${entity.id}&linkKind=${encodeURIComponent(finalKind)}` as never);
                  }}
                />
              ))}
            </View>
          ) : null}
        </View>
        <View style={{ gap: 8 }}>
          <Caps>Link word</Caps>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {words.map(([k, l]) => (
              <FilterChip key={k} label={l} selected={own == null && kind === k} onPress={() => (setKind(k), setOwn(null))} />
            ))}
            <FilterChip label="+ new word" selected={own != null} onPress={() => setOwn(own == null ? '' : null)} />
          </View>
          {own != null ? <TextField label="Your word" value={own} onChange={setOwn} placeholder="gift for, landlord of" autoCapitalize="none" /> : null}
        </View>
        {target ? <Pair a={refOf(os, entity.id)!} b={target} word={label} /> : null}
        <DateField label="Since" hint="optional" value={since} onChange={setSince} quick={false} />
        {canBoth ? <SwitchField label="Both ways?" hint={target ? `${target.title} ${label} ${entity.title} too` : 'The same word from the other record too'} value={both} onChange={setBoth} /> : null}
      </View>
    </Sheet>
  );
}
